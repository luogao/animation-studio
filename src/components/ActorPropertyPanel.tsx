// ============================================================
// ActorPropertyPanel.tsx — 右侧属性编辑面板
//
// 在编辑模式下选中 actor 时显示，支持手动修改颜色和字体属性。
// 多选时显示共同值，修改批量应用到所有选中 actor。
// ============================================================

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { X, ChevronDown, ChevronRight, Palette, Type } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useSelectionStore } from "../store/selectionStore";
import { useProjectStore, selectPreviewConfig } from "../store/projectStore";
import { searchFonts, type GoogleFont } from "../lib/googleFonts";
import { FALLBACK_ACTOR_COLOR, normalizeHex } from "../lib/colorPalette";
import type { Actor, ActorType } from "../types/scene";
import { cn } from "../lib/utils";

// 会渲染 label 的形状 —— 这些类型共享字号/字重/字体控件。
// （image / path 默认无文字 label，不进排版区。）
const LABEL_BEARING_TYPES: ReadonlySet<ActorType> = new Set([
  "text",
  "box",
  "circle",
  "gate",
  "diamond",
  "polygon",
  "star",
]);

// ============================================================
// 工具：多选共同值
// ============================================================

type CommonValue<T> =
  | { value: T; mixed: false }
  | { value: undefined; mixed: true };

function getCommonValue<T extends keyof Actor>(
  actors: Actor[],
  key: T
): CommonValue<Actor[T]> {
  if (actors.length === 0) return { value: undefined, mixed: true };
  const first = actors[0][key];
  const allSame = actors.every((a) => a[key] === first);
  return allSame
    ? { value: first, mixed: false }
    : { value: undefined, mixed: true };
}

// ============================================================
// 子组件：可折叠分区
// ============================================================

function CollapsibleSection({
  label,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-semibold hover:bg-muted/30 transition-colors cursor-pointer"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        {label}
      </button>
      {open && <div className="px-3 pb-2 flex flex-col gap-1.5">{children}</div>}
    </div>
  );
}

// ============================================================
// 子组件：颜色字段（color input + hex text）
// ============================================================

function ColorField({
  label,
  value,
  onChange,
  onClear,
  placeholder = FALLBACK_ACTOR_COLOR,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  onClear?: () => void;
  placeholder?: string;
}) {
  const displayValue = value ?? placeholder;

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="w-6 h-6 rounded border border-border cursor-pointer bg-transparent p-0 shrink-0"
        />
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            const raw = e.target.value;
            try {
              onChange(normalizeHex(raw));
            } catch {
              // 无效 hex，保留旧值 — 仅在 blur 时强制回写
            }
          }}
          onBlur={(e) => {
            // blur 时确保显示合法值
            try {
              normalizeHex(e.target.value);
            } catch {
              // 触发一次重渲染让它回退到 displayValue
              e.target.value = displayValue;
            }
          }}
          aria-label={`${label} hex 值`}
          className="flex-1 px-1.5 py-1 text-[11px] font-mono rounded border border-border bg-background text-foreground min-w-0"
        />
        {onClear && value != null && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 p-0.5 rounded hover:bg-muted-foreground/20 transition-colors text-muted-foreground hover:text-foreground"
            aria-label={`清除 ${label}`}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 子组件：滑块 + 数字输入
// ============================================================

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  placeholder?: string;
}) {
  const [localText, setLocalText] = useState(
    value != null ? String(value) : ""
  );

  // 外部值变化时同步本地文本
  useEffect(() => {
    setLocalText(value != null ? String(value) : "");
  }, [value]);

  const sliderValue = value != null ? [value] : [min];

  const commit = useCallback(
    (raw: string) => {
      const n = Number(raw);
      if (isNaN(n) || raw.trim().length === 0) {
        // 回退到当前值
        setLocalText(value != null ? String(value) : "");
        return;
      }
      const clamped = Math.round((Math.min(max, Math.max(min, n)) / step)) * step;
      // 确保 clamped 是 step 的整数倍
      const stepped = step < 1
        ? Math.round(clamped / step) * step
        : Math.round(clamped / step) * step;
      onChange(stepped);
    },
    [value, min, max, step, onChange]
  );

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <Slider
          value={sliderValue}
          min={min}
          max={max}
          step={step}
          onValueChange={([v]) => onChange(v!)}
          className="flex-1"
        />
        <input
          type="text"
          inputMode="numeric"
          value={localText}
          placeholder={placeholder}
          onChange={(e) => {
            setLocalText(e.target.value);
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit((e.target as HTMLInputElement).value);
            }
          }}
          aria-label={label}
          className="w-12 px-1.5 py-0.5 text-[11px] font-mono rounded border border-border bg-background text-foreground text-center"
        />
      </div>
    </div>
  );
}

// ============================================================
// 子组件：字体自动补全输入
// ============================================================

function FontFamilyField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GoogleFont[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 同步外部值到本地 query
  useEffect(() => {
    setQuery(value ?? "");
  }, [value]);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!dropdownOpen) return;
    const onDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [dropdownOpen]);

  const handleInputChange = (raw: string) => {
    setQuery(raw);
    const fonts = searchFonts(raw, undefined, 6);
    setResults(fonts);
    setDropdownOpen(fonts.length > 0);
  };

  const handleSelect = (font: GoogleFont) => {
    onChange(font.family);
    setQuery(font.family);
    setDropdownOpen(false);
  };

  const handleBlur = () => {
    // 若用户输入了非空内容且未从下拉中选择，尝试精确匹配
    const trimmed = query.trim();
    if (trimmed.length > 0) {
      const fonts = searchFonts(trimmed, undefined, 1);
      if (fonts.length > 0 && fonts[0]!.family.toLowerCase() === trimmed.toLowerCase()) {
        // 精确匹配 → 应用规范化名称
        onChange(fonts[0]!.family);
        setQuery(fonts[0]!.family);
      }
    }
    // 延迟关闭，让点击事件先触发
    setTimeout(() => setDropdownOpen(false), 150);
  };

  return (
    <div className="flex flex-col gap-0.5 relative" ref={containerRef}>
      <span className="text-[10px] text-muted-foreground">字体</span>
      <input
        type="text"
        value={query}
        placeholder="Roboto"
        onChange={(e) => handleInputChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const trimmed = query.trim();
            if (trimmed.length > 0) {
              const fonts = searchFonts(trimmed, undefined, 1);
              if (fonts.length > 0) {
                handleSelect(fonts[0]!);
              }
            }
          }
          if (e.key === "Escape") {
            setDropdownOpen(false);
          }
        }}
        aria-label="字体"
        className="px-1.5 py-1 text-[11px] rounded border border-border bg-background text-foreground min-w-0"
      />
      {dropdownOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-0.5 z-50 bg-popover border border-border rounded-md shadow-lg py-0.5 max-h-[160px] overflow-y-auto">
          {results.map((font) => (
            <button
              key={font.family}
              type="button"
              onMouseDown={(e) => {
                // 阻止 onBlur 先触发
                e.preventDefault();
                handleSelect(font);
              }}
              className={cn(
                "w-full text-left px-2 py-1 text-[11px] hover:bg-accent transition-colors flex items-center justify-between gap-1",
                font.family === value && "bg-accent/50"
              )}
            >
              <span className="truncate max-w-[160px]">{font.family}</span>
              <span className="text-[9px] text-muted-foreground shrink-0">
                {font.category}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================

export function ActorPropertyPanel() {
  const isEditMode = useSelectionStore((s) => s.isEditMode);
  const selectedActorIds = useSelectionStore((s) => s.selectedActorIds);
  const deselectAll = useSelectionStore((s) => s.deselectAll);
  const config = useProjectStore(selectPreviewConfig);
  const applyAgentConfig = useProjectStore((s) => s.applyAgentConfig);

  // 筛选当前选中的 actor
  const selectedActors = useMemo(
    () => config.actors.filter((a) => selectedActorIds.has(a.id)),
    [config.actors, selectedActorIds]
  );

  // 是否包含"带 label 的形状"（text + 所有会渲染 label 的几何形状）
  // 这些类型共享字号/字重/字体控件。
  const hasLabeledActor = useMemo(
    () => selectedActors.some((a) => LABEL_BEARING_TYPES.has(a.type)),
    [selectedActors]
  );

  // 多选时的共同值
  const commonColor = useMemo(
    () => getCommonValue(selectedActors, "color"),
    [selectedActors]
  );
  const commonGlow = useMemo(
    () => getCommonValue(selectedActors, "glow"),
    [selectedActors]
  );
  const commonFontSize = useMemo(
    () =>
      hasLabeledActor ? getCommonValue(selectedActors, "fontSize") : null,
    [selectedActors, hasLabeledActor]
  );
  const commonFontWeight = useMemo(
    () =>
      hasLabeledActor ? getCommonValue(selectedActors, "fontWeight") : null,
    [selectedActors, hasLabeledActor]
  );
  const commonFontFamily = useMemo(
    () =>
      hasLabeledActor ? getCommonValue(selectedActors, "fontFamily") : null,
    [selectedActors, hasLabeledActor]
  );

  // 批量更新选中 actor 的指定属性
  const updateActorProperty = useCallback(
    <K extends keyof Actor>(key: K, value: Actor[K]) => {
      const updatedActors = config.actors.map((a) => {
        if (selectedActorIds.has(a.id)) {
          return { ...a, [key]: value };
        }
        return a;
      });
      applyAgentConfig({ ...config, actors: updatedActors });
    },
    [config, selectedActorIds, applyAgentConfig]
  );

  // ── 条件渲染 ──
  if (!isEditMode || selectedActors.length === 0) return null;

  return (
    <aside className="w-[220px] shrink-0 border-l-2 border-border bg-card/30 flex flex-col h-screen overflow-y-auto">
      {/* ── 头部 ── */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-bold">属性</span>
        {selectedActors.length > 1 && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono">
            {selectedActors.length}
          </span>
        )}
        <button
          type="button"
          onClick={deselectAll}
          className="ml-auto p-0.5 rounded hover:bg-muted-foreground/20 transition-colors text-muted-foreground hover:text-foreground"
          aria-label="关闭属性面板"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── 外观分区 ── */}
      <CollapsibleSection label="外观" icon={Palette} defaultOpen>
        <ColorField
          label="填充颜色"
          value={
            commonColor.mixed
              ? undefined
              : (commonColor.value as string | undefined)
          }
          onChange={(v) => updateActorProperty("color", v)}
        />
        <ColorField
          label="发光颜色"
          value={
            commonGlow.mixed
              ? undefined
              : (commonGlow.value as string | undefined)
          }
          onChange={(v) => updateActorProperty("glow", v)}
          onClear={() => updateActorProperty("glow", undefined)}
        />
      </CollapsibleSection>

      {/* ── 排版分区（带 label 的形状）── */}
      {hasLabeledActor && (
        <CollapsibleSection label="排版" icon={Type} defaultOpen>
          <SliderField
            label="字号"
            value={
              commonFontSize?.mixed
                ? undefined
                : (commonFontSize?.value as number | undefined)
            }
            onChange={(v) => updateActorProperty("fontSize", v)}
            min={8}
            max={200}
            placeholder="--"
          />
          <SliderField
            label="字重"
            value={
              commonFontWeight?.mixed
                ? undefined
                : (commonFontWeight?.value as number | undefined)
            }
            onChange={(v) => updateActorProperty("fontWeight", v)}
            min={100}
            max={900}
            step={100}
            placeholder="--"
          />
          <FontFamilyField
            value={
              commonFontFamily?.mixed
                ? undefined
                : (commonFontFamily?.value as string | undefined)
            }
            onChange={(v) => updateActorProperty("fontFamily", v)}
          />
        </CollapsibleSection>
      )}
    </aside>
  );
}
