// ============================================================
// useGsapTimeline.ts — 把 SceneConfig 编译成 GSAP timeline
//
// 职责：
// - 在 containerRef 作用域内用 gsap.context() 构建 timeline
// - 按 phase.at 把每个 phase 对应的 effect 插入 timeline
// - 通过 store.timelineController 暴露 play / pause / seek / duration
// - config 变更时自动 kill 旧 timeline 重建新 timeline 并 auto-play
// - cleanup 时 revert（清除所有 GSAP 加的内联样式 / filter）
// ============================================================

import { useEffect, type RefObject } from "react";
import gsap from "gsap";
import type { SceneConfig, Phase } from "../types/scene";
import { usePreviewStore } from "../store/previewStore";
import {
  getEnterEffect,
  getExitEffect,
  getPulseEffect,
  getShakeEffect,
  getHighlightEffect,
  getDrawLineTween,
} from "../lib/gsapEffects";

interface Options {
  autoplay?: boolean; // 默认 true
}

export function useGsapTimeline(
  config: SceneConfig,
  containerRef: RefObject<HTMLElement | null>,
  options: Options = {}
) {
  const { autoplay = true } = options;

  const setCurrentTime = usePreviewStore((s) => s.setCurrentTime);
  const setPlaying = usePreviewStore((s) => s.setPlaying);
  const setTimelineController = usePreviewStore(
    (s) => s.setTimelineController
  );

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    let tl: gsap.core.Timeline | null = null;

    const ctx = gsap.context(() => {
      tl = gsap.timeline({
        paused: true,
        onUpdate: () => {
          if (tl) setCurrentTime(tl.time());
        },
        onComplete: () => {
          setPlaying(false);
        },
        onReverseComplete: () => {
          setPlaying(false);
        },
      });

      // ── 逐个 phase 翻译成 tween ──
      for (const phase of config.phases) {
        applyPhase(tl, phase);
      }

      // ── 把控制器塞进 store ──
      const controller = {
        play: () => {
          if (tl!.paused() && tl!.time() >= tl!.duration() - 0.001) {
            tl!.seek(0);
          }
          tl!.play();
          setPlaying(true);
        },
        pause: () => {
          tl!.pause();
          setPlaying(false);
        },
        seek: (t: number) => {
          tl!.pause();
          tl!.seek(t, false);
          setCurrentTime(t);
        },
        duration: tl.duration() || config.duration,
      };
      setTimelineController(controller);

      // ── 自动从头播放 ──
      if (autoplay) {
        tl.seek(0);
        tl.play();
        setPlaying(true);
      }
    }, root);

    return () => {
      ctx.revert();
      setTimelineController(null);
      setPlaying(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, autoplay]);
}

// ------------------------------------------------------------
// 把单个 phase 翻译成 timeline 上的 tween
// ------------------------------------------------------------

function applyPhase(tl: gsap.core.Timeline, phase: Phase) {
  const targets = Array.isArray(phase.target) ? phase.target : [phase.target];
  const dur = phase.duration;
  const ease = phase.ease;

  for (const targetId of targets) {
    const actorSelector = `[data-actor-id="${targetId}"]`;

    switch (phase.action) {
      case "enter": {
        const vars = getEnterEffect(phase.effect, dur, ease);
        tl.from(actorSelector, vars, phase.at);
        break;
      }

      case "exit": {
        const vars = getExitEffect(dur, ease);
        tl.to(actorSelector, vars, phase.at);
        break;
      }

      case "pulse": {
        tl.to(actorSelector, getPulseEffect(dur, ease), phase.at);
        break;
      }

      case "shake": {
        tl.to(actorSelector, getShakeEffect(dur), phase.at);
        break;
      }

      case "highlight": {
        tl.to(actorSelector, getHighlightEffect(dur), phase.at);
        break;
      }

      case "connect": {
        // 给所有指向 target 的连接线做 draw-line
        const connSelector = `[data-conn-to="${targetId}"]`;
        const tween = getDrawLineTween(dur, ease);
        tl.fromTo(connSelector, tween.from, tween.to, phase.at);
        break;
      }

      default:
        break;
    }
  }
}
