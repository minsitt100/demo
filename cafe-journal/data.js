// ----- the rating dimensions we ask about -----
const RATING_DIMENSIONS = [
  { key: "coffee",    label: "Coffee"          },
  { key: "taste",     label: "Taste"           },
  { key: "cup",       label: "Coffee cup"      },
  { key: "branding",  label: "Branding"        },
  { key: "ambience",  label: "Ambience"        },
  { key: "menu",      label: "Menu diversity"  },
  { key: "pastries",  label: "Pastries"        },
  { key: "service",   label: "Service"         },
];

const BUCKET_LABELS = {
  menu:  "Menu",
  vibe:  "Vibe",
  brand: "Branding",
};

// ----- a few starter cafes so the app feels alive on first run -----
const SEED_CAFES = [
  {
    id: "seed-1",
    name: "Maru Coffee",
    location: "Hayes Valley",
    date: "2026-03-12",
    ratings: {
      coffee: 5, taste: 5, cup: 5, branding: 4,
      ambience: 5, menu: 3, pastries: 4, service: 5,
    },
    menu: ["apricot croissant", "iced matcha", "honey latte"],
    vibe: ["afternoon light", "quiet jazz", "wooden countertops"],
    brand: ["ribbed ceramic cup", "linen apron", "stamped paper sleeve"],
    note: "Felt like a Sunday in slow motion. The barista smiled like she meant it.",
  },
  {
    id: "seed-2",
    name: "Little Brontë",
    location: "Mission",
    date: "2026-02-04",
    ratings: {
      coffee: 4, taste: 4, cup: 3, branding: 5,
      ambience: 4, menu: 5, pastries: 5, service: 4,
    },
    menu: ["pistachio kouign-amann", "rose cardamom bun", "cold brew with oat"],
    vibe: ["tall windows", "old book smell", "soft chatter"],
    brand: ["mustard yellow logo", "letterpress menu", "kraft napkins"],
    note: "Pastry case looked like a stained glass window.",
  },
];

// ----- localStorage layer -----
const STORE_KEY = "cafe-notes:v1";
const DREAM_KEY = "cafe-notes:dream:v1";

const Store = {
  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) {
        localStorage.setItem(STORE_KEY, JSON.stringify(SEED_CAFES));
        return [...SEED_CAFES];
      }
      return JSON.parse(raw);
    } catch {
      return [...SEED_CAFES];
    }
  },
  save(cafes) {
    localStorage.setItem(STORE_KEY, JSON.stringify(cafes));
  },
  loadDream() {
    try {
      const raw = localStorage.getItem(DREAM_KEY);
      return raw
        ? JSON.parse(raw)
        : { name: "", menu: [], vibe: [], brand: [] };
    } catch {
      return { name: "", menu: [], vibe: [], brand: [] };
    }
  },
  saveDream(d) {
    localStorage.setItem(DREAM_KEY, JSON.stringify(d));
  },
};

// ----- tiny "agentic" pattern engine -----
// looks across the user's rated cafes for things they consistently rate high,
// then surfaces palette items connected to those patterns.
const Insights = {
  // average rating per dimension across all cafes
  averages(cafes) {
    if (!cafes.length) return {};
    const sums = {}; const counts = {};
    for (const c of cafes) {
      for (const d of RATING_DIMENSIONS) {
        const v = c.ratings?.[d.key];
        if (typeof v === "number" && v > 0) {
          sums[d.key] = (sums[d.key] || 0) + v;
          counts[d.key] = (counts[d.key] || 0) + 1;
        }
      }
    }
    const avg = {};
    for (const k of Object.keys(sums)) {
      avg[k] = sums[k] / counts[k];
    }
    return avg;
  },

  // dimensions the user rates highest on average
  topDimensions(cafes, n = 3) {
    const avg = Insights.averages(cafes);
    return Object.entries(avg)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([key, score]) => {
        const dim = RATING_DIMENSIONS.find(d => d.key === key);
        return { key, label: dim?.label || key, score };
      });
  },

  // overall rating for a cafe (average of all filled dimensions)
  cafeScore(c) {
    const vals = Object.values(c.ratings || {}).filter(v => typeof v === "number" && v > 0);
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  },

  // tokens that appear across multiple high-rated cafes — your "taste signature"
  recurringTokens(cafes) {
    const counts = {}; // token -> { count, bucket, cafes:[] }
    const highly = cafes.filter(c => Insights.cafeScore(c) >= 4);
    for (const c of highly) {
      for (const bucket of ["menu", "vibe", "brand"]) {
        for (const tok of (c[bucket] || [])) {
          const key = tok.toLowerCase().trim();
          if (!key) continue;
          if (!counts[key]) counts[key] = { count: 0, bucket, label: tok, cafes: [] };
          counts[key].count += 1;
          counts[key].cafes.push(c.name);
        }
      }
    }
    return Object.values(counts)
      .filter(t => t.count >= 2)
      .sort((a, b) => b.count - a.count);
  },

  // word-stem suggestions: if "apricot croissant" recurs, suggest other
  // pastries that share a word with your favorites.
  suggestForDream(cafes, dream) {
    const highly = cafes.filter(c => Insights.cafeScore(c) >= 4);
    const dreamSet = new Set(
      ["menu", "vibe", "brand"].flatMap(b =>
        (dream[b] || []).map(i => `${b}:${i.text.toLowerCase()}`)
      )
    );

    // tokens user already loves
    const lovedWords = new Set();
    for (const c of highly) {
      for (const b of ["menu", "vibe", "brand"]) {
        for (const t of (c[b] || [])) {
          for (const w of t.toLowerCase().split(/[\s,]+/)) {
            if (w.length > 3) lovedWords.add(w);
          }
        }
      }
    }

    const scored = [];
    for (const c of cafes) {
      const score = Insights.cafeScore(c);
      for (const b of ["menu", "vibe", "brand"]) {
        for (const t of (c[b] || [])) {
          const key = `${b}:${t.toLowerCase()}`;
          if (dreamSet.has(key)) continue;
          const words = t.toLowerCase().split(/[\s,]+/);
          const shared = words.filter(w => w.length > 3 && lovedWords.has(w));
          if (!shared.length) continue;
          scored.push({
            bucket: b,
            text: t,
            from: c.name,
            cafeId: c.id,
            score: score + shared.length * 0.3,
            reason: `shares "${shared[0]}" with cafes you loved`,
          });
        }
      }
    }
    // dedupe by text + bucket, prefer higher score
    const seen = new Map();
    for (const s of scored) {
      const k = `${s.bucket}:${s.text.toLowerCase()}`;
      if (!seen.has(k) || seen.get(k).score < s.score) seen.set(k, s);
    }
    return [...seen.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  },
};
