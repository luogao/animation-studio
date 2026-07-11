// ============================================================
// composerStore.ts — 聊天输入框的暂态（pending 图片附件）
//
// 职责：
// - 暂存用户在 composer 上传、但尚未随消息发出的图片附件（可累积多张）。
// - ChatPanel 读它渲染缩略图预览 + 上传按钮写入；assistantRuntime.onNew
//   读它随消息发出并清空。
//
// 用独立 zustand store（而非组件 state）是因为 onNew 定义在
// assistantRuntime.ts，跨组件读取需要避免闭包过期（getState 总是最新）。
// ephemeral：不持久化，刷新即清空。
// ============================================================

import { create } from "zustand";
import type { MessageAttachment } from "../types/message";

interface ComposerState {
  pendingImages: MessageAttachment[];
  /** 上传完成后追加一张待发送图片 */
  addImage: (img: MessageAttachment) => void;
  /** 移除指定索引的待发送图片（UI 的 ✕） */
  removeImage: (index: number) => void;
  /** 清空全部待发送附件 */
  clear: () => void;
}

export const useComposerStore = create<ComposerState>((set) => ({
  pendingImages: [],
  addImage: (img) => set((s) => ({ pendingImages: [...s.pendingImages, img] })),
  removeImage: (index) =>
    set((s) => ({ pendingImages: s.pendingImages.filter((_, i) => i !== index) })),
  clear: () => set({ pendingImages: [] }),
}));
