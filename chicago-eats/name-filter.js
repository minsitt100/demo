// Ghost-name filter. Rejects candidate restaurant names that are actually
// article-title fragments, section headers, generic descriptors, or other
// headline debris that leaked out of an extractor. Shared by the aggregator
// (server.js) and the photo backfill script so we don't waste Google Places
// calls on names the UI would filter out anyway.
//
// This is the regex layer. When VALIDATOR=llm is on, names that survive
// this filter get a second-pass LLM check (validate-llm.js) that catches
// edge cases regex misses. Cheap and fast — no I/O, no allocations.

export function looksLikeArticleTitle(name) {
  if (!name) return false;
  const t = name.trim();

  // Real restaurant names are short. Anything long is a headline fragment.
  if (t.length > 40) return true;

  // Starts with a digit → "10 Best…"
  if (/^\d/.test(t)) return true;

  // Verb phrases that only appear inside sentences, not restaurant names
  if (/\s(opens?|opening|debuts?|coming to|now open)\s/i.test(t)) return true;
  if (/\bnew\s+(restaurants?|spots?|openings?|places?)/i.test(t)) return true;

  // Common headline openers
  if (/^(where|how|why|the best|best|these|inside|meet|this|watch)\s/i.test(t)) return true;
  if (/^(top|our)\s+\d/i.test(t)) return true;
  if (/^(a|an)\s+[a-z]/.test(t)) return true;

  // Headline-descriptor giveaways
  if (/\b(chic|luxury|hot new|buzzy|trendy)\b/i.test(t)) return true;
  if (/\b(highest-rated|top-rated|must-try|best of|hit list)\b/i.test(t)) return true;

  // Truncated at the end mid-sentence
  if (/\bis\s*$/i.test(t)) return true;

  // Title punctuation — colon / em-dash / two+ commas → list-comma structure
  if (/[:—–]/.test(t)) return true;
  if ((t.match(/,/g) || []).length >= 2) return true;

  // ALL-CAPS multi-word strings are almost always section headers
  if (t === t.toUpperCase() && /\s/.test(t)) return true;

  // Generic section labels regardless of case
  if (/^the\s+(spots?|picks?|list|best|winners?|highlights?|contenders?|newcomers?)$/i.test(t)) return true;

  // "First Last, Location" — person + school/city caption
  if (/^[A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+,\s+[A-Z]/.test(t)) return true;

  // ---- Tightened patterns, added after ghosts leaked into the feed ----

  // Descriptor-phrase prefixes: "Michelin-starred X", "Acclaimed Y", etc.
  // Real restaurants don't lead with critical adjectives; headlines do.
  if (/^(michelin-starred|award-winning|acclaimed|beloved|iconic|celebrated|renowned|popular|famous|historic|legendary)\s/i.test(t)) return true;

  // "Chicago-style X", "Chicago-based Y", "Chicago's Z" — descriptor + noun,
  // not a business name
  if (/^(chicago-style|chicago[- ]based|chicago's)\s/i.test(t)) return true;

  // "Chicago X spot/staple/classic" — descriptor phrase, not a name
  if (/^chicago\s+(hot\s*dog|deep\s*dish|italian\s*beef|neighborhood|classic|area|style|restaurant|dining|food)\b/i.test(t)) return true;

  // "X staple Jim's" / "X favorite Y" — descriptor immediately before a name
  if (/\b(staple|favorite|mainstay|institution)\s+[A-Z]/i.test(t)) return true;

  // Truncated verb phrases at the end (headline cut off mid-sentence):
  // "…to hold grand", "…to open next month"
  if (/\bto\s+(hold|open|launch|debut|serve|welcome|host|celebrate|introduce|bring)\s/i.test(t)) return true;

  // Generic industry-noun suffix: "X Restaurant Group", "Y Hospitality"
  if (/\b(restaurant group|hospitality group|holdings|hospitality|management|concept|concepts)\s*$/i.test(t)) return true;

  // Sentence connectives that never appear in real names
  if (/\b(spot|place|joint|eatery|venue)\s+(to|for|that|where|with)\b/i.test(t)) return true;

  return false;
}
