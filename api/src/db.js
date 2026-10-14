const { Pool, types } = require("pg");
const config = require("./config");

// NUMERIC (oid 1700) -> keep as string so money never goes through floating point.
// The browser formats it for display only.
types.setTypeParser(1700, (v) => v);
// BIGINT (oid 20) -> number (our counts stay far below 2^53).
types.setTypeParser(20, (v) => Number(v));

const pool = new Pool({
  ...config.pg,
  // A stuck query must not hang the UI forever.
  statement_timeout: 10000,
  idle_in_transaction_session_timeout: 15000,
  connectionTimeoutMillis: 5000,
});

// An idle client erroring (e.g. DB restarted) must not crash the process.
pool.on("error", (err) => console.error("[pg] idle client error:", err.message));

const query = (text, params) => pool.query(text, params);

/** Run fn(client) inside BEGIN/COMMIT; ROLLBACK and rethrow on any error. */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* connection already gone */
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
