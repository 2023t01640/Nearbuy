import { createServer } from "node:http";
import { Server } from "socket.io";
import { app } from "./app.js";
import { initDb, closeDb } from "./db.js";
import { config } from "./config.js";
import { setupSockets } from "./chat.js";
import { logger } from "./security.js";
await initDb();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: config.origins, credentials: true },
  allowRequest: (req, cb) =>
    cb(
      null,
      !req.headers.origin || config.origins.includes(req.headers.origin),
    ),
  maxHttpBufferSize: 16384,
});
app.set("io", io);
setupSockets(io);
server.listen(config.port, "127.0.0.1", () =>
  logger.info({
    event: "server.started",
    url: "http://127.0.0.1:" + config.port,
  }),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    io.close();
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
  });
