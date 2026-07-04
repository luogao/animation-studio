// ============================================================
// previewStore.ts — 预览区的瞬时 UI 状态
//
// 职责：
// - 暴露 currentTime / isPlaying / timelineController 给 Timeline 等组件
// - useGsapTimeline 把 controller 注册到这里
// - 不参与持久化，刷新即丢；本质是 GSAP ↔ React 的桥
// ============================================================

import { create } from "zustand";

// ============================================================
// Timeline Controller —— 由 useGsapTimeline 注册，
// 让 Timeline 等外部组件可以控制播放（不直接接触 GSAP）
// ============================================================

export interface TimelineController {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  duration: number;
}

// ============================================================
// Store 接口
// ============================================================

interface PreviewState {
  currentTime: number;
  isPlaying: boolean;
  timelineController: TimelineController | null;

  setCurrentTime: (t: number) => void;
  setPlaying: (v: boolean) => void;
  setTimelineController: (c: TimelineController | null) => void;
}

// ============================================================
// Store 实现
// ============================================================

export const usePreviewStore = create<PreviewState>((set) => ({
  currentTime: 0,
  isPlaying: false,
  timelineController: null,

  setCurrentTime: (currentTime) => set({ currentTime }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setTimelineController: (timelineController) => set({ timelineController }),
}));
