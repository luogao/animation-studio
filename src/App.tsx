import { useEffect, useRef, useState } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { setCurrentProject } from "./hooks/useWebSocket";
import { useProjectStore } from "./store/projectStore";
import { useSelectionStore } from "./store/selectionStore";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { Timeline } from "./components/Timeline";
import { CanvasSizeControl } from "./components/CanvasSizeControl";
import { VersionToolbar } from "./components/VersionToolbar";
import { ChatPanel } from "./components/ChatPanel";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { LlmConfigDialog } from "./components/LlmConfigDialog";
import { ColorPalettePanel } from "./components/ColorPalettePanel";
import { buildExportEnvelope, downloadConfig } from "./lib/exportConfig";
import { exportVideo, exportGif } from "./lib/exportMedia";
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

// ── 编辑模式切换按钮 ──
function EditModeToggle() {
  const isEditMode = useSelectionStore((s) => s.isEditMode);
  const toggleEditMode = useSelectionStore((s) => s.toggleEditMode);
  return (
    <Button
      onClick={toggleEditMode}
      variant={isEditMode ? "default" : "secondary"}
      size="sm"
    >
      {isEditMode ? "编辑中" : "选择"}
    </Button>
  );
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

  // ── 导出视频 / GIF ──
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
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

  const doExportMedia = async (
    format: "video" | "gif",
    label: string
  ) => {
    setExportOpen(false);
    if (exportBusy) return;
    const svg = document.querySelector<SVGSVGElement>("svg");
    if (!svg) {
      toast.error("找不到画布 SVG 元素");
      return;
    }

    const config = useProjectStore.getState().draft?.config
      ?? useProjectStore.getState().committedConfig;

    setExportBusy(true);
    toast.info(`开始导出 ${label}...`);

    try {
      const fn = format === "video" ? exportVideo : exportGif;
      await fn(svg, config, (phase) => {
        toast.info(phase, { duration: 2000 });
      });
      toast.success(`${label} 导出完成`);
    } catch (err) {
      toast.error(
        `导出失败: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setExportBusy(false);
    }
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
          <div className="ml-auto flex items-center gap-2">
            <EditModeToggle />
            <ColorPalettePanel />
            <LlmConfigDialog />
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
                    onClick={() => { setExportOpen(false); handleExport(); }}
                  >
                    导出配置 (JSON)
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
