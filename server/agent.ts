// ============================================================
// agent.ts — Claude Agent SDK 集成
//
// 职责：
// - 把 user 消息 + 当前 SceneConfig + 版本上下文包装成 prompt
// - 通过 createSdkMcpServer + tool() 注册 4 个自定义工具：
//     · update_scene_config(config)
//     · get_version_history()
//     · rollback_to_version(targetVersionId, confirmation)
//     · generate_color_palettes(seedColor, schemes?)
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
import { randomUUID } from "node:crypto";
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
import { getProjectRow, getSessionId, setSessionId } from "./db/projects.js";
import { SESSIONS_DIR } from "./db/index.js";
import { insertMessage, type ToolCallRecord } from "./db/messages.js";
import {
  startRun,
  endRun,
  updatePhase,
  appendRunText,
  getRun,
} from "./runRegistry.js";
import { readSettingsFile } from "./llm-config.js";
import type {
  SceneConfig,
  Actor,
  Connection,
  Phase,
  Effect,
  HarmonyScheme,
} from "../src/types/scene.js";
import { generatePalettes } from "../src/lib/colorPalette.js";

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
  // 1. settings 文件里的 ANTHROPIC_MODEL（用户通过 UI 配置）
  const settings = readSettingsFile();
  const fromFile = settings?.env?.ANTHROPIC_MODEL?.trim();
  if (fromFile) return fromFile;
  // 2. 环境变量 CLAUDE_MODEL（服务端启动时注入）
  const m = process.env.CLAUDE_MODEL?.trim();
  if (m) return m;
  // 3. 硬编码兜底
  return DEFAULT_MODEL;
}

// ------------------------------------------------------------
// 合并 settings 文件的 env 到子进程环境
// SDK Options.env 会替换整个子进程环境，所以必须显式把 settings
// 文件里用户配置的 env 变量合并进来（文件值覆盖进程 env）。
// ------------------------------------------------------------

function resolveEnv(): Record<string, string | undefined> {
  const base: Record<string, string | undefined> = {
    ...process.env,
    CLAUDE_CONFIG_DIR: SESSIONS_DIR,
  };
  const settings = readSettingsFile();
  if (settings?.env) {
    for (const [key, value] of Object.entries(settings.env)) {
      if (value) {
        base[key] = value;
      }
    }
  }
  return base;
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
  rotation: z.number().optional().describe("初始旋转角度（degrees）"),
  scale: z.number().optional().describe("初始缩放比例（默认 1）"),
  skewX: z.number().optional().describe("X 轴倾斜（degrees）"),
  skewY: z.number().optional().describe("Y 轴倾斜（degrees）"),
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
  action: z.enum([
    "enter",
    "exit",
    "connect",
    "pulse",
    "shake",
    "highlight",
    "tween",
  ]),
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

  // === 通用动画属性（action="tween" 时生效） ===
  props: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "GSAP TweenVars，透传给 gsap.to/from/fromTo。可包含任意 GSAP 属性如 rotation, scale, x, y, opacity, filter 等。仅 action=tween 时生效"
    ),
  fromProps: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "fromTo 模式的起始状态（tweenMode=fromTo 时使用）。仅 action=tween 时生效"
    ),
  stagger: z
    .union([
      z.number(),
      z.object({
        each: z.number().optional(),
        from: z
          .union([
            z.number(),
            z.enum(["start", "center", "end", "edges", "random"]),
          ])
          .optional(),
        ease: z.string().optional(),
        amount: z.number().optional(),
      }),
    ])
    .optional()
    .describe(
      "多目标 stagger：数字=间隔秒数，对象=GSAP stagger 配置。当 target 为数组时生效"
    ),
  tweenMode: z
    .enum(["to", "from", "fromTo"])
    .optional()
    .describe(
      "GSAP 方法：to（默认，当前状态→props）、from（props→当前状态）、fromTo（fromProps→props）。仅 action=tween 时生效"
    ),
};

const effectShape = {
  type: z.enum(["breathing-glow", "particles", "pulse-ring", "flowing-dots"]),
  target: z.string(),
  color: z.string().optional(),
};

const paletteColorsShape = {
  primary: z.string().describe("#RRGGBB 大写"),
  secondary: z.string(),
  accent: z.string(),
  neutral: z.string(),
  foreground: z.string(),
  background: z.string(),
};

const paletteShape = {
  id: z.string(),
  name: z.string(),
  description: z.string(),
  harmony: z.enum([
    "analogous",
    "complementary",
    "split-complementary",
    "triadic",
    "custom",
  ]),
  seed: z.string().describe("用户选择的主色 #RRGGBB"),
  colors: z.object(paletteColorsShape),
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
  palette: z.object(paletteShape).optional(),
};

// ============================================================
// Callback 契约 —— 由 wsHandler 注入
// ============================================================

export interface AgentCallbacks {
  onTextDelta: (delta: string) => void;
  onConfigUpdate: (config: SceneConfig) => void;
  onDone: () => void;
  onError: (error: string) => void;
  // 工具调用生命周期：tool_use 块到达时 → onToolUse；
  // 后续 user 消息里匹配的 tool_result 块到达时 → onToolResult。
  // 前端据此渲染工具卡片（running → complete/error）。
  onToolUse: (call: {
    toolCallId: string;
    toolName: string;
    input: unknown;
  }) => void;
  onToolResult: (res: {
    toolUseId: string;
    content: string;
    isError: boolean;
  }) => void;
}

// ============================================================
// SDK 迭代器 yield 类型 —— 本地窄化（避免引入整个 Anthropic SDK 类型图）
// ============================================================
// SDK 实际 yield 的 union 太大（SDKMessage 含几十个变体），
// 这里只列出本文件关心的三种 + 兜底 fallback。
type SDKYieldEvent = {
  type: "stream_event";
  event: {
    type: string;
    delta?: { type: string; text?: string };
  };
};
type SDKYieldAssistantMessage = {
  type: "assistant";
  message: {
    content: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
    }>;
  };
};
type SDKYieldUserMessage = {
  type: "user";
  message: {
    content: Array<
      | string
      | {
          type: string;
          tool_use_id?: string;
          content?: unknown;
          is_error?: boolean;
        }
    >;
  };
};
type SDKYieldOther = { type: string };

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
  // 提到 try 外面，catch / finally 都能用（endRun 需要 projectId）
  const { projectId, baseVersionId } = ctx;
  try {
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

    // ── 工具 4：generate_color_palettes ──
    // 纯算法生成，无 DB/无 callback。返回 3 套语义化 Palette（name/description 空），
    // agent 在回复里命名 + 描述，用户选定后再用 update_scene_config 应用。
    const generatePalettesTool = tool(
      "generate_color_palettes",
      "当用户想换配色、提到“主色/调色板/配色方案/换个颜色风格/重新上色”时调用。传入用户选择的主色（hex）。返回 3 套数学上保证和谐的配色方案（每套含 primary/secondary/accent/neutral/foreground/background 6 个语义色，已通过 WCAG 对比度校验）。本工具只负责算法生成，不负责命名——你需要在回复里为每套方案起一个有品味的名字和简短风格描述，然后让用户选择（“请告诉我用第几套”，不要自作主张直接应用）。用户选定后，调用 update_scene_config 把所选 palette 和按角色烘焙的 hex 一起写入。",
      {
        seedColor: z
          .string()
          .describe("用户选择的主色，6位十六进制，如 #E8A230 或 E8A230"),
        schemes: z
          .array(
            z.enum(["analogous", "complementary", "split-complementary", "triadic"])
          )
          .optional()
          .describe(
            "要生成的配色方案类型，默认 [analogous, complementary, triadic] 共 3 套"
          ),
      },
      async (args) => {
        const { seedColor, schemes } = args as {
          seedColor: string;
          schemes?: HarmonyScheme[];
        };
        try {
          const palettes = generatePalettes(seedColor, { schemes });
          return {
            content: [
              { type: "text" as const, text: JSON.stringify({ palettes }, null, 2) },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `生成配色失败：${err instanceof Error ? err.message : String(err)}`,
              },
            ],
          };
        }
      }
    );

    const mcpServer = createSdkMcpServer({
      name: "studio",
      tools: [updateTool, historyTool, rollbackTool, generatePalettesTool],
    });

    // ── 构造 prompt（含每轮版本前缀）──
    const prompt = `${turnPrefix}

用户消息: ${userMessage}

当前 config:
${JSON.stringify(currentConfig, null, 2)}

请根据用户消息设计/修改动画。调用 update_scene_config 工具输出完整的新 config，并简要说明你的设计思路。涉及版本历史/回滚时使用对应工具，回答里可以引用版本号让用户对得上号。`;

    // ── 会话续接：首次分配 sessionId，后续 resume ──
    // SDK 把会话 JSONL 写到 <CLAUDE_CONFIG_DIR>/projects/<sanitized-cwd>/<sid>.jsonl
    // 我们用 CLAUDE_CONFIG_DIR 把它定位到项目内的 .data/sessions/
    const existingSid = getSessionId(projectId);
    const sessionId = existingSid ?? randomUUID();
    const sessionOptions = existingSid
      ? { resume: sessionId }
      : { sessionId };

    // ── 发起 query ──
    // includePartialMessages: true —— 让 SDK 在流式期间吐 stream_event 消息
    // （SDKPartialAssistantMessage，携带 Anthropic 的 content_block_delta）。
    // 这是实现真·打字机效果的关键：默认 false 时只有每个 assistant message 的
    // 完整 text block，用户看到的是 burst-per-message 而非 token 流。
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
        includePartialMessages: true,
        env: resolveEnv(),
        ...sessionOptions,
      },
    });

    // ── 注册 RunState（registry 立即广播 agent_state 给所有订阅者）──
    // 跑完一定要 endRun —— 见函数末尾 finally。如果不 endRun，RunState 会
    // 永远留在 Map 里，下次该 project 发 chat 会被并发保护拒绝。
    const runId = randomUUID();
    startRun(projectId, runId);

    // ── 流式消费 SDK 消息 ──
    // 三种需要处理的 yield：
    //   stream_event → text_delta（字符级真流式）
    //   assistant     → tool_use 块（工具调用开始，args 已组装完毕）
    //   user          → tool_result 块（工具调用结束，含结果/错误）
    // 其他 yield 类型（result/system/control 等）忽略。
    // 注意：assistant 消息里的 text 块已在 stream_event 阶段流过，这里不再发，
    // 否则会双倍。
    // assistantText 累加改成走 RunState.streamedText（appendRunText）——单一来源，
    // 重连恢复时客户端能从 RunState 拿到当前已生成的部分。
    // pendingSegmentSep —— 在 assistant 消息 yield 后置 true，表示下一个
    // text_delta 是新一轮 assistant 文本的开头，需要前置 "\n\n" 与同一条
    // ChatItem 内已有文本分段（多 turn 文本拼接进同一条消息时的视觉分隔）。
    // 关键：token 流式期间同一条 assistant 消息内的连续 delta 不能加任何前缀，
    // 否则每个字符之间都会被 "\n\n" 断开（旧 bug：react-markdown 把每个字
    // 渲染成独立 <p>，markdown 语法被切碎失效）。
    let firstDelta = true;
    let pendingSegmentSep = false;
    // 累积本轮所有工具调用（多个 assistant turn 都算），done 时随 assistant
    // 消息一起入库 —— 这样刷新页面后 ToolCallCard 仍然能渲染。
    // tool_use 块 → push running；tool_result 块 → 找到对应条目更新状态。
    const accumulatedToolCalls: ToolCallRecord[] = [];
    for await (const message of result) {
      const msg = message as
        | SDKYieldEvent
        | SDKYieldAssistantMessage
        | SDKYieldUserMessage
        | SDKYieldOther;

      switch (msg.type) {
        case "stream_event": {
          const evt = (msg as SDKYieldEvent).event;
          if (
            evt.type === "content_block_delta" &&
            evt.delta?.type === "text_delta" &&
            evt.delta.text
          ) {
            const prefix = firstDelta
              ? ""
              : pendingSegmentSep
                ? "\n\n"
                : "";
            const piece = prefix + evt.delta.text;
            callbacks.onTextDelta(piece);
            appendRunText(projectId, piece);
            updatePhase(projectId, "streaming");
            firstDelta = false;
            pendingSegmentSep = false;
          }
          // input_json_delta（工具 args 流式 partial）刻意不转发 ——
          // 等到 assistant 消息里的 tool_use 块组装完成再一次性发。
          break;
        }

        case "assistant": {
          const content = (msg as SDKYieldAssistantMessage).message.content;
          for (const block of content) {
            if (block.type === "tool_use" && block.id && block.name) {
              callbacks.onToolUse({
                toolCallId: block.id,
                toolName: block.name,
                input: block.input,
              });
              updatePhase(projectId, "tool_calling", {
                currentTool: {
                  toolCallId: block.id,
                  toolName: block.name,
                  status: "running",
                },
              });
              // 同步累积到本轮 toolCalls 列表（用于 done 时持久化）
              accumulatedToolCalls.push({
                toolCallId: block.id,
                toolName: block.name,
                input: block.input,
                status: "running",
              });
            }
            // text 块已通过 stream_event 流过 —— 跳过
            // thinking 块 —— 跳过（不展示）
          }
          // assistant 消息结束：若后续还有 text_delta（tool_result 之后的
          // 新一轮 assistant 文本），用空行与上一段分开
          pendingSegmentSep = true;
          break;
        }

        case "user": {
          const content = (msg as SDKYieldUserMessage).message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (
                typeof block === "object" &&
                block.type === "tool_result" &&
                block.tool_use_id
              ) {
                // tool_result.content 可能是 string、ContentBlock[] 或 undefined
                const raw = block.content;
                let text: string;
                if (typeof raw === "string") {
                  text = raw;
                } else if (Array.isArray(raw)) {
                  text = raw
                    .map((c) =>
                      typeof c === "object" &&
                      c !== null &&
                      c.type === "text" &&
                      typeof c.text === "string"
                        ? c.text
                        : ""
                    )
                    .join("");
                } else {
                  text = "";
                }
                callbacks.onToolResult({
                  toolUseId: block.tool_use_id,
                  content: text,
                  isError: !!block.is_error,
                });
                // 同步更新累积列表中对应条目的状态
                const idx = accumulatedToolCalls.findIndex(
                  (tc) => tc.toolCallId === block.tool_use_id
                );
                if (idx >= 0) {
                  accumulatedToolCalls[idx] = {
                    ...accumulatedToolCalls[idx],
                    status: block.is_error ? "error" : "complete",
                    resultContent: text,
                    isError: !!block.is_error,
                  };
                }
              }
            }
          }
          // tool_result 之后通常还有更多 text_delta —— 切回 streaming/thinking
          updatePhase(projectId, "streaming", { currentTool: undefined });
          break;
        }

        default:
          // result / system / control / etc. —— 忽略
          break;
      }
    }

    // ── 持久化 assistant 消息（服务端负责，WS 断开也不丢）──
    // 文本累加在 RunState.streamedText 里，这里读出来一次性入库。
    // 工具调用累积在 accumulatedToolCalls，随消息一起持久化 —— 刷新后卡片不丢。
    const finalText = getRun(projectId)?.streamedText ?? "";
    if (finalText.trim()) {
      try {
        insertMessage({
          projectId,
          role: "assistant",
          content: finalText,
          toolCalls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
        });
      } catch (err) {
        // 写库失败不让 done 不发——但前端 reload 后会缺这条消息
        console.error(
          `[agent] persist assistant message failed for ${projectId}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    // 广播一次 complete，让 UI 能看到 "完成" 一瞬（紧接着 done + endRun）
    updatePhase(projectId, "complete");
    callbacks.onDone();
    endRun(projectId);

    // 首轮分配的 sessionId 落库，后续轮次才能 resume
    if (!existingSid) {
      try {
        setSessionId(projectId, sessionId);
      } catch (err) {
        // 持久化失败不阻塞本轮 —— 但下一轮拿不到 sid，agent 会失忆
        console.error(
          `[agent] failed to persist sessionId for ${projectId}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  } catch (err) {
    // 错误也要更新 RunState + endRun，否则并发保护会卡住下一轮
    updatePhase(projectId, "error");
    callbacks.onError(err instanceof Error ? err.message : String(err));
    endRun(projectId);
  }
}

// ============================================================
// 类型导出（仅供 server 内部使用）
// ============================================================

export type { SceneConfig, Actor, Connection, Phase, Effect };
