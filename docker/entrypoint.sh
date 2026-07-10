#!/bin/sh
# ============================================================
# entrypoint.sh — 容器启动入口（被 tini 调用）
#
# 职责：
# 1. 确保 ~/.claude.json 含 hasCompletedOnboarding:true
#    —— Claude Agent SDK 会 spawn Claude Code CLI 子进程；CLI 首次
#    启动若无此标记会卡在交互式 onboarding，导致 agent 永久挂起。
#    Docker 环境无法走交互流程，所以必须预先置好。
# 2. 友好检查认证文件（setting.agent.json），缺失则打印指引（不阻断，
#    让用户能在日志里看到原因，而不是容器反复 crash）。
# 3. exec 接管 PID 1 跑主进程（CMD）。
# ============================================================
set -e

CLAUDE_JSON="$HOME/.claude.json"
SETTINGS_FILE="${CLAUDE_SETTINGS_FILE:-/app/.claude/setting.agent.json}"

# ---- 1. 预置 ~/.claude.json onboarding 标记 ----
if [ ! -f "$CLAUDE_JSON" ]; then
  echo "[entrypoint] 创建 $CLAUDE_JSON (hasCompletedOnboarding=true)"
  mkdir -p "$(dirname "$CLAUDE_JSON")"
  printf '{"hasCompletedOnboarding":true}' > "$CLAUDE_JSON"
else
  # 已存在但缺标记则补上（尽量不破坏已有内容）
  if ! grep -q '"hasCompletedOnboarding":true' "$CLAUDE_JSON" 2>/dev/null; then
    echo "[entrypoint] 补写 onboarding 标记到 $CLAUDE_JSON"
    # 简单处理：若文件非合法 JSON 则直接覆盖为最小模板
    if node -e "JSON.parse(require('fs').readFileSync('$CLAUDE_JSON','utf8'))" 2>/dev/null; then
      node -e "
        const fs=require('fs');
        const p='$CLAUDE_JSON';
        const o=JSON.parse(fs.readFileSync(p,'utf8'));
        o.hasCompletedOnboarding=true;
        fs.writeFileSync(p,JSON.stringify(o,null,2));
      "
    else
      printf '{"hasCompletedOnboarding":true}' > "$CLAUDE_JSON"
    fi
  fi
fi

# ---- 2. LLM 配置检查（非阻断）----
# 配置文件 setting.agent.json 的两种来源：
#   A) 首次启动后在浏览器 UI 里填（写到 $SETTINGS_FILE，持久化在卷里）—— 默认
#   B) 宿主机现成文件只读挂载进来 —— 见 docker-compose.yml 注释
if [ ! -f "$SETTINGS_FILE" ]; then
  cat <<EOF
[entrypoint] ℹ️ 尚未配置 LLM（$SETTINGS_FILE 不存在）

  服务已启动。请打开页面 → 点右上角设置图标 → 填写
  Base URL / API Key / 模型名 → 保存。保存后 agent 即可使用。

  （若想跳过 UI、直接用现成配置文件，见 docker/README.md 的「方式 B」。）
EOF
else
  echo "[entrypoint] LLM 配置就绪: $SETTINGS_FILE"
fi

# ---- 3. 确保持久化目录可写 ----
mkdir -p /app/.data/sessions

echo "[entrypoint] 启动 Animation Studio ..."
exec "$@"
