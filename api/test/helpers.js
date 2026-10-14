// Test helpers. Tests run against a throw-away database (stayspot_test) built from the
// repo's own sql/*.sql files, so they exercise the REAL schema, trigger, procedures and indexes.
process.env.PG_DB = process.env.TEST_PG_DB || "stayspot_test";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const config = require("../src/config");

const SQL_DIR = path.resolve(__dirname, "../../sql");

async function adminClient(database = "postgres") {
  const c = new Client({ ...config.pg, database });
  await c.connect();
  return c;
}

/** Drop + recreate the test DB and apply sql/01..05 (06 is read-only analytics). */
async function resetDatabase() {
  const admin = await adminClient("postgres");
  await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`, [config.pg.database]);
  await admin.query(`drop database if exists ${config.pg.database}`);
  await admin.query(`create database ${config.pg.database}`);
  await admin.end();

  const db = await adminClient(config.pg.database);
  for (const f of fs.readdirSync(SQL_DIR).filter((x) => /^0[1-5].*\.sql$/.test(x)).sort()) {
    await db.query(fs.readFileSync(path.join(SQL_DIR, f), "utf8"));
  }
  return db; // superuser connection for arranging test data
}

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function addGuest(db, id, name, balance) {
  await db.query("insert into guests (id, name, wallet_balance) values ($1,$2,$3)", [id, name, balance]);
}
async function addProperty(db, id, title, price) {
  await db.query("insert into properties (id, title, base_price, latitude, longitude) values ($1,$2,$3,17.4,78.4)", [id, title, price]);
}

module.exports = { resetDatabase, adminClient, uid, addGuest, addProperty, config };
