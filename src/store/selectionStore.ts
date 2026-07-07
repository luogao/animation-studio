// ============================================================
// selectionStore.ts — 画布元素选取状态
//
// 职责：
// - 管理编辑模式开关（isEditMode）
// - 管理当前选中的 actor ID 集合（多选：点击即 toggle）
// - 编辑模式关闭时自动清空选中
// - config 变化时由 PreviewCanvas 触发清空选中
// ============================================================

import { create } from "zustand";

interface SelectionState {
  isEditMode: boolean;
  selectedActorIds: Set<string>;

  // ── actions ──
  toggleEditMode: () => void;
  setEditMode: (v: boolean) => void;
  /** 点击 actor：toggle 选中状态（已选中→取消，未选中→加入） */
  toggleActor: (id: string) => void;
  /** 从 tag × 按钮移除单个 actor */
  removeActor: (id: string) => void;
  deselectAll: () => void;
  clearSelection: () => void; // alias for deselectAll
}

export const useSelectionStore = create<SelectionState>((set) => ({
  isEditMode: false,
  selectedActorIds: new Set(),

  toggleEditMode: () =>
    set((s) => {
      const next = !s.isEditMode;
      return {
        isEditMode: next,
        // 关闭编辑模式时自动清空选中
        selectedActorIds: next ? s.selectedActorIds : new Set<string>(),
      };
    }),

  setEditMode: (v) =>
    set((s) => ({
      isEditMode: v,
      selectedActorIds: v ? s.selectedActorIds : new Set<string>(),
    })),

  toggleActor: (id) =>
    set((s) => {
      if (!s.isEditMode) return s; // 非编辑模式下忽略
      const next = new Set(s.selectedActorIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedActorIds: next };
    }),

  removeActor: (id) =>
    set((s) => {
      if (!s.selectedActorIds.has(id)) return s;
      const next = new Set(s.selectedActorIds);
      next.delete(id);
      return { selectedActorIds: next };
    }),

  deselectAll: () => set({ selectedActorIds: new Set() }),

  clearSelection: function () {
    return set({ selectedActorIds: new Set() });
  },
}));
