// ============================================================
// server/db/messages.ts — 对话消息表 CRUD
// ============================================================

import { randomUUID } from "node:crypto";
import { db } from "./index.js";
import { touchProject } from "./projects.js";

export interface MessageRow {
  id: string;
  project_id: string;
  role: "user" | "assistant";
  content: string;
  version_id: string | null;
  created_at: number;
}

export interface InsertMessageInput {
  projectId: string;
  role: "user" | "assistant";
  content: string;
  versionId?: string | null;
}

export function insertMessage(input: InsertMessageInput): MessageRow {
  const now = Date.now();
  const id = randomUUID();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO messages (id, project_id, role, content, version_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.projectId,
      input.role,
      input.content,
      input.versionId ?? null,
      now
    );
    touchProject(input.projectId);
  });
  tx();
  return getMessage(id);
}

export function getMessage(id: string): MessageRow {
  const row = db
    .prepare(`SELECT * FROM messages WHERE id = ?`)
    .get(id) as MessageRow | undefined;
  if (!row) throw new Error(`message not found: ${id}`);
  return row;
}

export function listMessages(projectId: string): MessageRow[] {
  return db
    .prepare(
      `SELECT * FROM messages WHERE project_id = ? ORDER BY created_at ASC`
    )
    .all(projectId) as MessageRow[];
}
