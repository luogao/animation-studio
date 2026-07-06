// ============================================================
// projectStore.ts — 服务端同步的项目/版本状态
//
// M3 阶段：所有 actions 走 REST，draft / versions / headVersionId
// 真正持久化到 SQLite。loadProject 也会同步 agentStore 的消息列表。
//
// 规则：
// - previewConfig = draft?.config ?? committedConfig（derived selector）
// - applyAgentConfig 在 M3：agent 工具回调时，乐观更新本地 draft
//   （首次没有 draft 就建一个临时占位 id，下次 loadProject 会用真实 DB id 修正）
// - canvasSize 字段已彻底删除，单一真相走 config.width/height
// ============================================================

import { create } from "zustand";
import type { SceneConfig } from "../types/scene";
import { DEFAULT_SCENE_CONFIG } from "../types/scene";
import { useAgentStore, type ToolCallRecord } from "./agentStore";

// ============================================================
// 版本元信息（与 server/db/versions.ts 的 VersionMeta 对齐）
// ============================================================

export interface VersionMeta {
  id: string;
  projectId: string;
  parentId: string | null;
  status: "draft" | "committed";
  sequence: number;
  label: string | null;
  config: SceneConfig;
  createdAt: number;
  committedAt: number | null;
}

// ============================================================
// REST 返回的项目详情（与 server/db/projects.ts 的 ProjectDetail 对齐）
// ============================================================

interface ProjectDetailResponse {
  project: { id: string; title: string; created_at: number; updated_at: number };
  versions: VersionMeta[];
  messages: {
    id: string;
    project_id: string;
    role: "user" | "assistant";
    content: string;
    version_id: string | null;
    created_at: number;
    // 服务端 messages.tool_calls_json 反序列化后的数组（assistant 才有）
    tool_calls?: ToolCallRecord[];
  }[];
  headId: string | null;
  draftId: string | null;
}

// ============================================================
// Store 接口
// ============================================================

interface ProjectState {
  // ── 持久态 ──
  projectId: string | null;
  projectTitle: string | null;
  headVersionId: string | null;
  committedConfig: SceneConfig;
  draft: { id: string; config: SceneConfig } | null;
  versions: VersionMeta[];
  loading: boolean;
  error: string | null;

  // ── actions ──
  // agent 工具回调路径：乐观更新本地 draft
  applyAgentConfig: (config: SceneConfig) => void;

  // 持久化 / 版本管理
  loadProject: (id: string) => Promise<void>;
  createProject: (title?: string) => Promise<void>;
  commitDraft: (label?: string) => Promise<void>;
  discardDraft: () => Promise<void>;
  rollbackTo: (versionId: string) => Promise<void>;
}

// ============================================================
// 内部工具：fetch + 错误统一处理
// ============================================================

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const body = await res.json();
      msg = body.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ============================================================
// Store 实现
// ============================================================

export const useProjectStore = create<ProjectState>((set, get) => ({
  projectId: null,
  projectTitle: null,
  headVersionId: null,
  committedConfig: DEFAULT_SCENE_CONFIG,
  draft: null,
  versions: [],
  loading: false,
  error: null,

  applyAgentConfig: (config) =>
    set((s) => {
      // 乐观添加到 versions 列表，让版本工具栏立即可见
      const draftVersion: VersionMeta = {
        id: s.draft?.id ?? "__local_pending__",
        projectId: s.projectId ?? "",
        parentId: s.headVersionId,
        status: "draft" as const,
        sequence: (s.versions.length > 0
          ? Math.max(...s.versions.map((v) => v.sequence))
          : 0) + 1,
        label: null,
        config,
        createdAt: Date.now(),
        committedAt: null,
      };
      // 如果 versions 里已有 draft（旧 id），替换；否则追加
      const filtered = s.versions.filter((v) => v.status !== "draft");
      return {
        draft: s.draft
          ? { ...s.draft, config }
          : { id: "__local_pending__", config },
        versions: [...filtered, draftVersion],
      };
    }),

  loadProject: async (id) => {
    set({ loading: true, error: null });
    try {
      const data = await api<ProjectDetailResponse>(`/api/projects/${id}`);
      const head = data.versions.find((v) => v.id === data.headId) ?? null;
      const draft = data.draftId
        ? data.versions.find((v) => v.id === data.draftId) ?? null
        : null;

      set({
        projectId: data.project.id,
        projectTitle: data.project.title,
        headVersionId: data.headId,
        versions: data.versions,
        committedConfig: head?.config ?? DEFAULT_SCENE_CONFIG,
        draft: draft ? { id: draft.id, config: draft.config } : null,
        loading: false,
      });

      // 同步消息到 agentStore（含 toolCalls，刷新后卡片不丢）
      useAgentStore.getState().loadMessages(
        data.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          toolCalls: m.tool_calls,
        }))
      );
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  createProject: async (title) => {
    set({ loading: true, error: null });
    try {
      // POST /api/projects 返回 ProjectDetail（含 project.id）
      const created = await api<ProjectDetailResponse>(`/api/projects`, {
        method: "POST",
        body: JSON.stringify({ title }),
      });
      await get().loadProject(created.project.id);
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },

  commitDraft: async (label) => {
    const { projectId, draft } = get();
    if (!projectId || !draft) return;
    if (draft.id === "__local_pending__") {
      // 本地占位 draft 还没写库 —— 不可能发生（agent 工具触发即写库）
      // 但稳妥起见直接 reload 修正状态
      await get().loadProject(projectId);
      return;
    }
    set({ loading: true, error: null });
    try {
      await api(`/api/projects/${projectId}/versions/${draft.id}/commit`, {
        method: "POST",
        body: JSON.stringify({ label }),
      });
      await get().loadProject(projectId);
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  discardDraft: async () => {
    const { projectId, draft } = get();
    if (!projectId || !draft) return;
    if (draft.id === "__local_pending__") {
      set({ draft: null });
      return;
    }
    set({ loading: true, error: null });
    try {
      await api(`/api/projects/${projectId}/versions/${draft.id}`, {
        method: "DELETE",
      });
      await get().loadProject(projectId);
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  rollbackTo: async (versionId) => {
    const { projectId } = get();
    if (!projectId) return;
    set({ loading: true, error: null });
    try {
      await api(`/api/projects/${projectId}/rollback`, {
        method: "POST",
        body: JSON.stringify({ targetVersionId: versionId }),
      });
      await get().loadProject(projectId);
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
}));

// ============================================================
// Derived selector —— 给消费方用，统一 draft ?? committed 的回退规则
// ============================================================

export const selectPreviewConfig = (s: ProjectState): SceneConfig =>
  s.draft?.config ?? s.committedConfig;
