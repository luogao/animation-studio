// ============================================================
// gsapEffects.ts — 动画效果工厂函数
//
// 每个工厂返回 gsap.TweenVars，可直接传入 timeline.from() / .to()
// ============================================================

// gsap 的类型通过 ambient `declare namespace gsap` 全局可见，
// 因此无需 import 即可在类型位置使用 `gsap.TweenVars`。
type TweenVars = gsap.TweenVars;

// ------------------------------------------------------------
// 入场效果 — 配合 timeline.from() 使用
// 元素本身处于终态，动画从指定起始状态过渡到终态
// ------------------------------------------------------------

export function getEnterEffect(
  name: string | undefined,
  duration: number,
  ease?: string
): TweenVars {
  const e = ease ?? "power2.out";
  switch (name) {
    case "slide-left":
      return { x: -100, opacity: 0, duration, ease: e };
    case "slide-right":
      return { x: 100, opacity: 0, duration, ease: e };
    case "slide-up":
      return { y: 50, opacity: 0, duration, ease: e };
    case "scale-pop":
      return { scale: 0, duration, ease: ease ?? "back.out(1.7)" };
    case "fade":
      return { opacity: 0, duration, ease: e };
    case "draw-line":
      // 仅适用于带 stroke 的元素（连接线）
      return {
        strokeDasharray: 1,
        strokeDashoffset: 1,
        duration,
        ease: e,
        immediateRender: true,
      };
    default:
      return { opacity: 0, duration, ease: e };
  }
}

// ------------------------------------------------------------
// 出场效果 — 配合 timeline.to() 使用
// ------------------------------------------------------------

export function getExitEffect(
  duration: number,
  ease?: string
): TweenVars {
  return {
    opacity: 0,
    scale: 0.85,
    duration,
    ease: ease ?? "power2.in",
  };
}

// ------------------------------------------------------------
// 强调效果 — pulse / shake / highlight
// ------------------------------------------------------------

export function getPulseEffect(
  duration: number,
  ease?: string
): TweenVars {
  return {
    scale: 1.15,
    duration: duration / 2,
    ease: ease ?? "sine.inOut",
    yoyo: true,
    repeat: 1,
  };
}

export function getShakeEffect(duration: number): TweenVars {
  const step = Math.max(duration / 6, 0.03);
  return {
    keyframes: [
      { x: -8, duration: step },
      { x: 8, duration: step },
      { x: -6, duration: step },
      { x: 6, duration: step },
      { x: -3, duration: step },
      { x: 0, duration: step },
    ],
    ease: "power1.inOut",
  };
}

export function getHighlightEffect(duration: number): TweenVars {
  const half = Math.max(duration / 2, 0.05);
  return {
    keyframes: [
      { filter: "brightness(1.8)", duration: half },
      { filter: "brightness(1)", duration: half },
    ],
    ease: "power1.inOut",
  };
}

// ------------------------------------------------------------
// 连接线绘制效果（用于 action: "connect"）
// 返回 fromTo 需要的 {from, to} 对
// ------------------------------------------------------------

export function getDrawLineTween(
  duration: number,
  ease?: string
): { from: TweenVars; to: TweenVars } {
  return {
    from: { strokeDasharray: 1, strokeDashoffset: 1, immediateRender: true },
    to: { strokeDashoffset: 0, duration, ease: ease ?? "power2.inOut" },
  };
}
