import { describe, expect, it, vi } from "vitest";
import { api, ApiClientError } from "../src/api.js";
import { estimateTotal, localDayToIso, money, shortId, signedMoney } from "../src/format.js";
import { friendlyError } from "../src/pages/BookStay.jsx";

describe("format", () => {
  it("formats rupees and tolerates junk", () => {
    expect(money("1234.5")).toMatch(/1,234\.50/);
    expect(money(null)).toBe("—");
    expect(money("abc")).toBe("—");
    expect(signedMoney("-50")).toMatch(/^−/);
    expect(signedMoney("50")).toMatch(/^\+/);
    expect(shortId("abcdef123456")).toBe("abcdef12");
  });
  it("multiplies prices without float drift", () => {
    expect(estimateTotal("1999.99", 3)).toBe("5999.97");
    expect(estimateTotal("0.10", 3)).toBe("0.30");
    expect(estimateTotal("abc", 2)).toBeNull();
  });
  it("turns a local calendar day into an ISO instant", () => {
    expect(localDayToIso("")).toBeUndefined();
    const a = new Date(localDayToIso("2026-03-04"));
    expect([a.getFullYear(), a.getMonth(), a.getDate(), a.getHours()]).toEqual([2026, 2, 4, 0]);
    expect(new Date(localDayToIso("2026-03-04", 1)).getDate()).toBe(5);
  });
});

describe("api()", () => {
  it("skips empty params and sends JSON bodies", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    await api("/x", { method: "POST", params: { a: 1, b: "", c: undefined, d: null }, body: { n: 1 } });
    expect(f.mock.calls[0][0]).toBe("/api/x?a=1");
    expect(f.mock.calls[0][1].body).toBe('{"n":1}');
  });
  it("maps error responses to ApiClientError with a stable code", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { code: "INSUFFICIENT_BALANCE", message: "no", details: { shortBy: "5" } } }), { status: 409 }));
    await expect(api("/x")).rejects.toMatchObject({ status: 409, code: "INSUFFICIENT_BALANCE", details: { shortBy: "5" } });
  });
  it("reports network failures and non-JSON errors", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("down"); });
    await expect(api("/x")).rejects.toMatchObject({ code: "NETWORK" });
    vi.stubGlobal("fetch", async () => new Response("<html>", { status: 502 }));
    const err = await api("/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.code).toBe("HTTP_502");
  });
  it("lets aborts through untouched", async () => {
    vi.stubGlobal("fetch", async () => { throw Object.assign(new Error("a"), { name: "AbortError" }); });
    await expect(api("/x")).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("friendlyError", () => {
  it("explains an insufficient balance with numbers", () => {
    const f = friendlyError({ code: "INSUFFICIENT_BALANCE", details: { required: "500", available: "100", shortBy: "400" }, message: "" });
    expect(f.title).toMatch(/Not enough money/);
    expect(f.text).toMatch(/Nothing was booked/);
  });
  it("names the blocking stay", () => {
    expect(friendlyError({ code: "ACTIVE_STAY_EXISTS", details: { activePropertyTitle: "Sea View" }, message: "" }).text).toMatch(/Sea View/);
  });
  it("falls back for unknown codes", () => {
    expect(friendlyError({ code: "WAT", message: "boom" }).title).toBe("Something went wrong");
  });
});
