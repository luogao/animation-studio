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
import {
  Output,
  BufferTarget,
  Mp4OutputFormat,
  CanvasSource,
  QUALITY_HIGH,
  getFirstEncodableVideoCodec,
} from "mediabunny";

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

// foreignObject → SVG <text>：导出防 canvas 污染
//
// text actor 经 <foreignObject> 渲染 HTML 文字（SplitText 只能拆 HTML，不支持
// SVG <text>）。但 SVG 经 <img>+drawImage 栅格化时，含 <foreignObject> 会让
// canvas 被浏览器标记为 tainted（origin-unclean），随后 getImageData /
// putImageData 全部抛 SecurityError —— 即任何带文字的场景都导不出。这里在
// 栅格化前把所有 foreignObject 替换成等价纯 SVG <text>，根除污染源。
//
// 克隆节点不在 DOM 中、没有布局，位置/字号必须从原始 svgEl 读取；逐帧 seek
// 后原始 DOM 的 SplitText 字符已同步到该帧状态，所以逐字动画在导出里得以保留。
function replaceTextForeignObjects(
  originalSvg: SVGSVGElement,
  clone: SVGSVGElement
): void {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const svgRect = originalSvg.getBoundingClientRect();
  // 视口 CSS 像素 → SVG user unit 的缩放（PreviewCanvas 常把 1440×810 缩放显示）
  const vb = originalSvg.viewBox.baseVal;
  const sx =
    svgRect.width > 0
      ? ((vb && vb.width) || originalSvg.width.baseVal.value) / svgRect.width
      : 1;
  const sy =
    svgRect.height > 0
      ? ((vb && vb.height) || originalSvg.height.baseVal.value) / svgRect.height
      : 1;

  const cloneFos = Array.from(
    clone.querySelectorAll('foreignObject[data-actor-part="text"]')
  );
  const origFos = Array.from(
    originalSvg.querySelectorAll('foreignObject[data-actor-part="text"]')
  );

  cloneFos.forEach((foClone, i) => {
    const foOrig = origFos[i];
    const parent = foClone.parentNode;
    if (!parent) return;

    const frag = document.createDocumentFragment();
    if (foOrig) {
      const root = foOrig.querySelector("[data-text-root]") as HTMLElement | null;
      if (root) {
        const cs = getComputedStyle(root);
        const fontSize = parseFloat(cs.fontSize) || 14;
        const fill = cs.color || "#ffffff";
        const fontWeight = cs.fontWeight || "400";
        const fontFamily = cs.fontFamily || "sans-serif";

        const toX = (clientX: number) => (clientX - svgRect.left) * sx;
        const toY = (clientY: number) => (clientY - svgRect.top) * sy;

        const makeText = (
          box: DOMRect,
          textContent: string,
          opacity: string
        ): SVGTextElement => {
          const t = document.createElementNS(SVG_NS, "text");
          t.setAttribute("x", String(toX(box.left)));
          // dominant-baseline:middle → y 用字符盒子垂直中心，匹配 flex 垂直居中
          t.setAttribute("y", String(toY(box.top + box.height / 2)));
          t.setAttribute("fill", fill);
          t.setAttribute("font-size", String(fontSize));
          t.setAttribute("font-weight", String(fontWeight));
          t.setAttribute("font-family", fontFamily);
          t.setAttribute("dominant-baseline", "middle");
          t.setAttribute("text-anchor", "start");
          if (opacity && opacity !== "1") t.setAttribute("opacity", opacity);
          t.textContent = textContent;
          return t;
        };

        // SplitText 拆分：逐字/逐词，每个子元素有各自的盒子（含 gsap 设的位移），
        // 逐个生成 <text>，保留该帧的逐字动画位置。
        const splits = foOrig.querySelectorAll(".split-char, .split-word");
        if (splits.length > 0) {
          splits.forEach((node) => {
            const el = node as HTMLElement;
            frag.appendChild(
              makeText(
                el.getBoundingClientRect(),
                el.textContent || "",
                el.style.opacity
              )
            );
          });
        } else {
          frag.appendChild(
            makeText(
              root.getBoundingClientRect(),
              root.textContent || "",
              root.style.opacity
            )
          );
        }
      }
    }
    // 用生成的 <text> 替换 foreignObject；异常分支 frag 为空 → 等于移除该文字，
    // 但绝不能残留 foreignObject，否则仍会 taint 整个画布。
    parent.replaceChild(frag, foClone);
  });
}

// 把某一帧的 SVG 渲染到给定 ctx（不新建 canvas）。
// GIF/WebM 经 svgToCanvas 包一层拿 ImageData；MP4 直接画到固定 canvas
// 喂给 mediabunny（流式，省内存）。
async function drawSvgFrame(
  svgEl: SVGSVGElement,
  width: number,
  height: number,
  background: string,
  ctx: CanvasRenderingContext2D,
  scale = 1
): Promise<void> {
  // 克隆 SVG 并移除编辑模式专属元素（选取框、点击热区等），
  // 避免导出文件中出现 data-edit-only 标记的 UI 叠加层。
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-edit-only="true"]').forEach((el) => el.remove());

  // text actor 经 <foreignObject> 渲染；含 foreignObject 的 SVG 经 <img>+drawImage
  // 栅格化会让 canvas 被 tainted，随后的 getImageData 抛 SecurityError。导出前把
  // 所有 foreignObject 换成等价 SVG <text>，根除污染源（GIF/WebM/MP4 全受益）。
  replaceTextForeignObjects(svgEl, clone);

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

  const svgData = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgData], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, outW, outH);
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG render failed"));
    };
    img.src = url;
  });
}

function svgToCanvas(
  svgEl: SVGSVGElement,
  width: number,
  height: number,
  background: string,
  scale = 1
): Promise<ImageData> {
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;
  return drawSvgFrame(svgEl, width, height, background, ctx, scale).then(() =>
    ctx.getImageData(0, 0, outW, outH)
  );
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
// 导出 MP4 视频（H.264，WebCodecs via mediabunny）
// ------------------------------------------------------------
//
// 与 WebM/GIF 的关键差异：
// - 不预渲染全部帧到内存，而是流式：seek 一帧 → 画到 canvas → 喂给 mediabunny
//   的 CanvasSource。CanvasSource 内部跑 WebCodecs VideoEncoder（异步硬件编码，
//   不阻塞主线程），source.add 自带背压 → 内存只占 1 帧（对比 WebM/GIF 先把
//   ImageData[] 全攒进内存，1440×810、10s/30fps 约 1.35GB）。
// - 因此不需要 worker（对比 gifEncoder.worker.ts 的纯软件 LZW）。
// - 能力检测双保险：无 VideoEncoder（老浏览器）或无法编码 avc → 抛错，UI 层
//   toast 提示换浏览器，不静默回退（避免下载到 webm 让人困惑）。

export async function exportMp4(
  config: SceneConfig,
  onProgress?: (phase: string) => void
): Promise<void> {
  if (typeof VideoEncoder === "undefined") {
    throw new Error(
      "当前浏览器不支持 MP4 导出（无 WebCodecs），请用 Chrome/Edge 或改用 WebM"
    );
  }

  const { width, height, duration, background } = config;
  const fps = 30;

  // 用与实际编码一致的约束（尺寸 + 码率）探测可用 codec，避免配置完才发现编不了。
  const format = new Mp4OutputFormat();
  const codec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), {
    width,
    height,
    bitrate: QUALITY_HIGH,
  });
  if (!codec) {
    throw new Error("当前浏览器无法编码 H.264，请用 Chrome/Edge 或改用 WebM");
  }

  const svgEl = getCanvasSvg();
  const controller = usePreviewStore.getState().timelineController;
  if (!controller) throw new Error("Timeline 未就绪，请先播放动画后再导出");

  const output = new Output({ format, target: new BufferTarget() });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const source = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: fps });

  await output.start();
  controller.pause();

  const total = Math.ceil(duration * fps);
  onProgress?.(`渲染 ${total} 帧...`);
  for (let i = 0; i < total; i++) {
    const t = i / fps;
    controller.seek(t);
    // 等一微 tick 让 GSAP seek 同步更新 DOM（沿用 captureFrames 的保险）
    await new Promise((r) => setTimeout(r, 0));
    // 先把这一帧画好，add 才能在调用瞬间抓到正确的 canvas 状态
    await drawSvgFrame(svgEl, width, height, background, ctx);
    await source.add(t, 1 / fps);
    if (i % 30 === 0 || i === total - 1) {
      onProgress?.(`渲染中 ${i + 1}/${total}`);
    }
  }
  controller.seek(0);

  onProgress?.("编码 MP4...");
  await output.finalize();

  const buffer = output.target.buffer;
  if (!buffer) throw new Error("MP4 编码失败：输出为空");
  downloadBlob(new Blob([buffer], { type: "video/mp4" }), `${slug(config)}.mp4`);
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
