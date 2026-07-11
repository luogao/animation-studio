// ============================================================
// ConnectionRenderer.tsx — 根据连接的 from/to actor 渲染 SVG 线
//
// - line:  实线
// - arrow: 带 marker 的箭头线
// - dashed: 虚线
//
// 元素同时打上 data-conn-from / data-conn-to 属性，
// 便于 GSAP 通过 selector 定位（用于 connect / draw-line 动画）
// pathLength=1 让 strokeDashoffset 用归一化数值（0~1）
// ============================================================

import type { Actor, Connection } from "../types/scene";
import { FALLBACK_CONNECTION_COLOR } from "../lib/colorPalette";
import { getActorBounds } from "../lib/selectionHelpers";

interface Props {
  connection: Connection;
  from: Actor;
  to: Actor;
  markerId: string;
}

export function ConnectionRenderer({
  connection,
  from,
  to,
  markerId,
}: Props) {
  const { style, color = FALLBACK_CONNECTION_COLOR } = connection;

  // 端点取 actor 边界框中心（复用 getActorBounds，覆盖全部形状，
  // 顺带修掉旧实现 `width ?? type === "circle" ? 60 : 120` 的运算符优先级 bug）
  const fb = getActorBounds(from);
  const tb = getActorBounds(to);

  const x1 = from.x + fb.w / 2;
  const y1 = from.y + fb.h / 2;
  const x2 = to.x + tb.w / 2;
  const y2 = to.y + tb.h / 2;

  const isDashed = style === "dashed";
  const hasArrow = style === "arrow";

  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeDasharray={isDashed ? "6 6" : undefined}
      markerEnd={hasArrow ? `url(#${markerId})` : undefined}
      pathLength={1}
      data-conn-from={connection.from}
      data-conn-to={connection.to}
      style={{ transition: "none" }}
    />
  );
}
