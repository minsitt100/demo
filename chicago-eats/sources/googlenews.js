import Parser from "rss-parser";
import {
  looksLikeOpening,
  mentionsFood,
  classifyStatus,
  mentionsChicago,
  extractNeighborhood,
  guessRestaurant,
  stripHtml,
  truncate,
  stableId,
  verifyMany,
} from "./util.js";

const parser = new Parser({
  timeout: 20000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/122.0 Safari/537.36 chicago-eats/0.1",
  },
});

// Google News lets you subscribe to any search query as RSS. This gives us
// broad coverage — neighborhood papers, trade press, PR wires — that we'd
// never think to add one at a time.
//
// Query breakdown: "chicago" AND "restaurant" AND (opens OR opening OR debuts)
// The URL-encoded string below is exactly that.
export const meta = {
  id: "googlenews",
  label: "Google News",
  feedUrl:
    "https://news.google.com/rss/search" +
    "?q=%22chicago%22+%22restaurant%22+(opens+OR+opening+OR+debuts)" +
    "&hl=en-US&gl=US&ceid=US:en",
};

// Google News titles come as "Real title - Publication Name". Strip the
// trailing " - Source" so cards read cleanly, and remember the source name
// for display.
function splitTitle(raw) {
  const m = raw.match(/^(.*)\s+-\s+([^-]+)$/);
  if (m) return { title: m[1].trim(), publisher: m[2].trim() };
  return { title: raw, publisher: null };
}

export async function fetchItems() {
  const feed = await parser.parseURL(meta.feedUrl);
  const out = [];
  for (const item of feed.items || []) {
    const { title, publisher } = splitTitle(item.title || "");
    const summary = truncate(stripHtml(item.contentSnippet || item.content || ""), 260);
    const haystack = `${title} ${summary}`;

    // Query already narrows this, but keep the belt-and-suspenders checks:
    // Google News occasionally returns loosely-related items (opening
    // ceremonies, "stars poised to open the season", etc.). Require both
    // a Chicago mention AND a food mention alongside the opening keyword.
    if (!mentionsChicago(haystack)) continue;
    if (!looksLikeOpening(haystack)) continue;
    if (!mentionsFood(haystack)) continue;

    out.push({
      id: stableId(meta.id, item.link),
      source: meta.id,
      // Show the actual publisher in the source pill when we know it.
      source_label: publisher ? `Google News · ${publisher}` : meta.label,
      url: item.link,
      title,
      restaurant: guessRestaurant(title),
      neighborhood: extractNeighborhood(haystack),
      status: classifyStatus(haystack),
      summary,
      image_url: null,
      published_at: item.isoDate || item.pubDate || null,
    });
  }
  // Follows the Google redirect to the real publisher during verification;
  // dead-ends 404 as expected.
  const alive = await verifyMany(out.map((o) => o.url));
  const survivors = out.filter((o) => alive.get(o.url));
  const { enrichWithRestaurants } = await import("./extract.js");
  return await enrichWithRestaurants(survivors);
}
