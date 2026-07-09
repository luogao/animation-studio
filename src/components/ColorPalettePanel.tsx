// ============================================================
// ColorPalettePanel — 配色系统入口（工具栏 popover）
//
// 用户挑一个主色 → 点"生成 3 套配色" → sendMessage 触发 agent
// 调 generate_color_palettes → ToolCallCard 渲染 3 选 1 提案。
// 本组件只负责"挑主色 + 发起生成"；方案的选择与应用在 ToolCallCard 里。
// ============================================================

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { sendMessage } from "../hooks/useWebSocket";
import { Palette } from "lucide-react";

export function ColorPalettePanel() {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState("#e8a230");
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭 popover（仿 App.tsx 的 export 下拉）
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const handleGenerate = () => {
    setOpen(false);
    void sendMessage(`为主色 ${color} 生成 3 套配色方案`);
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        onClick={() => setOpen((v) => !v)}
        variant="secondary"
        size="sm"
      >
        <Palette size={14} /> 配色
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg p-3 min-w-[220px] flex flex-col gap-2">
          <div className="text-xs text-muted-foreground">
            选一个主色，智能生成 3 套配色
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="主色选择器"
              className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent p-0"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="主色 hex 值"
              className="flex-1 px-2 py-1 text-xs font-mono rounded border border-border bg-background text-foreground"
            />
          </div>
          <Button onClick={handleGenerate} size="sm">
            生成 3 套配色
          </Button>
        </div>
      )}
    </div>
  );
}
