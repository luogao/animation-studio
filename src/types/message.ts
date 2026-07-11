// ============================================================
// message.ts — 对话消息附件的共享类型（前端 + 服务端共用）
//
// 放在 src/types/ 下：tsconfig.server.json 覆盖 src/types/，服务端可直接
// import，避免在 server 侧重复定义导致 drift。
// ============================================================

/**
 * 用户消息携带的附件。当前只支持图片。
 * - url: 同源 /uploads/... 或 data URI（导出时 /uploads/ 会被内联成 data URI）
 * - width/height: 原始像素尺寸，供 agent 排版 + 渲染层回填
 */
export interface MessageAttachment {
  type: "image";
  url: string;
  width: number;
  height: number;
}
