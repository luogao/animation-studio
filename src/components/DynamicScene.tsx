// ============================================================
// DynamicScene.tsx — 声明式 SceneConfig → SVG 渲染
//
// 职责：
// - 渲染 SVG 容器（width / height / background）
// - 渲染所有 connections（先画，位于底层）
// - 渲染所有 actors（后画，位于上层）
// - 提供 <defs> 中的 arrow marker 供 ConnectionRenderer 使用
// ============================================================

import { useMemo } from "react";
import type { SceneConfig } from "../types/scene";
import { ActorRenderer } from "./ActorRenderer";
import { ConnectionRenderer } from "./ConnectionRenderer";
import { useSelectionStore } from "../store/selectionStore";

interface Props {
  config: SceneConfig;
}

const ARROW_MARKER_ID = "arrow-head";

export function DynamicScene({ config }: Props) {
  const actorMap = useMemo(
    () => new Map(config.actors.map((a) => [a.id, a])),
    [config.actors]
  );

  const isEditMode = useSelectionStore((s) => s.isEditMode);
  const deselectAll = useSelectionStore((s) => s.deselectAll);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isEditMode) return;
    // 只有直接点击 SVG 背景（非子元素）时才清空选中
    if (e.target === e.currentTarget) {
      deselectAll();
    }
  };

  return (
    <svg
      width={config.width}
      height={config.height}
      viewBox={`0 0 ${config.width} ${config.height}`}
      data-edit-mode={isEditMode ? "true" : "false"}
      onClick={handleSvgClick}
      style={{
        background: config.background,
        display: "block",
      }}
    >
      <defs>
        <marker
          id={ARROW_MARKER_ID}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>

      {/* ── 连线层 ── */}
      <g className="connections-layer">
        {config.connections.map((c, i) => {
          const from = actorMap.get(c.from);
          const to = actorMap.get(c.to);
          if (!from || !to) return null;
          return (
            <ConnectionRenderer
              key={`${c.from}-${c.to}-${i}`}
              connection={c}
              from={from}
              to={to}
              markerId={ARROW_MARKER_ID}
            />
          );
        })}
      </g>

      {/* ── 节点层 ── */}
      <g className="actors-layer">
        {config.actors.map((a) => (
          <ActorRenderer key={a.id} actor={a} />
        ))}
      </g>

      {/* ── 选取层（data-edit-only，导出时剔除）── */}
      <g className="selection-layer" data-edit-only="true" />
    </svg>
  );
}
