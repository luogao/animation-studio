// ============================================================
// agentStore.ts — 与 Claude agent 对话的会话态
//
// 职责：
// - 管理 chat 消息列表 + 流式状态
// - 提供 appendDelta 给 WS stream 增量追加（最后一条 assistant 消息）
// - M3 会在 clearForProject 里配合 projectStore.loadProject 清空
// ============================================================

import { create } from "zustand";

// ============================================================
// 消息类型（对话面板用）
// ============================================================

export interface ChatItem {
  id: string;
  role: "user" | "assistant";
  content: string;
}

// ============================================================
// Store 接口
// ============================================================

interface AgentState {
  chatMessages: ChatItem[];
  isStreaming: boolean;

  // ── actions ──
  addMessage: (msg: ChatItem) => void;
  appendDelta: (delta: string) => void;
  setStreaming: (v: boolean) => void;
  clearChat: () => void;
  clearForProject: (id: string) => void;
  // 由 projectStore.loadProject 调用：批量替换当前消息（来自 REST）
  loadMessages: (msgs: ChatItem[]) => void;
}

// ============================================================
// Store 实现
// ============================================================

export const useAgentStore = create<AgentState>((set) => ({
  chatMessages: [],
  isStreaming: false,

  addMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),

  // 流式增量：追加到最后一条 assistant 消息
  // 没有 assistant 占位 → 静默 no-op（避免误把 delta 拼到 user 消息上）
  appendDelta: (delta) =>
    set((s) => {
      if (!delta) return s;
      const messages = s.chatMessages;
      const last = messages[messages.length - 1];
      if (!last || last.role !== "assistant") return s;
      const updatedMessages = [...messages];
      updatedMessages[updatedMessages.length - 1] = {
        ...last,
        content: last.content + delta,
      };
      return { chatMessages: updatedMessages };
    }),

  setStreaming: (isStreaming) => set({ isStreaming }),

  clearChat: () => set({ chatMessages: [], isStreaming: false }),

  // M3 切换项目时调用：先清空 + 把 REST 拉来的消息灌进来
  clearForProject: (_id) => set({ chatMessages: [], isStreaming: false }),

  loadMessages: (msgs) => set({ chatMessages: msgs, isStreaming: false }),
}));
