# Animation Studio — 交互式动画设计工作室

## 一句话
网页端对话式GSAP动画设计工具，实时预览，确认后导出config迁移到Remotion视频。

## 核心流程
```
用户描述场景 → Claude Agent设计动画 → 生成GSAP config → 浏览器实时预览
     ↑                                                        ↓
     └──── 用户反馈修改 ←──────────────────────────────────────┘
                              ↓ 确认
                        导出 config.json → Remotion DynamicScene
```

## 技术栈
- **前端**: Vite + React + TypeScript + GSAP
- **后端**: Express + WebSocket(ws)
- **AI**: Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)
- **构建**: Vite dev server + Express API in one process

## 功能模块

### 1. 对话面板 (ChatPanel)
- 左侧面板，用户输入消息
- 消息历史展示（user/assistant）
- Agent回复实时流式显示
- 支持快捷指令：`/preview` `/export` `/undo`

### 2. 实时预览画布 (PreviewCanvas)
- 右侧主区域，居中显示画布
- **画布尺寸可调**：宽度/高度输入框 + 预设（1440×810横屏、1080×1920竖屏、1920×1080、自定义）
- 画布渲染GSAP动画（实时播放，非逐帧）
- 时间轴拖拽条：可拖到任意时间点查看效果
- 播放/暂停按钮 + 当前时间/总时长显示
- 背景：暗色 #0a0a0b + dot-grid纹理（跟视频风格一致）

### 3. 动画引擎 (DynamicScene)
- **声明式config驱动**，不硬编码任何场景
- config结构：
```typescript
interface SceneConfig {
  width: number;
  height: number;
  duration: number;        // 秒
  background: string;      // 背景色
  actors: Actor[];         // 节点/元素
  connections: Connection[]; // 连线
  phases: Phase[];         // 时间轴阶段
  effects?: Effect[];      // 特效（发光、粒子等）
}

interface Actor {
  id: string;
  type: "box" | "circle" | "gate" | "text" | "diamond";
  label?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
  glow?: string;          // 发光色
  fontSize?: number;
  fontWeight?: number;
}

interface Connection {
  from: string;            // actor id
  to: string;              // actor id
  style: "line" | "arrow" | "dashed";
  color?: string;
}

interface Phase {
  at: number;              // 开始时间（秒）
  duration: number;
  action: "enter" | "exit" | "connect" | "pulse" | "shake" | "highlight";
  target: string | string[];  // actor id 或 ids
  effect?: string;         // "slide-left" | "scale-pop" | "fade" | "slide-up" | "draw-line"
  ease?: string;           // GSAP ease
}

interface Effect {
  type: "breathing-glow" | "particles" | "pulse-ring" | "flowing-dots";
  target: string;          // actor id
  color?: string;
}
```

### 4. Agent集成
- 后端用Claude Agent SDK
- System prompt包含：
  - 动画设计词汇库（actor类型、入场效果、连接动画、特效）
  - SceneConfig的TypeScript接口定义
  - 设计风格指南（Swiss International、暖橙金色调、暗黑背景）
  - 当前config状态（每次对话带上当前config让agent修改）
- Agent输出：修改后的SceneConfig JSON + 设计说明文字
- Agent可以调用自定义tool：`update_scene_config(config: SceneConfig)`

### 5. 导出
- 点击"导出"按钮 → 下载config.json
- config.json可直接用于Remotion DynamicScene组件
- 导出时显示"已导出，可粘贴到video-studio使用"

## 页面布局
```
┌──────────────────────────────────────────────────────┐
│  Animation Studio                    [导出] [设置]    │
├────────────────┬─────────────────────────────────────┤
│                │                                     │
│  对话面板       │        预览画布                      │
│                │    ┌─────────────────────┐         │
│  [用户消息]     │    │                     │         │
│  [Agent回复]   │    │   GSAP动画实时渲染   │         │
│                │    │                     │         │
│                │    └─────────────────────┘         │
│                │    ▶ ──────●────────── 2.3s/5.0s  │
│                │    尺寸: [1440] × [810]  [横屏▼]   │
│                │                                     │
├────────────────┤                                     │
│  [输入框...]    │                                     │
│  [发送]         │                                     │
└────────────────┴─────────────────────────────────────┘
```

## 开发顺序
1. 项目脚手架 + Vite + Express + WebSocket
2. SceneConfig类型定义
3. DynamicScene渲染组件（吃config吐GSAP动画）
4. 预览画布 + 时间轴 + 尺寸控制
5. Claude Agent SDK集成 + WebSocket通信
6. 对话面板
7. 导出功能

## 关键约束
- GSAP timeline在浏览器实时播放，不用Remotion的frame-seek
- 画布尺寸可调，默认1440×810
- 暗黑主题，#0a0a0b背景
- Agent SDK的model用claude-sonnet（代码生成质量+速度平衡）
- config变更时动画自动重新播放
