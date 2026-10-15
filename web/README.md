# StaySpot web (React)

React 18 + Vite + React Router (`HashRouter`). Full setup, screens, tech choices and assumptions are in the root `README.md`.

```bash
npm install
npm run dev      # http://localhost:5173, proxies /api -> http://localhost:4000 (set VITE_API_PROXY to change)
npm run build    # -> web/dist, served by the API at http://localhost:4000
npm test         # Vitest tests (jsdom, mocked fetch)
```
Set `VITE_API_BASE` (e.g. `https://api.example.com`) at build time if the API is on a different origin.

Layout: `src/pages/` (one file per screen), `src/components/` (shared UI, see `docs/design/design_system.md`), `src/hooks/`, `src/context/ActorContext.jsx` (acting guest), `src/styles/`, `test/`.
