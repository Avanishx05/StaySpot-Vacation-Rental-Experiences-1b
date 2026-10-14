import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderApp, resp } from "./helpers.jsx";

const PROP = { id: "p1", title: "Sea View", base_price: "200.00" };
const base = (extra = {}) => ({
  "GET /api/guests/g1": { id: "g1", name: "Asha", wallet_balance: "1000.00" },
  "GET /api/bookings": { total: 0, items: [] },
  "GET /api/properties": { items: [PROP], total: 1 },
  ...extra,
});

async function pickProperty() {
  await userEvent.click(screen.getByPlaceholderText(/Search properties by title/));
  await userEvent.click(await screen.findByRole("button", { name: /Sea View/ }));
}

describe("Book a stay", () => {
  it("asks who you are when nobody is selected", async () => {
    mockApi(base());
    renderApp("/book");
    expect(await screen.findByText("Choose who you are first")).toBeInTheDocument();
  });

  it("restores the saved guest, validates, estimates and books", async () => {
    localStorage.setItem("stayspot.actorId", "g1");
    let balance = "1000.00";
    const f = mockApi(base({
      "GET /api/guests/g1": () => ({ id: "g1", name: "Asha", wallet_balance: balance }),
      "POST /api/bookings": () => { balance = "600.00"; return { booking: { id: "bk123456-0", property: PROP, total_cost: "400.00" }, balanceBefore: "1000.00", balanceAfter: "600.00", auditEntry: { action_type: "DEBIT", amount_changed: "-400.00", balance_after: "600.00" } }; },
    }));
    renderApp("/book");
    await screen.findByText(/Wallet balance:/);

    await userEvent.click(screen.getByRole("button", { name: "Book stay" }));
    expect(await screen.findByText("Please correct the form")).toBeInTheDocument();
    expect(f.calls.some((c) => c.method === "POST")).toBe(false);

    await pickProperty();
    await userEvent.clear(screen.getByLabelText("Nights"));
    await userEvent.type(screen.getByLabelText("Nights"), "2");
    expect(screen.getByText("Estimated total").nextSibling).toHaveTextContent("400.00");

    await userEvent.click(screen.getByRole("button", { name: "Book stay" }));
    expect(await screen.findByText(/Booking confirmed/)).toBeInTheDocument();
    expect(f.calls.find((c) => c.method === "POST").body).toEqual({ guestId: "g1", propertyId: "p1", nights: 2 });
    expect(screen.getByText(/1,000\.00 → ₹600\.00|1,000\.00.*600\.00/)).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector(".actor-current")).toHaveTextContent("600.00")); // header balance refreshed
  });

  it("rejects bad night counts locally", async () => {
    localStorage.setItem("stayspot.actorId", "g1");
    const f = mockApi(base());
    renderApp("/book");
    await screen.findByText(/Wallet balance:/);
    await pickProperty();
    await userEvent.clear(screen.getByLabelText("Nights"));
    await userEvent.type(screen.getByLabelText("Nights"), "1.5");
    await userEvent.click(screen.getByRole("button", { name: "Book stay" }));
    expect((await screen.findAllByText(/whole number of nights/)).length).toBeGreaterThan(0);
    expect(f.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("explains an insufficient balance in plain words", async () => {
    localStorage.setItem("stayspot.actorId", "g1");
    mockApi(base({ "POST /api/bookings": resp(409, { error: { code: "INSUFFICIENT_BALANCE", message: "x", details: { required: "9000.00", available: "1000.00", shortBy: "8000.00" } } }) }));
    renderApp("/book");
    await screen.findByText(/Wallet balance:/);
    await pickProperty();
    await userEvent.click(screen.getByRole("button", { name: "Book stay" }));
    expect(await screen.findByText("Not enough money in your wallet")).toBeInTheDocument();
    expect(screen.getByText(/Nothing was booked and nothing was charged/)).toBeInTheDocument();
  });

  it("offers the next status step and surfaces the one-active-stay rule", async () => {
    localStorage.setItem("stayspot.actorId", "g1");
    const b = (id, status) => ({ id, nights: 1, total_cost: "200.00", status, property: PROP });
    const f = mockApi(base({
      "GET /api/bookings": { total: 2, items: [b("bkaaaaaa-1", "CONFIRMED"), b("bkbbbbbb-2", "CHECKED_IN")] },
      "PATCH /api/bookings/bkaaaaaa-1/status": resp(409, { error: { code: "ACTIVE_STAY_EXISTS", message: "x", details: { activePropertyTitle: "Sea View" } } }),
    }));
    renderApp("/book");
    await userEvent.click(await screen.findByRole("button", { name: "Check in" }));
    expect(await screen.findByText("You already have a stay in progress")).toBeInTheDocument();
    expect(f.calls.find((c) => c.method === "PATCH").body).toEqual({ status: "CHECKED_IN" });
    expect(screen.getByRole("button", { name: "Complete stay" })).toBeInTheDocument();
  });
});
