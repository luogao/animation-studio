// ============================================================
// assistantRuntime.ts — 把 agentStore 接入 assistant-ui
//
// 使用 useExternalStoreRuntime 把现有的 WS streaming + 自动提交草稿
// 流程包装成 AssistantRuntime，供 ChatPanel 用 assistant-ui 原语渲染。
//
// 适配要点：
// - messages: agentStore.chatMessages（ChatItem[]）
// - isRunning: agentStore.isStreaming（控制 Composer 是否可发送）
// - convertMessage: ChatItem → ThreadMessageLike；最后一条 assistant
//   消息在 streaming 时打 status: "running"，让 MessagePrimitive.Content
//   触发 Empty 占位（显示 "…"）
// - onNew: 从 AppendMessage.content 提取文本；若是 /clear、/export
//   命令则就地处理；否则交给 useWebSocket.sendMessage（它内部会处理
//   auto-commit-draft-first → POST user msg → WS chat 的完整流程）
// ============================================================

import { useExternalStoreRuntime } from "@assistant-ui/react";
import type {
  AppendMessage,
  ExternalStoreAdapter,
  ThreadMessageLike,
} from "@assistant-ui/react";
import { useAgentStore, type ChatItem } from "../store/agentStore";
import { useProjectStore, selectPreviewConfig } from "../store/projectStore";
import { useSelectionStore } from "../store/selectionStore";
import { formatSelectionContext } from "./selectionHelpers";
import { sendMessage } from "../hooks/useWebSocket";
import { buildExportEnvelope, downloadConfig } from "./exportConfig";
import { toast } from "sonner";

// ── ChatItem → ThreadMessageLike ──
// assistant 消息如果有 toolCalls，content 拼成 part 数组：
// [{type:"text", text}, ...toolCalls.map(toToolCallPart)]
// 这样 assistant-ui 的 MessagePrimitive.Content 会用 components.tools slot
// 渲染工具卡片，用 components.Text slot 渲染 markdown。
//
// fromThreadMessageLike 接受这种宽松 tool-call shape（toolCallId 可选），
// 详见 node_modules/@assistant-ui/core/src/runtime/utils/thread-message-like.ts。
function toThreadMessage(
  msg: ChatItem,
  isLast: boolean,
  isStreaming: boolean
): ThreadMessageLike {
  const textPart =
    msg.content && msg.content.length > 0
      ? [{ type: "text" as const, text: msg.content }]
      : [];
  const toolParts = (msg.toolCalls ?? []).map((tc) => ({
    type: "tool-call" as const,
    toolCallId: tc.toolCallId,
    toolName: tc.toolName,
    // SDK input 是 unknown；assistant-ui 期望 ReadonlyJSONObject。
    // 这里 trust agent 发过来的就是普通 JSON object（工具 schema 保证）。
    args: tc.input as { readonly [key: string]: unknown } | undefined,
    argsText:
      tc.input !== undefined ? JSON.stringify(tc.input, null, 2) : undefined,
    result: tc.resultContent,
    isError: tc.isError,
  }));

  const hasParts = textPart.length > 0 || toolParts.length > 0;
  // ThreadMessageLike.content 是 string | Part[]。空字符串让 assistant-ui
  // 的 Empty 占位生效（流式开始时还没有任何文字）。
  // args 字段的严格类型是 ReadonlyJSONObject（递归 JSON），但我们的 input 是
  // unknown（SDK 来的）；这里用整体 cast 一次性跳过 args 字段的协变检查 ——
  // runtime 上 fromThreadMessageLike 接受任意 JSON object 作为 args。
  const content = (
    hasParts ? [...textPart, ...toolParts] : ""
  ) as ThreadMessageLike["content"];

  // status 只对 assistant 消息有意义；最后一条 assistant 在流式期间打 running，
  // 否则 complete —— 让 MessagePrimitive.Content 的 Empty 占位生效。
  if (msg.role !== "assistant") {
    return { id: msg.id, role: msg.role, content };
  }
  const running = isStreaming && isLast;
  return {
    id: msg.id,
    role: msg.role,
    content,
    status: running
      ? { type: "running" }
      : { type: "complete", reason: "stop" },
  };
}

// ── AppendMessage → 纯文本 ──
// Composer 只允许文本输入，content 形如 [{ type: "text", text }]，
// 这里把所有 text part 拼起来。
function extractText(message: AppendMessage): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");
}

// ── /export 命令的本地处理（与 App.tsx 工具栏按钮一致）──
function handleExportCommand(): void {
  const s = useProjectStore.getState();
  const result = buildExportEnvelope({
    projectId: s.projectId ?? "",
    projectTitle: s.projectTitle ?? "未命名",
    headVersionId: s.headVersionId,
    committedConfig: s.committedConfig,
    draft: s.draft,
    versions: s.versions,
  });
  if ("error" in result) {
    toast.error(result.error);
    return;
  }
  const filename = downloadConfig(result.envelope);
  toast.success(`已导出 ${filename}`, {
    description:
      result.envelope.status === "draft"
        ? "草稿状态 — 提交后版本号会推进"
        : `v${result.envelope.sequence} committed`,
  });
}

// ============================================================
// useStudioRuntime — ChatPanel 调用
// ============================================================

export function useStudioRuntime() {
  const chatMessages = useAgentStore((s) => s.chatMessages);
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const clearChat = useAgentStore((s) => s.clearChat);

  const adapter: ExternalStoreAdapter<ChatItem> = {
    messages: chatMessages,
    isRunning: isStreaming,
    convertMessage: (msg, idx) =>
      toThreadMessage(msg, idx === chatMessages.length - 1, isStreaming),
    onNew: async (message: AppendMessage) => {
      const text = extractText(message).trim();
      if (!text) return;

      // ── 命令 ──
      if (text === "/clear") {
        clearChat();
        return;
      }
      if (text === "/export") {
        handleExportCommand();
        return;
      }

      // ── 普通对话：注入选中元素上下文后发送 ──
      let augmentedText = text;
      const sel = useSelectionStore.getState();
      if (sel.isEditMode && sel.selectedActorIds.size > 0) {
        const projectStore = useProjectStore.getState();
        const currentConfig = selectPreviewConfig(projectStore);
        const selectedActors = currentConfig.actors.filter((a) =>
          sel.selectedActorIds.has(a.id)
        );
        const ctx = formatSelectionContext(selectedActors);
        if (ctx) {
          augmentedText = ctx + "\n\n" + text;
        }
      }
      await sendMessage(augmentedText);
    },
  };

  return useExternalStoreRuntime(adapter);
}
