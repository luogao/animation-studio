# 动画与视频制作经验手册

> 从「图解Claude Code」系列9期视频 + Animation Studio项目中提炼的实战经验。
> 覆盖：声明式GSAP动画引擎、Remotion渲染、TTS配音、设计系统、踩坑大全。

---

## 目录

1. [项目关系](#1-项目关系)
2. [核心架构：声明式动画引擎](#2-核心架构声明式动画引擎)
3. [GSAP × Remotion 双端一致性](#3-gsap--remotion-双端一致性)
4. [设计系统：Swiss International × E-Ink](#4-设计系统swiss-international--e-ink)
5. [动画效果库](#5-动画效果库)
6. [视频制作全流程](#6-视频制作全流程)
7. [踩坑大全](#7-踩坑大全)
8. [关键代码模式](#8-关键代码模式)

---

## 1. 项目关系

```
Animation Studio (本项目)          Video Studio (~/Documents/Hermes/video-studio/)
┌─────────────────────┐           ┌─────────────────────────┐
│ 对话 → AI设计动画    │   导出    │ config.json + audio     │
│ GSAP实时预览         │ ────────→ │ Remotion 渲染 → MP4     │
│ 浏览器交互迭代        │  config   │ ffmpeg → 4K → 上传      │
└─────────────────────┘           └─────────────────────────┘
     所见即所得                       最终成品
```

- **Animation Studio**：设计阶段。对话式AI → 声明式JSON config → 浏览器GSAP预览 → 确认后导出
- **Video Studio**：生产阶段。config + TTS音频 → Remotion逐帧渲染 → MP4
- **关键保证**：GSAP在浏览器和Remotion里行为完全一致（同一套timeline + seek模式）

---

## 2. 核心架构：声明式动画引擎

### 设计哲学

不要手写动画代码。把动画抽象成数据：

```
SceneConfig = {
  actors: 哪些元素在画布上（方框/圆/关卡/文本/菱形）
  connections: 它们之间怎么连（直线/箭头/虚线）
  phases: 时间轴上每个时刻发生什么（入场/出场/脉冲/抖动/高亮/连线）
  effects: 持续效果（呼吸发光/粒子/脉冲环/流动光点）
}
```

换场景 = 换config，不动渲染代码。AI只生成JSON，不写代码。

### SceneConfig Schema

```typescript
interface SceneConfig {
  width: number;           // 画布宽（1440默认）
  height: number;          // 画布高（810默认）
  duration: number;        // 总时长（秒）
  background: string;      // 背景色
  actors: Actor[];         // 画布元素
  connections: Connection[]; // 连接线
  phases: Phase[];         // 时间轴事件
  effects?: Effect[];      // 持续特效
}

interface Actor {
  id: string;              // 唯一标识，phase通过id引用
  type: "box" | "circle" | "gate" | "text" | "diamond";
  label?: string;
  x: number; y: number;   // 坐标
  width?: number; height?: number;
  color?: string;
  glow?: string;           // 发光色（gate类型常用）
  fontSize?: number;
  fontWeight?: number;
}

interface Phase {
  at: number;              // 开始时间（秒）
  duration: number;        // 持续时间（秒）
  action: "enter" | "exit" | "connect" | "pulse" | "shake" | "highlight";
  target: string | string[]; // actor id
  effect?: string;         // "slide-left" | "scale-pop" | "fade" | ...
  ease?: string;           // GSAP ease: "power3.out" | "back.out(1.7)" | ...
}
```

### 示例：AI → HOOK → Tool 拦截器动画

```json
{
  "actors": [
    { "id": "ai", "type": "box", "label": "AI", "x": 200, "y": 350 },
    { "id": "hook", "type": "gate", "label": "HOOK", "x": 600, "y": 340, "glow": "#E8A230" },
    { "id": "tool", "type": "box", "label": "Tool", "x": 1020, "y": 350 }
  ],
  "connections": [
    { "from": "ai", "to": "hook", "style": "arrow" },
    { "from": "hook", "to": "tool", "style": "arrow" }
  ],
  "phases": [
    { "at": 0.5, "duration": 0.5, "action": "enter", "target": "ai", "effect": "slide-left" },
    { "at": 1.2, "duration": 0.6, "action": "enter", "target": "hook", "effect": "scale-pop", "ease": "back.out(1.7)" },
    { "at": 2.0, "duration": 0.4, "action": "connect", "target": "ai", "effect": "draw-line" },
    { "at": 2.6, "duration": 0.5, "action": "enter", "target": "tool", "effect": "slide-right" },
    { "at": 3.8, "duration": 0.8, "action": "pulse", "target": "hook" }
  ]
}
```

---

## 3. GSAP × Remotion 双端一致性

### 核心模式：Paused Timeline + Frame Seek

这是让GSAP在浏览器（实时播放）和Remotion（逐帧渲染）中表现一致的**唯一正确做法**：

```typescript
// ── 1. 构建一个暂停的timeline ──
useEffect(() => {
  const ctx = gsap.context(() => {
    const tl = gsap.timeline({
      paused: true,  // ← 关键：不要自动播放
      defaults: { ease: "power3.out" },
    });

    // 用 .from() 定义动画（元素从某状态过渡到当前CSS状态）
    tl.from(".ai-node", { x: -80, opacity: 0, duration: 0.5 }, 0.5)
      .from(".hook-node", { scale: 0, opacity: 0, duration: 0.4, ease: "back.out(1.8)" }, 1.1)
      .from(".line-1", { scaleX: 0, duration: 0.3, transformOrigin: "left center" }, 0.9);

    tlRef.current = tl;
  }, containerRef);

  return () => ctx.revert();  // ← 清理：移除GSAP注入的内联样式
}, []);

// ── 2a. 浏览器模式：正常 play/pause/seek ──
tl.play();
tl.seek(timeInSeconds);

// ── 2b. Remotion模式：每帧根据frame计算时间 ──
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

useEffect(() => {
  if (!tlRef.current) return;
  tlRef.current.seek(frame / fps);  // ← 把帧号转成秒，seek到对应位置
}, [frame, fps]);
```

### 为什么不能用 CSS animation / transition？

- CSS动画无法被外部精确seek到任意时间点
- Remotion按帧渲染（可能是30fps的任意一帧），CSS动画的内部时钟和Remotion的frame不同步
- GSAP的 `timeline.seek(time)` 可以精确跳到任意时刻，完美匹配Remotion的逐帧渲染

### 为什么用 `.from()` 不用 `.to()`？

- `.from()` 定义"从某状态到当前状态"——元素的终态就是CSS定义的样子
- 时间轴 seek 到0时，元素处于动画起始状态；seek到末尾时，元素处于CSS终态
- 这意味着 GSAP cleanup（`ctx.revert()`）后元素回到CSS默认状态 = 动画终态 = 正确

### `gsap.context()` 必须包裹

```typescript
const ctx = gsap.context(() => {
  // 所有GSAP代码写在这里
}, containerRef);  // 限定作用域到容器内

return () => ctx.revert();  // 组件卸载时清理
```

不包裹的话：GSAP注入的内联样式不会清理，组件重渲染时残留旧样式导致动画错乱。

---

## 4. 设计系统：Swiss International × E-Ink

### 色板

| 用途 | 色值 | 说明 |
|------|------|------|
| 背景 | `#0a0a0b` / `#050508` | 深灰不用纯黑 |
| 正文 | `#f1efea` | 暖白 |
| 次要文字 | `rgba(241,239,234,0.55)` | 半透明白 |
| 弱化文字 | `rgba(241,239,234,0.35)` | 更淡 |
| **强调色** | `#E8A230` | 暖橙金，品牌色 |
| 强调色淡 | `rgba(232,162,48,0.15)` | 背景填充 |
| 阻断/危险 | `#D4581A` | 红橙 |
| 允许/通过 | `#F0D060` | 金黄 |
| 细线 | `rgba(255,255,255,0.08)` | hairline |

渐变色阶（从深到浅）：`["#D4581A", "#E8A230", "#F0D060", "#FBE88A"]`

### 字体体系（三字体）

| 用途 | 字体 | 权重 |
|------|------|------|
| 大标题/关键词 | `'Noto Serif SC', 'Songti SC', serif` | 200 (极细) |
| 副标题/场景标题 | 同上 | 300 |
| 正文 | `'Inter', 'PingFang SC', sans-serif` | 400 |
| 代码/标签/元数据 | `'JetBrains Mono', monospace` | 600 |
| 场景内大字 | Serif | 300, letter-spacing 0.05em |

```typescript
const FONTS = {
  heading: "'Outfit', sans-serif",
  body: "'Inter', 'PingFang SC', sans-serif",
  code: "'JetBrains Mono', monospace",
};

const WEIGHT = {
  hero: 200,    // 极细，大标题用
  scene: 300,   // 场景标题
  body: 400,    // 正文
  label: 600,   // 标签/元数据/代码
};
```

### 字号参考（1440×810画布）

| 元素 | 字号 |
|------|------|
| Hero关键词 | 68-98px |
| 场景标题 | 52-62px |
| 正文 | 40-52px |
| 代码 | 38-46px |
| 标签/kicker | 11-13px (uppercase, letter-spacing 0.15-0.2em) |
| Footer | 10px (uppercase, opacity 0.5) |

### 排版规则

- **kicker/标签**：`uppercase` + `letter-spacing: 0.15-0.2em` + Mono字体 + 小色块前缀
- **标题字重阶梯**：200 → 300 → 400 → 600，靠字重差异建层级，不靠颜色
- **细线分隔**：1px hairline，颜色 `rgba(255,255,255,0.08)`
- **圆角**：3-4px，极小，保持硬朗感

---

## 5. 动画效果库

### 入场效果（配合 `timeline.from()`）

| 名称 | 效果 | 适用场景 |
|------|------|----------|
| `slide-left` | 从左滑入(x:-100) | 节点从左方进入 |
| `slide-right` | 从右滑入(x:+100) | 节点从右方进入 |
| `slide-up` | 从下滑入(y:+50) | 底部元素升起 |
| `scale-pop` | 从0放大 | 强调元素出场（gate/关卡） |
| `fade` | 淡入 | 文本/标题 |
| `draw-line` | 连线绘制 | SVG stroke动画 |

### 强调效果

| 名称 | 效果 | 代码 |
|------|------|------|
| `pulse` | 放大1.15倍回弹 | `yoyo: true, repeat: 1` |
| `shake` | 水平抖动6步 | keyframes: -8,+8,-6,+6,-3,0 |
| `highlight` | 亮度闪烁 | `filter: brightness(1.8) → 1` |

### GSAP Ease 速查

| Ease | 手感 | 适用 |
|------|------|------|
| `power2.out` | 通用减速 | 连线、淡入 |
| `power3.out` | 更慢的减速 | 滑入节点 |
| `back.out(1.7-2)` | 轻微回弹 | scale-pop出场 |
| `sine.inOut` | 平滑正弦 | pulse呼吸 |

### 推荐时间参数

```
节点滑入：0.4-0.5s
连线绘制：0.3s
scale-pop：0.35-0.4s（配合 back.out）
label淡入：0.3s
pulse：0.8s（0.4放大 + 0.4回弹）
节点间距：0.15-0.25s（stagger感）
```

### 典型编排节奏（7阶段）

```
0.0s  标题已在（CSS默认显示，不动画）
0.5s  第一个节点滑入
0.9s  连线1开始绘制
1.1s  核心节点scale-pop
1.4s  连线2绘制
1.6s  第三个节点滑入
1.9s  分支路径出现
3.8s  核心节点pulse强调
```

---

## 6. 视频制作全流程

### 6.1 文件结构（Video Studio）

```
video-studio/
├── videos/{project-name}/
│   ├── config.json       ← 场景配置（剧本+视觉）
│   ├── metadata.json     ← TTS对齐元数据（自动生成）
│   ├── audio/
│   │   └── narration.mp3 ← TTS配音
│   └── cover.png         ← 封面(3:4, 1024×1365)
├── public/tutorial/
│   ├── audio/            ← Remotion读取的音频（从videos/ cp过来）
│   └── images/           ← 场景配图
└── src/remotion/
    └── slides/           ← 场景组件（每种type一个.tsx）
```

### 6.2 config.json 结构

```json
{
  "title": "Hook原理",
  "resolution": { "width": 1440, "height": 810 },
  "fps": 30,
  "speed_ratio": 1.5,
  "emo_alpha": 0,
  "bgm": { "src": "bgm.mp3", "volume": 0.2, "fadeIn": 2, "fadeOut": 3 },
  "theme": {
    "background": "#050508",
    "colors": ["#D4581A", "#E8A230", "#F0D060", "#FBE88A"],
    "textColor": "#ffffff",
    "highlightColor": "#E8A230",
    "texture": "dot-grid"
  },
  "scenes": [
    {
      "id": "scene_01",
      "type": "interceptor_animation",
      "duration": 7,
      "keyword": "Hook原理",
      "subtext": "用法 → 原理 · 从配置到拦截器",
      "narration": "之前聊过Claude Code Hook怎么用，今天看原理。"
    }
  ]
}
```

### 6.3 制作步骤

```bash
# 1. 写 config.json（剧本 + 视觉配置）

# 2. 生成TTS配音
cd ~/Documents/Hermes/video-studio
python scripts/gen_tts.py videos/{project-name} --api http://localhost:9766 --force

# 3. 拷贝音频到public（Remotion读public不读videos/）
cp videos/{project-name}/audio/*.mp3 public/tutorial/audio/

# 4. 生成metadata（时间对齐）
python scripts/gen_metadata.py videos/{project-name}

# 5. 预览
npx remotion studio

# 6. 渲染MP4
npx remotion render {CompositionId} out/{project-name}.mp4

# 7. 4K升级（可选）
ffmpeg -i out/{project-name}.mp4 -vf "scale=3840:2160" -c:a copy \
  -sws_flags lanczos out/{project-name}-4k.mp4

# 8. 上传
bash scripts/upload-video.sh {project-name}
```

### 6.4 TTS参数

```
speed_ratio: 1.5    （下限1.4，用户偏好1.5）
emo_alpha: 0        （不要情绪波动）
```

### 6.5 视频规格

```
分辨率：1440×810 (16:9)
FPS：30
时长：30-60秒（~63秒上限）
BGM：lo-fi/ambient 或 Pixabay科技电子风，volume 0.2
BGM从第0秒开始，fadeIn 2s / fadeOut 3s
```

---

## 7. 踩坑大全

### GSAP / 动画

| # | 坑 | 原因 | 解法 |
|---|-----|------|------|
| 1 | CSS animation/transition动画在Remotion里不同步 | CSS内部时钟≠Remotion frame | 用GSAP `timeline({paused:true})` + `seek(frame/fps)` |
| 2 | 组件重渲染后动画样式残留 | GSAP注入的inline style没清理 | 用 `gsap.context()` 包裹 + `ctx.revert()` 清理 |
| 3 | `.to()` 定义动画后元素终态不对 | `.to()`的目标状态可能和CSS不一致 | 用 `.from()` ——终态=CSS默认=正确 |
| 4 | timeline没有paused导致浏览器自动播放 | 默认auto play | 必须设 `paused: true` |
| 5 | seek到某帧时元素消失 | timeline长度不够或phase时间超出duration | 确保最后一个phase.at+duration < timeline.duration() |

### Remotion / 渲染

| # | 坑 | 解法 |
|---|-----|------|
| 6 | shader transitions（GLSL）导致渲染崩溃 | 禁用shader，只用：fade/slide/wipe/flip/clockWipe/iris |
| 7 | TransitionSeries音频重叠导致声音错位 | `durFrames`用 `chunk.frames`（含buffer），hasTransition场景的Audio在 `frame >= effectiveEnd` 时卸载 |
| 8 | 换了narration但渲染还是旧声音 | `audioFile`不带 `audio/` 前缀；改口播须同步 `text` 字段；TTS生成后必须 `cp` 到 `public/tutorial/audio/` |
| 9 | triggerWord不匹配导致动画卡住 | triggerWord须匹配TTS实际词戳分词；改口播后重生成metadata，打印 `words[]` 确认 |
| 10 | 4K渲染模糊 | `--scale 2` 后用 ffmpeg lanczos: `scale=3840:2160` |
| 11 | `gen_metadata.py` 路径错误 | 位置参数是 `videos/{project}`，不是 `--video-dir` |

### config.json

| # | 坑 | 解法 |
|---|-----|------|
| 12 | `details` 字段格式错误 | 必须是 `[{label, items}]` 对象数组；如不需要用 `subtext` 字符串替代 |
| 13 | 缺少 `theme` 字段报错 | config.json 必须包含 `theme: {background, colors, textColor, ...}` |
| 14 | footer/标签硬编码 | footer需动态化 `config.footer → types.ts → 各组件`；左上角英文标签仍硬编码需全局搜索清理 |

### TTS / 音频

| # | 坑 | 解法 |
|---|-----|------|
| 15 | 文件名含 `_` 导致TTS静默截断 | 文件名不能用下划线，年份用中文 |
| 16 | API模式传了voice参数导致音色不对 | API模式不传voice，用服务Dashboard默认音色 |
| 17 | torchaudio导入失败 | gen_tts.py已修补为 soundfile |
| 18 | index-tts的外置硬盘卡死 | `.pth` 文件在外置硬盘上，响应慢时import卡死——不要删pth，等硬盘恢复 |

### 封面 / 图片

| # | 坑 | 解法 |
|---|-----|------|
| 19 | GPT-Image-2输出尺寸不固定 | 裁3:4需PIL crop + resize(LANCZOS) 到1024×1365 |
| 20 | 封面中文文字渲染错误 | packyapi渠道直接在prompt描述中文文字内容即可 |
| 21 | xiaomuai渠道超时 | 超过200s超时；packyapi约150s稳定 |
| 22 | feature_list图片不切换 | `images[]` 用 `triggerWord` 驱动交叉淡入 |

### 上传 / 发布

| # | 坑 | 解法 |
|---|-----|------|
| 23 | 下载文件没有.mp4后缀 | upload-video.sh的NAME不带后缀导致；已修复：脚本自动补 `.mp4` |
| 24 | 视频被平台标记非原创 | 可能原因：源码截图、Claude Code品牌名/LOGO、AI生成图+TTS。建议脱敏源码、弱化品牌 |

### 飞书通信

| # | 坑 | 解法 |
|---|-----|------|
| 25 | 飞书截断消息 | 缩写陷阱：IM→"1M"，IP→跳过，MCP→"咪CP"，改用空格分隔或中文拼音；`_`致截断 |
| 26 | MP4发不过去 | 用公网链接发送，send_message收不到base64 |
| 27 | 用户手机端不在家 | 别发localhost链接 |

---

## 8. 关键代码模式

### 8.1 完整的GSAP动画组件（Remotion版）

```tsx
import gsap from "gsap";
import { useCurrentFrame, useVideoConfig } from "remotion";

export const MyAnimationSlide = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const containerRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  // 构建timeline（仅mount时一次）
  useEffect(() => {
    if (!containerRef.current) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        paused: true,
        defaults: { ease: "power3.out" },
      });

      // ══ 定义动画 ══
      tl.from(".node-1", { x: -80, opacity: 0, duration: 0.5 }, 0.5)
        .from(".node-2", { scale: 0, opacity: 0, duration: 0.4, ease: "back.out(1.8)" }, 1.1)
        .from(".line-1", { scaleX: 0, duration: 0.3, transformOrigin: "left center" }, 0.9)
        .from(".gate-bar", { scaleY: 0, opacity: 0, duration: 0.2, stagger: 0.05 }, 1.35);

      tlRef.current = tl;
    }, containerRef);

    return () => ctx.revert();
  }, []);

  // 每帧同步（Remotion的核心）
  useEffect(() => {
    if (!tlRef.current) return;
    tlRef.current.seek(frame / fps);
  }, [frame, fps]);

  return (
    <AbsoluteFill ref={containerRef}>
      <div className="node-1" style={{ ... }}>Node 1</div>
      <div className="node-2" style={{ ... }}>Node 2</div>
      <div className="line-1" style={{ ... }} />
    </AbsoluteFill>
  );
};
```

### 8.2 声明式Config → Timeline编译器（Animation Studio版）

```typescript
// 把 SceneConfig.phases 编译成 GSAP timeline
function applyPhase(tl: gsap.core.Timeline, phase: Phase) {
  const targets = Array.isArray(phase.target) ? phase.target : [phase.target];

  for (const targetId of targets) {
    const selector = `[data-actor-id="${targetId}"]`;

    switch (phase.action) {
      case "enter":
        tl.from(selector, getEnterEffect(phase.effect, phase.duration, phase.ease), phase.at);
        break;
      case "connect":
        const connSelector = `[data-conn-to="${targetId}"]`;
        tl.fromTo(connSelector, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: phase.duration }, phase.at);
        break;
      case "pulse":
        tl.to(selector, { scale: 1.15, duration: phase.duration / 2, yoyo: true, repeat: 1 }, phase.at);
        break;
      // ... exit, shake, highlight
    }
  }
}
```

### 8.3 入场/出场效果工厂

```typescript
export function getEnterEffect(name: string, duration: number, ease?: string): TweenVars {
  switch (name) {
    case "slide-left":  return { x: -100, opacity: 0, duration, ease: ease ?? "power2.out" };
    case "slide-right": return { x: 100,  opacity: 0, duration, ease: ease ?? "power2.out" };
    case "scale-pop":   return { scale: 0, opacity: 0, duration, ease: ease ?? "back.out(1.7)" };
    case "fade":        return { opacity: 0, duration, ease: ease ?? "power2.out" };
    case "draw-line":   return { strokeDasharray: 1, strokeDashoffset: 1, duration, immediateRender: true };
    default:            return { opacity: 0, duration, ease: "power2.out" };
  }
}
```

---

## 附录：已发布的视频清单

| # | 主题 | 场景类型 |
|---|------|----------|
| 1 | Skills 技能系统 | feature_list |
| 2 | Tool Call 工具调用 | terminal + flowchart |
| 3 | Context 上下文管理 | split + compare |
| 4 | Memory 记忆系统 | feature_list |
| 5 | Sandbox 沙箱 | arch_compare |
| 6 | Multi Agent 多智能体 | flowchart |
| 7 | Prompt 提示词 | terminal |
| 8 | Session 会话 | browser_scroll |
| 9 | Hook 原理篇 | **interceptor_animation (GSAP)** + split_hook + terminal |

> Hook原理篇是首个使用GSAP声明式动画的视频，其 `InterceptorAnimationSlide.tsx` 是GSAP+Remotion模式的参考实现。
