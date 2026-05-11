# Cafe Notes

A little journal for tracking cafes you've been to, rating them across the
details that matter to you, and slowly building your own dream cafe out of the
bits you love.

## Running it

No build step — just open `index.html` in a browser.

```bash
# from this folder
python3 -m http.server 8000
# then visit http://localhost:8000
```

All data lives in `localStorage`, so each browser keeps its own journal.

## What's in here

- **My Cafes** — add cafes you've visited, rate them on coffee, taste, cup,
  branding, ambience, menu diversity, pastries, and service. Tag specific
  menu items, vibe details, and branding details (e.g. "apricot croissant",
  "afternoon light", "ribbed ceramic cup").
- **Build a Cafe** — mix-and-match items from cafes you've already rated.
  Click items in the palette to add them to your dream cafe. The app
  suggests new items based on words you've consistently loved.
- **Insights** — a small pattern engine looks across your cafes and surfaces
  your "taste signature" — which dimensions you rate highest and which
  details keep recurring at places you loved.

## Files

- `index.html` — the markup and three views (cafes, build, insights).
- `styles.css` — the slice-of-life palette: cream paper, peach/sage/sky
  pastels, Fraunces serif headings, Caveat handwritten accents, soft
  transitions everywhere.
- `data.js` — rating dimensions, seed cafes, localStorage layer, and the
  `Insights` engine (averages, recurring tokens, suggestions).
- `app.js` — view rendering, modals, the chip inputs, the dream-cafe
  builder, and the insights cards.

## Where the "agentic" piece grows next

Right now `Insights.suggestForDream` uses word-overlap with cafes you've
rated 4+ beans. The natural next step is to swap that scorer for a call to
an LLM that takes your full cafe history as context and proposes menu items
that fit your taste — same interface, smarter brain.
