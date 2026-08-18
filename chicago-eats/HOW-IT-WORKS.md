# Chicago Eats — How It Works

*A plain-language guide to what this app does and how it does it.*

---

## What is Chicago Eats?

Chicago Eats is a personal restaurant-discovery tool that watches Chicago food news for you. Every 30 minutes it goes out and checks a handful of food publications — Eater Chicago, The Infatuation, Chicago Sun-Times, Google News — pulls the restaurant openings and reviews they've written about, and shows them to you on a single clean page.

The point is to save you from having to check TikTok, Reddit, and multiple food blogs to find out where to eat. One tab, always fresh, curated to Chicago only.

### What each restaurant card shows you

- The restaurant's **name**
- The **neighborhood** it's in
- Its **cuisine** (with a little emoji)
- A **price band** ($ = cheap, $$$$ = splurge)
- A **one-to-two sentence take** — the writer's opinion in their own voice
- The specific **dishes to order** when you go
- Which **articles referenced it** (so you can click through to read more)

---

## The problem it's solving

Restaurant news lives in eight different places, and the interesting information (what to order, what the writer actually thought) is buried inside long articles. If you want to find "new Filipino spots in Ukrainian Village," today you'd have to:

1. Search Eater Chicago
2. Search Google
3. Search Infatuation's site
4. Read a dozen articles
5. Take mental notes
6. Cross-reference

Chicago Eats does all six for you and shows the answer on one page. Filter by cuisine, click to see the dishes, done.

---

## The seven layers, explained with analogies

The app is really seven connected pieces. Each one is small and does one job.

### Layer 1 — Sources (the newsstand)

Think of this as a newsstand you subscribe to. Four food publications are on the shelf right now:

- **Eater Chicago** (via their RSS feed)
- **The Infatuation** (specific curated guides, since they don't have a feed)
- **Chicago Sun-Times** (via their sitewide RSS)
- **Google News** (via a saved search query for Chicago restaurant openings)

*Block Club Chicago used to be on the shelf too but was giving us too much junk, so it's temporarily disabled — easy to add back later.*

Each publication is described in a tiny "recipe file" that says where to find its articles. Adding a new publication is a matter of dropping a new recipe file into a folder.

### Layer 2 — The scraper (the librarian)

Every 30 minutes, a background job walks the newsstand and pulls the latest table of contents from each publication. It notes the title, URL, and date of every new article. If it's seen the article before, it skips it (no need to re-read yesterday's news).

### Layer 3 — The classifier (the sorter)

Publications write about a lot of things — sports, politics, weather, obituaries. We only want articles about food openings. The classifier is a set of rules that reads each article's title and asks:

- **"Does this mention opening, debuting, or coming soon?"** If no → skip it.
- **"Does this mention food, restaurants, cuisine, chef, or specific dishes?"** If no → skip it. (This one only applies to broad publications like Sun-Times and Google News, where sports and news get mixed in.)
- **"Does this mention closings, recipes, or obituaries?"** If yes → skip it.
- **"Is this an opening we can actually visit today, or a future plan without a name?"** If future → skip it.

Articles that survive the sorter move on to the next layer.

### Layer 4 — The extractor (the reader with a highlighter)

This is where the app gets smart. For every article that survives the classifier, we send its full text to **Claude** (an AI language model) and ask it to pull out the interesting information as structured data:

- What restaurants does this article cover?
- What's each restaurant's name, cuisine, and neighborhood?
- What's the writer's opinion on each place?
- Which specific dishes does the article recommend ordering?
- What's the price range?

Claude reads the article and returns clean structured data. This is why the app knows "the octopus is a must-order at Cariño" — Claude read the article for you and pulled that fact out.

**Two versions of this layer exist:**

- **Regex mode** — no AI, just pattern-matching. Fast and free but less accurate.
- **LLM mode** (Claude API) — much smarter but costs a few cents per article. Currently running Claude Opus 5, the highest-quality model.

You control which mode is active with an environment variable in your terminal.

### Layer 5 — The validator (the fact-checker)

Even with a smart AI reader, occasionally something slips through that isn't really a restaurant — a section header from the article ("The Spots"), an article title fragment ("Top 25: The Best Restaurants"), or a person's name from a sports article.

The validator is a second AI (Claude Haiku — the fast cheap model) whose only job is to look at each extracted "restaurant name" and answer: *"Is this actually a real Chicago restaurant name?"* If it says no, the entry gets filtered out and never appears on the site.

Two clever things about the validator:

1. **It runs in the background.** The page loads instantly — the validator does its work behind the scenes and cleans up the display on your next refresh.
2. **It remembers.** Once it validates a name, it caches the answer. If "Kasama" appeared in five articles, it's checked once and remembered forever.

### Layer 6 — The photo layer (the photographer)

Every article comes with one "hero image" that news sites use for social-media previews. That's fine when an article is about ONE restaurant — the hero image is usually a beautiful shot of that place's food. But when the article is a roundup ("10 Best New Restaurants in Chicago"), all ten restaurants inherit the *same* hero image, and your grid ends up showing the same tostada across ten cards.

The photo layer fixes this using **Google Places** (the same database that powers Google Maps).

**Here's what happens for every restaurant:**

1. **Check the hero image.** Is it shared across 3+ other restaurants? If no, keep it — it's a real, unique photo of this place. If yes, keep going.
2. **Look up the restaurant on Google Places** by name + neighborhood.
3. **Ask Google for the top 10 photos** of that specific place.
4. **Ask Claude Haiku (with vision)** to look at all 10 photos and pick the most food-forward one — a plated dish first, cocktail second, food-prep shot third, and if none of those exist, the best interior/exterior.
5. **Save the chosen photo** in a small cache (`place_photos` table) so we never look up the same restaurant twice.
6. **If Google can't find the restaurant at all** and the original hero image was shared across a roundup: **show no image**. Better a text-only card than the wrong tostada.

**Costs:** About $0.11 per restaurant, one-time. Cached forever. For all 200 restaurants in your feed, ≈$22 total. Well under Google's free $200/month credit.

### Layer 7 — The display (the storefront)

The final layer is the website you see at http://localhost:3000. All the cleaned-up, extracted, validated restaurants get shown as a 3-column grid of cards. You can:

- **Click a filter pill** at the top to filter by cuisine, price, neighborhood, or time period. Multiple selections are allowed within a filter (any-of matching).
- **Click a card** to expand it in place and see all the articles that mentioned this restaurant. No page reload, no image flicker.
- **Click the ✕ button** on a card to hide it forever (if the app got something wrong).
- **Click Refresh** to trigger a new scrape immediately without waiting for the 30-minute schedule.

The bottom of the page shows a small "health strip":
- Which AI models are running (Extractor + Validator + Photo picker)
- How well each publication is doing (how many results, what percentage got hidden)

---

## The three big design decisions

Every piece of good software has a few important choices baked in. Here are ours.

### Decision 1: Multiple layers of filtering

Rather than trusting any single check, we filter progressively. An article has to survive:

1. The publication's own editorial choices
2. Our "is this an opening?" classifier
3. Our "is this about food?" classifier
4. Claude's extraction (does it produce a real restaurant?)
5. The **ghost-name filter** — a shared regex file (`name-filter.js`) with two dozen patterns that reject article-title fragments ("Top 25:", "Inside NAIA's chic"), descriptor phrases ("Michelin-starred restaurant group"), truncated headlines ("…to hold grand opening"), and industry-noun suffixes ("Restaurant Group"). Same filter is used by the aggregator, the photo backfill script, and the validator — a name rejected in one place is rejected everywhere.
6. The LLM validator (is this a real restaurant name?)
7. Your manual ✕ button (final human veto)

Each layer catches things the others miss. The result: a much cleaner grid than any single filter could produce.

### Decision 2: LLM for extraction, regex for pre-filtering

We use Claude (the expensive, slow, smart option) where quality matters most — reading articles and pulling out structured data. We use regex (fast, free pattern-matching) where we need to process hundreds of items cheaply, like filtering headlines before we spend money on AI.

If we used Claude for everything, the app would cost 100× more. If we used regex for everything, quality would be poor. The mix gets us the best of both.

### Decision 3: Background work, never blocking

When you load the page, nothing waits on the internet. The AI validator, the article fetching, the enrichment — all happen behind the scenes on a 30-minute schedule (or when you click Refresh). Your page loads in under a second because it's just reading pre-computed data from a local database.

The one exception was a bug we caught earlier where the validator was making API calls during page load — took a minute to render. Fixed by moving all API calls to background workers.

---

## Where the data lives

Everything is stored in a single file called `openings.db` inside the `chicago-eats/` folder. It's a SQLite database — think of it as a spreadsheet Chicago Eats can query really fast.

One row per article, columns like:
- `source` (which publication)
- `url` (link to the article)
- `title` (article headline)
- `restaurants_mentioned` (JSON list of restaurants Claude extracted)
- `is_hidden` (whether you clicked the ✕)
- `extracted_at` (when the AI last processed it)

If you ever want a clean slate: delete that one file and the app starts fresh.

---

## Cost breakdown

The app itself is free — it runs on your laptop, uses no paid infrastructure. The only cost comes from the Claude API calls, and only if you turn on LLM mode.

| Configuration | Cost/month (typical use) |
|---|---|
| **Regex only** (no LLM) | **$0.00** |
| **LLM extraction + Haiku validator** | **~$3–8** |
| **LLM extraction (Opus 5) + Haiku validator** | **~$10–20** |
| **+ Google Places photos + Claude vision picker** (current setup) | **~$15–30 total, first month; ~$5–10 ongoing** |

Every article costs a fraction of a cent to extract. Every restaurant name costs about 2¢ to validate — but it's cached forever, so you only pay once per name. Every restaurant photo costs about 11¢ (Google Places search + 10 photo lookups + Claude vision pick) — also cached forever.

**Two billing accounts:**
- **Anthropic** — for Claude API. Set caps at [console.anthropic.com](https://console.anthropic.com/settings/limits). Safe default: $10/month.
- **Google Cloud** — for Places API. First $200/month is free credit. Set caps under Billing → Budgets & alerts. Safe default: $10/month.

---

## Configuration — the environment variables

Chicago Eats reads a few "environment variables" from your terminal to decide how to run. These are set in your `~/.zshrc` file so they persist across sessions.

| Variable | What it does | Values |
|---|---|---|
| `ANTHROPIC_API_KEY` | Your personal key for calling Claude | `sk-ant-…` |
| `GOOGLE_PLACES_API_KEY` | Your Google Cloud key for Places API | `AIza…` |
| `EXTRACTOR` | Which extractor to use | `llm` (Claude) or unset (regex) |
| `VALIDATOR` | Whether to double-check extracted names with Claude | `llm` or unset |
| `PHOTO_FETCHER` | Whether to look up per-restaurant photos on Google Places | `google_places` or unset |
| `PHOTO_PICKER` | Whether the food-forward photo picker runs (on when key exists) | `0` to disable |
| `ANTHROPIC_MODEL` | Which Claude model does extraction | `claude-opus-5`, `claude-haiku-4-5`, etc. |
| `VALIDATOR_MODEL` | Which Claude model validates names | Same options as above |
| `PHOTO_PICKER_MODEL` | Which Claude model picks food photos | Vision-capable model (default `claude-haiku-4-5`) |
| `MAX_AGE_DAYS` | How far back to show restaurants | `90` (default) |
| `SCRAPE_CRON` | How often to scrape (cron format) | `*/30 * * * *` (default: every 30 min) |
| `SCRAPE_ON_BOOT` | Whether to run one scrape at server start | `0` to disable |
| `NO_CRON` | Disables the scheduled scraper entirely | `1` to disable |

**Two side notes on how the photo layer reads env vars:**

- If your **Google key is set**, the app *always* reads any cached photos from the database — that costs nothing. This means you don't have to set `PHOTO_FETCHER` on every startup just to see the photos you've already paid for.
- `PHOTO_FETCHER=google_places` only controls whether *new* photos get fetched when cards appear without a cached photo. Without it, the app is read-only against your existing cache — no API calls.

To turn everything on:
```
export ANTHROPIC_API_KEY=<your-claude-key>
export GOOGLE_PLACES_API_KEY=<your-google-key>
export EXTRACTOR=llm
export VALIDATOR=llm
export PHOTO_FETCHER=google_places
export ANTHROPIC_MODEL=claude-opus-5
```

To turn everything off and go back to free regex-only mode: `unset EXTRACTOR VALIDATOR PHOTO_FETCHER`.

---

## Running the app

Two commands in a terminal:

```
cd ~/Desktop/demo/chicago-eats
npm start
```

Then open http://localhost:3000 in your browser. That's it.

To stop the app: press `Ctrl+C` in the terminal.

### The three ways to start the server

| Command | What it does | When to use it |
|---|---|---|
| `npm start` | Regex extractor, reads photo cache, cron scrapes on the 30-min schedule but with regex only (no AI cost) | Everyday use |
| `npm run start:full` | Turns on LLM extraction + LLM validator + Google Places photo fetching all in one command | When you want fresh AI-enriched data |
| `npm run start:ui` | Zero outbound API calls. No scraping, no LLM, no photo fetching. Serves whatever's already in the DB and reads cached photos. | UI work — CSS, layout, colors. You can hit Refresh 100 times and spend $0. |

### All the handy scripts

| Command | What it does |
|---|---|
| `npm run enrich:restaurants` | Re-run extraction on any DB rows that haven't been processed yet |
| `REENRICH_ALL=1 npm run enrich:restaurants` | Re-process **every** row (use after changing extractor settings) |
| `PHOTO_FETCHER=google_places npm run backfill:photos` | Look up per-restaurant photos for every card that needs one |
| `PURGE=1 npm run backfill:photos` | Nuke the photo cache and rebuild from scratch (~$14 for 200 restaurants) |
| `RERANK=1 npm run backfill:photos` | Clear only the non-food cache entries and re-pick them |
| `npm run doctor:photos` | Diagnostic: show per-restaurant what the aggregator decides for each card's image and why |
| `npm run peek:feed` | Debug tool — see what each publication is returning right now |
| `npm run debug:extract -- "<url>"` | Debug tool — see what Claude extracts from a single article URL |
| `npm run verify:urls` | Clean out dead article links from the database |

---

## The layered architecture in a picture

```
┌─────────────────────────────────────────────────────────┐
│                    Your Browser                          │
│                http://localhost:3000                     │
└──────────────────────────┬──────────────────────────────┘
                           │
                           │  (reads from local database, instant)
                           ▼
┌─────────────────────────────────────────────────────────┐
│                  The Node.js Server                      │
│         (aggregates + filters + validates)               │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                  openings.db (SQLite)                    │
│              One row per scraped article                 │
└──────────────────────────▲──────────────────────────────┘
                           │
                           │  (writes new rows every 30 min)
                           │
┌──────────────────────────┴──────────────────────────────┐
│           Background scraper (runs on schedule)          │
│                                                          │
│    Sources → Scraper → Classifier → Extractor           │
│      ↓         ↓          ↓            ↓                │
│  Eater      Fetch     Keyword      Claude LLM           │
│  Sun-Times  the RSS   filter       reads article        │
│  Infatuation feed +   for food     & extracts:          │
│  Google News each     & opening    name, cuisine,       │
│              article  keywords     dishes, take,        │
│                                    price, etc.          │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
                    (in the background)
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│         Background LLM Validator (fires on demand)       │
│    Claude Haiku checks each name:                        │
│    "Is 'THE SPOTS' really a restaurant name?"           │
│    Caches the answer forever.                            │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│      Background Photo Fetcher (fires when needed)        │
│                                                          │
│  1. Look up restaurant on Google Places                  │
│  2. Fetch top 10 photo URLs                              │
│  3. Claude Haiku vision picks the food-forward one       │
│  4. Save the winning URL in place_photos table           │
│                                                          │
│  Skipped if hero image is already unique to this place.  │
└─────────────────────────────────────────────────────────┘
```

---

## What we built along the way

This app went through a few major evolutions during development:

### Version 1 — Regex extraction from RSS feeds

The first working version just used pattern-matching to pull restaurant names from article headlines. Cheap and fast, but often wrong. "New Fulton Market wine bar opens" would extract "New Fulton Market wine bar" as if it were the restaurant name.

### Version 2 — LLM extraction with Claude Haiku

We switched extraction to send the full article body to Claude Haiku. Immediate quality jump — actual restaurant names, real cuisines, real neighborhoods. Cost went from $0 to ~$3/month.

### Version 3 — Richer schema

Extended what the LLM returns to include the writer's opinion ("take"), specific dishes to order, and price band. Cards became genuinely useful decision-support tools, not just news feeds.

### Version 4 — Curated URLs for Infatuation

The Infatuation doesn't publish an RSS feed, and their content is at stable URLs that get updated over time ("Best New Restaurant Openings" page updates monthly). Added a per-source pattern for these "living pages" — re-check the same URL on a weekly cadence to catch new additions.

### Version 5 — Content filtering (sports & upcoming openings)

A high school football article slipped through and produced 6 cards for player names. Added a "does this article actually mention food?" check for broad-scope publications. Also added an "is this restaurant actually open now?" filter to hide vaporware future openings.

### Version 6 — Two-stage LLM (extraction + validation)

Upgraded to Claude Opus 5 for extraction (much higher quality on ambiguous articles), and added a second LLM (Claude Haiku) as a background validator to catch anything that survived the first pass. This is the current setup.

### Version 7 — Per-source noise metrics

Added a small footer widget showing what percentage of each publication's articles got hidden by you. Gives an at-a-glance signal for whether a source is worth keeping.

### Version 8 — Google Places photos with a food-forward picker

Cards started looking samey because a single roundup article's hero image was inherited by every restaurant in that article. Added a Google Places integration that looks each restaurant up on the Maps database, grabs its top 10 photos, and asks Claude vision to pick the most food-forward one. Cards now show real per-restaurant photography instead of the same tostada six times.

**Design decision along the way:** the first version of the picker was "strict" — it would reject a restaurant's photos if none showed food, and fall back to the article's hero image. But that meant the shared roundup hero kept leaking through. Reverted to "food-preferred but never null" — the picker will accept an interior/exterior if that's all Google has, because a unique photo of the actual place beats a shared photo of somebody else's food.

### Version 9 — Shared filter + polish

- Extracted the ghost-name filter to `name-filter.js` so both the aggregator and the photo backfill script use the same rules. This stopped the backfill from spending Places API calls on names the UI would filter out anyway.
- Card clicks now expand in place instead of re-rendering the whole grid. No more image-flicker on every click.
- Removed emojis from the filter pills for a cleaner look.
- Added `NO_CRON=1` and `npm run start:ui` for API-free UI development.

---

## The debugging tools you have

If something ever looks wrong on the site, four tools tell you what's happening:

1. **`npm run peek:feed`** — shows every article each publication is returning right now, with a ✓/✗ for whether the classifier is keeping or dropping it.

2. **`npm run debug:extract -- "<article URL>"`** — runs the full pipeline against a single article and prints every step: whether the URL fetched, how much text was extracted, what Claude returned.

3. **`npm run doctor:photos`** — reproduces the aggregator's photo-decision logic locally and prints one line per restaurant with the reason (swap → cache/food, keep OG, drop image, no cache entry, etc.). Use whenever a card's image looks wrong.

4. **The health strip at the bottom of the site** — shows extractor + validator + photo-picker mode, and the noise ratio per source.

If any of these show something unexpected, you can share the output and we can debug from there.

---

## What's next (ideas not yet built)

- **Save-for-later list.** A star button on each card, saved to your own personal list. Then a separate view for "restaurants I want to try."
- **Reservation availability.** Integrate Resy/OpenTable so cards show "next available: Thursday 7pm."
- **Auto-taste profile.** As you save and hide restaurants, the app learns what you like and highlights similar new openings.
- **Sitemap-based discovery.** Automatically find new Infatuation guide URLs instead of curating them by hand.
- **Cross-restaurant search.** Type "octopus" and see every restaurant where an article recommended the octopus.

Any of these are a session or two of work. When you want one, say so.

---

## Where the code lives

Everything is in `~/Desktop/demo/chicago-eats/`. The important files:

| File / folder | What it does |
|---|---|
| `server.js` | The web server. Serves the site and the API. Runs the aggregator that turns raw articles into restaurant cards. |
| `db.js` | Talks to the SQLite database. Owns table definitions and migrations. |
| `name-filter.js` | The shared ghost-name filter — every "is this really a restaurant name?" check runs through here. |
| `sources/` | One file per publication. Each defines how to find its articles. |
| `sources/extract-llm.js` | The Claude-powered extractor. |
| `sources/validate-llm.js` | The Claude-powered validator. |
| `sources/photo-fetcher.js` | The Google Places integration — search by name + neighborhood, resolve top 10 photo URLs, cache the result. |
| `sources/photo-picker.js` | The Claude vision food-forward photo picker. Called by `photo-fetcher.js`. |
| `sources/util.js` | Shared helpers (classifiers, URL verification, entity decoding, OG-image extraction). |
| `public/` | The frontend — the actual HTML, CSS, and JavaScript the browser loads. |
| `scripts/` | Utility scripts (enrich, verify URLs, debug tools, seed demo data, backfill photos, photo doctor). |
| `openings.db` | The database file itself. Everything the app has ever seen. Includes the `place_photos` table for the Google Places cache. |

---

*Last updated: today's photo layer + ghost-filter refactor + UI polish + UI-only start mode. If you add a feature or change the architecture, come back and update this doc.*
