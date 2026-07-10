import type { WebSocket } from "ws";
import { runAgent } from "./agent.js";
import { insertMessage } from "./db/messages.js";
import { readLlmConfig } from "./llm-config.js";
import type { SceneConfig } from "../src/types/scene.js";
import {
  subscribe,
  unsubscribeWs,
  hasRun,
  broadcast,
} from "./runRegistry.js";

// ============================================================
// WS 消息协议
// ============================================================

export type MessageType =
  | "chat"
  | "preview"
  | "export"
  | "subscribe" // 新增：client 订阅某 project 的状态广播
  | "stream"
  | "config_update"
  | "done"
  | "error"
  | "agent_state" // 新增：广播当前 RunState（含 null = idle）
  | "tool_use"
  | "tool_result";

export interface ClientMessage {
  type: MessageType;
  payload: unknown;
}

export interface ServerResponse<T = unknown> {
  type: MessageType | "error";
  payload: T;
}

// ============================================================
// 消息处理
// ============================================================

export function handleWsMessage(ws: WebSocket, raw: string): void {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    send(ws, { type: "error", payload: { message: "Invalid JSON" } });
    return;
  }

  console.log(`[ws] recv: type=${msg.type}`);

  switch (msg.type) {
    // ── 订阅：client 连上 / 切项目时发 ──
    // 服务端把 ws 加入该 project 的订阅者集合，并立即推一次当前 RunState
    // （重连恢复机制：刷新页面后 client 重新订阅，能立即知道 agent 是否在跑）
    case "subscribe": {
      const { projectId } = (msg.payload ?? {}) as { projectId?: string };
      if (!projectId) {
        send(ws, {
          type: "error",
          payload: { message: "subscribe payload 需要 projectId" },
        });
        return;
      }
      // 类型适配：runRegistry 的 sendFn 用宽签名（不依赖 ServerResponse 类型），
      // 这里 cast 一次跳过 contravariance 检查。运行时就是同一个 send。
      subscribe(ws, projectId, (w, m) =>
        send(w, m as ServerResponse)
      );
      return;
    }

    case "chat": {
      const { text, baseConfig, projectId, baseVersionId } = (msg.payload ?? {}) as {
        text?: string;
        baseConfig?: SceneConfig;
        projectId?: string;
        baseVersionId?: string | null;
      };
      if (!text || !baseConfig) {
        send(ws, { type: "error", payload: { message: "chat payload 需要 { text, baseConfig }" } });
        return;
      }
      if (!projectId) {
        send(ws, { type: "error", payload: { message: "chat payload 需要 projectId" } });
        return;
      }
      // 并发保护：同一 project 同时只允许一个 agent 跑
      if (hasRun(projectId)) {
        send(ws, {
          type: "error",
          payload: { message: "该项目已有 agent 在运行，请等当前轮次结束" },
        });
        return;
      }
      // 配置兜底：未配置 LLM（缺 apiKey 或 model）时直接拒绝，不让 CLI 子进程
      // 拿空 token 去跑出一个含糊的 "process exited" 错误。
      // 返回结构化 code 让前端能识别并弹出配置引导（而非当成普通错误展示）。
      // 注意：此处在 user 消息入库之前，未配置不会污染对话历史。
      const llm = readLlmConfig();
      if (!llm.apiKey || !llm.model) {
        send(ws, {
          type: "error",
          payload: {
            message:
              "尚未配置 LLM。请点击右上角齿轮设置 Base URL / API Key / 模型名，保存后再对话。",
            code: "LLM_NOT_CONFIGURED",
          },
        });
        return;
      }
      // 防御性订阅：保证发起 chat 的 ws 一定能收到本轮广播
      // （正常流程 client 应该已经 subscribe 过了，这里是 idempotent）
      subscribe(ws, projectId, (w, m) => send(w, m as ServerResponse));

      // ── 服务端持久化 user 消息 ──
      // 之前是客户端 sendMessage 里 fetch POST，但那是 fire-and-forget，
      // 客户端刷新/断开有竞态。挪到这里保证：只要 WS chat 收到，user 消息就入库。
      try {
        insertMessage({ projectId, role: "user", content: text });
      } catch (err) {
        console.error(
          `[ws] persist user message failed for ${projectId}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
      void runAgent(
        text,
        baseConfig,
        { projectId, baseVersionId: baseVersionId ?? null },
        {
          // 所有 callback 改成广播给该 project 的所有订阅者，
          // 而非单播给 originating ws —— 多 tab / 刷新重连都能收到。
          onTextDelta: (delta) =>
            broadcast(projectId, { type: "stream", payload: { delta } }),
          onConfigUpdate: (newConfig) =>
            broadcast(projectId, {
              type: "config_update",
              payload: { config: newConfig },
            }),
          onDone: () => broadcast(projectId, { type: "done", payload: {} }),
          onError: (message) =>
            broadcast(projectId, { type: "error", payload: { message } }),
          onToolUse: (call) =>
            broadcast(projectId, {
              type: "tool_use",
              payload: {
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                input: call.input,
              },
            }),
          onToolResult: (res) =>
            broadcast(projectId, {
              type: "tool_result",
              payload: {
                toolUseId: res.toolUseId,
                content: res.content,
                isError: res.isError,
              },
            }),
        }
      );
      break;
    }

    case "preview":
    case "export":
      // 其他消息类型保持 echo 行为
      send(ws, { type: msg.type, payload: msg.payload });
      break;

    default:
      send(ws, {
        type: "error",
        payload: { message: `Unknown message type: ${(msg as { type?: string }).type}` },
      });
  }
}

// ws close 时由 server/index.ts 调用，清理订阅集合
export function handleWsClose(ws: WebSocket): void {
  unsubscribeWs(ws);
}

function send(ws: WebSocket, msg: ServerResponse): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
