import { useEffect, useRef } from "react";
import { useAgentStore, type RunState, type ChatItem } from "../store/agentStore";
import { useProjectStore, selectPreviewConfig } from "../store/projectStore";
import type { SceneConfig } from "../types/scene";
import { parsePalettes } from "../lib/colorPalette";

// ============================================================
// 消息协议（与 server/wsHandler.ts 对应）
// ============================================================

interface ServerMessage {
  type:
    | "stream"
    | "config_update"
    | "done"
    | "error"
    | "agent_state" // 新增：服务端广播的当前 RunState（含 null = idle）
    | "tool_use"
    | "tool_result";
  payload?: {
    // stream / config_update / done / error
    delta?: string;
    config?: SceneConfig;
    message?: string;
    // tool_use
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    // tool_result
    toolUseId?: string;
    content?: string;
    isError?: boolean;
    // agent_state —— null 或 RunState 子集
    runId?: string;
    projectId?: string;
    phase?: RunState["phase"];
    startedAt?: number;
    streamedText?: string;
    currentTool?: RunState["currentTool"];
  };
}

// ============================================================
// 单例 WebSocket — 模块级变量，跨组件实例共享
// ============================================================

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
// 当前订阅的 projectId。App.tsx 在 loadProject 后调用 setCurrentProject。
// 切换项目时 unsubscribe 旧的 + subscribe 新的；socket 重连时也要重新 subscribe。
let currentProjectId: string | null = null;

// 由 App.tsx / 路由层调用，跟踪"当前关注哪个 project"
// 内部会发 subscribe WS 消息（如果 socket 开着）
export function setCurrentProject(id: string | null): void {
  if (id === currentProjectId) return;
  currentProjectId = id;
  // 立即发一次 subscribe（如果 socket 已开）
  sendSubscribeIfOpen();
}

function sendSubscribeIfOpen(): void {
  if (!currentProjectId) return;
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(
    JSON.stringify({ type: "subscribe", payload: { projectId: currentProjectId } })
  );
}

function ensureSocket(): WebSocket {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return socket;
  }

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${location.host}/ws`;
  socket = new WebSocket(url);

  socket.onopen = () => {
    console.log("[ws] connected");
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    // 重连后立即重新订阅当前 project —— 服务端会推一次最新 RunState 给我们
    sendSubscribeIfOpen();
  };

  socket.onmessage = (event) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    dispatchToStore(msg);
  };

  socket.onclose = () => {
    console.log("[ws] disconnected, will retry in 2s");
    socket = null;
    reconnectTimer = window.setTimeout(() => ensureSocket(), 2000);
  };

  socket.onerror = () => {
    socket?.close();
  };

  return socket;
}

// ============================================================
// useWebSocket Hook
// ============================================================

export function useWebSocket(): void {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!socket) {
      ensureSocket();
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);
}

// ============================================================
// 消息 dispatch — 分发到 agent / project 两个 store
// ============================================================

// tool_result 只有 toolUseId，需反查 messages 找该 tool call 的 toolName
function findToolCallName(
  messages: ChatItem[],
  toolCallId: string
): string | null {
  for (const m of messages) {
    const tc = m.toolCalls?.find((t) => t.toolCallId === toolCallId);
    if (tc) return tc.toolName;
  }
  return null;
}

function dispatchToStore(msg: ServerMessage): void {
  const agent = useAgentStore.getState();
  const project = useProjectStore.getState();

  switch (msg.type) {
    // ── 流式增量：追加到最后一条 assistant 消息 ──
    case "stream": {
      if (!agent.isStreaming) break;
      agent.appendDelta(msg.payload?.delta ?? "");
      break;
    }

    // ── 配置更新：agent 工具触发，乐观写本地 draft ──
    case "config_update": {
      const config = msg.payload?.config;
      if (config) {
        project.applyAgentConfig(config);
      }
      break;
    }

    // ── 流结束：持久化 assistant 消息 + 重新加载项目状态 ──
    case "done": {
      agent.setStreaming(false);
      // 兜底：若有 tool_call 一直没收到 result（SDK 中途出错或被打断），
      // 标记为 incomplete，避免卡片永远转圈
      agent.finalizeRunningToolCalls();
      const pid = project.projectId;
      if (pid) {
        void reloadAfterDone(pid);
      }
      break;
    }

    // ── 工具调用开始：往最后一条 assistant 消息追加 tool-call part ──
    case "tool_use": {
      const { toolCallId, toolName, input } = msg.payload ?? {};
      if (!toolCallId || !toolName) break;
      if (!agent.isStreaming) break;
      agent.appendToolCall({ toolCallId, toolName, input, status: "running" });
      break;
    }

    // ── 工具调用结束：把对应 tool_call 标记为 complete/error ──
    case "tool_result": {
      const { toolUseId, content, isError } = msg.payload ?? {};
      if (!toolUseId) break;
      agent.resolveToolCall(toolUseId, {
        content: content ?? "",
        isError: !!isError,
      });
      // 配色提案联动：generate_color_palettes 成功 → 解析存入 activeProposals，
      // 供前端色卡 + 对话颜色自动匹配用
      if (!isError && content) {
        const toolName = findToolCallName(agent.chatMessages, toolUseId);
        if (
          toolName &&
          (toolName === "generate_color_palettes" ||
            toolName.endsWith("__generate_color_palettes"))
        ) {
          const palettes = parsePalettes(content);
          if (palettes) agent.setActiveProposals(palettes);
        }
      }
      break;
    }

    // ── 错误 ──
    case "error": {
      agent.setStreaming(false);
      agent.finalizeRunningToolCalls();
      agent.addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: "错误:" + (msg.payload?.message ?? ""),
      });
      break;
    }

    // ── 服务端广播的当前 RunState ──
    // null = idle（没 agent 在跑）；非 null = 流式恢复 / 阶段更新
    case "agent_state": {
      const p = msg.payload ?? {};
      if (!p.runId || !p.projectId || !p.phase) {
        // payload 缺关键字段或为 null → idle
        agent.setRunState(null);
        break;
      }
      const rs: RunState = {
        runId: p.runId,
        projectId: p.projectId,
        phase: p.phase,
        startedAt: p.startedAt ?? Date.now(),
        streamedText: p.streamedText ?? "",
        currentTool: p.currentTool,
      };
      agent.setRunState(rs);
      // 流式恢复：服务端 streamedText 是权威来源
      if (rs.streamedText) {
        agent.syncStreamingText(rs.streamedText);
      }
      break;
    }
  }
}

// ============================================================
// done 时：reload 项目状态（含 messages、draft）
// 服务端已经在 onDone 前把 assistant 消息入库了，
// loadProject 会从 DB 把完整对话同步回 agentStore（见 projectStore.loadProject）。
// 客户端不再负责持久化 assistant / user 消息——避免 WS 断开时的丢消息 bug。
// ============================================================

async function reloadAfterDone(projectId: string): Promise<void> {
  await useProjectStore.getState().loadProject(projectId);
}

// ============================================================
// sendMessage — ChatPanel.onSubmit 调用
//
// M3 流程：
// 1. 若有 draft，先 commit 它（plan 的 auto-commit on next message）
// 2. 用最新的 headVersionId / committedConfig 作为 base
// 3. 本地 addMessage(user) —— 仅占位，服务端在收到 WS chat 时入库
// 4. 本地 addMessage(assistant 占位) + setStreaming(true)
// 5. WS 发 chat {text, projectId, baseVersionId, baseConfig}
//
// 返回 Promise 让 ChatPanel 知道何时 WS 包已发出（不等回复）
// ============================================================

export async function sendMessage(text: string): Promise<void> {
  const project = useProjectStore.getState();
  const agent = useAgentStore.getState();

  if (!project.projectId) {
    throw new Error("no project selected; create or load one first");
  }

  // 1. 自动提交已有 draft（plan spec）
  if (project.draft) {
    try {
      await project.commitDraft(`auto: before turn`);
    } catch (err) {
      console.error("[ws] auto-commit draft failed:", err);
    }
  }

  // 2. 读最新状态（commitDraft 会 reload，state 已更新）
  const fresh = useProjectStore.getState();
  const { projectId, headVersionId, committedConfig } = fresh;

  // 3. user 消息：本地占位（服务端会在收到 WS chat 后入库，
  //    客户端不再 POST，避免 fire-and-forget 竞态）
  agent.addMessage({ id: crypto.randomUUID(), role: "user", content: text });

  // 4. assistant 占位 + 进入流式
  agent.addMessage({ id: crypto.randomUUID(), role: "assistant", content: "" });
  agent.setStreaming(true);

  // 5. 发 WS chat（新 payload）
  const payload = JSON.stringify({
    type: "chat",
    payload: {
      text,
      projectId,
      baseVersionId: headVersionId,
      baseConfig: committedConfig,
    },
  });

  const ws = ensureSocket();
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(payload);
  } else {
    ws.addEventListener(
      "open",
      () => {
        ws.send(payload);
      },
      { once: true }
    );
  }
}

export { selectPreviewConfig };
