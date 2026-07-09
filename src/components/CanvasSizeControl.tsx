// ============================================================
// CanvasSizeControl.tsx — 画布尺寸输入 + 预设下拉
//
// - width / height 数字输入框（失焦时提交，避免每次按键都重排画布）
// - 预设下拉：1440×810 / 1080×1920 / 1920×1080 / 自定义
// - 调 applyAgentConfig：把整个 config 复制一份再覆盖 width/height
//   （canvasSize 字段已删除，单一真相走 config.width/height）
// ============================================================

import { useEffect, useState } from "react";
import {
  useProjectStore,
  selectPreviewConfig,
} from "../store/projectStore";
import { PRESET_SIZES } from "../types/scene";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CanvasSizeControl() {
  const config = useProjectStore(selectPreviewConfig);
  const applyAgentConfig = useProjectStore((s) => s.applyAgentConfig);

  const [width, setWidth] = useState(config.width);
  const [height, setHeight] = useState(config.height);

  // store 变化时（例如预设按钮、agent 改了画布）同步到本地输入框
  useEffect(() => {
    setWidth(config.width);
    setHeight(config.height);
  }, [config.width, config.height]);

  // 当前是否匹配某个预设
  const matchedPreset = PRESET_SIZES.find(
    (p) => p.width === config.width && p.height === config.height
  );
  const currentValue = matchedPreset?.label ?? "自定义";

  const commit = (w: number, h: number) => {
    const safeW = Math.max(32, Math.min(4096, Math.round(w) || 32));
    const safeH = Math.max(32, Math.min(4096, Math.round(h) || 32));
    applyAgentConfig({ ...config, width: safeW, height: safeH });
  };

  const applyPreset = (label: string) => {
    if (label === "自定义") return;
    const preset = PRESET_SIZES.find((p) => p.label === label);
    if (preset) commit(preset.width, preset.height);
  };

  return (
    <div className="flex items-center gap-2 text-[13px]">
      <span className="text-muted-foreground">尺寸</span>

      <Input
        type="number"
        min={32}
        max={4096}
        value={width}
        onChange={(e) => setWidth(Number(e.target.value))}
        onBlur={() => commit(width, height)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(width, height);
        }}
        className="w-[72px] h-7 font-mono text-xs px-2"
      />

      <span className="text-muted-foreground">×</span>

      <Input
        type="number"
        min={32}
        max={4096}
        value={height}
        onChange={(e) => setHeight(Number(e.target.value))}
        onBlur={() => commit(width, height)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(width, height);
        }}
        className="w-[72px] h-7 font-mono text-xs px-2"
      />

      <Select value={currentValue} onValueChange={applyPreset}>
        <SelectTrigger size="sm" className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="自定义">自定义</SelectItem>
          {PRESET_SIZES.map((p) => (
            <SelectItem key={p.label} value={p.label}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
