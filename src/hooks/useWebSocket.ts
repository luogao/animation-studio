import { useEffect, useRef } from "react";
import { useAgentStore } from "../store/agentStore";
import { useProjectStore, selectPreviewConfig } from "../store/projectStore";
import type { SceneConfig } from "../types/scene";

// ============================================================
// 消息协议（与 server/wsHandler.ts 对应）
// ============================================================

interface ServerMessage {
  type: "stream" | "config_update" | "done" | "error";
  payload?: {
    delta?: string;
    config?: SceneConfig;
    message?: string;
  };
}

// ============================================================
// 单例 WebSocket — 模块级变量，跨组件实例共享
// ============================================================

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;

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
      const pid = project.projectId;
      if (pid) {
        void persistAssistantAndReload(pid);
      }
      break;
    }

    // ── 错误 ──
    case "error": {
      agent.addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: "错误:" + (msg.payload?.message ?? ""),
      });
      agent.setStreaming(false);
      break;
    }
  }
}

// ============================================================
// done 时：把完整 assistant 消息写库，再 reload 修正 draft id
// ============================================================

async function persistAssistantAndReload(projectId: string): Promise<void> {
  const messages = useAgentStore.getState().chatMessages;
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant" && last.content) {
    try {
      await fetch(`/api/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", content: last.content }),
      });
    } catch (err) {
      console.error("[ws] persist assistant failed:", err);
    }
  }
  // 同步项目状态：本地的 __local_pending__ draft 会被真实 DB draft 替换
  await useProjectStore.getState().loadProject(projectId);
}

// ============================================================
// sendMessage — ChatPanel.onSubmit 调用
//
// M3 流程：
// 1. 若有 draft，先 commit 它（plan 的 auto-commit on next message）
// 2. 用最新的 headVersionId / committedConfig 作为 base
// 3. 本地 addMessage(user) + REST POST user 消息
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

  // 3. user 消息：本地 + DB
  agent.addMessage({ id: crypto.randomUUID(), role: "user", content: text });
  void fetch(`/api/projects/${projectId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: "user",
      content: text,
      versionId: headVersionId,
    }),
  }).catch((err) => console.error("[ws] persist user msg failed:", err));

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
