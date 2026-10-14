const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });

/** Money arrives from the API as a decimal string ("1234.50"); format for display only. */
export function money(v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? inr.format(n) : "—";
}

export function signedMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return (n > 0 ? "+" : n < 0 ? "−" : "") + inr.format(Math.abs(n));
}

export function dateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" });
}

export const shortId = (id) => (id ? String(id).slice(0, 8) : "—");

/** <input type=date> value (local calendar day) -> ISO instant at local midnight (+ day offset). */
export function localDayToIso(yyyyMmDd, plusDays = 0) {
  if (!yyyyMmDd) return undefined;
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(y, m - 1, d + plusDays, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? undefined : dt.toISOString();
}

export const toDateInput = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Multiply a price string by whole nights without float drift (works in paise). */
export function estimateTotal(priceStr, nights) {
  const p = Math.round(Number(priceStr) * 100);
  if (!Number.isFinite(p) || !Number.isInteger(nights)) return null;
  return ((p * nights) / 100).toFixed(2);
}
