// Screen 6: $facet pipeline (mongo/03) with an optional property filter, plus the amenities catalog document.
import { Router } from 'express';
import { getDb } from '../mongo.js';
import { HttpError, wrap } from '../http.js';
const r = Router();

r.get('/reviews/facets', wrap(async (req, res) => {
  const { propertyId } = req.query;
  const [out] = await (await getDb()).collection('PropertyReviews').aggregate([
    ...(propertyId ? [{ $match: { property_id: String(propertyId) } }] : []),
    { $facet: {
      ratingDistribution: [{ $group: { _id: '$rating', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      topTags: [{ $unwind: '$location_tags' }, { $group: { _id: '$location_tags', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 }],
      overallAverage: [{ $group: { _id: null, avgRating: { $avg: '$rating' }, n: { $sum: 1 } } }],
    } },
  ]).toArray();
  const avg = out.overallAverage[0];
  res.json({
    ratingDistribution: out.ratingDistribution.map(x => ({ rating: Number(x._id), count: x.count })).sort((a, b) => a.rating - b.rating),
    topTags: out.topTags.map(x => ({ tag: x._id, count: x.count })),
    averageRating: avg ? +avg.avgRating.toFixed(2) : null,
    reviewCount: avg?.n ?? 0,
  });
}));

r.get('/amenities/:propertyId', wrap(async (req, res) => {
  const d = await (await getDb()).collection('PropertyAmenities').findOne({ property_id: req.params.propertyId });
  if (!d) throw new HttpError(404, 'NOT_FOUND', 'No amenities catalog for this property.');
  res.json({ title: d.title, amenities: d.amenities ?? [], house_rules: d.house_rules ?? [], accessibility_features: d.accessibility_features ?? [] });
}));
export default r;
