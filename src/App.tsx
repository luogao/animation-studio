import { useEffect } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { setCurrentProject } from "./hooks/useWebSocket";
import { useProjectStore } from "./store/projectStore";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { Timeline } from "./components/Timeline";
import { CanvasSizeControl } from "./components/CanvasSizeControl";
import { VersionToolbar } from "./components/VersionToolbar";
import { ChatPanel } from "./components/ChatPanel";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { buildExportEnvelope, downloadConfig } from "./lib/exportConfig";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

// ============================================================
// URL 路由：/p/:projectId
// 用 History API（无 react-router）。每个对话有独立 URL，
// 刷新 / 分享 / 后退都能恢复到对应 project。
// ============================================================

function parseProjectIdFromUrl(): string | null {
  const m = window.location.pathname.match(/^\/p\/([\w-]+)/);
  return m ? m[1] : null;
}

export default function App() {
  // 建立单例 WS 连接，消息自动 dispatch 到对应 store
  useWebSocket();

  const projectId = useProjectStore((s) => s.projectId);

  // ── 挂载时：从 URL 读取 projectId 并加载 ──
  // 若 URL 没指定，让 ProjectSwitcher 走它自己的 auto-select 逻辑（list[0]）
  useEffect(() => {
    const id = parseProjectIdFromUrl();
    if (id) {
      void useProjectStore.getState().loadProject(id);
    }
  }, []);

  // ── projectId 变化 → push URL + 通知 WS 重新订阅 ──
  // skip mount 等于 false（首次也写一次 URL：从 / 加载到 /p/<id>）
  useEffect(() => {
    if (!projectId) {
      setCurrentProject(null);
      return;
    }
    const expected = `/p/${projectId}`;
    if (window.location.pathname !== expected) {
      window.history.pushState({}, "", expected);
    }
    setCurrentProject(projectId);
  }, [projectId]);

  // ── 浏览器后退 / 前进 ──
  useEffect(() => {
    const onPop = () => {
      const id = parseProjectIdFromUrl();
      if (id && id !== useProjectStore.getState().projectId) {
        void useProjectStore.getState().loadProject(id);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const handleExport = () => {
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
    const filename = downloadConfig(result.envelope);
    toast.success(`已导出 ${filename}`, {
      description:
        result.envelope.status === "draft"
          ? "草稿状态 — 提交后版本号会推进"
          : `v${result.envelope.sequence} committed`,
    });
  };

  return (
    <div className="app">
      {/* ── 左：对话面板（顶部含项目切换）── */}
      <ChatPanel>
        <ProjectSwitcher />
      </ChatPanel>

      {/* ── 右：预览画布 ── */}
      <main className="canvas-area">
        <div className="canvas-toolbar">
          <CanvasSizeControl />
          <VersionToolbar />
          <Button
            onClick={handleExport}
            variant="secondary"
            size="sm"
            className="ml-auto"
          >
            导出
          </Button>
        </div>

        <div className="canvas-stage">
          <PreviewCanvas />
        </div>

        <div className="canvas-footer">
          <Timeline />
        </div>
      </main>

      {/* shadcn toast 容器 */}
      <Toaster position="bottom-right" />
    </div>
  );
}
