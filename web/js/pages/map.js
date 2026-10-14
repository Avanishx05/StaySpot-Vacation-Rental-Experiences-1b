// Screen 3.5 - Map: $geoNear search hotspots within 5 km of a selectable origin, polled every 4 s (no page reload).
import { api } from "../api.js";
import { colors } from "../theme.js";
import { h, replace, button, card, banner, empty, errorState, loading, tableWrap } from "../dom.js";

const POLL_MS = 4000;

export function render({ view }) {
  const L = window.L;
  if (!L) { view.append(h("h1", null, "Search hotspots"), errorState({ message: "The map library could not be loaded (it needs internet access for Leaflet and OpenStreetMap tiles)." })); return null; }
  const c = colors();
  let origin = { lng: 78.4867, lat: 17.385 }, rows = [], deltas = new Map(), prev = new Map();
  let selected, updated, paused = false, gone = false, timer, ctl;
  const markers = new Map(), origins = new Map();
  const status = h("span", { class: "live muted" }, "Connecting…");
  const select = h("select", { "aria-label": "Origin property", onChange: () => { const o = origins.get(select.value); if (o) setOrigin(o.lng, o.lat); } },
    h("option", { value: "" }, "Pick a property as origin, or click the map"));
  const pauseBtn = button("Pause", { variant: "secondary", onClick: () => { paused = !paused; pauseBtn.textContent = paused ? "Resume" : "Pause"; } });
  const notice = h("div");
  const mapEl = h("div", { class: "map", role: "application", "aria-label": "Search hotspot map" });
  const listBox = h("div", { class: "scroll" });
  view.append(
    h("h1", null, "Search hotspots"),
    h("p", { class: "muted" }, "Where guests searched within 5 km of the origin, nearest first, updating live."),
    card(null, [h("div", { class: "toolbar" }, select, status, pauseBtn), notice]),
    h("div", { class: "map-grid" }, card(null, mapEl), card("Nearest first", listBox)));
  replace(listBox, loading());

  const map = L.map(mapEl).setView([origin.lat, origin.lng], 12);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" }).addTo(map);
  const ring = L.circle([origin.lat, origin.lng], { radius: 5000, color: c.primary, dashArray: "6 6", fill: false }).addTo(map);
  const pin = L.circleMarker([origin.lat, origin.lng], { radius: 7, color: c.accent, weight: 4, fillColor: c.primary, fillOpacity: 1 }).addTo(map);
  map.on("click", (e) => setOrigin(e.latlng.lng, e.latlng.lat));
  setTimeout(() => map.invalidateSize(), 0);
  map.fitBounds(ring.getBounds());

  function setOrigin(lng, lat) {
    origin = { lng, lat }; prev = new Map(); selected = undefined;
    ring.setLatLng([lat, lng]); pin.setLatLng([lat, lng]); map.fitBounds(ring.getBounds());
    replace(listBox, loading()); poll();
  }
  const key = (r) => `${r.lat},${r.lng}`;
  const style = (k) => ({ fillColor: k === selected ? c.accent : c.secondary, color: c.secondary });

  function draw(data) {
    rows = data; deltas = new Map();
    const seen = new Set();
    for (const r of rows) {
      const k = key(r); seen.add(k);
      if (prev.size) deltas.set(k, r.searchCount - (prev.get(k) || 0));
      let m = markers.get(k);
      if (!m) { m = L.circleMarker([r.lat, r.lng], { weight: 1, fillOpacity: 0.55 }).addTo(map).on("click", () => pick(k)); markers.set(k, m); }
      m.setRadius(6 + 3 * Math.sqrt(r.searchCount)).setStyle(style(k)).bindTooltip(`${r.searchCount} searches, ${r.distanceKm} km`);
    }
    for (const [k, m] of markers) if (!seen.has(k)) { m.remove(); markers.delete(k); }
    prev = new Map(rows.map((r) => [key(r), r.searchCount]));
    drawList();
  }

  function drawList() {
    if (!rows.length) return replace(listBox, empty("No searches within 5 km", "Searches from the last 2 hours show up here (older sessions expire via the TTL index). Insert new sessions to see them appear."));
    replace(listBox, tableWrap(h("table", null,
      h("thead", null, h("tr", null, h("th", null, "#"), h("th", null, "Location"), h("th", { class: "num" }, "Searches"), h("th", { class: "num" }, "Km"))),
      h("tbody", null, rows.map((r, i) => {
        const k = key(r), d = deltas.get(k);
        return h("tr", { class: "clickable" + (k === selected ? " sel" : ""), tabindex: "0", onClick: () => pick(k) },
          h("td", null, i + 1), h("td", { class: "mono" }, `${r.lat}, ${r.lng}`),
          h("td", { class: "num" }, r.searchCount, d > 0 ? h("span", { class: "delta" }, ` +${d}`) : null), h("td", { class: "num" }, r.distanceKm));
      })))));
  }
  function pick(k) { selected = k; markers.forEach((m, mk) => m.setStyle(style(mk))); const m = markers.get(k); if (m) map.panTo(m.getLatLng()); drawList(); }

  async function poll() {
    clearTimeout(timer); if (ctl) ctl.abort();
    if (gone) return;
    if (document.hidden || paused) { timer = setTimeout(poll, POLL_MS); return; }
    ctl = new AbortController();
    try {
      draw(await api("/map/hotspots", { signal: ctl.signal, params: { lng: origin.lng, lat: origin.lat, radiusKm: 5 } }));
      updated = Date.now(); replace(notice);
    } catch (e) {
      if (e && e.name === "AbortError") return; // a newer poll took over
      if (updated) replace(notice, banner("warn", "Live updates interrupted", e.message));
      else replace(listBox, errorState(e, poll));
    }
    if (!gone) timer = setTimeout(poll, POLL_MS);
  }
  const onVisible = () => { if (!document.hidden) poll(); };
  document.addEventListener("visibilitychange", onVisible);
  const tick = setInterval(() => { status.textContent = paused ? "Paused" : updated ? `Live, updated ${Math.round((Date.now() - updated) / 1000)} s ago` : "Connecting…"; }, 1000);

  api("/map/origins", { params: { limit: 200 } })
    .then((list) => list.forEach((o) => { origins.set(o.propertyId, o); select.append(h("option", { value: o.propertyId }, o.title)); }))
    .catch(() => { select.disabled = true; select.options[0].textContent = "Origins unavailable, click the map"; });
  poll();
  return () => { gone = true; clearTimeout(timer); clearInterval(tick); if (ctl) ctl.abort(); document.removeEventListener("visibilitychange", onVisible); map.remove(); };
}
