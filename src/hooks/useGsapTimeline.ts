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
          if (tl!.time() >= tl!.duration() - 0.001) {
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

  // stagger 模式：多目标时拼接复合选择器，一次 GSAP 调用带 stagger
  const useStagger = targets.length > 1 && phase.stagger !== undefined;

  if (useStagger && phase.action !== "connect") {
    const compoundSelector = targets
      .map((id) => `[data-actor-id="${id}"]`)
      .join(",");
    applyOne(tl, compoundSelector, null, phase, true);
    return;
  }

  // 非 stagger 模式：逐目标循环
  for (const targetId of targets) {
    const actorSelector = `[data-actor-id="${targetId}"]`;
    applyOne(tl, actorSelector, targetId, phase, false);
  }
}

// ------------------------------------------------------------
// 对单个选择器执行一个 phase 的 tween
// ------------------------------------------------------------

function applyOne(
  tl: gsap.core.Timeline,
  selector: string,
  targetId: string | null,
  phase: Phase,
  withStagger: boolean
) {
  const dur = phase.duration;
  const ease = phase.ease;
  const extra: Record<string, unknown> = {};
  if (withStagger && phase.stagger !== undefined) {
    extra.stagger = phase.stagger;
  }

  switch (phase.action) {
    case "enter": {
      const vars = getEnterEffect(phase.effect, dur, ease);
      Object.assign(vars, extra);
      tl.from(selector, vars, phase.at);
      break;
    }

    case "exit": {
      const vars = getExitEffect(dur, ease);
      Object.assign(vars, extra);
      tl.to(selector, vars, phase.at);
      break;
    }

    case "pulse": {
      const vars = getPulseEffect(dur, ease);
      Object.assign(vars, extra);
      tl.to(selector, vars, phase.at);
      break;
    }

    case "shake": {
      const vars = getShakeEffect(dur);
      Object.assign(vars, extra);
      tl.to(selector, vars, phase.at);
      break;
    }

    case "highlight": {
      const vars = getHighlightEffect(dur);
      Object.assign(vars, extra);
      tl.to(selector, vars, phase.at);
      break;
    }

    case "connect": {
      // 给所有指向 target 的连接线做 draw-line
      const connSelector = `[data-conn-to="${targetId}"]`;
      const tween = getDrawLineTween(dur, ease);
      tl.fromTo(connSelector, tween.from, tween.to, phase.at);
      break;
    }

    case "tween": {
      const props = (phase.props ?? {}) as Record<string, unknown>;
      const tweenMode = phase.tweenMode ?? "to";
      const vars = { ...props, duration: dur, ease, ...extra };

      if (tweenMode === "from") {
        tl.from(selector, vars, phase.at);
      } else if (tweenMode === "fromTo") {
        const fromVars = {
          ...((phase.fromProps ?? {}) as Record<string, unknown>),
          duration: dur,
          ease,
          ...extra,
        };
        tl.fromTo(selector, fromVars, vars, phase.at);
      } else {
        tl.to(selector, vars, phase.at);
      }
      break;
    }

    default:
      break;
  }
}
