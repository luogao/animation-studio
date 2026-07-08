// ============================================================
// FontProposalPicker — 字体方案选择交互组件
//
// 渲染在 ToolCallCard 的 search_google_fonts 分支（即 agent 消息气泡内），
// 替代通用工具卡片样式：突出字体预览 + 选中/确认两步 + "都不喜欢"。
// - 点字体卡片 → 选中（单选高亮 + ✓）
// - 点"确认使用此字体" → sendMessage 应用
// - 点"都不喜欢" → sendMessage 让 agent 换方向搜
//
// 字体预览：每个候选字体动态加载 Google Fonts CSS，以自身字体渲染其名称，
// 让用户在对话框内直接看到字体效果。
// ============================================================

import { useState, useEffect, useRef } from "react";
import { sendMessage } from "../hooks/useWebSocket";
import { useAgentStore } from "../store/agentStore";
import type { GoogleFont } from "../lib/googleFonts";
import { CATEGORY_LABELS } from "../lib/googleFonts";

// ------------------------------------------------------------
// 解析 search_google_fonts 工具返回结果
// ------------------------------------------------------------

function parseFontResults(result: unknown): GoogleFont[] | null {
  try {
    if (typeof result === "string") {
      const parsed = JSON.parse(result);
      if (parsed && Array.isArray(parsed.fonts)) return parsed.fonts;
    }
    if (result && typeof result === "object" && Array.isArray((result as any).fonts)) {
      return (result as any).fonts;
    }
  } catch {
    // 解析失败
  }
  return null;
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

// ------------------------------------------------------------
// 组件
// ------------------------------------------------------------

export function FontProposalPicker({ result }: { result: unknown }) {
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const clearActiveProposals = useAgentStore((s) => s.clearActiveProposals);
  const fonts = parseFontResults(result);
  const loadedRef = useRef<Set<string>>(new Set());

  // 加载所有候选字体的预览
  useEffect(() => {
    if (!fonts) return;
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
    if (!selected) return;
    clearActiveProposals();
    void sendMessage(
      `使用字体 ${selected.family}（${CATEGORY_LABELS[selected.category] ?? selected.category}）作为当前场景的字体`
    );
  };

  const handleReject = () => {
    clearActiveProposals();
    void sendMessage(
      "这些字体都不太合适，换个方向搜一下——换一个分类或换一组关键词，重新给我几个选择"
    );
  };

  return (
    <div className="palette-picker my-2 flex flex-col gap-2">
      <div className="text-xs font-semibold text-foreground">
        🔤 选择一款字体
        <span className="ml-1 font-normal text-muted-foreground">
          （点选后确认）
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {fonts.map((f, i) => {
          const isSel = f.family === selectedFamily;
          return (
            <button
              key={f.family}
              type="button"
              onClick={() => setSelectedFamily(f.family)}
              className={
                "flex items-center gap-3 p-3 rounded border-2 text-left transition-colors " +
                (isSel
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-background/50 hover:bg-accent/40")
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
          disabled={!selected}
          onClick={handleConfirm}
          className={
            "px-3 py-1.5 text-xs font-medium rounded border-2 transition-colors " +
            (selected
              ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
              : "border-border bg-muted text-muted-foreground cursor-not-allowed")
          }
        >
          {selected ? `确认使用 ${selected.family}` : "请先选择一款字体"}
        </button>
        <button
          type="button"
          onClick={handleReject}
          className="px-3 py-1.5 text-xs rounded border border-border bg-card text-muted-foreground hover:bg-accent transition-colors"
        >
          都不喜欢
        </button>
      </div>
    </div>
  );
}
