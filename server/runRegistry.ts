// ============================================================
// runRegistry.ts — 服务端 agent 运行状态 + WS 订阅注册表
//
// 职责：
// - 跟踪每个 project 当前是否有 agent 在跑（RunState）
// - 维护每个 project 的 WS 订阅者集合（多 tab / 多 client 共享同一份状态）
// - 提供 broadcast helper：把消息推给某 project 的所有订阅者
// - 提供 subscribe helper：新订阅者立即收到当前 RunState（重连恢复机制）
//
// 关键不变量：
// - 同一 project 同时只允许一个 agent 跑（hasRun 用于并发保护）
// - 内存态：服务重启 = 状态清空（agent 子进程也会被杀，一致）
// - 所有广播走 broadcast(projectId, msg)，原 ws 单播模式废弃
//
// 该模块无副作用 import，所有状态在模块级 Map 里。
// ============================================================

import type { WebSocket } from "ws";

// ── 阶段 ──
// thinking:     agent 启动后还没吐第一个 token / turn 之间的间隙
// streaming:    text_delta 正在到达
// tool_calling: assistant 已 emit tool_use 块，等待 tool_result
// complete:     agent 正常结束
// error:        agent 异常结束
export type RunPhase =
  | "thinking"
  | "streaming"
  | "tool_calling"
  | "complete"
  | "error";

export interface RunState {
  runId: string;
  projectId: string;
  phase: RunPhase;
  startedAt: number;
  // 累加的 assistant 文本——刷新页面后客户端能从这里读到当前已生成的部分
  streamedText: string;
  currentTool?: {
    toolCallId: string;
    toolName: string;
    status: "running" | "complete" | "error";
  };
}

// 给 WS 协议用的 outbound shape（与 wsHandler.ts 共享）
export interface AgentStatePayload {
  runId: string;
  projectId: string;
  phase: RunPhase;
  startedAt: number;
  streamedText: string;
  currentTool?: {
    toolCallId: string;
    toolName: string;
    status: "running" | "complete" | "error";
  };
}

// ── 内部状态 ──
// 1 project → 1 RunState（并发保护：hasRun 检查）
const runs = new Map<string, RunState>();
// 1 project → 订阅者 ws 集合（多 tab 都在订阅同一 project）
const subscribers = new Map<string, Set<WebSocket>>();

// 反向索引：ws → 当前订阅的 project（每个 ws 只同时订阅一个 project）
// 用于 ws close 时 O(1) 找到要清理的 project
const wsToProject = new WeakMap<WebSocket, string>();

// ── 序列化 ──
// RunState → 协议 payload（截掉未来可能加的内部字段）
function toPayload(rs: RunState): AgentStatePayload {
  return {
    runId: rs.runId,
    projectId: rs.projectId,
    phase: rs.phase,
    startedAt: rs.startedAt,
    streamedText: rs.streamedText,
    currentTool: rs.currentTool,
  };
}

// ── 订阅 ──
// sendFn 由 wsHandler 注入（避免循环依赖），签名是 wsHandler.ts 里那个 send helper。
// 类型用宽泛的 { type: string; payload: unknown } —— 实际是 ServerResponse。
export function subscribe(
  ws: WebSocket,
  projectId: string,
  sendFn: (ws: WebSocket, msg: { type: string; payload: unknown }) => void
): void {
  // 先从旧 project 移除（切项目场景）
  const old = wsToProject.get(ws);
  if (old && old !== projectId) {
    const oldSet = subscribers.get(old);
    if (oldSet) {
      oldSet.delete(ws);
      if (oldSet.size === 0) subscribers.delete(old);
    }
  }

  // 加入新 project
  let set = subscribers.get(projectId);
  if (!set) {
    set = new Set();
    subscribers.set(projectId, set);
  }
  set.add(ws);
  wsToProject.set(ws, projectId);

  // 立即推送当前 RunState（重连恢复机制的关键）
  const rs = runs.get(projectId);
  // 双重断言：runRegistry 不依赖 wsHandler 的 ServerResponse 类型；
  // 实际运行时就是普通 JSON 对象
  sendFn(ws, {
    type: "agent_state",
    payload: rs ? toPayload(rs) : null,
  } as { type: string; payload: unknown });
}

// ── ws close 时调用 ──
// 从所有它订阅过的 project 集合里移除（用反向索引 O(1)）
export function unsubscribeWs(ws: WebSocket): void {
  const pid = wsToProject.get(ws);
  if (!pid) return;
  const set = subscribers.get(pid);
  if (set) {
    set.delete(ws);
    if (set.size === 0) subscribers.delete(pid);
  }
  wsToProject.delete(ws);
}

// ── Run 生命周期 ──
export function hasRun(projectId: string): boolean {
  return runs.has(projectId);
}

export function startRun(projectId: string, runId: string): RunState {
  const rs: RunState = {
    runId,
    projectId,
    phase: "thinking",
    startedAt: Date.now(),
    streamedText: "",
  };
  runs.set(projectId, rs);
  broadcast(projectId, { type: "agent_state", payload: toPayload(rs) });
  return rs;
}

export function endRun(projectId: string): void {
  runs.delete(projectId);
  // 推 null 表示 "no active run"
  broadcast(projectId, { type: "agent_state", payload: null });
}

// 在 done 之前先 broadcast 一次 complete，让 UI 能看到 "完成" 一瞬
export function updatePhase(
  projectId: string,
  phase: RunPhase,
  patch?: Partial<RunState>
): void {
  const rs = runs.get(projectId);
  if (!rs) return;
  rs.phase = phase;
  if (patch) Object.assign(rs, patch);
  broadcast(projectId, { type: "agent_state", payload: toPayload(rs) });
}

export function appendRunText(projectId: string, delta: string): void {
  const rs = runs.get(projectId);
  if (!rs) return;
  rs.streamedText += delta;
}

export function getRun(projectId: string): RunState | undefined {
  return runs.get(projectId);
}

// ── 广播 ──
// 把 msg 发给某 project 的所有订阅者。dead ws 自动跳过。
export function broadcast(
  projectId: string,
  msg: { type: string; payload: unknown }
): void {
  const set = subscribers.get(projectId);
  if (!set || set.size === 0) return;
  const json = JSON.stringify(msg);
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) {
      ws.send(json);
    }
  }
}
