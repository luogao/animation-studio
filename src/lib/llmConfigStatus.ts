// ============================================================
// llmConfigStatus.ts — LLM 配置就绪状态（带缓存的同步查询）
//
// 职责：
// - 提供同步的 isLlmConfigured() 供发对话前的拦截判断
// - 后台异步 refreshLlmConfigStatus() 拉取 /api/llm-config 并缓存
// - 配置变更后（LlmConfigDialog 保存成功 / 收到 OPEN 事件）刷新缓存
//
// 为什么不直接在 sendMessage 里 await fetch：
// - 发对话前同步拦截，避免先 push 了 user 消息占位再回滚
// - 多处（拦截 + 兜底）共享同一份缓存，避免重复请求
//
// 缓存语义：未知时（首次加载前）乐观视为「已配置」，让后端兜底接管，
// 避免网络慢时误拦截已配置用户。只有明确拉到「缺 apiKey 或 model」才拦。
// ============================================================

interface LlmConfig {
  model: string;
  apiKey: string;
  baseUrl: string;
}

// 三态：unknown（未加载）/ ready / not-ready
type Status = "unknown" | "ready" | "not-ready";

let status: Status = "unknown";
let refreshPromise: Promise<void> | null = null;

/** 同步查询：当前 LLM 是否已配置（apiKey + model 都有）。
 *  unknown 时乐观返回 true，交给后端兜底。 */
export function isLlmConfigured(): boolean {
  return status !== "not-ready";
}

/** 异步刷新缓存。幂等：并发调用复用同一个 promise。 */
export function refreshLlmConfigStatus(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetch("/api/llm-config")
    .then((r) => r.json())
    .then((data: Partial<LlmConfig>) => {
      const cfg = data ?? {};
      status = cfg.apiKey && cfg.model ? "ready" : "not-ready";
    })
    .catch(() => {
      // 拉取失败：保持 unknown（乐观），不因网络抖动误拦
      status = "unknown";
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

/** 重置为未知（配置对话框打开重新填时调用，强制下次重新判断） */
export function invalidateLlmConfigStatus(): void {
  status = "unknown";
}
