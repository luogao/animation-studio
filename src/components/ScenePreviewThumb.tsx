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

/**
 * 根据 actor type 返回简化形状的 SVG 元素。
 * 坐标直接用场景坐标系（与 viewBox = 0 0 width height 对齐），
 * 由外层 SVG 的 preserveAspectRatio 统一缩放，杜绝形变/错位。
 */
function renderActorShape(actor: SceneConfig["actors"][number], scale: number) {
  const x = actor.x * scale;
  const y = actor.y * scale;
  const minSize = 6; // 缩略图中最小可见尺寸
  const w = Math.max((actor.width ?? 60) * scale, minSize);
  const h = Math.max((actor.height ?? 60) * scale, minSize);
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
  // viewBox 直接使用场景原始尺寸 → 坐标系一致，元素天然落在正确位置。
  // preserveAspectRatio="xMidYMid meet" 把整个场景等比 contain 到容器并居中。
  // 外层 div 提供背景色填充容器在 letterbox 时的空白区域。
  const W = config.width;
  const H = config.height;
  const scale = 1; // 坐标系已对齐，缩放交给 SVG 属性

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
        {previewActors.map((actor) => renderActorShape(actor, scale))}
      </svg>
    </div>
  );
}
