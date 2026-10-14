import { h, api, pageLayout, loading, empty, errorState } from '../ui.js';
import { colors } from '../theme.js';
const L = window.L, POLL_MS = 4000;

export function mount(root) {
  let origin = { lng: 78.4867, lat: 17.385 }, rows = [], deltas = new Map(), prev = new Map();
  let selected, updated, paused = false, gone = false, timer, ctl;
  const markers = new Map(), origins = new Map();
  const status = h('span', { class: 'live' }, 'Connecting…');
  const select = h('select', { 'aria-label': 'Origin property', onchange: () => { const o = origins.get(select.value); if (o) setOrigin(o.lng, o.lat); } },
    h('option', { value: '' }, 'Pick a property as origin, or click the map'));
  const pauseBtn = h('button', { class: 'btn', onclick: () => { paused = !paused; pauseBtn.textContent = paused ? 'Resume' : 'Pause'; } }, 'Pause');
  const banner = h('div', { class: 'alert error', role: 'alert', hidden: true });
  const mapEl = h('div', { class: 'map', role: 'application', 'aria-label': 'Search hotspot map' });
  const listBox = h('div', { class: 'scroll' });
  pageLayout(root, { title: 'Search hotspots', description: 'Where guests searched within 5 km of the origin, updated live.' })
    .append(h('section', { class: 'card' }, h('div', { class: 'row' }, select, status, pauseBtn), banner),
      h('div', { class: 'map-grid' }, h('section', { class: 'card' }, mapEl), h('section', { class: 'card' }, h('h2', {}, 'Nearest first'), listBox)));
  loading(listBox);

  const map = L.map(mapEl).setView([origin.lat, origin.lng], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(map);
  const ring = L.circle([origin.lat, origin.lng], { radius: 5000, color: colors.primary, dashArray: '6 6', fill: false }).addTo(map);
  const pin = L.circleMarker([origin.lat, origin.lng], { radius: 7, color: colors.accent, weight: 4, fillColor: colors.primary, fillOpacity: 1 }).addTo(map);
  map.on('click', (e) => setOrigin(e.latlng.lng, e.latlng.lat));
  setTimeout(() => map.invalidateSize(), 0);
  map.fitBounds(ring.getBounds());

  function setOrigin(lng, lat) {
    origin = { lng, lat }; prev = new Map(); selected = undefined;
    ring.setLatLng([lat, lng]); pin.setLatLng([lat, lng]); map.fitBounds(ring.getBounds());
    loading(listBox); poll();
  }
  const key = (r) => r.lat + ',' + r.lng;
  const style = (k) => ({ fillColor: k === selected ? colors.accent : colors.secondary, color: colors.secondary });

  function render(data) {
    rows = data; deltas = new Map();
    const seen = new Set();
    for (const r of rows) {
      const k = key(r); seen.add(k);
      if (prev.size) deltas.set(k, r.searchCount - (prev.get(k) || 0));
      let m = markers.get(k);
      if (!m) { m = L.circleMarker([r.lat, r.lng], { weight: 1, fillOpacity: 0.55 }).addTo(map).on('click', () => pick(k)); markers.set(k, m); }
      m.setRadius(6 + 3 * Math.sqrt(r.searchCount)).setStyle(style(k)).bindTooltip(`${r.searchCount} searches, ${r.distanceKm} km`);
    }
    for (const [k, m] of markers) if (!seen.has(k)) { m.remove(); markers.delete(k); }
    prev = new Map(rows.map(r => [key(r), r.searchCount]));
    drawList();
  }

  function drawList() {
    if (!rows.length) return empty(listBox, 'No searches within 5 km', 'Searches from the last 2 hours show up here. Start the ping simulator to see live pings.');
    listBox.replaceChildren(h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Location'), h('th', { class: 'num' }, 'Searches'), h('th', { class: 'num' }, 'Km'))),
      h('tbody', {}, rows.map((r, i) => { const k = key(r), d = deltas.get(k);
        return h('tr', { class: 'clickable' + (k === selected ? ' sel' : ''), onclick: () => pick(k) },
          h('td', {}, i + 1), h('td', { class: 'mono' }, `${r.lat}, ${r.lng}`),
          h('td', { class: 'num' }, r.searchCount, d > 0 ? h('span', { class: 'delta' }, ' +' + d) : null), h('td', { class: 'num' }, r.distanceKm)); }))));
  }
  function pick(k) { selected = k; markers.forEach((m, mk) => m.setStyle(style(mk))); const m = markers.get(k); if (m) map.panTo(m.getLatLng()); drawList(); }

  async function poll() {
    clearTimeout(timer); ctl?.abort();
    if (gone) return;
    if (document.hidden || paused) { timer = setTimeout(poll, POLL_MS); return; }
    ctl = new AbortController();
    try {
      render(await api(`/map/hotspots?lng=${origin.lng}&lat=${origin.lat}&radiusKm=5`, { signal: ctl.signal }));
      updated = Date.now(); banner.hidden = true;
    } catch (e) {
      if (e.name === 'AbortError') return; // a newer poll took over
      if (updated) { banner.hidden = false; banner.textContent = 'Live updates interrupted: ' + e.message; }
      else errorState(listBox, e, poll);
    }
    if (!gone) timer = setTimeout(poll, POLL_MS);
  }
  const onVisible = () => { if (!document.hidden) poll(); };
  document.addEventListener('visibilitychange', onVisible);
  const tick = setInterval(() => { status.textContent = paused ? 'Paused' : updated ? `Live, updated ${Math.round((Date.now() - updated) / 1000)} s ago` : 'Connecting…'; }, 1000);

  api('/map/origins?limit=200').then(list => list.forEach(o => { origins.set(o.propertyId, o); select.append(h('option', { value: o.propertyId }, o.title)); }))
    .catch(() => { select.disabled = true; select.options[0].textContent = 'Origins unavailable, click the map'; });
  poll();
  return () => { gone = true; clearTimeout(timer); clearInterval(tick); ctl?.abort(); document.removeEventListener('visibilitychange', onVisible); map.remove(); };
}
