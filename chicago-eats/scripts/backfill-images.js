// One-off backfill: fetch each article that doesn't yet have an image_url
// and pull its Open Graph hero image. NO LLM cost — just an HTTP fetch and
// a regex per row. Safe to re-run; only touches rows where image_url is
// currently NULL or empty.
//
//   npm run backfill:images

import { dbApi } from "../db.js";
import { extractOgImage } from "../sources/util.js";

const rows = dbApi.rowsMissingImages();
console.log(`backfill-images: ${rows.length} row${rows.length === 1 ? "" : "s"} without images`);

const CONCURRENCY = 6; // pure HTTP, no LLM rate limits
const queue = [...rows];
let done = 0;
let hits = 0;

async function fetchArticle(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/122.0 Safari/537.36 chicago-eats/0.1",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function worker() {
  while (queue.length) {
    const row = queue.shift();
    const html = await fetchArticle(row.url);
    if (html) {
      const image = extractOgImage(html);
      if (image) {
        dbApi.setImageUrl(row.id, image);
        hits++;
      }
    }
    done++;
    if (done % 10 === 0 || done === rows.length) {
      console.log(`  ${done}/${rows.length} done (${hits} images pulled)`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`backfill-images: finished. ${hits}/${rows.length} rows now have image URLs.`);
process.exit(0);
