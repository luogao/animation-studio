// ============================================================
// PaletteProposalPicker — 配色方案 3 选 1 交互组件
//
// 渲染在 ToolCallCard 的 generate_color_palettes 分支（即 agent 消息气泡内），
// 替代通用工具卡片样式：突出色卡组合 + 选中/确认两步 + "都不喜欢"。
// - 点色卡 → 选中（单选高亮 + ✓）
// - 点"确认使用方案 N" → sendMessage 应用 + clearActiveProposals
// - 点"都不喜欢" → sendMessage 让 agent 换思路 + clearActiveProposals
//
// 对话里直接说方案号/hex 的"自动应用"在 assistantRuntime.onNew 里处理，不走本组件。
// ============================================================

import { useState } from "react";
import type { PaletteColorRole, HarmonyScheme } from "../types/scene";
import { parsePalettes } from "../lib/colorPalette";
import { sendMessage } from "../hooks/useWebSocket";
import { useAgentStore } from "../store/agentStore";

const PALETTE_ROLE_ORDER: PaletteColorRole[] = [
  "primary",
  "secondary",
  "accent",
  "neutral",
  "foreground",
  "background",
];

const HARMONY_LABELS: Record<HarmonyScheme, string> = {
  analogous: "类比",
  complementary: "互补",
  "split-complementary": "分裂互补",
  triadic: "三元",
  custom: "自定义",
};

export function PaletteProposalPicker({ result }: { result: unknown }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clearActiveProposals = useAgentStore((s) => s.clearActiveProposals);
  const palettes = parsePalettes(result);

  if (!palettes || palettes.length === 0) return null;

  const selectedIndex = palettes.findIndex((p) => p.id === selectedId);
  const selected = selectedIndex >= 0 ? palettes[selectedIndex] : null;

  const handleConfirm = () => {
    if (!selected) return;
    clearActiveProposals();
    void sendMessage(
      `使用配色方案 ${selected.id}（${selected.harmony}）为当前场景重新上色`
    );
  };

  const handleReject = () => {
    clearActiveProposals();
    void sendMessage(
      "这 3 套配色都不太合适，换个思路——换一个主色或换一种和谐方案，重新给我 3 套选择"
    );
  };

  return (
    <div className="palette-picker my-2 flex flex-col gap-2">
      <div className="text-xs font-semibold text-foreground">
        🎨 选择一套配色
        <span className="ml-1 font-normal text-muted-foreground">
          （点选后确认）
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {palettes.map((p, i) => {
          const isSel = p.id === selectedId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={
                "flex items-center gap-2 p-2 rounded border-2 text-left transition-colors " +
                (isSel
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-background/50 hover:bg-accent/40")
              }
              aria-pressed={isSel}
            >
              {/* 方案号 + 选中角标 */}
              <span className="flex flex-col items-center gap-0.5 shrink-0 w-6">
                <span className="text-xs font-mono text-muted-foreground">
                  {i + 1}
                </span>
                {isSel && <span className="text-primary text-xs leading-none">✓</span>}
              </span>

              {/* 六角色块条 */}
              <div className="flex h-7 overflow-hidden border border-border rounded shrink-0">
                {PALETTE_ROLE_ORDER.map((role) => (
                  <span
                    key={role}
                    className="w-7 h-7"
                    style={{ backgroundColor: p.colors[role] }}
                    title={`${role}: ${p.colors[role]}`}
                  />
                ))}
              </div>

              {/* harmony + 主色 */}
              <div className="flex flex-col text-[11px] leading-tight text-muted-foreground min-w-0">
                <span className="font-medium text-foreground">
                  {HARMONY_LABELS[p.harmony] ?? p.harmony}
                </span>
                <span className="font-mono">{p.seed}</span>
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
          {selected ? `确认使用方案 ${selectedIndex + 1}` : "请先选择一套"}
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
