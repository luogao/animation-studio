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
import { useState, useEffect, useMemo } from "react";
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
import { SelectionTags } from "./SelectionTags";
import { FontProposalPicker } from "./FontProposalPicker";
import { parseFontResult, type GoogleFont } from "../lib/googleFonts";
import { ProposalStaleContext } from "./proposalLock";

export function ChatPanel({ children }: { children?: ReactNode }) {
  const runtime = useStudioRuntime();
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const runState = useAgentStore((s) => s.runState);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <aside className="chat-panel flex flex-col bg-card text-card-foreground h-full min-w-0">
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
                message.role === "user" ? (
                  <UserBubble />
                ) : (
                  <AssistantBubble messageId={message.id} />
                )
              }
            </ThreadPrimitive.Messages>
          </ThreadPrimitive.Viewport>

          {/* ── 状态条：流式时显示当前 phase（thinking / streaming / tool）── */}
          <PhaseStatusChip runState={runState} />

          {/* ── 选中元素标签栏（编辑模式下显示在输入框上方）── */}
          <SelectionTags />

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

function AssistantBubble({ messageId }: { messageId: string }) {
  // 该消息里所有 search_google_fonts 调用的返回结果，合并去重后渲染成
  // 单个选择器——避免 agent 一轮里搜多次时刷出多个各自带确认按钮的选择器。
  const toolCalls = useAgentStore(
    (s) => s.chatMessages.find((m) => m.id === messageId)?.toolCalls
  );
  // 本消息是否「已过期」：不是对话最后一条消息时为 true。刷新后仍成立
  // （派生自持久化的消息列表），用来把历史提案选择器锁成不可点击。
  const isStale = useAgentStore(
    (s) => s.chatMessages[s.chatMessages.length - 1]?.id !== messageId
  );
  const fontOptions = useMemo<GoogleFont[]>(() => {
    if (!toolCalls) return [];
    const seen = new Set<string>();
    const out: GoogleFont[] = [];
    for (const tc of toolCalls) {
      if (!tc.toolName?.includes("search_google_fonts")) continue;
      for (const f of parseFontResult(tc.resultContent)) {
        if (f.family && !seen.has(f.family)) {
          seen.add(f.family);
          out.push(f);
        }
      }
    }
    return out;
  }, [toolCalls]);

  return (
    <ProposalStaleContext.Provider value={isStale}>
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
        {fontOptions.length > 0 && <FontProposalPicker fonts={fontOptions} />}
      </MessagePrimitive.Root>
    </ProposalStaleContext.Provider>
  );
}

// ============================================================
// Phase-aware UI
// ============================================================

// 空助手气泡的占位：读 runState 显示阶段化提示
// assistant-ui 的 ConditionalEmpty 机制：当消息最后一个 part 非 text/reasoning 时
// 会强制渲染 Empty。用 status prop（assistant-ui 直接传入）判断是否 running。
function PhaseEmpty({ status }: { status?: { type: string } }) {
  // 消息已完成 → 不显示任何占位
  if (status?.type !== "running") return null;

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
  // 自驱计时：每秒 tick 一次，不依赖 agent_state 广播频率
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!runState) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [runState?.runId]);

  if (!runState) return null;

  const elapsedSec = Math.max(
    0,
    Math.round((Date.now() - runState.startedAt) / 1000)
  );
  const chars = runState.streamedText.length;
  // suppress: tick 用来驱动重渲染，elapsedSec 从 Date.now() 读真实时间
  void tick;

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
