// ============================================================
// ProjectSwitcher.tsx — 顶部项目切换 + 新建
//
// - 自己 fetch /api/projects 拿列表（轻量，不进 projectStore）
// - shadcn Select 切换当前项目，触发 projectStore.loadProject
// - 新建按钮 → projectStore.createProject
// - App mount 时也会调用 onFirstLoad，让外层首次自动进入最近项目
// ============================================================

import { useEffect, useState } from "react";
import { useProjectStore } from "../store/projectStore";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  const handleSelect = (id: string) => {
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
    <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-foreground shrink-0">
      <span className="font-display text-base font-bold tracking-tight text-primary uppercase">
        Animation Studio
      </span>
      <Select
        value={projectId ?? ""}
        onValueChange={handleSelect}
        disabled={loading || creating}
      >
        <SelectTrigger size="sm" className="flex-1 min-w-0">
          <SelectValue placeholder={list.length === 0 ? "— 还没有项目 —" : "选择项目"} />
        </SelectTrigger>
        <SelectContent>
          {list.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.title}
              {p.draft_id ? " (有草稿)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        onClick={handleCreate}
        disabled={creating}
        variant="outline"
        size="sm"
      >
        {creating ? "…" : "新建"}
      </Button>
    </div>
  );
}
