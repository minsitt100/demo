import Parser from "rss-parser";
import {
  looksLikeOpening,
  classifyStatus,
  mentionsChicago,
  extractNeighborhood,
  guessRestaurant,
  stripHtml,
  truncate,
  stableId,
  firstImageFromHtml,
  verifyMany,
} from "./util.js";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/122.0 Safari/537.36 chicago-eats/0.1",
  },
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["media:thumbnail", "mediaThumbnail"],
      ["media:content", "mediaContent"],
    ],
  },
});

export const meta = {
  id: "infatuation",
  label: "The Infatuation Chicago",
  // The Infatuation exposes a site-wide RSS at /rss. It's not Chicago-scoped,
  // so we filter items down by a Chicago mention below.
  feedUrl: "https://www.theinfatuation.com/rss",
};

export async function fetchItems() {
  const feed = await parser.parseURL(meta.feedUrl);
  const out = [];
  for (const item of feed.items || []) {
    const title = item.title || "";
    const contentHtml = item.contentEncoded || item.content || "";
    const summary = truncate(stripHtml(item.contentSnippet || contentHtml), 260);
    const haystack = `${title} ${summary} ${item.link || ""}`;

    // Site-wide feed — must mention Chicago (in title, summary, or URL slug).
    if (!mentionsChicago(haystack)) continue;
    if (!looksLikeOpening(haystack)) continue;

    const image =
      item.mediaThumbnail?.$?.url ||
      item.mediaContent?.$?.url ||
      firstImageFromHtml(contentHtml);

    out.push({
      id: stableId(meta.id, item.link),
      source: meta.id,
      source_label: meta.label,
      url: item.link,
      title,
      restaurant: guessRestaurant(title),
      neighborhood: extractNeighborhood(haystack),
      status: classifyStatus(haystack),
      summary,
      image_url: image || null,
      published_at: item.isoDate || item.pubDate || null,
    });
  }
  const alive = await verifyMany(out.map((o) => o.url));
  const survivors = out.filter((o) => alive.get(o.url));
  const { enrichWithRestaurants } = await import("./extract.js");
  return await enrichWithRestaurants(survivors);
}
