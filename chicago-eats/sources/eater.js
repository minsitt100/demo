import Parser from "rss-parser";
import {
  looksLikeOpening,
  classifyStatus,
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
  id: "eater",
  label: "Eater Chicago",
  feedUrl: "https://chicago.eater.com/rss/index.xml",
};

export async function fetchItems() {
  const feed = await parser.parseURL(meta.feedUrl);
  const out = [];
  for (const item of feed.items || []) {
    const title = item.title || "";
    const contentHtml = item.contentEncoded || item.content || "";
    const summary = truncate(stripHtml(item.contentSnippet || contentHtml), 260);
    const haystack = `${title} ${summary}`;

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
  // Drop any items whose article URL 404s at scrape time.
  const alive = await verifyMany(out.map((o) => o.url));
  return out.filter((o) => alive.get(o.url));
}
