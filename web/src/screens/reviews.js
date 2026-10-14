import { h, api, pageLayout, loading, empty, errorState } from '../ui.js';
import { colors } from '../theme.js';
import { propertyPicker } from './_picker.js';

export function mount(root, params = {}) {
  let seq = 0;
  const picker = propertyPicker({ id: params.property, allLabel: 'All properties', onChange: load });
  const box = h('div');
  pageLayout(root, { title: 'Reviews', description: 'Ratings, popular tags and what each property offers.', controls: picker.el }).append(box);

  const bars = (items, color, label) => {
    const max = Math.max(...items.map(i => i.count), 1);
    return h('div', { class: 'bars' }, items.map(i => h('div', { class: 'bar-row' },
      h('span', { class: 'bar-label' }, label(i)),
      h('div', { class: 'bar', role: 'img', 'aria-label': `${label(i)}: ${i.count}` }, h('i', { style: `width:${(i.count / max) * 100}%;background:${color}` })),
      h('span', { class: 'mono' }, i.count))));
  };
  const chips = (title, list) => list.length ? h('div', {}, h('h3', {}, title), h('div', { class: 'chips' }, list.map(x => h('span', { class: 'chip' }, x)))) : null;

  async function load() {
    const my = ++seq, id = picker.value;
    loading(box);
    try {
      const [f, a] = await Promise.all([
        api('/reviews/facets' + (id ? '?propertyId=' + id : '')),
        id ? api('/amenities/' + id).catch(e => (e.status === 404 ? null : Promise.reject(e))) : null,
      ]);
      if (my !== seq) return;
      const catalog = h('section', { class: 'card' }, h('h2', {}, 'Amenities and house rules'));
      if (!id) catalog.append(h('p', { class: 'muted' }, 'Pick a property to see its amenities, house rules and accessibility features.'));
      else if (!a) catalog.append(h('p', { class: 'muted' }, 'No amenities catalog for this property.'));
      else catalog.append(chips('Amenities', a.amenities), chips('House rules', a.house_rules), chips('Accessibility', a.accessibility_features));

      if (!f.reviewCount) { box.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'empty' }, h('strong', {}, 'No reviews for this property yet'))), catalog); return; }
      box.replaceChildren(
        h('div', { class: 'grid2' },
          h('section', { class: 'card' }, h('h2', {}, 'Average rating'),
            h('div', { class: 'big' }, f.averageRating.toFixed(2), h('span', { class: 'star', style: `color:${colors.star}` }, ' ★')),
            h('p', { class: 'muted' }, f.reviewCount.toLocaleString('en-IN') + ' reviews')),
          h('section', { class: 'card' }, h('h2', {}, 'Rating distribution'), bars(f.ratingDistribution, colors.star, i => i.rating + ' ★')),
          h('section', { class: 'card' }, h('h2', {}, 'Top tags'), bars(f.topTags, colors.secondary, i => i.tag))),
        catalog);
    } catch (e) { if (my === seq) errorState(box, e, load); }
  }
  load();
  return () => { seq++; };
}
