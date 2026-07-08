// ============================================================
// colorPalette.ts — 配色系统的纯函数算法内核
//
// 职责：
// - hex ↔ HSL 转换、规范化（统一大写，消除历史大小写不一致）
// - WCAG 对比度计算与强制达标（ensureContrast）
// - 从一个主色按色彩和谐派生 N 套语义化 Palette
//   （primary / secondary / accent / neutral / foreground / background）
// - 渲染层共享的颜色 fallback 常量
//
// 纯函数，无 DOM/node 依赖 —— 前端预览与服务端 MCP 工具共用同一套算法。
// 设计理论：60-30-10 比例、HSL 色相旋转和谐、tonal 明度阶梯、WCAG 对比度。
// ============================================================

import type { Palette, HarmonyScheme } from "../types/scene.js";

// 固定暗背景（暗色原生品牌基调；场景颜色的对比度基准）
const DARK_BACKGROUND = "#0A0A0B";

// 渲染层 fallback（统一大写，消除 #E8A230 / #e8a230 历史不一致）
export const FALLBACK_ACTOR_COLOR = "#E8A230";
export const FALLBACK_CONNECTION_COLOR = "#5A5A62";

// ------------------------------------------------------------
// 小工具
// ------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function rotateHue(h: number, deg: number): number {
  return (((h + deg) % 360) + 360) % 360;
}

// ------------------------------------------------------------
// hex ↔ RGB ↔ HSL 转换
// ------------------------------------------------------------

/**
 * 规范化 hex：接受 "#fff"/"#ffffff"/"ffffff"/"#E8A230" 等，
 * 统一输出 "#RRGGBB" 大写。非法输入抛错。
 */
export function normalizeHex(input: string): string {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(input.trim());
  if (!m) {
    throw new Error(`非法 hex 颜色: ${input}`);
  }
  let hex = m[1];
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return `#${hex.toUpperCase()}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (n: number) =>
    clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`.toUpperCase();
}

/** hex → HSL。h: 0-360, s/l: 0-100 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;
  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r1:
        h = ((g1 - b1) / d + (g1 < b1 ? 6 : 0)) * 60;
        break;
      case g1:
        h = ((b1 - r1) / d + 2) * 60;
        break;
      default:
        h = ((r1 - g1) / d + 4) * 60;
    }
  }
  return { h, s: s * 100, l: l * 100 };
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

/** HSL → hex。h: 0-360, s/l: 0-100。输出 "#RRGGBB" 大写 */
export function hslToHex(h: number, s: number, l: number): string {
  const h1 = (((h % 360) + 360) % 360) / 360;
  const s1 = clamp(s, 0, 100) / 100;
  const l1 = clamp(l, 0, 100) / 100;
  if (s1 === 0) {
    const v = Math.round(l1 * 255);
    return rgbToHex(v, v, v);
  }
  const q = l1 < 0.5 ? l1 * (1 + s1) : l1 + s1 - l1 * s1;
  const p = 2 * l1 - q;
  const r = hue2rgb(p, q, h1 + 1 / 3);
  const g = hue2rgb(p, q, h1);
  const b = hue2rgb(p, q, h1 - 1 / 3);
  return rgbToHex(r * 255, g * 255, b * 255);
}

// ------------------------------------------------------------
// WCAG 对比度
// ------------------------------------------------------------

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 微调 fg 的明度直到它相对 bg 达到 minRatio（WCAG），或到达明度边界。
 * mode: "lighten" 提亮（暗背景）、"darken" 加深（亮背景）、"auto" 按背景明度自动选向。
 */
export function ensureContrast(
  fg: string,
  bg: string,
  minRatio: number,
  mode: "lighten" | "darken" | "auto" = "auto"
): string {
  if (contrastRatio(fg, bg) >= minRatio) return fg;
  const { h, s } = hexToHsl(fg);
  const dir =
    mode === "lighten"
      ? 1
      : mode === "darken"
        ? -1
        : relativeLuminance(bg) > 0.5
          ? -1
          : 1;
  let l = hexToHsl(fg).l;
  let cur = fg;
  let guard = 0;
  while (contrastRatio(cur, bg) < minRatio && l >= 2 && l <= 98 && guard < 200) {
    l += dir;
    cur = hslToHex(h, s, l);
    guard++;
  }
  return cur;
}

// ------------------------------------------------------------
// 明度调整（烘焙 glow / highlight 时由 agent 参照使用）
// ------------------------------------------------------------

export function lighten(hex: string, amount: number): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, clamp(l + amount, 0, 100));
}

export function darken(hex: string, amount: number): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, clamp(l - amount, 0, 100));
}

// ------------------------------------------------------------
// 色彩和谐 —— 返回 [hPrimary, hSecondary, hAccent]
// ------------------------------------------------------------

function harmonyHues(h0: number, scheme: HarmonyScheme): [number, number, number] {
  switch (scheme) {
    case "analogous":
      // 种子 + 两个邻色，柔和统一
      return [h0, rotateHue(h0, 30), rotateHue(h0, -30)];
    case "complementary":
      // primary=种子, secondary=邻色(缓和), accent=互补(强对比)
      return [h0, rotateHue(h0, -30), rotateHue(h0, 180)];
    case "split-complementary":
      return [h0, rotateHue(h0, 150), rotateHue(h0, -150)];
    case "triadic":
      // 三元等距，活力多彩
      return [h0, rotateHue(h0, 120), rotateHue(h0, -120)];
    case "custom":
    default:
      return [h0, h0, h0];
  }
}

// ------------------------------------------------------------
// 生成 —— 从一个主色派生多套语义化 Palette
// ------------------------------------------------------------

export interface GenerateOptions {
  /** 和谐方案；默认 ["analogous","complementary","triadic"] 共 3 套 */
  schemes?: HarmonyScheme[];
}

/**
 * 从主色派生多套语义化调色板。每套 6 个角色，全部通过 WCAG 对比度校验：
 * foreground 对背景 ≥ 4.5（AA 文本），primary/secondary/accent 对背景 ≥ 3.0。
 * 返回 Palette 的 name/description 为空 —— 品味由 agent 赋予。
 */
export function generatePalettes(seedHex: string, opts?: GenerateOptions): Palette[] {
  const schemes =
    opts?.schemes ?? (["analogous", "complementary", "triadic"] as HarmonyScheme[]);
  const seed = normalizeHex(seedHex);
  const { h: H0, s: S0, l: L0 } = hexToHsl(seed);
  const bg = DARK_BACKGROUND;

  return schemes.map((scheme, i) => {
    const [hP, hS, hA] = harmonyHues(H0, scheme);
    const primaryRaw = hslToHex(hP, clamp(S0, 55, 85), clamp(L0, 45, 60));
    const secondaryRaw = hslToHex(hS, clamp(S0 * 0.8, 20, 80), 55);
    const accentRaw = hslToHex(hA, clamp(S0 + 10, 60, 90), 55);
    const neutral = hslToHex(H0, 10, 13);
    const foregroundRaw = hslToHex(H0, 15, 90);

    const primary = ensureContrast(primaryRaw, bg, 3.0, "lighten");
    const secondary = ensureContrast(secondaryRaw, bg, 3.0, "lighten");
    const accent = ensureContrast(accentRaw, bg, 3.0, "lighten");
    const foreground = ensureContrast(foregroundRaw, bg, 4.5, "lighten");

    return {
      id: `p${i + 1}`,
      name: "",
      description: "",
      harmony: scheme,
      seed,
      colors: {
        primary,
        secondary,
        accent,
        neutral,
        foreground,
        background: bg,
      },
    };
  });
}

// ------------------------------------------------------------
// 提案解析与意图匹配（前端色卡联动用）
// ------------------------------------------------------------

/**
 * 从 generate_color_palettes 的 tool_result 解析出 Palette[]。
 * result 可能是 JSON 字符串或已解析对象。无效 → null。
 */
export function parsePalettes(result: unknown): Palette[] | null {
  try {
    const obj =
      typeof result === "string" ? JSON.parse(result) : (result as unknown);
    const palettes = (obj as { palettes?: unknown })?.palettes;
    if (!Array.isArray(palettes) || palettes.length === 0) return null;
    return palettes as Palette[];
  } catch {
    return null;
  }
}

const NUM_CN_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

function parseIdx(s: string): number | null {
  if (/^[1-6]$/.test(s)) return parseInt(s, 10);
  return NUM_CN_MAP[s] ?? null;
}

/**
 * 保守匹配用户消息里的配色选择意图。命中 → {id, index}；否则 null。
 * **整体 anchored**：只把"整条消息就是一个选择指令"视为匹配，避免
 * "第二个颜色再深一点"这类描述被误触发。语义（"蓝色那个"）不匹配，留给 agent。
 * 支持：「第二个 / 用第二个 / 选方案2 / 要 p3 / 方案2 / p2」和「#2574F4 / 用#2574F4」。
 */
export function matchPaletteIntent(
  text: string,
  proposals: Palette[]
): { id: string; index: number } | null {
  if (!text || proposals.length === 0) return null;
  const t = text.trim();

  // 方案号：整条消息是一个选择指令
  const reNum =
    /^\s*(?:用|选|就要?|要|来)?\s*(?:第\s*([1-6一二三四五六])\s*[个套]?|方案\s*([1-6])|p\s*([1-6]))\s*[。.!！~]?\s*$/i;
  const m = t.match(reNum);
  if (m) {
    const raw = m[1] ?? m[2] ?? m[3];
    const idx = raw ? parseIdx(raw) : null;
    if (idx !== null && idx >= 1 && idx <= proposals.length) {
      return { id: proposals[idx - 1].id, index: idx - 1 };
    }
  }

  // hex：整条消息基本是一个 hex（+ 可选动词/标点）
  const reHex = /^\s*(?:用|选|要)?\s*(#[0-9a-fA-F]{6})\s*[。.!！~]?\s*$/;
  const mh = t.match(reHex);
  if (mh) {
    try {
      const target = normalizeHex(mh[1]).toUpperCase();
      for (let i = 0; i < proposals.length; i++) {
        const c = proposals[i].colors;
        const vals = [
          c.primary,
          c.secondary,
          c.accent,
          c.neutral,
          c.foreground,
          c.background,
        ];
        if (vals.some((v) => v.toUpperCase() === target)) {
          return { id: proposals[i].id, index: i };
        }
      }
    } catch {
      /* 非法 hex，忽略 */
    }
  }

  return null;
}
