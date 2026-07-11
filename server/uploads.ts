// ============================================================
// server/uploads.ts — 图片上传 REST 路由
//
// 挂在 /api/uploads（POST）。客户端把图片读成 base64 data URL POST 上来，
// 这里解码落盘到 UPLOADS_DIR，返回同源 /uploads/<file> URL。
// 同源服务 → 导出栅格化时 canvas 不被跨域污染。
//
// 用独立的 body 解析器（16MB 上限），不复用 routes.ts 的 5MB 全局解析器，
// 因为 base64 会膨胀约 33%，8MB 图片过线后约 11MB。
// ============================================================

import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { UPLOADS_DIR } from "./db/index.js";

export const uploadsRouter = Router();

const MAX_BODY = 16 * 1024 * 1024; // base64 后的体积上限
const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
};

// 独立 JSON 解析（16MB）—— 仅对 POST 生效
uploadsRouter.use((req, res, next) => {
  if (req.method !== "POST") return next();
  let data = "";
  req.on("data", (chunk) => {
    data += chunk;
    if (data.length > MAX_BODY) {
      res.status(413).json({ error: "payload too large" });
      req.destroy();
    }
  });
  req.on("end", () => {
    try {
      req.body = data ? JSON.parse(data) : {};
      next();
    } catch {
      res.status(400).json({ error: "invalid JSON" });
    }
  });
});

uploadsRouter.post("/", (req: Request, res: Response) => {
  const { dataUrl, mime, filename } = (req.body ?? {}) as {
    dataUrl?: string;
    mime?: string;
    filename?: string;
  };
  if (!dataUrl || typeof dataUrl !== "string") {
    res.status(400).json({ error: "missing dataUrl" });
    return;
  }
  const ext = mime && ALLOWED_MIME[mime];
  if (!ext) {
    res.status(400).json({ error: `unsupported mime: ${mime ?? "(none)"}` });
    return;
  }
  // 解析 data URL: data:<mime>;base64,<payload>
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: "invalid dataUrl (expected base64)" });
    return;
  }
  const buf = Buffer.from(match[1], "base64");
  mkdirSync(UPLOADS_DIR, { recursive: true });
  const id = randomUUID();
  const fname = `${id}.${ext}`;
  writeFileSync(path.join(UPLOADS_DIR, fname), buf);
  console.log(
    `[uploads] stored ${fname} (${(buf.length / 1024).toFixed(1)}KB${
      filename ? ` from ${filename}` : ""
    })`
  );
  res.status(201).json({ id, url: `/uploads/${fname}`, mime });
});
