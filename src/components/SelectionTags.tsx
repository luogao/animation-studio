// ============================================================
// SelectionTags.tsx — 选中元素标签栏
//
// 显示在对话输入框上方，以可移除的 tag chip 展示当前选中的 actor。
// 用户可以通过点击 × 移除单个选中，也可以在画布上再次点击同一 actor 取消。
// ============================================================

import { X } from "lucide-react";
import { useSelectionStore } from "../store/selectionStore";
import { useProjectStore, selectPreviewConfig } from "../store/projectStore";

export function SelectionTags() {
  const isEditMode = useSelectionStore((s) => s.isEditMode);
  const selectedActorIds = useSelectionStore((s) => s.selectedActorIds);
  const removeActor = useSelectionStore((s) => s.removeActor);
  const config = useProjectStore(selectPreviewConfig);

  // 非编辑模式 或 没有选中 → 不渲染
  if (!isEditMode || selectedActorIds.size === 0) return null;

  const selectedActors = config.actors.filter((a) =>
    selectedActorIds.has(a.id)
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-border bg-card/30 shrink-0">
      {selectedActors.map((a) => (
        <span
          key={a.id}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-border bg-background text-foreground"
        >
          {/* 颜色圆点 */}
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: a.color ?? "#e8a230" }}
          />
          {/* 优先显示 label，否则显示 id */}
          <span className="max-w-[120px] truncate">{a.label ?? a.id}</span>
          {/* 移除按钮 */}
          <button
            type="button"
            className="inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-muted-foreground/20 transition-colors shrink-0 -mr-0.5"
            onClick={() => removeActor(a.id)}
            aria-label={`取消选中 ${a.label ?? a.id}`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
