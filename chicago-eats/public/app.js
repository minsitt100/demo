// ---------- state ----------
const state = {
  filters: {
    cuisine: new Set(),          // multi-select
    price: new Set(),            // multi-select
    neighborhood: new Set(),     // multi-select
    timePeriod: 90,              // days: 7 | 30 | 90 (default)
  },
  maxAgeDays: null,
  restaurants: [],
  options: {                      // populated from data
    cuisines: [],
    prices: ["$", "$$", "$$$", "$$$$"],
    neighborhoods: [],
    timePeriods: [
      { label: "Past 7 days", value: 7 },
      { label: "Past 30 days", value: 30 },
      { label: "Past 90 days", value: 90 },
    ],
  },
  expanded: new Set(),
  openDropdown: null,             // which filter's dropdown is open
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
  const { cuisine, price, neighborhood, timePeriod } = state.filters;
  const now = Date.now();
  const cutoffMs = now - timePeriod * 86400 * 1000;
  return state.restaurants.filter((r) => {
    if (cuisine.size && !cuisine.has(r.cuisine)) return false;
    if (price.size && !price.has(r.priceBand)) return false;
    if (neighborhood.size && !(r.neighborhoods || []).some((n) => neighborhood.has(n))) return false;
    if (r.firstSeen) {
      const ts = new Date(r.firstSeen).getTime();
      if (!isNaN(ts) && ts < cutoffMs) return false;
    }
    return true;
  });
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

  const imageHtml = r.imageUrl
    ? `<div class="rcard-image"><img src="${escapeHtml(r.imageUrl)}" alt="" loading="lazy" onerror="this.parentElement.remove()"></div>`
    : "";

  el.innerHTML = `
    ${imageHtml}
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
      <span class="rcard-foot-actions">
        <button class="rcard-hide" data-hide-name="${escapeHtml(r.name)}" title="Not a real restaurant / hide from feed">✕</button>
        <button class="rcard-toggle" data-toggle="${id}">
          ${isExpanded ? "Hide articles" : "Show articles"}
          <span class="chev" aria-hidden="true">${isExpanded ? "▴" : "▾"}</span>
        </button>
      </span>
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
  el.querySelector(".rcard-hide")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    const name = e.currentTarget.dataset.hideName;
    if (!confirm(`Hide "${name}" from your feed?`)) return;
    try {
      const res = await api("/api/restaurants/hide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      toast(`Hidden (${res.hidden} article${res.hidden === 1 ? "" : "s"})`);
      el.style.transition = "opacity 200ms, transform 200ms";
      el.style.opacity = "0";
      el.style.transform = "scale(0.98)";
      setTimeout(() => {
        el.remove();
        loadStatus(); // refresh noise-per-source counts
      }, 200);
    } catch (err) {
      toast("Hide failed");
      console.warn(err);
    }
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
  const period = state.options.timePeriods.find((t) => t.value === state.filters.timePeriod);
  const window = period ? ` · ${period.label.toLowerCase()}` : "";
  $("#counts").textContent =
    `${total} restaurant${total === 1 ? "" : "s"}${window}`;
}

// ---------- filter pills + dropdowns ----------
function pillLabels() {
  const { cuisine, price, neighborhood, timePeriod } = state.filters;
  return {
    cuisine: cuisine.size === 0 ? "All cuisines" : [...cuisine][0],
    cuisineBadge: cuisine.size > 1 ? `+${cuisine.size - 1}` : null,
    price: price.size === 0 ? "Any price" : [...price].join(" · "),
    priceBadge: null,
    neighborhood: neighborhood.size === 0 ? "All neighborhoods" : [...neighborhood][0],
    neighborhoodBadge: neighborhood.size > 1 ? `+${neighborhood.size - 1}` : null,
    time: state.options.timePeriods.find((t) => t.value === timePeriod)?.label || `Past ${timePeriod} days`,
  };
}

function renderFilterPills() {
  const labels = pillLabels();
  const wraps = $$(".filter-pill-wrap");
  for (const wrap of wraps) {
    const filter = wrap.dataset.filter;
    const pill = wrap.querySelector(".filter-pill");
    const labelEl = pill.querySelector(".pill-label");
    const badge = pill.querySelector(".pill-badge");
    labelEl.textContent = labels[filter];
    const badgeText = labels[filter + "Badge"];
    if (badge) {
      badge.hidden = !badgeText;
      badge.textContent = badgeText || "";
    }
  }
}

function renderDropdown(filter) {
  const wrap = document.querySelector(`.filter-pill-wrap[data-filter="${filter}"]`);
  const dropdown = wrap.querySelector(".filter-dropdown");
  let optionsHtml = "";

  if (filter === "cuisine") {
    const list = state.options.cuisines;
    if (!list.length) return `<div class="dropdown-empty">No cuisines yet</div>`;
    optionsHtml = list.map((c) => {
      const selected = state.filters.cuisine.has(c);
      return `<button type="button" class="dropdown-option ${selected ? "is-selected" : ""}" data-value="${escapeHtml(c)}"><span class="check">✓</span>${(CUISINE_EMOJI[c] || "")} ${escapeHtml(c)}</button>`;
    }).join("");
  } else if (filter === "price") {
    optionsHtml = state.options.prices.map((p) => {
      const selected = state.filters.price.has(p);
      return `<button type="button" class="dropdown-option ${selected ? "is-selected" : ""}" data-value="${escapeHtml(p)}"><span class="check">✓</span>${escapeHtml(p)}</button>`;
    }).join("");
  } else if (filter === "neighborhood") {
    const list = state.options.neighborhoods;
    if (!list.length) return `<div class="dropdown-empty">No neighborhoods yet</div>`;
    optionsHtml = list.map((n) => {
      const selected = state.filters.neighborhood.has(n);
      return `<button type="button" class="dropdown-option ${selected ? "is-selected" : ""}" data-value="${escapeHtml(n)}"><span class="check">✓</span>${escapeHtml(n)}</button>`;
    }).join("");
  } else if (filter === "time") {
    optionsHtml = state.options.timePeriods.map((t) => {
      const selected = state.filters.timePeriod === t.value;
      return `<button type="button" class="dropdown-option ${selected ? "is-selected" : ""}" data-value="${t.value}"><span class="check">✓</span>${escapeHtml(t.label)}</button>`;
    }).join("");
  }
  dropdown.innerHTML = optionsHtml;
  // Bind option clicks
  $$(".dropdown-option", dropdown).forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const value = btn.dataset.value;
      handleOptionClick(filter, value);
    });
  });
}

function handleOptionClick(filter, value) {
  if (filter === "time") {
    state.filters.timePeriod = parseInt(value, 10);
    closeDropdown();
  } else {
    const set = state.filters[filter];
    if (set.has(value)) set.delete(value);
    else set.add(value);
  }
  refreshUI();
}

function openDropdown(filter) {
  closeDropdown();
  state.openDropdown = filter;
  const wrap = document.querySelector(`.filter-pill-wrap[data-filter="${filter}"]`);
  const pill = wrap.querySelector(".filter-pill");
  const dropdown = wrap.querySelector(".filter-dropdown");
  renderDropdown(filter);
  dropdown.hidden = false;
  pill.classList.add("is-open");
}

function closeDropdown() {
  if (!state.openDropdown) return;
  const wrap = document.querySelector(`.filter-pill-wrap[data-filter="${state.openDropdown}"]`);
  if (wrap) {
    wrap.querySelector(".filter-dropdown").hidden = true;
    wrap.querySelector(".filter-pill").classList.remove("is-open");
  }
  state.openDropdown = null;
}

// ---------- active filters strip ----------
function activeFilterEntries() {
  const entries = [];
  for (const c of state.filters.cuisine) entries.push({ filter: "cuisine", value: c, label: c });
  for (const p of state.filters.price) entries.push({ filter: "price", value: p, label: p });
  for (const n of state.filters.neighborhood) entries.push({ filter: "neighborhood", value: n, label: n });
  if (state.filters.timePeriod !== 90) {
    const t = state.options.timePeriods.find((x) => x.value === state.filters.timePeriod);
    if (t) entries.push({ filter: "time", value: t.value, label: t.label });
  }
  return entries;
}

function renderActiveFilters() {
  const entries = activeFilterEntries();
  const wrap = $("#active-filters");
  const list = $("#active-filters-list");
  if (entries.length === 0) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  list.innerHTML = entries.map((e) =>
    `<span class="active-filter-chip" data-filter="${e.filter}" data-value="${escapeHtml(String(e.value))}">
      ${escapeHtml(e.label)}
      <button class="x" aria-label="Remove ${escapeHtml(e.label)}">×</button>
    </span>`
  ).join("");
  $$(".active-filter-chip .x", list).forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const chip = btn.parentElement;
      removeActiveFilter(chip.dataset.filter, chip.dataset.value);
    });
  });
}

function removeActiveFilter(filter, value) {
  if (filter === "time") {
    state.filters.timePeriod = 90;  // reset to default
  } else {
    state.filters[filter].delete(value);
  }
  refreshUI();
}

function clearAllFilters() {
  state.filters.cuisine.clear();
  state.filters.price.clear();
  state.filters.neighborhood.clear();
  state.filters.timePeriod = 90;
  refreshUI();
}

function refreshUI() {
  renderFilterPills();
  renderActiveFilters();
  renderGrid();
  renderCounts();
  // If a dropdown is open, re-render it to reflect the new selection state
  if (state.openDropdown) renderDropdown(state.openDropdown);
}

function renderSourceStatus(runs, sourceStats, extractor, validator) {
  const wrap = $("#footer-status");
  const list = $("#source-status");
  if (!runs || !runs.length) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const latestBySource = new Map();
  for (const r of runs) {
    if (!latestBySource.has(r.source)) latestBySource.set(r.source, r);
  }
  const statsBySource = new Map((sourceStats || []).map((s) => [s.source, s]));

  // Header rows: which extractor / validator is currently running
  const extractorLine = extractor
    ? `<li class="extractor-line"><span>Extractor</span><span class="${extractor.mode === "llm" ? "ok" : ""}">${escapeHtml(extractor.mode)}${extractor.model ? ` · ${escapeHtml(extractor.model)}` : ""}</span></li>`
    : "";

  const validatorLine = validator
    ? `<li class="extractor-line"><span>Validator</span><span class="${validator.mode === "llm" ? "ok" : ""}">${escapeHtml(validator.mode)}${validator.model ? ` · ${escapeHtml(validator.model)}` : ""}</span></li>`
    : "";
  list.innerHTML = extractorLine + validatorLine + [...latestBySource.values()].map((r) => {
    const cls = r.error ? "err" : "ok";
    const detail = r.error
      ? `error: ${escapeHtml(r.error.slice(0, 40))}`
      : `+${r.inserted} new · ${r.fetched} scanned`;
    // Noise ratio: hidden / total rows this source has produced
    const stats = statsBySource.get(r.source);
    let noiseBadge = "";
    if (stats && stats.total > 0) {
      const ratio = stats.hidden / stats.total;
      const pct = Math.round(ratio * 100);
      const noiseCls = pct >= 30 ? "err" : pct >= 10 ? "warn" : "faint";
      noiseBadge = `<span class="noise ${noiseCls}" title="${stats.hidden} of ${stats.total} rows hidden">${pct}% hidden</span>`;
    }
    return `<li><span>${escapeHtml(r.source)}${noiseBadge}</span><span class="${cls}">${detail}</span></li>`;
  }).join("");
}

// ---------- data loading ----------
async function loadStatus() {
  try {
    const s = await api("/api/status");
    state.maxAgeDays = s.maxAgeDays || null;
    renderSourceStatus(s.recentRuns, s.sourceStats, s.extractor, s.validator);
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
    // Collect unique option lists for the filter dropdowns.
    const cuisineSet = new Set();
    const nbhdSet = new Set();
    for (const r of state.restaurants) {
      if (r.cuisine) cuisineSet.add(r.cuisine);
      for (const n of r.neighborhoods || []) if (n) nbhdSet.add(n);
    }
    state.options.cuisines = [...cuisineSet].sort();
    state.options.neighborhoods = [...nbhdSet].sort();
    refreshUI();
  } catch (e) {
    grid.innerHTML = `<div class="empty"><h3>Couldn't load restaurants.</h3><p>${escapeHtml(e.message)}</p></div>`;
  }
}

// ---------- events ----------
// Filter pill clicks toggle their dropdown
$$(".filter-pill-wrap").forEach((wrap) => {
  const filter = wrap.dataset.filter;
  const pill = wrap.querySelector(".filter-pill");
  pill.addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.openDropdown === filter) closeDropdown();
    else openDropdown(filter);
  });
});
// Click outside any dropdown closes it
document.addEventListener("click", (e) => {
  if (!state.openDropdown) return;
  if (!e.target.closest(".filter-pill-wrap")) closeDropdown();
});
// Esc closes the open dropdown
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDropdown();
});
// Clear Filters
$("#clear-filters").addEventListener("click", () => clearAllFilters());

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
