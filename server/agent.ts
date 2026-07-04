// ============================================================
// agent.ts — Claude Agent SDK 集成
//
// 职责：
// - 把 user 消息 + 当前 SceneConfig + 版本上下文包装成 prompt
// - 通过 createSdkMcpServer + tool() 注册 3 个自定义工具：
//     · update_scene_config(config)
//     · get_version_history()
//     · rollback_to_version(targetVersionId, confirmation)
// - 流式迭代 SDK 消息，把 assistant 文字和 config 更新回传给前端
//
// Auth：本文件不做任何 API key 检查。SDK 启动 Claude Code CLI 子进程，
// CLI 自己负责认证（订阅登录、settings.agent.json 的 env 配置等）。
// 如果认证失败，错误会从 SDK 抛出，被这里的 try/catch 捕获并回传前端。
//
// 关键 SDK 用法（SDK 0.3.x）：
// - Options.tools 是内置工具白名单（string[]），不是自定义工具定义
// - 自定义工具必须走 MCP：tool() 定义 → createSdkMcpServer 包装 →
//   Options.mcpServers 注册
// - tool() 的 inputSchema 是 Zod raw shape（z.object 的 .shape 或裸对象）
// ============================================================

import { fileURLToPath } from "node:url";
import path from "node:path";
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { buildSystemPrompt, type ProjectContextForPrompt } from "./prompts.js";
import {
  createDraft,
  updateDraft,
  getDraft,
  listVersions,
  rollbackTo,
} from "./db/versions.js";
import { getProjectRow } from "./db/projects.js";
import type {
  SceneConfig,
  Actor,
  Connection,
  Phase,
  Effect,
} from "../src/types/scene.js";

// ------------------------------------------------------------
// 项目根目录解析：以本文件位置锚定，不依赖 process.cwd()
// server/agent.ts → 上一级即为项目根
// ------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ------------------------------------------------------------
// 模型解析：env CLAUDE_MODEL > 默认值
// ------------------------------------------------------------

const DEFAULT_MODEL = "ark-code-latest";

function resolveModel(): string {
  const m = process.env.CLAUDE_MODEL?.trim();
  return m && m.length > 0 ? m : DEFAULT_MODEL;
}

// ------------------------------------------------------------
// Settings 文件解析
// ------------------------------------------------------------

function resolveSettings(): string {
  const override = process.env.CLAUDE_SETTINGS_FILE?.trim();
  if (override && override.length > 0) return override;
  return path.join(PROJECT_ROOT, ".claude", "setting.agent.json");
}

// ============================================================
// SceneConfig 的 Zod shape —— 作为 tool() 的 inputSchema
// ============================================================

const actorShape = {
  id: z.string().describe("actor 唯一 id，被 connection/phase/effect 引用"),
  type: z.enum(["box", "circle", "gate", "text", "diamond"]),
  label: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  color: z.string().optional().describe("十六进制色值，如 #E8A230"),
  glow: z.string().optional().describe("发光色，drop-shadow 用"),
  fontSize: z.number().optional(),
  fontWeight: z.number().optional(),
};

const connectionShape = {
  from: z.string(),
  to: z.string(),
  style: z.enum(["line", "arrow", "dashed"]),
  color: z.string().optional(),
};

const phaseShape = {
  at: z.number().describe("开始时间（秒）"),
  duration: z.number(),
  action: z.enum(["enter", "exit", "connect", "pulse", "shake", "highlight"]),
  target: z
    .union([z.string(), z.array(z.string())])
    .describe("actor id 或 ids 数组"),
  effect: z
    .string()
    .optional()
    .describe(
      "slide-left | slide-right | slide-up | scale-pop | fade | draw-line"
    ),
  ease: z.string().optional().describe("GSAP ease 字符串，如 power3.out"),
};

const effectShape = {
  type: z.enum(["breathing-glow", "particles", "pulse-ring", "flowing-dots"]),
  target: z.string(),
  color: z.string().optional(),
};

const sceneConfigShape = {
  width: z.number(),
  height: z.number(),
  duration: z.number().describe("总时长（秒）"),
  background: z.string(),
  actors: z.array(z.object(actorShape)),
  connections: z.array(z.object(connectionShape)),
  phases: z.array(z.object(phaseShape)),
  effects: z.array(z.object(effectShape)).optional(),
};

// ============================================================
// Callback 契约 —— 由 wsHandler 注入
// ============================================================

export interface AgentCallbacks {
  onTextDelta: (delta: string) => void;
  onConfigUpdate: (config: SceneConfig) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

// ============================================================
// Agent 上下文 —— 由 wsHandler 在每次 chat 时注入
// ============================================================

export interface AgentProjectContext {
  projectId: string;
  baseVersionId: string | null; // 当前 head 的 id；首次对话时可能为 null
}

// ============================================================
// 构造 ProjectContextForPrompt —— 从 DB 拉版本/项目信息
// ============================================================

function buildProjectContext(
  projectId: string,
  baseVersionId: string | null
): ProjectContextForPrompt {
  const project = getProjectRow(projectId);
  const all = listVersions(projectId);
  const seqById = new Map(all.map((v) => [v.id, v.sequence] as const));

  const headMeta = baseVersionId
    ? all.find((v) => v.id === baseVersionId) ?? null
    : null;
  const draftMeta = all.find((v) => v.status === "draft") ?? null;

  const head = headMeta
    ? {
        sequence: headMeta.sequence,
        id: headMeta.id,
        parentId: headMeta.parentId,
        parentSequence: headMeta.parentId
          ? seqById.get(headMeta.parentId) ?? null
          : null,
      }
    : null;

  const recentVersions = [...all]
    .sort((a, b) => b.sequence - a.sequence)
    .slice(0, 5)
    .map((v) => ({
      sequence: v.sequence,
      label: v.label,
      status: v.status,
      parentId: v.parentId,
    }));

  const draft = draftMeta
    ? {
        sequence: draftMeta.sequence,
        parentSequence: draftMeta.parentId
          ? seqById.get(draftMeta.parentId) ?? null
          : null,
      }
    : null;

  return { title: project.title, head, recentVersions, draft };
}

// ============================================================
// 构造每轮 user prompt 的版本上下文前缀
// ============================================================

function buildTurnPrefix(ctx: ProjectContextForPrompt): string {
  const headLine = ctx.head
    ? `head = v${ctx.head.sequence}${
        ctx.head.parentSequence !== null
          ? ` (parent v${ctx.head.parentSequence})`
          : ""
      }`
    : "head = 无（全新项目）";
  const draftLine = ctx.draft
    ? `草稿: v${ctx.draft.sequence} 已存在，agent 本次工具调用会更新它`
    : "草稿: 无（update_scene_config 会新建）";
  return `[版本上下文] ${headLine} · ${draftLine}`;
}

// ============================================================
// runAgent — 入口
// ============================================================

export async function runAgent(
  userMessage: string,
  currentConfig: SceneConfig,
  ctx: AgentProjectContext,
  callbacks: AgentCallbacks
): Promise<void> {
  try {
    const { projectId, baseVersionId } = ctx;

    // ── 拉项目/版本上下文，用于 system prompt + 每轮 prefix ──
    const projectContext = buildProjectContext(projectId, baseVersionId);
    const turnPrefix = buildTurnPrefix(projectContext);

    // ── 工具 1：update_scene_config ──
    const updateTool = tool(
      "update_scene_config",
      "更新场景动画配置。传入完整的 SceneConfig JSON（不是增量）。会写入或更新当前项目的草稿。",
      sceneConfigShape,
      async (args) => {
        const newConfig = args as unknown as SceneConfig;
        try {
          const existing = getDraft(projectId);
          if (existing) {
            updateDraft(existing.id, newConfig);
          } else {
            createDraft(projectId, baseVersionId, newConfig);
          }
        } catch (err) {
          callbacks.onError(
            `draft 持久化失败: ${err instanceof Error ? err.message : String(err)}`
          );
        }
        callbacks.onConfigUpdate(newConfig);
        return {
          content: [
            { type: "text" as const, text: "SceneConfig 已应用并写入草稿。" },
          ],
        };
      }
    );

    // ── 工具 2：get_version_history ──
    // 无入参；返回当前项目的版本树 JSON
    const historyTool = tool(
      "get_version_history",
      "查询当前项目的完整版本历史（树形结构）。无入参。返回 JSON 数组，元素含 sequence / id / parentId / label / status / createdAt。",
      {},
      async () => {
        const all = listVersions(projectId);
        const seqById = new Map(all.map((v) => [v.id, v.sequence] as const));
        const payload = all
          .sort((a, b) => a.sequence - b.sequence)
          .map((v) => ({
            sequence: v.sequence,
            id: v.id,
            parentId: v.parentId,
            parentSequence: v.parentId
              ? seqById.get(v.parentId) ?? null
              : null,
            label: v.label,
            status: v.status,
            createdAt: v.createdAt,
          }));
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(payload, null, 2),
            },
          ],
        };
      }
    );

    // ── 工具 3：rollback_to_version ──
    // 必须 confirmation=true 才执行；false 时只返回提示
    const rollbackTool = tool(
      "rollback_to_version",
      "回滚到指定 committed 版本。⚠️ 必须先和用户确认：confirmation=false（或缺省）时只会返回错误提示，不会真的执行；用户明确同意后用 confirmation=true 再调一次。",
      {
        targetVersionId: z
          .string()
          .describe("目标版本的 id（必须是 committed 状态）"),
        confirmation: z
          .boolean()
          .describe("是否已得到用户明确确认。必须为 true 才会真的执行回滚。"),
      },
      async (args) => {
        const { targetVersionId, confirmation } = args as {
          targetVersionId: string;
          confirmation: boolean;
        };
        if (!confirmation) {
          return {
            content: [
              {
                type: "text" as const,
                text: "⚠️ 未确认。请先向用户描述要回滚到哪个版本（含序号与标签），征得用户明确同意后，再用 confirmation=true 调用本工具。本次未执行任何回滚。",
              },
            ],
          };
        }
        try {
          const newHead = rollbackTo(projectId, targetVersionId);
          // 乐观推送新 head 的 config，前端 preview 立即响应
          callbacks.onConfigUpdate(newHead.config);
          return {
            content: [
              {
                type: "text" as const,
                text: `已回滚：新 head 为 v${newHead.sequence}（基于 v${targetVersionId.slice(0, 8)} 创建）。请向用户确认并说明：之前的草稿（如有）已自动提交保留为历史分支。`,
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `回滚失败：${err instanceof Error ? err.message : String(err)}`,
              },
            ],
          };
        }
      }
    );

    const mcpServer = createSdkMcpServer({
      name: "studio",
      tools: [updateTool, historyTool, rollbackTool],
    });

    // ── 构造 prompt（含每轮版本前缀）──
    const prompt = `${turnPrefix}

用户消息: ${userMessage}

当前 config:
${JSON.stringify(currentConfig, null, 2)}

请根据用户消息设计/修改动画。调用 update_scene_config 工具输出完整的新 config，并简要说明你的设计思路。涉及版本历史/回滚时使用对应工具，回答里可以引用版本号让用户对得上号。`;

    // ── 发起 query ──
    const result = query({
      prompt,
      options: {
        settings: resolveSettings(),
        model: resolveModel(),
        systemPrompt: buildSystemPrompt(projectContext),
        mcpServers: { studio: mcpServer },
        tools: [],
        maxTurns: 50,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    });

    // ── 流式消费 SDK 消息 ──
    let firstDelta = true;
    for await (const message of result) {
      const msg = message as {
        type: string;
        message?: {
          content: Array<{ type: string; text?: string }>;
        };
      };

      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            const prefix = firstDelta ? "" : "\n\n";
            callbacks.onTextDelta(prefix + block.text);
            firstDelta = false;
          }
          // tool_use block 由 MCP handler 处理，不需要在此解析
        }
      }
    }

    callbacks.onDone();
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : String(err));
  }
}

// ============================================================
// 类型导出（仅供 server 内部使用）
// ============================================================

export type { SceneConfig, Actor, Connection, Phase, Effect };
