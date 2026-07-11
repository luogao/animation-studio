// ============================================================
// index.ts — 单进程混合服务器入口
//
// 职责：
// - 一个 HTTP server 同时挂载：Express REST(/api)、WebSocket(/ws)、静态资源
// - 两种运行模式：
//     · 开发模式（NODE_ENV !== "production"）：挂 Vite dev middleware
//       （HMR、按需编译），由 `npm run dev`（tsx watch）驱动
//     · 生产模式（NODE_ENV === "production"）：用 express.static 服务
//       vite build 出来的 dist/，不再起 Vite，启动快、内存省
//
// 生产模式判定：NODE_ENV === "production"。CLAUDE.md 约定生产服务端跑在
// node/tsx ESM 下，前端产物在 dist/（由 vite build 生成）。
// ============================================================

import express from "express";
import { createServer as createHttpServer } from "http";
import { WebSocketServer } from "ws";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleWsMessage, handleWsClose } from "./wsHandler.js";
import { apiRouter } from "./routes.js";
import { uploadsRouter } from "./uploads.js";
import { UPLOADS_DIR } from "./db/index.js";
// 副作用 import：启动时初始化 DB（建目录 + 建表）
import "./db/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const PORT = Number(process.env.PORT) || 5174;
const IS_PROD = process.env.NODE_ENV === "production";
// 生产静态产物目录（vite build 的 outDir，默认 dist）
const STATIC_DIR = path.join(PROJECT_ROOT, "dist");

async function main() {
  const app = express();
  const httpServer = createHttpServer(app);

  // ---- REST API ----
  // uploads 路由先挂（独立 16MB body 解析器），否则会被 /api 的 5MB 解析器拦截。
  app.use("/api/uploads", uploadsRouter);
  app.use("/api", apiRouter);

  // ---- 上传文件同源静态服务 ----
  // 挂在前端服务之前，保证 dev/prod 都能经 /uploads/<file> 取图（导出不污染 canvas）。
  app.use("/uploads", express.static(UPLOADS_DIR));

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

  // ---- 前端服务 ----
  if (IS_PROD) {
    // 生产：express.static 服务 vite build 产物。
    // 注意：必须在 WebSocket/REST 注册之后、catch-all 之前挂。
    if (!fs.existsSync(STATIC_DIR)) {
      console.error(
        `[fatal] 生产模式下找不到静态产物目录 ${STATIC_DIR}。请先执行 npm run build。`
      );
      process.exit(1);
    }
    app.use(express.static(STATIC_DIR));
    // SPA fallback：所有非 /api、非 /ws 的 GET 都回 index.html，
    // 让 /p/:projectId 这类 History API 路由在前端解析。
    app.get("*", (_req, res) => {
      res.sendFile(path.join(STATIC_DIR, "index.html"));
    });
  } else {
    // 开发：挂 Vite dev middleware（HMR + 按需编译）
    // 动态 import —— 生产模式下 vite 是 devDependency、不在 runtime 镜像里，
    // 必须避免顶层静态 import（静态 import 在模块加载时就会解析，不管运行
    // 时走哪个分支，会直接 ERR_MODULE_NOT_FOUND）。
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  // ---- 启动 ----
  httpServer.listen(PORT, () => {
    console.log(`\n  Animation Studio`);
    console.log(`  ────────────────────────`);
    console.log(`  mode  → ${IS_PROD ? "production" : "development"}`);
    console.log(`  HTTP  → http://localhost:${PORT}`);
    console.log(`  WS    → ws://localhost:${PORT}/ws\n`);
  });
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
