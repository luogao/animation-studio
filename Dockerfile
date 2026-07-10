# ============================================================
# Animation Studio — Dockerfile
#
# 多阶段构建（node:22-slim / Debian glibc）：
#   1. deps    —— 安装全部依赖（含 better-sqlite3 原生模块、
#                Claude Agent SDK 的平台原生二进制）
#   2. build   —— tsc typecheck + vite build，产出 dist/ 前端产物
#   3. runtime —— 只拷必要产物 + 生产依赖，体积最小
#
# 关键点：
# - better-sqlite3 是 native addon，必须在目标平台编译 → 用容器内的
#   node-gyp + 编译工具链；然后 npm prune --omit=dev 留下生产依赖。
# - Claude Agent SDK 会 spawn Claude Code CLI 子进程（平台二进制），
#   必须在容器架构对应的平台包里被 npm 拉下来。
# - 认证（setting.agent.json）运行时注入，不烘焙进镜像（见 compose）。
# - 容器内 HOME 下需要 ~/.claude.json（hasCompletedOnboarding:true），
#   否则 CLI 子进程会卡在交互式 onboarding → 由 entrypoint 保证。
# ============================================================

# ---- build arg：目标架构。docker buildx 会自动注入 BUILDPLATFORM/TARGETPLATFORM ----
FROM node:22-slim AS base

# better-sqlite3 编译需要 python3 + make + g++；git 也常被 node-gyp 用到
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 make g++ git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ============================================================
# Stage 1: deps —— 装全量依赖（含 devDependencies，构建期需要）
# ============================================================
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
# 容器里没有锁文件也能继续（首构建会生成），有则走锁文件保证可复现
RUN npm ci || npm install

# ============================================================
# Stage 2: build —— typecheck + vite build
# ============================================================
FROM base AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 构建前端产物到 dist/（含 tsc typecheck）。
# 服务端不打包，运行期由 node 直接跑 ESM。
RUN npm run build

# 裁剪出生产依赖（无 devDependencies），runtime 阶段直接复用，
# 避免 runtime 再装一遍 native 模块。
RUN npm prune --omit=dev

# ============================================================
# Stage 3: runtime —— 最小运行镜像
# ============================================================
FROM node:22-slim AS runtime

# runtime 只需要 ca-certificates（HTTPS 出站用）；不需要编译工具链
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

# ---- 非 root 用户 ----
# 必须用非 root：SDK 跑 Claude Code CLI 时会用 --dangerously-skip-permissions
# （permissionMode=bypassPermissions），而 CLI 出于安全禁止以 root 身份使用该
# 标志，否则 CLI 进程直接退出码 1，agent 永远拿不到响应。
# 用非 root 跑同时也是容器安全最佳实践。
RUN groupadd --system app && useradd --system --gid app --create-home --shell /bin/sh app

WORKDIR /app

# ---- 拷贝应用代码 + 生产依赖 + 前端产物 ----
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/server ./server
COPY --from=build --chown=app:app /app/src ./src
COPY --from=build --chown=app:app /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=app:app /app/tsconfig.server.json ./tsconfig.server.json
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/docker/entrypoint.sh ./docker/entrypoint.sh

# ---- 运行时目录与数据卷 ----
# /app/.data  —— SQLite 库 + Claude Agent SDK 状态根（CLAUDE_CONFIG_DIR）
# 运行期挂载 named volume 到这里实现持久化（见 docker-compose.yml）。
# 归 app:app，否则非 root 进程无法写。
RUN mkdir -p /app/.data && chown -R app:app /app/.data
# /app/.claude —— LLM 配置目录（setting.agent.json）。
# named volume 首次挂载时会拷贝镜像里这个目录的内容与属主，所以必须归 app:app，
# 否则首次启动 UI 保存配置时写不进去（卷里属主是 root）。
RUN mkdir -p /app/.claude && chown -R app:app /app/.claude
VOLUME ["/app/.data", "/app/.claude"]

# ---- 环境变量 ----
ENV NODE_ENV=production \
    PORT=5174 \
    # 非 root 用户的 HOME；entrypoint 会在 $HOME/.claude.json 写 onboarding 标记
    HOME=/home/app \
    # SDK 把整个 Claude 状态根重定位到 .data/sessions（见 CLAUDE.md），
    # 这样 sessions/credentials/todos 都进持久化卷
    CLAUDE_CONFIG_DIR=/app/.data/sessions \
    # SQLite 库位置（与 sessions 同级，进同一持久化卷）
    STUDIO_DB_PATH=/app/.data/studio.db

EXPOSE 5174

USER app

# tini：正确处理信号转发（WS/子进程优雅退出）；entrypoint 负责初始化
# ~/.claude.json 后再 exec node
RUN chmod +x /app/docker/entrypoint.sh
ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrypoint.sh"]
CMD ["node", "--import", "tsx", "server/index.ts"]
