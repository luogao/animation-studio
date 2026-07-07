// ============================================================
// exportMedia.ts — 导出动画为视频（WebM）或 GIF
//
// 工作流：
// 1. 从 DOM 取 SVG 元素，从 previewStore 取 timeline controller
// 2. 逐帧 seek timeline → render SVG → canvas → ImageData
// 3. 编码输出（MediaRecorder → WebM / gifEncoder → GIF）
// ============================================================

import type { SceneConfig } from "../types/scene";
import { encodeGif, type GifFrame } from "./gifEncoder";
import { usePreviewStore } from "../store/previewStore";

// ------------------------------------------------------------
// SVG → Canvas 渲染
// ------------------------------------------------------------

function svgToCanvas(
  svgEl: SVGSVGElement,
  width: number,
  height: number
): Promise<ImageData> {
  // 克隆 SVG 并移除编辑模式专属元素（选取框、点击热区等），
  // 避免导出文件中出现 data-edit-only 标记的 UI 叠加层。
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-edit-only="true"]').forEach((el) => el.remove());

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const svgData = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgData], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(ctx.getImageData(0, 0, width, height));
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
  onProgress?: (current: number, total: number) => void
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

    const frame = await svgToCanvas(svgEl, config.width, config.height);
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
  svgEl: SVGSVGElement,
  config: SceneConfig,
  onProgress?: (phase: string) => void
): Promise<void> {
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

export async function exportGif(
  svgEl: SVGSVGElement,
  config: SceneConfig,
  onProgress?: (phase: string) => void
): Promise<void> {
  const fps = 15; // GIF 用较低帧率控制体积
  onProgress?.(`渲染 ${Math.ceil(config.duration * fps)} 帧...`);

  const frames = await captureFrames(svgEl, config, fps, (cur, total) => {
    if (cur % 10 === 0 || cur === total) {
      onProgress?.(`渲染中 ${cur}/${total}`);
    }
  });

  onProgress?.("编码 GIF...");

  const delayCs = Math.round(100 / fps); // 百分之一秒
  const gifFrames: GifFrame[] = frames.map((data) => ({
    data,
    delayCs,
  }));

  const gifData = encodeGif(gifFrames, config.width, config.height);
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
