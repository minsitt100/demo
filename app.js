(() => {
  const content = document.getElementById('content');
  const layout = document.querySelector('.layout');
  const toggleBtn = document.getElementById('toggle-nav');

  toggleBtn.addEventListener('click', () => layout.classList.toggle('nav-collapsed'));

  const invoices = [
    {
      id: 'inv-1',
      vendor: 'Acme Supplies Co.',
      number: 'INV-2041',
      amount: '$1,248.50',
      date: 'May 8, 2026',
      status: 'new',
      cta: 'Review & Save',
      pdf: 'invoice-2041.pdf',
      autopopulate: {
        'rs-inv-number': { value: 'INV-2041', search: 'INV-2041' },
        'rs-inv-date': { value: '2026-05-08', search: 'May 8, 2026' },
        'rs-due-date': { value: '2026-06-07', search: 'Jun 7, 2026' },
        'rs-amount': { value: '1248.50', search: '$1,248.50', occurrence: 'last' },
      },
    },
  ];

  const routes = {
    overview: renderOverview,
    inbox: renderInbox,
    documents: () => placeholder('Documents'),
    'review-save': renderReviewSave,
    vendors: () => placeholder('Vendors'),
    approvals: () => placeholder('Approvals'),
    bills: () => placeholder('Bills'),
    'payments-out': () => placeholder('Payments Out'),
    customers: () => placeholder('Customers'),
    items: () => placeholder('Items'),
    estimates: () => placeholder('Estimates'),
    invoices: () => placeholder('Invoices'),
    'payments-in': () => placeholder('Payments In'),
    reports: () => placeholder('Reports'),
    settings: () => placeholder('Settings'),
    help: () => placeholder('Help Center'),
  };

  document.querySelectorAll('.nav-item').forEach((el) => {
    el.addEventListener('click', () => {
      const route = el.dataset.route;
      navigate(route);
    });
  });

  function setActive(route) {
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.route === route);
    });
  }

  function navigate(route, ctx) {
    const fn = routes[route] || routes.overview;
    // Highlight parent route in nav for the split view
    setActive(route === 'review-save' ? 'inbox' : route);
    content.innerHTML = '';
    fn(ctx);
  }

  // ===== Overview =====
  const DEFAULT_OVERVIEW_ORDER = ['bills-to-pay', 'open-invoices', 'bill-approvals', 'payments-in', 'payments-out'];
  let overviewOrder = (() => {
    try {
      const stored = JSON.parse(localStorage.getItem('overview-order'));
      if (Array.isArray(stored)
          && stored.length === DEFAULT_OVERVIEW_ORDER.length
          && DEFAULT_OVERVIEW_ORDER.every((id) => stored.includes(id))) {
        return stored;
      }
    } catch (e) {}
    return DEFAULT_OVERVIEW_ORDER.slice();
  })();
  let customizing = false;

  function moveControls(id, index) {
    const upDisabled = index === 0 ? 'disabled' : '';
    const downDisabled = index === overviewOrder.length - 1 ? 'disabled' : '';
    return `
      <div class="move-controls">
        <button class="move-btn" data-move="up" data-id="${id}" ${upDisabled} aria-label="Move up">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
        <button class="move-btn" data-move="down" data-id="${id}" ${downDisabled} aria-label="Move down">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
    `;
  }

  function headerAction(id, index, defaultAction) {
    return customizing ? moveControls(id, index) : defaultAction;
  }

  const cardRenderers = {
    'bills-to-pay': (id, index) => `
      <section class="card${customizing ? ' card--customizing' : ''}">
        <div class="card-header">
          <h2 class="card-title">Bills to Pay
            <span class="info-icon" title="Bills awaiting payment">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </span>
          </h2>
          ${headerAction(id, index, `<button class="btn" data-action="pay">Pay</button>`)}
        </div>
        <div class="kpi-row kpi-row--flat">
          <div class="kpi kpi-urgent"><div class="kpi-label">Overdue</div><div class="kpi-value">$0</div><div class="kpi-sub">0 BILLS</div></div>
          <div class="kpi kpi-warning"><div class="kpi-label">Due 7 Days</div><div class="kpi-value">$0</div><div class="kpi-sub">0 BILLS</div></div>
          <div class="kpi"><div class="kpi-label">Due 7+ Days</div><div class="kpi-value">$0</div><div class="kpi-sub">0 BILLS</div></div>
          <div class="kpi"><div class="kpi-label">Total to pay</div><div class="kpi-value">$0</div><div class="kpi-sub">0 BILLS</div></div>
        </div>
      </section>
    `,
    'open-invoices': (id, index) => `
      <section class="card${customizing ? ' card--customizing' : ''}">
        <div class="card-header">
          <h2 class="card-title">Open Invoices</h2>
          ${headerAction(id, index, `<button class="btn" data-action="create-invoice">Create Invoice</button>`)}
        </div>
        <div class="kpi-row kpi-row--flat">
          <div class="kpi kpi-urgent"><div class="kpi-label">Overdue</div><div class="kpi-value">$0</div><div class="kpi-sub">0 INVOICES</div></div>
          <div class="kpi kpi-warning"><div class="kpi-label">Due 7 Days</div><div class="kpi-value">$0</div><div class="kpi-sub">0 INVOICES</div></div>
          <div class="kpi"><div class="kpi-label">Due 7+ Days</div><div class="kpi-value">$0</div><div class="kpi-sub">0 INVOICES</div></div>
          <div class="kpi"><div class="kpi-label">Total owed</div><div class="kpi-value">$0</div><div class="kpi-sub">0 INVOICES</div></div>
        </div>
      </section>
    `,
    'bill-approvals': (id, index) => `
      <section class="card${customizing ? ' card--customizing' : ''}">
        <div class="card-header">
          <h2 class="card-title">Bill Approvals</h2>
          ${headerAction(id, index, `
            <label class="toggle">
              <input type="checkbox" id="assigned-to-me" />
              <span class="toggle-track"></span>
              Assigned to me
            </label>
          `)}
        </div>
        <table class="approvals-table">
          <thead>
            <tr><th>Approver</th><th>0–5 Days</th><th>6–10 Days</th><th>10+ Days</th><th>Total</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Jane Doe</td>
              <td><div class="cell-count">0</div><button class="amount-link cell-amount" data-amount-link>$0</button></td>
              <td><div class="cell-count">0</div><button class="amount-link cell-amount" data-amount-link>$0</button></td>
              <td><div class="cell-count">0</div><button class="amount-link cell-amount" data-amount-link>$0</button></td>
              <td><div class="cell-count">0</div><button class="amount-link cell-amount" data-amount-link>$0</button></td>
            </tr>
            <tr>
              <td>Alex Kim</td>
              <td><div class="cell-count">0</div><button class="amount-link cell-amount" data-amount-link>$0</button></td>
              <td><div class="cell-count">0</div><button class="amount-link cell-amount" data-amount-link>$0</button></td>
              <td><div class="cell-count">0</div><button class="amount-link cell-amount" data-amount-link>$0</button></td>
              <td><div class="cell-count">0</div><button class="amount-link cell-amount" data-amount-link>$0</button></td>
            </tr>
          </tbody>
        </table>
      </section>
    `,
    'payments-in': (id, index) => `
      <section class="card${customizing ? ' card--customizing' : ''}">
        <div class="card-header">
          <h2 class="card-title">Payments In</h2>
          ${headerAction(id, index, `<button class="btn" data-action="get-paid">Get Paid</button>`)}
        </div>
        ${paymentsBlock({ todayFirst: true })}
      </section>
    `,
    'payments-out': (id, index) => `
      <section class="card${customizing ? ' card--customizing' : ''}">
        <div class="card-header">
          <h2 class="card-title">Payments Out</h2>
          ${customizing ? moveControls(id, index) : ''}
        </div>
        ${paymentsBlock()}
      </section>
    `,
  };

  function renderOverview() {
    content.innerHTML = `
      <div class="page-header">
        <button class="customize-btn" id="customize-toggle">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>${customizing ? 'Done Customizing' : 'Customize Overview'}</span>
        </button>
      </div>
      <div class="overview-grid">
        ${overviewOrder.map((id, i) => `
          <div class="overview-row">
            ${cardRenderers[id](id, i)}
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('customize-toggle').addEventListener('click', () => {
      customizing = !customizing;
      renderOverview();
    });

    content.querySelectorAll('[data-move]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const dir = e.currentTarget.dataset.move;
        const id = e.currentTarget.dataset.id;
        const idx = overviewOrder.indexOf(id);
        const target = dir === 'up' ? idx - 1 : idx + 1;
        if (target < 0 || target >= overviewOrder.length) return;
        [overviewOrder[idx], overviewOrder[target]] = [overviewOrder[target], overviewOrder[idx]];
        try { localStorage.setItem('overview-order', JSON.stringify(overviewOrder)); } catch (e) {}
        renderOverview();
      });
    });

    content.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        alert(`Action: ${e.currentTarget.dataset.action}`);
      });
    });

    content.querySelectorAll('[data-amount-link]').forEach((el) => {
      el.addEventListener('click', () => navigate('inbox'));
    });
  }

  function paymentsBlock({ todayFirst = false } = {}) {
    const upcomingLabel = `<div class="pay-block-label">Upcoming</div>`;
    const todayRow = `<div class="pay-row"><span class="pay-row-label">Today</span><button class="amount-link" data-amount-link>$0</button></div>`;
    const upcomingTop = todayFirst
      ? `${todayRow}${upcomingLabel}`
      : `${upcomingLabel}${todayRow}`;
    return `
      <div class="pay-section">
        <div>
          ${upcomingTop}
          <div class="pay-row"><span class="pay-row-label">Next 7 days</span><button class="amount-link" data-amount-link>$0</button></div>
          <div class="pay-row"><span class="pay-row-label">Next 30 days</span><button class="amount-link" data-amount-link>$0</button></div>
        </div>
        <div>
          <div class="pay-block-label">Past</div>
          <div class="pay-row"><span class="pay-row-label">Last 7 days</span><button class="amount-link" data-amount-link>$0</button></div>
          <div class="pay-row"><span class="pay-row-label">Last 30 days</span><button class="amount-link" data-amount-link>$0</button></div>
        </div>
      </div>
    `;
  }

  // ===== Inbox =====
  function renderInbox() {
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Inbox</h1>
          <div class="page-subtitle" style="color:var(--text-secondary);font-size:13px;">${invoices.length} invoices from your vendors</div>
        </div>
        <div class="page-header-actions">
          <span class="upload-status" id="upload-status"></span>
          <input type="file" id="upload-input" accept="application/pdf" multiple hidden />
          <button class="btn" id="upload-btn" type="button">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload Invoice
          </button>
        </div>
      </div>
      <div class="inbox-grid">
        ${invoices.map(invoiceCard).join('')}
      </div>
    `;

    content.querySelectorAll('[data-cta]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const cta = btn.dataset.cta;
        if (cta === 'Review & Save') {
          const inv = invoices.find((i) => i.id === id);
          navigate('review-save', inv);
        } else {
          alert(`Enter Bill for ${id}`);
        }
      });
    });

    const uploadBtn = document.getElementById('upload-btn');
    const input = document.getElementById('upload-input');
    const status = document.getElementById('upload-status');

    uploadBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => handleUploads(e.target.files, status));
  }

  async function handleUploads(fileList, statusEl) {
    const files = Array.from(fileList || []).filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (!files.length) {
      if (statusEl) statusEl.textContent = 'Only PDF files are supported.';
      return;
    }
    if (statusEl) statusEl.textContent = `Reading ${files.length} file${files.length > 1 ? 's' : ''}…`;
    try {
      for (const file of files) {
        const inv = await ingestUploadedPdf(file);
        invoices.unshift(inv);
      }
      if (statusEl) statusEl.textContent = `Imported ${files.length} invoice${files.length > 1 ? 's' : ''}.`;
      renderInbox();
    } catch (err) {
      console.error(err);
      if (statusEl) statusEl.textContent = 'Sorry, we had trouble reading that PDF.';
    }
  }

  async function ingestUploadedPdf(file) {
    const url = URL.createObjectURL(file);
    const pdf = await window.pdfjsLib.getDocument(url).promise;
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    const items = textContent.items.filter((it) => it.str && it.str.trim());

    const extracted = extractInvoiceFields(items);

    const numberLabel = extracted.autopop['rs-inv-number']?.value || file.name.replace(/\.pdf$/i, '');
    const amountVal = extracted.autopop['rs-amount']?.value;
    const formattedAmount = amountVal
      ? `$${Number(amountVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—';
    const isoInvDate = extracted.autopop['rs-inv-date']?.value;

    return {
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      vendor: extracted.vendor || file.name.replace(/\.pdf$/i, ''),
      number: numberLabel,
      amount: formattedAmount,
      date: isoInvDate ? formatDisplayDate(isoInvDate) : new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      status: 'new',
      cta: 'Review & Save',
      pdf: url,
      autopopulate: extracted.autopop,
      uploaded: true,
    };
  }

  function formatDisplayDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ===== Heuristic invoice extractor =====
  function extractInvoiceFields(items) {
    const autopop = {};

    // Invoice Number
    const invNum = findValueNearLabel(items, /^invoice\s*(#|no\.?|number)?\s*:?$/i, /[A-Za-z0-9][A-Za-z0-9-]{2,}/);
    if (invNum) {
      autopop['rs-inv-number'] = { value: invNum.str.trim(), search: invNum.str };
    } else {
      const fullText = items.map((it) => it.str).join(' ');
      const m = fullText.match(/\b(INV[-\s]?[A-Z0-9]{2,12})\b/i);
      if (m) autopop['rs-inv-number'] = { value: m[1].trim(), search: m[1] };
    }

    // Invoice Date
    const invDate = findValueNearLabel(
      items,
      /^(?:invoice\s*date|bill\s*date|date(?:\s*issued)?)\s*:?$/i,
      DATE_REGEX,
    );
    if (invDate) {
      const iso = parseDateToIso(invDate.str);
      if (iso) autopop['rs-inv-date'] = { value: iso, search: invDate.str };
    }

    // Due Date
    const dueDate = findValueNearLabel(
      items,
      /^(?:due\s*date|payment\s*due|date\s*due)\s*:?$/i,
      DATE_REGEX,
    );
    if (dueDate) {
      const iso = parseDateToIso(dueDate.str);
      if (iso) autopop['rs-due-date'] = { value: iso, search: dueDate.str };
    }

    // Amount — prefer "Total Due / Balance Due / Amount Due"; fall back to "Total"
    let total = findValueNearLabel(
      items,
      /^(?:total\s*due|balance\s*due|amount\s*due|grand\s*total)\s*:?$/i,
      AMOUNT_REGEX,
    );
    if (!total) {
      total = findValueNearLabel(items, /^total\s*:?$/i, AMOUNT_REGEX);
    }
    if (total) {
      const numeric = total.str.replace(/[^\d.]/g, '');
      autopop['rs-amount'] = { value: numeric, search: total.str, occurrence: 'last' };
    }

    // Vendor (best-effort): biggest text near the top that isn't a header word
    const vendor = guessVendor(items);

    return { autopop, vendor };
  }

  const DATE_REGEX = /(?:\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z.]*\s+\d{1,2},?\s+\d{4})/i;
  const AMOUNT_REGEX = /^\$?\s*[\d,]+\.\d{2}\s*$/;

  function findValueNearLabel(items, labelRegex, valueRegex) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const trimmed = it.str.trim().replace(/[: ]/g, '').trim();
      if (!labelRegex.test(trimmed) && !labelRegex.test(it.str.trim())) continue;

      const labelY = it.transform[5];
      const labelX = it.transform[4];
      const labelW = it.width || 0;
      const labelEnd = labelX + labelW;

      // 1) Same row, to the right
      const sameRow = items
        .map((c, j) => ({ c, j }))
        .filter(({ c, j }) => j !== i
          && Math.abs(c.transform[5] - labelY) < 4
          && c.transform[4] >= labelEnd - 2)
        .sort((a, b) => a.c.transform[4] - b.c.transform[4]);
      const sameRowMatch = pickByRegex(sameRow.map((x) => x.c), valueRegex);
      if (sameRowMatch) return sameRowMatch;

      // 2) Immediately below label, similar x
      const below = items
        .map((c, j) => ({ c, j }))
        .filter(({ c, j }) => j !== i
          && c.transform[5] < labelY
          && labelY - c.transform[5] < 28
          && Math.abs(c.transform[4] - labelX) < 60)
        .sort((a, b) => (labelY - a.c.transform[5]) - (labelY - b.c.transform[5]));
      const belowMatch = pickByRegex(below.map((x) => x.c), valueRegex);
      if (belowMatch) return belowMatch;
    }
    return null;
  }

  function pickByRegex(candidates, regex) {
    for (const c of candidates) {
      const s = c.str.trim();
      if (!s) continue;
      if (!regex || regex.test(s)) return c;
    }
    return null;
  }

  function parseDateToIso(str) {
    if (!str) return null;
    const cleaned = str.replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
    const d = new Date(cleaned);
    if (isNaN(d.getTime())) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function guessVendor(items) {
    // Look at items in the top quarter of the page; pick the longest non-header string with a tall font.
    if (!items.length) return null;
    const ys = items.map((it) => it.transform[5]);
    const maxY = Math.max(...ys);
    const minY = Math.min(...ys);
    const cutoff = maxY - (maxY - minY) * 0.2;
    const headers = /^(invoice|bill|receipt|statement|tax invoice|page \d+)$/i;
    const candidates = items
      .filter((it) => it.transform[5] >= cutoff
        && it.str.trim().length >= 4
        && !headers.test(it.str.trim())
        && !/^\d/.test(it.str.trim())
        && !/@/.test(it.str));
    if (!candidates.length) return null;
    candidates.sort((a, b) => (b.height || 0) - (a.height || 0) || b.str.length - a.str.length);
    return candidates[0].str.trim();
  }

  function invoiceCard(inv) {
    return `
      <article class="invoice-card">
        <div class="invoice-card-header">
          <div>
            <div class="invoice-vendor">${inv.vendor}</div>
            <div class="invoice-meta">${inv.number} • ${inv.date}</div>
          </div>
          <div class="invoice-amount">${inv.amount}</div>
        </div>
        <div class="invoice-card-foot">
          <span class="status-pill ${inv.status}">${inv.status === 'new' ? 'New' : 'Needs review'}</span>
          <button class="btn" data-cta="${inv.cta}" data-id="${inv.id}">${inv.cta}</button>
        </div>
      </article>
    `;
  }

  // ===== Review & Save split view =====
  function renderReviewSave(inv) {
    inv = inv || invoices[0];
    const hasAutopop = !!inv.autopopulate;
    content.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Review & Save</h1>
        <button class="btn btn-ghost" data-action="back">← Back to Inbox</button>
      </div>
      <div class="review-layout" id="review-layout">
        <svg class="arrow-svg" id="arrow-svg" aria-hidden="true"></svg>
        <div class="review-pdf">
          <div class="review-pdf-header">
            <span>${inv.number} — ${inv.vendor}</span>
            <span style="color:var(--text-secondary);font-size:12px;">PDF preview</span>
          </div>
          <div class="review-pdf-body" id="pdf-body">
            ${inv.pdf
              ? `<div class="pdf-canvas-wrap" id="pdf-canvas-wrap">
                   <div class="pdf-loading">Loading invoice…</div>
                 </div>`
              : `<div class="pdf-placeholder">
                   <div class="pdf-line short"></div>
                   <div class="pdf-line medium"></div>
                   <div class="pdf-spacer"></div>
                   <div class="pdf-line"></div>
                   <div class="pdf-line"></div>
                   <div class="pdf-line medium"></div>
                   <div class="pdf-caption">Invoice PDF will render here</div>
                 </div>`}
          </div>
        </div>

        <form class="review-form" id="review-form">
          <div class="review-form-inner">
            ${hasAutopop ? `
              <div class="autopop-banner" id="autopop-banner" role="status">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4L19 6"/></svg>
                <div class="autopop-banner-text">
                  <div>We've automatically filled some details for you!</div>
                  <div class="autopop-banner-hint">Tip: right-click any value in the invoice to send it to a field.</div>
                </div>
                <button type="button" class="autopop-dismiss" aria-label="Dismiss">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ` : ''}
            <div class="form-row cols-1">
              <div class="form-field">
                <label class="form-label" for="rs-vendor">Vendor Name</label>
                <input id="rs-vendor" class="form-input" type="text" value="${inv.vendor}" />
              </div>
            </div>
            <div class="form-row cols-2">
              <div class="form-field">
                <label class="form-label" for="rs-inv-number">Invoice Number</label>
                <input id="rs-inv-number" class="form-input" type="text" placeholder="INV-0000" />
              </div>
              <div class="form-field">
                <label class="form-label" for="rs-po-number">PO Number</label>
                <input id="rs-po-number" class="form-input" type="text" placeholder="PO-0000" />
              </div>
            </div>
            <div class="form-row cols-4">
              <div class="form-field">
                <label class="form-label" for="rs-payment-term">Payment Term</label>
                <select id="rs-payment-term" class="form-select">
                  <option>Net 30</option>
                  <option>Net 15</option>
                  <option>Net 60</option>
                  <option>Due on receipt</option>
                </select>
              </div>
              <div class="form-field">
                <label class="form-label" for="rs-inv-date">Invoice Date</label>
                <input id="rs-inv-date" class="form-input" type="date" />
              </div>
              <div class="form-field">
                <label class="form-label" for="rs-gl-date">GL Posting Date</label>
                <input id="rs-gl-date" class="form-input" type="date" />
              </div>
              <div class="form-field">
                <label class="form-label" for="rs-due-date">Due Date</label>
                <input id="rs-due-date" class="form-input" type="date" />
              </div>
            </div>
            <div class="form-row cols-2">
              <div class="form-field">
                <label class="form-label" for="rs-amount">Amount</label>
                <input id="rs-amount" class="form-input" type="number" step="0.01" placeholder="0.00" />
              </div>
              <div class="form-field">
                <label class="form-label" for="rs-bill-desc">Bill Description</label>
                <input id="rs-bill-desc" class="form-input" type="text" placeholder="Description" />
              </div>
            </div>

            <label class="checkbox-row">
              <input type="checkbox" />
              Use this for expense description.
            </label>

            <div class="expense-table-wrap">
              <div class="expense-table-title" id="expense-title">Expenses (USD 0.00)</div>
              <table class="expense-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Amount</th>
                    <th>Description</th>
                    <th><input type="checkbox" id="select-all" /></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><input type="text" placeholder="Select account" /></td>
                    <td><input type="number" class="expense-amount" step="0.01" placeholder="0.00" /></td>
                    <td><input type="text" placeholder="Description" /></td>
                    <td><input type="checkbox" class="row-check" /></td>
                  </tr>
                  <tr>
                    <td><input type="text" placeholder="Select account" /></td>
                    <td><input type="number" class="expense-amount" step="0.01" placeholder="0.00" /></td>
                    <td><input type="text" placeholder="Description" /></td>
                    <td><input type="checkbox" class="row-check" /></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="review-actions">
              <button type="button" class="btn btn-ghost" data-action="back">Cancel</button>
              <button type="submit" class="btn">Save</button>
            </div>
          </div>
        </form>
      </div>
    `;

    // Update expense title from Amount input
    const amountInput = content.querySelector('#rs-amount');
    const expenseTitle = content.querySelector('#expense-title');
    amountInput.addEventListener('input', () => {
      const v = parseFloat(amountInput.value) || 0;
      expenseTitle.textContent = `Expenses (USD ${v.toFixed(2)})`;
    });

    // Select-all checkbox
    const selectAll = content.querySelector('#select-all');
    selectAll.addEventListener('change', () => {
      content.querySelectorAll('.row-check').forEach((c) => (c.checked = selectAll.checked));
    });

    content.querySelectorAll('[data-action="back"]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        navigate('inbox');
      })
    );

    content.querySelector('#review-form').addEventListener('submit', (e) => {
      e.preventDefault();
      alert('Bill saved (placeholder).');
      navigate('inbox');
    });

    // Right-click anywhere on a PDF value (or drag-selection) → "Send to field" menu
    const pdfBodyEl = document.getElementById('pdf-body');
    if (pdfBodyEl) {
      pdfBodyEl.addEventListener('contextmenu', (e) => {
        let text = '';
        const sel = window.getSelection();
        if (sel && sel.toString().trim()) {
          text = sel.toString().trim();
        } else {
          // Fall back to the text span directly under the cursor
          const els = document.elementsFromPoint(e.clientX, e.clientY);
          const span = els.find((el) => el && el.dataset && el.dataset.pdfText);
          if (span) text = span.dataset.pdfText.trim();
        }
        if (!text) return; // nothing useful → default browser menu
        e.preventDefault();
        openSendToMenu(e.clientX, e.clientY, text);
      });
    }

    // Auto-populate form fields and flag them as autopop
    if (inv.autopopulate) {
      Object.entries(inv.autopopulate).forEach(([fieldId, info]) => {
        const el = document.getElementById(fieldId);
        if (el) {
          el.value = info.value;
          el.classList.add('autopop');
        }
      });
      // trigger amount-driven expense title
      amountInput.dispatchEvent(new Event('input'));

      const dismissBtn = content.querySelector('.autopop-dismiss');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
          const banner = content.querySelector('#autopop-banner');
          if (banner) banner.classList.add('autopop-banner--hidden');
        });
      }
    }

    // Render PDF + hotspots if a PDF is attached
    if (inv.pdf && typeof window.pdfjsLib !== 'undefined') {
      renderInvoicePdf(inv).catch((err) => console.error('PDF render failed', err));
    }
  }

  async function renderInvoicePdf(inv) {
    const pdfjs = window.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

    const wrap = document.getElementById('pdf-canvas-wrap');
    if (!wrap) return;

    const pdf = await pdfjs.getDocument(inv.pdf).promise;
    const page = await pdf.getPage(1);

    // Render canvas at a high fixed scale (for crisp text); CSS will downscale to fit container.
    const baseViewport = page.getViewport({ scale: 1 });
    const renderScale = Math.min(2 * (window.devicePixelRatio || 1), 4);
    const viewport = page.getViewport({ scale: renderScale });

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-canvas';
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    // Overlay covers the canvas exactly (via CSS inset:0 + aspect ratio on the wrap).
    const overlay = document.createElement('div');
    overlay.className = 'pdf-overlay';

    // Text layer is sized at viewport pixels and CSS-transform-scaled to fit.
    const textLayer = document.createElement('div');
    textLayer.className = 'pdf-text-layer';
    textLayer.style.width = viewport.width + 'px';
    textLayer.style.height = viewport.height + 'px';

    // Lock the wrap's aspect ratio to the page's aspect ratio so the overlay
    // covers exactly the same area as the canvas at any container width.
    wrap.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;

    wrap.innerHTML = '';
    wrap.appendChild(canvas);
    wrap.appendChild(textLayer);
    wrap.appendChild(overlay); // overlay last → on top of the text layer

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Build the text layer manually so spans are reliable + interactive.
    const textContent = await page.getTextContent();
    textContent.items.forEach((item) => {
      if (!item.str) return;
      const tx = pdfjs.Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.hypot(tx[2], tx[3]);
      const span = document.createElement('span');
      span.textContent = item.str;
      span.dataset.pdfText = item.str;
      span.style.left = tx[4] + 'px';
      span.style.top = (tx[5] - fontHeight) + 'px';
      span.style.fontSize = fontHeight + 'px';
      textLayer.appendChild(span);
    });

    // Hotspot positions are expressed as percentages of the viewport so they
    // stay aligned with the canvas at any rendered size.
    const autopop = inv.autopopulate || {};
    Object.entries(autopop).forEach(([fieldId, info]) => {
      const matches = textContent.items.filter((it) => it.str === info.search);
      if (!matches.length) return;
      const item = info.occurrence === 'last' ? matches[matches.length - 1] : matches[0];

      const tx = pdfjs.Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.hypot(tx[2], tx[3]);
      const textWidth = item.width * renderScale;
      const padX = 4 * (renderScale / 1.5);
      const padY = 3 * (renderScale / 1.5);

      const leftPct = ((tx[4] - padX) / viewport.width) * 100;
      const topPct = ((tx[5] - fontHeight - padY) / viewport.height) * 100;
      const widthPct = ((textWidth + 2 * padX) / viewport.width) * 100;
      const heightPct = ((fontHeight + 2 * padY) / viewport.height) * 100;

      const hotspot = document.createElement('div');
      hotspot.className = 'pdf-hotspot';
      hotspot.style.left = leftPct + '%';
      hotspot.style.top = topPct + '%';
      hotspot.style.width = widthPct + '%';
      hotspot.style.height = heightPct + '%';
      hotspot.dataset.target = fieldId;
      hotspot.title = info.search;
      overlay.appendChild(hotspot);

      hotspot.addEventListener('mouseenter', () => drawArrow(hotspot, fieldId));
      hotspot.addEventListener('mouseleave', () => clearArrow());
    });

    // Keep the text layer's scale in sync with the rendered canvas width.
    function syncTextLayerScale() {
      const renderedWidth = wrap.clientWidth;
      if (!renderedWidth) return;
      const s = renderedWidth / viewport.width;
      textLayer.style.transformOrigin = '0 0';
      textLayer.style.transform = `scale(${s})`;
    }
    syncTextLayerScale();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(syncTextLayerScale);
      ro.observe(wrap);
    }

    // Redraw arrow on scroll or resize while a hotspot is hovered.
    const reviewForm = document.getElementById('review-form');
    const pdfBody = document.getElementById('pdf-body');
    const redrawIfHovering = () => {
      if (!currentArrowFieldId) return;
      const hs = overlay.querySelector(`.pdf-hotspot[data-target="${currentArrowFieldId}"]`);
      if (hs) drawArrow(hs, currentArrowFieldId);
    };
    [reviewForm, pdfBody].forEach((target) => target.addEventListener('scroll', redrawIfHovering, true));
    window.addEventListener('scroll', redrawIfHovering, true);
    window.addEventListener('resize', redrawIfHovering);
  }

  const FORM_FIELDS = [
    { id: 'rs-vendor', label: 'Vendor Name' },
    { id: 'rs-inv-number', label: 'Invoice Number' },
    { id: 'rs-po-number', label: 'PO Number' },
    { id: 'rs-payment-term', label: 'Payment Term' },
    { id: 'rs-inv-date', label: 'Invoice Date' },
    { id: 'rs-gl-date', label: 'GL Posting Date' },
    { id: 'rs-due-date', label: 'Due Date' },
    { id: 'rs-amount', label: 'Amount' },
    { id: 'rs-bill-desc', label: 'Bill Description' },
  ];

  function openSendToMenu(x, y, text) {
    closeSendToMenu();
    const menu = document.createElement('div');
    menu.className = 'send-menu';
    menu.id = 'send-menu';
    menu.innerHTML = `
      <div class="send-menu-header">Send <span class="send-menu-text">"${escapeHtml(truncate(text, 40))}"</span> to:</div>
      ${FORM_FIELDS.map((f) => `<button type="button" class="send-menu-item" data-field="${f.id}">${f.label}</button>`).join('')}
    `;
    document.body.appendChild(menu);

    // Position; clamp to viewport.
    const rect = menu.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    menu.querySelectorAll('.send-menu-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        sendToField(btn.dataset.field, text);
        closeSendToMenu();
      });
    });

    // Dismiss on outside click / escape / scroll
    setTimeout(() => {
      document.addEventListener('mousedown', onOutsideClick);
      document.addEventListener('keydown', onMenuKey);
      window.addEventListener('scroll', closeSendToMenu, true);
    }, 0);
  }
  function onOutsideClick(e) {
    const menu = document.getElementById('send-menu');
    if (menu && !menu.contains(e.target)) closeSendToMenu();
  }
  function onMenuKey(e) {
    if (e.key === 'Escape') closeSendToMenu();
  }
  function closeSendToMenu() {
    const menu = document.getElementById('send-menu');
    if (menu) menu.remove();
    document.removeEventListener('mousedown', onOutsideClick);
    document.removeEventListener('keydown', onMenuKey);
    window.removeEventListener('scroll', closeSendToMenu, true);
  }

  function sendToField(fieldId, raw) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    const text = raw.trim();

    if (el.tagName === 'SELECT') {
      // Try to match an option by text
      const lower = text.toLowerCase();
      const match = Array.from(el.options).find((o) => o.text.toLowerCase() === lower);
      if (match) el.value = match.value;
    } else if (el.type === 'date') {
      const iso = parseDateToIso(text);
      el.value = iso || text;
    } else if (el.type === 'number') {
      const cleaned = text.replace(/[^\d.\-]/g, '');
      el.value = cleaned;
    } else {
      el.value = text;
    }

    el.classList.add('autopop', 'field-flash');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => el.classList.remove('field-flash'), 700);
    el.focus({ preventScroll: false });
  }

  function truncate(s, max) {
    if (!s) return '';
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let currentArrowFieldId = null;
  function drawArrow(fromEl, toId) {
    const toEl = document.getElementById(toId);
    const svg = document.getElementById('arrow-svg');
    const layout = document.getElementById('review-layout');
    if (!toEl || !svg || !layout) return;
    currentArrowFieldId = toId;

    const layoutRect = layout.getBoundingClientRect();
    svg.setAttribute('width', layoutRect.width);
    svg.setAttribute('height', layoutRect.height);
    svg.setAttribute('viewBox', `0 0 ${layoutRect.width} ${layoutRect.height}`);

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const fromX = fromRect.right - layoutRect.left;
    const fromY = (fromRect.top + fromRect.bottom) / 2 - layoutRect.top;
    const toX = toRect.left - layoutRect.left;
    const toY = (toRect.top + toRect.bottom) / 2 - layoutRect.top;

    svg.innerHTML = `
      <line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}"
            stroke="var(--secondary)" stroke-width="2" />
      <circle cx="${fromX}" cy="${fromY}" r="3" fill="var(--secondary)" />
      <circle cx="${toX}" cy="${toY}" r="7" fill="var(--bg)" stroke="var(--secondary)" stroke-width="2" />
      <circle cx="${toX}" cy="${toY}" r="2.5" fill="var(--secondary)" />
    `;
    svg.classList.add('visible');
  }
  function clearArrow() {
    currentArrowFieldId = null;
    const svg = document.getElementById('arrow-svg');
    if (!svg) return;
    svg.innerHTML = '';
    svg.classList.remove('visible');
  }

  // ===== Placeholder =====
  function placeholder(name) {
    content.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">${name}</h1>
      </div>
      <div class="placeholder">
        <h2>${name}</h2>
        <p>This section is a placeholder.</p>
      </div>
    `;
  }

  navigate('overview');
})();
