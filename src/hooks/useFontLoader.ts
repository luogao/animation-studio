// ============================================================
// useFontLoader.ts — 动态加载 Google Fonts CSS
//
// 根据 config.fonts 数组，按需在 <head> 中注入/移除
// Google Fonts CSS v2 <link> 标签。无需 API key。
// 每个字体加载常用字重：400, 500, 700, 900。
// ============================================================

import { useEffect, useRef } from "react";

// 常用字重集合（覆盖面广，避免过度加载）
const DEFAULT_WEIGHTS = "400;500;700;900";

/**
 * 构造 Google Fonts CSS v2 URL。
 * 格式：https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap
 */
function buildFontUrl(family: string): string {
  const encoded = family.replace(/ /g, "+");
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@${DEFAULT_WEIGHTS}&display=swap`;
}

/**
 * 根据 SceneConfig.fonts 动态加载/卸载 Google Fonts。
 * - 对 fonts 数组中的每个字体，若尚未加载则在 <head> 中创建 <link> 标签
 * - 已加载的字体不会重复创建（通过 data-font-family 属性追踪）
 * - 当 fonts 变化时，不在新列表中的字体会被移除
 *
 * @param fonts 要加载的 Google Font 字体名数组（来自 SceneConfig.fonts）
 */
export function useFontLoader(fonts?: string[]): void {
  const loadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!fonts || fonts.length === 0) {
      // 没有要加载的字体：移除所有已加载的
      for (const family of loadedRef.current) {
        removeFontLink(family);
      }
      loadedRef.current.clear();
      return;
    }

    const wanted = new Set(fonts);
    const loaded = loadedRef.current;

    // 移除不再需要的字体
    for (const family of loaded) {
      if (!wanted.has(family)) {
        removeFontLink(family);
      }
    }
    // 同步 ref
    loadedRef.current = new Set(
      [...loaded].filter((f) => wanted.has(f))
    );

    // 加载新字体
    for (const family of wanted) {
      if (!loadedRef.current.has(family)) {
        loadFontLink(family);
        loadedRef.current.add(family);
      }
    }
  }, [fonts]);
}

// ------------------------------------------------------------
// DOM 操作工具
// ------------------------------------------------------------

function loadFontLink(family: string): void {
  // 避免并发创建同一个
  if (document.querySelector(`link[data-font-family="${CSS.escape(family)}"]`)) {
    return;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = buildFontUrl(family);
  link.setAttribute("data-font-family", family);
  document.head.appendChild(link);
}

function removeFontLink(family: string): void {
  const el = document.querySelector(`link[data-font-family="${CSS.escape(family)}"]`);
  if (el) {
    el.remove();
  }
}
