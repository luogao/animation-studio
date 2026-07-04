import type { WebSocket } from "ws";
import { runAgent } from "./agent.js";
import type { SceneConfig } from "../src/types/scene.js";

// ============================================================
// WS 消息协议
// ============================================================

export type MessageType = "chat" | "preview" | "export" | "stream" | "config_update" | "done";

export interface ClientMessage {
  type: MessageType;
  payload: unknown;
}

export interface ServerResponse<T = unknown> {
  type: MessageType | "error";
  payload: T;
}

// ============================================================
// 消息处理 — 当前做 echo 回显，后续步骤接入 Agent SDK
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
      void runAgent(
        text,
        baseConfig,
        { projectId, baseVersionId: baseVersionId ?? null },
        {
          onTextDelta: (delta) => send(ws, { type: "stream", payload: { delta } }),
          onConfigUpdate: (newConfig) => send(ws, { type: "config_update", payload: { config: newConfig } }),
          onDone: () => send(ws, { type: "done", payload: {} }),
          onError: (message) => send(ws, { type: "error", payload: { message } }),
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

function send(ws: WebSocket, msg: ServerResponse): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
