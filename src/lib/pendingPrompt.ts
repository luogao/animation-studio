// ============================================================
// pendingPrompt.ts — 跨页传递首页 Hero 输入的待发 prompt
//
// 首页 HomePage 的 Hero 输入框，用户填了描述点"开始创作"后，需要把
// 这段描述作为第一条对话发给 agent。但发消息的前置条件（项目 loadProject
// 完成 + WS 就绪 + 合法 baseVersionId）只有进入 StudioPage 后才满足，
// 所以 HomePage 只负责：创建项目 → 把 {projectId, prompt} 暂存到
// sessionStorage → 跳转。StudioPage 在项目加载完成后消费并自动发送。
//
// 设计要点：
// - sessionStorage（非 localStorage）：限当前 tab，刷新保留、新 tab 不带，
//   避免污染其他会话或被长期残留。
// - 绑定 projectId：只有进入"刚创建的那个项目"才发；用户中途手动切到
//   别的项目不会误发。
// - consumePendingPrompt 读取即删除：天然防重复 —— React StrictMode 双
//   调用 / effect 重跑时，第二次读到 null 直接退出，同一条 prompt 只发一次。
// ============================================================

const KEY = "studio:pendingHeroPrompt";

export interface PendingPrompt {
  projectId: string;
  prompt: string;
}

export function setPendingPrompt(p: PendingPrompt): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // sessionStorage 不可用（隐私模式等）时静默降级 —— 最坏情况是用户
    // 需要在编辑页重新输入一次，不影响主流程。
  }
}

function readPending(): PendingPrompt | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingPrompt;
  } catch {
    return null;
  }
}

/** 仅查看，不删除。StudioPage 用它决定是否进入"自动发送"loading。 */
export function peekPendingPrompt(projectId: string): string | null {
  const p = readPending();
  if (!p || p.projectId !== projectId) return null;
  return p.prompt;
}

/** 读取并立即删除 —— 发送前的幂等守卫，保证同一条 prompt 只发一次。 */
export function consumePendingPrompt(projectId: string): string | null {
  const p = readPending();
  if (!p || p.projectId !== projectId) return null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return p.prompt;
}
