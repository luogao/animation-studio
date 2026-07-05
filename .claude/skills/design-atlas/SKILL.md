---
name: design-atlas
description: Design Atlas 设计风格知识库——AI Agent 可搜索、引用和应用的设计风格集合
type: knowledge-base
cost: low
---

# Design Atlas — 设计风格知识库

Design Atlas 是一个收录了 **59 个设计系统**（来自 7 个来源）的设计风格聚合库。
包含从 Mac System 7 到赛博朋克 2077 的完整视觉指引。

## 数据地址（线上）

Base URL: `https://design-atlas.com`

```
https://design-atlas.com/
├── manifest.json              ← 全局索引
├── systems/
│   └── {id}/
│       ├── STYLE.md           ← 设计语言 + Do/Don't
│       └── tokens.css         ← CSS 变量
└── gallery/                   ← 在线预览
```

## 工作流程

当被要求"根据某个风格做 UI"时：

1. **获取索引** → fetch `https://design-atlas.com/manifest.json`，搜索 category、tags、name
2. **获取设计指引** → fetch `https://design-atlas.com/systems/{id}/STYLE.md`
3. **获取 CSS Token** → fetch `https://design-atlas.com/systems/{id}/tokens.css`
4. **应用** → 将 CSS 变量注入 :root，严格遵循 STYLE.md 的 Do/Don't

## tags 标签体系

manifest.json 中每个风格有 tags 数组，支持多维筛选：

- **mood**：minimal, bold, playful, dark, warm, futuristic, nostalgic, elegant, raw
- **palette**：monochrome, duotone, neon, primary-colors, pastel, earth-tone, 8bit
- **typography**：serif, sans, pixel, mono, script, display
- **era**：1970s, 1980s, 1990s, 2000s, 2010s, 2020s
- **best_for**：app-ui, game-ui, data-viz, landing-page, portfolio, blog, tool, poster
