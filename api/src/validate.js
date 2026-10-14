const { badRequest } = require("./errors");
const { limits } = require("./config");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

function uuidParam(value, field = "id") {
  if (!isUuid(value)) throw badRequest(`"${field}" must be a valid UUID.`, { [field]: "Must be a valid UUID." });
  return value.toLowerCase();
}

function optionalUuid(value, field) {
  if (value === undefined || value === "") return undefined;
  return uuidParam(value, field);
}

/** Strict integer parse: "12" ok; "12abc", "1.5", "", "1e3" rejected. */
function parseIntStrict(value) {
  if (typeof value === "number") return Number.isInteger(value) ? value : NaN;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return parseInt(value.trim(), 10);
  return NaN;
}

/** page >= 1, 1 <= limit <= maxPageSize. Bad values are rejected, huge limits are clamped. */
function pagination(query) {
  let page = 1;
  let limit = limits.defaultPageSize;
  if (query.page !== undefined) {
    page = parseIntStrict(query.page);
    if (!Number.isInteger(page) || page < 1 || page > 1000000) throw badRequest('"page" must be a positive integer.', { page: "Must be >= 1." });
  }
  if (query.limit !== undefined) {
    limit = parseIntStrict(query.limit);
    if (!Number.isInteger(limit) || limit < 1) throw badRequest('"limit" must be a positive integer.', { limit: "Must be >= 1." });
    limit = Math.min(limit, limits.maxPageSize);
  }
  return { page, limit, offset: (page - 1) * limit };
}

/** Trim + length-cap a free-text search term. Returns undefined when empty. */
function searchTerm(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw badRequest('"q" must be a string.');
  const t = value.trim();
  if (!t) return undefined;
  if (t.length > limits.maxSearchLength) throw badRequest(`"q" is too long (max ${limits.maxSearchLength} characters).`);
  return t;
}

/** Escape LIKE wildcards so a user typing "50%_off" searches for it literally. */
const likePattern = (term) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Pick an allowed sort (whitelist => safe to interpolate into SQL). */
function sortParam(query, allowed, defaultKey) {
  const key = query.sort === undefined || query.sort === "" ? defaultKey : query.sort;
  if (!Object.prototype.hasOwnProperty.call(allowed, key)) {
    throw badRequest(`"sort" must be one of: ${Object.keys(allowed).join(", ")}.`, { sort: "Unsupported sort field." });
  }
  const dir = String(query.order || "").toLowerCase();
  if (dir && dir !== "asc" && dir !== "desc") throw badRequest('"order" must be "asc" or "desc".', { order: "Use asc or desc." });
  return { key, column: allowed[key].column, dir: dir || allowed[key].dir };
}

/** money string like "1234.5" -> "1234.50"; rejects negatives, >2 decimals, non-numeric, 0. */
function moneyString(value, field, { max }) {
  const raw = typeof value === "number" ? String(value) : value;
  if (typeof raw !== "string" || !/^\d{1,8}(\.\d{1,2})?$/.test(raw.trim())) {
    throw badRequest(`"${field}" must be a positive amount with at most 2 decimals.`, { [field]: "Invalid amount." });
  }
  const n = Number(raw);
  if (!(n > 0)) throw badRequest(`"${field}" must be greater than zero.`, { [field]: "Must be > 0." });
  if (n > max) throw badRequest(`"${field}" cannot exceed ${max}.`, { [field]: `Max ${max}.` });
  return n.toFixed(2);
}

/** Accepts YYYY-MM-DD (whole UTC day) or a full ISO timestamp. */
function parseDateBound(value, field, isEnd) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") throw badRequest(`"${field}" must be a date.`, { [field]: "Invalid date." });
  const v = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(v);
  const d = new Date(dateOnly ? `${v}T00:00:00.000Z` : v);
  // V8 rolls impossible dates over (Feb 31 -> Mar 3), so verify the calendar day round-trips.
  const rolledOver = !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) !== v.slice(0, 10) && !/[+-]\d{2}:?\d{2}$/.test(v);
  if (Number.isNaN(d.getTime()) || rolledOver || (!dateOnly && !/^\d{4}-\d{2}-\d{2}T/.test(v))) {
    throw badRequest(`"${field}" must be YYYY-MM-DD or an ISO timestamp.`, { [field]: "Invalid date." });
  }
  // "to" as a plain date includes that whole day -> exclusive bound is the next midnight.
  if (dateOnly && isEnd) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

module.exports = {
  isUuid, uuidParam, optionalUuid, parseIntStrict, pagination, searchTerm, likePattern,
  sortParam, moneyString, parseDateBound,
};
