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
  headers: { "User-Agent": "chicago-eats/0.1 (+github.com/minsitt100/demo)" },
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["media:thumbnail", "mediaThumbnail"],
      ["media:content", "mediaContent"],
    ],
  },
});

export const meta = {
  id: "blockclub",
  label: "Block Club Chicago",
  // Site-wide feed. Block Club is Chicago-only, so we lean on the opening
  // classifier in sources/util.js to filter down to restaurant openings.
  feedUrl: "https://blockclubchicago.org/feed/",
};

export async function fetchItems() {
  const feed = await parser.parseURL(meta.feedUrl);
  const out = [];
  for (const item of feed.items || []) {
    const title = item.title || "";
    const contentHtml = item.contentEncoded || item.content || "";
    const summary = truncate(stripHtml(item.contentSnippet || contentHtml), 260);
    const haystack = `${title} ${summary}`;

    // Block Club also covers non-opening food news; filter.
    if (!looksLikeOpening(haystack)) continue;
    // Category is Chicago-only, but keep this as a belt-and-suspenders check.
    if (!mentionsChicago(haystack) && !mentionsChicago(title)) {
      // Block Club is Chicago-only, so treat missing keyword as still Chicago.
    }

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
