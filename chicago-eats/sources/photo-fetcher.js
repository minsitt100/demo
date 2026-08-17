// Google Places API (New) photo fetcher. Solves the "roundup article
// gives every extracted restaurant the same OG image" problem by looking
// up each restaurant on Google Places and pulling a real photo of that
// specific place.
//
// Opt-in via env var: PHOTO_FETCHER=google_places + GOOGLE_PLACES_API_KEY.
// Off by default — pure additive when disabled.
//
// Called by the aggregator only for restaurants whose OG image is shared
// across 3+ other restaurants (the "roundup collision" case). Single-source
// restaurants keep their original OG image, which is usually a hero photo
// of that specific place.
//
// Costs: Google Places pricing on the "New" API. Text Search runs on the
// PLACES_TEXT_SEARCH_PRO SKU (~$0.032 per call as of 2025), Place Photos
// on PLACES_PHOTO (~$0.007 per call). ≈$0.04 per restaurant, cached forever
// in SQLite so the same name never pays twice. Chicago Eats' free-tier
// $200/month Google Maps credit covers thousands of lookups.
//
// Failure mode: fails GRACEFULLY. Cache writes 'error' or 'not_found', and
// the aggregator falls back to the original OG image. A missing photo never
// hides a restaurant.

import db from "../db.js";
import { pickBestPhoto, isPhotoPickerEnabled } from "./photo-picker.js";

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const CHICAGO_CENTER = { latitude: 41.8781, longitude: -87.6298 };
const SEARCH_RADIUS_M = 25000; // 25 km covers all of Chicago + inner suburbs
const PHOTO_MAX_HEIGHT = 800;
// Number of photos to consider per restaurant. Google Places returns up
// to 10 in ranked order (that's the API ceiling per place). We resolve
// all of them so the picker can find a food shot even when Google's
// top-ranked photos are all interior/exterior. More candidates = more
// Places photo-media calls billed (~$0.007 each) but a much higher
// food-photo hit rate. Cap at 10 — the max Google exposes.
const PHOTO_CANDIDATES = Math.min(
  parseInt(process.env.PHOTO_CANDIDATES, 10) || 10,
  10
);

db.exec(`
  CREATE TABLE IF NOT EXISTS place_photos (
    key           TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    neighborhood  TEXT,
    place_id      TEXT,
    photo_url     TEXT,
    status        TEXT NOT NULL DEFAULT 'ok',
    fetched_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migration: older DBs won't have the picker's `kind` column.
const photoCols = db.prepare("PRAGMA table_info(place_photos)").all().map((c) => c.name);
if (!photoCols.includes("kind")) {
  // What the picker classified the chosen photo as: food | drink |
  // interior | exterior | menu | other. Useful for measuring hit rate.
  db.exec("ALTER TABLE place_photos ADD COLUMN kind TEXT");
}

function normalizeKey(name, neighborhood) {
  const n = String(name || "").toLowerCase().trim().replace(/\s+/g, " ");
  const h = String(neighborhood || "").toLowerCase().trim();
  return h ? `${n}|${h}` : n;
}

const getCached = db.prepare(`SELECT * FROM place_photos WHERE key = ?`);
const upsert = db.prepare(`
  INSERT INTO place_photos (key, name, neighborhood, place_id, photo_url, status, kind)
  VALUES (@key, @name, @neighborhood, @place_id, @photo_url, @status, @kind)
  ON CONFLICT(key) DO UPDATE SET
    place_id = excluded.place_id,
    photo_url = excluded.photo_url,
    status = excluded.status,
    kind = excluded.kind,
    fetched_at = datetime('now')
`);

// Synchronous cache-only lookup so the request path never awaits I/O.
// Returns null on a miss (caller queues background fetch), the cached
// row otherwise (with `status` telling ok/not_found/error).
export function findPhotoFromCache(name, neighborhood) {
  return getCached.get(normalizeKey(name, neighborhood)) || null;
}

async function textSearch(name, neighborhood) {
  const parts = [name, "restaurant"];
  if (neighborhood) parts.push(neighborhood);
  parts.push("Chicago");
  const textQuery = parts.filter(Boolean).join(" ");

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY,
      // FieldMask restricts billed fields to the ones we actually use,
      // keeping cost on the cheaper SKUs.
      "X-Goog-FieldMask": "places.id,places.displayName,places.photos,places.formattedAddress",
    },
    body: JSON.stringify({
      textQuery,
      locationBias: {
        circle: { center: CHICAGO_CENTER, radius: SEARCH_RADIUS_M },
      },
      pageSize: 1,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`textSearch ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function resolvePhotoUri(photoResourceName) {
  // skipHttpRedirect=true → returns JSON { photoUri } instead of the image
  // bytes. photoUri is a googleusercontent.com URL that we cache and serve
  // directly to the browser — no API key needed on the client side.
  const url = `https://places.googleapis.com/v1/${photoResourceName}/media?maxHeightPx=${PHOTO_MAX_HEIGHT}&skipHttpRedirect=true&key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`photoMedia ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.photoUri || null;
}

// Fetch (or return cached) photo for a restaurant. Every call ends up
// persisted so subsequent calls are DB-cached — including negative results.
// When the picker is enabled, resolves the top N candidate URIs and asks
// Claude vision to choose the most food-forward one; otherwise uses
// Google's own top-ranked photo.
export async function fetchPhotoNow(name, neighborhood) {
  if (!API_KEY) throw new Error("GOOGLE_PLACES_API_KEY not set");
  const key = normalizeKey(name, neighborhood);
  const cached = getCached.get(key);
  if (cached) return cached;

  const record = {
    key,
    name,
    neighborhood: neighborhood || null,
    place_id: null,
    photo_url: null,
    status: "not_found",
    kind: null,
  };
  try {
    const search = await textSearch(name, neighborhood);
    const place = search.places?.[0];
    if (place) {
      record.place_id = place.id || null;
      const photoResourceNames = (place.photos || [])
        .slice(0, isPhotoPickerEnabled() ? PHOTO_CANDIDATES : 1)
        .map((p) => p.name)
        .filter(Boolean);
      if (photoResourceNames.length) {
        // Resolve all candidates to URIs in parallel — each is one
        // billed Places photo-media call.
        const uris = (await Promise.all(
          photoResourceNames.map((n) => resolvePhotoUri(n).catch(() => null))
        )).filter(Boolean);
        if (uris.length) {
          if (isPhotoPickerEnabled()) {
            const pick = await pickBestPhoto(uris);
            if (pick.index >= 0) {
              record.photo_url = uris[pick.index];
              record.status = "ok";
              record.kind = pick.kind;
            } else {
              // No food photo among the candidates. Mark it so the
              // aggregator falls back to the article's OG image rather
              // than showing yet another interior shot.
              record.status = "no_food";
              record.kind = pick.kind || "none";
            }
          } else {
            // Picker disabled — use Google's top-ranked photo as-is.
            record.photo_url = uris[0];
            record.status = "ok";
            record.kind = "top";
          }
        }
      }
    }
  } catch (err) {
    record.status = "error";
    console.warn(`[photo-fetcher] "${name}" (${neighborhood || "no-nbhd"}): ${err.message}`);
  }
  upsert.run(record);
  return record;
}

// Fire-and-forget background fetch, mirrors the validator's pattern.
// Runs on the next event loop tick and populates the DB cache. Skips names
// already cached (in DB) or currently in flight.
const inFlight = new Set();
export function queueForPhotoFetch(items, { concurrency = 3 } = {}) {
  const todo = items.filter((it) => {
    if (!it?.name) return false;
    const k = normalizeKey(it.name, it.neighborhood);
    if (getCached.get(k) || inFlight.has(k)) return false;
    inFlight.add(k);
    return true;
  });
  if (!todo.length) return;
  setImmediate(async () => {
    const queue = [...todo];
    async function worker() {
      while (queue.length) {
        const it = queue.shift();
        await fetchPhotoNow(it.name, it.neighborhood).catch(() => {});
      }
    }
    try {
      await Promise.all(Array.from({ length: concurrency }, worker));
    } finally {
      for (const it of todo) inFlight.delete(normalizeKey(it.name, it.neighborhood));
    }
  });
}

export function photoFetcherStats() {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'ok'        THEN 1 ELSE 0 END) AS ok,
      SUM(CASE WHEN status = 'not_found' THEN 1 ELSE 0 END) AS not_found,
      SUM(CASE WHEN status = 'error'     THEN 1 ELSE 0 END) AS errors
    FROM place_photos
  `).get();
  const kinds = db.prepare(`
    SELECT COALESCE(kind, 'unlabeled') AS kind, COUNT(*) AS n
    FROM place_photos
    WHERE status = 'ok'
    GROUP BY COALESCE(kind, 'unlabeled')
  `).all();
  return {
    enabled: !!API_KEY && process.env.PHOTO_FETCHER === "google_places",
    picker: isPhotoPickerEnabled() ? { model: process.env.PHOTO_PICKER_MODEL || "claude-haiku-4-5" } : { model: null },
    ...row,
    kinds: Object.fromEntries(kinds.map((k) => [k.kind, k.n])),
  };
}

export function isPhotoFetcherEnabled() {
  return !!API_KEY && process.env.PHOTO_FETCHER === "google_places";
}
