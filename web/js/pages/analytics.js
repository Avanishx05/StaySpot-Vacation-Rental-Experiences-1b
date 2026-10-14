// Screen 3.4 - Analytics: 7-day moving average chart, DENSE_RANK() table, materialized-view summary + refresh.
import { api } from "../api.js";
import { money, dateTime } from "../format.js";
import { colors } from "../theme.js";
import { h, replace, button, setBusy, card, banner, empty, errorState, loading, tableWrap, latest } from "../dom.js";
import { propertyPicker } from "./_picker.js";

export function render({ view, query }) {
  let chart = null;
  const runSummary = latest(), runRank = latest(), runChart = latest();
  const picker = propertyPicker({ id: query.get("property") || "", onChange: () => loadChart() });
  const from = h("input", { type: "date", "aria-label": "From date", onChange: () => loadChart() });
  const to = h("input", { type: "date", "aria-label": "To date", onChange: () => loadChart() });
  const rankDate = h("input", { type: "date", "aria-label": "Ranking date", onChange: () => loadRank() });
  const stamp = h("span", { class: "muted" });
  const refreshBtn = button("Refresh view", { onClick: refresh });
  const stats = h("div", { class: "stats" }), chartBox = h("div", { class: "chart-box" }), rankBox = h("div"), msg = h("div");

  view.append(
    h("h1", null, "Analytics"),
    h("p", { class: "muted" }, "Revenue per property: 7-day moving average, daily ranking and the materialized-view summary."),
    msg,
    card("Summary (materialized view)", [stats], [stamp, refreshBtn]),
    card("Daily revenue and 7-day moving average", [h("div", { class: "toolbar" }, picker.el, h("label", null, "From"), from, h("label", null, "To"), to), chartBox]),
    card("Ranking by moving average (DENSE_RANK)", [h("div", { class: "toolbar" }, h("label", null, "Day"), rankDate), rankBox]));

  const stat = (label, value) => h("div", { class: "stat" }, h("span", { class: "muted" }, label), h("strong", null, value));

  async function loadSummary() {
    replace(stats, loading());
    const r = await runSummary((signal) => api("/analytics/summary", { signal }));
    if (r.stale) return;
    if (r.error) return replace(stats, errorState(r.error, loadSummary));
    const t = r.data.totals;
    replace(stats, stat("Gross revenue", money(t.gross)), stat("Nights booked", t.nights.toLocaleString("en-IN")), stat("Bookings", t.bookings.toLocaleString("en-IN")), stat("Properties", t.properties.toLocaleString("en-IN")));
    replace(stamp, r.data.lastRefreshed ? `Last refreshed ${dateTime(r.data.lastRefreshed)}` : "Never refreshed");
  }

  async function refresh() {
    setBusy(refreshBtn, true, "Refreshing…");
    replace(msg);
    try {
      await api("/analytics/summary/refresh", { method: "POST" });
      await loadSummary();
      replace(msg, banner("success", "Summary refreshed", "The materialized view was rebuilt with REFRESH ... CONCURRENTLY."));
    } catch (e) {
      replace(msg, banner("error", "Could not refresh the summary", e.message));
    } finally { setBusy(refreshBtn, false); }
  }

  async function loadRank() {
    replace(rankBox, loading());
    const r = await runRank((signal) => api("/analytics/ranking", { signal, params: { limit: 10, date: rankDate.value } }));
    if (r.stale) return;
    if (r.error) return replace(rankBox, errorState(r.error, loadRank));
    const rows = r.data;
    if (!rows.length) return replace(rankBox, empty("No bookings on this day", "Pick another date."));
    rankDate.value = rows[0].date;
    if (!picker.value) picker.set(rows[0].propertyId, rows[0].title); // chart opens on the top property
    replace(rankBox, tableWrap(h("table", null,
      h("thead", null, h("tr", null, h("th", null, "Rank"), h("th", null, "Property"), h("th", { class: "num" }, "7-day avg"))),
      h("tbody", null, rows.map((x) => h("tr", { class: "clickable", tabindex: "0", onClick: () => { picker.set(x.propertyId, x.title); loadChart(); } },
        h("td", null, "#" + x.rank), h("td", null, x.title), h("td", { class: "num" }, money(x.movingAvg7d))))))));
  }

  async function loadChart() {
    if (!picker.value) return replace(chartBox, empty("Pick a property", "Search above or click a row in the ranking."));
    replace(chartBox, loading());
    const r = await runChart((signal) => api("/analytics/moving-average", { signal, params: { propertyId: picker.value, from: from.value, to: to.value } }));
    if (r.stale) return;
    if (r.error) return replace(chartBox, errorState(r.error, loadChart));
    const rows = r.data;
    if (!rows.length) return replace(chartBox, empty("No bookings in this range", "Widen the dates."));
    const canvas = h("canvas", { role: "img", "aria-label": "Daily revenue bars with a 7-day moving average line" });
    replace(chartBox, canvas);
    if (chart) chart.destroy();
    const c = colors();
    chart = new window.Chart(canvas, {
      data: { labels: rows.map((x) => x.date), datasets: [
        { type: "bar", label: "Daily revenue", data: rows.map((x) => +x.dailyRevenue), backgroundColor: c.secondary + "55" },
        { type: "line", label: "7-day moving avg", data: rows.map((x) => +x.movingAvg7d), borderColor: c.primary, backgroundColor: c.primary, pointRadius: 0, tension: 0.25 }] },
      options: { responsive: true, maintainAspectRatio: false,
        scales: { y: { ticks: { callback: (v) => "₹" + Number(v).toLocaleString("en-IN") } } },
        plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${money(ctx.parsed.y)}` } } } },
    });
  }

  loadSummary();
  loadRank().then(loadChart);
  return () => { picker.destroy(); if (chart) chart.destroy(); };
}
