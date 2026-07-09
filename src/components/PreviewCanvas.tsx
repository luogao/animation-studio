// ============================================================
// PreviewCanvas.tsx — 居中显示 DynamicScene
//
// 职责：
// - 用 CSS transform: scale() 等比缩放画布以适配外层容器
// - 通过 ResizeObserver 监听容器尺寸变化重算 scale
// - 内部挂载 useGsapTimeline，把播放控制器注册到 store
// - 画布外层是 dot-grid 背景（由 App.css .canvas-area 提供）
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useProjectStore, selectPreviewConfig } from "../store/projectStore";
import { useGsapTimeline } from "../hooks/useGsapTimeline";
import { useSelectionStore } from "../store/selectionStore";
import { DynamicScene } from "./DynamicScene";

export function PreviewCanvas() {
  const config = useProjectStore(selectPreviewConfig);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // 构建并注册 timeline（容器 = stageRef，让 selector 限定在画布内）
  useGsapTimeline(config, stageRef);

  // ── config 变化时清空选中 ──
  // agent 修改场景后旧的 actor id 可能已失效
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  useEffect(() => {
    // 编辑模式下不自动清除选中 — 用户正在手动编辑属性
    const isEditing = useSelectionStore.getState().isEditMode;
    if (!isEditing) {
      clearSelection();
    }
    // config 引用变化即触发（selectPreviewConfig 在 draft/committedConfig 变化时返回新引用）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // ── 计算 scale 让画布等比适配 container ──
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const compute = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const padding = 48; // 上下左右各 24px
      const sx = (cw - padding) / config.width;
      const sy = (ch - padding) / config.height;
      setScale(Math.min(sx, sy, 1));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [config.width, config.height]);

  return (
    <div className="preview-canvas-container" ref={containerRef}>
      <div
        className="preview-canvas-stage"
        ref={stageRef}
        style={{
          width: config.width,
          height: config.height,
          transform: `scale(${scale})`,
        }}
      >
        <DynamicScene config={config} />
      </div>
    </div>
  );
}
