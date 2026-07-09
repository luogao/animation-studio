// ============================================================
// StudioPage.tsx — 沉浸式创作页面（/p/:projectId）
//
// 特性：
// - 固定左侧对话面板 + 画布 + 底部时间轴
// - 顶部 StudioHeader（返回/版本/导出/工具）
// - WS 连接 + 项目加载 + URL 同步
// ============================================================

import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWebSocket, setCurrentProject } from "../hooks/useWebSocket";
import { useProjectStore } from "../store/projectStore";
import { ChatPanel } from "../components/ChatPanel";
import { PreviewCanvas } from "../components/PreviewCanvas";
import { Timeline } from "../components/Timeline";
import { StudioHeader } from "../components/StudioHeader";
import { ActorPropertyPanel } from "../components/ActorPropertyPanel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function StudioPage() {
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // 建立 WS 连接
  useWebSocket();

  const projectId = useProjectStore((s) => s.projectId);
  const loading = useProjectStore((s) => s.loading);
  const error = useProjectStore((s) => s.error);

  // ── 加载项目：URL param → loadProject ──
  useEffect(() => {
    if (urlProjectId && urlProjectId !== projectId) {
      useProjectStore.getState().loadProject(urlProjectId);
    }
    // projectId 初始为 null，只依赖 url param
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlProjectId]);

  // ── projectId 变化 → 通知 WS 订阅 ──
  useEffect(() => {
    if (projectId) {
      setCurrentProject(projectId);
    }
    return () => {
      setCurrentProject(null);
    };
  }, [projectId]);

  // ── 错误处理：项目不存在 → 跳转 ──
  useEffect(() => {
    if (error) {
      toast.error(error);
      navigate("/projects");
    }
  }, [error, navigate]);

  // ── 加载中 / 错误状态 ──
  if (loading && !projectId) {
    return (
      <div className="flex items-center justify-center h-screen bg-paper">
        <p className="text-muted-foreground text-sm">加载中…</p>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-screen bg-paper">
        <div className="flex flex-col items-center gap-4">
          <p className="text-muted-foreground text-sm">项目未找到</p>
          <Button onClick={() => navigate("/projects")} variant="outline" size="sm">
            返回项目列表
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-paper overflow-hidden">
      {/* ── 顶部工具栏 ── */}
      <StudioHeader />

      {/* ── 主体：对话面板 + 画布 ── */}
      <div className="flex-1 flex min-h-0">
        {/* ── 对话面板 ── */}
        <div className="w-[380px] shrink-0 border-r-2 border-foreground">
          <ChatPanel />
        </div>

        {/* ── 画布区 ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 画布 */}
          <div className="flex-1 canvas-stage">
            <PreviewCanvas />
          </div>

          {/* 底部：时间轴 */}
          <div className="canvas-footer">
            <Timeline />
          </div>
        </div>

        {/* ── Actor 属性面板（编辑模式 + 选中时）── */}
        <ActorPropertyPanel />
      </div>
    </div>
  );
}
