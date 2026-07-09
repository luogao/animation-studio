// ============================================================
// TemplateCard.tsx — 模板预览卡片
// ============================================================

import type { DemoTemplate } from "../data/templates";
import { useProjectStore } from "../store/projectStore";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { ScenePreviewThumb } from "./ScenePreviewThumb";

interface TemplateCardProps {
  template: DemoTemplate;
}

export function TemplateCard({ template }: TemplateCardProps) {
  const navigate = useNavigate();
  const createProject = useProjectStore((s) => s.createProject);
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await createProject(template.name);
      // createProject 内部调用了 loadProject，完成后 projectId 已就绪
      const projectId = useProjectStore.getState().projectId;
      if (projectId) {
        // 需要通过 API 把模板 config 写入：先创建 draft，再立即 commit
        const s = useProjectStore.getState();
        const draftRes = await fetch(`/api/projects/${projectId}/versions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: template.config, parentId: s.headVersionId }),
        });
        if (draftRes.ok) {
          const draft = await draftRes.json();
          await fetch(`/api/projects/${projectId}/versions/${draft.id}/commit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: `template: ${template.id}` }),
          });
          // 重新加载以获取最终状态
          await s.loadProject(projectId);
        }
        navigate(`/p/${projectId}`);
      }
    } catch (err) {
      console.error("[template] create failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const actorCount = template.config.actors.length;
  const phaseCount = template.config.phases.length;

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="text-left group cursor-pointer border-2 border-foreground bg-card hover:bg-muted transition-colors p-0 overflow-hidden flex flex-col"
    >
      {/* 场景缩略预览 */}
      <div className="h-28 shrink-0 overflow-hidden border-b border-foreground/20">
        <ScenePreviewThumb config={template.config} />
      </div>

      {/* 信息区 */}
      <div className="p-4 flex flex-col gap-1.5 flex-1">
        <h3 className="font-display text-sm font-bold text-foreground group-hover:text-primary transition-colors">
          {template.name}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {template.description}
        </p>

        {/* 标签 */}
        <div className="flex flex-wrap gap-1 mt-1">
          {template.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 border border-foreground/30 text-muted-foreground font-medium"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* 元数据 */}
        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-mono">
          <span>{actorCount} actors</span>
          <span>{phaseCount} phases</span>
          <span>{template.config.duration}s</span>
        </div>
      </div>
    </button>
  );
}
