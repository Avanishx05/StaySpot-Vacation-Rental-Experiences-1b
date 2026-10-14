import { h, api, money, pageLayout, loading, empty, errorState, toast } from '../ui.js';
import { colors } from '../theme.js';
import { propertyPicker } from './_picker.js';

export function mount(root, params = {}) {
  let chart, seq = 0;
  const picker = propertyPicker({ id: params.property, onChange: loadChart });
  const from = h('input', { type: 'date', 'aria-label': 'From date', onchange: loadChart });
  const to = h('input', { type: 'date', 'aria-label': 'To date', onchange: loadChart });
  const rankDate = h('input', { type: 'date', 'aria-label': 'Ranking date', onchange: loadRank });
  const stamp = h('span', { class: 'muted' });
  const refreshBtn = h('button', { class: 'btn accent', onclick: refresh }, 'Refresh view');
  const stats = h('div', { class: 'stats' }), chartBox = h('div', { class: 'chart-box' }), rankBox = h('div');

  pageLayout(root, { title: 'Analytics', description: 'Revenue per property: 7-day moving average, daily ranking and the summary view.' })
    .append(
      h('section', { class: 'card' }, h('div', { class: 'row' }, h('h2', {}, 'Summary'), stamp, refreshBtn), stats),
      h('section', { class: 'card' }, h('h2', {}, 'Daily revenue and 7-day moving average'),
        h('div', { class: 'row' }, picker.el, from, to), chartBox),
      h('section', { class: 'card' }, h('div', { class: 'row' }, h('h2', {}, 'Ranking by moving average'), rankDate), rankBox));

  const stat = (label, value) => h('div', { class: 'stat' }, h('span', { class: 'muted' }, label), h('strong', {}, value));

  async function loadSummary() {
    loading(stats);
    try {
      const { totals: t, lastRefreshed } = await api('/analytics/summary');
      stats.replaceChildren(stat('Gross revenue', money(t.gross)), stat('Nights booked', t.nights.toLocaleString('en-IN')),
        stat('Bookings', t.bookings.toLocaleString('en-IN')), stat('Properties', t.properties.toLocaleString('en-IN')));
      stamp.textContent = lastRefreshed ? 'Last refreshed ' + new Date(lastRefreshed).toLocaleString('en-IN') : 'Never refreshed';
    } catch (e) { errorState(stats, e, loadSummary); }
  }

  async function refresh() {
    refreshBtn.disabled = true; refreshBtn.textContent = 'Refreshing…';
    try { await api('/analytics/summary/refresh', { method: 'POST' }); toast('Summary refreshed'); await loadSummary(); }
    catch (e) { toast(e.message); }
    finally { refreshBtn.disabled = false; refreshBtn.textContent = 'Refresh view'; }
  }

  async function loadRank() {
    loading(rankBox);
    try {
      const rows = await api('/analytics/ranking?limit=10' + (rankDate.value ? '&date=' + rankDate.value : ''));
      if (!rows.length) return empty(rankBox, 'No bookings on this day', 'Pick another date.');
      rankDate.value = rows[0].date;
      if (!picker.value) picker.set(rows[0].propertyId, rows[0].title); // chart opens on the top property
      rankBox.replaceChildren(h('div', { class: 'scroll' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Rank'), h('th', {}, 'Property'), h('th', { class: 'num' }, '7-day avg'))),
        h('tbody', {}, rows.map(r => h('tr', { class: 'clickable', onclick: () => { picker.set(r.propertyId, r.title); loadChart(); } },
          h('td', {}, '#' + r.rank), h('td', {}, r.title), h('td', { class: 'num' }, money(r.movingAvg7d))))))));
    } catch (e) { errorState(rankBox, e, loadRank); }
  }

  async function loadChart() {
    const my = ++seq;
    if (!picker.value) return empty(chartBox, 'Pick a property', 'Search above or click a row in the ranking.');
    loading(chartBox);
    try {
      const rows = await api(`/analytics/moving-average?propertyId=${picker.value}` + (from.value ? '&from=' + from.value : '') + (to.value ? '&to=' + to.value : ''));
      if (my !== seq) return;
      if (!rows.length) return empty(chartBox, 'No bookings in this range', 'Widen the dates.');
      const canvas = h('canvas', { role: 'img', 'aria-label': 'Daily revenue bars with a 7-day moving average line' });
      chartBox.replaceChildren(canvas); chart?.destroy();
      chart = new window.Chart(canvas, {
        data: { labels: rows.map(r => r.date), datasets: [
          { type: 'bar', label: 'Daily revenue', data: rows.map(r => +r.dailyRevenue), backgroundColor: colors.secondary + '55' },
          { type: 'line', label: '7-day moving avg', data: rows.map(r => +r.movingAvg7d), borderColor: colors.primary, backgroundColor: colors.primary, pointRadius: 0, tension: 0.25 }] },
        options: { responsive: true, maintainAspectRatio: false,
          scales: { y: { ticks: { callback: v => '₹' + Number(v).toLocaleString('en-IN') } } },
          plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.parsed.y)}` } } } },
      });
    } catch (e) { if (my === seq) errorState(chartBox, e, loadChart); }
  }

  loadSummary();
  loadRank().then(loadChart);
  return () => { seq++; chart?.destroy(); };
}
