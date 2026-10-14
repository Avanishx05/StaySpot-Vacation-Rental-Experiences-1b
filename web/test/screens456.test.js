const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, Node: dom.window.Node, location: dom.window.location, history: dom.window.history, localStorage: dom.window.localStorage });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- fakes: fetch, Chart.js, Leaflet ----
let routes = {}, calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url, method: opts.method || 'GET' });
  const path = String(url).replace(/^\/api/, '').split('?')[0];
  let h = routes[(opts.method || 'GET') + ' ' + path] ?? routes[path];
  if (!h) return { ok: false, status: 404, json: async () => ({ error: { code: 'NOT_FOUND', message: 'nope' } }) };
  if (typeof h === 'function') h = await h(url, opts);
  if (h && h.__status) return { ok: false, status: h.__status, json: async () => ({ error: h.error }) };
  return { ok: true, status: 200, json: async () => h };
};
const charts = [];
window.Chart = class { constructor(c, cfg) { this.cfg = cfg; this.destroyed = false; charts.push(this); } destroy() { this.destroyed = true; } };
const log = []; let nm = 0;
const fake = (name) => { const o = new Proxy({}, { get: (_, p) => p === 'then' ? undefined : (...a) => { log.push([name, p, ...a]); return o; } }); return o; };
window.L = { map: () => fake('map'), tileLayer: () => fake('tile'), circle: () => fake('ring'),
  circleMarker: (ll) => { const id = ++nm; log.push(['create', id, ll]); return fake('m' + id); } };
const liveMarkers = () => log.filter(l => l[0] === 'create').length - log.filter(l => /^m\d+$/.test(l[0]) && l[1] === 'remove').length - 1; // minus origin pin
// Real page modules (ES modules, loaded with dynamic import from this CommonJS file); same call shape as the router uses.
const mountPage = async (name, params = {}) => {
  const mod = await import('../js/pages/' + name + '.js');
  return mod.render({ view: root(), rest: [], query: new URLSearchParams(params), signal: new AbortController().signal });
};
const root = () => document.getElementById('root');
const reset = () => { routes = {}; calls = []; log.length = 0; nm = 0; charts.length = 0; root().replaceChildren(); document.body.querySelectorAll('.toast').forEach(t => t.remove()); };

const props = { items: [{ id: 'p-top', title: 'Top Villa' }, { id: 'p-2', title: 'Second Villa' }] };
const summary = { rows: [], totals: { gross: '123456.50', nights: 321, bookings: 99, properties: 5 }, lastRefreshed: '2026-10-14T05:00:00.000Z' };
const rank = [{ rank: 1, propertyId: 'p-top', title: 'Top Villa', movingAvg7d: '571.43', date: '2026-10-14' }, { rank: 1, propertyId: 'p-2', title: 'Second Villa', movingAvg7d: '571.43', date: '2026-10-14' }, { rank: 2, propertyId: 'p-3', title: 'Third', movingAvg7d: '100.00', date: '2026-10-14' }];
const ma = [{ date: '2026-10-13', dailyRevenue: '1000.00', movingAvg7d: '142.86' }, { date: '2026-10-14', dailyRevenue: '4000.00', movingAvg7d: '714.29' }];

test('analytics: summary cards, ranking, chart opens on the top property, refresh button', async () => {
  reset();
  let refreshed = false;
  routes = { '/properties': props, '/analytics/summary': () => ({ ...summary, lastRefreshed: refreshed ? '2026-10-14T06:00:00.000Z' : summary.lastRefreshed }),
    '/analytics/ranking': rank, '/analytics/moving-average': ma,
    'POST /analytics/summary/refresh': async () => { await sleep(150); refreshed = true; return { lastRefreshed: '2026-10-14T06:00:00.000Z' }; } };
  const cleanup = await mountPage('analytics');
  await sleep(100);
  assert.match(root().textContent, /₹1,23,456\.50/);                        // Indian grouping from money()
  assert.equal(root().querySelectorAll('tbody tr').length, 3);
  assert.deepEqual([...root().querySelectorAll('tbody tr td:first-child')].map(td => td.textContent), ['#1', '#1', '#2']);
  assert.equal(root().querySelector('select').value, 'p-top');                // auto-picked rank 1
  assert.match(calls.find(c => c.url.includes('moving-average')).url, /propertyId=p-top/);
  assert.equal(charts.length, 1);
  assert.deepEqual(charts[0].cfg.data.datasets.map(d => d.type), ['bar', 'line']);
  assert.deepEqual(charts[0].cfg.data.datasets[1].data, [142.86, 714.29]);    // numbers, not strings
  assert.deepEqual(charts[0].cfg.data.labels, ['2026-10-13', '2026-10-14']);
  const before = root().querySelector('.card-actions span.muted').textContent;
  const btn = [...root().querySelectorAll('button')].find(b => b.textContent.trim() === 'Refresh view');
  btn.click(); await sleep(30);
  assert.equal(btn.disabled, true); assert.equal(btn.textContent.trim(), 'Refreshing…'); // busy state
  await sleep(300);
  assert.equal(btn.disabled, false); assert.equal(btn.textContent.trim(), 'Refresh view');
  assert.ok(calls.some(c => c.method === 'POST'));
  assert.notEqual(root().querySelector('.card-actions span.muted').textContent, before); // "last refreshed" re-read
  // clicking another ranking row reloads the chart for that property
  root().querySelectorAll('tbody tr')[1].click(); await sleep(50);
  assert.equal(root().querySelector('select').value, 'p-2');
  assert.match(calls.filter(c => c.url.includes('moving-average')).at(-1).url, /propertyId=p-2/);
  assert.equal(charts[0].destroyed, true);                                   // old chart destroyed, no leak
  cleanup(); assert.equal(charts.at(-1).destroyed, true);
});

test('analytics: error and empty states instead of blank blocks', async () => {
  reset();
  routes = { '/properties': props, '/analytics/summary': { __status: 503, error: { code: 'X', message: 'Database is down.' } }, '/analytics/ranking': [] };
  const cleanup = await mountPage('analytics'); await sleep(100);
  assert.match(root().textContent, /Database is down\./);
  assert.ok([...root().querySelectorAll('button')].some(b => b.textContent === 'Try again'));
  assert.match(root().textContent, /No bookings on this day/);
  assert.match(root().textContent, /Pick a property/);                        // chart placeholder, not blank
  cleanup();
});

const hs = (n) => [{ lat: 17.39, lng: 78.49, searchCount: n, distanceKm: 0.6 }, { lat: 17.40, lng: 78.50, searchCount: 2, distanceKm: 2.1 }];
test('map: list in API order, markers, live deltas, click-to-set-origin, pause, cleanup stops polling', { timeout: 30000 }, async () => {
  reset();
  let n = 0, data = hs(3);
  routes = { '/map/origins': [{ propertyId: 'a', title: 'Lake Villa', lng: 78.5, lat: 17.4 }], '/map/hotspots': () => { n++; return data; } };
  const cleanup = await mountPage('map'); await sleep(150);
  assert.equal(root().querySelectorAll('tbody tr').length, 2);
  assert.equal(root().querySelectorAll('tbody tr')[0].querySelector('.mono').textContent, '17.39, 78.49');
  assert.equal(liveMarkers(), 2);
  assert.equal(root().querySelectorAll('.delta').length, 0);                 // no deltas on first load
  assert.equal(root().querySelectorAll('select option').length, 2);
  assert.match(calls.find(c => c.url.includes('hotspots')).url, /lng=78\.4867&lat=17\.385&radiusKm=5/);
  data = [{ lat: 17.39, lng: 78.49, searchCount: 7, distanceKm: 0.6 }];      // +4 on one hotspot, other one gone
  await sleep(4300);                                                         // next poll, no page reload
  assert.equal(root().querySelector('.delta').textContent.trim(), '+4');
  assert.equal(root().querySelectorAll('tbody tr').length, 1);
  assert.equal(liveMarkers(), 1);                                            // stale marker removed in place
  // click on the map moves the origin and refetches with the clicked point
  const click = log.find(l => l[0] === 'map' && l[1] === 'on' && l[2] === 'click')[3];
  click({ latlng: { lat: 12.9, lng: 77.6 } }); await sleep(100);
  assert.match(calls.at(-1).url, /lng=77\.6&lat=12\.9/);
  // pause stops fetching, resume continues
  [...root().querySelectorAll('button')].find(b => b.textContent === 'Pause').click();
  const paused = n; await sleep(4500);
  assert.equal(n, paused);
  assert.match(root().querySelector('.live').textContent, /Paused/);
  [...root().querySelectorAll('button')].find(b => b.textContent === 'Resume').click();
  await sleep(4500); assert.ok(n > paused);
  cleanup(); const stopped = n; await sleep(4500);
  assert.equal(n, stopped);                                                  // timers cleared on unmount
  assert.ok(log.some(l => l[0] === 'map' && l[1] === 'remove'));
});

test('map: empty state, then error state when the very first poll fails', { timeout: 15000 }, async () => {
  reset(); routes = { '/map/origins': [], '/map/hotspots': [] };
  let c = await mountPage('map'); await sleep(150);
  assert.match(root().textContent, /No searches within 5 km/); c();
  reset(); routes = { '/map/origins': { __status: 503, error: { code: 'MONGO_UNAVAILABLE', message: 'Search data unavailable.' } }, '/map/hotspots': { __status: 503, error: { code: 'MONGO_UNAVAILABLE', message: 'Search data unavailable.' } } };
  c = await mountPage('map'); await sleep(150);
  assert.match(root().textContent, /Search data unavailable\./);
  assert.equal(root().querySelector('select').disabled, true); c();
});

test('reviews: facets, bars, chips; all-properties vs one property; empty/404/error states', async () => {
  reset();
  const facets = { ratingDistribution: [{ rating: 3, count: 1 }, { rating: 4.5, count: 2 }, { rating: 5, count: 4 }], topTags: [{ tag: 'great view', count: 5 }, { tag: 'near metro', count: 2 }], averageRating: 4.43, reviewCount: 7 };
  routes = { '/properties': props, '/reviews/facets': facets, '/amenities/p-top': { title: 'Top', amenities: ['Pool', 'WiFi'], house_rules: ['No pets'], accessibility_features: [] } };
  let c = await mountPage('reviews', { property: 'p-top' }); await sleep(150);
  assert.match(root().textContent, /4\.43/); assert.match(root().textContent, /7 reviews/);
  assert.equal(root().querySelectorAll('.bar-row').length, 5);               // 3 ratings + 2 tags
  assert.deepEqual([...root().querySelectorAll('.bar-label')].map(x => x.textContent).slice(0, 3), ['3 ★', '4.5 ★', '5 ★']);
  assert.equal(root().querySelector('.bar i').style.width, '25%');           // 1 of max 4
  assert.deepEqual([...root().querySelectorAll('.chip')].map(x => x.textContent), ['Pool', 'WiFi', 'No pets']); // empty group skipped
  assert.match(calls.find(x => x.url.includes('facets')).url, /propertyId=p-top/); c();
  // no property selected: no amenity call, helpful hint
  reset(); routes = { '/properties': props, '/reviews/facets': facets };
  c = await mountPage('reviews'); await sleep(150);
  assert.ok(!calls.some(x => x.url.includes('/amenities'))); assert.ok(!calls.find(x => x.url.includes('facets')).url.includes('propertyId'));
  assert.match(root().textContent, /Pick a property to see its amenities/); c();
  // 404 catalog + zero reviews + error
  reset(); routes = { '/properties': props, '/reviews/facets': { ratingDistribution: [], topTags: [], averageRating: null, reviewCount: 0 } };
  c = await mountPage('reviews', { property: 'p-2' }); await sleep(150);
  assert.match(root().textContent, /No reviews for this property yet/); assert.match(root().textContent, /No amenities catalog/); c();
  reset(); routes = { '/properties': props, '/reviews/facets': { __status: 503, error: { code: 'MONGO_UNAVAILABLE', message: 'Review data unavailable.' } } };
  c = await mountPage('reviews'); await sleep(150);
  assert.match(root().textContent, /Review data unavailable\./); c();
});

test('regression: ?property=<id> is honoured on first load (analytics and reviews)', async () => {
  reset();
  routes = { '/properties': props, '/properties/zzz': { id: 'zzz', title: 'Far Away Lodge' }, '/analytics/summary': summary, '/analytics/ranking': rank, '/analytics/moving-average': ma,
    '/reviews/facets': { ratingDistribution: [], topTags: [], averageRating: null, reviewCount: 0 }, '/amenities/zzz': null };
  const a = await mountPage('analytics', { property: 'zzz' }); await sleep(150);
  assert.match(calls.find(c => c.url.includes('moving-average')).url, /propertyId=zzz/);   // not the ranking's top property
  assert.equal(root().querySelector('select').value, 'zzz');
  assert.equal(root().querySelector('select').selectedOptions[0].textContent, 'Far Away Lodge'); // title fetched when not in first 20
  a(); reset();
  routes = { '/properties': props, '/reviews/facets': { ratingDistribution: [], topTags: [], averageRating: null, reviewCount: 0 }, '/amenities/zzz': { __status: 404, error: { code: 'NOT_FOUND', message: 'x' } } };
  const r = await mountPage('reviews', { property: 'zzz' }); await sleep(150);
  assert.match(calls.find(c => c.url.includes('facets')).url, /propertyId=zzz/);
  r();
});
