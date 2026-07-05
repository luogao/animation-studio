// ============================================================
// SceneConfig — 声明式动画配置，驱动 DynamicScene 渲染
// ============================================================

export type ActorType = "box" | "circle" | "gate" | "text" | "diamond";
export type ConnectionStyle = "line" | "arrow" | "dashed";
export type PhaseAction =
  | "enter"
  | "exit"
  | "connect"
  | "pulse"
  | "shake"
  | "highlight";
export type EffectType =
  | "breathing-glow"
  | "particles"
  | "pulse-ring"
  | "flowing-dots";

export interface Actor {
  id: string;
  type: ActorType;
  label?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
  glow?: string; // 发光色
  fontSize?: number;
  fontWeight?: number;
}

export interface Connection {
  from: string; // actor id
  to: string; // actor id
  style: ConnectionStyle;
  color?: string;
}

export interface Phase {
  at: number; // 开始时间（秒）
  duration: number;
  action: PhaseAction;
  target: string | string[]; // actor id 或 ids
  effect?: string; // "slide-left" | "scale-pop" | "fade" | "slide-up" | "draw-line"
  ease?: string; // GSAP ease 字符串
}

export interface Effect {
  type: EffectType;
  target: string; // actor id
  color?: string;
}

export interface SceneConfig {
  width: number;
  height: number;
  duration: number; // 秒
  background: string; // 背景色
  actors: Actor[];
  connections: Connection[];
  phases: Phase[];
  effects?: Effect[];
}

// ============================================================
// 预设画布尺寸
// ============================================================

export interface CanvasPreset {
  label: string;
  width: number;
  height: number;
}

export const PRESET_SIZES: readonly CanvasPreset[] = [
  { label: "横屏 1440×810", width: 1440, height: 810 },
  { label: "竖屏 1080×1920", width: 1080, height: 1920 },
  { label: "1080p 1920×1080", width: 1920, height: 1080 },
] as const;

export const DEFAULT_CANVAS_SIZE = {
  width: 1440,
  height: 810,
} as const;

// ============================================================
// 默认空配置
// ============================================================

export const DEFAULT_SCENE_CONFIG: SceneConfig = {
  width: 1440,
  height: 810,
  duration: 5,
  background: "#0a0a0b",
  actors: [
    { id: "ai", type: "box", label: "AI", x: 200, y: 350, width: 140, height: 80, color: "#4a9eff", fontSize: 28, fontWeight: 700 },
    { id: "hook", type: "gate", label: "HOOK", x: 600, y: 340, width: 120, height: 100, color: "#E8A230", glow: "#E8A230" },
    { id: "tool", type: "box", label: "Tool", x: 1020, y: 350, width: 140, height: 80, color: "#333", fontSize: 28, fontWeight: 700 },
    { id: "title", type: "text", label: "Hook 原理", x: 570, y: 120, fontSize: 52, fontWeight: 800, color: "#E8A230" },
  ],
  connections: [
    { from: "ai", to: "hook", style: "arrow", color: "#666" },
    { from: "hook", to: "tool", style: "arrow", color: "#E8A230" },
  ],
  phases: [
    { at: 0, duration: 0, action: "enter", target: "title", effect: "fade" },
    { at: 0.5, duration: 0.5, action: "enter", target: "ai", effect: "slide-left", ease: "power3.out" },
    { at: 1.2, duration: 0.6, action: "enter", target: "hook", effect: "scale-pop", ease: "back.out(1.7)" },
    { at: 2.0, duration: 0.4, action: "connect", target: "ai", effect: "draw-line" },
    { at: 2.6, duration: 0.5, action: "enter", target: "tool", effect: "slide-right", ease: "power3.out" },
    { at: 3.2, duration: 0.4, action: "connect", target: "hook", effect: "draw-line" },
    { at: 3.8, duration: 0.8, action: "pulse", target: "hook", effect: "pulse" },
  ],
  effects: [
    { type: "breathing-glow", target: "hook", color: "#E8A230" },
  ],
};

// ============================================================
// 导出信封 —— 包装 SceneConfig，附带版本元数据
// 外部 Remotion 消费者解包一层 envelope.config 即可拿到纯 SceneConfig
// ============================================================

export interface ExportedSceneConfig {
  schemaVersion: 1;
  projectId: string;
  projectName: string;
  versionId: string;
  sequence: number;
  status: "draft" | "committed";
  label: string | null;
  committedAt: number | null; // ms epoch；draft 为 null
  exportedAt: number; // ms epoch
  config: SceneConfig;
}

// 文件名 slug —— 小写、非字母数字转 -、首尾 - 去掉
export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "anim";
}
