// The Infatuation doesn't publish a public RSS feed, and their content shape
// is fundamentally different from news sites like Eater. Their high-value
// pieces are LIVING GUIDES at stable URLs — "New Chicago Restaurant
// Openings", "The Hit List", etc. The URL never changes; the *content* at
// the URL updates as they add/remove restaurants over time.
//
// So instead of trying to discover new URLs, we curate a small set of guide
// URLs here and re-extract them on a weekly cadence (reExtractEveryDays).
// The LLM extractor pulls the restaurants + dishes + Infatuation's take
// from each guide's article body.
//
// To add another Infatuation guide, add its URL + title to the `articles`
// array below. To add another RSS-less publisher (Time Out, Michelin, etc.)
// use this file as the template.

import { stableId, verifyMany } from "./util.js";

export const meta = {
  id: "infatuation",
  label: "The Infatuation Chicago",
  // Cadence for re-running LLM extraction against these URLs. Their guides
  // update roughly monthly; 7 days is comfortable headroom.
  reExtractEveryDays: 7,
  articles: [
    // Two active guides — both on-topic for a "new restaurants" app.
    // Do NOT add "best-restaurants-chicago" here; that's the evergreen
    // greatest-hits list and it's blocked by url-filter.js on purpose.
    {
      url: "https://www.theinfatuation.com/chicago/guides/new-chicago-restaurant-openings",
      title: "The Infatuation — New Chicago Restaurant Openings",
    },
    {
      url: "https://www.theinfatuation.com/chicago/guides/best-new-chicago-restaurants-hit-list",
      title: "The Infatuation — Best New Chicago Restaurants Hit List",
    },
  ],
};

export async function fetchItems() {
  const items = meta.articles.map((a) => ({
    id: stableId(meta.id, a.url),
    source: meta.id,
    source_label: meta.label,
    url: a.url,
    title: a.title,
    restaurant: null,       // no title-guessing for curated guide URLs
    neighborhood: null,     // extractor infers per restaurant
    status: "opening",      // curated guides are currently-published
    summary: null,
    image_url: null,
    published_at: null,     // seen_at is the effective date for stable URLs
  }));

  const alive = await verifyMany(items.map((i) => i.url));
  const survivors = items.filter((i) => alive.get(i.url));

  const { enrichWithRestaurants, refreshStaleUrls } = await import("./extract.js");

  // First run through fresh extraction — new URLs (skipExisting=true means
  // already-stored URLs pass through untouched).
  const enriched = await enrichWithRestaurants(survivors);

  // Then re-check existing URLs on the weekly cadence. Because Infatuation
  // updates guide content in place, this is how we catch new restaurants
  // they've added since our last check.
  await refreshStaleUrls(survivors, { olderThanDays: meta.reExtractEveryDays });

  return enriched;
}
