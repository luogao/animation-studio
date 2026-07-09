// ============================================================
// ScenePreviewThumb.tsx — 场景缩略预览 SVG
//
// 渲染 scene config 中演员的简化布局，用于模板卡片/项目卡片的预览。
// 不依赖 GSAP — 纯静态 SVG，按比例缩放适配容器。
// ============================================================

import type { SceneConfig } from "../types/scene";

interface ScenePreviewThumbProps {
  config: SceneConfig;
}

/** 根据 actor type 返回简化形状的 SVG 元素 */
function renderActorShape(actor: SceneConfig["actors"][number], scaleX: number, scaleY: number) {
  const x = actor.x * scaleX;
  const y = actor.y * scaleY;
  const w = (actor.width ?? 60) * scaleX;
  const h = (actor.height ?? 60) * scaleY;
  const color = actor.color ?? "#888";
  const glow = actor.glow;

  switch (actor.type) {
    case "circle":
      return (
        <g key={actor.id}>
          {glow && (
            <circle
              cx={x + w / 2}
              cy={y + h / 2}
              r={w / 2 + 3}
              fill="none"
              stroke={glow}
              strokeWidth={1.5}
              opacity={0.4}
            />
          )}
          <circle cx={x + w / 2} cy={y + h / 2} r={w / 2} fill={color} />
        </g>
      );
    case "diamond":
      return (
        <g key={actor.id}>
          {glow && (
            <polygon
              points={`${x + w / 2},${y - 3} ${x + w + 3},${y + h / 2} ${x + w / 2},${y + h + 3} ${x - 3},${y + h / 2}`}
              fill="none"
              stroke={glow}
              strokeWidth={1.5}
              opacity={0.4}
            />
          )}
          <polygon
            points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`}
            fill={color}
          />
        </g>
      );
    case "text":
      // text actors: 用小色条代替文字
      return (
        <rect
          key={actor.id}
          x={x}
          y={y + h * 0.35}
          width={w}
          height={h * 0.3}
          rx={1}
          fill={color}
          opacity={0.7}
        />
      );
    case "box":
    case "gate":
    default:
      return (
        <g key={actor.id}>
          {glow && (
            <rect
              x={x - 3}
              y={y - 3}
              width={w + 6}
              height={h + 6}
              fill="none"
              stroke={glow}
              strokeWidth={1.5}
              opacity={0.4}
              rx={2}
            />
          )}
          <rect x={x} y={y} width={w} height={h} fill={color} rx={2} />
        </g>
      );
  }
}

export function ScenePreviewThumb({ config }: ScenePreviewThumbProps) {
  // 计算缩放比例，把整个场景缩放到约 300x170 的 viewBox
  const TARGET_W = 300;
  const scaleX = TARGET_W / config.width;
  const scaleY = (TARGET_W / config.width) * (config.height / config.width);

  // 最多渲染 15 个 actor（预览不需要全部）
  const previewActors = config.actors.slice(0, 15);

  return (
    <svg
      viewBox={`0 0 ${TARGET_W} ${TARGET_W * (config.height / config.width)}`}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid slice"
    >
      {/* 背景 */}
      <rect
        x={0}
        y={0}
        width={TARGET_W}
        height={TARGET_W * (config.height / config.width)}
        fill={config.background}
      />
      {/* 演员 */}
      {previewActors.map((actor) => renderActorShape(actor, scaleX, scaleY))}
    </svg>
  );
}
