// ============================================================
// StudioHeader.tsx — 沉浸式 Studio 顶部工具栏
// ============================================================

import { useNavigate } from "react-router-dom";
import { useProjectStore } from "../store/projectStore";
import { useSelectionStore } from "../store/selectionStore";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { CanvasSizeControl } from "./CanvasSizeControl";
import { ColorPalettePanel } from "./ColorPalettePanel";
import { LlmConfigDialog } from "./LlmConfigDialog";
import { buildExportEnvelope, downloadConfig } from "../lib/exportConfig";
import { exportVideo, exportGif, exportMp4 } from "../lib/exportMedia";
import { toast } from "sonner";
import { useState, useRef, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export function StudioHeader() {
  const navigate = useNavigate();
  const projectTitle = useProjectStore((s) => s.projectTitle);
  const draft = useProjectStore((s) => s.draft);
  const versions = useProjectStore((s) => s.versions);
  const headVersionId = useProjectStore((s) => s.headVersionId);
  const commitDraft = useProjectStore((s) => s.commitDraft);
  const discardDraft = useProjectStore((s) => s.discardDraft);
  const rollbackTo = useProjectStore((s) => s.rollbackTo);
  const isEditMode = useSelectionStore((s) => s.isEditMode);
  const toggleEditMode = useSelectionStore((s) => s.toggleEditMode);
  const loading = useProjectStore((s) => s.loading);

  // ── 导出下拉 ──
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // ── 版本回滚 ──
  const [rollbackTarget, setRollbackTarget] = useState<string>("");
  const [confirmRollback, setConfirmRollback] = useState(false);
  useEffect(() => {
    setRollbackTarget(headVersionId ?? "");
  }, [headVersionId]);

  useEffect(() => {
    if (!exportOpen) return;
    const onDown = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [exportOpen]);

  const handleExport = async () => {
    const s = useProjectStore.getState();
    const result = buildExportEnvelope({
      projectId: s.projectId ?? "",
      projectTitle: s.projectTitle ?? "未命名",
      headVersionId: s.headVersionId,
      committedConfig: s.committedConfig,
      draft: s.draft,
      versions: s.versions,
    });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    const filename = await downloadConfig(result.envelope);
    toast.success(`已导出 ${filename}`, {
      description:
        result.envelope.status === "draft"
          ? "草稿状态 — 提交后版本号会推进"
          : `v${result.envelope.sequence} committed`,
    });
  };

  const doExportMedia = async (
    format: "video" | "gif" | "mp4",
    label: string
  ) => {
    setExportOpen(false);
    if (exportBusy) return;
    const config =
      useProjectStore.getState().draft?.config ??
      useProjectStore.getState().committedConfig;
    setExportBusy(true);
    toast.info(`开始导出 ${label}...`);
    try {
      const exporters = {
        video: exportVideo,
        gif: exportGif,
        mp4: exportMp4,
      } as const;
      const fn = exporters[format];
      await fn(config, (phase) => {
        toast.info(phase, { duration: 2000 });
      });
      toast.success(`${label} 导出完成`);
    } catch (err) {
      toast.error(`导出失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExportBusy(false);
    }
  };

  // ── 版本信息 ──
  const committedVersions = versions
    .filter((v) => v.status === "committed")
    .sort((a, b) => b.sequence - a.sequence);
  const headVersion = committedVersions[0];
  const versionLabel = draft
    ? `v${(headVersion?.sequence ?? 0) + 1} 草稿`
    : headVersion
      ? `v${headVersion.sequence}`
      : "";

  // 回滚目标：选中一个非 head 的 committed 版本才可回滚
  const canRollback =
    !!rollbackTarget &&
    rollbackTarget !== headVersionId &&
    committedVersions.length > 1;
  const rollbackTargetVersion = committedVersions.find(
    (v) => v.id === rollbackTarget
  );
  // Radix Select 要求 value 命中某个 SelectItem，加载前先给空串走 placeholder
  const selectValue = committedVersions.some((v) => v.id === rollbackTarget)
    ? rollbackTarget
    : "";

  const handleConfirmRollback = async () => {
    setConfirmRollback(false);
    if (rollbackTarget) await rollbackTo(rollbackTarget);
  };

  return (
    <header className="studio-header flex items-center gap-2 px-4 py-2 border-b-2 border-foreground bg-paper shrink-0">
      {/* 返回 */}
      <Button
        onClick={() => navigate("/projects")}
        variant="ghost"
        size="icon-sm"
        title="返回项目列表"
      >
        <ArrowLeft size={16} />
      </Button>

      {/* 项目标题 + 版本 */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-display text-sm font-bold truncate max-w-[180px]">
          {projectTitle ?? "…"}
        </span>
        {versionLabel && (
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">
            {versionLabel}
          </span>
        )}
      </div>

      {/* 草稿操作 */}
      {draft && (
        <div className="flex items-center gap-1.5 ml-2">
          <Button
            onClick={() => commitDraft()}
            disabled={loading}
            variant="default"
            size="sm"
          >
            提交
          </Button>
          <Button
            onClick={() => discardDraft()}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            丢弃
          </Button>
        </div>
      )}

      {/* 版本回滚：下拉选目标 committed 版本 → 回滚 */}
      {committedVersions.length > 0 && (
        <div className="flex items-center gap-1.5 ml-2">
          <Select
            value={selectValue}
            onValueChange={setRollbackTarget}
            disabled={loading}
          >
            <SelectTrigger
              size="sm"
              className="h-8 text-xs w-32"
              title="选择回滚目标版本"
            >
              <SelectValue placeholder="选择版本" />
            </SelectTrigger>
            <SelectContent>
              {committedVersions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  v{v.sequence}
                  {v.label ? ` · ${v.label}` : ""}
                  {v.id === headVersionId ? "  (head)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={() => setConfirmRollback(true)}
            disabled={!canRollback || loading}
            variant="outline"
            size="sm"
          >
            回滚
          </Button>
        </div>
      )}

      {/* 右侧工具栏 */}
      <div className="ml-auto flex items-center gap-2">
        <CanvasSizeControl />
        <Button
          onClick={toggleEditMode}
          variant={isEditMode ? "default" : "secondary"}
          size="sm"
        >
          {isEditMode ? "编辑中" : "选择"}
        </Button>
        <ColorPalettePanel />
        <LlmConfigDialog />

        {/* 导出下拉 */}
        <div className="relative" ref={exportRef}>
          <Button
            onClick={() => setExportOpen((v) => !v)}
            variant="secondary"
            size="sm"
            disabled={exportBusy}
          >
            {exportBusy ? "导出中..." : "导出"}
          </Button>
          {exportOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px]">
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                onClick={() => {
                  setExportOpen(false);
                  handleExport();
                }}
              >
                导出配置 (JSON)
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                onClick={() => doExportMedia("mp4", "视频 (MP4)")}
              >
                导出视频 (MP4)
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                onClick={() => doExportMedia("video", "视频 (WebM)")}
              >
                导出视频 (WebM)
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                onClick={() => doExportMedia("gif", "GIF")}
              >
                导出 GIF
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── 回滚确认对话框 ── */}
      <AlertDialog open={confirmRollback} onOpenChange={setConfirmRollback}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              回滚到 v{rollbackTargetVersion?.sequence ?? "?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              会先提交当前草稿（如有），再以目标版本为父开一个新的
              committed 分支。历史不会被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRollback}>
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
