// ============================================================
// ChatPanel — 左侧对话面板（assistant-ui 版）
//
// 状态：useStudioRuntime 把 agentStore + useWebSocket 接成
//       AssistantRuntime，AssistantRuntimeProvider 注入。
// 子组件：children 渲染在顶部（ProjectSwitcher 由 App 注入）
//
// T3c 决策：用 assistant-ui 的 ThreadPrimitive / ComposerPrimitive
// 原语接管消息列表渲染 + 输入框 + 键盘逻辑（Enter 发送 / Shift+Enter
// 换行 / 流式期间禁用 / 自动滚动到底部都由原语负责）；气泡视觉
// 保留 Duotone Poster 样式（用户=海报红，assistant=米色卡片硬边框）。
// ============================================================

import type { ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";
import { useStudioRuntime } from "../lib/assistantRuntime";
import { useAgentStore } from "../store/agentStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownText } from "./MarkdownText";
import { ToolCallCard } from "./ToolCallCard";

export function ChatPanel({ children }: { children?: ReactNode }) {
  const runtime = useStudioRuntime();
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const runState = useAgentStore((s) => s.runState);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <aside className="chat-panel flex flex-col bg-card text-card-foreground h-screen min-w-0">
        {/* ── 顶部：项目切换（由 App 注入）── */}
        {children}

        <ThreadPrimitive.Root className="flex-1 flex flex-col min-h-0">
          {/* ── 消息列表（可滚动 + 自动滚动到底部）── */}
          <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5 min-h-0">
            <ThreadPrimitive.Empty>
              <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground text-center gap-2 text-sm">
                输入消息开始对话
                <br />
                <span className="opacity-60 text-xs">
                  /clear 清空 · /export 导出配置
                </span>
              </div>
            </ThreadPrimitive.Empty>

            <ThreadPrimitive.Messages>
              {({ message }) =>
                message.role === "user" ? <UserBubble /> : <AssistantBubble />
              }
            </ThreadPrimitive.Messages>
          </ThreadPrimitive.Viewport>

          {/* ── 状态条：流式时显示当前 phase（thinking / streaming / tool）── */}
          <PhaseStatusChip runState={runState} />

          {/* ── 底部输入区 ── */}
          <ComposerPrimitive.Root className="flex gap-2 p-3 border-t-2 border-foreground shrink-0">
            <ComposerPrimitive.Input
              asChild
              placeholder="输入消息... (Enter 发送 / Shift+Enter 换行)"
              rows={2}
            >
              <Textarea
                className="flex-1 resize-none min-h-0 bg-card"
                disabled={isStreaming}
              />
            </ComposerPrimitive.Input>
            <ComposerPrimitive.Send asChild>
              <Button
                disabled={isStreaming}
                className="self-end whitespace-nowrap"
              >
                {isStreaming ? "生成中…" : "发送"}
              </Button>
            </ComposerPrimitive.Send>
          </ComposerPrimitive.Root>
        </ThreadPrimitive.Root>
      </aside>
    </AssistantRuntimeProvider>
  );
}

// ============================================================
// 气泡：保留 Duotone Poster 视觉
// ============================================================

function UserBubble() {
  return (
    <MessagePrimitive.Root className="max-w-[85%] px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap self-end bg-primary text-primary-foreground font-medium">
      <MessagePrimitive.Content />
    </MessagePrimitive.Root>
  );
}

function AssistantBubble() {
  return (
    <MessagePrimitive.Root className="max-w-[85%] px-3 py-2 text-sm leading-relaxed self-start bg-card text-card-foreground border-2 border-foreground">
      <MessagePrimitive.Content
        components={{
          // 流式占位：根据 phase 显示 "思考中" / "调用工具" / 默认 "…"
          Empty: PhaseEmpty,
          // markdown 渲染（含流式 caret）
          Text: MarkdownText,
          // 所有工具调用卡片走同一个 Fallback
          tools: { Fallback: ToolCallCard },
        }}
      />
    </MessagePrimitive.Root>
  );
}

// ============================================================
// Phase-aware UI
// ============================================================

// 空助手气泡的占位：读 runState 显示阶段化提示
function PhaseEmpty() {
  const phase = useAgentStore((s) => s.runState?.phase);
  const currentTool = useAgentStore((s) => s.runState?.currentTool);

  if (phase === "thinking") {
    return <span className="opacity-70">🤔 思考中…</span>;
  }
  if (phase === "tool_calling" && currentTool) {
    return (
      <span className="opacity-70">🔧 调用 {currentTool.toolName}…</span>
    );
  }
  return <span className="opacity-60">…</span>;
}

// 状态条：流式期间在输入框上方显示 phase + 计时 + 已生成字符数
function PhaseStatusChip({
  runState,
}: {
  runState: ReturnType<typeof useAgentStore.getState>["runState"];
}) {
  if (!runState) return null;

  const elapsedSec = Math.max(
    0,
    Math.round((Date.now() - runState.startedAt) / 1000)
  );
  const chars = runState.streamedText.length;

  let label: string;
  if (runState.phase === "thinking") {
    label = `思考中 · ${elapsedSec}s`;
  } else if (runState.phase === "streaming") {
    label = `流式中 · ${chars} 字符 · ${elapsedSec}s`;
  } else if (runState.phase === "tool_calling" && runState.currentTool) {
    label = `工具: ${runState.currentTool.toolName} · ${elapsedSec}s`;
  } else if (runState.phase === "complete") {
    label = "完成";
  } else if (runState.phase === "error") {
    label = "出错";
  } else {
    label = "运行中";
  }

  return (
    <div className="px-3 py-1.5 text-xs font-mono text-muted-foreground border-t border-border bg-card/50 shrink-0">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mr-2 align-middle animate-pulse" />
      <span className="align-middle">{label}</span>
    </div>
  );
}
