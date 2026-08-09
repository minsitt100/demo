import Parser from "rss-parser";
import {
  looksLikeOpening,
  classifyStatus,
  extractNeighborhood,
  guessRestaurant,
  stripHtml,
  truncate,
  stableId,
} from "./util.js";

// r/chicagofood exposes an RSS feed at .rss — no auth required for read-only.
const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "chicago-eats/0.1 (+github.com/minsitt100/demo)" },
});

export const meta = {
  id: "reddit-chicagofood",
  label: "r/chicagofood",
  feedUrl: "https://www.reddit.com/r/chicagofood/new/.rss?limit=50",
};

export async function fetchItems() {
  const feed = await parser.parseURL(meta.feedUrl);
  const out = [];
  for (const item of feed.items || []) {
    const title = item.title || "";
    const summary = truncate(stripHtml(item.contentSnippet || item.content || ""), 260);
    const haystack = `${title} ${summary}`;

    if (!looksLikeOpening(haystack)) continue;

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
      image_url: null,
      published_at: item.isoDate || item.pubDate || null,
    });
  }
  return out;
}
