// ============================================================
// ToolCallCard — 通用工具调用卡片（assistant-ui tools.Fallback）
//
// 接收 ToolCallMessagePartProps：toolName / args / argsText / result /
// isError / status。所有工具（MCP 自定义、内置 Read/Write/Bash、skill
// 调用）都走这一个组件，按 toolName 给前 3 个已知工具一个友好摘要，
// 其它直接显示 JSON args。
//
// 视觉：Duotone Poster —— 硬边框、等宽字体、状态色（primary 绿 ✓ / 红 ✕）。
// ============================================================

import { useState } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import type { SceneConfig } from "../types/scene";
import { PaletteProposalPicker } from "./PaletteProposalPicker";

export const ToolCallCard: ToolCallMessagePartComponent = ({
  toolName,
  args,
  argsText,
  result,
  isError,
  status,
}) => {
  const [expanded, setExpanded] = useState(false);
  const running = status?.type === "running";
  // MCP 工具名带 mcp__<server>__ 前缀，归一化为短名再匹配
  const shortName = shortToolName(toolName);
  const summary = summarizeTool(shortName, args);
  const argsDisplay = argsText ?? (args ? JSON.stringify(args, null, 2) : "");

  return (
    <div
      className="tool-card"
      data-tool={shortName}
      data-status={running ? "running" : isError ? "error" : "complete"}
    >
      <button
        type="button"
        className="tool-card-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="tool-card-status" aria-hidden="true">
          {running ? (
            <span className="tool-card-spinner" />
          ) : isError ? (
            "✕"
          ) : (
            "✓"
          )}
        </span>
        <span className="tool-card-name">{shortName}</span>
        {summary && <span className="tool-card-summary">{summary}</span>}
        <span className="tool-card-toggle" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {!running && !isError && shortName === "generate_color_palettes" && (
        <PaletteProposalPicker result={result} />
      )}

      {expanded && argsDisplay && (
        <pre className="tool-card-body">{argsDisplay}</pre>
      )}

      {expanded && (result !== undefined || isError) && (
        <div className="tool-card-result" data-error={isError || undefined}>
          {typeof result === "string" ? result : JSON.stringify(result)}
        </div>
      )}
    </div>
  );
};

// MCP 工具名形如 mcp__studio__generate_color_palettes，去掉服务器前缀再匹配
function shortToolName(name: string): string {
  return name.replace(/^mcp__[a-zA-Z0-9_]+__/, "");
}

// ── 已知工具的友好摘要 ──
// 未知工具（含未来启用的内置工具 Read/Write/Bash 等）走 fallback，
// 不显示 summary，展开后直接看 JSON args。
function summarizeTool(name: string, args: unknown): string | null {
  if (!args || typeof args !== "object") return null;
  switch (name) {
    case "update_scene_config": {
      const cfg = args as Partial<SceneConfig>;
      const actors = cfg.actors?.length ?? 0;
      const phases = cfg.phases?.length ?? 0;
      const effects = cfg.effects?.length ?? 0;
      return `更新场景 · ${actors} actors · ${phases} phases${
        effects > 0 ? ` · ${effects} effects` : ""
      }`;
    }
    case "get_version_history":
      return "查询版本历史";
    case "generate_color_palettes": {
      const a = args as { seedColor?: string };
      return `生成配色 · 主色 ${a.seedColor ?? ""}`;
    }
    case "rollback_to_version": {
      const a = args as { targetVersionId?: string };
      const id = a.targetVersionId ?? "";
      return `回滚到 ${id.slice(0, 8)}`;
    }
    default:
      return null;
  }
}
