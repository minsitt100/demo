// One-URL diagnostic. Runs the whole extraction pipeline against a single
// article URL and prints every step: fetch status, HTML length, LLM raw
// response, parsed restaurants. Use this to figure out why extraction is
// returning 0 hits for everything.
//
//   node scripts/debug-extract.js "<url>"
//   EXTRACTOR=llm node scripts/debug-extract.js "<url>"
//   DEBUG_EXTRACT=1 node scripts/debug-extract.js "<url>"

import { extractRestaurants } from "../sources/extract.js";
import { stripHtml } from "../sources/util.js";

const url = process.argv[2];
if (!url) {
  console.error("usage: node scripts/debug-extract.js <url>");
  process.exit(1);
}

const useLLM =
  process.env.EXTRACTOR === "llm" && !!process.env.ANTHROPIC_API_KEY;

console.log(`\n=== ${url} ===`);
console.log(`mode: ${useLLM ? "llm" : "regex"}`);
console.log(`ANTHROPIC_API_KEY set: ${!!process.env.ANTHROPIC_API_KEY}`);
console.log(`EXTRACTOR: ${process.env.EXTRACTOR || "(unset)"}\n`);

// 1) Fetch
console.log("--- fetching...");
let html = "";
try {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/122.0 Safari/537.36 chicago-eats/0.1",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  console.log(`    HTTP ${res.status} ${res.statusText}`);
  console.log(`    final URL: ${res.url}`);
  console.log(`    content-type: ${res.headers.get("content-type")}`);
  if (!res.ok) {
    console.log("    → fetch failed; extraction can't run");
    process.exit(0);
  }
  html = await res.text();
  console.log(`    got ${html.length} chars of HTML`);
  const textLen = stripHtml(html).length;
  console.log(`    ${textLen} chars after stripping tags`);
  if (textLen < 200) {
    console.log("    → very little visible text; likely a JS-heavy or bot-blocked page");
  }
} catch (err) {
  console.log(`    fetch threw: ${err.message}`);
  process.exit(0);
}

// 2) Extract
if (useLLM) {
  console.log("\n--- calling Claude API...");
  try {
    const { extractRestaurantsLLM } = await import("../sources/extract-llm.js");
    const started = Date.now();
    const result = await extractRestaurantsLLM(html, "");
    console.log(`    call took ${Date.now() - started}ms`);
    console.log(`    parsed: ${result.length} restaurant(s)`);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.log(`    LLM call threw: ${err.message}`);
    console.log(err.stack);
  }
} else {
  console.log("\n--- running regex extractor...");
  const result = extractRestaurants(html);
  console.log(`    parsed: ${result.length} restaurant(s)`);
  console.log(JSON.stringify(result, null, 2));
}

process.exit(0);
