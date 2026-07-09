// ============================================================
// gifEncoder.worker.ts — 在 Web Worker 中执行 GIF 编码
//
// encodeGif 是 CPU 密集的纯计算（逐帧像素量化 + LZW），放到 worker 里
// 跑可以避免导出期间阻塞主线程 / 冻结 UI。主线程通过 postMessage 把帧
// 的像素 buffer 零拷贝转移（transfer）进来，编码完成后再把结果转回。
// ============================================================

import { encodeGif, type GifFrame } from "./gifEncoder";

interface EncodeRequest {
  frames: GifFrame[];
  width: number;
  height: number;
}

// 不引用 webworker lib（会与 DOM lib 的全局符号冲突），用自定义接口断言
// self，保持 typecheck 友好。运行时 self 即 DedicatedWorkerGlobalScope。
interface WorkerScope {
  onmessage: ((e: MessageEvent<EncodeRequest>) => void) | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
}

const ctx = self as unknown as WorkerScope;

ctx.onmessage = (e) => {
  const { frames, width, height } = e.data;
  try {
    const out = encodeGif(frames, width, height);
    ctx.postMessage(out, [out.buffer]);
  } catch (err) {
    ctx.postMessage({
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
