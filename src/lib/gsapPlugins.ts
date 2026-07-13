// ============================================================
// gsapPlugins.ts — GSAP 插件集中注册（仅前端）
//
// 职责：
// - 模块加载时 registerPlugin 四个插件，保证 useGsapTimeline 构建
//   timeline 前插件已就绪：
//     · MotionPathPlugin — phase.motionPath（沿 SVG 路径运动）
//     · DrawSVGPlugin    — phase.drawSVG（描线动画）
//     · CustomEase       — phase.customEase（自定义 cubic-bezier 缓动）
//     · SplitText        — text actor 的 split 字段（逐字/词文字动画）
// - 导出 CustomEase / SplitText 供 useGsapTimeline 运行时调用
//   （MotionPath/DrawSVG 注册后通过 gsap.TweenVars 键消费，无需运行时引用）
//
// 仅前端：插件依赖 DOM，server 端不能 import 本模块。
// tsconfig.server.json 的 include 未含 src/lib/gsapPlugins.ts，server 既
// 不 import 也不 typecheck 它，天然隔离。
//
// 所有插件在 gsap 3.13+ 已全部免费（随公共 gsap npm 包分发）。
// ============================================================

import gsap from "gsap";
import MotionPathPlugin from "gsap/MotionPathPlugin";
import DrawSVGPlugin from "gsap/DrawSVGPlugin";
import CustomEase from "gsap/CustomEase";
import SplitText from "gsap/SplitText";

// 幂等注册：gsap.registerPlugin 内部按插件实例去重，模块多次加载安全。
// 在模块加载时执行一次 —— useGsapTimeline.ts 顶部 import 本模块。
gsap.registerPlugin(MotionPathPlugin, DrawSVGPlugin, CustomEase, SplitText);

export { CustomEase, SplitText };
