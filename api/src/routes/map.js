// Screen 5. Reuses trendingHotspots() ($geoNear) from mongo/02_workflow3_geonear.js (CommonJS).
import { Router } from 'express';
import { createRequire } from 'node:module';
import { getDb } from '../mongo.js';
import { HttpError, wrap } from '../http.js';
const { trendingHotspots } = createRequire(import.meta.url)('../../../mongo/02_workflow3_geonear.js');
const r = Router();
const num = (v, name, lo, hi, def) => {
  if (v === undefined || v === '') { if (def === undefined) throw new HttpError(400, 'INVALID_INPUT', `${name} is required`); return def; }
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new HttpError(400, 'INVALID_INPUT', `${name} must be between ${lo} and ${hi}`);
  return n;
};

r.get('/map/origins', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filter = q ? { title: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {};
  const docs = await (await getDb()).collection('PropertyAmenities').find(filter)
    .project({ property_id: 1, title: 1, location: 1 }).limit(num(req.query.limit, 'limit', 1, 200, 50)).toArray();
  res.json(docs.map(d => ({ propertyId: d.property_id, title: d.title, lng: d.location.coordinates[0], lat: d.location.coordinates[1] })));
}));

r.get('/map/hotspots', wrap(async (req, res) => {
  const lng = num(req.query.lng, 'lng', -180, 180), lat = num(req.query.lat, 'lat', -90, 90);
  const radiusKm = num(req.query.radiusKm, 'radiusKm', 0.1, 50, 5);
  const recentMinutes = num(req.query.recentMinutes, 'recentMinutes', 1, 1440, 120);
  const rows = await trendingHotspots(await getDb(), { lng, lat, radiusMeters: radiusKm * 1000, recentMinutes });
  res.json(rows
    .map(x => ({ lat: x._id.lat_bucket, lng: x._id.lng_bucket, searchCount: x.session_count, distanceKm: +(x.avg_distance / 1000).toFixed(2) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)); // the pipeline sorts by count; the screen wants distance
}));
export default r;
