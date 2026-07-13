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
import { CustomEase, SplitText } from "../lib/gsapPlugins"; // 注册 MotionPath/DrawSVG/CustomEase/SplitText + 导出运行时所需
import type { SceneConfig, Phase } from "../types/scene";
import { usePreviewStore } from "../store/previewStore";
import {
  getEnterEffect,
  getExitEffect,
  getPulseEffect,
  getShakeEffect,
  getHighlightEffect,
  getDrawLineTween,
  getCustomEaseName,
} from "../lib/gsapEffects";

/** 预拆分的 SplitText 实例缓存：actor id → { 实例, 拆分粒度 char|word } */
type SplitMap = Map<string, { instance: SplitText; mode: "char" | "word" }>;

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

    let cancelled = false;
    let ctx: gsap.Context | null = null;
    let tl: gsap.core.Timeline | null = null;

    // 含 split text 时先等字体加载，否则 SplitText 测量用回退字体、逐字位置错乱
    const build = async () => {
      if (config.actors.some((a) => a.type === "text" && a.split)) {
        try {
          await document.fonts.ready;
        } catch {
          /* 字体加载失败不阻塞，用回退字体 */
        }
      }
      if (cancelled || !root) return;

      ctx = gsap.context(() => {
        // ── 预拆分 split text actor（在 context 内创建 → ctx.revert 自动清理）──
        const splits: SplitMap = new Map();
        for (const actor of config.actors) {
          if (actor.type === "text" && actor.split) {
            const el = root!.querySelector(
              `[data-actor-id="${actor.id}"] [data-text-root]`
            );
            if (el) {
              splits.set(actor.id, {
                mode: actor.split,
                instance: SplitText.create(el, {
                  type: actor.split === "word" ? "words" : "chars",
                  tag: "div",
                  // 用 class 而非 instance.chars/words：tl.from 对 Element[] 在 timeline
                  // 内不生效，selector 可靠（gsap 按 class 查询）
                  charsClass: "split-char",
                  wordsClass: "split-word",
                }),
              });
            }
          }
        }

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
          applyPhase(tl, phase, splits);
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
        // 注意：autoplay 在 React useEffect 链内执行时，gsap ticker 的 globalTime 会跳到
        // duration，导致 timeline 瞬间到末尾（看起来没播）；手动点播放（render 链外）正常。
        // 这是 gsap + React 渲染时机的深层交互，未完全修复——建议后续用 @gsap/react 的
        // useGSAP 重构本 hook 来彻底解决。
        if (autoplay) {
          tl.seek(0);
          tl.play();
          setPlaying(true);
        }
      }, root);
    };

    build();

    return () => {
      cancelled = true;
      ctx?.revert();
      setTimelineController(null);
      setPlaying(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, autoplay]);
}

// ------------------------------------------------------------
// 把单个 phase 翻译成 timeline 上的 tween
// ------------------------------------------------------------

function applyPhase(
  tl: gsap.core.Timeline,
  phase: Phase,
  splits: SplitMap
) {
  const targets = Array.isArray(phase.target) ? phase.target : [phase.target];

  // 含 split text 的 target 不能合并成复合选择器（split text 要逐字作用），
  // 退化为逐 target 调用。
  const hasSplitTarget = targets.some((id) => splits.has(id));
  // stagger 模式：多目标时拼接复合选择器，一次 GSAP 调用带 stagger
  const useStagger =
    targets.length > 1 && phase.stagger !== undefined && !hasSplitTarget;

  if (useStagger && phase.action !== "connect") {
    const compoundSelector = targets
      .map((id) => `[data-actor-id="${id}"]`)
      .join(",");
    applyOne(tl, compoundSelector, null, phase, true, splits);
    return;
  }

  // 非 stagger 模式（或含 split target）：逐目标循环
  for (const targetId of targets) {
    const actorSelector = `[data-actor-id="${targetId}"]`;
    applyOne(tl, actorSelector, targetId, phase, false, splits);
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
  withStagger: boolean,
  splits: SplitMap
) {
  const dur = phase.duration;
  // customEase（CustomEase 插件）：四点 cubic-bezier，覆盖 phase.ease。
  // 确定性命名（数据指纹）避免全局注册累积；非法曲线回退 phase.ease。
  let ease: gsap.TweenVars["ease"] = phase.ease;
  if (phase.customEase) {
    try {
      ease = CustomEase.create(
        getCustomEaseName(phase.customEase),
        phase.customEase
      );
    } catch {
      ease = phase.ease;
    }
  }

  // split text：gsap 作用对象用 selector（按 class 查询拆分子元素），而非
  // instance.chars/words（Element[] 在 timeline 内不生效）。
  const splitEntry = targetId ? splits.get(targetId) : undefined;
  const gsapTarget: string = splitEntry
    ? `[data-actor-id="${targetId}"] .${splitEntry.mode === "word" ? "split-word" : "split-char"}`
    : selector;

  const extra: Record<string, unknown> = {};
  // stagger：多 actor 复合（withStagger）或 split text 逐字/词（splitEntry）都启用
  if ((withStagger || !!splitEntry) && phase.stagger !== undefined) {
    extra.stagger = phase.stagger;
  }

  // ── 插件分支（前置，优先于 switch；不与 split 组合，用 selector）──
  // MotionPath：沿 SVG 路径运动，配 action:"tween"。relative 默认 true（相对当前位置）。
  if (phase.motionPath) {
    const mp = phase.motionPath;
    tl.to(
      selector,
      {
        duration: dur,
        ease,
        motionPath: {
          path: mp.path,
          relative: mp.relative ?? true,
          autoRotate: mp.autoRotate ?? false,
          curviness: mp.curviness,
          alignOrigin: mp.alignOrigin ?? [0.5, 0.5],
        },
        ...extra,
      },
      phase.at
    );
    return;
  }

  // DrawSVG：描线。target 需具体 id（stagger 复合选择器 targetId=null 不支持）。
  // action:"connect" 选中连接线 <line>；其它 action 下钻到描边形状 [data-actor-part="shape"]。
  if (phase.drawSVG && targetId) {
    const sel =
      phase.action === "connect"
        ? `[data-conn-to="${targetId}"]`
        : `[data-actor-id="${targetId}"] [data-actor-part="shape"]`;
    tl.fromTo(
      sel,
      { drawSVG: "0% 0%", immediateRender: true },
      { drawSVG: phase.drawSVG, duration: dur, ease, ...extra },
      phase.at
    );
    return;
  }

  switch (phase.action) {
    case "enter": {
      const vars = getEnterEffect(phase.effect, dur, ease);
      Object.assign(vars, extra);
      tl.from(gsapTarget, vars, phase.at);
      break;
    }

    case "exit": {
      const vars = getExitEffect(dur, ease);
      Object.assign(vars, extra);
      tl.to(gsapTarget, vars, phase.at);
      break;
    }

    case "pulse": {
      const vars = getPulseEffect(dur, ease);
      Object.assign(vars, extra);
      tl.to(gsapTarget, vars, phase.at);
      break;
    }

    case "shake": {
      const vars = getShakeEffect(dur);
      Object.assign(vars, extra);
      tl.to(gsapTarget, vars, phase.at);
      break;
    }

    case "highlight": {
      const vars = getHighlightEffect(dur);
      Object.assign(vars, extra);
      tl.to(gsapTarget, vars, phase.at);
      break;
    }

    case "connect": {
      // 给所有指向 target 的连接线做 draw-line（连接线不涉及 split）
      const connSelector = `[data-conn-to="${targetId}"]`;
      if (phase.drawSVG) {
        // 新路径：DrawSVG 描线（值由 agent 给，如 "0% 100%"），比手搓更平滑
        tl.fromTo(
          connSelector,
          { drawSVG: "0% 0%", immediateRender: true },
          { drawSVG: phase.drawSVG, duration: dur, ease, ...extra },
          phase.at
        );
      } else {
        // 旧路径：手搓 strokeDashoffset（pathLength=1 归一化），向后兼容
        const tween = getDrawLineTween(dur, ease);
        tl.fromTo(connSelector, tween.from, tween.to, phase.at);
      }
      break;
    }

    case "tween": {
      const props = (phase.props ?? {}) as Record<string, unknown>;
      const tweenMode = phase.tweenMode ?? "to";
      const vars = { ...props, duration: dur, ease, ...extra };

      if (tweenMode === "from") {
        tl.from(gsapTarget, vars, phase.at);
      } else if (tweenMode === "fromTo") {
        const fromVars = {
          ...((phase.fromProps ?? {}) as Record<string, unknown>),
          duration: dur,
          ease,
          ...extra,
        };
        tl.fromTo(gsapTarget, fromVars, vars, phase.at);
      } else {
        tl.to(gsapTarget, vars, phase.at);
      }
      break;
    }

    default:
      break;
  }
}
