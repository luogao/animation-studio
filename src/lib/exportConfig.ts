// ============================================================
// exportConfig.ts — 导出 SceneConfig 为 JSON 文件
//
// T4: 改成接收 ExportedSceneConfig 信封，包含版本元数据。
// 文件名：{slug(projectName)}-v{seq}{-draft}.json
// 返回文件名让调用方反馈给用户（toast）。
// ============================================================

import type { ExportedSceneConfig } from "../types/scene";
import { slugify } from "../types/scene";

export function downloadConfig(envelope: ExportedSceneConfig): string {
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const draftSuffix = envelope.status === "draft" ? "-draft" : "";
  const filename = `${slugify(envelope.projectName)}-v${envelope.sequence}${draftSuffix}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return filename;
}

// ============================================================
// 构建 envelope 的 helper —— 从 projectStore 的当前状态
// 抛错场景：draft 是 __local_pending__（agent 工具触发但 DB 还没写回）
// ============================================================

export interface BuildEnvelopeInput {
  projectId: string;
  projectTitle: string;
  headVersionId: string | null;
  committedConfig: import("../types/scene").SceneConfig;
  draft: { id: string; config: import("../types/scene").SceneConfig } | null;
  versions: Array<{
    id: string;
    sequence: number;
    status: "draft" | "committed";
    label: string | null;
    committedAt: number | null;
  }>;
}

export function buildExportEnvelope(
  input: BuildEnvelopeInput
): { envelope: ExportedSceneConfig; filename: string } | { error: string } {
  const {
    projectId,
    projectTitle,
    headVersionId,
    committedConfig,
    draft,
    versions,
  } = input;

  // 草稿尚未持久化（agent 工具刚触发，DB round-trip 未完成）
  if (draft && draft.id === "__local_pending__") {
    return {
      error: "草稿尚未持久化，请稍候片刻再导出",
    };
  }

  // 有 draft：导出 draft（用户正在看的）
  if (draft) {
    const draftMeta = versions.find((v) => v.id === draft.id);
    if (draftMeta) {
      const envelope: ExportedSceneConfig = {
        schemaVersion: 1,
        projectId,
        projectName: projectTitle,
        versionId: draft.id,
        sequence: draftMeta.sequence,
        status: "draft",
        label: draftMeta.label,
        committedAt: null,
        exportedAt: Date.now(),
        config: draft.config,
      };
      return { envelope, filename: "" }; // filename 由 downloadConfig 算
    }
  }

  // 否则：导出当前 head
  if (!headVersionId) {
    return { error: "当前项目还没有 committed 版本" };
  }
  const headMeta = versions.find((v) => v.id === headVersionId);
  if (!headMeta) {
    return { error: "找不到 head 版本元数据" };
  }
  const envelope: ExportedSceneConfig = {
    schemaVersion: 1,
    projectId,
    projectName: projectTitle,
    versionId: headVersionId,
    sequence: headMeta.sequence,
    status: "committed",
    label: headMeta.label,
    committedAt: headMeta.committedAt,
    exportedAt: Date.now(),
    config: committedConfig,
  };
  return { envelope, filename: "" };
}
