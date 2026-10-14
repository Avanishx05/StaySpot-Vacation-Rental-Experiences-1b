// Tiny fetch wrapper. Every failure becomes an ApiClientError with a stable `code`
// so screens can show friendly messages instead of raw errors.
const BASE = import.meta.env?.VITE_API_BASE || "";

export class ApiClientError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(path, { method = "GET", body, params, signal } = {}) {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  });
  const url = `${BASE}/api${path}${qs.toString() ? `?${qs}` : ""}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err && err.name === "AbortError") throw err;
    throw new ApiClientError(0, "NETWORK", "Can't reach the server. Check your connection and that the API is running.");
  }
  let data = null;
  try { data = await res.json(); } catch (_) { /* non-JSON body */ }
  if (!res.ok) {
    const e = data && data.error;
    throw new ApiClientError(res.status, (e && e.code) || "HTTP_" + res.status, (e && e.message) || `Request failed (${res.status}).`, e && e.details);
  }
  return data;
}

export const isAbort = (e) => e && e.name === "AbortError";
