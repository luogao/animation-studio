// ============================================================
// server/db/versions.ts — 版本表 CRUD（树状 + draft）
// ============================================================

import { randomUUID } from "node:crypto";
import { db } from "./index.js";
import { touchProject } from "./projects.js";
import type { SceneConfig } from "../../src/types/scene.js";

export interface VersionRow {
  id: string;
  project_id: string;
  parent_id: string | null;
  status: "draft" | "committed";
  sequence: number;
  label: string | null;
  config_json: string;
  created_at: number;
  committed_at: number | null;
}

export interface VersionMeta {
  id: string;
  projectId: string;
  parentId: string | null;
  status: "draft" | "committed";
  sequence: number;
  label: string | null;
  config: SceneConfig;
  createdAt: number;
  committedAt: number | null;
}

// ------------------------------------------------------------
// 行 → 含解析 config 的 meta
// ------------------------------------------------------------

function rowToMeta(row: VersionRow): VersionMeta {
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    status: row.status,
    sequence: row.sequence,
    label: row.label,
    config: JSON.parse(row.config_json) as SceneConfig,
    createdAt: row.created_at,
    committedAt: row.committed_at,
  };
}

// ------------------------------------------------------------
// 列出某项目的所有版本（按 sequence 升序）
// ------------------------------------------------------------

export function listVersions(projectId: string): VersionMeta[] {
  const rows = db
    .prepare(
      `SELECT * FROM versions WHERE project_id = ? ORDER BY sequence ASC, created_at ASC`
    )
    .all(projectId) as VersionRow[];
  return rows.map(rowToMeta);
}

export function getVersion(versionId: string): VersionMeta {
  const row = db
    .prepare(`SELECT * FROM versions WHERE id = ?`)
    .get(versionId) as VersionRow | undefined;
  if (!row) throw new Error(`version not found: ${versionId}`);
  return rowToMeta(row);
}

// ------------------------------------------------------------
// 取当前 draft（如有）
// ------------------------------------------------------------

export function getDraft(projectId: string): VersionMeta | null {
  const row = db
    .prepare(
      `SELECT * FROM versions WHERE project_id = ? AND status = 'draft' LIMIT 1`
    )
    .get(projectId) as VersionRow | undefined;
  return row ? rowToMeta(row) : null;
}

// ------------------------------------------------------------
// 取当前 head（sequence 最大的 committed）
// ------------------------------------------------------------

export function getHead(projectId: string): VersionMeta | null {
  const row = db
    .prepare(
      `SELECT * FROM versions WHERE project_id = ? AND status = 'committed'
       ORDER BY sequence DESC, committed_at DESC LIMIT 1`
    )
    .get(projectId) as VersionRow | undefined;
  return row ? rowToMeta(row) : null;
}

// ------------------------------------------------------------
// 下一个 sequence（per-project 单调递增）
// ------------------------------------------------------------

function nextSequence(projectId: string): number {
  const row = db
    .prepare(
      `SELECT MAX(sequence) AS max_seq FROM versions WHERE project_id = ?`
    )
    .get(projectId) as { max_seq: number | null };
  return (row.max_seq ?? 0) + 1;
}

// ------------------------------------------------------------
// 创建 draft：parent = baseVersionId（通常是当前 head）
// 一个项目同时只能有一个 draft（DB 索引强约束）
// ------------------------------------------------------------

export function createDraft(
  projectId: string,
  parentId: string | null,
  config: SceneConfig,
  label?: string
): VersionMeta {
  const now = Date.now();
  const id = randomUUID();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO versions (id, project_id, parent_id, status, sequence, label, config_json, created_at, committed_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, NULL)`
    ).run(
      id,
      projectId,
      parentId,
      nextSequence(projectId),
      label ?? null,
      JSON.stringify(config),
      now
    );
    touchProject(projectId);
  });

  try {
    tx();
  } catch (err) {
    // 唯一索引冲突 = 项目已有 draft
    throw new Error(
      `project ${projectId} already has a draft; commit or delete it first`
    );
  }

  return getVersion(id);
}

// ------------------------------------------------------------
// 更新 draft 的 config（不动 sequence / parent）
// ------------------------------------------------------------

export function updateDraft(
  draftId: string,
  config: SceneConfig
): VersionMeta {
  const tx = db.transaction(() => {
    const res = db
      .prepare(
        `UPDATE versions SET config_json = ? WHERE id = ? AND status = 'draft'`
      )
      .run(JSON.stringify(config), draftId);
    if (res.changes === 0) {
      throw new Error(`draft not found or not in draft status: ${draftId}`);
    }
    const draft = getVersion(draftId);
    touchProject(draft.projectId);
  });
  tx();
  return getVersion(draftId);
}

// ------------------------------------------------------------
// 提交 draft：status 改 committed，写 committed_at，可加 label
// ------------------------------------------------------------

export function commitDraft(
  draftId: string,
  label?: string
): VersionMeta {
  const now = Date.now();
  const tx = db.transaction(() => {
    if (label !== undefined) {
      db.prepare(
        `UPDATE versions SET status = 'committed', committed_at = ?, label = ? WHERE id = ? AND status = 'draft'`
      ).run(now, label, draftId);
    } else {
      db.prepare(
        `UPDATE versions SET status = 'committed', committed_at = ? WHERE id = ? AND status = 'draft'`
      ).run(now, draftId);
    }
    const v = getVersion(draftId);
    touchProject(v.projectId);
  });
  tx();
  return getVersion(draftId);
}

// ------------------------------------------------------------
// 删除 draft（discard）
// ------------------------------------------------------------

export function deleteDraft(draftId: string): void {
  const v = getVersion(draftId);
  if (v.status !== "draft") {
    throw new Error(`version ${draftId} is not a draft`);
  }
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM versions WHERE id = ?`).run(draftId);
    touchProject(v.projectId);
  });
  tx();
}

// ------------------------------------------------------------
// 回滚 = 在 target 之上开一个新的 committed 版本（head 移动）
// 1. 如果当前项目有 draft，先提交它（保留为分支历史）
// 2. 创建新的 committed 版本，parent = targetVersionId，config = target 的 config
// 3. 新版本成为新的 head
//
// 注意：这不会删除任何历史，git-style 分支自然形成。
// ------------------------------------------------------------

export function rollbackTo(
  projectId: string,
  targetVersionId: string
): VersionMeta {
  const target = getVersion(targetVersionId);
  if (target.projectId !== projectId) {
    throw new Error(
      `version ${targetVersionId} does not belong to project ${projectId}`
    );
  }

  const now = Date.now();
  const newId = randomUUID();

  const tx = db.transaction(() => {
    // 1. 提交现有 draft（如有）
    const existingDraft = getDraft(projectId);
    if (existingDraft) {
      db.prepare(
        `UPDATE versions SET status = 'committed', committed_at = ?, label = ?
         WHERE id = ? AND status = 'draft'`
      ).run(now, "auto: pre-rollback", existingDraft.id);
    }

    // 2. 创建新的 committed 版本
    db.prepare(
      `INSERT INTO versions (id, project_id, parent_id, status, sequence, label, config_json, created_at, committed_at)
       VALUES (?, ?, ?, 'committed', ?, ?, ?, ?, ?)`
    ).run(
      newId,
      projectId,
      targetVersionId,
      nextSequence(projectId),
      `rollback to v${target.sequence}`,
      JSON.stringify(target.config), // 复制 target 的 config
      now,
      now
    );

    touchProject(projectId);
  });

  tx();
  return getVersion(newId);
}
