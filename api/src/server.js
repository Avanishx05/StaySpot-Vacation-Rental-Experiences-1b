const path = require("path");
const fs = require("fs");
const express = require("express");
const config = require("./config");
const { createApp } = require("./app");
const { pool } = require("./db");

const app = createApp();

// The front end is a React (Vite) app. `npm run build` in ../web writes web/dist, which is served from the same
// origin as the API. (HashRouter is used, so no history-fallback route is needed.)
// During development run `npm run dev` in ../web instead: it proxies /api to this server.
const webDir = path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(webDir)) app.use(express.static(webDir));
else console.log("No web/dist found: run `npm run build` in web/ to serve the front end here, or `npm run dev` in web/ for the dev server.");

const server = app.listen(config.port, () => console.log(`StaySpot API listening on http://localhost:${config.port}`));

async function shutdown() {
  server.close();
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
