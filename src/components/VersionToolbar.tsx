// ============================================================
// VersionToolbar.tsx — 版本管理工具条
//
// 4 个动作（shadcn Button）：
// - 提交草稿：projectStore.commitDraft（仅 draft 存在时可用）
// - 丢弃草稿：projectStore.discardDraft（仅 draft 存在时可用）
// - 版本下拉（shadcn Select）：列出所有 committed 版本，选中 → 回滚目标
// - 回滚到选中：projectStore.rollbackTo(selectedId)
//
// 状态指示：当前 head 序号 / draft 序号 / loading
// 确认对话框：用 shadcn AlertDialog 替代 window.confirm / prompt
// 项目重命名：点击标题进入编辑模式，Enter 保存，Esc 取消
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../store/projectStore";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";

type ConfirmKind = "commit" | "discard" | "rollback" | null;

export function VersionToolbar() {
  const projectId = useProjectStore((s) => s.projectId);
  const projectTitle = useProjectStore((s) => s.projectTitle);
  const versions = useProjectStore((s) => s.versions);
  const headVersionId = useProjectStore((s) => s.headVersionId);
  const draft = useProjectStore((s) => s.draft);
  const loading = useProjectStore((s) => s.loading);
  const commitDraft = useProjectStore((s) => s.commitDraft);
  const discardDraft = useProjectStore((s) => s.discardDraft);
  const rollbackTo = useProjectStore((s) => s.rollbackTo);
  const renameProject = useProjectStore((s) => s.renameProject);

  // ── 项目重命名状态 ──
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  const startEditTitle = () => {
    setTitleDraft(projectTitle ?? "");
    setEditingTitle(true);
  };
  const saveTitle = async () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== projectTitle) {
      try {
        await renameProject(trimmed);
      } catch {
        // error already set in store
      }
    }
    setEditingTitle(false);
  };
  const cancelEditTitle = () => {
    setEditingTitle(false);
  };

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

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

  // ── 确认对话框状态 ──
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  // commit label 输入框
  const [commitLabel, setCommitLabel] = useState("");
  // rollback 目标的可读标签（在弹窗里给用户看）
  const rollbackTargetVersion = committedVersions.find(
    (v) => v.id === rollbackTarget
  );

  const openCommit = () => {
    setCommitLabel("");
    setConfirmKind("commit");
  };
  const openDiscard = () => setConfirmKind("discard");
  const openRollback = () => setConfirmKind("rollback");

  const handleConfirm = async () => {
    const kind = confirmKind;
    setConfirmKind(null);
    if (kind === "commit") {
      await commitDraft(commitLabel.trim() || undefined);
    } else if (kind === "discard") {
      await discardDraft();
    } else if (kind === "rollback" && rollbackTarget) {
      await rollbackTo(rollbackTarget);
    }
  };

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {/* ── 项目名称（点击可编辑）── */}
      {editingTitle ? (
        <input
          ref={titleInputRef}
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveTitle();
            if (e.key === "Escape") cancelEditTitle();
          }}
          onBlur={saveTitle}
          className="h-6 w-36 text-xs font-medium bg-background border border-primary/50 rounded px-1.5 py-0 focus:outline-none focus:border-primary"
          disabled={loading}
        />
      ) : (
        <button
          type="button"
          onClick={startEditTitle}
          disabled={loading || !projectId}
          className="text-xs font-medium text-foreground hover:text-primary truncate max-w-36 border border-transparent hover:border-border rounded px-1.5 py-px transition-colors cursor-text"
          title="点击重命名项目"
        >
          {projectTitle ?? "—"}
        </button>
      )}

      {/* 状态指示 */}
      <span className="text-xs font-mono px-1.5">
        {headVersion ? (
          draft ? (
            <span>
              <span className="text-muted-foreground">v{headVersion.sequence}</span>
              {" → "}
              <span className="text-primary font-semibold">
                v{versions.find((v) => v.id === draft.id)?.sequence ?? "?"} 草稿
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">v{headVersion.sequence}</span>
          )
        ) : (
          "—"
        )}
      </span>

      <Button
        type="button"
        onClick={openCommit}
        disabled={!hasDraft || loading}
        variant={hasDraft ? "default" : "secondary"}
        size="xs"
      >
        提交草稿
      </Button>

      <Button
        type="button"
        onClick={openDiscard}
        disabled={!hasDraft || loading}
        variant="outline"
        size="xs"
      >
        丢弃草稿
      </Button>

      <span className="text-muted-foreground/40 px-1">|</span>

      <Select
        value={rollbackTarget}
        onValueChange={setRollbackTarget}
        disabled={committedVersions.length === 0 || loading}
      >
        <SelectTrigger size="sm" className="h-7 text-xs w-32" title="选择回滚目标版本">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {committedVersions.length === 0 && (
            <SelectItem value="">— 无版本 —</SelectItem>
          )}
          {/* 草稿入口：显示但不可选（只读提示） */}
          {draft && (
            <div className="relative flex items-center px-2 py-1.5 text-xs text-muted-foreground italic border-b border-border mb-1">
              <span className="font-mono">v{versions.find(v => v.id === draft.id)?.sequence ?? "?"}</span>
              <span className="ml-2 px-1 py-px rounded bg-primary/20 text-primary text-[10px] font-medium">草稿</span>
              <span className="ml-auto opacity-50">预览中</span>
            </div>
          )}
          {committedVersions
            .slice()
            .sort((a, b) => b.sequence - a.sequence)
            .map((v) => (
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
        onClick={openRollback}
        disabled={!canRollback || loading}
        variant="outline"
        size="xs"
      >
        回滚
      </Button>

      {/* ── 确认对话框（commit / discard / rollback 共用 AlertDialog）── */}
      <AlertDialog open={confirmKind !== null} onOpenChange={(o) => !o && setConfirmKind(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmKind === "commit" && "提交草稿为新版本"}
              {confirmKind === "discard" && "丢弃当前草稿"}
              {confirmKind === "rollback" &&
                `回滚到 v${rollbackTargetVersion?.sequence ?? "?"}`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <span>
                {confirmKind === "commit" &&
                  "草稿会作为新的 committed 版本保存，当前 head 推进。版本历史不会丢。"}
                {confirmKind === "discard" &&
                  "草稿会被删除，回到当前 head 的状态。此操作不可撤销。"}
                {confirmKind === "rollback" &&
                  "会先提交当前草稿（如有），再以目标版本为父开一个新的 committed 分支。历史不会被删除。"}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirmKind === "commit" && (
            <div className="py-2">
              <Input
                value={commitLabel}
                onChange={(e) => setCommitLabel(e.target.value)}
                placeholder="给这个版本起个名字？（可留空）"
                autoFocus
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
