/* ===========================================================================
   SubTrack — Subscription Manager & Finance Analyzer
   Zero-dependency SPA. State persists in localStorage.
   =========================================================================== */

(() => {
  "use strict";

  const STORAGE_KEY = "subtrack.subscriptions.v1";
  const CURRENCY_KEY = "subtrack.currency.v1";

  /* ---------- State ---------- */
  let subs = load();
  let currency = localStorage.getItem(CURRENCY_KEY) || "USD";
  let currentView = "dashboard";
  let filterText = "";
  let filterStatus = "all";

  const CYCLE_PER_MONTH = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
  const CYCLE_DAYS = { weekly: 7, monthly: 30.44, quarterly: 91.31, yearly: 365.25 };
  const CATEGORY_COLORS = {
    Streaming: "#f87171", Music: "#34d399", Software: "#60a5fa", "Cloud / Storage": "#a78bfa",
    News: "#fbbf24", Gaming: "#f472b6", Fitness: "#2dd4bf", Utilities: "#fb923c",
    Productivity: "#818cf8", Education: "#38bdf8", Other: "#94a3b8",
  };

  /* ---------- Persistence ---------- */
  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
    localStorage.setItem(CURRENCY_KEY, currency);
  }

  /* ---------- Helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function fmt(amount) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
    } catch {
      return "$" + amount.toFixed(2);
    }
  }

  function monthlyCost(s) {
    return Number(s.cost) * (CYCLE_PER_MONTH[s.cycle] || 1);
  }
  function yearlyCost(s) { return monthlyCost(s) * 12; }

  function daysUntil(dateStr) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  }

  // Roll a past renewal date forward to its next occurrence so tracking stays accurate.
  function nextRenewal(s) {
    let d = new Date(s.renewal);
    const stepDays = CYCLE_DAYS[s.cycle] || 30.44;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let guard = 0;
    while (d < today && guard < 1000) {
      d = new Date(d.getTime() + stepDays * 86400000);
      guard++;
    }
    return d;
  }

  function activeSubs() { return subs.filter(s => s.status === "active"); }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, c => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => (t.hidden = true), 2400);
  }

  /* ---------- Views ---------- */
  const viewMeta = {
    dashboard: { title: "Dashboard", sub: "Your money at a glance" },
    subscriptions: { title: "Subscriptions", sub: "Everything you're paying for" },
    calendar: { title: "Upcoming Renewals", sub: "Never get surprised by a charge again" },
    analysis: { title: "Analysis", sub: "Smart insights on what to cut" },
  };

  function render() {
    document.querySelectorAll(".nav-item").forEach(b =>
      b.classList.toggle("active", b.dataset.view === currentView));
    $("#viewTitle").textContent = viewMeta[currentView].title;
    $("#viewSubtitle").textContent = viewMeta[currentView].sub;

    const el = $("#view");
    if (currentView === "dashboard") el.innerHTML = renderDashboard();
    else if (currentView === "subscriptions") el.innerHTML = renderSubscriptions();
    else if (currentView === "calendar") el.innerHTML = renderCalendar();
    else if (currentView === "analysis") el.innerHTML = renderAnalysis();

    wireViewEvents();
  }

  function emptyState(msg) {
    return `<div class="empty">
      <div class="empty-icon">📭</div>
      <h3>Nothing here yet</h3>
      <p>${msg}</p>
    </div>`;
  }

  /* ---------- Dashboard ---------- */
  function renderDashboard() {
    if (subs.length === 0) {
      return emptyState("Add your first subscription, or load demo data from the sidebar.");
    }
    const act = activeSubs();
    const totalMonthly = act.reduce((sum, s) => sum + monthlyCost(s), 0);
    const totalYearly = totalMonthly * 12;
    const upcoming = upcomingRenewals(30);
    const wasted = act.filter(s => s.usage === "never" || s.usage === "rarely")
      .reduce((sum, s) => sum + monthlyCost(s), 0);

    // Category breakdown
    const byCat = groupSum(act, s => s.category, monthlyCost);
    const byPay = groupSum(act, s => s.payment || "Unspecified", monthlyCost);

    return `
      <div class="grid metrics">
        ${metric("Monthly spend", fmt(totalMonthly), `${act.length} active subscription${act.length === 1 ? "" : "s"}`)}
        ${metric("Yearly spend", fmt(totalYearly), "projected over 12 months", "amber")}
        ${metric("Due in 30 days", fmt(upcoming.reduce((s, x) => s + Number(x.cost), 0)), `${upcoming.length} renewal${upcoming.length === 1 ? "" : "s"}`)}
        ${metric("Potential waste", fmt(wasted), "rarely/never used", wasted > 0 ? "red" : "green")}
      </div>

      <div class="grid two-col">
        <div class="card">
          <div class="section-title" style="margin-top:0">Spend by category</div>
          ${barChart(byCat, totalMonthly, true)}
        </div>
        <div class="card">
          <div class="section-title" style="margin-top:0">Spend by payment method</div>
          ${barChart(byPay, totalMonthly, false)}
        </div>
      </div>

      <div class="section-title">Next renewals</div>
      <div class="renewal-list">
        ${upcoming.slice(0, 5).map(renewalRow).join("") || `<p class="muted">No renewals in the next 30 days.</p>`}
      </div>
    `;
  }

  function metric(label, value, sub, cls = "") {
    return `<div class="card metric">
      <div class="metric-label">${label}</div>
      <div class="metric-value ${cls}">${value}</div>
      <div class="metric-sub">${sub}</div>
    </div>`;
  }

  function groupSum(items, keyFn, valFn) {
    const m = {};
    items.forEach(s => { const k = keyFn(s); m[k] = (m[k] || 0) + valFn(s); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }

  function barChart(entries, total, useCatColor) {
    if (!entries.length) return `<p class="muted">No data.</p>`;
    const max = Math.max(...entries.map(e => e[1]));
    return `<div class="bars">` + entries.map(([label, val]) => {
      const pct = max ? (val / max) * 100 : 0;
      const color = useCatColor ? (CATEGORY_COLORS[label] || "#94a3b8") : null;
      const share = total ? Math.round((val / total) * 100) : 0;
      return `<div class="bar-row">
        <div class="bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%${color ? `;background:${color}` : ""}"></div></div>
        <div class="bar-value">${fmt(val)} <span class="muted" style="font-weight:400">${share}%</span></div>
      </div>`;
    }).join("") + `</div>`;
  }

  /* ---------- Subscriptions table ---------- */
  function renderSubscriptions() {
    const rows = subs
      .filter(s => filterStatus === "all" || s.status === filterStatus)
      .filter(s => !filterText ||
        s.name.toLowerCase().includes(filterText) ||
        (s.category || "").toLowerCase().includes(filterText) ||
        (s.payment || "").toLowerCase().includes(filterText))
      .sort((a, b) => monthlyCost(b) - monthlyCost(a));

    const toolbar = `
      <div class="toolbar">
        <input class="input search" id="searchInput" placeholder="🔍 Search name, category, payment…" value="${escapeHtml(filterText)}" />
        <select class="select" id="statusFilter">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select class="select" id="currencySelect" title="Display currency">
          ${["USD", "EUR", "GBP", "AUD", "CAD", "JPY", "INR", "SGD"].map(c =>
            `<option ${c === currency ? "selected" : ""}>${c}</option>`).join("")}
        </select>
      </div>`;

    if (subs.length === 0) return toolbar + emptyState("Click “+ Add subscription” to start tracking.");

    const body = rows.map(s => {
      const nr = nextRenewal(s);
      const dleft = daysUntil(nr.toISOString());
      const color = CATEGORY_COLORS[s.category] || "#94a3b8";
      return `<tr data-id="${s.id}">
        <td><div class="cell-name"><span class="dot" style="background:${color}"></span>${escapeHtml(s.name)}</div></td>
        <td>${escapeHtml(s.category)}</td>
        <td>${fmt(Number(s.cost))}<span class="muted"> /${s.cycle.slice(0, 2)}</span></td>
        <td>${fmt(monthlyCost(s))}</td>
        <td>${escapeHtml(s.payment || "—")}</td>
        <td>${s.status === "active" ? nr.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ` <span class="muted">(${dleft}d)</span>` : "—"}</td>
        <td><span class="badge ${s.status}">${s.status}</span></td>
      </tr>`;
    }).join("");

    return toolbar + `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Name</th><th>Category</th><th>Cost</th><th>Per month</th>
            <th>Payment</th><th>Renews</th><th>Status</th>
          </tr></thead>
          <tbody>${body || `<tr><td colspan="7" class="muted" style="text-align:center;padding:30px">No matches.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  /* ---------- Renewals / calendar ---------- */
  function upcomingRenewals(days) {
    return activeSubs()
      .map(s => ({ ...s, _next: nextRenewal(s), _days: daysUntil(nextRenewal(s).toISOString()) }))
      .filter(s => s._days >= 0 && s._days <= days)
      .sort((a, b) => a._next - b._next);
  }

  function renewalRow(s) {
    const nr = s._next || nextRenewal(s);
    const dleft = s._days != null ? s._days : daysUntil(nr.toISOString());
    const badge = dleft <= 3 ? `<span class="badge due">${dleft === 0 ? "today" : dleft + "d"}</span>`
      : dleft <= 7 ? `<span class="badge soon">${dleft}d</span>` : `<span class="muted">${dleft}d</span>`;
    return `<div class="renewal-item" data-id="${s.id}">
      <div class="renewal-date">
        <div class="day">${nr.getDate()}</div>
        <div class="mon">${nr.toLocaleDateString(undefined, { month: "short" })}</div>
      </div>
      <div class="renewal-main">
        <div class="r-name">${escapeHtml(s.name)} ${badge}</div>
        <div class="r-meta">${escapeHtml(s.category)} • ${escapeHtml(s.payment || "no payment method")}</div>
      </div>
      <div class="renewal-amt">${fmt(Number(s.cost))}</div>
    </div>`;
  }

  function renderCalendar() {
    const act = activeSubs();
    if (act.length === 0) return emptyState("No active subscriptions to track renewals for.");
    const next90 = act
      .map(s => ({ ...s, _next: nextRenewal(s), _days: daysUntil(nextRenewal(s).toISOString()) }))
      .sort((a, b) => a._next - b._next);

    const buckets = [
      ["This week", next90.filter(s => s._days <= 7)],
      ["This month", next90.filter(s => s._days > 7 && s._days <= 30)],
      ["Later", next90.filter(s => s._days > 30)],
    ];

    return buckets.map(([label, items]) => {
      if (!items.length) return "";
      const sum = items.reduce((s, x) => s + Number(x.cost), 0);
      return `<div class="section-title">${label} <span class="muted" style="font-weight:500">· ${fmt(sum)}</span></div>
        <div class="renewal-list">${items.map(renewalRow).join("")}</div>`;
    }).join("") || emptyState("No upcoming renewals.");
  }

  /* ---------- Analysis ---------- */
  function renderAnalysis() {
    const act = activeSubs();
    if (act.length === 0) return emptyState("Add active subscriptions to get cut-down recommendations.");

    const insights = [];
    const totalMonthly = act.reduce((s, x) => s + monthlyCost(x), 0);

    // 1. Never/rarely used
    const unused = act.filter(s => s.usage === "never" || s.usage === "rarely")
      .sort((a, b) => monthlyCost(b) - monthlyCost(a));
    unused.forEach(s => {
      insights.push({
        cls: "danger", icon: "🛑",
        title: `Cancel “${s.name}”? You marked it “${s.usage}”.`,
        body: `Saves ${fmt(yearlyCost(s))}/year (${fmt(monthlyCost(s))}/mo).`,
        cta: fmt(yearlyCost(s)) + "/yr", id: s.id,
      });
    });

    // 2. Duplicate categories (overlapping services)
    const catGroups = {};
    act.forEach(s => { (catGroups[s.category] ||= []).push(s); });
    Object.entries(catGroups).forEach(([cat, items]) => {
      if (items.length >= 2 && ["Streaming", "Music", "Cloud / Storage", "News"].includes(cat)) {
        const sum = items.reduce((a, b) => a + monthlyCost(b), 0);
        insights.push({
          cls: "warn", icon: "🔁",
          title: `${items.length} ${cat} services overlap`,
          body: `${items.map(i => i.name).join(", ")} — ${fmt(sum)}/mo total. Consider keeping just one.`,
          cta: fmt(sum) + "/mo",
        });
      }
    });

    // 3. Annual switch opportunity — flag pricey monthly subs
    act.filter(s => s.cycle === "monthly" && monthlyCost(s) >= 8).forEach(s => {
      const potential = yearlyCost(s) * 0.15; // assume ~15% annual discount
      insights.push({
        cls: "good", icon: "📅",
        title: `Switch “${s.name}” to annual billing`,
        body: `Annual plans often save ~15%. That's roughly ${fmt(potential)}/year on this one.`,
        cta: "~" + fmt(potential) + "/yr", id: s.id,
      });
    });

    // 4. Biggest expense
    const biggest = [...act].sort((a, b) => monthlyCost(b) - monthlyCost(a))[0];
    if (biggest) {
      insights.push({
        cls: "warn", icon: "💰",
        title: `“${biggest.name}” is your biggest subscription`,
        body: `${fmt(monthlyCost(biggest))}/mo — ${Math.round(monthlyCost(biggest) / totalMonthly * 100)}% of your total spend.`,
        cta: fmt(monthlyCost(biggest)) + "/mo", id: biggest.id,
      });
    }

    const potentialSavings = unused.reduce((s, x) => s + yearlyCost(x), 0);

    const summary = `
      <div class="grid metrics">
        ${metric("Total subscriptions", String(act.length), "currently active")}
        ${metric("Identified savings", fmt(potentialSavings), "per year if you cut unused", potentialSavings > 0 ? "green" : "")}
        ${metric("Avg per subscription", fmt(totalMonthly / act.length), "monthly", "amber")}
      </div>`;

    const cards = insights.map(i => `
      <div class="insight ${i.cls}" ${i.id ? `data-id="${i.id}"` : ""} style="${i.id ? "cursor:pointer" : ""}">
        <div class="insight-icon">${i.icon}</div>
        <div class="insight-body">
          <h4>${escapeHtml(i.title)}</h4>
          <p>${escapeHtml(i.body)}</p>
        </div>
        <div class="insight-cta">${i.cta || ""}</div>
      </div>`).join("");

    return summary + `<div class="section-title">Recommendations</div>` +
      (cards || `<div class="insight good"><div class="insight-icon">✅</div><div class="insight-body"><h4>Looking lean!</h4><p>No obvious waste detected. Nicely optimized.</p></div></div>`);
  }

  /* ---------- Event wiring ---------- */
  function wireViewEvents() {
    document.querySelectorAll("[data-id]").forEach(row => {
      row.addEventListener("click", () => openModal(subs.find(s => s.id === row.dataset.id)));
    });
    const search = $("#searchInput");
    if (search) search.addEventListener("input", e => {
      filterText = e.target.value.toLowerCase();
      const pos = e.target.selectionStart;
      render();
      const ns = $("#searchInput"); if (ns) { ns.focus(); ns.setSelectionRange(pos, pos); }
    });
    const sf = $("#statusFilter");
    if (sf) { sf.value = filterStatus; sf.addEventListener("change", e => { filterStatus = e.target.value; render(); }); }
    const cs = $("#currencySelect");
    if (cs) cs.addEventListener("change", e => { currency = e.target.value; save(); render(); });
  }

  /* ---------- Modal ---------- */
  function openModal(sub) {
    const editing = !!sub;
    $("#modalTitle").textContent = editing ? "Edit subscription" : "Add subscription";
    $("#deleteBtn").hidden = !editing;
    $("#f-id").value = sub?.id || "";
    $("#f-name").value = sub?.name || "";
    $("#f-cost").value = sub?.cost ?? "";
    $("#f-cycle").value = sub?.cycle || "monthly";
    $("#f-renewal").value = sub?.renewal || new Date().toISOString().slice(0, 10);
    $("#f-category").value = sub?.category || "Streaming";
    $("#f-payment").value = sub?.payment || "";
    $("#f-status").value = sub?.status || "active";
    $("#f-usage").value = sub?.usage || "weekly";
    $("#f-notes").value = sub?.notes || "";

    // payment autocomplete
    const dl = $("#paymentList");
    dl.innerHTML = [...new Set(subs.map(s => s.payment).filter(Boolean))]
      .map(p => `<option value="${escapeHtml(p)}">`).join("");

    $("#modalOverlay").hidden = false;
    setTimeout(() => $("#f-name").focus(), 50);
  }
  function closeModal() { $("#modalOverlay").hidden = true; }

  function handleSubmit(e) {
    e.preventDefault();
    const id = $("#f-id").value;
    const data = {
      id: id || uid(),
      name: $("#f-name").value.trim(),
      cost: parseFloat($("#f-cost").value) || 0,
      cycle: $("#f-cycle").value,
      renewal: $("#f-renewal").value,
      category: $("#f-category").value,
      payment: $("#f-payment").value.trim(),
      status: $("#f-status").value,
      usage: $("#f-usage").value,
      notes: $("#f-notes").value.trim(),
    };
    if (!data.name) return;
    if (id) {
      const i = subs.findIndex(s => s.id === id);
      subs[i] = data;
      toast("Updated " + data.name);
    } else {
      subs.push(data);
      toast("Added " + data.name);
    }
    save();
    closeModal();
    render();
  }

  function deleteSub() {
    const id = $("#f-id").value;
    if (!id) return;
    const s = subs.find(x => x.id === id);
    if (!confirm(`Delete “${s.name}”? This can't be undone.`)) return;
    subs = subs.filter(x => x.id !== id);
    save();
    closeModal();
    render();
    toast("Deleted " + s.name);
  }

  /* ---------- Import / export ---------- */
  function exportData() {
    const blob = new Blob([JSON.stringify({ currency, subscriptions: subs }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subtrack-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Exported " + subs.length + " subscriptions");
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const list = Array.isArray(parsed) ? parsed : parsed.subscriptions;
        if (!Array.isArray(list)) throw new Error("bad format");
        // normalize & assign ids if missing
        subs = list.map(s => ({
          id: s.id || uid(),
          name: s.name || "Untitled",
          cost: Number(s.cost) || 0,
          cycle: s.cycle || "monthly",
          renewal: s.renewal || new Date().toISOString().slice(0, 10),
          category: s.category || "Other",
          payment: s.payment || "",
          status: s.status || "active",
          usage: s.usage || "weekly",
          notes: s.notes || "",
        }));
        if (parsed.currency) currency = parsed.currency;
        save();
        render();
        toast("Imported " + subs.length + " subscriptions");
      } catch {
        toast("⚠ Could not read that file");
      }
    };
    reader.readAsText(file);
  }

  /* ---------- Demo data ---------- */
  function seedDemo() {
    if (subs.length && !confirm("This replaces your current data with demo subscriptions. Continue?")) return;
    const today = new Date();
    const d = offset => new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
    subs = [
      { name: "Netflix", cost: 15.49, cycle: "monthly", renewal: d(4), category: "Streaming", payment: "Visa ••4242", status: "active", usage: "weekly", notes: "" },
      { name: "Spotify", cost: 11.99, cycle: "monthly", renewal: d(12), category: "Music", payment: "Visa ••4242", status: "active", usage: "daily", notes: "" },
      { name: "Disney+", cost: 13.99, cycle: "monthly", renewal: d(2), category: "Streaming", payment: "Mastercard ••8810", status: "active", usage: "rarely", notes: "Haven't watched in months" },
      { name: "iCloud+ 2TB", cost: 9.99, cycle: "monthly", renewal: d(20), category: "Cloud / Storage", payment: "Apple Pay", status: "active", usage: "daily", notes: "" },
      { name: "Adobe Creative Cloud", cost: 59.99, cycle: "monthly", renewal: d(8), category: "Software", payment: "Mastercard ••8810", status: "active", usage: "weekly", notes: "" },
      { name: "Amazon Prime", cost: 139, cycle: "yearly", renewal: d(45), category: "Streaming", payment: "Visa ••4242", status: "active", usage: "monthly", notes: "" },
      { name: "ChatGPT Plus", cost: 20, cycle: "monthly", renewal: d(15), category: "Productivity", payment: "Visa ••4242", status: "active", usage: "daily", notes: "" },
      { name: "NYTimes", cost: 17, cycle: "monthly", renewal: d(25), category: "News", payment: "PayPal", status: "active", usage: "never", notes: "Forgot I had this" },
      { name: "Notion", cost: 96, cycle: "yearly", renewal: d(120), category: "Productivity", payment: "PayPal", status: "active", usage: "weekly", notes: "" },
      { name: "Gym Membership", cost: 39.99, cycle: "monthly", renewal: d(6), category: "Fitness", payment: "Bank transfer", status: "active", usage: "rarely", notes: "" },
      { name: "Xbox Game Pass", cost: 16.99, cycle: "monthly", renewal: d(18), category: "Gaming", payment: "Mastercard ••8810", status: "paused", usage: "monthly", notes: "" },
      { name: "Dropbox", cost: 119.88, cycle: "yearly", renewal: d(200), category: "Cloud / Storage", payment: "PayPal", status: "cancelled", usage: "never", notes: "Replaced by iCloud" },
    ].map(s => ({ id: uid(), ...s }));
    currency = "USD";
    save();
    render();
    toast("Loaded demo data");
  }

  /* ---------- Global events ---------- */
  document.querySelectorAll(".nav-item").forEach(b =>
    b.addEventListener("click", () => { currentView = b.dataset.view; render(); }));
  $("#addBtn").addEventListener("click", () => openModal(null));
  $("#modalClose").addEventListener("click", closeModal);
  $("#cancelBtn").addEventListener("click", closeModal);
  $("#subForm").addEventListener("submit", handleSubmit);
  $("#deleteBtn").addEventListener("click", deleteSub);
  $("#modalOverlay").addEventListener("click", e => { if (e.target.id === "modalOverlay") closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#modalOverlay").hidden) closeModal(); });
  $("#exportBtn").addEventListener("click", exportData);
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", e => { if (e.target.files[0]) importData(e.target.files[0]); });
  $("#seedBtn").addEventListener("click", seedDemo);

  /* ---------- Boot ---------- */
  render();
})();
