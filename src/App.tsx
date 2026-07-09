// ============================================================
// App.tsx — 根组件，react-router 路由
//
// 三页面架构：
//   /             → HomePage（Hero 输入 + 最近项目 + 热门模板）
//   /projects     → ProjectListPage（项目管理）
//   /p/:projectId → StudioPage（沉浸式创作）
// ============================================================

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useWebSocket } from "./hooks/useWebSocket";
import HomePage from "./pages/HomePage";
import ProjectListPage from "./pages/ProjectListPage";
import StudioPage from "./pages/StudioPage";
import { Toaster } from "@/components/ui/sonner";

// WS 连接在 App 层建立（单例），所有子页面共用
function WsInitializer() {
  useWebSocket();
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
