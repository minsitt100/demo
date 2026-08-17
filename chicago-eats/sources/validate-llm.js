// LLM-powered restaurant name validator. Replaces (or complements) the
// regex-based looksLikeArticleTitle filter in server.js — the LLM catches
// edge cases regex misses ("THE SPOTS", "Top 25:", "Tavares Harrington,
// Mount Carmel") without having to enumerate every pattern.
//
// Called lazily by the aggregator with an in-memory cache. First aggregation
// for a fresh DB pays one API call per unique name (~0.02¢ each on Haiku);
// subsequent aggregations pay $0. Cache persists for the server's lifetime.
//
// Opt-in via env var — the aggregator only calls this when VALIDATOR=llm is
// set alongside ANTHROPIC_API_KEY. Otherwise it falls back to the regex
// filter as usual.
//
// Failure mode: fails OPEN. If the API call errors, we return valid=true
// so real restaurants don't get lost to a transient API issue. False
// positives (garbage that leaks through) are easier to correct (hide
// button) than false negatives (real restaurants filtered silently).

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.VALIDATOR_MODEL || "claude-haiku-4-5";

// In-memory cache keyed by lowercased name. Value: {valid, reason}.
const cache = new Map();
let hits = 0;
let misses = 0;
let failures = 0;

let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    valid: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["valid", "reason"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are validating candidate restaurant names extracted from Chicago food news articles.

For each name, decide whether it is a plausible real Chicago restaurant, cafe, bar, or bakery — the kind of place that could realistically have a menu, a storefront, and a Yelp page.

REJECT (valid: false) if the name is:
- A section header from an article ("THE SPOTS", "Our Top Picks", "The Best", "REFERENCED IN")
- An article title or fragment ("Top 25: The Best Restaurants In Chicago", "Inside NAIA's chic", "A luxury steakhouse is")
- A generic phrase or placeholder ("New Restaurant", "Midwestern restaurant", "A new pizzeria")
- A person's name with a school or team ("Tavares Harrington, Mount Carmel", "David Hill, Homewood-Flossmoor")
- A neighborhood or city ("Wicker Park", "Chicago", "River North")
- A publication or media brand ("Eater", "The Infatuation", "Block Club")
- A common English phrase ("The Best", "Coming Soon")

ACCEPT (valid: true) if the name looks like a real proper-noun business name — even if you don't personally recognize the restaurant. Chicago has thousands of independent restaurants; err on the side of accepting a plausible-sounding name.

Return a one-word or short-phrase reason (e.g. "article_title", "section_header", "plausible", "generic_placeholder").`;

// Validate a single restaurant name. Returns {valid, reason} — cached so
// each unique name pays at most one API call across the server's lifetime.
export async function validateRestaurantName(name, context = {}) {
  if (!name) return { valid: false, reason: "empty" };
  const key = name.toLowerCase().trim();
  if (cache.has(key)) {
    hits++;
    return cache.get(key);
  }
  misses++;

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 150,
      system: [{
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      }],
      output_config: {
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      messages: [{
        role: "user",
        content: `Name: "${name}"\nContext: extracted from article titled "${context.articleTitle || "(unknown)"}"\n\nIs this a real Chicago restaurant name?`,
      }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    const parsed = textBlock ? JSON.parse(textBlock.text) : { valid: true, reason: "no-response" };
    cache.set(key, parsed);
    return parsed;
  } catch (err) {
    failures++;
    console.warn(`[validate-llm] "${name}" failed: ${err.message} — falling open`);
    // Fail open: accept the name so real data isn't lost to a transient error.
    const fallback = { valid: true, reason: "validator_error" };
    return fallback;
  }
}

// Validate a batch of names concurrently. Small concurrency so we don't
// blow past rate limits or hammer the API when the cache is cold.
export async function validateBatch(names, contexts = {}, { concurrency = 4 } = {}) {
  const queue = [...names];
  const results = new Map();
  async function worker() {
    while (queue.length) {
      const name = queue.shift();
      const ctx = contexts[name] || {};
      results.set(name, await validateRestaurantName(name, ctx));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// Synchronous cache-only lookup. Returns null on a miss so callers can
// distinguish "not yet validated" from "validated and invalid."
export function validateFromCache(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  return cache.has(key) ? cache.get(key) : null;
}

// Fire-and-forget background validation. Runs on the next event loop tick
// and populates the cache; the current request path never awaits it.
// De-duplicates: names already cached or currently in-flight are skipped.
const inFlight = new Set();
export function queueForValidation(names, contexts = {}) {
  const todo = names.filter((n) => {
    if (!n) return false;
    const k = n.toLowerCase().trim();
    if (cache.has(k) || inFlight.has(k)) return false;
    inFlight.add(k);
    return true;
  });
  if (!todo.length) return;
  setImmediate(async () => {
    try {
      await validateBatch(todo, contexts, { concurrency: 3 });
    } finally {
      for (const n of todo) inFlight.delete(n.toLowerCase().trim());
    }
  });
}

export function validatorStats() {
  return { cacheSize: cache.size, hits, misses, failures, model: MODEL };
}

export function clearValidatorCache() {
  cache.clear();
  hits = 0;
  misses = 0;
  failures = 0;
}
