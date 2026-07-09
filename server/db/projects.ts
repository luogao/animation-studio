// ============================================================
// server/db/projects.ts — 项目表 CRUD
// ============================================================

import { randomUUID } from "node:crypto";
import { db } from "./index.js";
import {
  DEFAULT_SCENE_CONFIG,
  type SceneConfig,
} from "../../src/types/scene.js";
import { listVersions } from "./versions.js";
import { listMessages } from "./messages.js";

export interface ProjectRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface ProjectDetail {
  project: ProjectRow;
  versions: ReturnType<typeof listVersions>;
  messages: ReturnType<typeof listMessages>;
  headId: string | null;
  draftId: string | null;
}

// ------------------------------------------------------------
// 创建项目：插一行 project + 一个 committed v1（用 DEFAULT_SCENE_CONFIG）
// ------------------------------------------------------------

export function createProject(title?: string): ProjectRow {
  const now = Date.now();
  const id = randomUUID();
  const safeTitle = (title?.trim() || "未命名动画").slice(0, 200);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO projects (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`
    ).run(id, safeTitle, now, now);

    // 初始 committed 版本：sequence=1, parent=NULL
    const initialVersionId = randomUUID();
    db.prepare(
      `INSERT INTO versions (id, project_id, parent_id, status, sequence, label, config_json, created_at, committed_at)
       VALUES (?, ?, NULL, 'committed', 1, 'initial', ?, ?, ?)`
    ).run(
      initialVersionId,
      id,
      JSON.stringify(DEFAULT_SCENE_CONFIG),
      now,
      now
    );
  });

  tx();
  return getProjectRow(id);
}

// ------------------------------------------------------------
// 列出所有项目（按更新时间倒序）
// ------------------------------------------------------------

export function listProjects(): (ProjectRow & {
  head_sequence: number | null;
  draft_id: string | null;
})[] {
  return db
    .prepare(
      `SELECT
         p.*,
         (SELECT MAX(v.sequence) FROM versions v WHERE v.project_id = p.id AND v.status = 'committed') AS head_sequence,
         (SELECT v.id FROM versions v WHERE v.project_id = p.id AND v.status = 'draft' LIMIT 1) AS draft_id
       FROM projects p
       ORDER BY p.updated_at DESC`
    )
    .all() as (ProjectRow & {
    head_sequence: number | null;
    draft_id: string | null;
  })[];
}

// ------------------------------------------------------------
// 取单个项目（含版本 + 消息 + head + draft 指针）
// ------------------------------------------------------------

export function getProjectRow(id: string): ProjectRow {
  const row = db
    .prepare(`SELECT * FROM projects WHERE id = ?`)
    .get(id) as ProjectRow | undefined;
  if (!row) throw new Error(`project not found: ${id}`);
  return row;
}

export function getProject(id: string): ProjectDetail {
  const project = getProjectRow(id);
  const versions = listVersions(id);
  const messages = listMessages(id);

  // 取 sequence 最大的 committed 作为 head
  const headVersion = versions
    .filter((v) => v.status === "committed")
    .sort((a, b) => b.sequence - a.sequence)[0];
  const draft = versions.find((v) => v.status === "draft") ?? null;

  return {
    project,
    versions,
    messages,
    headId: headVersion?.id ?? null,
    draftId: draft?.id ?? null,
  };
}

// ------------------------------------------------------------
// 改项目标题 / 更新 updated_at
// ------------------------------------------------------------

export function renameProject(id: string, title: string): void {
  db.prepare(
    `UPDATE projects SET title = ?, updated_at = ? WHERE id = ?`
  ).run(title.slice(0, 200), Date.now(), id);
}

export function touchProject(id: string): void {
  db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).run(
    Date.now(),
    id
  );
}

// ------------------------------------------------------------
// Claude Agent SDK 会话 id —— 用于 query() 的 sessionId / resume
// 首次对话时 null，agent.ts 调用完会调 setSessionId 写回
// ------------------------------------------------------------
export function getSessionId(projectId: string): string | null {
  const row = db
    .prepare(`SELECT claude_session_id FROM projects WHERE id = ?`)
    .get(projectId) as { claude_session_id: string | null } | undefined;
  return row?.claude_session_id ?? null;
}

export function setSessionId(projectId: string, sessionId: string): void {
  db.prepare(
    `UPDATE projects SET claude_session_id = ? WHERE id = ?`
  ).run(sessionId, projectId);
}

// ------------------------------------------------------------
// 删除项目（级联删除 versions、messages 通过 FK）
// ------------------------------------------------------------
export function deleteProject(id: string): void {
  // 先验证项目存在
  getProjectRow(id);
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
}

// 重新导出 SceneConfig 类型供 routes 使用
export type { SceneConfig };
