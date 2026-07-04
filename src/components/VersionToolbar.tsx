// ============================================================
// VersionToolbar.tsx — 版本管理工具条
//
// 4 个动作（plain <button>）：
// - 提交草稿：projectStore.commitDraft（仅 draft 存在时可用）
// - 丢弃草稿：projectStore.discardDraft（仅 draft 存在时可用）
// - 版本下拉：列出所有 committed 版本，选中 → 准备 rollback 目标
// - 回滚到选中：projectStore.rollbackTo(selectedId)
//
// 状态指示：当前 head 序号 / draft 序号 / loading
// ============================================================

import { useEffect, useState } from "react";
import { useProjectStore } from "../store/projectStore";

export function VersionToolbar() {
  const projectId = useProjectStore((s) => s.projectId);
  const versions = useProjectStore((s) => s.versions);
  const headVersionId = useProjectStore((s) => s.headVersionId);
  const draft = useProjectStore((s) => s.draft);
  const loading = useProjectStore((s) => s.loading);
  const commitDraft = useProjectStore((s) => s.commitDraft);
  const discardDraft = useProjectStore((s) => s.discardDraft);
  const rollbackTo = useProjectStore((s) => s.rollbackTo);

  // 回滚目标：默认指向当前 head
  const [rollbackTarget, setRollbackTarget] = useState<string>("");
  useEffect(() => {
    setRollbackTarget(headVersionId ?? "");
  }, [headVersionId, projectId]);

  // 只能回滚到 committed 版本（不能回滚到 draft）
  const committedVersions = versions.filter((v) => v.status === "committed");
  const headVersion = versions.find((v) => v.id === headVersionId);

  const hasDraft = !!draft;
  const canRollback =
    !!rollbackTarget &&
    rollbackTarget !== headVersionId &&
    committedVersions.length > 1;

  const handleCommit = () => {
    const label = window.prompt("给这个版本起个名字？（可留空）");
    if (label === null) return; // 用户取消
    void commitDraft(label.trim() || undefined);
  };

  const handleDiscard = () => {
    if (!window.confirm("丢弃当前草稿？此操作不可撤销。")) return;
    void discardDraft();
  };

  const handleRollback = () => {
    if (!rollbackTarget) return;
    if (
      !window.confirm(
        `回滚到 v${
          committedVersions.find((v) => v.id === rollbackTarget)?.sequence ?? "?"
        }？会先提交当前草稿（如有），再以目标为基础开新分支。`
      )
    )
      return;
    void rollbackTo(rollbackTarget);
  };

  return (
    <div className="version-toolbar" style={wrapperStyle}>
      {/* 状态指示 */}
      <span style={statusStyle}>
        {headVersion
          ? draft
            ? `v${headVersion.sequence} · 草稿中`
            : `v${headVersion.sequence}`
          : "—"}
      </span>

      <button
        type="button"
        onClick={handleCommit}
        disabled={!hasDraft || loading}
        style={{
          ...btnStyle,
          background: hasDraft ? "#E8A230" : "#333",
          color: hasDraft ? "#0a0a0b" : "#666",
          opacity: loading ? 0.5 : 1,
          cursor: !hasDraft || loading ? "not-allowed" : "pointer",
        }}
      >
        提交草稿
      </button>

      <button
        type="button"
        onClick={handleDiscard}
        disabled={!hasDraft || loading}
        style={{
          ...btnStyle,
          opacity: !hasDraft || loading ? 0.5 : 1,
          cursor: !hasDraft || loading ? "not-allowed" : "pointer",
        }}
      >
        丢弃草稿
      </button>

      <span style={dividerStyle}>|</span>

      <select
        value={rollbackTarget}
        onChange={(e) => setRollbackTarget(e.target.value)}
        disabled={committedVersions.length === 0 || loading}
        style={selectStyle}
        title="选择回滚目标版本"
      >
        {committedVersions.length === 0 && (
          <option value="">— 无版本 —</option>
        )}
        {committedVersions
          .slice()
          .sort((a, b) => b.sequence - a.sequence)
          .map((v) => (
            <option key={v.id} value={v.id}>
              v{v.sequence}
              {v.label ? ` · ${v.label}` : ""}
              {v.id === headVersionId ? "  (head)" : ""}
            </option>
          ))}
      </select>

      <button
        type="button"
        onClick={handleRollback}
        disabled={!canRollback || loading}
        style={{
          ...btnStyle,
          opacity: !canRollback || loading ? 0.5 : 1,
          cursor: !canRollback || loading ? "not-allowed" : "pointer",
        }}
      >
        回滚
      </button>
    </div>
  );
}

// ============================================================
// 样式
// ============================================================

const wrapperStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
};

const statusStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#999",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  padding: "0 6px",
};

const btnStyle: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 4,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const selectStyle: React.CSSProperties = {
  background: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: 4,
  color: "#eee",
  padding: "4px 6px",
  fontSize: 12,
  outline: "none",
  cursor: "pointer",
};

const dividerStyle: React.CSSProperties = {
  color: "#444",
  padding: "0 4px",
};
