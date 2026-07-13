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
  ease?: gsap.TweenVars["ease"]
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
  ease?: gsap.TweenVars["ease"]
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
  ease?: gsap.TweenVars["ease"]
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
  ease?: gsap.TweenVars["ease"]
): { from: TweenVars; to: TweenVars } {
  return {
    from: { strokeDasharray: 1, strokeDashoffset: 1, immediateRender: true },
    to: { strokeDashoffset: 0, duration, ease: ease ?? "power2.inOut" },
  };
}

// ------------------------------------------------------------
// CustomEase 确定性命名 —— 数据指纹
// CustomEase.create(name, data) 是全局注册（同名覆盖），且 ctx.revert()
// 不会清理它。每次 chat 重建 timeline 都会重跑 create，若用随机名会累积
// 泄漏。用数据指纹做确定性命名：相同曲线 → 相同名 → 幂等覆盖，无增长。
// ------------------------------------------------------------

export function getCustomEaseName(data: string): string {
  const slug = data.replace(/[^0-9a-zA-Z]+/g, "_").replace(/^_+|_+$/g, "");
  return `ce_${slug}`;
}
