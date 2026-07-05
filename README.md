# Animation Studio

网页端对话式 GSAP 动画设计工具 — 用自然语言描述场景，AI 生成动画并在浏览器中实时预览，确认后导出配置迁移到 Remotion 视频管线。

## 快速开始

```bash
git clone https://github.com/luogao/animation-studio.git
cd animation-studio
npm install
npm run dev
```

打开 http://localhost:5174，创建项目后即可在左侧对话面板输入动画描述。

## 工作流

```
你描述场景 → Claude Agent 设计动画 → GSAP 实时预览 → 反馈修改 → 确认
                                                   ↓
                                          导出 config.json → Remotion 视频
```

- **多项目**：每个项目独立管理，对话和版本互不干扰
- **树形版本**：每次 AI 修改创建新版本，支持回滚到任意历史节点
- **实时流式**：Agent 的思考过程、工具调用、文本生成全部实时可见
- **状态恢复**：刷新页面不丢失状态 — 流式文本、工具卡片、运行阶段自动恢复
- **多标签同步**：同一项目在多个标签页中同时查看，实时广播

## 技术组成

| 层 | 技术 |
|---|---|
| 前端 | Vite + React + TypeScript + GSAP + assistant-ui |
| 后端 | Express + WebSocket (ws) |
| AI | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) |
| 存储 | SQLite (better-sqlite3)，树形版本管理 |

所有配置均为声明式 `SceneConfig`，同一结构驱动预览渲染、GSAP 时间轴、版本持久化及 Remotion 导出。

## 命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动开发服务器 (Express + Vite + WS) |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run build` | 生产构建 |
| `npm run preview` | 预览生产构建 |

## 项目结构

```
src/
├── components/     # React 组件 (ChatPanel, PreviewCanvas, Timeline, etc.)
├── store/          # Zustand 状态 (projectStore, agentStore, previewStore)
├── hooks/          # useWebSocket, useGsapTimeline
├── types/          # SceneConfig 等共享类型
└── lib/            # 工具库 (gsapEffects, assistantRuntime, exportConfig)
server/
├── agent.ts        # Claude Agent SDK 集成
├── wsHandler.ts    # WebSocket 协议处理
├── runRegistry.ts  # Agent 运行状态 + 订阅注册表
├── routes.ts       # REST API
└── db/             # SQLite 数据层 (projects, versions, messages)
```

详见 [CLAUDE.md](./CLAUDE.md) 获取完整架构文档。
