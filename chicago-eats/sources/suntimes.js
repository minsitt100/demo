import Parser from "rss-parser";
import {
  looksLikeOpening,
  mentionsFood,
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
  id: "suntimes",
  label: "Chicago Sun-Times",
  // Sun-Times runs on the Vox Media Chorus platform, same as Eater. The
  // site-wide RSS is at /rss/index.xml; the opening classifier filters it
  // down to restaurant openings. If this URL 404s, try the /food/rss path
  // or check View Source on their homepage for a <link rel="alternate">.
  feedUrl: "https://chicago.suntimes.com/rss/index.xml",
};

export async function fetchItems() {
  const feed = await parser.parseURL(meta.feedUrl);
  const out = [];
  for (const item of feed.items || []) {
    const title = item.title || "";
    const contentHtml = item.contentEncoded || item.content || "";
    const summary = truncate(stripHtml(item.contentSnippet || contentHtml), 260);
    const haystack = `${title} ${summary}`;

    // Sun-Times is Chicago-only, so no mentionsChicago() gate needed. But
    // it's also multi-topic (sports, news, weather, food) — require a
    // food mention alongside the opening keyword so a football article
    // that happens to contain "opens" doesn't slip through.
    if (!looksLikeOpening(haystack)) continue;
    if (!mentionsFood(haystack)) continue;

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
