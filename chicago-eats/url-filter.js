// URL blocklist for "evergreen" guide articles — pieces that list
// long-standing favorites rather than newly-opened restaurants. This app
// is scoped to NEW restaurants, so anything matching these patterns is
// filtered out of the aggregator regardless of what's in the DB.
//
// Add a URL pattern here to permanently exclude it from the feed. The
// hide:evergreen script uses the same list to bulk-hide matching rows
// already stored in the DB.

// Substrings matched anywhere in the article URL. Case-insensitive.
// Enumerated on purpose — no wildcard "best-*" catchall, because that
// would also catch "best-NEW-chicago-restaurants-hit-list", which is
// on-topic for this app. Add specific "best-brunch", "best-pizza" etc.
// entries here if/when those slip in.
export const EVERGREEN_URL_PATTERNS = [
  // Infatuation's evergreen "greatest hits" guides
  "theinfatuation.com/chicago/guides/best-restaurants-chicago",
  "theinfatuation.com/chicago/guides/hit-list",
  "theinfatuation.com/chicago/guides/most-popular",

  // Eater's map-based "best of" round-ups (evergreen, not opening news)
  "eater.com/maps/",
];

// URL patterns that should NEVER be treated as evergreen, even if they
// happen to contain a blocklisted substring. Whitelist wins over
// blocklist. Anything about NEW openings belongs here.
export const KEEP_URL_PATTERNS = [
  "theinfatuation.com/chicago/guides/best-new-chicago-restaurants",
  "theinfatuation.com/chicago/guides/new-chicago-restaurant-openings",
];

export function isEvergreenUrl(url) {
  if (!url) return false;
  const u = String(url).toLowerCase();
  // Whitelist takes precedence — explicitly-allowed URLs are never
  // filtered, even if they'd otherwise match a block pattern.
  if (KEEP_URL_PATTERNS.some((p) => u.includes(p.toLowerCase()))) return false;
  return EVERGREEN_URL_PATTERNS.some((p) => u.includes(p.toLowerCase()));
}
