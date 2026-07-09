// ============================================================
// 预置演示模板 — 经典动画设计，展示 Studio 能力
// ============================================================

import type { SceneConfig } from "../types/scene";

export interface DemoTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  /** 预览卡片上的代表色 */
  previewColor: string;
  config: SceneConfig;
}

// ── 共享调色板（Duotone Poster 品牌色）──
const BRAND = {
  bg: "#0A0A0B",
  gold: "#E8A230",
  blue: "#4A9EFF",
  red: "#FF5E5E",
  fg: "#8A8A95",
  dark: "#1A1A1C",
};

// ============================================================
// 1. Hero Title Sequence — 大胆文字交错入场
// ============================================================
const heroTitleSequence: SceneConfig = {
  width: 1440,
  height: 810,
  duration: 6,
  background: BRAND.bg,
  palette: {
    id: "tpl-hero",
    name: "Hero Gold",
    description: "大胆文字序列用暖橙金主色 + 海军蓝辅助",
    harmony: "custom",
    seed: BRAND.gold,
    colors: {
      primary: BRAND.gold,
      secondary: BRAND.blue,
      accent: BRAND.red,
      neutral: BRAND.dark,
      foreground: BRAND.fg,
      background: BRAND.bg,
    },
  },
  actors: [
    { id: "bg-bar", type: "box", x: 0, y: 300, width: 1440, height: 210, color: "#121216" },
    { id: "title-shadow", type: "text", label: "MAKE IT", x: 196, y: 338, color: "#3a2a10", fontSize: 96, fontWeight: 900 },
    { id: "title", type: "text", label: "MAKE IT", x: 190, y: 330, color: BRAND.gold, fontSize: 96, fontWeight: 900 },
    { id: "sub-shadow", type: "text", label: "MOVE.", x: 856, y: 338, color: "#0a1a2e", fontSize: 96, fontWeight: 900 },
    { id: "sub", type: "text", label: "MOVE.", x: 850, y: 330, color: BRAND.blue, fontSize: 96, fontWeight: 900 },
    { id: "tagline", type: "text", label: "Conversational animation design, powered by AI", x: 190, y: 560, color: BRAND.fg, fontSize: 24, fontWeight: 400 },
    { id: "accent-line", type: "box", x: 190, y: 620, width: 320, height: 4, color: BRAND.red },
    { id: "cta-text", type: "text", label: "↓ Scroll or type to begin", x: 190, y: 680, color: "#666", fontSize: 16, fontWeight: 500 },
  ],
  connections: [],
  phases: [
    { at: 0.1, duration: 0.6, action: "tween", target: "bg-bar", ease: "power3.inOut", tweenMode: "fromTo", fromProps: { scaleX: 0, transformOrigin: "left center" }, props: { scaleX: 1, transformOrigin: "left center" } },
    { at: 0.4, duration: 0.8, action: "tween", target: ["title-shadow", "title"], ease: "power4.out", tweenMode: "fromTo",
      stagger: { each: 0.05, from: "start" },
      fromProps: { opacity: 0, x: -120, skewX: -20 }, props: { opacity: 1, x: 0, skewX: 0 } },
    { at: 0.7, duration: 0.8, action: "tween", target: ["sub-shadow", "sub"], ease: "power4.out", tweenMode: "fromTo",
      stagger: { each: 0.05, from: "start" },
      fromProps: { opacity: 0, x: 120 }, props: { opacity: 1, x: 0 } },
    { at: 1.2, duration: 0.4, action: "pulse", target: ["title", "sub"] },
    { at: 1.6, duration: 0.6, action: "enter", target: "tagline", effect: "fade" },
    { at: 2.0, duration: 0.5, action: "tween", target: "accent-line", ease: "power3.out", tweenMode: "fromTo", fromProps: { scaleX: 0, transformOrigin: "left center" }, props: { scaleX: 1, transformOrigin: "left center" } },
    { at: 2.4, duration: 0.5, action: "enter", target: "cta-text", effect: "fade" },
    { at: 3.0, duration: 0.6, action: "pulse", target: "cta-text" },
    { at: 4.0, duration: 0.6, action: "highlight", target: "title" },
    { at: 5.0, duration: 0.6, action: "highlight", target: "sub" },
    { at: 5.4, duration: 0.4, action: "pulse", target: ["title", "sub", "accent-line"] },
  ],
  effects: [
    { type: "breathing-glow", target: "title", color: BRAND.gold },
    { type: "breathing-glow", target: "sub", color: BRAND.blue },
  ],
  fonts: [],
};

// ============================================================
// 2. Product Showcase — 三张卡片滑入 + 高亮脉冲
// ============================================================
const productShowcase: SceneConfig = {
  width: 1440,
  height: 810,
  duration: 7,
  background: BRAND.bg,
  palette: {
    id: "tpl-product",
    name: "Product Cards",
    description: "产品卡片展示用蓝色主色 + 金色点缀",
    harmony: "custom",
    seed: BRAND.blue,
    colors: {
      primary: BRAND.blue,
      secondary: BRAND.gold,
      accent: BRAND.red,
      neutral: BRAND.dark,
      foreground: BRAND.fg,
      background: BRAND.bg,
    },
  },
  actors: [
    { id: "header-shadow", type: "text", label: "FEATURES", x: 496, y: 62, color: "#0a1a2e", fontSize: 52, fontWeight: 800 },
    { id: "header", type: "text", label: "FEATURES", x: 490, y: 55, color: BRAND.blue, fontSize: 52, fontWeight: 800 },
    { id: "card1-bg", type: "box", x: 60, y: 180, width: 400, height: 400, color: "#121216" },
    { id: "card1-bar", type: "box", x: 60, y: 180, width: 400, height: 6, color: BRAND.blue },
    { id: "card1-icon", type: "circle", x: 220, y: 290, width: 80, height: 80, color: BRAND.blue, glow: BRAND.blue },
    { id: "card1-title", type: "text", label: "Chat → Config", x: 155, y: 420, color: BRAND.blue, fontSize: 22, fontWeight: 700 },
    { id: "card1-desc", type: "text", label: "Describe your scene in natural language.\nThe AI agent emits a ready-to-play animation.", x: 110, y: 470, color: BRAND.fg, fontSize: 14, fontWeight: 400 },
    { id: "card2-bg", type: "box", x: 520, y: 210, width: 400, height: 400, color: "#121216" },
    { id: "card2-bar", type: "box", x: 520, y: 210, width: 400, height: 6, color: BRAND.gold },
    { id: "card2-icon", type: "diamond", x: 670, y: 315, width: 90, height: 90, color: BRAND.gold, glow: BRAND.gold },
    { id: "card2-title", type: "text", label: "Live Preview", x: 621, y: 450, color: BRAND.gold, fontSize: 22, fontWeight: 700 },
    { id: "card2-desc", type: "text", label: "Watch your animation play in real-time\nas GSAP renders every phase in the browser.", x: 570, y: 500, color: BRAND.fg, fontSize: 14, fontWeight: 400 },
    { id: "card3-bg", type: "box", x: 980, y: 150, width: 400, height: 400, color: "#121216" },
    { id: "card3-bar", type: "box", x: 980, y: 150, width: 400, height: 6, color: BRAND.red },
    { id: "card3-icon", type: "circle", x: 1140, y: 260, width: 80, height: 80, color: BRAND.red, glow: BRAND.red },
    { id: "card3-title", type: "text", label: "Export Ready", x: 1081, y: 390, color: BRAND.red, fontSize: 22, fontWeight: 700 },
    { id: "card3-desc", type: "text", label: "Export as JSON for Remotion pipeline.\nOr render video/GIF directly from the browser.", x: 1030, y: 440, color: BRAND.fg, fontSize: 14, fontWeight: 400 },
  ],
  connections: [],
  phases: [
    { at: 0.1, duration: 0.7, action: "tween", target: "header-shadow", ease: "power3.out", tweenMode: "fromTo", fromProps: { opacity: 0, y: -40 }, props: { opacity: 1, y: 0 } },
    { at: 0.1, duration: 0.7, action: "tween", target: "header", ease: "power3.out", tweenMode: "fromTo", fromProps: { opacity: 0, y: -40 }, props: { opacity: 1, y: 0 } },
    { at: 0.5, duration: 0.6, action: "tween", target: ["card1-bg", "card1-bar"], ease: "back.out(1.4)", tweenMode: "fromTo", fromProps: { opacity: 0, y: 60, scale: 0.9 }, props: { opacity: 1, y: 0, scale: 1 } },
    { at: 0.6, duration: 0.5, action: "enter", target: "card1-icon", effect: "scale-pop", ease: "back.out(2)" },
    { at: 0.8, duration: 0.4, action: "enter", target: "card1-title", effect: "fade" },
    { at: 0.9, duration: 0.4, action: "enter", target: "card1-desc", effect: "fade" },
    { at: 0.8, duration: 0.6, action: "tween", target: ["card2-bg", "card2-bar"], ease: "back.out(1.4)", tweenMode: "fromTo", fromProps: { opacity: 0, y: 60, scale: 0.9 }, props: { opacity: 1, y: 0, scale: 1 } },
    { at: 0.9, duration: 0.5, action: "enter", target: "card2-icon", effect: "scale-pop", ease: "back.out(2)" },
    { at: 1.1, duration: 0.4, action: "enter", target: "card2-title", effect: "fade" },
    { at: 1.2, duration: 0.4, action: "enter", target: "card2-desc", effect: "fade" },
    { at: 1.1, duration: 0.6, action: "tween", target: ["card3-bg", "card3-bar"], ease: "back.out(1.4)", tweenMode: "fromTo", fromProps: { opacity: 0, y: 60, scale: 0.9 }, props: { opacity: 1, y: 0, scale: 1 } },
    { at: 1.2, duration: 0.5, action: "enter", target: "card3-icon", effect: "scale-pop", ease: "back.out(2)" },
    { at: 1.4, duration: 0.4, action: "enter", target: "card3-title", effect: "fade" },
    { at: 1.5, duration: 0.4, action: "enter", target: "card3-desc", effect: "fade" },
    { at: 2.5, duration: 0.5, action: "pulse", target: ["card1-icon", "card1-bar"] },
    { at: 3.2, duration: 0.5, action: "pulse", target: ["card2-icon", "card2-bar"] },
    { at: 3.9, duration: 0.5, action: "pulse", target: ["card3-icon", "card3-bar"] },
    { at: 4.8, duration: 0.6, action: "highlight", target: "header" },
    { at: 5.5, duration: 0.5, action: "pulse", target: ["card1-icon", "card2-icon", "card3-icon"] },
  ],
  effects: [
    { type: "breathing-glow", target: "card1-icon", color: BRAND.blue },
    { type: "breathing-glow", target: "card2-icon", color: BRAND.gold },
    { type: "breathing-glow", target: "card3-icon", color: BRAND.red },
  ],
  fonts: [],
};

// ============================================================
// 3. Logo Reveal — 几何图形旋转 + 发光
// ============================================================
const logoReveal: SceneConfig = {
  width: 1440,
  height: 810,
  duration: 5,
  background: BRAND.bg,
  palette: {
    id: "tpl-logo",
    name: "Logo Reveal",
    description: "几何图形旋转揭幕，金色主色",
    harmony: "custom",
    seed: BRAND.gold,
    colors: {
      primary: BRAND.gold,
      secondary: BRAND.blue,
      accent: BRAND.red,
      neutral: BRAND.dark,
      foreground: BRAND.fg,
      background: BRAND.bg,
    },
  },
  actors: [
    { id: "outer-ring", type: "circle", x: 560, y: 165, width: 320, height: 320, color: BRAND.dark },
    { id: "mid-ring", type: "circle", x: 585, y: 190, width: 270, height: 270, color: BRAND.gold, glow: BRAND.gold },
    { id: "inner-diamond", type: "diamond", x: 620, y: 225, width: 200, height: 200, color: BRAND.blue, glow: BRAND.blue },
    { id: "core", type: "circle", x: 670, y: 275, width: 100, height: 100, color: BRAND.red, glow: BRAND.red },
    { id: "logo-text-shadow", type: "text", label: "STUDIO", x: 458, y: 590, color: "#3a2a10", fontSize: 72, fontWeight: 900 },
    { id: "logo-text", type: "text", label: "STUDIO", x: 452, y: 582, color: BRAND.gold, fontSize: 72, fontWeight: 900 },
    { id: "tagline", type: "text", label: "Animation · Design · Code", x: 432, y: 660, color: BRAND.fg, fontSize: 22, fontWeight: 500 },
  ],
  connections: [],
  phases: [
    { at: 0.1, duration: 0.8, action: "enter", target: "outer-ring", effect: "scale-pop", ease: "back.out(2)" },
    { at: 0.2, duration: 3.8, action: "tween", target: "outer-ring", ease: "none", props: { rotation: -180 } },
    { at: 0.3, duration: 0.7, action: "enter", target: "mid-ring", effect: "scale-pop", ease: "back.out(2.5)" },
    { at: 0.4, duration: 3.6, action: "tween", target: "mid-ring", ease: "none", props: { rotation: 240 } },
    { at: 0.6, duration: 0.6, action: "enter", target: "inner-diamond", effect: "scale-pop", ease: "back.out(2)" },
    { at: 0.9, duration: 0.5, action: "enter", target: "core", effect: "scale-pop", ease: "back.out(3)" },
    { at: 1.2, duration: 0.6, action: "pulse", target: ["mid-ring", "inner-diamond", "core"] },
    { at: 1.6, duration: 0.7, action: "tween", target: "logo-text-shadow", ease: "power3.out", tweenMode: "fromTo", fromProps: { opacity: 0, y: 30 }, props: { opacity: 1, y: 0 } },
    { at: 1.6, duration: 0.7, action: "tween", target: "logo-text", ease: "power3.out", tweenMode: "fromTo", fromProps: { opacity: 0, y: 30 }, props: { opacity: 1, y: 0 } },
    { at: 2.0, duration: 0.5, action: "enter", target: "tagline", effect: "fade" },
    { at: 2.5, duration: 0.5, action: "pulse", target: "core" },
    { at: 3.0, duration: 0.5, action: "highlight", target: "logo-text" },
    { at: 3.5, duration: 0.5, action: "pulse", target: ["mid-ring", "inner-diamond"] },
    { at: 4.0, duration: 0.6, action: "highlight", target: "core" },
  ],
  effects: [
    { type: "breathing-glow", target: "mid-ring", color: BRAND.gold },
    { type: "breathing-glow", target: "inner-diamond", color: BRAND.blue },
    { type: "breathing-glow", target: "core", color: BRAND.red },
  ],
  fonts: [],
};

// ============================================================
// 4. Data Flow — 节点 + 连线动画
// ============================================================
const dataFlow: SceneConfig = {
  width: 1440,
  height: 810,
  duration: 6,
  background: BRAND.bg,
  palette: {
    id: "tpl-dataflow",
    name: "Data Flow",
    description: "数据流图用蓝色节点 + 金色连线",
    harmony: "custom",
    seed: BRAND.blue,
    colors: {
      primary: BRAND.blue,
      secondary: BRAND.gold,
      accent: BRAND.red,
      neutral: BRAND.dark,
      foreground: BRAND.fg,
      background: BRAND.bg,
    },
  },
  actors: [
    { id: "n1", type: "circle", x: 160, y: 345, width: 120, height: 120, color: BRAND.blue, glow: BRAND.blue },
    { id: "n1-label", type: "text", label: "Input", x: 185, y: 390, color: BRAND.bg, fontSize: 18, fontWeight: 700 },
    { id: "n2", type: "circle", x: 440, y: 145, width: 100, height: 100, color: BRAND.gold, glow: BRAND.gold },
    { id: "n2-label", type: "text", label: "Process", x: 448, y: 182, color: BRAND.bg, fontSize: 16, fontWeight: 700 },
    { id: "n3", type: "circle", x: 440, y: 545, width: 100, height: 100, color: BRAND.gold, glow: BRAND.gold },
    { id: "n3-label", type: "text", label: "Validate", x: 443, y: 582, color: BRAND.bg, fontSize: 16, fontWeight: 700 },
    { id: "n4", type: "circle", x: 720, y: 345, width: 120, height: 120, color: BRAND.blue, glow: BRAND.blue },
    { id: "n4-label", type: "text", label: "Aggregate", x: 730, y: 390, color: BRAND.bg, fontSize: 16, fontWeight: 700 },
    { id: "n5", type: "diamond", x: 1000, y: 345, width: 120, height: 120, color: BRAND.red, glow: BRAND.red },
    { id: "n5-label", type: "text", label: "Output", x: 1015, y: 396, color: BRAND.bg, fontSize: 18, fontWeight: 700 },
    { id: "title", type: "text", label: "Data Pipeline Architecture", x: 350, y: 60, color: BRAND.blue, fontSize: 36, fontWeight: 800 },
  ],
  connections: [
    { from: "n1", to: "n2", style: "arrow", color: BRAND.gold },
    { from: "n1", to: "n3", style: "arrow", color: BRAND.gold },
    { from: "n2", to: "n4", style: "arrow", color: BRAND.gold },
    { from: "n3", to: "n4", style: "arrow", color: BRAND.gold },
    { from: "n4", to: "n5", style: "arrow", color: BRAND.red },
  ],
  phases: [
    { at: 0.1, duration: 0.5, action: "enter", target: "title", effect: "fade" },
    { at: 0.4, duration: 0.6, action: "enter", target: "n1", effect: "scale-pop", ease: "back.out(2)" },
    { at: 0.5, duration: 0.3, action: "enter", target: "n1-label", effect: "fade" },
    { at: 0.8, duration: 0.5, action: "connect", target: "n1", effect: "draw-line", stagger: 0.2 },
    { at: 1.0, duration: 0.6, action: "enter", target: "n2", effect: "scale-pop", ease: "back.out(2)" },
    { at: 1.1, duration: 0.6, action: "enter", target: "n3", effect: "scale-pop", ease: "back.out(2)" },
    { at: 1.2, duration: 0.3, action: "enter", target: ["n2-label", "n3-label"], effect: "fade", stagger: { each: 0.1, from: "start" } },
    { at: 1.6, duration: 0.6, action: "enter", target: "n4", effect: "scale-pop", ease: "back.out(2)" },
    { at: 1.7, duration: 0.3, action: "enter", target: "n4-label", effect: "fade" },
    { at: 2.0, duration: 0.6, action: "enter", target: "n5", effect: "scale-pop", ease: "back.out(2)" },
    { at: 2.1, duration: 0.3, action: "enter", target: "n5-label", effect: "fade" },
    { at: 2.5, duration: 0.5, action: "pulse", target: ["n1", "n2", "n3"] },
    { at: 3.0, duration: 0.5, action: "pulse", target: "n4" },
    { at: 3.5, duration: 0.6, action: "pulse", target: "n5" },
    { at: 4.0, duration: 0.5, action: "highlight", target: ["n1", "n5"] },
    { at: 4.5, duration: 0.5, action: "pulse", target: ["n2", "n3", "n4"] },
  ],
  effects: [
    { type: "breathing-glow", target: "n1", color: BRAND.blue },
    { type: "breathing-glow", target: "n2", color: BRAND.gold },
    { type: "breathing-glow", target: "n3", color: BRAND.gold },
    { type: "breathing-glow", target: "n4", color: BRAND.blue },
    { type: "breathing-glow", target: "n5", color: BRAND.red },
  ],
  fonts: [],
};

// ============================================================
// 5. Minimal Fade — 极简淡入序列
// ============================================================
const minimalFade: SceneConfig = {
  width: 1440,
  height: 810,
  duration: 5,
  background: BRAND.bg,
  palette: {
    id: "tpl-minimal",
    name: "Minimal Fade",
    description: "极简淡入序列，留白为主，文字优雅出现",
    harmony: "custom",
    seed: BRAND.fg,
    colors: {
      primary: BRAND.fg,
      secondary: BRAND.blue,
      accent: BRAND.gold,
      neutral: BRAND.dark,
      foreground: "#C8C8D0",
      background: BRAND.bg,
    },
  },
  actors: [
    { id: "line1", type: "text", label: "Less is", x: 160, y: 260, color: BRAND.fg, fontSize: 80, fontWeight: 300 },
    { id: "line2", type: "text", label: "more.", x: 160, y: 360, color: BRAND.gold, fontSize: 80, fontWeight: 300 },
    { id: "divider", type: "box", x: 160, y: 440, width: 120, height: 2, color: "#333" },
    { id: "line3", type: "text", label: "Good design is as little design as possible.", x: 160, y: 500, color: "#555", fontSize: 20, fontWeight: 400 },
    { id: "line4", type: "text", label: "— Dieter Rams", x: 160, y: 540, color: "#444", fontSize: 16, fontWeight: 400 },
  ],
  connections: [],
  phases: [
    { at: 0.2, duration: 0.8, action: "enter", target: "line1", effect: "fade" },
    { at: 0.6, duration: 0.8, action: "enter", target: "line2", effect: "fade" },
    { at: 1.0, duration: 0.6, action: "tween", target: "divider", ease: "power2.out", tweenMode: "fromTo", fromProps: { scaleX: 0, transformOrigin: "left center" }, props: { scaleX: 1, transformOrigin: "left center" } },
    { at: 1.4, duration: 0.8, action: "enter", target: "line3", effect: "fade" },
    { at: 1.8, duration: 0.8, action: "enter", target: "line4", effect: "fade" },
    { at: 2.8, duration: 0.5, action: "pulse", target: "line2" },
    { at: 3.8, duration: 0.5, action: "pulse", target: "line2" },
  ],
  effects: [],
  fonts: [],
};

// ============================================================
// 6. Kinetic Typography — 文字弹跳入场
// ============================================================
const kineticTypography: SceneConfig = {
  width: 1440,
  height: 810,
  duration: 6,
  background: BRAND.bg,
  palette: {
    id: "tpl-kinetic",
    name: "Kinetic Type",
    description: "动感文字弹跳入场，逐词 stagger",
    harmony: "custom",
    seed: BRAND.red,
    colors: {
      primary: BRAND.red,
      secondary: BRAND.gold,
      accent: BRAND.blue,
      neutral: BRAND.dark,
      foreground: BRAND.fg,
      background: BRAND.bg,
    },
  },
  actors: [
    { id: "w1", type: "text", label: "TYPE", x: 240, y: 300, color: BRAND.red, fontSize: 72, fontWeight: 900 },
    { id: "w2", type: "text", label: "IS", x: 520, y: 300, color: BRAND.gold, fontSize: 72, fontWeight: 900 },
    { id: "w3", type: "text", label: "MOTION", x: 660, y: 300, color: BRAND.blue, fontSize: 72, fontWeight: 900 },
    { id: "sub", type: "text", label: "Every letter tells a story.", x: 240, y: 420, color: BRAND.fg, fontSize: 28, fontWeight: 400 },
    { id: "bar", type: "box", x: 240, y: 480, width: 0, height: 4, color: BRAND.red },
    { id: "cta", type: "text", label: "Start typing to create your own.", x: 240, y: 550, color: "#555", fontSize: 18, fontWeight: 500 },
  ],
  connections: [],
  phases: [
    { at: 0.1, duration: 0.7, action: "tween", target: "w1", ease: "back.out(1.7)", tweenMode: "fromTo", fromProps: { opacity: 0, y: 80, scale: 1.4 }, props: { opacity: 1, y: 0, scale: 1 } },
    { at: 0.3, duration: 0.7, action: "tween", target: "w2", ease: "back.out(1.7)", tweenMode: "fromTo", fromProps: { opacity: 0, y: 80, scale: 1.4 }, props: { opacity: 1, y: 0, scale: 1 } },
    { at: 0.5, duration: 0.7, action: "tween", target: "w3", ease: "back.out(1.7)", tweenMode: "fromTo", fromProps: { opacity: 0, y: 80, scale: 1.4 }, props: { opacity: 1, y: 0, scale: 1 } },
    { at: 0.9, duration: 0.5, action: "pulse", target: ["w1", "w2", "w3"] },
    { at: 1.3, duration: 0.6, action: "enter", target: "sub", effect: "fade" },
    { at: 1.6, duration: 0.8, action: "tween", target: "bar", ease: "power3.out", tweenMode: "fromTo", fromProps: { width: 0 }, props: { width: 480 } },
    { at: 2.0, duration: 0.5, action: "enter", target: "cta", effect: "fade" },
    { at: 2.5, duration: 0.4, action: "shake", target: "w1" },
    { at: 3.0, duration: 0.4, action: "shake", target: "w2" },
    { at: 3.5, duration: 0.4, action: "shake", target: "w3" },
    { at: 4.0, duration: 0.6, action: "highlight", target: ["w1", "w2", "w3"] },
    { at: 4.8, duration: 0.5, action: "pulse", target: ["w1", "w2", "w3"], stagger: { each: 0.1, from: "start" } },
  ],
  effects: [
    { type: "breathing-glow", target: "w1", color: BRAND.red },
    { type: "breathing-glow", target: "w3", color: BRAND.blue },
  ],
  fonts: [],
};

// ============================================================
// 7. Typewriter Reveal — 逐词打字机揭示（GSAP stagger 经典用法）
// ============================================================
const typewriterReveal: SceneConfig = {
  width: 1440,
  height: 810,
  duration: 5,
  background: BRAND.bg,
  palette: {
    id: "tpl-typewriter",
    name: "Typewriter",
    description: "逐词揭示，深色背景 + 金色文字",
    harmony: "custom",
    seed: BRAND.gold,
    colors: {
      primary: BRAND.gold,
      secondary: BRAND.blue,
      accent: BRAND.red,
      neutral: BRAND.dark,
      foreground: "#D0D0D8",
      background: BRAND.bg,
    },
  },
  actors: [
    // 每个词是独立 actor，用 stagger 制造打字机效果
    { id: "w1", type: "text", label: "Great", x: 200, y: 320, color: BRAND.gold, fontSize: 64, fontWeight: 800 },
    { id: "w2", type: "text", label: "animation", x: 480, y: 320, color: "#D0D0D8", fontSize: 64, fontWeight: 300 },
    { id: "w3", type: "text", label: "is", x: 860, y: 320, color: "#D0D0D8", fontSize: 64, fontWeight: 300 },
    { id: "w4", type: "text", label: "not", x: 200, y: 420, color: "#D0D0D8", fontSize: 64, fontWeight: 300 },
    { id: "w5", type: "text", label: "about", x: 400, y: 420, color: "#D0D0D8", fontSize: 64, fontWeight: 300 },
    { id: "w6", type: "text", label: "moving", x: 640, y: 420, color: BRAND.blue, fontSize: 64, fontWeight: 800 },
    { id: "w7", type: "text", label: "things.", x: 980, y: 420, color: BRAND.red, fontSize: 64, fontWeight: 800 },
    { id: "cursor", type: "box", x: 200, y: 510, width: 40, height: 4, color: BRAND.gold },
    { id: "subtitle", type: "text", label: "It's about making them feel alive.", x: 200, y: 580, color: "#555", fontSize: 22, fontWeight: 400 },
  ],
  connections: [],
  phases: [
    // 逐词揭示 — GSAP stagger 经典用法：from: "start" 从左到右
    { at: 0.2, duration: 0.4, action: "tween", target: ["w1", "w2", "w3"], ease: "back.out(1.4)", tweenMode: "fromTo",
      stagger: { each: 0.15, from: "start" },
      fromProps: { opacity: 0, y: 20, scale: 0.8 },
      props: { opacity: 1, y: 0, scale: 1 } },
    { at: 0.9, duration: 0.4, action: "tween", target: ["w4", "w5", "w6", "w7"], ease: "back.out(1.4)", tweenMode: "fromTo",
      stagger: { each: 0.12, from: "start" },
      fromProps: { opacity: 0, y: 20, scale: 0.8 },
      props: { opacity: 1, y: 0, scale: 1 } },
    // 光标闪烁
    { at: 0.2, duration: 2.0, action: "tween", target: "cursor", ease: "steps(1)",
      props: { opacity: 0, repeat: 5, yoyo: true, duration: 0.35 } },
    { at: 2.2, duration: 0.3, action: "tween", target: "cursor", ease: "power2.in", props: { opacity: 0 } },
    // 副标题淡入
    { at: 2.4, duration: 0.6, action: "enter", target: "subtitle", effect: "fade" },
    // 重音词脉冲
    { at: 2.8, duration: 0.5, action: "pulse", target: "w1" },
    { at: 3.2, duration: 0.5, action: "pulse", target: "w6" },
    { at: 3.6, duration: 0.5, action: "pulse", target: "w7" },
    // 全体高亮收尾
    { at: 4.0, duration: 0.6, action: "highlight", target: ["w1", "w6", "w7"] },
  ],
  effects: [
    { type: "breathing-glow", target: "w1", color: BRAND.gold },
  ],
  fonts: [],
};

// ============================================================
// 8. Bounce Gallery — 弹跳画廊（from: "edges" stagger + back 缓动）
// ============================================================
const bounceGallery: SceneConfig = {
  width: 1440,
  height: 810,
  duration: 6,
  background: BRAND.bg,
  palette: {
    id: "tpl-bounce",
    name: "Bounce Gallery",
    description: "彩色方块从四周弹跳入场",
    harmony: "custom",
    seed: BRAND.red,
    colors: {
      primary: BRAND.red,
      secondary: BRAND.gold,
      accent: BRAND.blue,
      neutral: BRAND.dark,
      foreground: BRAND.fg,
      background: BRAND.bg,
    },
  },
  actors: [
    { id: "title", type: "text", label: "BOUNCE GALLERY", x: 520, y: 45, color: BRAND.fg, fontSize: 28, fontWeight: 800 },
    // 上方一行：从左到右
    { id: "b1", type: "box", x: 100, y: 120, width: 180, height: 180, color: BRAND.red, glow: BRAND.red },
    { id: "b1-label", type: "text", label: "01", x: 170, y: 195, color: BRAND.bg, fontSize: 36, fontWeight: 900 },
    { id: "b2", type: "box", x: 340, y: 120, width: 180, height: 180, color: BRAND.gold, glow: BRAND.gold },
    { id: "b2-label", type: "text", label: "02", x: 410, y: 195, color: BRAND.bg, fontSize: 36, fontWeight: 900 },
    { id: "b3", type: "box", x: 580, y: 120, width: 180, height: 180, color: BRAND.blue, glow: BRAND.blue },
    { id: "b3-label", type: "text", label: "03", x: 650, y: 195, color: BRAND.bg, fontSize: 36, fontWeight: 900 },
    { id: "b4", type: "box", x: 820, y: 120, width: 180, height: 180, color: BRAND.red, glow: BRAND.red },
    { id: "b4-label", type: "text", label: "04", x: 890, y: 195, color: BRAND.bg, fontSize: 36, fontWeight: 900 },
    { id: "b5", type: "box", x: 1060, y: 120, width: 180, height: 180, color: BRAND.gold, glow: BRAND.gold },
    { id: "b5-label", type: "text", label: "05", x: 1130, y: 195, color: BRAND.bg, fontSize: 36, fontWeight: 900 },
    // 下方一行：从右到左
    { id: "b6", type: "box", x: 1060, y: 380, width: 180, height: 180, color: BRAND.blue, glow: BRAND.blue },
    { id: "b6-label", type: "text", label: "06", x: 1130, y: 455, color: BRAND.bg, fontSize: 36, fontWeight: 900 },
    { id: "b7", type: "box", x: 820, y: 380, width: 180, height: 180, color: BRAND.red, glow: BRAND.red },
    { id: "b7-label", type: "text", label: "07", x: 890, y: 455, color: BRAND.bg, fontSize: 36, fontWeight: 900 },
    { id: "b8", type: "box", x: 580, y: 380, width: 180, height: 180, color: BRAND.gold, glow: BRAND.gold },
    { id: "b8-label", type: "text", label: "08", x: 650, y: 455, color: BRAND.bg, fontSize: 36, fontWeight: 900 },
    { id: "b9", type: "box", x: 340, y: 380, width: 180, height: 180, color: BRAND.blue, glow: BRAND.blue },
    { id: "b9-label", type: "text", label: "09", x: 410, y: 455, color: BRAND.bg, fontSize: 36, fontWeight: 900 },
    { id: "b10", type: "box", x: 100, y: 380, width: 180, height: 180, color: BRAND.red, glow: BRAND.red },
    { id: "b10-label", type: "text", label: "10", x: 170, y: 455, color: BRAND.bg, fontSize: 36, fontWeight: 900 },
    // 底部文案
    { id: "footer", type: "text", label: "Staggered · Back.out · Edges → Center", x: 420, y: 630, color: "#555", fontSize: 16, fontWeight: 500 },
  ],
  connections: [],
  phases: [
    { at: 0.1, duration: 0.5, action: "enter", target: "title", effect: "fade" },
    // 上方行：从左到右弹跳入场 — stagger from "start"
    { at: 0.3, duration: 0.7, action: "tween", target: ["b1", "b2", "b3", "b4", "b5"], ease: "back.out(1.7)", tweenMode: "fromTo",
      stagger: { each: 0.1, from: "start" },
      fromProps: { opacity: 0, y: -120, scale: 0.6 },
      props: { opacity: 1, y: 0, scale: 1 } },
    { at: 0.4, duration: 0.5, action: "enter", target: ["b1-label", "b2-label", "b3-label", "b4-label", "b5-label"], effect: "scale-pop", ease: "back.out(2)",
      stagger: { each: 0.1, from: "start" } },
    // 下方行：从右到左弹跳入场 — stagger from "end"（反转方向）
    { at: 1.0, duration: 0.7, action: "tween", target: ["b10", "b9", "b8", "b7", "b6"], ease: "back.out(1.7)", tweenMode: "fromTo",
      stagger: { each: 0.1, from: "start" },
      fromProps: { opacity: 0, y: 120, scale: 0.6 },
      props: { opacity: 1, y: 0, scale: 1 } },
    { at: 1.1, duration: 0.5, action: "enter", target: ["b10-label", "b9-label", "b8-label", "b7-label", "b6-label"], effect: "scale-pop", ease: "back.out(2)",
      stagger: { each: 0.1, from: "start" } },
    // GSAP 亮点：from "edges" → 从两端向中间脉冲
    { at: 2.2, duration: 0.5, action: "pulse", target: ["b1", "b2", "b3", "b4", "b5"], stagger: { each: 0.08, from: "edges" } },
    { at: 2.8, duration: 0.5, action: "pulse", target: ["b10", "b9", "b8", "b7", "b6"], stagger: { each: 0.08, from: "edges" } },
    // GSAP 亮点：from "center" → 从中间向两端脉冲
    { at: 3.4, duration: 0.5, action: "pulse", target: ["b1", "b2", "b3", "b4", "b5"], stagger: { each: 0.08, from: "center" } },
    { at: 3.9, duration: 0.5, action: "pulse", target: ["b10", "b9", "b8", "b7", "b6"], stagger: { each: 0.08, from: "center" } },
    // GSAP 亮点：from "random" → 随机顺序脉冲
    { at: 4.4, duration: 0.5, action: "pulse", target: ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9", "b10"],
      stagger: { each: 0.06, from: "random" } },
    // 底部文案
    { at: 2.0, duration: 0.6, action: "enter", target: "footer", effect: "fade" },
    { at: 5.2, duration: 0.5, action: "highlight", target: "title" },
  ],
  effects: [
    { type: "breathing-glow", target: "b3", color: BRAND.blue },
    { type: "breathing-glow", target: "b8", color: BRAND.gold },
  ],
  fonts: [],
};

// ============================================================
// 9. Wave Pulse — 波浪脉冲（GSAP stagger 时间差创造波纹）
// ============================================================
const wavePulse: SceneConfig = {
  width: 1440,
  height: 810,
  duration: 5,
  background: BRAND.bg,
  palette: {
    id: "tpl-wave",
    name: "Wave Pulse",
    description: "波浪式脉冲横扫画布",
    harmony: "custom",
    seed: BRAND.blue,
    colors: {
      primary: BRAND.blue,
      secondary: BRAND.gold,
      accent: BRAND.red,
      neutral: BRAND.dark,
      foreground: BRAND.fg,
      background: BRAND.bg,
    },
  },
  actors: [
    { id: "title", type: "text", label: "WAVE PULSE", x: 570, y: 50, color: BRAND.fg, fontSize: 24, fontWeight: 800 },
    // 三行圆形，用于展示不同的 stagger 模式
    // Row 1: 8 个圆
    { id: "r1c1", type: "circle", x: 80, y: 150, width: 80, height: 80, color: BRAND.blue, glow: BRAND.blue },
    { id: "r1c2", type: "circle", x: 230, y: 150, width: 80, height: 80, color: BRAND.blue, glow: BRAND.blue },
    { id: "r1c3", type: "circle", x: 380, y: 150, width: 80, height: 80, color: BRAND.blue, glow: BRAND.blue },
    { id: "r1c4", type: "circle", x: 530, y: 150, width: 80, height: 80, color: BRAND.blue, glow: BRAND.blue },
    { id: "r1c5", type: "circle", x: 680, y: 150, width: 80, height: 80, color: BRAND.blue, glow: BRAND.blue },
    { id: "r1c6", type: "circle", x: 830, y: 150, width: 80, height: 80, color: BRAND.blue, glow: BRAND.blue },
    { id: "r1c7", type: "circle", x: 980, y: 150, width: 80, height: 80, color: BRAND.blue, glow: BRAND.blue },
    { id: "r1c8", type: "circle", x: 1130, y: 150, width: 80, height: 80, color: BRAND.blue, glow: BRAND.blue },
    // Row 2: 8 个圆（金色）
    { id: "r2c1", type: "circle", x: 80, y: 320, width: 80, height: 80, color: BRAND.gold, glow: BRAND.gold },
    { id: "r2c2", type: "circle", x: 230, y: 320, width: 80, height: 80, color: BRAND.gold, glow: BRAND.gold },
    { id: "r2c3", type: "circle", x: 380, y: 320, width: 80, height: 80, color: BRAND.gold, glow: BRAND.gold },
    { id: "r2c4", type: "circle", x: 530, y: 320, width: 80, height: 80, color: BRAND.gold, glow: BRAND.gold },
    { id: "r2c5", type: "circle", x: 680, y: 320, width: 80, height: 80, color: BRAND.gold, glow: BRAND.gold },
    { id: "r2c6", type: "circle", x: 830, y: 320, width: 80, height: 80, color: BRAND.gold, glow: BRAND.gold },
    { id: "r2c7", type: "circle", x: 980, y: 320, width: 80, height: 80, color: BRAND.gold, glow: BRAND.gold },
    { id: "r2c8", type: "circle", x: 1130, y: 320, width: 80, height: 80, color: BRAND.gold, glow: BRAND.gold },
    // Row 3: 8 个圆（红色）
    { id: "r3c1", type: "circle", x: 80, y: 490, width: 80, height: 80, color: BRAND.red, glow: BRAND.red },
    { id: "r3c2", type: "circle", x: 230, y: 490, width: 80, height: 80, color: BRAND.red, glow: BRAND.red },
    { id: "r3c3", type: "circle", x: 380, y: 490, width: 80, height: 80, color: BRAND.red, glow: BRAND.red },
    { id: "r3c4", type: "circle", x: 530, y: 490, width: 80, height: 80, color: BRAND.red, glow: BRAND.red },
    { id: "r3c5", type: "circle", x: 680, y: 490, width: 80, height: 80, color: BRAND.red, glow: BRAND.red },
    { id: "r3c6", type: "circle", x: 830, y: 490, width: 80, height: 80, color: BRAND.red, glow: BRAND.red },
    { id: "r3c7", type: "circle", x: 980, y: 490, width: 80, height: 80, color: BRAND.red, glow: BRAND.red },
    { id: "r3c8", type: "circle", x: 1130, y: 490, width: 80, height: 80, color: BRAND.red, glow: BRAND.red },
    // 描述标签
    { id: "label1", type: "text", label: "from: \"start\" — 左→右波浪", x: 80, y: 250, color: "#555", fontSize: 12, fontWeight: 500 },
    { id: "label2", type: "text", label: "from: \"center\" — 中间→两端", x: 80, y: 420, color: "#555", fontSize: 12, fontWeight: 500 },
    { id: "label3", type: "text", label: "from: \"edges\" — 两端→中间", x: 80, y: 590, color: "#555", fontSize: 12, fontWeight: 500 },
  ],
  connections: [],
  phases: [
    { at: 0.1, duration: 0.4, action: "enter", target: "title", effect: "fade" },
    // Row 1: from "start" — 左→右波浪入场
    { at: 0.4, duration: 0.5, action: "enter", target: ["r1c1", "r1c2", "r1c3", "r1c4", "r1c5", "r1c6", "r1c7", "r1c8"],
      effect: "scale-pop", ease: "back.out(1.7)", stagger: { each: 0.08, from: "start" } },
    { at: 0.8, duration: 0.3, action: "enter", target: "label1", effect: "fade" },
    // Row 2: from "center" — 中间→两端扩散
    { at: 1.2, duration: 0.5, action: "enter", target: ["r2c1", "r2c2", "r2c3", "r2c4", "r2c5", "r2c6", "r2c7", "r2c8"],
      effect: "scale-pop", ease: "back.out(1.7)", stagger: { each: 0.08, from: "center" } },
    { at: 1.6, duration: 0.3, action: "enter", target: "label2", effect: "fade" },
    // Row 3: from "edges" — 两端→中间汇合
    { at: 2.0, duration: 0.5, action: "enter", target: ["r3c1", "r3c2", "r3c3", "r3c4", "r3c5", "r3c6", "r3c7", "r3c8"],
      effect: "scale-pop", ease: "back.out(1.7)", stagger: { each: 0.08, from: "edges" } },
    { at: 2.4, duration: 0.3, action: "enter", target: "label3", effect: "fade" },
    // 波浪脉冲：三行同时但不同 stagger 模式
    { at: 2.8, duration: 0.5, action: "pulse", target: ["r1c1", "r1c2", "r1c3", "r1c4", "r1c5", "r1c6", "r1c7", "r1c8"],
      stagger: { each: 0.06, from: "start" } },
    { at: 3.3, duration: 0.5, action: "pulse", target: ["r2c1", "r2c2", "r2c3", "r2c4", "r2c5", "r2c6", "r2c7", "r2c8"],
      stagger: { each: 0.06, from: "center" } },
    { at: 3.8, duration: 0.5, action: "pulse", target: ["r3c1", "r3c2", "r3c3", "r3c4", "r3c5", "r3c6", "r3c7", "r3c8"],
      stagger: { each: 0.06, from: "edges" } },
    // 三行同时 highlight（无 stagger）
    { at: 4.3, duration: 0.4, action: "highlight", target: ["r1c4", "r2c4", "r3c4"] },
  ],
  effects: [
    { type: "breathing-glow", target: "r1c1", color: BRAND.blue },
    { type: "breathing-glow", target: "r2c4", color: BRAND.gold },
    { type: "breathing-glow", target: "r3c8", color: BRAND.red },
  ],
  fonts: [],
};

// ============================================================
// 导出
// ============================================================

export const DEMO_TEMPLATES: DemoTemplate[] = [
  {
    id: "hero-title",
    name: "Hero Title Sequence",
    description: "大胆的双色标题序列，带交错入场和发光效果",
    tags: ["标题", "文字", "品牌"],
    previewColor: BRAND.gold,
    config: heroTitleSequence,
  },
  {
    id: "product-showcase",
    name: "Product Showcase",
    description: "三张特性卡片滑入展示，适合产品介绍",
    tags: ["卡片", "展示", "产品"],
    previewColor: BRAND.blue,
    config: productShowcase,
  },
  {
    id: "logo-reveal",
    name: "Logo Reveal",
    description: "多层几何图形旋转揭幕，金色品牌感",
    tags: ["Logo", "几何", "旋转"],
    previewColor: BRAND.gold,
    config: logoReveal,
  },
  {
    id: "data-flow",
    name: "Data Flow Chart",
    description: "节点 + 连线动画，展示数据管道流程",
    tags: ["流程图", "节点", "连线"],
    previewColor: BRAND.blue,
    config: dataFlow,
  },
  {
    id: "minimal-fade",
    name: "Minimal Fade In",
    description: "极简淡入序列，大留白 + 优雅文字节奏",
    tags: ["极简", "淡入", "文字"],
    previewColor: BRAND.fg,
    config: minimalFade,
  },
  {
    id: "kinetic-type",
    name: "Kinetic Typography",
    description: "文字弹跳入场 + 逐个抖动，动感十足",
    tags: ["文字", "弹跳", "动感"],
    previewColor: BRAND.red,
    config: kineticTypography,
  },
  {
    id: "typewriter-reveal",
    name: "Typewriter Reveal",
    description: "逐词打字机揭示，stagger from:start + back.out 缓动",
    tags: ["文字", "逐词", "Stagger"],
    previewColor: BRAND.gold,
    config: typewriterReveal,
  },
  {
    id: "bounce-gallery",
    name: "Bounce Gallery",
    description: "10 个彩色方块弹跳入场，展示 stagger from 的 4 种模式",
    tags: ["画廊", "弹跳", "Stagger"],
    previewColor: BRAND.red,
    config: bounceGallery,
  },
  {
    id: "wave-pulse",
    name: "Wave Pulse",
    description: "24 个圆形波浪脉冲，from:start/center/edges 三种波纹对比",
    tags: ["波浪", "脉冲", "Stagger"],
    previewColor: BRAND.blue,
    config: wavePulse,
  },
];
