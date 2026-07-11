// ============================================================
// StudioPage.tsx — 沉浸式创作页面（/p/:projectId）
//
// 特性：
// - 固定左侧对话面板 + 画布 + 底部时间轴
// - 顶部 StudioHeader（返回/版本/导出/工具）
// - WS 连接 + 项目加载 + URL 同步
// - 首页带入的 prompt：项目加载完成后自动作为第一条对话发给 agent
//   （autoSending 期间全屏 loading，防误操作）
// ============================================================

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWebSocket, setCurrentProject, sendMessage } from "../hooks/useWebSocket";
import { useProjectStore } from "../store/projectStore";
import { peekPendingPrompt, consumePendingPrompt } from "../lib/pendingPrompt";
import { ChatPanel } from "../components/ChatPanel";
import { PreviewCanvas } from "../components/PreviewCanvas";
import { Timeline } from "../components/Timeline";
import { StudioHeader } from "../components/StudioHeader";
import { ActorPropertyPanel } from "../components/ActorPropertyPanel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// 选中 actor 后右侧的属性编辑面板（ActorPropertyPanel）总开关。
// 暂时隐藏：恢复时把这里改回 true 即可（组件本体与选中逻辑均未动）。
const ENABLE_PROPERTY_PANEL = false;

export default function StudioPage() {
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // 建立 WS 连接
  useWebSocket();

  const projectId = useProjectStore((s) => s.projectId);
  const loading = useProjectStore((s) => s.loading);
  const error = useProjectStore((s) => s.error);

  // ── 首页带入的待发 prompt ──
  // 进页时若 sessionStorage 里存在匹配当前 urlProjectId 的 pending，则进入
  // "自动发送"loading。惰性初始化只读一次 sessionStorage。autoSending 期间
  // 全屏 loading，杜绝用户在"项目加载完 → 首条消息真正发出"窗口内点输入框。
  const [autoSending, setAutoSending] = useState<boolean>(
    () => !!urlProjectId && !!peekPendingPrompt(urlProjectId)
  );

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

  // ── 项目加载完成后，把首页带入的 prompt 自动发给 agent ──
  // 竞态防护：
  // ① 等 loading === false（loadProject 完成，headVersionId / committedConfig
  //   就绪），否则 sendMessage 会读到错误的 baseVersionId；
  // ② consumePendingPrompt 读取即删除 —— StrictMode 双调用 / effect 重跑时，
  //   第二次读到 null 直接退出 loading，保证同一条 prompt 只发一次；
  // ③ 发出后 sendMessage 内部 setStreaming(true) 接管，ChatPanel 输入禁用，
  //   与 autoSending loading 无缝衔接。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!autoSending || !projectId || loading) return;
    const prompt = consumePendingPrompt(projectId);
    if (prompt) {
      void sendMessage(prompt)
        .catch((err) => {
          console.error("[studio] auto-send pending prompt failed:", err);
          toast.error(
            "自动发送失败，请手动重新输入：" +
              (err instanceof Error ? err.message : String(err))
          );
        })
        .finally(() => setAutoSending(false));
    } else {
      // pending 不属于当前项目 / 已被消费 → 退出 loading
      setAutoSending(false);
    }
  }, [autoSending, projectId, loading]);

  // ── 错误处理：项目不存在 → 跳转 ──
  useEffect(() => {
    if (error) {
      toast.error(error);
      navigate("/projects");
    }
  }, [error, navigate]);

  // ── 加载中 / 自动发送首条消息 → 全屏 loading（防误操作）──
  if (autoSending || (loading && !projectId)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 bg-paper">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">
          {autoSending ? "正在把你的描述发给 AI…" : "加载中…"}
        </p>
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
        <div className="w-[500px] shrink-0 border-r-2 border-foreground">
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
        {ENABLE_PROPERTY_PANEL && <ActorPropertyPanel />}
      </div>
    </div>
  );
}
