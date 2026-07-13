// ============================================================
// ActorRenderer.tsx — 根据 actor.type 渲染对应的 SVG 形状
//
// 设计要点：
// - 外层 <g transform="translate(x,y)"> 负责静态定位
// - 内层 <g data-actor-id={id}> 是 GSAP 操作的目标
//   （这样 GSAP 的 CSS transform 不会覆盖位置）
// - 默认 transform-origin: center center 让 scale / rotate 自然
// - 形状本体渲染委托给共享 actorShapes.tsx（与 ScenePreviewThumb 同源）
// - text 类型在此内联渲染（纯文字，定位语义不同，不走共享渲染器）
// - image 类型走 useImageLoader 异步加载，未加载时画占位框
// ============================================================

import type { Actor } from "../types/scene";
import { FALLBACK_ACTOR_COLOR } from "../lib/colorPalette";
import { useSelectionStore } from "../store/selectionStore";
import { getActorBounds } from "../lib/selectionHelpers";
import {
  renderActorShape,
  buildMainOpts,
  DEFAULT_BOX_W,
  DEFAULT_BOX_H,
  DEFAULT_IMAGE_W,
  DEFAULT_IMAGE_H,
} from "../lib/actorShapes";
import { useImageLoader } from "../lib/useImageLoader";

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
  const { id, type, glow, fontFamily } = actor;

  // ── 选取状态 ──
  const isEditMode = useSelectionStore((s) => s.isEditMode);
  const isSelected = useSelectionStore((s) => s.selectedActorIds.has(id));
  const toggleActor = useSelectionStore((s) => s.toggleActor);

  // ── image 异步加载（仅 image 类型启用）──
  const imgState = useImageLoader(type === "image" ? actor.src : undefined);

  // ── 有效边界尺寸 ──
  // 非 image：用 getActorBounds；image：未显式设尺寸时回退到加载后的自然尺寸
  const bounds = getActorBounds(actor);
  const effW =
    type === "image"
      ? actor.width ?? imgState.naturalWidth ?? DEFAULT_IMAGE_W
      : bounds.w;
  const effH =
    type === "image"
      ? actor.height ?? imgState.naturalHeight ?? DEFAULT_IMAGE_H
      : bounds.h;

  const handleClick = (e: React.MouseEvent) => {
    if (!isEditMode) return;
    e.stopPropagation(); // 阻止冒泡到 SVG 背景（避免误触发 deselectAll）
    toggleActor(id);
  };

  // ── 构造共享渲染器 opts（image 附带加载状态）──
  const mainOpts = buildMainOpts(actor, effW, effH);
  const shapeOpts =
    type === "image" ? { ...mainOpts, imageStatus: imgState.status } : mainOpts;

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
          width={effW}
          height={effH}
          fill="transparent"
          pointerEvents="all"
          data-edit-only="true"
        />
      )}

      {/* ── GSAP 目标层（不要放 data-edit-only 元素在这里）── */}
      <g data-actor-id={id} data-actor-type={type} style={glowStyle(glow)}>
        {type === "text" ? (
          // foreignObject 渲染 HTML 文字（SplitText 只拆 HTML，不支持 SVG <text>）。
          // React 在 foreignObject 内自动用 HTML 命名空间创建 <div>，无需显式 xmlns。
          // overflow:visible 防止 estimateTextWidth 偏小时裁剪文字。
          // 垂直居中用 flex alignItems:center 替代原 dominantBaseline:middle。
          <foreignObject
            x={0}
            y={0}
            width={effW}
            height={effH}
            style={{ overflow: "visible" }}
            data-actor-part="text"
          >
            <div
              data-text-root
              style={{
                width: effW,
                height: effH,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                fontSize: actor.fontSize ?? 14,
                fontWeight: actor.fontWeight ?? 500,
                fontFamily: fontFamily ?? "var(--font-sans)",
                color: actor.color ?? FALLBACK_ACTOR_COLOR,
                lineHeight: 1,
                whiteSpace: "pre",
              }}
            >
              {actor.label ?? ""}
            </div>
          </foreignObject>
        ) : (
          renderActorShape(type, shapeOpts)
        )}
      </g>

      {/* ── 编辑模式：选中指示器（在 GSAP 目标层之外，不受动画影响）── */}
      {isEditMode && isSelected && (
        <rect
          className="selection-indicator"
          x={-4}
          y={-4}
          width={effW + 8}
          height={effH + 8}
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
