// TEMPORARY stand-in for the shared web/src/ui.js (same names). Delete after the real one is merged.
export const h = (tag, a = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(a || {})) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.flat().filter(k => k != null && k !== false));
  return e;
};
export async function api(path, opts = {}) {
  const r = await fetch('/api' + path, opts);
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw { status: r.status, code: b.error?.code, message: b.error?.message || 'Something went wrong.' };
  return b;
}
export const money = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Returns the content element below the hero.
export function pageLayout(root, { title, description, controls }) {
  const main = h('main', { class: 'content' });
  root.replaceChildren(h('header', { class: 'hero' }, h('h1', {}, title), h('p', {}, description || ''), controls || null), main);
  return main;
}
export const loading = (el) => el.replaceChildren(h('div', { class: 'skeleton', 'aria-busy': 'true' }));
export const empty = (el, title, hint) => el.replaceChildren(h('div', { class: 'empty' }, h('strong', {}, title), h('p', {}, hint || '')));
export const errorState = (el, e, retry) => el.replaceChildren(h('div', { class: 'alert error', role: 'alert' },
  h('strong', {}, e.message), ' ', h('code', {}, e.code || ''), retry && h('button', { class: 'btn', onclick: retry }, 'Retry')));
export const toast = (m) => { const t = h('div', { class: 'toast' }, m); document.body.append(t); setTimeout(() => t.remove(), 3000); };
