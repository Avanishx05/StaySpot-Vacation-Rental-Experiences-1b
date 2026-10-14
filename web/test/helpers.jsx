import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { ActorProvider } from "../src/context/ActorContext.jsx";
import { Shell } from "../src/App.jsx";

/** Route table for a mocked fetch: { "GET /api/guests/:id": (url, init) => body | {status, body} } matched by prefix. */
export function mockApi(routes) {
  const calls = [];
  const fn = vi.fn(async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const path = String(url).split("?")[0];
    calls.push({ method, url: String(url), body: init.body ? JSON.parse(init.body) : undefined });
    const hit = Object.entries(routes).find(([k]) => {
      const [m, p] = k.split(" ");
      return m === method && (p === path || (p.endsWith("*") && path.startsWith(p.slice(0, -1))));
    });
    if (!hit) return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: `unmocked ${method} ${url}` } }), { status: 404 });
    const out = typeof hit[1] === "function" ? hit[1](String(url), init) : hit[1];
    const { status = 200, body } = out && out.__resp ? out : { body: out };
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  fn.calls = calls;
  return fn;
}
export const resp = (status, body) => ({ __resp: true, status, body });

export function renderApp(initialPath = "/browse/guests") {
  return render(<MemoryRouter initialEntries={[initialPath]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ActorProvider><Shell /></ActorProvider></MemoryRouter>);
}
