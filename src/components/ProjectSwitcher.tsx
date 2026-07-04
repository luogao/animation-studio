// ============================================================
// ProjectSwitcher.tsx — 顶部项目切换 + 新建
//
// - 自己 fetch /api/projects 拿列表（轻量，不进 projectStore）
// - <select> 切换当前项目，触发 projectStore.loadProject
// - 新建按钮 → projectStore.createProject
// - App mount 时也会调用 onFirstLoad，让外层首次自动进入最近项目
// ============================================================

import { useEffect, useState } from "react";
import { useProjectStore } from "../store/projectStore";

interface ProjectListItem {
  id: string;
  title: string;
  updated_at: number;
  head_sequence: number | null;
  draft_id: string | null;
}

export function ProjectSwitcher() {
  const projectId = useProjectStore((s) => s.projectId);
  const loadProject = useProjectStore((s) => s.loadProject);
  const createProject = useProjectStore((s) => s.createProject);
  const loading = useProjectStore((s) => s.loading);

  const [list, setList] = useState<ProjectListItem[]>([]);
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) setList(await res.json());
    } catch (err) {
      console.error("[projects] list failed:", err);
    }
  };

  // mount: 拉列表；若无选中项且有项目，自动选最近一个
  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, []);

  // 列表就位后，若 projectStore 还没选中任何项目，挑第一个（最近）
  useEffect(() => {
    if (!projectId && list.length > 0) {
      void loadProject(list[0].id);
    }
  }, [list, projectId, loadProject]);

  const handleChange = (id: string) => {
    if (id === "__new__") {
      void handleCreate();
      return;
    }
    void loadProject(id);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createProject();
      await refresh();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={wrapperStyle}>
      <span style={titleStyle}>Animation Studio</span>
      <select
        value={projectId ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        disabled={loading || creating}
        style={selectStyle}
      >
        {list.length === 0 && !creating && (
          <option value="">— 还没有项目 —</option>
        )}
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
            {p.draft_id ? " (有草稿)" : ""}
          </option>
        ))}
      </select>
      <button
        onClick={handleCreate}
        disabled={creating}
        style={{
          ...btnStyle,
          opacity: creating ? 0.5 : 1,
          cursor: creating ? "not-allowed" : "pointer",
        }}
        type="button"
      >
        {creating ? "…" : "新建"}
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
  gap: 8,
  padding: "10px 12px",
  borderBottom: "1px solid #222",
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#E8A230",
  letterSpacing: 0.3,
};

const selectStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: 6,
  color: "#eee",
  padding: "6px 8px",
  fontSize: 13,
  outline: "none",
  cursor: "pointer",
};

const btnStyle: React.CSSProperties = {
  background: "#222",
  color: "#eee",
  border: "1px solid #333",
  borderRadius: 6,
  padding: "6px 12px",
  fontSize: 13,
  fontWeight: 500,
  whiteSpace: "nowrap",
};
