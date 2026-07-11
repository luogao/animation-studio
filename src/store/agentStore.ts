// ============================================================
// agentStore.ts — 与 Claude agent 对话的会话态
//
// 职责：
// - 管理 chat 消息列表 + 流式状态
// - 提供 appendDelta 给 WS stream 增量追加（最后一条 assistant 消息）
// - 提供 appendToolCall / resolveToolCall 管理 tool-call 卡片生命周期
//   （tool_use → tool_result；done 时兜底 finalize 没收到 result 的）
// - runState：服务端广播过来的"agent 正在干嘛"——刷新页面后从 server 重连恢复
//
// 持久化约定：
// - ChatItem.content（string）会被 REST 持久化到 DB
// - ChatItem.toolCalls（ToolCallRecord[]）现在也持久化到 messages.tool_calls_json；
//   done 时由服务端 agent.ts 随 assistant 消息一起入库，reload 后从 DB 读回。
// - runState（ephemeral）只在内存里，不写库；reload 后通过 WS subscribe 恢复
// ============================================================

import { create } from "zustand";
import type { Palette } from "../types/scene";
import type { MessageAttachment } from "../types/message";

// ============================================================
// 消息类型（对话面板用）
// ============================================================

// 工具调用记录：一条 assistant 消息可以挂多个。
// status 流转：running → complete | error
export interface ToolCallRecord {
  toolCallId: string;
  toolName: string;
  input?: unknown;
  status: "running" | "complete" | "error";
  resultContent?: string;
  isError?: boolean;
}

export interface ChatItem {
  id: string;
  role: "user" | "assistant";
  content: string; // 文本内容（DB 持久化）
  toolCalls?: ToolCallRecord[]; // 持久化：done 时随 assistant 消息入库
  attachments?: MessageAttachment[]; // 持久化：user 消息携带的图片附件（messages.attachments_json）
  thinking?: string; // 持久化：模型思考过程（thinking_delta 累加，DB messages.thinking）
}

// ── RunState：服务端 broadcast 过来的 agent 运行态 ──
// 镜像 server/runRegistry.ts 的 RunState shape（subset）。
// null 表示当前没有 agent 在跑。
export type RunPhase =
  | "thinking"
  | "streaming"
  | "tool_calling"
  | "complete"
  | "error";

export interface RunState {
  runId: string;
  projectId: string;
  phase: RunPhase;
  startedAt: number;
  streamedText: string; // 服务端累加的当前文本（重连恢复时用）
  thinkingText: string; // 服务端累加的思考过程（重连恢复时用）
  currentTool?: {
    toolCallId: string;
    toolName: string;
    status: "running" | "complete" | "error";
  };
}

// ============================================================
// Store 接口
// ============================================================

interface AgentState {
  chatMessages: ChatItem[];
  isStreaming: boolean;
  // null = idle（没 agent 在跑）；非 null = 当前 run 的状态
  runState: RunState | null;

  // 当前活跃的配色提案（最近一次 generate_color_palettes 的结果）。
  // null = 无活跃提案。供前端色卡 + 对话颜色联动用（ephemeral，不持久化）。
  activeProposals: Palette[] | null;

  // ── actions ──
  addMessage: (msg: ChatItem) => void;
  appendDelta: (delta: string) => void;
  // 思考过程增量：追加到最后一条 assistant 消息的 thinking 字段
  appendThinkingDelta: (delta: string) => void;
  setStreaming: (v: boolean) => void;
  clearChat: () => void;
  clearForProject: (id: string) => void;
  // 由 projectStore.loadProject 调用：批量替换当前消息（来自 REST）
  loadMessages: (msgs: ChatItem[]) => void;

  // ── RunState ──
  // 由 WS agent_state 消息调用。null 清空；非 null 设置并同步 isStreaming。
  setRunState: (rs: RunState | null) => void;
  // 重连恢复专用：如果服务端 RunState.streamedText 比本地最后一条 assistant
  // 内容更长/不同，用服务端的覆盖本地（避免漏字）。
  syncStreamingText: (text: string) => void;
  // 重连恢复专用：思考过程同 streamedText（服务端 thinkingText 为权威来源）。
  syncThinkingText: (text: string) => void;

  // ── tool-call 卡片 ──
  appendToolCall: (call: ToolCallRecord) => void;
  resolveToolCall: (
    toolCallId: string,
    result: { content: string; isError: boolean }
  ) => void;
  finalizeRunningToolCalls: () => void;

  // ── 配色提案 ──
  setActiveProposals: (p: Palette[] | null) => void;
  clearActiveProposals: () => void;
}

// ============================================================
// Helpers
// ============================================================

// runState → isStreaming 派生
function deriveStreaming(rs: RunState | null): boolean {
  return rs !== null && rs.phase !== "complete" && rs.phase !== "error";
}

// ============================================================
// Store 实现
// ============================================================

export const useAgentStore = create<AgentState>((set) => ({
  chatMessages: [],
  isStreaming: false,
  runState: null,
  activeProposals: null,

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

  // 思考过程增量：追加到最后一条 assistant 消息的 thinking 字段（与 appendDelta 对称）
  appendThinkingDelta: (delta) =>
    set((s) => {
      if (!delta) return s;
      const messages = s.chatMessages;
      const last = messages[messages.length - 1];
      if (!last || last.role !== "assistant") return s;
      const updatedMessages = [...messages];
      updatedMessages[updatedMessages.length - 1] = {
        ...last,
        thinking: (last.thinking ?? "") + delta,
      };
      return { chatMessages: updatedMessages };
    }),

  setStreaming: (isStreaming) => set({ isStreaming }),

  clearChat: () =>
    set({ chatMessages: [], isStreaming: false, runState: null, activeProposals: null }),

  // M3 切换项目时调用：先清空 + 把 REST 拉来的消息灌进来
  clearForProject: (_id) =>
    set({
      chatMessages: [],
      isStreaming: false,
      runState: null,
      activeProposals: null,
    }),

  loadMessages: (msgs) =>
    set({
      // 防御：过滤掉既无文本内容也无工具调用的空消息
      //（PhaseEmpty 兜底已修复，这里是第二层保险，避免 DB 历史残留）
      chatMessages: msgs.filter(
        (m) =>
          m.content ||
          (m.toolCalls && m.toolCalls.length > 0) ||
          (m.attachments && m.attachments.length > 0) ||
          m.thinking
      ),
      isStreaming: false,
      runState: null,
      // 注意：不清空 activeProposals。done 时 reloadAfterDone 也走 loadMessages，
      // 若清空会让刚生成的提案在 agent 完成后立即丢失，对话颜色联动就失效。
      // reload（页面刷新）由 store 重建重置；切项目由 clearForProject 负责。
    }),

  // ── RunState ──
  setRunState: (rs) => set({ runState: rs, isStreaming: deriveStreaming(rs) }),

  syncStreamingText: (text) =>
    set((s) => {
      if (!text) return s;
      const messages = s.chatMessages;
      const last = messages[messages.length - 1];
      // 没有最后一条 assistant → 用服务端文本新建占位
      if (!last || last.role !== "assistant") {
        const placeholder: ChatItem = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: text,
        };
        return { chatMessages: [...messages, placeholder] };
      }
      // 已有最后一条 assistant，但内容不一致 → 用服务端的覆盖
      // （重连恢复：服务端 streamedText 是权威来源）
      if (last.content !== text) {
        const updatedMessages = [...messages];
        updatedMessages[updatedMessages.length - 1] = {
          ...last,
          content: text,
        };
        return { chatMessages: updatedMessages };
      }
      return s;
    }),

  syncThinkingText: (text) =>
    set((s) => {
      if (!text) return s;
      const messages = s.chatMessages;
      const last = messages[messages.length - 1];
      // 没有最后一条 assistant → 不新建占位（思考永远依附于一条 assistant 消息，
      // 该消息会由 syncStreamingText / appendDelta 创建）
      if (!last || last.role !== "assistant") return s;
      if ((last.thinking ?? "") !== text) {
        const updatedMessages = [...messages];
        updatedMessages[updatedMessages.length - 1] = {
          ...last,
          thinking: text,
        };
        return { chatMessages: updatedMessages };
      }
      return s;
    }),

  // ── tool-call 卡片 ──
  appendToolCall: (call) =>
    set((s) => {
      const messages = s.chatMessages;
      const last = messages[messages.length - 1];
      // 没有最后一条 assistant → 新建占位 assistant 消息挂上去
      if (!last || last.role !== "assistant") {
        const placeholder: ChatItem = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "",
          toolCalls: [call],
        };
        return { chatMessages: [...messages, placeholder] };
      }
      const updatedMessages = [...messages];
      updatedMessages[updatedMessages.length - 1] = {
        ...last,
        toolCalls: [...(last.toolCalls ?? []), call],
      };
      return { chatMessages: updatedMessages };
    }),

  resolveToolCall: (toolCallId, result) =>
    set((s) => {
      let touched = false;
      const updatedMessages = s.chatMessages.map((m) => {
        if (!m.toolCalls) return m;
        const updatedCalls = m.toolCalls.map((tc) =>
          tc.toolCallId === toolCallId
            ? {
                ...tc,
                status: result.isError
                  ? ("error" as const)
                  : ("complete" as const),
                resultContent: result.content,
                isError: result.isError,
              }
            : tc
        );
        if (updatedCalls === m.toolCalls) return m;
        touched = true;
        return { ...m, toolCalls: updatedCalls };
      });
      if (!touched) return s; // 没找到（罕见 race）→ no-op
      return { chatMessages: updatedMessages };
    }),

  finalizeRunningToolCalls: () =>
    set((s) => {
      let touched = false;
      const updatedMessages = s.chatMessages.map((m) => {
        if (!m.toolCalls) return m;
        let localTouched = false;
        const updatedCalls = m.toolCalls.map((tc) => {
          if (tc.status !== "running") return tc;
          localTouched = true;
          return {
            ...tc,
            status: "error" as const,
            isError: true,
            resultContent: "(流式中断，未收到工具结果)",
          };
        });
        if (!localTouched) return m;
        touched = true;
        return { ...m, toolCalls: updatedCalls };
      });
      if (!touched) return s;
      return { chatMessages: updatedMessages };
    }),

  setActiveProposals: (activeProposals) => set({ activeProposals }),
  clearActiveProposals: () => set({ activeProposals: null }),
}));
