// ============================================================
// server/routes.ts — REST API 路由
//
// 挂在 /api 下。所有 CRUD 操作走这里。
// WS（/ws）只保留给 agent 流式交互。
// ============================================================

import { Router, type Request, type Response } from "express";
import {
  createProject,
  listProjects,
  getProject,
  renameProject,
  type SceneConfig,
} from "./db/projects.js";
import {
  createDraft,
  updateDraft,
  commitDraft,
  deleteDraft,
  rollbackTo,
  getVersion,
  listVersions,
} from "./db/versions.js";
import { insertMessage, listMessages } from "./db/messages.js";
import {
  readLlmConfig,
  writeLlmConfig,
  type LlmConfig,
} from "./llm-config.js";

export const apiRouter = Router();

// JSON 解析（Express 4.x 不内置）
apiRouter.use((req, res, next) => {
  if (req.method === "GET" || req.method === "DELETE") return next();
  let data = "";
  req.on("data", (chunk) => {
    data += chunk;
    if (data.length > 5 * 1024 * 1024) {
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

// ============================================================
// /api/projects
// ============================================================

apiRouter.get("/projects", (_req, res) => {
  res.json(listProjects());
});

apiRouter.post("/projects", (req, res) => {
  const { title } = (req.body ?? {}) as { title?: string };
  const project = createProject(title);
  res.status(201).json(getProject(project.id));
});

apiRouter.get("/projects/:id", (req, res) => {
  try {
    res.json(getProject(req.params.id));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

apiRouter.patch("/projects/:id", (req, res) => {
  const { title } = (req.body ?? {}) as { title?: string };
  if (!title) {
    res.status(400).json({ error: "title required" });
    return;
  }
  try {
    renameProject(req.params.id, title);
    res.json(getProject(req.params.id));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// ============================================================
// /api/projects/:id/messages
// ============================================================

apiRouter.get("/projects/:id/messages", (req, res) => {
  try {
    res.json(listMessages(req.params.id));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

apiRouter.post("/projects/:id/messages", (req, res) => {
  const { role, content, versionId } = (req.body ?? {}) as {
    role?: "user" | "assistant";
    content?: string;
    versionId?: string;
  };
  if (!role || !content) {
    res.status(400).json({ error: "role and content required" });
    return;
  }
  if (role !== "user" && role !== "assistant") {
    res.status(400).json({ error: "role must be 'user' or 'assistant'" });
    return;
  }
  try {
    const msg = insertMessage({
      projectId: req.params.id,
      role,
      content,
      versionId,
    });
    res.status(201).json(msg);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// ============================================================
// /api/projects/:id/versions
// ============================================================

apiRouter.get("/projects/:id/versions", (req, res) => {
  try {
    res.json(listVersions(req.params.id));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// 创建 draft
apiRouter.post("/projects/:id/versions", (req, res) => {
  const { parentId, config, label } = (req.body ?? {}) as {
    parentId?: string | null;
    config?: SceneConfig;
    label?: string;
  };
  if (!config) {
    res.status(400).json({ error: "config required" });
    return;
  }
  try {
    const draft = createDraft(req.params.id, parentId ?? null, config, label);
    res.status(201).json(draft);
  } catch (err) {
    // draft 已存在 → 409 Conflict
    res.status(409).json({ error: (err as Error).message });
  }
});

// 更新 draft 内容
apiRouter.patch("/projects/:id/versions/:vid", (req, res) => {
  const { config } = (req.body ?? {}) as { config?: SceneConfig };
  if (!config) {
    res.status(400).json({ error: "config required" });
    return;
  }
  try {
    const v = getVersion(req.params.vid);
    if (v.projectId !== req.params.id) {
      res.status(400).json({ error: "version does not belong to project" });
      return;
    }
    if (v.status !== "draft") {
      res.status(400).json({ error: "version is not a draft" });
      return;
    }
    res.json(updateDraft(req.params.vid, config));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// 提交 draft
apiRouter.post("/projects/:id/versions/:vid/commit", (req, res) => {
  const { label } = (req.body ?? {}) as { label?: string };
  try {
    const v = getVersion(req.params.vid);
    if (v.projectId !== req.params.id) {
      res.status(400).json({ error: "version does not belong to project" });
      return;
    }
    res.json(commitDraft(req.params.vid, label));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// 删除 draft（discard）
apiRouter.delete("/projects/:id/versions/:vid", (req, res) => {
  try {
    const v = getVersion(req.params.vid);
    if (v.projectId !== req.params.id) {
      res.status(400).json({ error: "version does not belong to project" });
      return;
    }
    if (v.status !== "draft") {
      res.status(400).json({ error: "version is not a draft" });
      return;
    }
    deleteDraft(req.params.vid);
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// ============================================================
// /api/projects/:id/rollback
// ============================================================

apiRouter.post("/projects/:id/rollback", (req, res) => {
  const { targetVersionId } = (req.body ?? {}) as {
    targetVersionId?: string;
  };
  if (!targetVersionId) {
    res.status(400).json({ error: "targetVersionId required" });
    return;
  }
  try {
    const newHead = rollbackTo(req.params.id, targetVersionId);
    res.status(201).json(newHead);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// ============================================================
// LLM 配置
// ============================================================

// GET /api/llm-config
apiRouter.get("/llm-config", (_req, res) => {
  try {
    const config = readLlmConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/llm-config
apiRouter.put("/llm-config", (req, res) => {
  try {
    const { model, apiKey, baseUrl } = (req.body ?? {}) as LlmConfig;
    if (!model || !model.trim()) {
      res.status(400).json({ error: "model is required" });
      return;
    }
    writeLlmConfig({
      model: model.trim(),
      apiKey: (apiKey ?? "").trim(),
      baseUrl: (baseUrl ?? "").trim(),
    });
    res.json(readLlmConfig());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============================================================
// 错误处理兜底
// ============================================================

apiRouter.use((err: unknown, _req: Request, res: Response) => {
  console.error("[api] unhandled:", err);
  res.status(500).json({ error: (err as Error).message });
});
