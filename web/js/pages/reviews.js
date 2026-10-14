// Screen 3.6 - Reviews: $facet charts (rating distribution, top tags, average) + the PropertyAmenities catalog document.
import { api } from "../api.js";
import { colors } from "../theme.js";
import { h, replace, card, empty, errorState, loading, latest } from "../dom.js";
import { propertyPicker } from "./_picker.js";

export function render({ view, query }) {
  const run = latest();
  const picker = propertyPicker({ id: query.get("property") || "", allLabel: "All properties", onChange: () => load() });
  const box = h("div");
  view.append(h("h1", null, "Reviews"), h("p", { class: "muted" }, "Ratings, popular tags and what each property offers."), h("div", { class: "toolbar" }, picker.el), box);

  const bars = (items, color, label) => {
    const max = Math.max(...items.map((i) => i.count), 1);
    return h("div", { class: "bars" }, items.map((i) => h("div", { class: "bar-row" },
      h("span", { class: "bar-label" }, label(i)),
      h("div", { class: "bar", role: "img", "aria-label": `${label(i)}: ${i.count}` }, h("i", { style: `width:${(i.count / max) * 100}%;background:${color}` })),
      h("span", { class: "mono" }, i.count))));
  };
  const chips = (title, list) => (list.length ? h("div", null, h("h3", null, title), h("p", { class: "chips" }, list.map((x) => h("span", { class: "chip" }, x)))) : null);

  async function load() {
    const id = picker.value;
    replace(box, loading());
    const r = await run(async (signal) => {
      const [facets, catalog] = await Promise.all([
        api("/reviews/facets", { signal, params: { propertyId: id } }),
        id ? api(`/amenities/${encodeURIComponent(id)}`, { signal }).catch((e) => (e.status === 404 ? null : Promise.reject(e))) : null,
      ]);
      return { facets, catalog };
    });
    if (r.stale) return;
    if (r.error) return replace(box, errorState(r.error, load));
    const { facets: f, catalog: a } = r.data;
    const c = colors();
    const catalogCard = card("Amenities and house rules", id
      ? (a ? [chips("Amenities", a.amenities), chips("House rules", a.house_rules), chips("Accessibility", a.accessibility_features)]
           : h("p", { class: "muted" }, "No amenities catalog for this property."))
      : h("p", { class: "muted" }, "Pick a property to see its amenities, house rules and accessibility features."));
    if (!f.reviewCount) return replace(box, card(null, empty("No reviews for this property yet")), catalogCard);
    replace(box,
      h("div", { class: "grid2" },
        card("Average rating", [h("div", { class: "big" }, f.averageRating.toFixed(2), h("span", { style: `color:${c.star}` }, " ★")), h("p", { class: "muted" }, `${f.reviewCount.toLocaleString("en-IN")} reviews`)]),
        card("Rating distribution", bars(f.ratingDistribution, c.star, (i) => `${i.rating} ★`)),
        card("Top tags", bars(f.topTags, c.secondary, (i) => i.tag))),
      catalogCard);
  }
  load();
  return () => picker.destroy();
}
