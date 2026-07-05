// ============================================================
// server/db/index.ts — SQLite 单例
//
// 职责：
// - 在 PROJECT_ROOT/.data/studio.db（或 STUDIO_DB_PATH 覆盖）打开 DB
// - 启动时跑幂等 DDL（CREATE TABLE IF NOT EXISTS）
// - 开启外键约束
// - 导出 singleton `db`
//
// 无 migration 框架 —— 当前阶段幂等 DDL 就够了，等需要列级
// 变更再加 schema_version PRAGMA。
// ============================================================

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Database as DatabaseType } from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

const DB_PATH =
  process.env.STUDIO_DB_PATH?.trim() ||
  path.join(PROJECT_ROOT, ".data", "studio.db");

// 确保 .data/ 目录存在
mkdirSync(path.dirname(DB_PATH), { recursive: true });

// SDK 会话存储根目录（CLAUDE_CONFIG_DIR）—— 与 studio.db 同级，gitignored
// SDK 子进程会把 projects/<sanitized-cwd>/<sessionId>.jsonl 写到这里
export const SESSIONS_DIR = path.join(PROJECT_ROOT, ".data", "sessions");
mkdirSync(SESSIONS_DIR, { recursive: true });

export const db: DatabaseType = new Database(DB_PATH);

// 外键约束（每条连接都要打开）
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ============================================================
// 幂等 DDL —— 启动时执行
// ============================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS versions (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id    TEXT REFERENCES versions(id) ON DELETE SET NULL,
    status       TEXT NOT NULL CHECK (status IN ('draft','committed')),
    sequence     INTEGER NOT NULL,
    label        TEXT,
    config_json  TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    committed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content     TEXT NOT NULL,
    version_id  TEXT REFERENCES versions(id),
    created_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_versions_project ON versions(project_id, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_per_project ON versions(project_id) WHERE status='draft';
  CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, created_at);
`);

// ============================================================
// 增量 schema 迁移 —— SQLite 的 ALTER TABLE 没有 IF NOT EXISTS
// 用 PRAGMA table_info 检查列是否存在，缺了再加
// ============================================================

function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    console.log(`[db] migrated: ${table}.${column}`);
  }
}

ensureColumn("projects", "claude_session_id", "TEXT");
// messages.tool_calls_json：assistant 消息上挂的工具调用卡片历史
// JSON 数组，与 agentStore.ToolCallRecord 同 shape。NULL 或空表示无工具调用。
ensureColumn("messages", "tool_calls_json", "TEXT");

console.log(`[db] opened ${DB_PATH}`);
