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
  const minSize = 6; // 缩略图中最小可见尺寸
  const w = Math.max((actor.width ?? 60) * scaleX, minSize);
  const h = Math.max((actor.height ?? 60) * scaleY, minSize);
  const color = actor.color ?? "#888";
  const glow = actor.glow;
  const sw = 1.2; // 统一描边

  switch (actor.type) {
    case "circle": {
      const cx = x + w / 2, cy = y + h / 2, r = Math.max(w / 2, 2);
      return (
        <g key={actor.id}>
          {glow && (
            <circle cx={cx} cy={cy} r={r + sw + 1} fill="none" stroke={glow} strokeWidth={sw} opacity={0.5} />
          )}
          <circle cx={cx} cy={cy} r={r} fill={color} stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} />
        </g>
      );
    }
    case "diamond": {
      const cx = x + w / 2, cy = y + h / 2;
      const pts = `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`;
      const glowPts = `${cx},${y - sw - 1} ${x + w + sw + 1},${cy} ${cx},${y + h + sw + 1} ${x - sw - 1},${cy}`;
      return (
        <g key={actor.id}>
          {glow && <polygon points={glowPts} fill="none" stroke={glow} strokeWidth={sw} opacity={0.5} />}
          <polygon points={pts} fill={color} stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} />
        </g>
      );
    }
    case "text":
      return (
        <rect
          key={actor.id}
          x={x} y={y + h * 0.3}
          width={Math.max(w, 8)} height={Math.max(h * 0.4, 2.5)}
          rx={1.5} fill={color} opacity={0.8}
          stroke="rgba(255,255,255,0.08)" strokeWidth={0.5}
        />
      );
    case "box":
    case "gate":
    default:
      return (
        <g key={actor.id}>
          {glow && (
            <rect x={x - sw - 1} y={y - sw - 1} width={w + sw * 2 + 2} height={h + sw * 2 + 2}
              fill="none" stroke={glow} strokeWidth={sw} opacity={0.5} rx={2} />
          )}
          <rect x={x} y={y} width={w} height={h} fill={color} stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} rx={2} />
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
