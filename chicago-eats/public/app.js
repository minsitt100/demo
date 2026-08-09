// ---------- state ----------
const state = {
  status: "",
  source: "",
  limit: 25,
  offset: 0,
  total: 0,
  items: [],
  sources: [],
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
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isFresh(iso) {
  if (!iso) return false;
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  return diff < 60 * 60 * 24 * 3; // 3 days
}

// Restaurant names extracted from the article body — shown as a chip row
// so the user can see the specific places without clicking through.
function renderMentionedChips(item) {
  let list = [];
  try {
    list = item.restaurants_mentioned ? JSON.parse(item.restaurants_mentioned) : [];
  } catch { list = []; }
  // Drop the guessed restaurant if it's already the same as the card
  // title's restaurant (avoid dupes).
  if (item.restaurant) {
    const r = item.restaurant.toLowerCase();
    list = list.filter((x) => x.name.toLowerCase() !== r);
  }
  if (!list.length) return "";
  return `
    <div class="mentioned">
      <span class="mentioned-label">Restaurants:</span>
      <span class="mentioned-chips">
        ${list.slice(0, 8).map((r) => `<span class="mchip">${escapeHtml(r.name)}</span>`).join("")}
        ${list.length > 8 ? `<span class="mchip mchip-more">+${list.length - 8} more</span>` : ""}
      </span>
    </div>
  `;
}

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
function renderFeed(replace = true) {
  const feed = $("#feed");
  if (replace) feed.innerHTML = "";

  if (!state.items.length && replace) {
    feed.innerHTML = `
      <div class="empty">
        <h3>Nothing here yet.</h3>
        <p>Try hitting <strong>Refresh</strong> to pull the latest from every source.</p>
      </div>
    `;
    return;
  }

  const slice = replace ? state.items : state.items.slice(state.items.length - state.limit);
  for (const item of slice) {
    feed.appendChild(renderCard(item));
  }
}

function renderCard(item) {
  const el = document.createElement("article");
  el.className = "card" + (item.image_url ? "" : " no-image");
  el.dataset.id = item.id;

  const statusBadge =
    item.status === "upcoming"
      ? `<span class="badge upcoming">Coming soon</span>`
      : `<span class="badge now">Now open</span>`;
  const freshBadge = isFresh(item.published_at) ? `<span class="badge new">New</span>` : "";

  el.innerHTML = `
    ${item.image_url ? `
      <a class="card-thumb" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">
        <img loading="lazy" src="${escapeHtml(item.image_url)}" alt="" onerror="this.parentElement.remove(); this.closest('.card').classList.add('no-image');" />
      </a>` : ""}
    <div class="card-body">
      <div class="card-meta">
        ${statusBadge}
        ${freshBadge}
        <span class="source-pill">${escapeHtml(item.source_label)}</span>
        <span class="dot-sep">${escapeHtml(relativeTime(item.published_at || item.seen_at))}</span>
      </div>
      ${item.restaurant ? `<div class="card-restaurant">${escapeHtml(item.restaurant)}</div>` : ""}
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">
        <h3 class="card-title">${escapeHtml(item.title)}</h3>
      </a>
      ${item.summary ? `<p class="card-summary">${escapeHtml(item.summary)}</p>` : ""}
      ${renderMentionedChips(item)}
      <div class="card-actions">
        <span class="neighborhood">${item.neighborhood ? escapeHtml(item.neighborhood) : "Chicago"}</span>
        <button class="icon-btn" title="Hide from feed" aria-label="Hide" data-hide="${item.id}">✕</button>
      </div>
    </div>
  `;

  el.querySelector("[data-hide]")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    await hide(item.id);
    el.style.transition = "opacity 200ms, transform 200ms";
    el.style.opacity = "0";
    el.style.transform = "translateX(20px)";
    setTimeout(() => el.remove(), 200);
  });
  return el;
}

function renderCounts() {
  const window = state.maxAgeDays ? ` · past ${state.maxAgeDays} days` : "";
  $("#counts").textContent =
    `${state.total} opening${state.total === 1 ? "" : "s"} tracked${window}`;
}

function renderSourceFilters() {
  const wrap = $("#source-filters");
  wrap.innerHTML =
    `<button class="chip is-active" data-source="">All sources</button>` +
    state.sources
      .map((s) => `<button class="chip" data-source="${escapeHtml(s.id)}">${escapeHtml(s.label)}</button>`)
      .join("");
  $$(".chip", wrap).forEach((btn) => {
    btn.addEventListener("click", () => {
      state.source = btn.dataset.source;
      $$(".chip", wrap).forEach((b) => b.classList.toggle("is-active", b === btn));
      state.offset = 0;
      loadFeed(true);
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
    const label = state.sources.find((s) => s.id === r.source)?.label || r.source;
    const detail = r.error
      ? `error: ${escapeHtml(r.error.slice(0, 40))}`
      : `+${r.inserted} new (${r.fetched} scanned)`;
    return `<li>
      <span>${escapeHtml(label)}</span>
      <span class="${cls}">${detail}</span>
    </li>`;
  }).join("");
}

// ---------- data loading ----------
async function loadStatus() {
  try {
    const s = await api("/api/status");
    state.sources = s.sources || [];
    state.total = s.total || 0;
    state.maxAgeDays = s.maxAgeDays || null;
    renderSourceFilters();
    renderCounts();
    renderSourceStatus(s.recentRuns);
    if (s.recentRuns?.[0]?.finished_at) {
      $("#last-updated").textContent = "Updated " + relativeTime(s.recentRuns[0].finished_at);
    }
  } catch (e) {
    console.warn("status failed", e);
  }
}

async function loadFeed(replace = true) {
  const feed = $("#feed");
  if (replace) {
    feed.innerHTML = `<div class="loading">Loading openings…</div>`;
  }
  const qs = new URLSearchParams({
    limit: state.limit,
    offset: state.offset,
    ...(state.status ? { status: state.status } : {}),
    ...(state.source ? { source: state.source } : {}),
  });
  try {
    const res = await api(`/api/openings?${qs}`);
    state.total = res.total;
    if (res.maxAgeDays) state.maxAgeDays = res.maxAgeDays;
    if (replace) state.items = res.items;
    else state.items = state.items.concat(res.items);
    renderFeed(replace);
    renderCounts();
    $("#load-more").hidden = state.items.length >= state.total;
  } catch (e) {
    feed.innerHTML = `<div class="empty"><h3>Couldn't load the feed.</h3><p>${escapeHtml(e.message)}</p></div>`;
  }
}

async function hide(id) {
  try { await api(`/api/openings/${id}/hide`, { method: "POST" }); } catch (e) { console.warn(e); }
}

// ---------- events ----------
$$('.filter-group [data-status]').forEach((btn) => {
  btn.addEventListener("click", () => {
    state.status = btn.dataset.status;
    $$('.filter-group [data-status]').forEach((b) => b.classList.toggle("is-active", b === btn));
    state.offset = 0;
    loadFeed(true);
  });
});

$("#refresh-btn").addEventListener("click", async () => {
  const btn = $("#refresh-btn");
  btn.classList.add("is-loading");
  btn.disabled = true;
  try {
    const res = await api("/api/refresh", { method: "POST" });
    toast(res.inserted ? `+${res.inserted} new` : "Up to date");
    state.offset = 0;
    await loadFeed(true);
    await loadStatus();
  } catch (e) {
    toast("Refresh failed");
    console.warn(e);
  } finally {
    btn.classList.remove("is-loading");
    btn.disabled = false;
  }
});

$("#load-more").addEventListener("click", async () => {
  state.offset += state.limit;
  await loadFeed(false);
});

// ---------- boot ----------
(async () => {
  await loadStatus();
  await loadFeed(true);
})();
