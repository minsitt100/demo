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
    { id: 'inv-2', vendor: 'Northwind Logistics', number: 'INV-7732', amount: '$612.00', date: 'May 6, 2026', status: 'new', cta: 'Review & Save' },
    { id: 'inv-3', vendor: 'Globex Software', number: 'INV-1188', amount: '$3,400.00', date: 'May 4, 2026', status: 'review', cta: 'Enter Bill' },
    { id: 'inv-4', vendor: 'Initech Cloud', number: 'INV-0099', amount: '$89.99', date: 'May 1, 2026', status: 'new', cta: 'Review & Save' },
    { id: 'inv-5', vendor: 'Hooli Hosting', number: 'INV-5520', amount: '$215.75', date: 'Apr 29, 2026', status: 'review', cta: 'Enter Bill' },
    { id: 'inv-6', vendor: 'Stark Industries', number: 'INV-3301', amount: '$12,800.00', date: 'Apr 28, 2026', status: 'new', cta: 'Review & Save' },
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
        ${paymentsBlock()}
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

  function paymentsBlock() {
    return `
      <div class="pay-section">
        <div>
          <div class="pay-block-label">Upcoming</div>
          <div class="pay-row"><span class="pay-row-label">Today</span><button class="amount-link" data-amount-link>$0</button></div>
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
        <h1 class="page-title">Inbox</h1>
        <div class="page-subtitle" style="color:var(--text-secondary);font-size:13px;">${invoices.length} invoices from your vendors</div>
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
                <span>We've automatically filled some details for you!</span>
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

    const baseViewport = page.getViewport({ scale: 1 });
    const containerWidth = wrap.clientWidth - 32; // padding allowance
    const scale = Math.max(0.5, Math.min(2.5, containerWidth / baseViewport.width));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-canvas';
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    const overlay = document.createElement('div');
    overlay.className = 'pdf-overlay';
    overlay.style.width = viewport.width + 'px';
    overlay.style.height = viewport.height + 'px';

    wrap.innerHTML = '';
    wrap.appendChild(canvas);
    wrap.appendChild(overlay);

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Build a text layer so users can select / copy text from the PDF
    const textContent = await page.getTextContent();
    const textLayer = document.createElement('div');
    textLayer.className = 'pdf-text-layer';
    textLayer.style.width = viewport.width + 'px';
    textLayer.style.height = viewport.height + 'px';
    wrap.appendChild(textLayer);

    if (typeof pdfjs.renderTextLayer === 'function') {
      pdfjs.renderTextLayer({
        textContentSource: textContent,
        container: textLayer,
        viewport,
        textDivs: [],
      });
    }

    // Place hotspots over the auto-populated values
    const autopop = inv.autopopulate || {};
    Object.entries(autopop).forEach(([fieldId, info]) => {
      const matches = textContent.items.filter((it) => it.str === info.search);
      if (!matches.length) return;
      const item = info.occurrence === 'last' ? matches[matches.length - 1] : matches[0];

      const tx = pdfjs.Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.hypot(tx[2], tx[3]);
      const textWidth = item.width * scale;
      const left = tx[4];
      const top = tx[5] - fontHeight;

      const hotspot = document.createElement('div');
      hotspot.className = 'pdf-hotspot';
      hotspot.style.left = (left - 4) + 'px';
      hotspot.style.top = (top - 2) + 'px';
      hotspot.style.width = (textWidth + 8) + 'px';
      hotspot.style.height = (fontHeight + 4) + 'px';
      hotspot.dataset.target = fieldId;
      hotspot.title = info.search;
      overlay.appendChild(hotspot);

      hotspot.addEventListener('mouseenter', () => drawArrow(hotspot, fieldId));
      hotspot.addEventListener('mouseleave', () => clearArrow());
    });

    // Redraw arrow on scroll inside either panel
    const reviewForm = document.getElementById('review-form');
    const pdfBody = document.getElementById('pdf-body');
    [reviewForm, pdfBody, window].forEach((target) => {
      target.addEventListener('scroll', () => {
        const hoveredId = currentArrowFieldId;
        if (hoveredId) {
          const hs = overlay.querySelector(`.pdf-hotspot[data-target="${hoveredId}"]`);
          if (hs) drawArrow(hs, hoveredId);
        }
      }, true);
    });
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

    // Curved path for a softer look
    const midX = (fromX + toX) / 2;
    const c1 = `${midX},${fromY}`;
    const c2 = `${midX},${toY}`;

    svg.innerHTML = `
      <path d="M ${fromX} ${fromY} C ${c1} ${c2} ${toX} ${toY}"
            fill="none" stroke="var(--secondary)" stroke-width="2" stroke-dasharray="5 4" />
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
