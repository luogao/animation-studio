// ============================================================
// App.tsx — 根组件，react-router 路由
//
// 三页面架构：
//   /             → HomePage（Hero 输入 + 最近项目 + 热门模板）
//   /projects     → ProjectListPage（项目管理）
//   /p/:projectId → StudioPage（沉浸式创作）
// ============================================================

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import HomePage from "./pages/HomePage";
import ProjectListPage from "./pages/ProjectListPage";
import StudioPage from "./pages/StudioPage";
import { Toaster } from "@/components/ui/sonner";
import { refreshLlmConfigStatus } from "./lib/llmConfigStatus";

// WS 连接在 App 层建立（单例），所有子页面共用
function WsInitializer() {
  useWebSocket();
  // 启动时拉取一次 LLM 配置就绪状态，供发对话拦截判断
  useEffect(() => {
    void refreshLlmConfigStatus();
  }, []);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <WsInitializer />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/projects" element={<ProjectListPage />} />
        <Route path="/p/:projectId" element={<StudioPage />} />
      </Routes>
      <Toaster position="bottom-right" />
    </BrowserRouter>
  );
}
