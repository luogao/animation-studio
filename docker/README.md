# Animation Studio — Docker 部署

本项目支持通过 Docker 一键部署（`node:22-slim`，多阶段构建）。
生产模式下：Express 服务 `vite build` 出的静态前端 + REST/WebSocket，服务端用 `node` 直接跑 ESM。

---

## 架构要点

| 关注点 | 处理方式 |
|---|---|
| **数据持久化** | 两个 named volume：`animation-studio-data` → `/app/.data`（`studio.db` + Agent SDK 会话状态根）；`animation-studio-config` → `/app/.claude`（LLM 配置 `setting.agent.json`）。容器删除/重建数据不丢。 |
| **LLM 配置** | **默认在浏览器 UI 里填**（首次启动后点设置图标），写入持久化卷；也可选择只读挂载宿主机现成配置文件（见「方式 B」）。**不烘焙进镜像**。 |
| **Claude CLI 子进程** | SDK 会 spawn Claude Code CLI；entrypoint 预置 `~/.claude.json` 的 `hasCompletedOnboarding:true`，避免容器内卡 onboarding。 |
| **原生模块** | `better-sqlite3` + SDK 平台二进制在构建阶段于目标架构编译；生产镜像不含编译工具链。 |
| **非 root 运行** | 容器以 `app` 用户运行（CLI 的 `--dangerously-skip-permissions` 禁止 root，同时也是安全最佳实践）。 |
| **信号处理** | `tini` 作 PID 1，正确转发 SIGTERM，WS/子进程优雅退出。 |

---

## 快速开始（docker compose）

### 1. 构建并启动

```bash
docker compose up -d --build
```

> 无需提前准备任何配置文件。

### 2. 首次配置 LLM

打开 `http://localhost:5174` → 点右上角设置图标 → 填 **Base URL / API Key / 模型名** → 保存。

配置写到容器内 `/app/.claude/setting.agent.json`（持久化在命名卷里，容器重建后仍在）。保存后即可开始对话，agent 立刻可用。

### 3. 查看日志 / 停止 / 更新

```bash
docker compose logs -f          # 实时日志
docker compose down             # 停止（保留数据卷）
docker compose down -v          # 停止并删除数据卷（⚠️ 清空所有项目/会话）
docker compose up -d --build    # 代码更新后重新构建
```

---

## 纯 docker（不用 compose）

```bash
# 构建镜像
docker build -t animation-studio .

# 运行（持久化数据 + 配置卷；LLM 配置进页面后再填）
docker run -d \
  --name animation-studio \
  -p 5174:5174 \
  -v animation-studio-data:/app/.data \
  -v animation-studio-config:/app/.claude \
  -e CLAUDE_SETTINGS_FILE=/app/.claude/setting.agent.json \
  --restart unless-stopped \
  animation-studio
```

> 启动后打开页面，在 UI 里填 LLM 配置并保存。

---

## 方式 B：用宿主机现成配置文件（跳过 UI）

如果你已经有 `setting.agent.json`（例如从别的环境拷贝过来），可以只读挂载，省去页面填写。在 `docker-compose.yml` 的 volumes 里取消注释：

```yaml
- ./.claude/setting.agent.json:/app/.claude/setting.agent.json:ro
```

或纯 docker run：

```bash
docker run -d --name animation-studio -p 5174:5174 \
  -v animation-studio-data:/app/.data \
  -v "$PWD/.claude/setting.agent.json":/app/.claude/setting.agent.json:ro \
  -e CLAUDE_SETTINGS_FILE=/app/.claude/setting.agent.json \
  --restart unless-stopped animation-studio
```

`setting.agent.json` 最小示例：

```json
{
  "permissions": { "allow": ["Bash", "Read", "Write", "Edit", "Create", "Skill"] },
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-endpoint/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "sk-xxx",
    "ANTHROPIC_MODEL": "your-model",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "your-model",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "your-model",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "your-model",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  }
}
```

> 注意：只读挂载后，UI 里的「保存」会写不进去（文件是只读的），但 agent 能正常读用。

---

## 数据卷说明

两个命名卷：

```
animation-studio-data → /app/.data/
├── studio.db          # SQLite 主库（projects / versions / messages）
├── studio.db-shm      # WAL 辅助文件
├── studio.db-wal
└── sessions/          # CLAUDE_CONFIG_DIR —— Claude Agent SDK 整个状态根
    ├── projects/      #   各项目的会话 JSONL（agent 多轮记忆）
    ├── .credentials.json
    ├── todos/
    └── ...

animation-studio-config → /app/.claude/
└── setting.agent.json   # LLM 配置（UI 里填后写到这里）
```

**备份**：

```bash
docker run --rm -v animation-studio-data:/data -v animation-studio-config:/config \
  -v "$PWD":/backup alpine \
  sh -c "tar czf /backup/studio-backup-$(date +%F).tar.gz -C / data -C / config"
```

**恢复**：解压回卷即可，或在 `docker compose down` 后把内容放进新的 named volume。

---

## 跨架构构建（云服务器常用 amd64）

在 M 系列 Mac 上构建 amd64 镜像推送到服务器：

```bash
docker buildx build --platform linux/amd64 -t animation-studio:latest --load .
# 或推到镜像仓库：
docker buildx build --platform linux/amd64 -t <registry>/animation-studio:latest --push .
```

---

## 常见问题

**容器启动了但 agent 报错 / 不响应**
→ 看日志里 `[entrypoint]` 是否提示认证文件缺失；确认挂载路径和 `CLAUDE_SETTINGS_FILE` 一致。

**升级后数据还在吗？**
→ 在。数据在 named volume，与镜像生命周期解耦。`docker compose up -d --build` 只换镜像，不动卷。

**端口被占用**
→ 改 `.env` 的 `PORT`（仅改宿主机侧映射，容器内固定 5174）。

**想彻底重置**
→ `docker compose down -v` 会删数据卷，下次启动等于全新环境。
