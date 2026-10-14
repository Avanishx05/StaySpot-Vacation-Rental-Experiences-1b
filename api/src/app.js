const express = require("express");
const cors = require("cors");
const config = require("./config");
const { pool } = require("./db");
const { ApiError, errorHandler } = require("./errors");

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "10kb" }));

  app.get("/api/health", async (req, res, next) => {
    try {
      await pool.query("select 1");
      res.json({ status: "ok" });
    } catch (err) {
      next(err);
    }
  });

  // Teammates: add new screens' routers in routes/index.js - nothing to change here.
  app.use("/api", require("./routes"));

  app.use("/api", (req, res, next) => next(new ApiError(404, "NOT_FOUND", `No such endpoint: ${req.method} ${req.originalUrl}`)));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
