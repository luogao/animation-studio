// ============================================================
// Timeline.tsx — 时间轴控制条
//
// - 播放 / 暂停按钮（从 previewStore.timelineController 读取动作）
// - 进度条 range input（0 ~ duration）
// - 当前时间 / 总时长 显示
// - 拖拽进度条时调 controller.seek
// ============================================================

import { usePreviewStore } from "../store/previewStore";
import { useProjectStore, selectPreviewConfig } from "../store/projectStore";
import { Button } from "@/components/ui/button";

export function Timeline() {
  const controller = usePreviewStore((s) => s.timelineController);
  const currentTime = usePreviewStore((s) => s.currentTime);
  const isPlaying = usePreviewStore((s) => s.isPlaying);
  const config = useProjectStore(selectPreviewConfig);

  const duration = controller?.duration ?? config.duration;
  const safeTime = Math.min(currentTime, duration);

  const togglePlay = () => {
    if (!controller) return;
    if (isPlaying) controller.pause();
    else controller.play();
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    controller?.seek(t);
  };

  return (
    <div className="timeline">
      <Button
        onClick={togglePlay}
        disabled={!controller}
        aria-label={isPlaying ? "暂停" : "播放"}
        variant="outline"
        size="icon-sm"
        className="shrink-0"
      >
        {isPlaying ? "❚❚" : "▶"}
      </Button>

      <input
        className="timeline-range"
        type="range"
        min={0}
        max={duration}
        step={0.01}
        value={safeTime}
        onChange={onSeek}
        disabled={!controller}
      />

      <span className="timeline-time">
        {safeTime.toFixed(1)}s / {duration.toFixed(1)}s
      </span>
    </div>
  );
}
