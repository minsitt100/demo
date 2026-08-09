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
- `GET  /api/status` — total count, current age window, recent scrape runs
- `POST /api/refresh` — kick a scrape now
- `POST /api/verify` — re-check every visible URL and hide dead ones
- `POST /api/openings/:id/hide` — hide from feed

## Restaurant extraction

Every card shows the restaurant name, cuisine, and blurb extracted from the
article body (or the aggregated best across sources). Two extractor
backends, toggled with the `EXTRACTOR` env var:

- **`regex` (default)** — no setup, no cost. `sources/extract.js` parses
  `<h2>`/`<h3>` headers and paragraph-leading `<strong>` names, then
  keyword-matches cuisines. Good on well-structured food outlets (Eater,
  Block Club, Sun-Times, Infatuation), weaker on Google News.
- **`llm`** — sends the article body to Claude and gets back a structured
  list. Much better across messy publishers, and infers cuisine and blurb
  as part of the same call.

To turn on LLM extraction:

```bash
export ANTHROPIC_API_KEY=sk-ant-...          # get one at console.anthropic.com
export EXTRACTOR=llm
npm start
```

Defaults to `claude-haiku-4-5` (fast, cheap — roughly a fraction of a cent
per article; a few dollars a month even with heavy scraping). Bump to a
smarter model for messier articles:

```bash
ANTHROPIC_MODEL=claude-opus-5 EXTRACTOR=llm npm start
```

To re-run extraction on existing DB rows with the LLM backend:

```bash
EXTRACTOR=llm npm run enrich:restaurants
```

## Freshness controls

- **Only past 3 months are shown.** The list + count queries filter to items
  whose `published_at` (or `seen_at`, if unknown) is within `MAX_AGE_DAYS`
  (default `90`). Override at start: `MAX_AGE_DAYS=180 npm start`.
- **Dead links are blocked at scrape time.** Each source's `fetchItems()`
  runs a small parallel URL-verifier (`sources/util.js → verifyMany`) that
  HEAD-checks every candidate and drops 404/410/network-error URLs before
  they hit the DB.
- **Clean up existing dead links** with `npm run verify:urls` (walks all
  un-hidden rows, hides ones that no longer resolve). Same thing over HTTP
  via `POST /api/verify`.

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
