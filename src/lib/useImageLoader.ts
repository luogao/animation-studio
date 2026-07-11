// ============================================================
// useImageLoader.ts — image 类型 actor 的异步加载 hook
//
// 职责：
// - 预加载 actor.src（new Image()），暴露加载状态与自然尺寸
// - 供 ActorRenderer（渲染占位/真实图、回填 width/height）与
//   属性面板（预览）复用
//
// 同源 /uploads/... 不会污染 canvas（导出安全）；data URI 同理。
// ============================================================

import { useEffect, useState } from "react";
import type { ImageLoadStatus } from "./actorShapes";

export interface ImageLoaderState {
  status: ImageLoadStatus;
  naturalWidth: number | undefined;
  naturalHeight: number | undefined;
}

const IDLE: ImageLoaderState = {
  status: "idle",
  naturalWidth: undefined,
  naturalHeight: undefined,
};

export function useImageLoader(src: string | undefined): ImageLoaderState {
  const [state, setState] = useState<ImageLoaderState>(IDLE);

  useEffect(() => {
    if (!src) {
      setState(IDLE);
      return;
    }
    setState({ status: "loading", naturalWidth: undefined, naturalHeight: undefined });

    const img = new Image();
    img.onload = () =>
      setState({
        status: "loaded",
        naturalWidth: img.naturalWidth || undefined,
        naturalHeight: img.naturalHeight || undefined,
      });
    img.onerror = () =>
      setState({ status: "error", naturalWidth: undefined, naturalHeight: undefined });
    img.src = src;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return state;
}
