import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderApp, resp } from "./helpers.jsx";

const guests = (n, total = n) => ({ total, items: Array.from({ length: n }, (_, i) => ({ id: `g${i}-0000-0000`, name: `Guest ${i}`, wallet_balance: "1000.00" })) });

describe("Browse", () => {
  it("lists guests with formatted balances and pagination text", async () => {
    mockApi({ "GET /api/guests": guests(3, 60) });
    renderApp("/browse/guests");
    expect(await screen.findByRole("link", { name: "Guest 0" })).toHaveAttribute("href", "/browse/guests/g0-0000-0000");
    expect(screen.getAllByText(/1,000\.00/)).toHaveLength(3);
    expect(screen.getByText(/1–25 of 60/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Guests" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Browse" })).toHaveAttribute("aria-current", "page");
  });

  it("re-queries the API when a column is sorted and when the page changes", async () => {
    const f = mockApi({ "GET /api/guests": guests(3, 60) });
    renderApp("/browse/guests");
    await screen.findByText("Guest 0");
    await userEvent.click(screen.getByRole("button", { name: /Wallet balance/ }));
    await waitFor(() => expect(f.calls.at(-1).url).toMatch(/sort=wallet_balance/));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(f.calls.at(-1).url).toMatch(/page=2/));
  });

  it("debounces the search box and sends q", async () => {
    const f = mockApi({ "GET /api/guests": guests(1) });
    renderApp("/browse/guests");
    await screen.findByText("Guest 0");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "ana");
    await waitFor(() => expect(f.calls.at(-1).url).toMatch(/q=ana/), { timeout: 2000 });
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });

  it("shows an empty state, and an error state with a working retry", async () => {
    let fail = true;
    mockApi({ "GET /api/guests": () => (fail ? resp(500, { error: { code: "X", message: "db down" } }) : guests(0, 0)) });
    renderApp("/browse/guests");
    expect(await screen.findByRole("alert")).toHaveTextContent("db down");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No guests yet")).toBeInTheDocument();
  });

  it("renders a booking detail and a 404", async () => {
    mockApi({
      "GET /api/bookings/b1": { id: "b1aaaaaa-1", nights: 2, total_cost: "400.00", status: "CHECKED_IN", created_at: "2026-01-01T00:00:00Z", guest: { id: "g1", name: "Asha" }, property: { id: "p1", title: "Sea View", base_price: "200.00" } },
      "GET /api/bookings/nope": resp(404, { error: { code: "NOT_FOUND", message: "x" } }),
    });
    const { unmount } = renderApp("/browse/bookings/b1");
    expect(await screen.findByRole("link", { name: "Sea View" })).toBeInTheDocument();
    expect(screen.getByText("Checked in")).toBeInTheDocument();
    unmount();
    renderApp("/browse/bookings/nope");
    expect(await screen.findByText("Booking not found")).toBeInTheDocument();
  });

  it("'Act as this guest' sets the actor and opens the booking screen", async () => {
    mockApi({
      "GET /api/guests/g1": { id: "g1", name: "Asha", wallet_balance: "900.00", bookingCount: 0, bookings: [] },
      "GET /api/bookings": { total: 0, items: [] },
    });
    renderApp("/browse/guests/g1");
    await userEvent.click(await screen.findByRole("button", { name: "Act as this guest" }));
    expect(await screen.findByRole("heading", { name: "Book a stay" })).toBeInTheDocument();
    expect(within(document.querySelector(".actor")).getByText("Asha")).toBeInTheDocument();
    expect(localStorage.getItem("stayspot.actorId")).toBe("g1");
  });
});
