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
import { useState, useEffect, useMemo, useRef } from "react";
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";
import { Brain, ChevronDown, ChevronLeft, ChevronRight, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { useStudioRuntime } from "../lib/assistantRuntime";
import { useAgentStore } from "../store/agentStore";
import { useComposerStore } from "../store/composerStore";
import { uploadImageFile } from "../lib/uploadImage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { MessageAttachment } from "../types/message";
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
                  <UserBubble messageId={message.id} />
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
          <ChatComposer isStreaming={isStreaming} />
        </ThreadPrimitive.Root>
      </aside>
    </AssistantRuntimeProvider>
  );
}

// ============================================================
// Composer —— 文本输入 + 发送 + 图片上传按钮 + 待发送附件预览
// ============================================================

function ChatComposer({ isStreaming }: { isStreaming: boolean }) {
  const pendingImages = useComposerStore((s) => s.pendingImages);
  const addImage = useComposerStore((s) => s.addImage);
  const removeImage = useComposerStore((s) => s.removeImage);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // 允许重复选同一文件
    if (files.length === 0) return;
    setBusy(true);
    try {
      // 逐张上传、逐张追加；单张失败不中断其余
      for (const file of files) {
        try {
          const img = await uploadImageFile(file);
          addImage({ type: "image", url: img.url, width: img.width, height: img.height });
        } catch (err) {
          toast.error(
            err instanceof Error
              ? `${file.name}: ${err.message}`
              : `${file.name} 上传失败`
          );
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0 border-t-2 border-foreground">
      {/* ── 待发送图片预览（可累积多张）── */}
      {pendingImages.length > 0 && (
        <div className="px-3 pt-2">
          <div className="flex items-start gap-2 flex-wrap">
            {pendingImages.map((img, i) => (
              <div key={img.url} className="relative">
                <img
                  src={img.url}
                  alt="待发送"
                  title={`${img.width}×${img.height}`}
                  className="h-16 w-16 object-cover border-2 border-foreground"
                />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[11px] leading-none"
                  aria-label="移除图片"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground leading-tight mt-1 block">
            {pendingImages.length} 张图片 · 随下条消息发送给 agent
          </span>
        </div>
      )}

      <ComposerPrimitive.Root className="flex gap-2 p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handlePick}
          className="hidden"
        />
        <ComposerPrimitive.Input asChild placeholder="输入消息..." rows={2}>
          <Textarea
            className="flex-1 resize-none min-h-0 bg-card"
            disabled={isStreaming}
          />
        </ComposerPrimitive.Input>
        {/* 上传图片按钮（暂存为待发送附件，随下次发送交给 agent 排版）*/}
        <Button
          variant="secondary"
          disabled={isStreaming || busy}
          onClick={() => fileInputRef.current?.click()}
          className="self-end px-2.5"
          aria-label="上传图片"
          title="上传图片（随消息发送给 agent 排版）"
        >
          <ImagePlus className="w-4 h-4" />
        </Button>
        <ComposerPrimitive.Send asChild>
          <Button
            disabled={isStreaming}
            className="self-end whitespace-nowrap"
          >
            {isStreaming ? "生成中…" : "发送"}
          </Button>
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
      {/* 输入框下方快捷键提示 */}
      <div className="px-3 pb-2 text-xs text-muted-foreground">
        Enter 发送 · Shift+Enter 换行
      </div>
    </div>
  );
}

// ============================================================
// 气泡：保留 Duotone Poster 视觉
// ============================================================

function UserBubble({ messageId }: { messageId: string }) {
  // 直接从 ChatItem 读附件渲染（与 AssistantBubble 读 toolCalls 同套路），
  // 避免走 assistant-ui 的 image-slot，规避 API 形状不确定 + 重复渲染。
  const attachments = useAgentStore(
    (s) => s.chatMessages.find((m) => m.id === messageId)?.attachments
  );
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const hasAtt = !!attachments && attachments.length > 0;

  return (
    <MessagePrimitive.Root className="max-w-[85%] px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap self-end bg-primary text-primary-foreground font-medium">
      {hasAtt && attachments && (
        // 一排小图横排；超出可见区域横向滚动（不截断，全部可滑到），
        // 点击单张在大图灯箱里查看，支持左右翻。
        <div className="flex gap-1.5 mb-1 max-w-full overflow-x-auto">
          {attachments.map((a, i) => (
            <button
              key={`${a.url}-${i}`}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="shrink-0 overflow-hidden rounded-sm border border-primary-foreground/30 hover:opacity-80 transition-opacity"
              aria-label={`查看大图 ${i + 1}`}
            >
              <img
                src={a.url}
                alt="上传图片"
                className="block h-16 w-16 object-cover"
              />
            </button>
          ))}
        </div>
      )}
      <MessagePrimitive.Content />
      {hasAtt && attachments && lightboxIndex !== null && (
        <ImageLightbox
          attachments={attachments}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </MessagePrimitive.Root>
  );
}

// ============================================================
// ImageLightbox — 点击缩略图后的大图灯箱（shadcn Dialog 受控）
// 多张时支持左右翻 + 键盘 ← →；Esc / 点遮罩 / 点 ✕ 关闭由 Radix 处理。
// ============================================================
function ImageLightbox({
  attachments,
  index,
  onClose,
  onIndexChange,
}: {
  attachments: MessageAttachment[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}) {
  const count = attachments.length;
  const a = attachments[index];
  const go = (dir: -1 | 1) => onIndexChange((index + dir + count) % count);

  // 键盘左右翻（Esc 关闭由 Radix Dialog 自带）
  useEffect(() => {
    if (count <= 1) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, count]);

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-[90vw] max-h-[90vh] gap-0 border-foreground bg-black/95 p-0 text-white overflow-hidden">
        <DialogTitle className="sr-only">图片预览</DialogTitle>
        <DialogDescription className="sr-only">
          第 {index + 1} 张，共 {count} 张
        </DialogDescription>
        <div className="relative flex items-center justify-center">
          <img
            src={a.url}
            alt="上传图片"
            className="block max-h-[80vh] max-w-[88vw] object-contain"
          />
          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/30"
                aria-label="上一张"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/30"
                aria-label="下一张"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/50 px-2 py-0.5 text-[11px] text-white/90">
                {index + 1} / {count} · {a.width}×{a.height}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
      <div className="flex flex-col gap-1 items-start self-start w-full max-w-[85%]">
        {/* 思考过程模块：渲染在气泡上方。无 thinking 文本时不占位 */}
        <ThinkingBlock messageId={messageId} />
        <MessagePrimitive.Root className="w-full px-3 py-2 text-sm leading-relaxed bg-card text-card-foreground border-2 border-foreground">
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
      </div>
    </ProposalStaleContext.Provider>
  );
}

// ============================================================
// Phase-aware UI
// ============================================================

// 思考过程模块：可折叠，渲染在 assistant 气泡上方。
// 数据来自 ChatItem.thinking（thinking_delta 累加 / DB messages.thinking 持久化）。
// - 流式中（本条是当前 streaming 的最后一条 assistant）：默认展开 + 脉动指示
// - 完成：默认折叠，点击 header 展开
// 无 thinking 文本 → 不渲染（不占位）。
function ThinkingBlock({ messageId }: { messageId: string }) {
  const thinking = useAgentStore(
    (s) => s.chatMessages.find((m) => m.id === messageId)?.thinking
  );
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const isLastAssistant = useAgentStore(
    (s) => s.chatMessages[s.chatMessages.length - 1]?.id === messageId
  );
  // 这条消息是否正处于活跃流式（思考中）
  const isActive = isStreaming && isLastAssistant;

  // 活跃流式时默认展开；流式结束（isActive true→false）自动折叠
  const [open, setOpen] = useState(isActive);
  const prevActive = useRef(isActive);
  useEffect(() => {
    if (prevActive.current && !isActive) setOpen(false);
    prevActive.current = isActive;
  }, [isActive]);

  if (!thinking) return null;

  return (
    <div className="w-full border-l-2 border-foreground/30 bg-muted/30 rounded-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/60 transition-colors"
      >
        {isActive ? (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        ) : null}
        <Brain className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">
          {isActive ? "思考中…" : "思考过程"}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 ml-auto transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="px-2.5 pb-2 pt-0.5 text-xs leading-relaxed text-muted-foreground/90 whitespace-pre-wrap break-words">
          {thinking}
        </div>
      )}
    </div>
  );
}

// 空助手气泡的占位：读 runState 显示阶段化提示
// assistant-ui 的 ConditionalEmpty 机制：当消息最后一个 part 非 text/reasoning 时
// 会强制渲染 Empty。用 status prop（assistant-ui 直接传入）判断是否 running。
// 注意：hooks 必须在所有条件 return 之前调用 —— runState 一次取全。
function PhaseEmpty({ status }: { status?: { type: string } }) {
  const runState = useAgentStore((s) => s.runState);

  // 消息已完成 → 不显示任何占位
  if (status?.type !== "running") return null;

  if (runState?.phase === "thinking") {
    // 已有思考文本在 ThinkingBlock 里流式展示 —— 气泡内不再重复"思考中"
    if (runState.thinkingText) return null;
    return <span className="opacity-70">🤔 思考中…</span>;
  }
  if (runState?.phase === "tool_calling" && runState.currentTool) {
    return (
      <span className="opacity-70">🔧 调用 {runState.currentTool.toolName}…</span>
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
