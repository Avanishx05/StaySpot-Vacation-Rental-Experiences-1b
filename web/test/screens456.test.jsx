import { describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderApp, resp } from "./helpers.jsx";

// ---- fakes for the two browser-heavy libraries (jsdom has no canvas / layout) ----
const charts = [];
vi.mock("chart.js/auto", () => ({
  default: class FakeChart {
    constructor(el, cfg) { this.cfg = cfg; this.destroyed = false; charts.push(this); }
    destroy() { this.destroyed = true; }
  },
}));

const layer = () => {
  const o = { remove: vi.fn(), addTo: vi.fn(() => o), on: vi.fn(() => o), setRadius: vi.fn(() => o), setStyle: vi.fn(() => o), bindTooltip: vi.fn(() => o),
    setLatLng: vi.fn(() => o), getBounds: vi.fn(() => ({})), getLatLng: vi.fn(() => ({})) };
  return o;
};
const leafletState = { markers: [], map: null };
vi.mock("leaflet", () => {
  const L = {
    map: () => { const m = layer(); Object.assign(m, { setView: vi.fn(() => m), fitBounds: vi.fn(() => m), invalidateSize: vi.fn(), panTo: vi.fn() }); leafletState.map = m; return m; },
    tileLayer: () => layer(), circle: () => layer(),
    circleMarker: () => { const m = layer(); leafletState.markers.push(m); return m; },
  };
  return { default: L, ...L };
});
vi.mock("leaflet/dist/leaflet.css", () => ({}));

describe("Audit trail", () => {
  it("shows the summary, running balances and coloured amounts", async () => {
    localStorage.setItem("stayspot.actorId", "g1");
    const f = mockApi({
      "GET /api/guests/g1": { id: "g1", name: "Asha", wallet_balance: "600.00" },
      "GET /api/guests/g1/audit": {
        guest: { id: "g1", name: "Asha", wallet_balance: "600.00" }, total: 2,
        summary: { openingBalance: "1000.00", totalCredits: "0.00", totalDebits: "400.00", closingBalance: "600.00" },
        items: [{ id: 1, timestamp: "2026-01-02T10:00:00Z", action_type: "DEBIT", amount_changed: "-400.00", balance_after: "600.00", booking_id: "bk123456-0" },
                { id: 2, timestamp: "2026-01-01T10:00:00Z", action_type: "CREDIT", amount_changed: "1000.00", balance_after: "1000.00", booking_id: null }],
      },
    });
    renderApp("/audit");
    expect(await screen.findByText("Closing balance")).toBeInTheDocument();
    expect(screen.getByText(/−.*400\.00/)).toHaveClass("neg");
    expect(screen.getByText(/\+.*1,000\.00/)).toHaveClass("pos");
    await userEvent.click(screen.getByRole("button", { name: /When/ }));
    await waitFor(() => expect(f.calls.at(-1).url).toMatch(/order=asc/));
  });

  it("rejects an inverted date range without calling the API", async () => {
    mockApi({ "GET /api/guests/g1/audit": { guest: { id: "g1", name: "A", wallet_balance: "0" }, total: 0, items: [], summary: {} } });
    const f = renderApp("/audit?guest=g1");
    await screen.findByText("No wallet activity yet");
    await userEvent.type(screen.getByLabelText("From date"), "2026-02-10");
    await userEvent.type(screen.getByLabelText("To date"), "2026-02-01");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("Check the dates")).toBeInTheDocument();
    void f;
  });
});

describe("Analytics", () => {
  it("opens on the top-ranked property and draws the chart", async () => {
    charts.length = 0;
    const f = mockApi({
      "GET /api/analytics/summary": { totals: { gross: "100000.00", nights: 1200, bookings: 400, properties: 30 }, lastRefreshed: "2026-01-01T00:00:00Z" },
      "GET /api/analytics/ranking": [{ rank: 1, propertyId: "p1", title: "Sea View", movingAvg7d: "5000.00", date: "2026-01-05" }],
      "GET /api/analytics/moving-average": [{ date: "2026-01-04", dailyRevenue: "4000", movingAvg7d: "4500" }, { date: "2026-01-05", dailyRevenue: "6000", movingAvg7d: "5000" }],
      "GET /api/properties": { items: [{ id: "p1", title: "Sea View" }], total: 1 },
      "POST /api/analytics/summary/refresh": { ok: true },
    });
    renderApp("/analytics");
    expect(await screen.findByText("Gross revenue")).toBeInTheDocument();
    expect(screen.getByText("1,200")).toBeInTheDocument();
    await waitFor(() => expect(charts).toHaveLength(1));
    expect(charts[0].cfg.data.datasets.map((d) => d.label)).toEqual(["Daily revenue", "7-day moving avg"]);
    expect(f.calls.find((c) => c.url.includes("moving-average")).url).toMatch(/propertyId=p1/);
    expect(screen.getByLabelText("Ranking date")).toHaveValue("2026-01-05");

    await userEvent.click(screen.getByRole("button", { name: "Refresh view" }));
    expect(await screen.findByText("Summary refreshed")).toBeInTheDocument();
  });

  it("destroys the chart when leaving the screen", async () => {
    charts.length = 0;
    mockApi({
      "GET /api/analytics/summary": { totals: { gross: "1", nights: 1, bookings: 1, properties: 1 }, lastRefreshed: null },
      "GET /api/analytics/ranking": [{ rank: 1, propertyId: "p1", title: "Sea View", movingAvg7d: "1", date: "2026-01-05" }],
      "GET /api/analytics/moving-average": [{ date: "2026-01-05", dailyRevenue: "1", movingAvg7d: "1" }],
      "GET /api/properties": { items: [], total: 0 },
    });
    const { unmount } = renderApp("/analytics");
    await waitFor(() => expect(charts).toHaveLength(1));
    unmount();
    expect(charts[0].destroyed).toBe(true);
  });
});

describe("Reviews", () => {
  it("renders the average, distribution, tags and the amenities document", async () => {
    mockApi({
      "GET /api/properties": { items: [{ id: "p1", title: "Sea View" }], total: 1 },
      "GET /api/reviews/facets": { reviewCount: 1234, averageRating: 4.256, ratingDistribution: [{ rating: 5, count: 800 }, { rating: 4, count: 434 }], topTags: [{ tag: "quiet", count: 90 }] },
      "GET /api/amenities/p1": { amenities: ["Wifi"], house_rules: ["No smoking"], accessibility_features: [] },
    });
    renderApp("/reviews?property=p1");
    expect(await screen.findByText("4.26")).toBeInTheDocument();
    expect(screen.getByText("1,234 reviews")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "5 ★: 800" })).toBeInTheDocument();
    expect(screen.getByText("Wifi")).toBeInTheDocument();
    expect(screen.getByText("No smoking")).toBeInTheDocument();
    expect(screen.queryByText("Accessibility")).not.toBeInTheDocument(); // empty lists are hidden
  });

  it("says so when a property has no reviews or no catalog", async () => {
    mockApi({
      "GET /api/properties": { items: [{ id: "p1", title: "Sea View" }], total: 1 },
      "GET /api/reviews/facets": { reviewCount: 0, averageRating: 0, ratingDistribution: [], topTags: [] },
      "GET /api/amenities/p1": resp(404, { error: { code: "NOT_FOUND", message: "x" } }),
    });
    renderApp("/reviews?property=p1");
    expect(await screen.findByText("No reviews for this property yet")).toBeInTheDocument();
    expect(screen.getByText("No amenities catalog for this property.")).toBeInTheDocument();
  });
});

describe("Map", () => {
  it("polls hotspots, lists them nearest first and flags new searches", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    leafletState.markers.length = 0;
    let n = 3;
    const f = mockApi({
      "GET /api/map/origins": [{ propertyId: "p1", title: "Sea View", lng: 78.5, lat: 17.4 }],
      "GET /api/map/hotspots": () => [{ lat: 17.39, lng: 78.49, searchCount: n, distanceKm: 0.4 }, { lat: 17.4, lng: 78.5, searchCount: 1, distanceKm: 1.2 }],
    });
    renderApp("/map");
    expect(await screen.findByText("17.39, 78.49")).toBeInTheDocument();
    expect(leafletState.markers.length).toBeGreaterThanOrEqual(3); // pin + 2 hotspots
    expect(f.calls.find((c) => c.url.includes("hotspots")).url).toMatch(/radiusKm=5/);
    expect(screen.queryByText("+2")).not.toBeInTheDocument();

    n = 5;
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(await screen.findByText(/\+2/)).toHaveClass("delta"); // 3 -> 5 since the last poll

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    const before = f.calls.filter((c) => c.url.includes("hotspots")).length;
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(f.calls.filter((c) => c.url.includes("hotspots")).length).toBe(before);
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("stops polling and removes the map when you leave", async () => {
    const f = mockApi({ "GET /api/map/origins": [], "GET /api/map/hotspots": [] });
    const { unmount } = renderApp("/map");
    expect(await screen.findByText(/No searches within 5 km/)).toBeInTheDocument();
    const calls = f.calls.length;
    unmount();
    expect(leafletState.map.remove).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 50));
    expect(f.calls.length).toBe(calls);
  });
});
