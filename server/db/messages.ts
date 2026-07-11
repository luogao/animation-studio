// ============================================================
// server/db/messages.ts — 对话消息表 CRUD
//
// tool_calls_json：assistant 消息携带的工具调用历史（JSON 数组），
// shape 与 src/store/agentStore.ts 的 ToolCallRecord 一致。
// 持久化它，刷新页面/重连后卡片不会消失。
// ============================================================

import { randomUUID } from "node:crypto";
import { db } from "./index.js";
import { touchProject } from "./projects.js";
import type { MessageAttachment } from "../../src/types/message.js";

// ── ToolCallRecord（与 src/store/agentStore.ts 同 shape）──
// 这里独立定义避免 server 反向 import 客户端 store；结构兼容即可。
export interface ToolCallRecord {
  toolCallId: string;
  toolName: string;
  input?: unknown;
  status: "running" | "complete" | "error";
  resultContent?: string;
  isError?: boolean;
}

export interface MessageRow {
  id: string;
  project_id: string;
  role: "user" | "assistant";
  content: string;
  version_id: string | null;
  created_at: number;
  // 反序列化后字段（DB 列名 tool_calls_json）—— 不存在时为 undefined
  tool_calls?: ToolCallRecord[];
  // 反序列化后字段（DB 列名 attachments_json）—— 不存在时为 undefined
  attachments?: MessageAttachment[];
}

export interface InsertMessageInput {
  projectId: string;
  role: "user" | "assistant";
  content: string;
  versionId?: string | null;
  // 仅 assistant 消息会携带；user 消息忽略此字段
  toolCalls?: ToolCallRecord[];
  // 仅 user 消息会携带（图片附件）；assistant 消息忽略此字段
  attachments?: MessageAttachment[];
}

export function insertMessage(input: InsertMessageInput): MessageRow {
  const now = Date.now();
  const id = randomUUID();
  const toolCallsJson =
    input.toolCalls && input.toolCalls.length > 0
      ? JSON.stringify(input.toolCalls)
      : null;
  const attachmentsJson =
    input.attachments && input.attachments.length > 0
      ? JSON.stringify(input.attachments)
      : null;
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO messages (id, project_id, role, content, version_id, created_at, tool_calls_json, attachments_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.projectId,
      input.role,
      input.content,
      input.versionId ?? null,
      now,
      toolCallsJson,
      attachmentsJson
    );
    touchProject(input.projectId);
  });
  tx();
  return getMessage(id);
}

export function getMessage(id: string): MessageRow {
  const row = db
    .prepare(`SELECT * FROM messages WHERE id = ?`)
    .get(id) as
    | (Omit<MessageRow, "tool_calls" | "attachments"> & {
        tool_calls_json?: string | null;
        attachments_json?: string | null;
      })
    | undefined;
  if (!row) throw new Error(`message not found: ${id}`);
  return deserializeRow(row);
}

export function listMessages(projectId: string): MessageRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM messages WHERE project_id = ? ORDER BY created_at ASC`
    )
    .all(projectId) as (Omit<MessageRow, "tool_calls" | "attachments"> & {
    tool_calls_json?: string | null;
    attachments_json?: string | null;
  })[];
  return rows.map(deserializeRow);
}

// ── 反序列化：DB 行 → MessageRow ──
// tool_calls_json / attachments_json TEXT → 对应数组字段
function deserializeRow(
  row: Omit<MessageRow, "tool_calls" | "attachments"> & {
    tool_calls_json?: string | null;
    attachments_json?: string | null;
  }
): MessageRow {
  const { tool_calls_json, attachments_json, ...rest } = row;
  const out: MessageRow = { ...rest } as MessageRow;
  if (typeof tool_calls_json === "string" && tool_calls_json.length > 0) {
    try {
      const parsed = JSON.parse(tool_calls_json) as ToolCallRecord[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        out.tool_calls = parsed;
      }
    } catch (err) {
      console.error(
        `[db] corrupt tool_calls_json on message ${row.id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }
  if (typeof attachments_json === "string" && attachments_json.length > 0) {
    try {
      const parsed = JSON.parse(attachments_json) as MessageAttachment[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        out.attachments = parsed;
      }
    } catch (err) {
      console.error(
        `[db] corrupt attachments_json on message ${row.id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }
  return out;
}
