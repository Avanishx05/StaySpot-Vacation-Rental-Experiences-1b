// In-memory stand-in for MongoDB, used only by tests (no mongod needed). It re-implements the pipeline semantics
// roughly, so these tests cover route logic, not the real $geoNear/$facet behaviour. Run the real pipelines against Mongo for that.
export const store = { PropertyAmenities: [], PropertyReviews: [], SearchSessions: [] };
const hav = ([a, b], [c, d]) => { const R = 6371000, r = Math.PI / 180, x = Math.sin((d - b) * r / 2) ** 2 + Math.cos(b * r) * Math.cos(d * r) * Math.sin((c - a) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const r2 = (x) => Math.round(x * 100) / 100;
function aggregate(name, pipe) {
  let docs = store[name];
  for (const st of pipe) {
    if (st.$match) docs = docs.filter(d => Object.entries(st.$match).every(([k, v]) => d[k] === v));
    if (st.$geoNear) { const g = st.$geoNear; docs = docs.map(d => ({ ...d, distance_meters: hav(g.near.coordinates, d.location.coordinates) }))
      .filter(d => d.distance_meters <= g.maxDistance && d.created_at >= g.query.created_at.$gte); }
    if (st.$group && name === 'SearchSessions') { const m = new Map();
      for (const d of docs) { const [lng, lat] = d.location.coordinates, k = r2(lat) + ',' + r2(lng); const e = m.get(k) || { _id: { lat_bucket: r2(lat), lng_bucket: r2(lng) }, session_count: 0, sum: 0 };
        e.session_count++; e.sum += d.distance_meters; m.set(k, e); }
      docs = [...m.values()].map(e => ({ _id: e._id, session_count: e.session_count, avg_distance: e.sum / e.session_count })); }
    if (st.$sort && name === 'SearchSessions') docs = [...docs].sort((a, b) => b.session_count - a.session_count);
    if (st.$facet) { const cnt = (f) => { const m = new Map(); docs.forEach(d => [].concat(f(d)).forEach(v => m.set(v, (m.get(v) || 0) + 1))); return m; };
      const dist = [...cnt(d => d.rating)].map(([_id, count]) => ({ _id, count })).sort((a, b) => a._id - b._id);
      const tags = [...cnt(d => d.location_tags)].map(([_id, count]) => ({ _id, count })).sort((a, b) => b.count - a.count).slice(0, 5);
      const avg = docs.length ? [{ _id: null, avgRating: docs.reduce((s, d) => s + d.rating, 0) / docs.length, n: docs.length }] : [];
      return [{ ratingDistribution: dist, topTags: tags, overallAverage: avg }]; }
  }
  return docs;
}
export const fakeDb = { collection: (name) => ({
    find: (f = {}) => { let out = store[name].filter(d => !f.title || new RegExp(f.title.$regex, f.title.$options).test(d.title)); const c = { project: () => c, limit: (n) => { out = out.slice(0, n); return c; }, toArray: async () => out }; return c; },
    findOne: async (f) => store[name].find(d => d.property_id === f.property_id) ?? null,
    aggregate: (pipe) => ({ toArray: async () => aggregate(name, pipe) }),
  }) };
