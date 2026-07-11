// ============================================================
// SceneConfig — 声明式动画配置，驱动 DynamicScene 渲染
// ============================================================

export type ActorType =
  | "box"
  | "circle"
  | "gate"
  | "text"
  | "diamond"
  | "polygon" // 正多边形（sides 边数）
  | "star" // 星形（points 角数 + innerRatio 内外比）
  | "path" // 任意 SVG 路径（d 字段）
  | "image"; // 位图（src 字段）
export type ConnectionStyle = "line" | "arrow" | "dashed";
export type PhaseAction =
  | "enter"
  | "exit"
  | "connect"
  | "pulse"
  | "shake"
  | "highlight"
  | "tween";
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
  fontFamily?: string; // Google Font 字体名，如 "Roboto", "Playfair Display"；仅 text 类型使用
  // === 初始变换属性 ===
  rotation?: number; // 初始旋转角度（degrees）
  scale?: number; // 初始缩放比例（默认 1）
  skewX?: number; // X 轴倾斜（degrees）
  skewY?: number; // Y 轴倾斜（degrees）

  // === 形状参数（按 type 生效）===
  sides?: number; // polygon：边数 3-12，默认 6
  points?: number; // star：角数 4-12，默认 5
  innerRatio?: number; // star：内/外半径比 0-1，默认 0.4
  d?: string; // path：原始 SVG path data（本地坐标系）
  src?: string; // image：图片 URL（同源 /uploads/... 或 data URI）
}

export interface Connection {
  from: string; // actor id
  to: string; // actor id
  style: ConnectionStyle;
  color?: string;
}

export interface StaggerConfig {
  each?: number;
  from?: number | "start" | "center" | "end" | "edges" | "random";
  ease?: string;
  amount?: number;
}

export interface Phase {
  at: number; // 开始时间（秒）
  duration: number;
  action: PhaseAction;
  target: string | string[]; // actor id 或 ids
  effect?: string; // "slide-left" | "scale-pop" | "fade" | "slide-up" | "draw-line"
  ease?: string; // GSAP ease 字符串

  // === 通用动画属性（action="tween" 时生效） ===
  /** GSAP TweenVars，透传给 gsap.to/from/fromTo。可包含任意 GSAP 属性 */
  props?: Record<string, unknown>;
  /** fromTo 模式的起始状态（tweenMode="fromTo" 时使用） */
  fromProps?: Record<string, unknown>;
  /** 多目标 stagger：数字=间隔秒数，对象=GSAP stagger 配置 */
  stagger?: number | StaggerConfig;
  /** GSAP 方法：to（默认，当前→目标）、from（props→当前）、fromTo（fromProps→props） */
  tweenMode?: "to" | "from" | "fromTo";
}

export interface Effect {
  type: EffectType;
  target: string; // actor id
  // NOTE: useGsapTimeline 尚未消费 effect 颜色（只遍历 phases）；
  // agent 仍按 palette.accent 烘焙此处以保持前向兼容
  color?: string;
}

// ============================================================
// 配色系统 —— 语义化调色板，场景颜色的单一事实源
// agent 把语义色烘焙成具体 hex 填到每个 actor/connection/effect
// ============================================================

export type PaletteColorRole =
  | "primary" // 30% 主要/支撑 actor body
  | "secondary" // 30% 连线、次要 actor
  | "accent" // 10% 焦点/签名 actor、CTA（稀缺资源）
  | "neutral" // 阴影/容器/边框（低饱和暗色）
  | "foreground" // 文字/标签（高明度，强制过 WCAG AA）
  | "background"; // 画布背景（60%）

export type HarmonyScheme =
  | "analogous" // ±30° 类比
  | "complementary" // ±180° 互补
  | "split-complementary" // +150°/−150° 分裂互补
  | "triadic" // ±120° 三元
  | "custom"; // 手工基线（如品牌默认）

/** 六个语义角色的具体色值，均为规范大写 "#RRGGBB" */
export interface PaletteColors {
  primary: string;
  secondary: string;
  accent: string;
  neutral: string;
  foreground: string;
  background: string;
}

export interface Palette {
  id: string; // "p1".."p3"（算法生成）/ "brand-default"
  name: string; // agent 应用时填写；提案阶段为 ""
  description: string; // agent 风格描述；提案阶段为 ""
  harmony: HarmonyScheme;
  seed: string; // 用户选择的主色 "#RRGGBB"
  colors: PaletteColors;
}

export interface SceneConfig {
  width: number;
  height: number;
  duration: number; // 秒
  background: string; // 背景色；当 palette 存在时应等于 palette.colors.background
  actors: Actor[];
  connections: Connection[];
  phases: Phase[];
  effects?: Effect[];
  palette?: Palette; // 当前配色基线；存在时所有颜色应从其语义角色派生
  fonts?: string[]; // 需要预加载的 Google Font 字体列表，如 ["Roboto", "Playfair Display"]
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
// 默认开场动画 —— "Animation Studio" 品牌展示
// 来源：e65bf8d0 v19
// ============================================================

export const DEFAULT_SCENE_CONFIG: SceneConfig = {
  width: 1440,
  height: 810,
  duration: 8,
  background: "#0A0A0B",
  actors: [
    { id: "logoShadow", type: "circle", x: 660, y: 175, width: 140, height: 140, color: "#1a1a1c" },
    { id: "logoRing", type: "circle", x: 655, y: 155, width: 130, height: 130, color: "#E8A230", glow: "#E8A230" },
    { id: "logoDotShadow", type: "circle", x: 680, y: 185, width: 90, height: 90, color: "#5c4010" },
    { id: "logoDot", type: "circle", x: 680, y: 180, width: 78, height: 78, color: "#E8A230", glow: "#E8A230" },
    { id: "logoHi", type: "circle", x: 694, y: 190, width: 18, height: 18, color: "#ffe9b0" },
    { id: "brandShadow", type: "text", label: "Animation Studio", x: 384, y: 384, color: "#5a4a20", fontSize: 68, fontWeight: 800 },
    { id: "brand", type: "text", label: "Animation Studio", x: 380, y: 380, color: "#E8A230", fontSize: 68, fontWeight: 800 },
    { id: "prefix", type: "text", label: "Powered by", x: 480, y: 435, color: "#8a8a95", fontSize: 26, fontWeight: 500 },
    { id: "rollW1", type: "text", label: "CHAT", x: 690, y: 435, color: "#E8A230", fontSize: 28, fontWeight: 800 },
    { id: "rollW2", type: "text", label: "CONFIG", x: 690, y: 435, color: "#E8A230", fontSize: 28, fontWeight: 800 },
    { id: "rollW3", type: "text", label: "GSAP", x: 690, y: 435, color: "#E8A230", fontSize: 28, fontWeight: 800 },
    { id: "rollW4", type: "text", label: "YOU.", x: 690, y: 435, color: "#E8A230", glow: "#E8A230", fontSize: 28, fontWeight: 800 },
    { id: "s1shadow", type: "box", x: 178, y: 520, width: 240, height: 108, color: "#0a1a2e" },
    { id: "step1", type: "box", label: "CHAT", x: 170, y: 510, width: 240, height: 108, color: "#4a9eff", glow: "#4a9eff", fontSize: 26, fontWeight: 700 },
    { id: "s1hi", type: "box", x: 180, y: 517, width: 220, height: 6, color: "#a8ccff" },
    { id: "s2shadow", type: "box", x: 618, y: 512, width: 220, height: 96, color: "#3a2a10" },
    { id: "step2", type: "box", label: "CONFIG", x: 610, y: 504, width: 220, height: 96, color: "#E8A230", glow: "#E8A230", fontSize: 24, fontWeight: 700 },
    { id: "s2hi", type: "box", x: 620, y: 510, width: 200, height: 5, color: "#ffd980" },
    { id: "s3shadow", type: "box", x: 1048, y: 502, width: 200, height: 84, color: "#0a1a2e" },
    { id: "step3", type: "box", label: "PREVIEW", x: 1040, y: 495, width: 200, height: 84, color: "#3d7fcc", glow: "#4a9eff", fontSize: 22, fontWeight: 700 },
    { id: "s3hi", type: "box", x: 1050, y: 500, width: 180, height: 4, color: "#8fb8e6" },
    { id: "step1cap", type: "text", label: "you describe a scene", x: 185, y: 640, color: "#666", fontSize: 14, fontWeight: 400 },
    { id: "step2cap", type: "text", label: "agent emits SceneConfig", x: 625, y: 625, color: "#666", fontSize: 14, fontWeight: 400 },
    { id: "step3cap", type: "text", label: "GSAP plays it live", x: 1075, y: 605, color: "#666", fontSize: 14, fontWeight: 400 },
    { id: "cta", type: "text", label: "Ready · Type to begin", x: 555, y: 720, color: "#E8A230", fontSize: 26, fontWeight: 600 },
  ],
  connections: [],
  phases: [
    { at: 0.05, duration: 0.5, action: "enter", target: "logoShadow", effect: "fade" },
    { at: 0.1, duration: 0.6, action: "enter", target: "logoRing", effect: "scale-pop", ease: "back.out(1.6)" },
    { at: 0.3, duration: 0.4, action: "enter", target: "logoDotShadow", effect: "fade" },
    { at: 0.35, duration: 0.5, action: "enter", target: "logoDot", effect: "scale-pop", ease: "back.out(2)" },
    { at: 0.55, duration: 0.3, action: "enter", target: "logoHi", effect: "scale-pop", ease: "back.out(2)" },
    { at: 0.7, duration: 7.3, action: "tween", target: "logoRing", ease: "none", props: { rotation: 360 } },
    { at: 0.85, duration: 0.4, action: "pulse", target: ["logoRing", "logoDot"] },
    { at: 1, duration: 0.9, action: "tween", target: "brandShadow", ease: "power3.out", tweenMode: "fromTo", fromProps: { opacity: 0, skewX: -35, x: -320 }, props: { opacity: 1, skewX: 0, x: 0 } },
    { at: 1, duration: 0.9, action: "tween", target: "brand", ease: "power3.out", tweenMode: "fromTo", fromProps: { opacity: 0, skewX: -35, x: -320 }, props: { opacity: 1, skewX: 0, x: 0 } },
    { at: 1.6, duration: 0.5, action: "enter", target: "prefix", effect: "fade" },
    { at: 1.7, duration: 0.45, action: "tween", target: "rollW1", ease: "back.out(1.6)", tweenMode: "fromTo", fromProps: { opacity: 0, scaleY: 0.1, transformOrigin: "center bottom", y: 25 }, props: { opacity: 1, scaleY: 1, transformOrigin: "center bottom", y: 0 } },
    { at: 2.2, duration: 0.3, action: "tween", target: "rollW1", ease: "power2.in", props: { opacity: 0, scaleY: 0.1, transformOrigin: "center top", y: -25 } },
    { at: 2.25, duration: 0.45, action: "tween", target: "rollW2", ease: "back.out(1.6)", tweenMode: "fromTo", fromProps: { opacity: 0, scaleY: 0.1, transformOrigin: "center bottom", y: 25 }, props: { opacity: 1, scaleY: 1, transformOrigin: "center bottom", y: 0 } },
    { at: 2.75, duration: 0.3, action: "tween", target: "rollW2", ease: "power2.in", props: { opacity: 0, scaleY: 0.1, transformOrigin: "center top", y: -25 } },
    { at: 2.8, duration: 0.45, action: "tween", target: "rollW3", ease: "back.out(1.6)", tweenMode: "fromTo", fromProps: { opacity: 0, scaleY: 0.1, transformOrigin: "center bottom", y: 25 }, props: { opacity: 1, scaleY: 1, transformOrigin: "center bottom", y: 0 } },
    { at: 3.35, duration: 0.3, action: "tween", target: "rollW3", ease: "power2.in", props: { opacity: 0, scaleY: 0.1, transformOrigin: "center top", y: -25 } },
    { at: 3.4, duration: 0.55, action: "tween", target: "rollW4", ease: "back.out(1.8)", tweenMode: "fromTo", fromProps: { opacity: 0, scaleY: 0.1, transformOrigin: "center bottom", y: 25 }, props: { opacity: 1, scaleY: 1, transformOrigin: "center bottom", y: 0 } },
    { at: 2.15, duration: 0.4, action: "enter", target: "s1shadow", effect: "fade" },
    { at: 2.2, duration: 0.6, action: "tween", target: ["step1", "step2", "step3"], ease: "back.out(1.4)", tweenMode: "fromTo", stagger: 0.3, fromProps: { opacity: 0, skewY: 18, y: 60 }, props: { opacity: 1, skewY: 0, y: 0 } },
    { at: 2.4, duration: 0.3, action: "enter", target: "s1hi", effect: "fade" },
    { at: 2.45, duration: 0.4, action: "enter", target: "step1cap", effect: "fade" },
    { at: 2.65, duration: 0.4, action: "enter", target: "s2shadow", effect: "fade" },
    { at: 2.9, duration: 0.3, action: "enter", target: "s2hi", effect: "fade" },
    { at: 2.95, duration: 0.4, action: "enter", target: "step2cap", effect: "fade" },
    { at: 3.15, duration: 0.4, action: "enter", target: "s3shadow", effect: "fade" },
    { at: 3.4, duration: 0.3, action: "enter", target: "s3hi", effect: "fade" },
    { at: 3.45, duration: 0.4, action: "enter", target: "step3cap", effect: "fade" },
    { at: 4.2, duration: 0.5, action: "pulse", target: ["step1", "s1hi"] },
    { at: 4.5, duration: 0.5, action: "pulse", target: ["step2", "s2hi"] },
    { at: 4.8, duration: 0.5, action: "pulse", target: ["step3", "s3hi"] },
    { at: 5.1, duration: 0.6, action: "pulse", target: ["logoRing", "logoDot", "logoHi"] },
    { at: 5.4, duration: 0.5, action: "highlight", target: "brand" },
    { at: 5.6, duration: 0.6, action: "pulse", target: "rollW4" },
    { at: 5.9, duration: 0.6, action: "enter", target: "cta", effect: "fade" },
    { at: 6.6, duration: 0.6, action: "pulse", target: "cta" },
    { at: 7.3, duration: 0.6, action: "pulse", target: "cta" },
  ],
  effects: [
    { type: "breathing-glow", target: "logoRing", color: "#E8A230" },
    { type: "breathing-glow", target: "logoDot", color: "#E8A230" },
    { type: "breathing-glow", target: "cta", color: "#E8A230" },
    { type: "breathing-glow", target: "rollW4", color: "#E8A230" },
  ],
  palette: {
    id: "brand-default",
    name: "Studio Gold",
    description: "品牌默认 — 暖橙金主色，冷蓝辅助，暗色画布",
    harmony: "custom",
    seed: "#E8A230",
    colors: {
      primary: "#E8A230",
      secondary: "#4A9EFF",
      accent: "#FF5E5E",
      neutral: "#1A1A1C",
      foreground: "#8A8A95",
      background: "#0A0A0B",
    },
  },
  fonts: [],
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
