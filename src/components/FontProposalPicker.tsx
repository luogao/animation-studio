// ============================================================
// FontProposalPicker — 字体方案选择交互组件
//
// 渲染位置：AssistantBubble 内（每个 assistant 消息一个实例）。 caller
// (ChatPanel) 把该消息里所有 search_google_fonts 工具调用的返回结果
// 合并去重后，作为 fonts 传入——所以哪怕 agent 一轮里搜了多次，用户也
// 只看到一个统一的选择器，而不是一堆各带确认按钮的卡片。
//
// 交互：
// - 点字体卡片 → 选中（单选高亮 + ✓）
// - 点"确认使用此字体" → sendMessage 应用，并锁定（不可再点）
// - 点"都不喜欢" → sendMessage 让 agent 换方向搜，并锁定
//
// 字体预览：每个候选字体动态加载 Google Fonts CSS，以自身字体渲染其名称，
// 让用户在对话框内直接看到字体效果。
//
// 锁定：一旦确认/拒绝，整组按钮置灰禁用，避免回看气泡时误触二次发送。
// 锁定来源有两个，取或：
//   1. local `used` —— 同一会话内立即锁定（确认/换一批后）
//   2. `stale`（useProposalStale）—— 本消息非对话最后一条时为 true，
//      派生自持久化消息列表，刷新页面后依然锁定。
// ============================================================

import { useState, useEffect, useRef } from "react";
import { sendMessage } from "../hooks/useWebSocket";
import type { GoogleFont } from "../lib/googleFonts";
import { CATEGORY_LABELS } from "../lib/googleFonts";
import { useProposalStale } from "./proposalLock";

type UsedState = null | "confirmed" | "rejected";

export function FontProposalPicker({ fonts }: { fonts: GoogleFont[] }) {
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const [used, setUsed] = useState<UsedState>(null);
  const stale = useProposalStale();
  const locked = !!used || stale;
  const loadedRef = useRef<Set<string>>(new Set());

  // 加载所有候选字体的预览
  useEffect(() => {
    for (const f of fonts) {
      if (!loadedRef.current.has(f.family)) {
        loadPreviewFont(f.family);
        loadedRef.current.add(f.family);
      }
    }
  }, [fonts]);

  if (!fonts || fonts.length === 0) return null;

  const selectedIndex = fonts.findIndex((f) => f.family === selectedFamily);
  const selected = selectedIndex >= 0 ? fonts[selectedIndex] : null;

  const handleConfirm = () => {
    if (locked || !selected) return;
    setUsed("confirmed");
    void sendMessage(
      `使用字体 ${selected.family}（${
        CATEGORY_LABELS[selected.category] ?? selected.category
      }）作为当前场景的字体`
    );
  };

  const handleReject = () => {
    if (locked) return;
    setUsed("rejected");
    void sendMessage(
      "这些字体都不太合适，换个方向搜一下——换一个分类或换一组关键词，重新给我几个选择"
    );
  };

  return (
    <div
      className="palette-picker my-2 flex flex-col gap-2"
      data-used={used ?? undefined}
      data-locked={locked || undefined}
    >
      <div className="text-xs font-semibold text-foreground">
        {used === "confirmed" ? (
          <>✅ 已应用字体</>
        ) : used === "rejected" ? (
          <>↻ 已换一批，等待新结果</>
        ) : stale ? (
          <>🔒 此提案已结束</>
        ) : (
          <>
            🔤 选择一款字体
            <span className="ml-1 font-normal text-muted-foreground">
              （点选后确认）
            </span>
          </>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {fonts.map((f, i) => {
          const isSel = f.family === selectedFamily;
          return (
            <button
              key={f.family}
              type="button"
              disabled={locked}
              onClick={() => setSelectedFamily(f.family)}
              className={
                "flex items-center gap-3 p-3 rounded border-2 text-left transition-colors " +
                (isSel
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-background/50 hover:bg-accent/40") +
                (locked ? " opacity-60 cursor-not-allowed" : "")
              }
              aria-pressed={isSel}
            >
              {/* 序号 + 选中角标 */}
              <span className="flex flex-col items-center gap-0.5 shrink-0 w-5">
                <span className="text-xs font-mono text-muted-foreground">
                  {i + 1}
                </span>
                {isSel && <span className="text-primary text-xs leading-none">✓</span>}
              </span>

              {/* 字体预览：用自身字体渲染名称 */}
              <div className="flex-1 min-w-0">
                <span
                  className="block text-xl leading-tight truncate"
                  style={{ fontFamily: `"${f.family}", var(--font-sans)` }}
                >
                  {f.family}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  {CATEGORY_LABELS[f.category] ?? f.category}
                  {" · "}
                  字重 {f.variants.join("/")}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 底部操作区 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={locked || !selected}
          onClick={handleConfirm}
          className={
            "px-3 py-1.5 text-xs font-medium rounded border-2 transition-colors " +
            (locked || !selected
              ? "border-border bg-muted text-muted-foreground cursor-not-allowed"
              : "border-primary bg-primary text-primary-foreground hover:bg-primary/90")
          }
        >
          {used === "confirmed"
            ? `已应用 ${selected?.family ?? ""}`
            : stale
            ? "已结束"
            : selected
            ? `确认使用 ${selected.family}`
            : "请先选择一款字体"}
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={handleReject}
          className={
            "px-3 py-1.5 text-xs rounded border border-border bg-card text-muted-foreground transition-colors " +
            (locked ? "opacity-60 cursor-not-allowed" : "hover:bg-accent")
          }
        >
          都不喜欢
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 动态加载单个 Google Font（用于预览）
// ------------------------------------------------------------

function loadPreviewFont(family: string): void {
  const escaped = CSS.escape(family);
  if (document.querySelector(`link[data-preview-font="${escaped}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@400;500;700;900&display=swap`;
  link.setAttribute("data-preview-font", escaped);
  document.head.appendChild(link);
}
