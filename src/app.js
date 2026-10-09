import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import routes from "./routes/index.js";
import { env } from "#config/env.js";
import { legacyConfig } from "#config/legacy.js";
import { notFoundHandler, } from "#middlewares/notFound.js";
import { corsMiddleware } from "#middlewares/cors.middleware.js";
import { errorHandler } from "#middlewares/errorHandler.js";
import consoleRouter from "./modules/console/console.router.js";
import { recordConsoleLog } from "./modules/console/consoleLog.store.js";

const app = express();
app.use(express.static("public"));
app.use(corsMiddleware());
morgan.token("ip", (req) => req.ip);
app.use(morgan(":ip :method  :url :status  :res[content-length] - :response-time ms", {
  skip: (req) => req.path.startsWith("/api/console"),
  stream: {
    write: (line) => {
      const message = line.trim().replace(/((?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+)(\S+)(\s+[1-5]\d{2}\s)/, (_match, method, path, suffix) => `${method}${path.split("?")[0]}${suffix}`);
      const statusCode = Number(message.match(/\s([1-5]\d{2})\s/)?.[1] || 0);
      const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
      recordConsoleLog(level, message, { source: "http" });
      console.log(message);
    },
  },
}));
app.use(cookieParser());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    app: env.appName,
    legacyRoot: legacyConfig.legacyRoot,
    migratedControllers: ["login"]
  });
});
app.use("/api/console", consoleRouter);
app.use('/api/v1/', routes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
