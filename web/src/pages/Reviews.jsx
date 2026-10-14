// Screen 3.6 - Reviews: $facet charts (rating distribution, top tags, average) + the PropertyAmenities catalog document.
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAsync } from "../hooks/useAsync.js";
import { colors } from "../theme.js";
import { Card, Empty, ErrorState, Loading } from "../components/ui.jsx";
import { PropertyPicker } from "../components/PropertyPicker.jsx";

const Bars = ({ items, color, label }) => {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="bars">
      {items.map((i) => (
        <div className="bar-row" key={label(i)}>
          <span className="bar-label">{label(i)}</span>
          <div className="bar" role="img" aria-label={`${label(i)}: ${i.count}`}><i style={{ width: `${(i.count / max) * 100}%`, background: color }} /></div>
          <span className="mono">{i.count}</span>
        </div>
      ))}
    </div>
  );
};

const Chips = ({ title, list }) => (list && list.length ? <div><h3>{title}</h3><p className="chips">{list.map((x) => <span className="chip" key={x}>{x}</span>)}</p></div> : null);

export default function Reviews() {
  const [search] = useSearchParams();
  const [propertyId, setPropertyId] = useState(search.get("property") || "");

  const { data, error, loading, reload } = useAsync(async (signal) => {
    const [facets, catalog] = await Promise.all([
      api("/reviews/facets", { signal, params: { propertyId } }),
      propertyId ? api(`/amenities/${encodeURIComponent(propertyId)}`, { signal }).catch((e) => (e.status === 404 ? null : Promise.reject(e))) : null,
    ]);
    return { facets, catalog };
  }, [propertyId]);

  let body;
  if (!data && loading) body = <Loading />;
  else if (error) body = <ErrorState error={error} onRetry={reload} />;
  else if (data) {
    const { facets: f, catalog: a } = data;
    const c = colors();
    const catalogCard = (
      <Card title="Amenities and house rules">
        {propertyId
          ? (a ? <><Chips title="Amenities" list={a.amenities} /><Chips title="House rules" list={a.house_rules} /><Chips title="Accessibility" list={a.accessibility_features} /></>
              : <p className="muted">No amenities catalog for this property.</p>)
          : <p className="muted">Pick a property to see its amenities, house rules and accessibility features.</p>}
      </Card>
    );
    body = !f.reviewCount ? (
      <><Card><Empty title="No reviews for this property yet" /></Card>{catalogCard}</>
    ) : (
      <>
        <div className="grid2">
          <Card title="Average rating">
            <div className="big">{f.averageRating.toFixed(2)}<span style={{ color: c.star }}> ★</span></div>
            <p className="muted">{`${f.reviewCount.toLocaleString("en-IN")} reviews`}</p>
          </Card>
          <Card title="Rating distribution"><Bars items={f.ratingDistribution} color={c.star} label={(i) => `${i.rating} ★`} /></Card>
          <Card title="Top tags"><Bars items={f.topTags} color={c.secondary} label={(i) => i.tag} /></Card>
        </div>
        {catalogCard}
      </>
    );
  }

  return (
    <>
      <h1>Reviews</h1>
      <p className="muted">Ratings, popular tags and what each property offers.</p>
      <div className="toolbar"><PropertyPicker value={propertyId} allLabel="All properties" onChange={(id) => setPropertyId(id)} /></div>
      <div className={loading && data ? "dim" : undefined}>{body}</div>
    </>
  );
}
