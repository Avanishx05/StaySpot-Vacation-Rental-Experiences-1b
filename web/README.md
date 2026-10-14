# StaySpot web (React)

React 18 + Vite + React Router (`HashRouter`, so the original `#/browse/guests` URLs still work).

```bash
npm install
npm run dev      # http://localhost:5173, proxies /api -> http://localhost:4000 (set VITE_API_PROXY to change)
npm run build    # -> web/dist, served by the API at http://localhost:4000
npm test         # 29 Vitest tests (jsdom, mocked fetch)
```
Set `VITE_API_BASE` (e.g. `https://api.example.com`) at build time if the API is on a different origin.

## Old -> new map
| Original (plain JS) | React version |
|---|---|
| `js/api.js`, `js/format.js`, `js/theme.js` | `src/api.js`, `src/format.js`, `src/theme.js` (unchanged logic) |
| `js/state.js` (actor store + subscribe) | `src/context/ActorContext.jsx` (`useActor()`) |
| `js/router.js` (hash router, `replaceQuery`) | React Router + `useSearchParams` |
| `js/dom.js` (`h()`, `latest()`, `debounce`, components) | `src/components/*.jsx`, `src/hooks/useAsync.js`, `useDebounced.js` |
| `js/app.js` (`SCREENS`, nav, actor box) | `src/App.jsx`, `components/ActorSwitcher.jsx` |
| `js/pages/browse.js` | `src/pages/Browse.jsx` |
| `js/pages/transaction.js` | `src/pages/BookStay.jsx` |
| `js/pages/audit.js` | `src/pages/Audit.jsx` |
| `js/pages/analytics.js` | `src/pages/Analytics.jsx` (Chart.js from npm) |
| `js/pages/map.js` | `src/pages/MapPage.jsx` (Leaflet from npm, driven from effects) |
| `js/pages/reviews.js`, `_picker.js` | `src/pages/Reviews.jsx`, `components/PropertyPicker.jsx` |
| `css/*.css` | `src/styles/*.css` (unchanged) |
