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

## The six layers, explained with analogies

The app is really six connected pieces. Each one is small and does one job.

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

### Layer 6 — The display (the storefront)

The final layer is the website you see at http://localhost:3000. All the cleaned-up, extracted, validated restaurants get shown as a 3-column grid of cards. You can:

- **Click a cuisine chip** at the top to filter (only ramen, only wine bars, etc.)
- **Click a card** to expand it and see all the articles that mentioned this restaurant
- **Click the ✕ button** on a card to hide it forever (if the app got something wrong)
- **Click Refresh** to trigger a new scrape immediately without waiting for the 30-minute schedule

The bottom of the page shows a small "health strip":
- Which AI models are running (Extractor + Validator)
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
5. The LLM validator (is this a real restaurant name?)
6. Your manual ✕ button (final human veto)

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
| **LLM extraction (Opus 5) + Haiku validator** (current setup) | **~$10–20** |

Every article costs a fraction of a cent to extract. Every restaurant name costs about 2¢ to validate — but it's cached forever, so you only pay once per name.

Anthropic sends you a monthly bill via credit card on file. You can set spending caps at [console.anthropic.com](https://console.anthropic.com/settings/limits) — safe default is $10/month.

---

## Configuration — the environment variables

Chicago Eats reads a few "environment variables" from your terminal to decide how to run. These are set in your `~/.zshrc` file so they persist across sessions.

| Variable | What it does | Values |
|---|---|---|
| `ANTHROPIC_API_KEY` | Your personal key for calling Claude | `sk-ant-…` |
| `EXTRACTOR` | Which extractor to use | `llm` (Claude) or unset (regex) |
| `VALIDATOR` | Whether to double-check extracted names with Claude | `llm` or unset |
| `ANTHROPIC_MODEL` | Which Claude model does extraction | `claude-opus-5`, `claude-haiku-4-5`, etc. |
| `VALIDATOR_MODEL` | Which Claude model validates names | Same options as above |
| `MAX_AGE_DAYS` | How far back to show restaurants | `90` (default) |
| `SCRAPE_CRON` | How often to scrape (cron format) | `*/30 * * * *` (default: every 30 min) |

To turn LLM extraction on with the highest-quality model:
```
export ANTHROPIC_API_KEY=<your-key>
export EXTRACTOR=llm
export ANTHROPIC_MODEL=claude-opus-5
export VALIDATOR=llm
```

To turn everything off and go back to free regex-only mode: `unset EXTRACTOR VALIDATOR`.

---

## Running the app

Two commands in a terminal:

```
cd ~/Desktop/demo/chicago-eats
npm start
```

Then open http://localhost:3000 in your browser. That's it.

To stop the app: press `Ctrl+C` in the terminal.

### Handy scripts

| Command | What it does |
|---|---|
| `npm start` | Start the server |
| `npm run enrich:restaurants` | Re-run extraction on any DB rows that haven't been processed yet |
| `REENRICH_ALL=1 npm run enrich:restaurants` | Re-process **every** row (use after changing extractor settings) |
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

---

## The debugging tools you have

If something ever looks wrong on the site, three tools tell you what's happening:

1. **`npm run peek:feed`** — shows every article each publication is returning right now, with a ✓/✗ for whether the classifier is keeping or dropping it.

2. **`npm run debug:extract -- "<article URL>"`** — runs the full pipeline against a single article and prints every step: whether the URL fetched, how much text was extracted, what Claude returned.

3. **The health strip at the bottom of the site** — shows extractor + validator mode, and the noise ratio per source.

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
| `server.js` | The web server. Serves the site and the API. |
| `db.js` | Talks to the SQLite database. |
| `sources/` | One file per publication. Each defines how to find its articles. |
| `sources/extract-llm.js` | The Claude-powered extractor. |
| `sources/validate-llm.js` | The Claude-powered validator. |
| `sources/util.js` | Shared helpers (classifiers, URL verification, entity decoding). |
| `public/` | The frontend — the actual HTML, CSS, and JavaScript the browser loads. |
| `scripts/` | Utility scripts (enrich, verify URLs, debug tools, seed demo data). |
| `openings.db` | The database file itself. Everything the app has ever seen. |

---

*Last updated when we shipped the LLM validator. If you add a feature or change the architecture, come back and update this doc.*
