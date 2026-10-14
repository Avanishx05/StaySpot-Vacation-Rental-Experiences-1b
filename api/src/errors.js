// One error type + one place that translates database errors into friendly HTTP errors.
// Response shape (see docs/api_endpoints.md): { error: { code, message, details? } }

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const notFound = (what = "Resource") => new ApiError(404, "NOT_FOUND", `${what} not found.`);
const badRequest = (message, details) => new ApiError(400, "VALIDATION_ERROR", message, details);

/**
 * Map errors raised by PostgreSQL (our stored procedures set `hint`) to ApiErrors.
 * Anything unrecognised becomes a generic 500 - internals are never leaked to the browser.
 */
function fromPgError(err) {
  if (err instanceof ApiError) return err;
  const hint = err && err.hint;
  switch (hint) {
    case "INSUFFICIENT_BALANCE":
      return new ApiError(422, "INSUFFICIENT_BALANCE", "Your wallet balance is too low for this booking.");
    case "ACTIVE_STAY_EXISTS":
      return new ApiError(409, "ACTIVE_STAY_EXISTS", "This guest already has a stay in progress (CHECKED_IN).");
    case "INVALID_TRANSITION":
      return new ApiError(409, "INVALID_TRANSITION", err.message);
    case "INVALID_NIGHTS":
      return new ApiError(400, "VALIDATION_ERROR", err.message, { nights: err.message });
    case "AMOUNT_TOO_LARGE":
      return new ApiError(422, "AMOUNT_TOO_LARGE", "The total cost is too large to process.");
    case "NOT_FOUND":
      return new ApiError(404, "NOT_FOUND", err.message);
    default:
  }
  switch (err && err.code) {
    case "23514": // CHECK violation, e.g. wallet_balance >= 0 (safety net; the procedure checks first)
      return new ApiError(422, "INSUFFICIENT_BALANCE", "Your wallet balance is too low for this operation.");
    case "22003": // numeric_value_out_of_range
      return new ApiError(422, "AMOUNT_TOO_LARGE", "That amount is too large to process.");
    case "22P02": // invalid_text_representation (bad uuid etc.) - normally caught earlier by validation
      return new ApiError(400, "VALIDATION_ERROR", "Malformed input.");
    case "55P03": // lock_not_available
    case "57014": // statement timeout / cancelled
    case "40P01": // deadlock detected
    case "40001": // serialization failure
      return new ApiError(503, "BUSY", "The system is busy right now. Please try again in a moment.");
    case "57P01": // admin shutdown
    case "53300": // too many connections
    case "ECONNREFUSED":
    case "ENOTFOUND":
    case "ETIMEDOUT":
      return new ApiError(503, "DB_UNAVAILABLE", "The database is unavailable. Please try again shortly.");
    default:
  }
  if (err && /timeout exceeded when trying to connect|Connection terminated|ECONNREFUSED/i.test(err.message || "")) {
    return new ApiError(503, "DB_UNAVAILABLE", "The database is unavailable. Please try again shortly.");
  }
  return null;
}

// Express error middleware (4 args).
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Malformed JSON bodies / oversized payloads from express.json()
  if (err && err.type === "entity.parse.failed") err = badRequest("Request body is not valid JSON.");
  if (err && err.type === "entity.too.large") err = new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");

  const mapped = fromPgError(err);
  if (mapped) {
    return res.status(mapped.status).json({
      error: { code: mapped.code, message: mapped.message, ...(mapped.details ? { details: mapped.details } : {}) },
    });
  }
  console.error(`[api] ${req.method} ${req.originalUrl} ->`, err);
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong on our side. Please try again." } });
}

module.exports = { ApiError, notFound, badRequest, fromPgError, errorHandler };
