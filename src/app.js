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

const app = express();
app.use(express.static("public"));
app.use(corsMiddleware());
morgan.token("ip", (req) => {
  return req.ip;
});
app.use(morgan(":ip :method  :url :status  :res[content-length] - :response-time ms"));
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
app.use('/api/v1/', routes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
