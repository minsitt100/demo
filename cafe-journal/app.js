// ============ state ============
let cafes = Store.load();
let dream = Store.loadDream();
let editingId = null;
let formBuckets = { menu: [], vibe: [], brand: [] };
let activePaletteTab = "menu";

// ============ tiny helpers ============
const $  = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const uid = () => Math.random().toString(36).slice(2, 10);
const fmtDate = (d) => {
  if (!d) return "";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return d; }
};

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 1600);
}

function beansHtml(score, size = 14) {
  const full = Math.floor(score);
  const half = score - full >= 0.5;
  let html = '<span class="beans">';
  for (let i = 1; i <= 5; i++) {
    let cls = "bean";
    if (i <= full) cls += " is-filled";
    else if (i === full + 1 && half) cls += " is-half";
    html += `<span class="${cls}" style="width:${size}px;height:${size}px"></span>`;
  }
  html += "</span>";
  return html;
}

// ============ tab switcher ============
$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    $$(".tab").forEach((t) => t.classList.toggle("is-active", t === tab));
    $$(".view").forEach((v) =>
      v.classList.toggle("is-active", v.dataset.view === target)
    );
    if (target === "build") renderPalette();
    if (target === "insights") renderInsights();
  });
});

// ============ My Cafes ============
function renderCafes() {
  const grid = $("#cafe-grid");
  const empty = $("#cafes-empty");
  grid.innerHTML = "";
  if (!cafes.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  const sorted = [...cafes].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  for (const c of sorted) {
    const score = Insights.cafeScore(c);
    const tags = [
      ...(c.menu || []).slice(0, 2),
      ...(c.vibe || []).slice(0, 1),
    ];
    const card = document.createElement("article");
    card.className = "cafe-card";
    card.innerHTML = `
      <h3>${escapeHtml(c.name)}</h3>
      <div class="meta">${escapeHtml(c.location || "")} ${c.date ? "· " + fmtDate(c.date) : ""}</div>
      <div class="overall">${beansHtml(score)} <span style="font-size:13px;color:var(--ink-soft);margin-left:4px">${score.toFixed(1)}</span></div>
      <div class="tags">
        ${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
      </div>
    `;
    card.addEventListener("click", () => openDetail(c.id));
    grid.appendChild(card);
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}

// ============ Add / Edit modal ============
const cafeModal = $("#cafe-modal");
const cafeForm = $("#cafe-form");

function openAdd() {
  editingId = null;
  formBuckets = { menu: [], vibe: [], brand: [] };
  $("#modal-title").textContent = "A new cafe";
  $("#modal-sub").textContent = "Take a breath, then jot it down.";
  cafeForm.reset();
  const today = new Date().toISOString().slice(0, 10);
  cafeForm.elements["date"].value = today;
  renderRatingInputs({});
  renderChipBuckets();
  cafeModal.hidden = false;
  setTimeout(() => cafeForm.elements["name"].focus(), 100);
}

function openEdit(id) {
  const c = cafes.find((x) => x.id === id);
  if (!c) return;
  editingId = id;
  formBuckets = {
    menu: [...(c.menu || [])],
    vibe: [...(c.vibe || [])],
    brand: [...(c.brand || [])],
  };
  $("#modal-title").textContent = "Edit a memory";
  $("#modal-sub").textContent = "Tidy up the details.";
  cafeForm.elements["name"].value = c.name || "";
  cafeForm.elements["location"].value = c.location || "";
  cafeForm.elements["date"].value = c.date || "";
  cafeForm.elements["note"].value = c.note || "";
  renderRatingInputs(c.ratings || {});
  renderChipBuckets();
  cafeModal.hidden = false;
}

function closeCafeModal() { cafeModal.hidden = true; }

$("#add-cafe-btn").addEventListener("click", openAdd);
document.addEventListener("click", (e) => {
  if (e.target.matches("[data-action='open-add']")) openAdd();
  if (e.target.matches("[data-close]")) {
    cafeModal.hidden = true;
    $("#detail-modal").hidden = true;
  }
});

// rating inputs ------------------------
function renderRatingInputs(initial) {
  const grid = $("#rating-grid");
  grid.innerHTML = "";
  for (const dim of RATING_DIMENSIONS) {
    const row = document.createElement("div");
    row.className = "rating-row";
    const val = initial[dim.key] || 0;
    row.innerHTML = `
      <span class="label">${dim.label}</span>
      <span class="bean-input" data-dim="${dim.key}" data-val="${val}">
        ${[1,2,3,4,5].map(i =>
          `<span class="bean ${i <= val ? "is-filled" : ""}" data-i="${i}"></span>`
        ).join("")}
      </span>
    `;
    grid.appendChild(row);
  }
  $$(".bean-input", grid).forEach((bi) => {
    bi.addEventListener("click", (e) => {
      const i = +e.target.dataset.i;
      if (!i) return;
      const current = +bi.dataset.val;
      // tap same bean to clear
      const next = current === i ? 0 : i;
      bi.dataset.val = next;
      $$(".bean", bi).forEach((b) => {
        b.classList.toggle("is-filled", +b.dataset.i <= next);
      });
    });
  });
}

// chip buckets ------------------------
function renderChipBuckets() {
  for (const bucket of ["menu", "vibe", "brand"]) {
    const wrap = $(`.chips[data-bucket="${bucket}"]`);
    wrap.innerHTML = "";
    for (const item of formBuckets[bucket]) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.dataset.bucket = bucket;
      chip.innerHTML = `${escapeHtml(item)} <span class="x" aria-label="remove">×</span>`;
      chip.querySelector(".x").addEventListener("click", () => {
        formBuckets[bucket] = formBuckets[bucket].filter((x) => x !== item);
        renderChipBuckets();
      });
      wrap.appendChild(chip);
    }
  }
}

$$(".chip-input").forEach((inp) => {
  inp.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault();
    const val = inp.value.trim();
    if (!val) return;
    const bucket = inp.dataset.bucket;
    if (!formBuckets[bucket].includes(val)) {
      formBuckets[bucket].push(val);
      renderChipBuckets();
    }
    inp.value = "";
  });
  inp.addEventListener("blur", () => {
    const val = inp.value.trim();
    if (!val) return;
    const bucket = inp.dataset.bucket;
    if (!formBuckets[bucket].includes(val)) {
      formBuckets[bucket].push(val);
      renderChipBuckets();
    }
    inp.value = "";
  });
});

// submit ------------------------
cafeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(cafeForm);
  const ratings = {};
  $$(".bean-input").forEach((bi) => {
    const v = +bi.dataset.val;
    if (v > 0) ratings[bi.dataset.dim] = v;
  });
  const cafe = {
    id: editingId || uid(),
    name: data.get("name").toString().trim(),
    location: data.get("location").toString().trim(),
    date: data.get("date").toString(),
    note: data.get("note").toString().trim(),
    ratings,
    menu: [...formBuckets.menu],
    vibe: [...formBuckets.vibe],
    brand: [...formBuckets.brand],
  };
  if (!cafe.name) return;

  if (editingId) {
    cafes = cafes.map((c) => (c.id === editingId ? cafe : c));
    toast("Updated");
  } else {
    cafes.push(cafe);
    toast("Saved");
  }
  Store.save(cafes);
  closeCafeModal();
  renderCafes();
});

// ============ Detail modal ============
function openDetail(id) {
  const c = cafes.find((x) => x.id === id);
  if (!c) return;
  const body = $("#detail-body");
  const score = Insights.cafeScore(c);
  body.innerHTML = `
    <div class="detail">
      <h2>${escapeHtml(c.name)}</h2>
      <div class="meta">${escapeHtml(c.location || "")} ${c.date ? "· " + fmtDate(c.date) : ""}</div>

      <div class="overall" style="margin-bottom:8px">
        ${beansHtml(score, 16)}
        <span style="margin-left:8px;color:var(--ink-soft);font-size:14px">
          ${score.toFixed(1)} overall
        </span>
      </div>

      <div class="detail-section">
        <h4>Ratings</h4>
        <div class="detail-ratings">
          ${RATING_DIMENSIONS.filter(d => c.ratings?.[d.key]).map(d => `
            <div class="row-r">
              <span>${d.label}</span>
              ${beansHtml(c.ratings[d.key])}
            </div>
          `).join("")}
        </div>
      </div>

      ${["menu","vibe","brand"].filter(b => (c[b] || []).length).map(b => `
        <div class="detail-section">
          <h4>${BUCKET_LABELS[b]}</h4>
          <div class="detail-chips">
            ${c[b].map(t => `<span class="chip" data-bucket="${b}">${escapeHtml(t)}</span>`).join("")}
          </div>
        </div>
      `).join("")}

      ${c.note ? `
        <div class="detail-section">
          <h4>Note</h4>
          <div class="detail-note">${escapeHtml(c.note)}</div>
        </div>
      ` : ""}

      <div class="detail-actions">
        <button class="btn danger" data-act="delete">Delete</button>
        <div style="display:flex;gap:8px">
          <button class="btn ghost" data-act="edit">Edit</button>
          <button class="btn primary" data-act="close">Close</button>
        </div>
      </div>
    </div>
  `;
  body.querySelector('[data-act="delete"]').addEventListener("click", () => {
    if (!confirm(`Delete "${c.name}"?`)) return;
    cafes = cafes.filter((x) => x.id !== id);
    Store.save(cafes);
    $("#detail-modal").hidden = true;
    renderCafes();
    toast("Deleted");
  });
  body.querySelector('[data-act="edit"]').addEventListener("click", () => {
    $("#detail-modal").hidden = true;
    openEdit(id);
  });
  body.querySelector('[data-act="close"]').addEventListener("click", () => {
    $("#detail-modal").hidden = true;
  });
  $("#detail-modal").hidden = false;
}

// ============ Build a Cafe ============
function renderPalette() {
  $$(".ptab").forEach((t) => t.classList.toggle("is-active", t.dataset.ptab === activePaletteTab));
  const body = $("#palette-body");
  body.innerHTML = "";
  if (!cafes.length) {
    body.innerHTML = `<p style="font-family:'Caveat',cursive;color:var(--ink-faint)">Add cafes first to build a palette.</p>`;
    renderDream();
    return;
  }

  // group items by cafe within the active bucket
  const takenSet = new Set(dream[activePaletteTab].map((d) => d.text.toLowerCase()));
  const sortedCafes = [...cafes].sort((a, b) => Insights.cafeScore(b) - Insights.cafeScore(a));
  for (const c of sortedCafes) {
    const items = c[activePaletteTab] || [];
    if (!items.length) continue;
    const group = document.createElement("div");
    group.className = "palette-cafe";
    group.innerHTML = `
      <h5>${escapeHtml(c.name)}</h5>
      <div class="palette-items">
        ${items.map((t) => {
          const taken = takenSet.has(t.toLowerCase());
          return `<button class="palette-chip ${taken ? "is-taken" : ""}"
                          data-text="${escapeHtml(t)}"
                          data-from="${escapeHtml(c.name)}"
                          data-cafe="${c.id}">${escapeHtml(t)}</button>`;
        }).join("")}
      </div>
    `;
    body.appendChild(group);
  }

  $$(".palette-chip", body).forEach((btn) => {
    btn.addEventListener("click", () => {
      addToDream(activePaletteTab, btn.dataset.text, btn.dataset.from);
    });
  });

  renderDream();
}

$$(".ptab").forEach((t) =>
  t.addEventListener("click", () => {
    activePaletteTab = t.dataset.ptab;
    renderPalette();
  })
);

function addToDream(bucket, text, from) {
  if (dream[bucket].some((d) => d.text.toLowerCase() === text.toLowerCase())) return;
  dream[bucket].push({ text, from });
  Store.saveDream(dream);
  renderPalette();
}

function removeFromDream(bucket, text) {
  dream[bucket] = dream[bucket].filter((d) => d.text.toLowerCase() !== text.toLowerCase());
  Store.saveDream(dream);
  renderPalette();
}

function renderDream() {
  $("#dream-name").value = dream.name || "";
  for (const bucket of ["menu", "vibe", "brand"]) {
    const list = $(`#dream-${bucket === "brand" ? "brand" : bucket}`);
    list.innerHTML = "";
    for (const item of dream[bucket]) {
      const li = document.createElement("li");
      li.className = "dream-item";
      li.dataset.bucket = bucket;
      li.innerHTML = `
        ${escapeHtml(item.text)}
        <span class="from">from ${escapeHtml(item.from)}</span>
        <span class="x" aria-label="remove">×</span>
      `;
      li.querySelector(".x").addEventListener("click", () => removeFromDream(bucket, item.text));
      list.appendChild(li);
    }
  }
  renderSuggestions();
}

$("#dream-name").addEventListener("input", (e) => {
  dream.name = e.target.value;
  Store.saveDream(dream);
});

$("#reset-dream").addEventListener("click", () => {
  if (!confirm("Clear your dream cafe?")) return;
  dream = { name: "", menu: [], vibe: [], brand: [] };
  Store.saveDream(dream);
  renderPalette();
});

function renderSuggestions() {
  const wrap = $("#suggestions");
  const list = $("#suggestion-list");
  const sugs = Insights.suggestForDream(cafes, dream);
  if (!sugs.length || cafes.length < 2) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  list.innerHTML = "";
  for (const s of sugs) {
    const li = document.createElement("li");
    li.className = "sug";
    li.innerHTML = `
      <div>
        <div class="sug-text">
          <strong>${escapeHtml(s.text)}</strong>
          <span style="color:var(--ink-faint);font-size:12px"> · ${BUCKET_LABELS[s.bucket]}</span>
        </div>
        <div class="sug-why">${escapeHtml(s.reason)} · from ${escapeHtml(s.from)}</div>
      </div>
      <button class="sug-add">＋ Add</button>
    `;
    li.querySelector(".sug-add").addEventListener("click", () => {
      addToDream(s.bucket, s.text, s.from);
      toast("Added to your cafe");
    });
    list.appendChild(li);
  }
}

// ============ Insights ============
function renderInsights() {
  const root = $("#insights");
  root.innerHTML = "";
  if (cafes.length < 2) {
    root.innerHTML = `
      <div class="insight-card">
        <div class="kicker">just getting started</div>
        <h3>Add a couple of cafes</h3>
        <p class="body">Once you've rated a few places, little patterns start to bloom here.</p>
      </div>
    `;
    return;
  }

  // 1. taste signature
  const top = Insights.topDimensions(cafes, 4);
  const sig = document.createElement("div");
  sig.className = "insight-card";
  sig.innerHTML = `
    <div class="kicker">your taste signature</div>
    <h3>What you care about most</h3>
    <p class="body">Average rating you give across the cafes you've visited.</p>
    ${top.map((d) => `
      <div class="bar">
        <span class="bar-label">${d.label}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(d.score / 5) * 100}%"></span></span>
        <span class="bar-val">${d.score.toFixed(1)}</span>
      </div>
    `).join("")}
  `;
  root.appendChild(sig);

  // 2. recurring tokens
  const tokens = Insights.recurringTokens(cafes);
  if (tokens.length) {
    const card = document.createElement("div");
    card.className = "insight-card";
    card.innerHTML = `
      <div class="kicker">things you keep loving</div>
      <h3>Recurring details</h3>
      <p class="body" style="margin-bottom:10px">
        These showed up at more than one cafe you rated highly.
      </p>
      <div class="detail-chips">
        ${tokens.slice(0, 12).map(t => `
          <span class="chip" data-bucket="${t.bucket}" title="${t.cafes.join(", ")}">
            ${escapeHtml(t.label)} <span style="opacity:0.5">·${t.count}</span>
          </span>
        `).join("")}
      </div>
    `;
    root.appendChild(card);
  }

  // 3. a "you might build…" prompt
  const lovedCafe = [...cafes].sort((a, b) => Insights.cafeScore(b) - Insights.cafeScore(a))[0];
  if (lovedCafe) {
    const hint = document.createElement("div");
    hint.className = "insight-card";
    hint.innerHTML = `
      <div class="kicker">a little nudge</div>
      <h3>Build from <em>${escapeHtml(lovedCafe.name)}</em></h3>
      <p class="body">
        It's your highest-rated cafe so far — head to <strong>Build a Cafe</strong>
        and start with its menu and vibe as a base.
      </p>
    `;
    root.appendChild(hint);
  }

  // 4. cafes-by-month-ish (count card)
  const count = document.createElement("div");
  count.className = "insight-card";
  count.innerHTML = `
    <div class="kicker">notebook so far</div>
    <h3>${cafes.length} cafe${cafes.length === 1 ? "" : "s"}</h3>
    <p class="body">
      Average overall:
      <strong>${
        (cafes.reduce((s, c) => s + Insights.cafeScore(c), 0) / cafes.length).toFixed(2)
      }</strong> beans.
    </p>
  `;
  root.appendChild(count);
}

// ============ keyboard niceties ============
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    cafeModal.hidden = true;
    $("#detail-modal").hidden = true;
  }
});

// ============ first paint ============
renderCafes();
renderPalette();
