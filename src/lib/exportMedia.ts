// ============================================================
// exportMedia.ts — 导出动画为视频（WebM）或 GIF
//
// 工作流：
// 1. 通过 [data-canvas] 定位画布 SVG（避免误选页面里的图标 svg）
// 2. 从 previewStore 取 timeline controller
// 3. 逐帧 seek timeline → 克隆 SVG → 栅格化到 canvas → ImageData
// 4. 编码输出（MediaRecorder → WebM / gifEncoder → GIF）
// ============================================================

import type { SceneConfig } from "../types/scene";
import { type GifFrame } from "./gifEncoder";
import { usePreviewStore } from "../store/previewStore";

// ------------------------------------------------------------
// 定位画布 SVG
// ------------------------------------------------------------
// ⚠️ 不能用 document.querySelector("svg")：页面里大量 lucide 图标都是
// <svg>，且在 DOM 中排在画布之前，querySelector 只会取到第一个图标，
// 把它当成画布拉伸导出 → 画面全黑。画布 SVG 在 DynamicScene 上标记了
// data-canvas="true"，用它来精确定位。
function getCanvasSvg(): SVGSVGElement {
  const svg = document.querySelector<SVGSVGElement>('svg[data-canvas="true"]');
  if (!svg) {
    throw new Error("找不到画布，请先打开预览后再导出");
  }
  return svg;
}

// ------------------------------------------------------------
// SVG → Canvas 渲染
// ------------------------------------------------------------

function svgToCanvas(
  svgEl: SVGSVGElement,
  width: number,
  height: number,
  background: string,
  scale = 1
): Promise<ImageData> {
  // 克隆 SVG 并移除编辑模式专属元素（选取框、点击热区等），
  // 避免导出文件中出现 data-edit-only 标记的 UI 叠加层。
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-edit-only="true"]').forEach((el) => el.remove());

  // 实际栅格化尺寸：scale<1 时降采样（GIF 用，控制体积与编码耗时）。
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);

  // SVG 根元素的 CSS background 在「SVG 作为图片」栅格化时，不同浏览器
  // 行为不一致（部分浏览器不会绘制根 SVG 的 CSS 背景）。这里显式插入一个
  // 铺满的 <rect> 作为背景，保证背景在导出里始终可见、跨浏览器一致。
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(outW));
  clone.setAttribute("height", String(outH));
  const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bgRect.setAttribute("width", "100%");
  bgRect.setAttribute("height", "100%");
  bgRect.setAttribute("fill", background);
  clone.insertBefore(bgRect, clone.firstChild);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;

  const svgData = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgData], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, outW, outH);
      URL.revokeObjectURL(url);
      resolve(ctx.getImageData(0, 0, outW, outH));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG render failed"));
    };
    img.src = url;
  });
}

// ------------------------------------------------------------
// 逐帧渲染
// ------------------------------------------------------------

async function captureFrames(
  svgEl: SVGSVGElement,
  config: SceneConfig,
  fps: number,
  onProgress?: (current: number, total: number) => void,
  scale = 1
): Promise<ImageData[]> {
  const controller = usePreviewStore.getState().timelineController;
  if (!controller) throw new Error("Timeline 未就绪，请先播放动画后再导出");

  const totalFrames = Math.ceil(config.duration * fps);
  const frames: ImageData[] = [];

  // 暂停播放
  controller.pause();

  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps;
    controller.seek(t);

    // 等待一微 tick 让 GSAP 完成同步更新（seek 已是同步，保险起见）
    await new Promise((r) => setTimeout(r, 0));

    const frame = await svgToCanvas(
      svgEl,
      config.width,
      config.height,
      config.background,
      scale
    );
    frames.push(frame);
    onProgress?.(i + 1, totalFrames);
  }

  // 恢复到起始位置
  controller.seek(0);

  return frames;
}

// ------------------------------------------------------------
// 导出 WebM 视频
// ------------------------------------------------------------

export async function exportVideo(
  config: SceneConfig,
  onProgress?: (phase: string) => void
): Promise<void> {
  const svgEl = getCanvasSvg();
  const fps = 30;
  onProgress?.(`渲染 ${Math.ceil(config.duration * fps)} 帧...`);

  const frames = await captureFrames(svgEl, config, fps, (cur, total) => {
    if (cur % 30 === 0 || cur === total) {
      onProgress?.(`渲染中 ${cur}/${total}`);
    }
  });

  onProgress?.("编码视频...");

  const canvas = document.createElement("canvas");
  canvas.width = config.width;
  canvas.height = config.height;
  const ctx = canvas.getContext("2d")!;

  const stream = canvas.captureStream(fps);
  // 尝试 VP9，fallback 到浏览器默认
  let mimeType = "video/webm;codecs=vp9";
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = "video/webm;codecs=vp8";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = "video/webm";
    }
  }

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 5_000_000,
  });

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<void>((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      downloadBlob(blob, `${slug(config)}.webm`);
      resolve();
    };
  });

  recorder.start();

  // 逐帧写入 canvas（MediaRecorder 实时捕获）
  const frameInterval = 1000 / fps;
  let frameIdx = 0;

  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (frameIdx >= frames.length) {
        clearInterval(interval);
        recorder.stop();
        resolve();
        return;
      }
      ctx.putImageData(frames[frameIdx], 0, 0);
      frameIdx++;
    }, frameInterval);
  });

  await done;
}

// ------------------------------------------------------------
// 导出 GIF
// ------------------------------------------------------------

// GIF 最大边长：GIF 是 256 色格式，原分辨率（如 1440×810）会导致体积爆炸 +
// 编码极慢，且 256 色在大画布上画质并无提升。导出时按比例缩到不超过此边长，
// 同时显著降低编码耗时。
const GIF_MAX_DIM = 720;

// 复用单个 GIF 编码 worker，避免每次导出都重建（省去 worker 启动开销）。
let gifWorker: Worker | null = null;
function getGifWorker(): Worker {
  if (!gifWorker) {
    gifWorker = new Worker(new URL("./gifEncoder.worker.ts", import.meta.url), {
      type: "module",
    });
  }
  return gifWorker;
}

// 把 GIF 编码派发到 worker，避免阻塞主线程。
async function encodeGifInWorker(
  frames: GifFrame[],
  width: number,
  height: number
): Promise<Uint8Array> {
  const worker = getGifWorker();
  return new Promise<Uint8Array>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      const data = e.data;
      if (data && typeof data === "object" && "error" in data) {
        reject(new Error(String((data as { error: unknown }).error)));
      } else {
        resolve(data as Uint8Array);
      }
    };
    worker.onerror = () => reject(new Error("GIF 编码失败"));
    // 零拷贝转移每帧像素 buffer（导出后主线程不再需要这些帧数据）
    const transfer = frames.map((f) => f.data.data.buffer);
    worker.postMessage({ frames, width, height }, transfer);
  });
}

export async function exportGif(
  config: SceneConfig,
  onProgress?: (phase: string) => void
): Promise<void> {
  const svgEl = getCanvasSvg();
  const fps = 15; // GIF 用较低帧率控制体积
  const scale = Math.min(1, GIF_MAX_DIM / Math.max(config.width, config.height));
  const outW = Math.round(config.width * scale);
  const outH = Math.round(config.height * scale);
  onProgress?.(`渲染 ${Math.ceil(config.duration * fps)} 帧 (${outW}×${outH})...`);

  const frames = await captureFrames(
    svgEl,
    config,
    fps,
    (cur, total) => {
      if (cur % 10 === 0 || cur === total) {
        onProgress?.(`渲染中 ${cur}/${total}`);
      }
    },
    scale
  );

  onProgress?.("编码 GIF...");

  const delayCs = Math.round(100 / fps); // 百分之一秒
  const gifFrames: GifFrame[] = frames.map((data) => ({
    data,
    delayCs,
  }));

  const gifData = await encodeGifInWorker(gifFrames, outW, outH);
  const blob = new Blob([gifData.buffer as ArrayBuffer], { type: "image/gif" });
  downloadBlob(blob, `${slug(config)}.gif`);
}

// ------------------------------------------------------------
// 工具
// ------------------------------------------------------------

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function slug(config: SceneConfig): string {
  // 从第一个 text actor 的 label 取文件名灵感
  const textActor = config.actors.find(
    (a) => a.type === "text" && a.label && a.label.length > 2
  );
  const base = textActor?.label?.replace(/[^a-zA-Z0-9一-龥]+/g, "-") ?? "animation";
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${base}-${ts}`;
}
