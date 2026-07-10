// ============================================================
// ProjectCard.tsx — 项目列表卡片
// ============================================================

import { useNavigate } from "react-router-dom";
import { useProjectStore } from "../store/projectStore";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScenePreviewThumb } from "./ScenePreviewThumb";
import type { SceneConfig } from "../types/scene";

interface ProjectListItem {
  id: string;
  title: string;
  updated_at: number;
  head_sequence: number | null;
  draft_id: string | null;
  config: SceneConfig | null;
}

interface ProjectCardProps {
  project: ProjectListItem;
  onDeleted: () => void;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  return `${months} 个月前`;
}

export function ProjectCard({ project, onDeleted }: ProjectCardProps) {
  const navigate = useNavigate();
  const loadProject = useProjectStore((s) => s.loadProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(project.title);
  const [displayTitle, setDisplayTitle] = useState(project.title);
  const [busy, setBusy] = useState(false);

  const handleOpen = async () => {
    setBusy(true);
    try {
      await loadProject(project.id);
      navigate(`/p/${project.id}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    if (!titleDraft.trim() || titleDraft === displayTitle) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleDraft.trim() }),
      });
      setDisplayTitle(titleDraft.trim());
      setRenaming(false);
    } catch {
      // keep editing
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      await deleteProject(project.id);
      onDeleted();
    } catch {
      /* error shown in store */
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="border-2 border-foreground bg-card hover:bg-muted/50 transition-colors overflow-hidden flex flex-col">
        {/* 场景缩略预览 */}
        {project.config ? (
          <div className="h-28 shrink-0 overflow-hidden border-b border-foreground/20">
            <ScenePreviewThumb config={project.config} />
          </div>
        ) : (
          <div className="h-28 shrink-0 border-b border-foreground/20 bg-muted/30" />
        )}

        <div className="p-5 flex flex-col gap-3 flex-1">
        {/* 标题行 */}
        <div className="flex items-center justify-between gap-3">
          {renaming ? (
            <input
              className="flex-1 min-w-0 text-sm font-display font-bold bg-transparent border-b-2 border-primary outline-none px-1 py-0.5"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") {
                  setTitleDraft(displayTitle);
                  setRenaming(false);
                }
              }}
              onBlur={handleRename}
              autoFocus
            />
          ) : (
            <h3
              className="font-display text-sm font-bold text-foreground cursor-pointer hover:text-primary transition-colors truncate"
              onClick={handleOpen}
            >
              {displayTitle}
              {project.draft_id && (
                <span className="ml-2 text-[10px] text-primary font-normal align-middle">
                  草稿
                </span>
              )}
            </h3>
          )}

          {/* 版本号 */}
          {project.head_sequence != null && (
            <span className="text-[11px] font-mono text-muted-foreground shrink-0">
              v{project.head_sequence}
            </span>
          )}
        </div>

        {/* 更新时间 */}
        <p className="text-xs text-muted-foreground">
          最后更新: {timeAgo(project.updated_at)}
        </p>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2 mt-auto">
          <Button
            onClick={handleOpen}
            disabled={busy}
            variant="default"
            size="sm"
          >
            打开
          </Button>
          <Button
            onClick={() => setRenaming(true)}
            disabled={busy || renaming}
            variant="outline"
            size="sm"
          >
            重命名
          </Button>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10"
          >
            删除
          </Button>
        </div>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除项目「{displayTitle}」及其所有版本和消息。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
