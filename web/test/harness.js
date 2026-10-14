// Runs the REAL front-end modules in jsdom against the REAL API + a throw-away PostgreSQL database.
const path = require("path");
const { JSDOM } = require("jsdom");
const api = path.resolve(__dirname, "../../api");
const { resetDatabase, uid, addGuest, addProperty } = require(path.join(api, "test/helpers"));

async function boot() {
  const db = await resetDatabase();
  const { createApp } = require(path.join(api, "src/app"));
  const { pool } = require(path.join(api, "src/db"));
  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  const dom = new JSDOM(`<!doctype html><body><div id="actor"></div><main id="view"></main></body>`, { url: "http://localhost/", pretendToBeVisual: true });
  const w = dom.window;
  Object.assign(globalThis, { window: w, document: w.document, Node: w.Node, location: w.location, history: w.history, localStorage: w.localStorage, HTMLElement: w.HTMLElement });
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = (url, opts) => { calls.push({ url, method: (opts && opts.method) || "GET" }); return globalThis.fakeFetchError ? Promise.reject(new TypeError("fetch failed")) : realFetch(base + url, opts); };

  const waitFor = async (fn, msg = "condition", ms = 5000) => {
    const t = Date.now();
    for (;;) {
      try { const v = fn(); if (v) return v; } catch (_) { /* retry */ }
      if (Date.now() - t > ms) throw new Error(`Timed out waiting for ${msg}\nDOM: ${document.getElementById("view").textContent.slice(0, 400)}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  const mount = async (screenModule, hash, actor) => {
    const state = await import("../js/state.js");
    state.setActor(actor || null);
    const view = document.getElementById("view");
    view.replaceChildren();
    w.history.replaceState(null, "", hash);
    const { parseHash } = await import("../js/router.js");
    const { query } = parseHash();
    const ctl = new AbortController();
    const mod = await import(`../js/pages/${screenModule}.js`);
    const cleanup = mod.render({ view, rest: [], query, signal: ctl.signal });
    return { view, cleanup, ctl };
  };
  const stop = async () => { server.close(); await pool.end(); await db.end(); w.close(); };
  return { db, uid, addGuest, addProperty, w, calls, waitFor, mount, stop, text: () => document.getElementById("view").textContent };
}
module.exports = { boot };
