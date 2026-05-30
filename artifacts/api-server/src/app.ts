import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";

const app: Express = express();

// Root-level ping endpoint for uptime monitoring (UptimeRobot etc.)
// Define this BEFORE importing routes or other modules that might throw errors during initialization
app.get("/ping", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import router from "./routes";
app.use("/api", router);

export default app;
