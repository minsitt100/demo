// ---------- state ----------
const state = {
  cuisine: "",
  maxAgeDays: null,
  restaurants: [],
  cuisines: [],
  expanded: new Set(),
};

// ---------- helpers ----------
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}

function relativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (isNaN(diff)) return "";
  if (diff < 60)      return "just now";
  if (diff < 3600)    return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)   return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800)  return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const CUISINE_EMOJI = {
  "Ramen":"🍜","Sushi":"🍣","Japanese":"🍱","Yakitori":"🍢","Izakaya":"🏮",
  "Thai":"🌶️","Vietnamese":"🍲","Italian":"🍝","Pizza":"🍕","Mexican":"🌮",
  "Tacos":"🌮","Korean":"🥘","Korean BBQ":"🥩","Chinese":"🥟","Dim Sum":"🥟",
  "French":"🥖","Café":"☕","Coffee":"☕","Bakery":"🥐","Gelato":"🍨",
  "Ice Cream":"🍦","Wine Bar":"🍷","Cocktails":"🍸","Cocktail Bar":"🍸",
  "Brewery":"🍺","Pub":"🍺","Gastropub":"🍺","Steakhouse":"🥩",
  "Seafood":"🦪","Sandwiches":"🥪","Burgers":"🍔","Deli":"🥪","Diner":"🍳",
  "Mediterranean":"🫒","Greek":"🫒","Levantine":"🥙","Lebanese":"🥙",
  "Israeli":"🥙","Middle Eastern":"🥙","Spanish":"🥘","Indian":"🍛",
  "Ethiopian":"🍛","Peruvian":"🥘","Cuban":"🥘","Caribbean":"🌴",
  "Southern":"🍗","BBQ":"🍖","Fried Chicken":"🍗","Hot Dogs":"🌭",
  "Vegetarian":"🥗","Vegan":"🌱","American":"🍽","New American":"🍽",
  "Asian Fusion":"🍽",
};

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 1800);
}

// ---------- api ----------
async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ---------- rendering ----------
function currentFiltered() {
  const list = state.restaurants;
  if (!state.cuisine) return list;
  return list.filter((r) => r.cuisine === state.cuisine);
}

function renderGrid() {
  const grid = $("#rgrid");
  const items = currentFiltered();

  if (!items.length) {
    grid.innerHTML = `
      <div class="empty">
        <h3>No restaurants yet.</h3>
        <p>Hit <strong>Refresh</strong> to pull the latest, or drop the cuisine filter.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = "";
  for (const r of items) {
    grid.appendChild(renderCard(r));
  }
}

function cuisineChip(cuisine) {
  if (!cuisine) return "";
  const emoji = CUISINE_EMOJI[cuisine] || "🍽";
  return `<span class="rcard-cuisine"><span class="rcard-cuisine-emoji" aria-hidden="true">${emoji}</span>${escapeHtml(cuisine)}</span>`;
}

function renderCard(r) {
  const el = document.createElement("article");
  const id = r.name.toLowerCase();
  const isExpanded = state.expanded.has(id);
  el.className = "rcard" + (isExpanded ? " is-expanded" : "");
  el.dataset.id = id;

  const nbhd = r.neighborhoods.length
    ? r.neighborhoods.slice(0, 2).join(" · ")
    : "Chicago";

  const dishes = Array.isArray(r.topDishes) ? r.topDishes : [];
  const takeBody = r.take || r.blurb;

  el.innerHTML = `
    <header class="rcard-primary">
      <h3 class="rcard-name">${escapeHtml(r.name)}</h3>
      <div class="rcard-location">
        <span class="loc-icon" aria-hidden="true">📍</span>
        <span class="loc-text">${escapeHtml(nbhd)}</span>
      </div>
    </header>
    <div class="rcard-tags">
      ${cuisineChip(r.cuisine)}
      ${r.priceBand ? `<span class="price-tag">${escapeHtml(r.priceBand)}</span>` : ""}
      ${r.firstSeen ? `<span class="since-tag">Since ${shortDate(r.firstSeen)}</span>` : ""}
    </div>
    ${takeBody
      ? `<p class="rcard-take">${r.take ? `<span class="take-mark">“</span>` : ""}${escapeHtml(takeBody)}${r.take ? `<span class="take-mark">”</span>` : ""}</p>`
      : `<p class="rcard-take rcard-take-empty">No description yet.</p>`}
    ${dishes.length ? `
      <div class="rcard-dishes">
        <span class="dishes-label">Order</span>
        <span class="dishes-list">${dishes.slice(0, 5).map(d => `<span class="dish">${escapeHtml(d)}</span>`).join("")}</span>
      </div>
    ` : ""}
    <footer class="rcard-foot">
      <span class="mention-count">${r.mentions} article${r.mentions === 1 ? "" : "s"}</span>
      <button class="rcard-toggle" data-toggle="${id}">
        ${isExpanded ? "Hide articles" : "Show articles"}
        <span class="chev" aria-hidden="true">${isExpanded ? "▴" : "▾"}</span>
      </button>
    </footer>
    <div class="rcard-expanded" ${isExpanded ? "" : "hidden"}>
      <h4 class="expanded-title">Referenced in</h4>
      <ul class="source-list">
        ${r.sources.map((s) => `
          <li>
            <a href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer">
              <span class="src-label">${escapeHtml(s.source_label)}</span>
              <span class="src-title">${escapeHtml(s.title)}</span>
              <span class="src-date">${shortDate(s.published_at)}</span>
            </a>
          </li>
        `).join("")}
      </ul>
    </div>
  `;

  el.querySelector(".rcard-toggle")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleExpanded(id);
  });
  el.addEventListener("click", () => toggleExpanded(id));
  return el;
}

function toggleExpanded(id) {
  if (state.expanded.has(id)) state.expanded.delete(id);
  else state.expanded.add(id);
  renderGrid();
}

function renderCounts() {
  const total = currentFiltered().length;
  const window = state.maxAgeDays ? ` · past ${state.maxAgeDays} days` : "";
  $("#counts").textContent =
    `${total} restaurant${total === 1 ? "" : "s"}${window}`;
}

function renderCuisineFilters() {
  const wrap = $("#cuisine-filters");
  const cuisines = state.cuisines;
  wrap.innerHTML =
    `<button class="chip is-active" data-cuisine="">All cuisines</button>` +
    cuisines.map((c) =>
      `<button class="chip" data-cuisine="${escapeHtml(c)}">${(CUISINE_EMOJI[c] || "")} ${escapeHtml(c)}</button>`
    ).join("");
  $$(".chip", wrap).forEach((btn) => {
    btn.addEventListener("click", () => {
      state.cuisine = btn.dataset.cuisine;
      $$(".chip", wrap).forEach((b) => b.classList.toggle("is-active", b === btn));
      renderGrid();
      renderCounts();
    });
  });
}

function renderSourceStatus(runs) {
  const wrap = $("#footer-status");
  const list = $("#source-status");
  if (!runs || !runs.length) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const latestBySource = new Map();
  for (const r of runs) {
    if (!latestBySource.has(r.source)) latestBySource.set(r.source, r);
  }
  list.innerHTML = [...latestBySource.values()].map((r) => {
    const cls = r.error ? "err" : "ok";
    const detail = r.error
      ? `error: ${escapeHtml(r.error.slice(0, 40))}`
      : `+${r.inserted} new (${r.fetched} scanned)`;
    return `<li><span>${escapeHtml(r.source)}</span><span class="${cls}">${detail}</span></li>`;
  }).join("");
}

// ---------- data loading ----------
async function loadStatus() {
  try {
    const s = await api("/api/status");
    state.maxAgeDays = s.maxAgeDays || null;
    renderSourceStatus(s.recentRuns);
    if (s.recentRuns?.[0]?.finished_at) {
      $("#last-updated").textContent = "Updated " + relativeTime(s.recentRuns[0].finished_at);
    }
  } catch (e) {
    console.warn("status failed", e);
  }
}

async function loadRestaurants() {
  const grid = $("#rgrid");
  grid.innerHTML = `<div class="loading">Loading restaurants…</div>`;
  try {
    const res = await api("/api/restaurants");
    state.restaurants = res.restaurants || [];
    state.maxAgeDays = res.maxAgeDays || state.maxAgeDays;
    // Collect unique cuisines for filter chips.
    const cuisineSet = new Set();
    for (const r of state.restaurants) if (r.cuisine) cuisineSet.add(r.cuisine);
    state.cuisines = [...cuisineSet].sort();
    renderCuisineFilters();
    renderGrid();
    renderCounts();
  } catch (e) {
    grid.innerHTML = `<div class="empty"><h3>Couldn't load restaurants.</h3><p>${escapeHtml(e.message)}</p></div>`;
  }
}

// ---------- events ----------
$("#refresh-btn").addEventListener("click", async () => {
  const btn = $("#refresh-btn");
  btn.classList.add("is-loading");
  btn.disabled = true;
  try {
    const res = await api("/api/refresh", { method: "POST" });
    toast(res.inserted ? `+${res.inserted} new article${res.inserted === 1 ? "" : "s"}` : "Up to date");
    await loadRestaurants();
    await loadStatus();
  } catch (e) {
    toast("Refresh failed");
    console.warn(e);
  } finally {
    btn.classList.remove("is-loading");
    btn.disabled = false;
  }
});

// ---------- boot ----------
(async () => {
  await loadStatus();
  await loadRestaurants();
})();
