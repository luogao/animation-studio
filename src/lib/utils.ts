// ============================================================
// utils.ts — shadcn 标配的 cn() 工具
// 合并 className 并解决 tailwind-merge 冲突
// ============================================================

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
