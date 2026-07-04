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

// 默认尺寸（当 actor 未指定 width/height 时使用）
const DEFAULT_BOX_W = 120;
const DEFAULT_BOX_H = 60;
const DEFAULT_CIRCLE_D = 60;
const DEFAULT_GATE_W = 30;
const DEFAULT_GATE_H = 80;

interface Props {
  actor: Actor;
}

export function ActorRenderer({ actor }: Props) {
  const {
    id,
    type,
    label,
    x,
    y,
    width,
    height,
    color = "#e8a230",
    glow,
    fontSize = 14,
    fontWeight = 500,
  } = actor;

  return (
    <g transform={`translate(${x}, ${y})`}>
      <g data-actor-id={id} style={glowStyle(glow)}>
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
        })}
      </g>
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
              fontFamily="var(--font-sans)"
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
              fontFamily="var(--font-sans)"
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
          {lines}
          {p.label && (
            <text
              x={p.gateW / 2}
              y={p.gateH + 16}
              textAnchor="middle"
              dominantBaseline="hanging"
              fill={p.color}
              fontSize={p.fontSize}
              fontWeight={p.fontWeight}
              fontFamily="var(--font-sans)"
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
          fontFamily="var(--font-sans)"
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
              fontFamily="var(--font-sans)"
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
