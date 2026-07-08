// ============================================================
// ActorRenderer.tsx — 根据 actor.type 渲染对应的 SVG 形状
//
// 设计要点：
// - 外层 <g transform="translate(x,y)"> 负责静态定位
// - 内层 <g data-actor-id={id}> 是 GSAP 操作的目标
//   （这样 GSAP 的 CSS transform 不会覆盖位置）
// - 默认 transform-origin: center center 让 scale / rotate 自然
// ============================================================

import type { Actor } from "../types/scene";
import { FALLBACK_ACTOR_COLOR } from "../lib/colorPalette";
import { useSelectionStore } from "../store/selectionStore";
import { getActorBounds } from "../lib/selectionHelpers";

// 默认尺寸（当 actor 未指定 width/height 时使用）
const DEFAULT_BOX_W = 120;
const DEFAULT_BOX_H = 60;
const DEFAULT_CIRCLE_D = 60;
const DEFAULT_GATE_W = 30;
const DEFAULT_GATE_H = 80;

// ------------------------------------------------------------
// 变换字符串拼装
// ------------------------------------------------------------

function buildTransform(actor: Actor): string {
  const parts: string[] = [];
  parts.push(`translate(${actor.x}, ${actor.y})`);

  // 旋转/缩放以 actor 自身中心为原点
  const w = actor.width;
  const h = actor.height;
  const cx = w != null ? w / 2 : DEFAULT_BOX_W / 2;
  const cy = h != null ? h / 2 : DEFAULT_BOX_H / 2;

  if (actor.rotation != null) {
    parts.push(`rotate(${actor.rotation}, ${cx}, ${cy})`);
  }
  if (actor.scale != null && actor.scale !== 1) {
    parts.push(`scale(${actor.scale}, ${cx}, ${cy})`);
  }
  if (actor.skewX != null) {
    parts.push(`skewX(${actor.skewX})`);
  }
  if (actor.skewY != null) {
    parts.push(`skewY(${actor.skewY})`);
  }
  return parts.join(" ");
}

interface Props {
  actor: Actor;
}

export function ActorRenderer({ actor }: Props) {
  const {
    id,
    type,
    label,
    width,
    height,
    color = FALLBACK_ACTOR_COLOR,
    glow,
    fontSize = 14,
    fontWeight = 500,
    fontFamily,
  } = actor;

  // ── 选取状态 ──
  const isEditMode = useSelectionStore((s) => s.isEditMode);
  const isSelected = useSelectionStore((s) => s.selectedActorIds.has(id));
  const toggleActor = useSelectionStore((s) => s.toggleActor);

  const bounds = getActorBounds(actor);

  const handleClick = (e: React.MouseEvent) => {
    if (!isEditMode) return;
    e.stopPropagation(); // 阻止冒泡到 SVG 背景（避免误触发 deselectAll）
    toggleActor(id);
  };

  return (
    <g
      className="actor-group"
      transform={buildTransform(actor)}
      onClick={handleClick}
      style={{ cursor: isEditMode ? "pointer" : undefined }}
    >
      {/* ── 编辑模式：不可见的点击热区 ── */}
      {isEditMode && (
        <rect
          x={0}
          y={0}
          width={bounds.w}
          height={bounds.h}
          fill="transparent"
          pointerEvents="all"
          data-edit-only="true"
        />
      )}

      {/* ── GSAP 目标层（不要放 data-edit-only 元素在这里）── */}
      <g data-actor-id={id} data-actor-type={type} style={glowStyle(glow)}>
        {renderShape(type, {
          width: width ?? DEFAULT_BOX_W,
          height: height ?? DEFAULT_BOX_H,
          circleD: width ?? DEFAULT_CIRCLE_D,
          gateW: width ?? DEFAULT_GATE_W,
          gateH: height ?? DEFAULT_GATE_H,
          color,
          label,
          fontSize,
          fontWeight,
          fontFamily,
        })}
      </g>

      {/* ── 编辑模式：选中指示器（在 GSAP 目标层之外，不受动画影响）── */}
      {isEditMode && isSelected && (
        <rect
          className="selection-indicator"
          x={-4}
          y={-4}
          width={bounds.w + 8}
          height={bounds.h + 8}
          fill="none"
          stroke={FALLBACK_ACTOR_COLOR}
          strokeWidth={2}
          strokeDasharray="6 3"
          rx={4}
          data-edit-only="true"
        />
      )}
    </g>
  );
}

// ------------------------------------------------------------
// 形状渲染
// ------------------------------------------------------------

interface ShapeProps {
  width: number;
  height: number;
  circleD: number;
  gateW: number;
  gateH: number;
  color: string;
  label?: string;
  fontSize: number;
  fontWeight: number;
  fontFamily?: string;
}

function renderShape(type: Actor["type"], p: ShapeProps) {
  switch (type) {
    case "box":
      return (
        <>
          <rect
            width={p.width}
            height={p.height}
            rx={8}
            ry={8}
            fill={p.color}
            fillOpacity={0.15}
            stroke={p.color}
            strokeWidth={1.5}
            data-actor-part="shape"
          />
          {p.label && (
            <text
              x={p.width / 2}
              y={p.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={p.color}
              fontSize={p.fontSize}
              fontWeight={p.fontWeight}
              fontFamily={p.fontFamily ?? "var(--font-sans)"}
              data-actor-part="label"
            >
              {p.label}
            </text>
          )}
        </>
      );

    case "circle": {
      const r = p.circleD / 2;
      return (
        <>
          <circle
            cx={r}
            cy={r}
            r={r}
            fill={p.color}
            fillOpacity={0.15}
            stroke={p.color}
            strokeWidth={1.5}
            data-actor-part="shape"
          />
          {p.label && (
            <text
              x={r}
              y={r}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={p.color}
              fontSize={p.fontSize}
              fontWeight={p.fontWeight}
              fontFamily={p.fontFamily ?? "var(--font-sans)"}
              data-actor-part="label"
            >
              {p.label}
            </text>
          )}
        </>
      );
    }

    case "gate": {
      // 三根竖线构成的"门"
      const lineCount = 3;
      const gap = p.gateW / (lineCount - 1);
      const lines = Array.from({ length: lineCount }, (_, i) => (
        <line
          key={i}
          x1={i * gap}
          y1={0}
          x2={i * gap}
          y2={p.gateH}
          stroke={p.color}
          strokeWidth={2}
        />
      ));
      return (
        <>
          <g data-actor-part="shape">{lines}</g>
          {p.label && (
            <text
              x={p.gateW / 2}
              y={p.gateH + 16}
              textAnchor="middle"
              dominantBaseline="hanging"
              fill={p.color}
              fontSize={p.fontSize}
              fontWeight={p.fontWeight}
              fontFamily={p.fontFamily ?? "var(--font-sans)"}
              data-actor-part="label"
            >
              {p.label}
            </text>
          )}
        </>
      );
    }

    case "text":
      return (
        <text
          x={0}
          y={p.height / 2}
          textAnchor="start"
          dominantBaseline="middle"
          fill={p.color}
          fontSize={p.fontSize}
          fontWeight={p.fontWeight}
          fontFamily={p.fontFamily ?? "var(--font-sans)"}
          data-actor-part="text"
        >
          {p.label ?? ""}
        </text>
      );

    case "diamond":
      return (
        <>
          <polygon
            points={`${p.width / 2},0 ${p.width},${p.height / 2} ${p.width / 2},${p.height} 0,${p.height / 2}`}
            fill={p.color}
            fillOpacity={0.15}
            stroke={p.color}
            strokeWidth={1.5}
            data-actor-part="shape"
          />
          {p.label && (
            <text
              x={p.width / 2}
              y={p.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={p.color}
              fontSize={p.fontSize}
              fontWeight={p.fontWeight}
              fontFamily={p.fontFamily ?? "var(--font-sans)"}
              data-actor-part="label"
            >
              {p.label}
            </text>
          )}
        </>
      );

    default:
      return null;
  }
}

// ------------------------------------------------------------
// 工具：发光滤镜样式
// ------------------------------------------------------------

function glowStyle(glow?: string): React.CSSProperties {
  if (!glow) return { transformOrigin: "center", transformBox: "fill-box" };
  return {
    filter: `drop-shadow(0 0 8px ${glow})`,
    transformOrigin: "center",
    transformBox: "fill-box",
  };
}
