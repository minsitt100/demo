(() => {
  const content = document.getElementById('content');
  const layout = document.querySelector('.layout');
  const toggleBtn = document.getElementById('toggle-nav');

  toggleBtn.addEventListener('click', () => layout.classList.toggle('nav-collapsed'));

  const invoices = [
    { id: 'inv-1', vendor: 'Acme Supplies Co.', number: 'INV-2041', amount: '$1,248.50', date: 'May 8, 2026', status: 'new', cta: 'Review & Save' },
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
  function renderOverview() {
    content.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Overview</h1>
      </div>
      <div class="overview-grid">
        <div class="overview-row">
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">Bills to Pay
              <span class="info-icon" title="Bills awaiting payment">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </span>
            </h2>
            <button class="btn" data-action="pay">Pay</button>
          </div>
          <div class="kpi-row">
            <div class="kpi kpi-urgent">
              <div class="kpi-label">Overdue</div>
              <div class="kpi-value">$0</div>
            </div>
            <div class="kpi kpi-warning">
              <div class="kpi-label">Due 7 Days</div>
              <div class="kpi-value">$0</div>
            </div>
            <div class="kpi">
              <div class="kpi-label">Due 7+ Days</div>
              <div class="kpi-value">$0</div>
            </div>
            <div class="kpi">
              <div class="kpi-label">Total to pay</div>
              <div class="kpi-value">$0</div>
              <div class="kpi-sub">0 bills</div>
            </div>
          </div>
        </section>

        </div>
        <div class="overview-row">
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">Open Invoices</h2>
            <button class="btn" data-action="create-invoice">Create Invoice</button>
          </div>
          <div class="kpi-row">
            <div class="kpi kpi-urgent">
              <div class="kpi-label">Overdue</div>
              <div class="kpi-value">$0</div>
            </div>
            <div class="kpi kpi-warning">
              <div class="kpi-label">Due 7 Days</div>
              <div class="kpi-value">$0</div>
            </div>
            <div class="kpi">
              <div class="kpi-label">Due 7+ Days</div>
              <div class="kpi-value">$0</div>
            </div>
            <div class="kpi">
              <div class="kpi-label">Total owed</div>
              <div class="kpi-value">$0</div>
              <div class="kpi-sub">0 invoices</div>
            </div>
          </div>
        </section>

        </div>
        <div class="overview-row">
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">Bill Approvals</h2>
            <label class="toggle">
              <input type="checkbox" id="assigned-to-me" />
              <span class="toggle-track"></span>
              Assigned to me
            </label>
          </div>
          <table class="approvals-table">
            <thead>
              <tr>
                <th>Approver</th>
                <th>0–5 Days</th>
                <th>6–10 Days</th>
                <th>10+ Days</th>
                <th>Total</th>
              </tr>
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

        </div>
        <div class="overview-row">
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">Payments In</h2>
            <button class="btn" data-action="get-paid">Get Paid</button>
          </div>
          ${paymentsBlock()}
        </section>

        <section class="card">
          <div class="card-header">
            <h2 class="card-title">Payments Out</h2>
          </div>
          ${paymentsBlock()}
        </section>
        </div>
      </div>
    `;

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
    content.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Review & Save</h1>
        <button class="btn btn-ghost" data-action="back">← Back to Inbox</button>
      </div>
      <div class="review-layout">
        <div class="review-pdf">
          <div class="review-pdf-header">
            <span>${inv.number} — ${inv.vendor}</span>
            <span style="color:var(--text-secondary);font-size:12px;">PDF preview</span>
          </div>
          <div class="review-pdf-body">
            <div class="pdf-placeholder">
              <div class="pdf-line short"></div>
              <div class="pdf-line medium"></div>
              <div class="pdf-spacer"></div>
              <div class="pdf-line"></div>
              <div class="pdf-line"></div>
              <div class="pdf-line medium"></div>
              <div class="pdf-spacer"></div>
              <div class="pdf-line short"></div>
              <div class="pdf-line"></div>
              <div class="pdf-line medium"></div>
              <div class="pdf-caption">Invoice PDF will render here</div>
            </div>
          </div>
        </div>

        <form class="review-form" id="review-form">
          <div class="review-form-inner">
            <div class="form-row cols-1">
              <div class="form-field">
                <label class="form-label">Vendor Name</label>
                <input class="form-input" type="text" value="${inv.vendor}" />
              </div>
            </div>
            <div class="form-row cols-2">
              <div class="form-field">
                <label class="form-label">Invoice Number</label>
                <input class="form-input" type="text" value="${inv.number}" />
              </div>
              <div class="form-field">
                <label class="form-label">PO Number</label>
                <input class="form-input" type="text" placeholder="PO-0000" />
              </div>
            </div>
            <div class="form-row cols-4">
              <div class="form-field">
                <label class="form-label">Payment Term</label>
                <select class="form-select">
                  <option>Net 30</option>
                  <option>Net 15</option>
                  <option>Net 60</option>
                  <option>Due on receipt</option>
                </select>
              </div>
              <div class="form-field">
                <label class="form-label">Invoice Date</label>
                <input class="form-input" type="date" />
              </div>
              <div class="form-field">
                <label class="form-label">GL Posting Date</label>
                <input class="form-input" type="date" />
              </div>
              <div class="form-field">
                <label class="form-label">Due Date</label>
                <input class="form-input" type="date" />
              </div>
            </div>
            <div class="form-row cols-2">
              <div class="form-field">
                <label class="form-label">Amount</label>
                <input class="form-input" type="number" id="amount-input" step="0.01" placeholder="0.00" />
              </div>
              <div class="form-field">
                <label class="form-label">Bill Description</label>
                <input class="form-input" type="text" placeholder="Description" />
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
    const amountInput = content.querySelector('#amount-input');
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
