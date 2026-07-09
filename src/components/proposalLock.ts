// ============================================================
// proposalLock.ts — 提案选择器「已过期」上下文
//
// 配色/字体选择器在用户确认或「换一批」后应当锁定、不可再点。仅靠组件
// local state 的话刷新页面会丢失，所以额外用一个从持久化消息派生的信号：
// **当前 assistant 消息不是对话最后一条消息时，视为「已过期」**——因为
// 用户确认/换一批都会发出一条新消息，让本提案消息不再是最后一条。
//
// AssistantBubble 计算该布尔值后通过 Provider 注入；选择器用
// useProposalStale() 读取，与自身 local `used` 状态取或，得到最终 locked。
// ============================================================

import { createContext, useContext } from "react";

export const ProposalStaleContext = createContext(false);

export function useProposalStale(): boolean {
  return useContext(ProposalStaleContext);
}
