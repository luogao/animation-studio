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
}

export interface InsertMessageInput {
  projectId: string;
  role: "user" | "assistant";
  content: string;
  versionId?: string | null;
  // 仅 assistant 消息会携带；user 消息忽略此字段
  toolCalls?: ToolCallRecord[];
}

export function insertMessage(input: InsertMessageInput): MessageRow {
  const now = Date.now();
  const id = randomUUID();
  const toolCallsJson =
    input.toolCalls && input.toolCalls.length > 0
      ? JSON.stringify(input.toolCalls)
      : null;
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO messages (id, project_id, role, content, version_id, created_at, tool_calls_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.projectId,
      input.role,
      input.content,
      input.versionId ?? null,
      now,
      toolCallsJson
    );
    touchProject(input.projectId);
  });
  tx();
  return getMessage(id);
}

export function getMessage(id: string): MessageRow {
  const row = db
    .prepare(`SELECT * FROM messages WHERE id = ?`)
    .get(id) as (Omit<MessageRow, "tool_calls"> & { tool_calls_json?: string | null }) | undefined;
  if (!row) throw new Error(`message not found: ${id}`);
  return deserializeRow(row);
}

export function listMessages(projectId: string): MessageRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM messages WHERE project_id = ? ORDER BY created_at ASC`
    )
    .all(projectId) as (Omit<MessageRow, "tool_calls"> & { tool_calls_json?: string | null })[];
  return rows.map(deserializeRow);
}

// ── 反序列化：DB 行 → MessageRow ──
// tool_calls_json TEXT → tool_calls ToolCallRecord[]
function deserializeRow(
  row: Omit<MessageRow, "tool_calls"> & { tool_calls_json?: string | null }
): MessageRow {
  const { tool_calls_json, ...rest } = row;
  if (typeof tool_calls_json === "string" && tool_calls_json.length > 0) {
    try {
      const parsed = JSON.parse(tool_calls_json) as ToolCallRecord[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { ...rest, tool_calls: parsed } as MessageRow;
      }
    } catch (err) {
      // 损坏的 JSON —— 不阻塞读取，但记录
      console.error(
        `[db] corrupt tool_calls_json on message ${row.id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }
  return rest as MessageRow;
}
