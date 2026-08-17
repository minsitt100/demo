// One-shot script: for every restaurant currently in the aggregated feed
// whose OG image is shared across 3+ restaurants (or missing entirely),
// fetch a real per-restaurant photo from Google Places and cache it in
// SQLite. The running server will pick up the new URLs on the next
// /api/restaurants request — no restart needed.
//
// Usage:
//   PHOTO_FETCHER=google_places GOOGLE_PLACES_API_KEY=... \
//     node scripts/backfill-photos.js
//
// Flags:
//   ALL=1        Fetch a Google photo for EVERY restaurant (not just
//                shared-image ones). ~$0.04 each. Off by default.
//   THRESHOLD=N  Override the shared-image threshold (default 3).
//   LIMIT=N      Cap the number of restaurants processed this run.

import { dbApi } from "../db.js";
import { fetchPhotoNow, photoFetcherStats } from "../sources/photo-fetcher.js";

const ALL = process.env.ALL === "1";
const THRESHOLD = parseInt(process.env.THRESHOLD, 10) || 3;
const LIMIT = parseInt(process.env.LIMIT, 10) || Infinity;

if (!process.env.GOOGLE_PLACES_API_KEY) {
  console.error("GOOGLE_PLACES_API_KEY not set. Aborting.");
  process.exit(1);
}
if (process.env.PHOTO_FETCHER !== "google_places") {
  console.warn("PHOTO_FETCHER != google_places — running anyway (this script always uses Google Places).");
}

function normalizeName(n) {
  return String(n || "")
    .toLowerCase()
    .replace(/^(the|le|la|el)\s+/, "")
    .replace(/['"“”‘’]/g, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Build the same restaurant map the aggregator does, but locally — pure
// read from the DB, no HTTP. We only need name + neighborhood + imageUrl
// to decide who to backfill.
function buildRestaurantMap() {
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const rows = dbApi.listAllInWindow({ cutoff });
  const map = new Map();
  for (const o of rows) {
    let mentioned = [];
    try {
      mentioned = o.restaurants_mentioned ? JSON.parse(o.restaurants_mentioned) : [];
    } catch { /* ignore */ }
    if (!mentioned.length && o.restaurant) mentioned = [{ name: o.restaurant }];
    for (const r of mentioned) {
      const key = normalizeName(r.name);
      if (!key) continue;
      let agg = map.get(key);
      if (!agg) {
        agg = { name: r.name, neighborhoods: new Set(), imageUrl: null };
        map.set(key, agg);
      }
      if (!agg.imageUrl && o.image_url) agg.imageUrl = o.image_url;
      if (r.neighborhood) agg.neighborhoods.add(r.neighborhood);
      else if (o.neighborhood) agg.neighborhoods.add(o.neighborhood);
    }
  }
  return [...map.values()];
}

const restaurants = buildRestaurantMap();
const imgCounts = new Map();
for (const r of restaurants) {
  if (r.imageUrl) imgCounts.set(r.imageUrl, (imgCounts.get(r.imageUrl) || 0) + 1);
}

let targets = restaurants.filter((r) => {
  if (ALL) return true;
  if (!r.imageUrl) return true;
  return (imgCounts.get(r.imageUrl) || 0) >= THRESHOLD;
});

if (isFinite(LIMIT)) targets = targets.slice(0, LIMIT);

console.log(`total restaurants in window: ${restaurants.length}`);
console.log(`backfill targets:            ${targets.length}${ALL ? " (ALL)" : ` (shared-image ≥${THRESHOLD} or missing)`}`);
console.log("");

let ok = 0, notFound = 0, errored = 0, cached = 0;
for (let i = 0; i < targets.length; i++) {
  const r = targets[i];
  const nbhd = [...r.neighborhoods][0] || null;
  const before = photoFetcherStats().total;
  const result = await fetchPhotoNow(r.name, nbhd);
  const after = photoFetcherStats().total;
  const wasCached = after === before;
  if (wasCached) cached++;
  else if (result.status === "ok") ok++;
  else if (result.status === "not_found") notFound++;
  else errored++;
  const flag =
    result.status === "ok" ? "✓" :
    result.status === "not_found" ? "·" : "✗";
  const label = wasCached ? "cache" : result.status;
  console.log(`${String(i + 1).padStart(3)}/${targets.length}  ${flag}  [${label.padEnd(9)}]  ${r.name}${nbhd ? ` — ${nbhd}` : ""}`);
}

console.log("");
console.log(`done: ${ok} new, ${cached} already cached, ${notFound} not found, ${errored} errors`);
console.log(`cache size: ${photoFetcherStats().total}`);
