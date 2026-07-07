// ============================================================
// selectionHelpers.ts — 选取框共享工具函数
//
// - getActorBounds: 根据 actor 类型计算边界框尺寸
// - formatSelectionContext: 生成注入 agent 消息的选中上下文
// ============================================================

import type { Actor } from "../types/scene";

// 默认尺寸（与 ActorRenderer.tsx 保持一致）
const DEFAULT_BOX_W = 120;
const DEFAULT_BOX_H = 60;
const DEFAULT_CIRCLE_D = 60;
const DEFAULT_GATE_W = 30;
const DEFAULT_GATE_H = 80;

export interface ActorBounds {
  w: number;
  h: number;
}

/**
 * 根据 actor 类型返回其边界框尺寸（本地坐标系）。
 * 用于选取框的 hit-test rect 和选中指示器的尺寸计算。
 */
export function getActorBounds(actor: Actor): ActorBounds {
  switch (actor.type) {
    case "box":
    case "diamond":
      return { w: actor.width ?? DEFAULT_BOX_W, h: actor.height ?? DEFAULT_BOX_H };
    case "circle": {
      const d = actor.width ?? DEFAULT_CIRCLE_D;
      return { w: d, h: d };
    }
    case "gate":
      return { w: actor.width ?? DEFAULT_GATE_W, h: actor.height ?? DEFAULT_GATE_H };
    case "text": {
      const w =
        actor.width ??
        estimateTextWidth(actor.label, actor.fontSize ?? 14);
      return { w, h: actor.height ?? DEFAULT_BOX_H };
    }
    default:
      return { w: DEFAULT_BOX_W, h: DEFAULT_BOX_H };
  }
}

/** 估算文本宽度（粗略启发式，精确可用 canvas.measureText） */
function estimateTextWidth(
  label: string | undefined,
  fontSize: number
): number {
  if (!label) return 120; // 空文本用默认宽度
  // 中文字符 ≈ fontSize px，英文 ≈ fontSize * 0.55 px
  let w = 0;
  for (const ch of label) {
    // 粗略判断：CJK 字符范围
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified
      (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
      (code >= 0x3000 && code <= 0x303f) || // CJK Symbols
      (code >= 0xff00 && code <= 0xffef) || // Halfwidth/Fullwidth
      (code >= 0x2e80 && code <= 0x2eff)    // CJK Radicals
    ) {
      w += fontSize;
    } else {
      w += fontSize * 0.55;
    }
  }
  return Math.max(w + 16, 60); // 至少 60px，加一些 padding
}

/**
 * 生成选中元素上下文块，注入到用户消息前发送给 agent。
 * 返回空字符串表示没有选中元素。
 */
export function formatSelectionContext(actors: Actor[]): string {
  if (actors.length === 0) return "";

  const lines = actors.map((a) => {
    const bounds = getActorBounds(a);
    const parts: string[] = [];
    parts.push(`- actor "${a.id}" (${a.type}`);
    if (a.label) parts.push(`, 标签: "${a.label}"`);
    parts.push(`, 位置: ${a.x},${a.y}`);
    // text 类型的尺寸是估算的，可能不准确，跳过
    if (a.type !== "text") {
      parts.push(`, 尺寸: ${Math.round(bounds.w)}x${Math.round(bounds.h)}`);
    }
    parts.push(")");
    return parts.join("");
  });

  return `[用户选中了以下元素:\n${lines.join("\n")}]`;
}
