import express from "express";
import { createServer as createHttpServer } from "http";
import { WebSocketServer } from "ws";
import { createServer as createViteServer } from "vite";
import { handleWsMessage, handleWsClose } from "./wsHandler.js";
import { apiRouter } from "./routes.js";
// 副作用 import：启动时初始化 DB（建目录 + 建表）
import "./db/index.js";

const PORT = 5174;

async function main() {
  const app = express();
  const httpServer = createHttpServer(app);

  // ---- REST API ----
  app.use("/api", apiRouter);

  // ---- WebSocket Server ----
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    console.log("[ws] client connected");
    ws.on("message", (raw) => {
      handleWsMessage(ws, raw.toString());
    });
    ws.on("close", () => {
      console.log("[ws] client disconnected");
      // 清理订阅集合，避免向 dead socket 广播
      handleWsClose(ws);
    });
    ws.on("error", (err) => {
      console.error("[ws] error:", err.message);
    });
  });

  // ---- Vite dev middleware（挂载到 Express）----
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);

  // ---- 启动 ----
  httpServer.listen(PORT, () => {
    console.log(`\n  Animation Studio`);
    console.log(`  ────────────────────────`);
    console.log(`  HTTP  → http://localhost:${PORT}`);
    console.log(`  WS    → ws://localhost:${PORT}/ws\n`);
  });
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
