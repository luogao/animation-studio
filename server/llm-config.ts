// ============================================================
// llm-config.ts — LLM 配置读/写模块
//
// 职责：
// - 定义面向 UI 的 LlmConfig 类型（model / apiKey / baseUrl）
// - 读/写 .claude/setting.agent.json（SDK 项目级配置）
// - 提供 readSettingsFile() 给 agent.ts 合并 env + 解析 model
//
// 设计决策：
// - permissions 硬编码，不暴露给 UI
// - 所有模型字段（ANTHROPIC_MODEL / ANTHROPIC_DEFAULT_*_MODEL）
//   统一使用用户配置的 model 名
// - API_TIMEOUT_MS / CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC 硬编码
// - 文件不存在时返回空字符串模板（首次保存时自动创建）
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ------------------------------------------------------------
// 项目根目录锚定
// ------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ------------------------------------------------------------
// 类型
// ------------------------------------------------------------

/** 面向 UI 的 LLM 配置（只暴露用户可编辑的字段） */
export interface LlmConfig {
  model: string;
  apiKey: string;
  baseUrl: string;
}

/** .claude/setting.agent.json 的完整结构 */
export interface SettingsAgentJson {
  permissions: {
    allow: string[];
  };
  env: {
    ANTHROPIC_BASE_URL: string;
    ANTHROPIC_AUTH_TOKEN: string;
    ANTHROPIC_MODEL: string;
    ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
    ANTHROPIC_DEFAULT_SONNET_MODEL: string;
    ANTHROPIC_DEFAULT_OPUS_MODEL: string;
    API_TIMEOUT_MS: string;
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: string;
    ANTHROPIC_DEFAULT_FABLE_MODEL: string;
    ANTHROPIC_DEFAULT_FABLE_MODEL_NAME: string;
  };
}

// ------------------------------------------------------------
// 路径解析
// ------------------------------------------------------------

export function getSettingsFilePath(): string {
  const override = process.env.CLAUDE_SETTINGS_FILE?.trim();
  if (override && override.length > 0) return override;
  return path.join(PROJECT_ROOT, ".claude", "setting.agent.json");
}

// ------------------------------------------------------------
// 硬编码常量
// ------------------------------------------------------------

const HARDCODED_PERMISSIONS = ["Bash", "Read", "Write", "Edit", "Create", "Skill"];

const API_TIMEOUT_MS = "3000000";
const CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";

/** 从 LlmConfig 生成完整的 SettingsAgentJson */
function buildSettingsFile(config: LlmConfig): SettingsAgentJson {
  return {
    permissions: {
      allow: HARDCODED_PERMISSIONS,
    },
    env: {
      ANTHROPIC_BASE_URL: config.baseUrl,
      ANTHROPIC_AUTH_TOKEN: config.apiKey,
      ANTHROPIC_MODEL: config.model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: config.model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: config.model,
      ANTHROPIC_DEFAULT_OPUS_MODEL: config.model,
      API_TIMEOUT_MS,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC,
      ANTHROPIC_DEFAULT_FABLE_MODEL: config.model,
      ANTHROPIC_DEFAULT_FABLE_MODEL_NAME: config.model,
    },
  };
}

// ------------------------------------------------------------
// 读
// ------------------------------------------------------------

/** 读整个 settings 文件，不存在时返回 null */
export function readSettingsFile(): SettingsAgentJson | null {
  const filePath = getSettingsFilePath();
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as SettingsAgentJson;
  } catch {
    return null;
  }
}

/** 读 LLM 配置（面向 UI），文件不存在时返回空字符串 */
export function readLlmConfig(): LlmConfig {
  const settings = readSettingsFile();
  if (!settings?.env) {
    return { model: "", apiKey: "", baseUrl: "" };
  }
  return {
    model: settings.env.ANTHROPIC_MODEL ?? "",
    apiKey: settings.env.ANTHROPIC_AUTH_TOKEN ?? "",
    baseUrl: settings.env.ANTHROPIC_BASE_URL ?? "",
  };
}

// ------------------------------------------------------------
// 写
// ------------------------------------------------------------

/** 写 LLM 配置到 .claude/setting.agent.json，自动创建目录 */
export function writeLlmConfig(config: LlmConfig): void {
  const filePath = getSettingsFilePath();
  const dir = path.dirname(filePath);

  // 确保 .claude/ 目录存在
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const json = buildSettingsFile(config);
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + "\n", "utf-8");
}
