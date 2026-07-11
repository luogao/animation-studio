// ============================================================
// actorShapes.tsx — Actor 内层形状的共享渲染器
//
// 设计目的：
// - 把"某种 actor.type 画成什么 SVG"的逻辑收敛到唯一一处，
//   供 ActorRenderer（主画布）与 ScenePreviewThumb（缩略图）共用，
//   杜绝新增形状时两处渲染漂移（历史上 Thumb 有独立 switch 易漏）。
// - 几何计算（正多边形 / 星形顶点串）作为纯函数导出，便于单测复用。
//
// 注意：
// - 本函数只画"形状本体 + 可选 label"，在本地坐标系（左上角原点）。
//   定位 translate(x,y)、发光 filter、GSAP data-actor-id 包装层都由调用方负责。
// - text 类型不在此处理（它是纯文字、定位语义不同），由调用方各自渲染。
// - 样式差异（主画布半透明填充 vs 缩略图实心填充）通过 RenderShapeOpts 传入。
// ============================================================

import type { Actor, ActorType } from "../types/scene";

// === 默认尺寸（与 selectionHelpers.ts 保持一致）===
export const DEFAULT_BOX_W = 120;
export const DEFAULT_BOX_H = 60;
export const DEFAULT_CIRCLE_D = 60;
export const DEFAULT_GATE_W = 30;
export const DEFAULT_GATE_H = 80;
export const DEFAULT_IMAGE_W = 200;
export const DEFAULT_IMAGE_H = 150;

export type ImageLoadStatus = "idle" | "loading" | "loaded" | "error";

export interface RenderShapeOpts {
  width: number;
  height: number;
  fill: string;
  fillOpacity: number; // 主画布 0.15；缩略图 1
  stroke: string; // 主画布用 color；缩略图用 rgba 白
  strokeWidth: number; // 主画布 1.5；缩略图 0.5
  cornerRadius?: number; // box 圆角；主画布 8，缩略图 2
  showLabel: boolean;
  labelText?: string;
  labelFill?: string; // 默认 = fill
  fontSize: number;
  fontWeight: number;
  fontFamily?: string;
  // === 形状参数（按 type 生效）===
  sides?: number; // polygon
  points?: number; // star
  innerRatio?: number; // star
  d?: string; // path
  // === image 专用 ===
  src?: string;
  imageStatus?: ImageLoadStatus;
}

// ------------------------------------------------------------
// 几何：正多边形顶点串
// 顶点从正上方（-90°）开始，外接于 width×height 矩形并居中。
// ------------------------------------------------------------
export function polygonPoints(sides: number, w: number, h: number): string {
  const n = Math.max(3, Math.min(12, Math.round(sides)));
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    pts.push(`${(cx + rx * Math.cos(angle)).toFixed(2)},${(cy + ry * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(" ");
}

// ------------------------------------------------------------
// 几何：星形顶点串（外/内半径交替）
// points = 角数；innerRatio = 内顶点半径 / 外顶点半径（0-1）
// ------------------------------------------------------------
export function starPoints(
  points: number,
  innerRatio: number,
  w: number,
  h: number
): string {
  const n = Math.max(4, Math.min(12, Math.round(points)));
  const ratio = Math.max(0.1, Math.min(0.9, innerRatio));
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const pts: string[] = [];
  const total = n * 2;
  for (let i = 0; i < total; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / n;
    const isOuter = i % 2 === 0;
    const fx = isOuter ? rx : rx * ratio;
    const fy = isOuter ? ry : ry * ratio;
    pts.push(`${(cx + fx * Math.cos(angle)).toFixed(2)},${(cy + fy * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(" ");
}

// ------------------------------------------------------------
// label 渲染（居中于给定坐标）
// ------------------------------------------------------------
function CenteredLabel({
  x,
  y,
  text,
  opts,
}: {
  x: number;
  y: number;
  text: string;
  opts: RenderShapeOpts;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      fill={opts.labelFill ?? opts.fill}
      fontSize={opts.fontSize}
      fontWeight={opts.fontWeight}
      fontFamily={opts.fontFamily ?? "var(--font-sans)"}
      data-actor-part="label"
    >
      {text}
    </text>
  );
}

// ------------------------------------------------------------
// 主入口：按 actor.type 渲染内层形状（不含 text 类型）
// ------------------------------------------------------------
export function renderActorShape(
  type: Exclude<ActorType, "text">,
  opts: RenderShapeOpts
) {
  const { width: w, height: h, fill, fillOpacity, stroke, strokeWidth } = opts;
  const cornerRadius = opts.cornerRadius ?? 8;
  const label = opts.showLabel;

  switch (type) {
    case "box":
      return (
        <>
          <rect
            width={w}
            height={h}
            rx={cornerRadius}
            ry={cornerRadius}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            data-actor-part="shape"
          />
          {label && <CenteredLabel x={w / 2} y={h / 2} text={opts.labelText ?? ""} opts={opts} />}
        </>
      );

    case "circle": {
      // 以 width 为直径（与主画布历史行为一致）
      const r = w / 2;
      return (
        <>
          <circle
            cx={r}
            cy={r}
            r={r}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            data-actor-part="shape"
          />
          {label && <CenteredLabel x={r} y={r} text={opts.labelText ?? ""} opts={opts} />}
        </>
      );
    }

    case "gate": {
      // 三根竖线构成的"门"，宽度=gateW，高度=gateH
      const lineCount = 3;
      const gap = w / (lineCount - 1);
      const lines = Array.from({ length: lineCount }, (_, i) => (
        <line
          key={i}
          x1={i * gap}
          y1={0}
          x2={i * gap}
          y2={h}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      ));
      return (
        <>
          <g data-actor-part="shape">{lines}</g>
          {label && (
            <text
              x={w / 2}
              y={h + 16}
              textAnchor="middle"
              dominantBaseline="hanging"
              fill={opts.labelFill ?? fill}
              fontSize={opts.fontSize}
              fontWeight={opts.fontWeight}
              fontFamily={opts.fontFamily ?? "var(--font-sans)"}
              data-actor-part="label"
            >
              {opts.labelText ?? ""}
            </text>
          )}
        </>
      );
    }

    case "diamond":
      return (
        <>
          <polygon
            points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            data-actor-part="shape"
          />
          {label && <CenteredLabel x={w / 2} y={h / 2} text={opts.labelText ?? ""} opts={opts} />}
        </>
      );

    case "polygon":
      return (
        <>
          <polygon
            points={polygonPoints(opts.sides ?? 6, w, h)}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            data-actor-part="shape"
          />
          {label && <CenteredLabel x={w / 2} y={h / 2} text={opts.labelText ?? ""} opts={opts} />}
        </>
      );

    case "star":
      return (
        <>
          <polygon
            points={starPoints(opts.points ?? 5, opts.innerRatio ?? 0.4, w, h)}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            data-actor-part="shape"
          />
          {label && <CenteredLabel x={w / 2} y={h / 2} text={opts.labelText ?? ""} opts={opts} />}
        </>
      );

    case "path":
      return (
        <>
          <path
            d={opts.d ?? ""}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            data-actor-part="shape"
          />
          {label && opts.d && (
            <CenteredLabel x={w / 2} y={h / 2} text={opts.labelText ?? ""} opts={opts} />
          )}
        </>
      );

    case "image": {
      const loaded = opts.imageStatus === "loaded" && !!opts.src;
      if (loaded) {
        return (
          <image
            href={opts.src}
            width={w}
            height={h}
            preserveAspectRatio="xMidYMid meet"
            data-actor-part="shape"
          />
        );
      }
      // 占位：未加载 / 加载中 / 出错时画虚线框
      const isError = opts.imageStatus === "error";
      return (
        <>
          <rect
            width={w}
            height={h}
            rx={4}
            ry={4}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray="6 4"
            opacity={isError ? 0.4 : 0.8}
            data-actor-part="shape"
          />
          {label && (
            <CenteredLabel
              x={w / 2}
              y={h / 2}
              text={isError ? "图片加载失败" : opts.labelText ?? ""}
              opts={opts}
            />
          )}
        </>
      );
    }

    default:
      return null;
  }
}

// ------------------------------------------------------------
// 便利函数：从 Actor 构造主画布的 RenderShapeOpts（半透明填充风格）
// ------------------------------------------------------------
export function buildMainOpts(actor: Actor, width: number, height: number): RenderShapeOpts {
  return {
    width,
    height,
    fill: actor.color ?? "#888",
    fillOpacity: 0.15,
    stroke: actor.color ?? "#888",
    strokeWidth: 1.5,
    cornerRadius: 8,
    showLabel: !!actor.label,
    labelText: actor.label,
    fontSize: actor.fontSize ?? 14,
    fontWeight: actor.fontWeight ?? 500,
    fontFamily: actor.fontFamily,
    sides: actor.sides,
    points: actor.points,
    innerRatio: actor.innerRatio,
    d: actor.d,
    src: actor.src,
  };
}
