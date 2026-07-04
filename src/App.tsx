import { useWebSocket } from "./hooks/useWebSocket";
import { useProjectStore, selectPreviewConfig } from "./store/projectStore";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { Timeline } from "./components/Timeline";
import { CanvasSizeControl } from "./components/CanvasSizeControl";
import { VersionToolbar } from "./components/VersionToolbar";
import { ChatPanel } from "./components/ChatPanel";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { downloadConfig } from "./lib/exportConfig";

export default function App() {
  // 建立单例 WS 连接，消息自动 dispatch 到对应 store
  useWebSocket();
  const config = useProjectStore(selectPreviewConfig);

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
          <button
            onClick={() => downloadConfig(config)}
            type="button"
            style={{
              background: "#4a9eff",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              padding: "6px 16px",
              fontSize: 14,
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            导出
          </button>
        </div>

        <div className="canvas-stage">
          <PreviewCanvas />
        </div>

        <div className="canvas-footer">
          <Timeline />
        </div>
      </main>
    </div>
  );
}
