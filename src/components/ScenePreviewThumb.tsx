// ============================================================
// ScenePreviewThumb.tsx — 场景缩略预览 SVG
//
// 渲染 scene config 中演员的简化布局，用于模板卡片/项目卡片的预览。
// 不依赖 GSAP — 纯静态 SVG，按比例缩放适配容器。
//
// 形状本体委托给共享 actorShapes.tsx（与主画布同源，避免新增形状时
// 缩略图漏改）；缩略图用实心填充 + 白色描边 + 不显示 label 的简化风格，
// text 类型特化为一个文字条（预览不需要真实排版）。
// ============================================================

import type { SceneConfig, Actor } from "../types/scene";
import { getActorBounds } from "../lib/selectionHelpers";
import {
  renderActorShape,
  type RenderShapeOpts,
} from "../lib/actorShapes";

interface ScenePreviewThumbProps {
  config: SceneConfig;
}

/**
 * 缩略图风格 opts：实心填充、淡白描边、不显示 label、box 圆角较小。
 */
function buildThumbOpts(actor: Actor, w: number, h: number): RenderShapeOpts {
  return {
    width: w,
    height: h,
    fill: actor.color ?? "#888",
    fillOpacity: 1,
    stroke: "rgba(255,255,255,0.15)",
    strokeWidth: 0.5,
    cornerRadius: 2,
    showLabel: false,
    fontSize: 12,
    fontWeight: 500,
    sides: actor.sides,
    points: actor.points,
    innerRatio: actor.innerRatio,
    d: actor.d,
    src: actor.src,
    // 有 src 就让浏览器在缩略图里直接加载真实图（data URI / 同源 /uploads/...）
    imageStatus: actor.type === "image" && actor.src ? "loaded" : "idle",
  };
}

function renderThumbActor(actor: Actor) {
  // text 特化：一个简化的文字条
  if (actor.type === "text") {
    const w = Math.max(actor.width ?? 60, 8);
    const h = Math.max((actor.height ?? 24) * 0.4, 2.5);
    return (
      <rect
        key={actor.id}
        x={actor.x}
        y={actor.y + (actor.height ?? 24) * 0.3}
        width={w}
        height={h}
        rx={1.5}
        fill={actor.color ?? "#888"}
        opacity={0.8}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={0.5}
      />
    );
  }

  const { w, h } = getActorBounds(actor);
  const glow = actor.glow;
  return (
    <g
      key={actor.id}
      transform={`translate(${actor.x},${actor.y})`}
      style={
        glow
          ? { filter: `drop-shadow(0 0 4px ${glow})` }
          : undefined
      }
    >
      {renderActorShape(actor.type, buildThumbOpts(actor, w, h))}
    </g>
  );
}

export function ScenePreviewThumb({ config }: ScenePreviewThumbProps) {
  // viewBox 直接使用场景原始尺寸 → 坐标系一致，元素天然落在正确位置。
  // preserveAspectRatio="xMidYMid meet" 把整个场景等比 contain 到容器并居中。
  // 外层 div 提供背景色填充容器在 letterbox 时的空白区域。
  const W = config.width;
  const H = config.height;

  // 最多渲染 15 个 actor（预览不需要全部）
  const previewActors = config.actors.slice(0, 15);

  return (
    <div
      className="w-full h-full"
      style={{ backgroundColor: config.background }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full block"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* 背景（铺满整个场景坐标系；外层 div 负责填充 letterbox 空白） */}
        <rect x={0} y={0} width={W} height={H} fill={config.background} />
        {/* 演员 */}
        {previewActors.map((actor) => renderThumbActor(actor))}
      </svg>
    </div>
  );
}
