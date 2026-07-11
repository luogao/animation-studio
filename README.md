# Animation Studio

网页端对话式 GSAP 动画设计工具 — 用自然语言描述场景，Claude Agent 生成动画并在浏览器中实时预览，迭代修改后一键导出为视频或 `SceneConfig` JSON，迁移到外部 Remotion 管线。

> 视频里把它叫做「Vibe Animation」，但代码库与产品名统一为 **Animation Studio**。

## 快速开始

```bash
git clone https://github.com/luogao/animation-studio.git
cd animation-studio
npm install
npm run dev
```

打开 http://localhost:5174。

**首次使用需配置 LLM**：点击右上角 ⚙️ 设置图标，填入 `base_url` / API key / 模型名并保存（写入 `.claude/setting.agent.json`）。配置好后，在首页描述一个场景即可开始 — 首页的描述会作为第一条消息自动发给 Agent。

## 工作流

```
你描述场景 → Claude Agent 设计动画 → GSAP 实时预览 → 反馈修改 → 确认
              ↑                                              │
              └──────── 选中元素 / 上传图片定向沟通 ──────────┤
                                                            ↓
                                              导出 MP4 / WebM / GIF / config.json → Remotion
```

## 核心特性

**对话式设计**
- **实时流式**：Agent 的思考过程（thinking）、工具调用、文本生成全部实时可见
- **状态恢复**：刷新页面不丢失状态 — 流式文本、工具卡片、运行阶段自动恢复
- **多标签同步**：同一项目在多个标签页中实时广播，所见即同步
- **首页即开始**：首页场景描述作为首条对话自动发送，无缝进入工作台

**画布与元素**
- **多页面布局**：首页、项目管理、沉浸式工作台三段式体验
- **丰富形状**：box / circle / gate / text / diamond / polygon / star / path / image
- **元素选中与编辑模式**：点选画布元素，把上下文带给 Agent 做定向修改
- **图片上传**：在对话框上传图片（多图），Agent 自动布局为 `image` actor
- **画布尺寸**：横屏 1440×810 / 竖屏 1080×1920 / 1080p，或按需自定义

**配色与字体**
- **配色系统**：Agent 基于主色生成多套和谐调色板（类比 / 互补 / 三元），WCAG 对比度校验，由你挑选用哪套
- **Google Fonts**：Agent 推荐字体方案，选定后应用到文本 actor 并预加载

**版本与导出**
- **树形版本**：每次 Agent 修改创建草稿，提交后成为新版本；支持回滚到任意历史节点（git 风格，从不改动历史）
- **多项目**：每个项目独立管理，对话、版本、Agent 记忆互不干扰
- **多格式导出**：浏览器端直接导出 **MP4 (H.264)** / **WebM** / **GIF**，或导出 `SceneConfig` JSON 供 Remotion 消费

## 技术组成

| 层 | 技术 |
|---|---|
| 前端 | Vite + React 19 + TypeScript + GSAP + Tailwind v4 + assistant-ui |
| 后端 | Express + WebSocket (ws)，单进程混合传输 |
| AI | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) + MCP 工具 |
| 视频导出 | mediabunny + WebCodecs（MP4/WebM）、自研 GIF 编码器 |
| 存储 | SQLite (better-sqlite3)，树形版本管理 |

所有配置均为声明式 `SceneConfig`，同一结构驱动预览渲染、GSAP 时间轴、版本持久化及导出契约。

## 命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动开发服务器 (Express + Vite + WS，http://localhost:5174) |
| `npm run typecheck` | TypeScript 类型检查（前端 + server 双 tsconfig） |
| `npm run build` | 类型检查 + 生产构建（前端 bundle） |
| `npm run preview` | 预览生产构建 |

> dev 模式下 `tsx` 只跑 server、Vite 不做类型检查，改完代码记得跑 `npm run typecheck`。

## Docker 部署

```bash
cp .env.example .env          # 可选，默认值已可用
docker compose up -d --build  # 访问 http://localhost:${PORT:-5174}
```

- **数据持久化**：`studio-data` 卷保存 SQLite + Agent SDK 会话状态；`studio-config` 卷保存 LLM 配置。容器重建后数据不丢。
- **LLM 配置**：默认首次启动后在浏览器 UI 填写（方式 A）；也可用宿主机现成的 `setting.agent.json` 只读注入（方式 B，见 `docker-compose.yml` 注释）。

环境变量（均可选，见 `.env.example`）：

| 变量 | 说明 |
|---|---|
| `PORT` | 宿主机对外端口（默认 5174） |
| `CLAUDE_MODEL` | 覆盖 Agent 模型 id（优先级：UI 配置 > 此处 > 代码默认） |
| `STUDIO_DB_PATH` | SQLite 路径（默认 `<root>/.data/studio.db`） |
| `CLAUDE_SETTINGS_FILE` | SDK 配置文件路径 |

## 项目结构

```
src/
├── components/     # React 组件 (ChatPanel, PreviewCanvas, Timeline, ColorPalettePanel ...)
├── store/          # Zustand 状态 (projectStore, agentStore, previewStore, composerStore, selectionStore)
├── hooks/          # useWebSocket, useGsapTimeline
├── types/          # SceneConfig 等共享类型
└── lib/            # 工具库 (gsapEffects, exportMedia, colorPalette, googleFonts, uploadImage ...)
server/
├── agent.ts        # Claude Agent SDK 集成 + MCP 工具定义
├── prompts.ts      # 系统提示词（含 SceneConfig 接口说明）
├── wsHandler.ts    # WebSocket 协议处理
├── runRegistry.ts  # Agent 运行状态 + 订阅注册表
├── routes.ts       # REST API
├── uploads.ts      # 图片上传接口
├── llm-config.ts   # LLM 配置读/写（.claude/setting.agent.json）
└── db/             # SQLite 数据层 (projects, versions, messages)
docs/
├── PRD.md          # 完整产品需求文档
└── ANIMATION-GUIDE.md
```

完整架构、数据流、GSAP↔SVG 契约、Agent 集成细节见 [CLAUDE.md](./CLAUDE.md)，产品设计见 [docs/PRD.md](./docs/PRD.md)。
