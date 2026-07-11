// ============================================================
// HomePage.tsx — 首页：Hero 输入 + 最近项目 + 热门模板
// ============================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppNav } from "../components/AppNav";
import { TemplateCard } from "../components/TemplateCard";
import { ScenePreviewThumb } from "../components/ScenePreviewThumb";
import { DEMO_TEMPLATES } from "../data/templates";
import { useProjectStore } from "../store/projectStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Sparkles } from "lucide-react";
import type { SceneConfig } from "../types/scene";
import { setPendingPrompt } from "../lib/pendingPrompt";

interface ProjectListItem {
  id: string;
  title: string;
  updated_at: number;
  head_sequence: number | null;
  draft_id: string | null;
  config: SceneConfig | null;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  return `${months} 个月前`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const createProject = useProjectStore((s) => s.createProject);
  const loadProject = useProjectStore((s) => s.loadProject);

  const [recentProjects, setRecentProjects] = useState<ProjectListItem[]>([]);
  const [heroText, setHeroText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then(setRecentProjects)
      .catch(() => {});
  }, []);

  const handleHeroSubmit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const raw = heroText.trim();
      const title = raw ? raw.slice(0, 50) + (raw.length > 50 ? "…" : "") : undefined;
      await createProject(title);
      const projectId = useProjectStore.getState().projectId;
      if (projectId) {
        // 首页输入的完整描述暂存到 sessionStorage；项目标题只取前 50 字，
        // 但发给 agent 的是全文。StudioPage 加载完成后自动消费并作为第一条
        // 对话发送。raw 为空（直接点开始创作）则不暂存，保持原空白进入行为。
        if (raw) setPendingPrompt({ projectId, prompt: raw });
        navigate(`/p/${projectId}`);
      }
    } catch (err) {
      console.error("[home] create failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenProject = async (id: string) => {
    setBusy(true);
    try {
      await loadProject(id);
      navigate(`/p/${id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-paper overflow-hidden">
      <AppNav />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-12 flex flex-col gap-12">
          {/* ============================================================
              Hero 输入区
              ============================================================ */}
          <section className="flex flex-col items-center gap-6 text-center">
            <div className="flex items-center gap-2">
              <Sparkles size={28} className="text-primary" />
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
                用对话创造动画
              </h1>
            </div>
            <p className="text-muted-foreground text-sm max-w-lg">
              描述你想要的动画效果，AI 会实时生成 GSAP 时间线并在浏览器中播放。
              支持文字、形状、连线、发光等丰富效果。
            </p>

            <div className="w-full max-w-2xl border-2 border-foreground bg-card p-1">
              <Textarea
                className="w-full min-h-[100px] border-0 bg-transparent resize-none text-sm leading-relaxed placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:outline-none"
                placeholder="例如：做一个产品展示动画，三张卡片从左到右依次滑入，每张卡片上有标题和描述文字，卡片之间用虚线连接..."
                value={heroText}
                onChange={(e) => setHeroText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleHeroSubmit();
                  }
                }}
                disabled={busy}
              />
              <div className="flex items-center justify-end px-2 py-1.5 border-t border-foreground/20">
                <span className="text-[10px] text-muted-foreground">
                  ⌘ + Enter 发送
                </span>
              </div>
            </div>

            {/* 按钮独立一行，带入场动画 */}
            <button
              onClick={handleHeroSubmit}
              disabled={busy}
              className="hero-cta-button opacity-0 animate-hero-btn font-display text-lg font-bold uppercase tracking-wider
                px-10 py-3.5 border-2 border-foreground bg-primary text-primary-foreground
                hover:bg-primary/90 active:scale-[0.97]
                disabled:opacity-30 disabled:cursor-not-allowed
                transition-all duration-200"
            >
              {busy ? "创建中…" : "开始创作"}
              <ArrowRight size={20} className="inline ml-2" />
            </button>
          </section>

          {/* ============================================================
              最近项目
              ============================================================ */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-foreground">
                最近项目
              </h2>
              {recentProjects.length > 4 && (
                <Button
                  onClick={() => navigate("/projects")}
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                >
                  查看全部 →
                </Button>
              )}
            </div>

            {recentProjects.length === 0 ? (
              <div className="border-2 border-dashed border-foreground/20 p-8 text-center text-muted-foreground text-sm">
                还没有项目 — 在上方输入描述开始创作你的第一个动画
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {recentProjects.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleOpenProject(p.id)}
                    disabled={busy}
                    className="text-left border-2 border-foreground bg-card hover:bg-muted transition-colors cursor-pointer group overflow-hidden flex flex-col p-0"
                  >
                    {/* 场景缩略预览 */}
                    {p.config ? (
                      <div className="h-20 shrink-0 overflow-hidden border-b border-foreground/20">
                        <ScenePreviewThumb config={p.config} />
                      </div>
                    ) : (
                      <div className="h-20 shrink-0 border-b border-foreground/20 bg-muted/30" />
                    )}
                    <div className="p-3 flex flex-col gap-1">
                      <h3 className="font-display text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                        {p.title}
                        {p.draft_id && (
                          <span className="ml-1.5 text-[10px] text-primary font-normal">
                            草稿
                          </span>
                        )}
                      </h3>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {p.head_sequence != null ? `v${p.head_sequence}` : "—"}
                        {" · "}
                        {timeAgo(p.updated_at)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ============================================================
              热门模板
              ============================================================ */}
          <section className="flex flex-col gap-4 pb-12">
            <h2 className="font-display text-lg font-bold text-foreground">
              热门模板
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {DEMO_TEMPLATES.map((tpl) => (
                <TemplateCard key={tpl.id} template={tpl} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
