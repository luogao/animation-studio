// ============================================================
// ProjectListPage.tsx — 项目管理页面
// ============================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppNav } from "../components/AppNav";
import { ProjectCard } from "../components/ProjectCard";
import { useProjectStore } from "../store/projectStore";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface ProjectListItem {
  id: string;
  title: string;
  updated_at: number;
  head_sequence: number | null;
  draft_id: string | null;
}

export default function ProjectListPage() {
  const navigate = useNavigate();
  const createProject = useProjectStore((s) => s.createProject);

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) setProjects(await res.json());
    } catch (err) {
      console.error("[projects] list failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async () => {
    setBusy(true);
    try {
      await createProject();
      await refresh();
      const projectId = useProjectStore.getState().projectId;
      if (projectId) navigate(`/p/${projectId}`);
    } catch (err) {
      console.error("[projects] create failed:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-paper overflow-hidden">
      <AppNav />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">
          {/* 头部 */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">
                项目列表
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                {loading
                  ? "加载中…"
                  : `${projects.length} 个项目`}
              </p>
            </div>
            <Button onClick={handleCreate} disabled={busy} size="sm">
              <Plus size={14} />
              {busy ? "创建中…" : "新建项目"}
            </Button>
          </div>

          {/* 列表 */}
          {loading ? (
            <div className="text-sm text-muted-foreground text-center py-16">
              加载中…
            </div>
          ) : projects.length === 0 ? (
            <div className="border-2 border-dashed border-foreground/20 p-16 text-center flex flex-col items-center gap-4">
              <p className="text-muted-foreground text-sm">
                还没有项目
              </p>
              <Button onClick={handleCreate} disabled={busy} variant="outline" size="sm">
                <Plus size={14} />
                创建第一个项目
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onDeleted={refresh}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
