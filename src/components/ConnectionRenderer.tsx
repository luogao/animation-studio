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
  const { style, color = "#5a5a62" } = connection;

  // 端点取 actor 边界框中心
  const fw = from.width ?? from.type === "circle" ? 60 : 120;
  const fh = from.height ?? from.type === "circle" ? 60 : 60;
  const tw = to.width ?? to.type === "circle" ? 60 : 120;
  const th = to.height ?? to.type === "circle" ? 60 : 60;

  const x1 = from.x + fw / 2;
  const y1 = from.y + fh / 2;
  const x2 = to.x + tw / 2;
  const y2 = to.y + th / 2;

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
