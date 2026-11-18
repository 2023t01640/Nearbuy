import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import swaggerUI from "swagger-ui-express";
import { config, production } from "./config.js";
import { authRouter } from "./auth.js";
import { marketplace } from "./marketplace.js";
import { chatRouter } from "./chat.js";
import { verificationRouter } from "./verification.js";
import { adminRouter } from "./admin.js";
import { reports } from "./reports.js";
import { logger, audit, limit } from "./security.js";
import { openapi } from "./openapi.js";
export const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
    strictTransportSecurity: production ? undefined : false,
  }),
);
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || config.origins.includes(origin)) cb(null, true);
      else cb(Object.assign(new Error("Origin not allowed"), { status: 403 }));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-NearBuy-CSRF"],
  }),
);
app.use(express.json({ limit: "32kb" }), cookieParser());
app.use(
  morgan(
    (tokens, req, res) =>
      JSON.stringify({
        method: tokens.method(req, res),
        path: req.path,
        status: tokens.status(req, res),
        durationMs: tokens["response-time"](req, res),
      }),
    {
      stream: {
        write: (message) =>
          logger.info({ event: "http", ...JSON.parse(message) }),
      },
    },
  ),
);
app.use("/api/v1", limit(600));
app.get("/api/v1/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/verification", verificationRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/reports", reports);
app.use("/api/v1", marketplace, chatRouter);
app.use(
  "/uploads",
  express.static(config.uploadDir, {
    dotfiles: "deny",
    immutable: true,
    maxAge: "1d",
    setHeaders(res) {
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  }),
);
app.get("/api-docs.json", (req, res) => res.json(openapi));
app.use("/api-docs", swaggerUI.serve, swaggerUI.setup(openapi));
app.use((req, res) => res.status(404).json({ error: "Endpoint not found" }));
app.use(async (err, req, res, next) => {
  const status =
    err.status ||
    (err.code === "23505"
      ? 409
      : err.code === "23503"
        ? 409
        : err.code === "LIMIT_FILE_SIZE"
          ? 413
          : err.name === "MulterError"
            ? 400
            : 500);
  logger.error({
    event: "api.error",
    method: req.method,
    path: req.path,
    status,
    errorCode: err.code || err.name,
  });
  try {
    await audit(req.user?.id, "api.error", req.path, { status });
  } catch {
    logger.error({ event: "audit.write_failed" });
  }
  if (res.headersSent) return next(err);
  res.status(status).json({
    error:
      status >= 500
        ? "An internal error occurred"
        : err.code === "23505"
          ? "This record already exists"
          : err.code === "23503"
            ? "Record is in use"
            : err.code === "LIMIT_FILE_SIZE"
              ? "Image must be 5 MB or smaller"
              : err.message,
  });
});
