// Central configuration. Reads the repo-root .env (shared with the Part A scripts).
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

module.exports = {
  port: int(process.env.API_PORT, 4000),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  pg: {
    host: process.env.PG_HOST || "localhost",
    port: int(process.env.PG_PORT, 5432),
    database: process.env.PG_DB || "stayspot",
    user: process.env.PG_USER || "postgres",
    password: process.env.PG_PASSWORD || "",
    max: int(process.env.PG_POOL_MAX, 10),
  },
  mongo: {
    uri: process.env.MONGODB_URI || "mongodb://localhost:27017",
    dbName: process.env.MONGODB_DB_NAME || "stayspot",
  },
  limits: {
    defaultPageSize: 25,
    maxPageSize: 100,
    maxNights: 365,
    maxSearchLength: 100,
  },
};
