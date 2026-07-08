// ============================================================
// googleFonts.ts — Google Fonts 工具函数（共享 frontend ↔ server）
//
// 纯函数 + 静态数据，无浏览器 API。可安全引入 server 端 tsconfig。
// ============================================================

import FONT_CATALOG from "../data/googleFonts.json";

// ------------------------------------------------------------
// 类型
// ------------------------------------------------------------

export type FontCategory =
  | "serif"
  | "sans-serif"
  | "display"
  | "handwriting"
  | "monospace";

export interface GoogleFont {
  family: string;
  category: FontCategory;
  variants: string[];
  popularity: number;
}

// ------------------------------------------------------------
// 静态字体目录（按 popularity 升序排列，0 = 最热门）
// ------------------------------------------------------------

export const POPULAR_FONTS: GoogleFont[] =
  FONT_CATALOG as GoogleFont[];

// 分类 label 映射
export const CATEGORY_LABELS: Record<FontCategory, string> = {
  serif: "Serif · 衬线",
  "sans-serif": "Sans Serif · 无衬线",
  display: "Display · 展示",
  handwriting: "Handwriting · 手写",
  monospace: "Monospace · 等宽",
};

// ------------------------------------------------------------
// 搜索
// ------------------------------------------------------------

/**
 * 按字体名模糊搜索，支持按分类过滤。
 * @param query   搜索词（匹配 family 字段，大小写不敏感）
 * @param category 可选分类过滤
 * @param limit   返回上限（默认 10）
 */
export function searchFonts(
  query: string,
  category?: FontCategory,
  limit = 10
): GoogleFont[] {
  const q = query.toLowerCase().trim();
  let results: GoogleFont[];

  if (!q) {
    // 空查询：返回该分类下最热门的字体
    results = [...POPULAR_FONTS];
    if (category) {
      results = results.filter((f) => f.category === category);
    }
    results.sort((a, b) => a.popularity - b.popularity);
    return results.slice(0, limit);
  }

  // 先做精确前缀匹配（权重高），再做包含匹配
  const prefix: GoogleFont[] = [];
  const contains: GoogleFont[] = [];

  for (const font of POPULAR_FONTS) {
    if (category && font.category !== category) continue;

    const lower = font.family.toLowerCase();
    if (lower === q) {
      // 精确匹配放最前面
      prefix.unshift(font);
    } else if (lower.startsWith(q)) {
      prefix.push(font);
    } else if (lower.includes(q)) {
      contains.push(font);
    }
  }

  results = [...prefix, ...contains];
  // 同一优先级内按 popularity 排
  return results.slice(0, limit);
}

/**
 * 返回所有不重复的字体分类。
 */
export function getFontCategories(): FontCategory[] {
  const set = new Set(POPULAR_FONTS.map((f) => f.category));
  return Array.from(set).sort();
}
