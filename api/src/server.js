const path = require("path");
const fs = require("fs");
const express = require("express");
const config = require("./config");
const { createApp } = require("./app");
const { pool } = require("./db");

const app = createApp();

// The front end is plain HTML/CSS/JS (no build step): serve ../web from the same origin as the API.
const webDir = path.resolve(__dirname, "../../web");
if (fs.existsSync(webDir)) app.use(express.static(webDir));

const server = app.listen(config.port, () => console.log(`StaySpot API listening on http://localhost:${config.port}`));

async function shutdown() {
  server.close();
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
