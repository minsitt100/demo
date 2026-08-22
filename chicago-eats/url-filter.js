// URL blocklist for "evergreen" guide articles — pieces that list
// long-standing favorites rather than newly-opened restaurants. This app
// is scoped to NEW restaurants, so anything matching these patterns is
// filtered out of the aggregator regardless of what's in the DB.
//
// Add a URL pattern here to permanently exclude it from the feed. The
// hide:evergreen script uses the same list to bulk-hide matching rows
// already stored in the DB.

// Substrings matched anywhere in the article URL. Case-insensitive.
export const EVERGREEN_URL_PATTERNS = [
  // Infatuation's evergreen "greatest hits" guides
  "theinfatuation.com/chicago/guides/best-restaurants-chicago",
  "theinfatuation.com/chicago/guides/hit-list",
  "theinfatuation.com/chicago/guides/most-popular",
  "theinfatuation.com/chicago/guides/best-",  // catches best-brunch, best-pizza, etc.

  // Eater's map-based "best of" round-ups (evergreen, not opening news)
  "eater.com/maps/",
];

export function isEvergreenUrl(url) {
  if (!url) return false;
  const u = String(url).toLowerCase();
  return EVERGREEN_URL_PATTERNS.some((p) => u.includes(p.toLowerCase()));
}
