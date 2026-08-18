// Photo diagnostic. Answers "why is card X showing the wrong image?"
// by reproducing exactly what the aggregator does and printing the
// decision for every restaurant.
//
// Usage:
//   node scripts/doctor-photos.js
//
// Report includes:
//   1. Environment sanity (is the API key visible? cache size?)
//   2. Top shared OG images (the "roundup" images)
//   3. Per-restaurant photo decision:
//        - name
//        - OG image (truncated) and how many other restaurants share it
//        - cache lookup result (hit / miss / status / kind)
//        - final image URL the aggregator would return

import db, { dbApi } from "../db.js";

const HAS_KEY = !!process.env.GOOGLE_PLACES_API_KEY;
const SHARED_THRESHOLD = 3;

function normalizeName(n) {
  return String(n || "")
    .toLowerCase()
    .replace(/^(the|le|la|el)\s+/, "")
    .replace(/['"“”‘’]/g, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function normalizeKey(name, neighborhood) {
  const n = String(name || "").toLowerCase().trim().replace(/\s+/g, " ");
  const h = String(neighborhood || "").toLowerCase().trim();
  return h ? `${n}|${h}` : n;
}
function truncate(s, n) {
  if (!s) return "(null)";
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
const rows = dbApi.listAllInWindow({ cutoff });

// Build the restaurant map the same way the aggregator does.
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
const restaurants = [...map.values()];

const imgCounts = new Map();
for (const r of restaurants) {
  if (r.imageUrl) imgCounts.set(r.imageUrl, (imgCounts.get(r.imageUrl) || 0) + 1);
}

const cacheGet = db.prepare(`SELECT * FROM place_photos WHERE key = ?`);
const cacheCount = db.prepare(`SELECT COUNT(*) AS n FROM place_photos`).get().n;

// ---------- report ----------
console.log("═══ chicago-eats photo doctor ═══");
console.log("");
console.log(`GOOGLE_PLACES_API_KEY set: ${HAS_KEY ? "YES" : "NO — server will not read cache!"}`);
console.log(`PHOTO_FETCHER env var:     ${process.env.PHOTO_FETCHER || "(unset — no new API calls will be made)"}`);
console.log(`restaurants in 90-day window: ${restaurants.length}`);
console.log(`place_photos cache rows:      ${cacheCount}`);
console.log("");

// Top shared OG images (roundup hero photos)
const sharedImages = [...imgCounts.entries()]
  .filter(([_, n]) => n >= SHARED_THRESHOLD)
  .sort((a, b) => b[1] - a[1]);
console.log(`--- shared OG images (used by ${SHARED_THRESHOLD}+ restaurants) ---`);
if (!sharedImages.length) {
  console.log("(none — no roundup collisions detected)");
} else {
  for (const [url, n] of sharedImages.slice(0, 5)) {
    console.log(`  ${n}× ${truncate(url, 100)}`);
  }
}
console.log("");

// Per-restaurant decision. Focus on restaurants whose OG is shared or missing.
console.log(`--- per-restaurant decisions ---`);
console.log("legend: [og=N] number of restaurants sharing this OG; [cache] = row exists in place_photos");
console.log("");

const decisions = restaurants.map((r) => {
  const shared = r.imageUrl && (imgCounts.get(r.imageUrl) || 0) >= SHARED_THRESHOLD;
  const missing = !r.imageUrl;
  const wouldSwap = shared || missing;
  const nbhd = [...r.neighborhoods][0] || null;
  const cached = cacheGet.get(normalizeKey(r.name, nbhd));
  const ogCount = imgCounts.get(r.imageUrl) || 0;

  let finalUrl = r.imageUrl;
  let reason = "keep-og (unique)";
  if (wouldSwap) {
    if (!HAS_KEY) { finalUrl = r.imageUrl; reason = "keep-og (no api key visible)"; }
    else if (cached?.status === "ok" && cached.photo_url) {
      finalUrl = cached.photo_url; reason = `swap → cache/${cached.kind || "?"}`;
    } else if (cached?.status === "no_food" && cached.photo_url && shared) {
      finalUrl = cached.photo_url; reason = `swap → cache/${cached.kind || "?"} (no food, unique interior)`;
    } else if (cached && (cached.status === "no_food" || cached.status === "not_found" || cached.status === "error")) {
      finalUrl = r.imageUrl; reason = `keep-og (cache says ${cached.status})`;
    } else if (!cached) {
      finalUrl = r.imageUrl; reason = `keep-og (NO CACHE ENTRY — needs backfill)`;
    }
  }

  return {
    name: r.name,
    ogCount,
    shared,
    missing,
    cached,
    finalUrl,
    reason,
  };
});

// Sort: shared-OG restaurants first (the problem cases), then everyone else
decisions.sort((a, b) => (b.shared - a.shared) || (b.ogCount - a.ogCount));

for (const d of decisions) {
  const flag =
    d.finalUrl && d.finalUrl.includes("googleusercontent") ? "✓ google" :
    d.shared ? "✗ shared-og" :
    d.missing ? "· missing"  : "· og";
  const ogTag = d.ogCount > 1 ? `[og=${d.ogCount}]` : "";
  console.log(`  ${flag.padEnd(11)} ${ogTag.padEnd(7)} ${d.name.padEnd(38)}  ${d.reason}`);
}

console.log("");
const swapped = decisions.filter((d) => d.finalUrl?.includes("googleusercontent")).length;
const stuckShared = decisions.filter((d) => d.shared && !d.finalUrl?.includes("googleusercontent")).length;
console.log(`summary: ${swapped}/${restaurants.length} restaurants get a Google photo. ${stuckShared} still stuck on a shared OG.`);
