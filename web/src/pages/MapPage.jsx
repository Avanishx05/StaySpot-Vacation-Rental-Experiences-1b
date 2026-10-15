// Screen 3.5 - Map: $geoNear search hotspots within 5 km of a selectable origin, polled every 4 s (no page reload).
// React owns the surrounding UI (select, list, status); Leaflet owns the map layers and is driven from effects.
import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api.js";
import { colors } from "../theme.js";
import { Banner, Button, Card, Empty, ErrorState, Loading, TableWrap } from "../components/ui.jsx";

const POLL_MS = 4000;
const DEFAULT_ORIGIN = { lng: 78.4867, lat: 17.385 };
const keyOf = (r) => `${r.lat},${r.lng}`;

export default function MapPage() {
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN);
  const [originId, setOriginId] = useState(""); // property chosen in the dropdown ("" = a clicked point)
  const [rows, setRows] = useState(null); // null = first load for this origin
  const [deltas, setDeltas] = useState(() => new Map());
  const [selected, setSelected] = useState(null);
  const [paused, setPaused] = useState(false);
  const [updated, setUpdated] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState(null);
  const [listError, setListError] = useState(null);
  const [origins, setOrigins] = useState({ status: "loading", list: [] });

  const mapEl = useRef(null);
  const map = useRef(null);
  const ring = useRef(null);
  const pin = useRef(null);
  const markers = useRef(new Map());
  const prev = useRef(new Map());
  const pausedRef = useRef(false);
  const selectedRef = useRef(null);
  const pickRef = useRef(() => {});
  const palette = useRef(null);
  pausedRef.current = paused;
  selectedRef.current = selected;

  const style = (k) => ({ fillColor: k === selectedRef.current ? palette.current.accent : palette.current.secondary, color: palette.current.secondary });

  const changeOrigin = useCallback((lng, lat, propertyId = "") => {
    prev.current = new Map();
    setSelected(null); setRows(null); setListError(null);
    setOriginId(propertyId);
    setOrigin({ lng, lat });
  }, []);

  // ----- create / destroy the Leaflet map -----
  useEffect(() => {
    const c = (palette.current = colors());
    const m = L.map(mapEl.current).setView([DEFAULT_ORIGIN.lat, DEFAULT_ORIGIN.lng], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" }).addTo(m);
    ring.current = L.circle([DEFAULT_ORIGIN.lat, DEFAULT_ORIGIN.lng], { radius: 5000, color: c.primary, dashArray: "6 6", fill: false }).addTo(m);
    pin.current = L.circleMarker([DEFAULT_ORIGIN.lat, DEFAULT_ORIGIN.lng], { radius: 7, color: c.accent, weight: 4, fillColor: c.primary, fillOpacity: 1 }).addTo(m);
    m.on("click", (e) => changeOrigin(e.latlng.lng, e.latlng.lat));
    m.fitBounds(ring.current.getBounds());
    const t = setTimeout(() => m.invalidateSize(), 0);
    map.current = m;
    return () => { clearTimeout(t); m.remove(); map.current = null; markers.current = new Map(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move the ring and pin whenever the origin changes.
  useEffect(() => {
    if (!map.current) return;
    ring.current.setLatLng([origin.lat, origin.lng]);
    pin.current.setLatLng([origin.lat, origin.lng]);
    map.current.fitBounds(ring.current.getBounds());
  }, [origin]);

  // Re-colour markers when the selection changes.
  useEffect(() => { markers.current.forEach((m, k) => m.setStyle(style(k))); /* eslint-disable-next-line */ }, [selected]);

  pickRef.current = (k) => {
    setSelected(k);
    const m = markers.current.get(k);
    if (m && map.current) map.current.panTo(m.getLatLng());
  };

  // ----- polling -----
  useEffect(() => {
    let gone = false, timer, ctl, hasData = false;

    const apply = (data) => {
      const d = new Map();
      const seen = new Set();
      // Size dots relative to the busiest hotspot, capped by the map's size so neighbouring 1 km buckets don't merge.
      const max = Math.max(1, ...data.map((r) => r.searchCount));
      const el = mapEl.current;
      const cap = Math.min(16, Math.max(8, Math.min(el?.clientWidth || 0, el?.clientHeight || 0) / 40));
      for (const r of data) {
        const k = keyOf(r); seen.add(k);
        if (prev.current.size) d.set(k, r.searchCount - (prev.current.get(k) || 0));
        let m = markers.current.get(k);
        if (!m) {
          m = L.circleMarker([r.lat, r.lng], { weight: 1, fillOpacity: 0.55 }).addTo(map.current).on("click", () => pickRef.current(k));
          markers.current.set(k, m);
        }
        m.setRadius(Math.max(4, cap * Math.sqrt(r.searchCount / max))).setStyle(style(k)).bindTooltip(`${r.searchCount} searches, ${r.distanceKm} km`);
      }
      for (const [k, m] of markers.current) if (!seen.has(k)) { m.remove(); markers.current.delete(k); }
      prev.current = new Map(data.map((r) => [keyOf(r), r.searchCount]));
      setRows(data); setDeltas(d);
    };

    const poll = async () => {
      clearTimeout(timer); if (ctl) ctl.abort();
      if (gone) return;
      if (document.hidden || pausedRef.current) { timer = setTimeout(poll, POLL_MS); return; }
      ctl = new AbortController();
      try {
        const data = await api("/map/hotspots", { signal: ctl.signal, params: { lng: origin.lng, lat: origin.lat, radiusKm: 5 } });
        if (gone) return;
        apply(data); hasData = true;
        setUpdated(Date.now()); setNotice(null); setListError(null);
      } catch (e) {
        if (gone || (e && e.name === "AbortError")) return; // a newer poll took over
        if (hasData) setNotice(e.message); else setListError(e);
      }
      if (!gone) timer = setTimeout(poll, POLL_MS);
    };

    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", onVisible);
    poll();
    return () => { gone = true; clearTimeout(timer); if (ctl) ctl.abort(); document.removeEventListener("visibilitychange", onVisible); };
    // "Try again" calls changeOrigin(), which creates a new origin object and so restarts polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin]);

  // "Live, updated n s ago" ticker
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // property origins for the dropdown
  useEffect(() => {
    let alive = true;
    api("/map/origins", { params: { limit: 200 } })
      .then((list) => alive && setOrigins({ status: "ok", list }))
      .catch(() => alive && setOrigins({ status: "error", list: [] }));
    return () => { alive = false; };
  }, []);

  const status = paused ? "Paused" : updated ? `Live, updated ${Math.max(0, Math.round((now - updated) / 1000))} s ago` : "Connecting…";

  let listBody;
  if (listError) listBody = <ErrorState error={listError} onRetry={() => changeOrigin(origin.lng, origin.lat)} />;
  else if (rows === null) listBody = <Loading />;
  else if (!rows.length) listBody = <Empty title="No searches within 5 km" text="Searches from the last 2 hours show up here (older sessions expire via the TTL index). Insert new sessions to see them appear." />;
  else listBody = (
    <TableWrap>
      <table>
        <thead><tr><th>#</th><th>Location</th><th className="num">Searches</th><th className="num">Km</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const k = keyOf(r), d = deltas.get(k);
            return (
              <tr key={k} className={"clickable" + (k === selected ? " sel" : "")} tabIndex={0} onClick={() => pickRef.current(k)} onKeyDown={(e) => e.key === "Enter" && pickRef.current(k)}>
                <td>{i + 1}</td><td className="mono">{`${r.lat}, ${r.lng}`}</td>
                <td className="num">{r.searchCount}{d > 0 ? <span className="delta">{` +${d}`}</span> : null}</td><td className="num">{r.distanceKm}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );

  return (
    <>
      <h1>Search hotspots</h1>
      <p className="muted">Where guests searched within 5 km of the origin, nearest first, updating live.</p>
      <Card>
        <div className="toolbar">
          <select aria-label="Origin property" disabled={origins.status === "error"} value={originId} onChange={(e) => {
            const o = origins.list.find((x) => x.propertyId === e.target.value);
            if (o) changeOrigin(o.lng, o.lat, o.propertyId);
          }}>
            <option value="">{origins.status === "error" ? "Origins unavailable, click the map" : "Pick a property as origin, or click the map"}</option>
            {origins.list.map((o) => <option key={o.propertyId} value={o.propertyId}>{o.title}</option>)}
          </select>
          <span className="live muted">{status}</span>
          <Button variant="secondary" onClick={() => setPaused((p) => !p)}>{paused ? "Resume" : "Pause"}</Button>
        </div>
        {notice && <Banner kind="warn" title="Live updates interrupted">{notice}</Banner>}
      </Card>
      <div className="map-grid">
        <Card><div className="map" ref={mapEl} role="application" aria-label="Search hotspot map" /></Card>
        <Card title="Nearest first"><div className="scroll">{listBody}</div></Card>
      </div>
    </>
  );
}
