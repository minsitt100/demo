# Chicago Eats

A real-time feed of new restaurant openings in Chicago, aggregated from
multiple sources so you're not stuck relying on TikTok.

## What it does

- **Scrapes multiple sources on a schedule.** Node + `node-cron` runs every
  30 minutes by default. Ships with three connectors:
  - Eater Chicago (RSS)
  - Block Club Chicago — Food & Drink (RSS)
  - r/chicagofood (Reddit's `.rss` endpoint)
- **Filters to actual openings.** A shared classifier (`sources/util.js`)
  keeps items whose title/summary mention *opens / opening / debuts / coming
  to / now open / set to open / …* and drops closings, recipes, and roundups.
- **Marks status.** Items are tagged `now open` or `coming soon` from the
  same keywords.
- **Extracts what it can.** Best-effort restaurant name from the title,
  neighborhood from a Chicago neighborhood list.
- **Stores in SQLite.** Deduped by source + URL. Each row keeps title,
  restaurant, neighborhood, status, summary, image, published time.
- **Serves a small HTTP API + a clean feed UI.** Filter by status or by
  source; hide items you don't care about.

## Run it

Requires Node 18+.

```bash
cd chicago-eats
npm install
npm start           # server on http://localhost:3000
```

On boot the server does one scrape immediately, then re-scrapes every 30
minutes. Override with env vars:

```bash
PORT=4000 SCRAPE_CRON="*/10 * * * *" SCRAPE_ON_BOOT=0 npm start
```

You can also force a scrape:

```bash
npm run scrape                        # one-off run from the CLI
curl -X POST http://localhost:3000/api/refresh   # or from the UI's Refresh button
```

Data lives in `openings.db` (SQLite, WAL mode). It's gitignored — delete
the file to reset.

## API

- `GET  /api/openings?limit=25&offset=0&status=opening&source=eater` — feed
- `GET  /api/sources` — enabled sources
- `GET  /api/status` — total count + recent scrape runs
- `POST /api/refresh` — kick a scrape now
- `POST /api/openings/:id/hide` — hide from feed

## Adding a source

Every source module exports:

```js
export const meta = { id, label, feedUrl };
export async function fetchItems() { /* return normalized rows */ }
```

Drop the file in `sources/`, import it in `sources/index.js`, and it will
run on the next scrape. The normalized row shape is in `db.js` — anything
missing is fine, only `id`, `source`, `source_label`, `url`, and `title`
are required.

## Notes and honest caveats

- The Chicago detection and opening-classifier are keyword-based. They
  work well for the sources here (Eater Chicago is Chicago-only, Block Club
  is Chicago-only, r/chicagofood is Chicago-only) but adding a national
  source will need a stricter Chicago-check.
- Restaurant-name extraction is heuristic and misses some. That's fine as
  v1 — the article title is always shown, and clicking the card opens the
  original source.
- Reviews / top-dishes are explicitly not in v1. The next natural addition
  is a `review_snippets` table that links to openings and lets a source
  contribute quoted lines from an article; the aggregation UI would then
  live on a per-restaurant detail page.
