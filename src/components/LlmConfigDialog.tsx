// ============================================================
// LlmConfigDialog — LLM 配置对话框
//
// 职责：
// - 提供齿轮图标按钮 + shadcn Dialog
// - 三个字段：模型名称 / API Key（password 掩码）/ Base URL
// - 打开时 GET /api/llm-config 加载，保存时 PUT
// - sonner toast 反馈成功/失败 + 模型名为空时校验
//
// 设计决策：
// - LLM 配置是持久化到文件的，不需要 Zustand store
// - 组件内 useState 管理表单态，打开时重新拉取最新值
// ============================================================

import { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { refreshLlmConfigStatus } from "@/lib/llmConfigStatus";

interface LlmConfig {
  model: string;
  apiKey: string;
  baseUrl: string;
}

// ------------------------------------------------------------
// 外部触发打开：派发全局事件，Dialog 内监听。
// 用于「未配置 LLM 时发对话被拦截」→ 自动弹出配置框。
// 用 window 事件而非 Zustand：配置态本就不在 store，事件总线最轻量。
// ------------------------------------------------------------
export const OPEN_LLM_CONFIG_EVENT = "open-llm-config";

/** 从任意位置调用，打开 LLM 配置对话框 */
export function openLlmConfig(): void {
  window.dispatchEvent(new CustomEvent(OPEN_LLM_CONFIG_EVENT));
}

export function LlmConfigDialog() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<LlmConfig>({
    model: "",
    apiKey: "",
    baseUrl: "",
  });
  const [saving, setSaving] = useState(false);

  // 打开对话框时从服务端拉取当前配置
  useEffect(() => {
    if (open) {
      fetch("/api/llm-config")
        .then((r) => r.json())
        .then((data) =>
          setConfig({
            model: data.model ?? "",
            apiKey: data.apiKey ?? "",
            baseUrl: data.baseUrl ?? "",
          })
        )
        .catch(() => toast.error("加载 LLM 配置失败"));
    }
  }, [open]);

  // 监听外部「打开配置」事件（发对话被拦截时触发）
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_LLM_CONFIG_EVENT, handler);
    return () => window.removeEventListener(OPEN_LLM_CONFIG_EVENT, handler);
  }, []);

  const handleSave = async () => {
    if (!config.model.trim()) {
      toast.error("模型名称不能为空");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/llm-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error ?? `HTTP ${res.status}`);
      }
      toast.success("LLM 配置已保存");
      // 刷新就绪状态缓存，让发对话拦截立即生效
      void refreshLlmConfigStatus();
      setOpen(false);
    } catch (err) {
      toast.error(
        `保存失败: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" title="LLM 配置">
          <Settings />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>LLM 配置</DialogTitle>
          <DialogDescription>
            配置 Claude Agent 使用的模型、API Key 和 Base URL。
            所有模型变体字段将统一使用同一个模型名称。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {/* 模型名称 */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">模型名称</label>
            <Input
              value={config.model}
              onChange={(e) =>
                setConfig((c) => ({ ...c, model: e.target.value }))
              }
              placeholder="如 claude-sonnet-4-20250514"
            />
          </div>

          {/* API Key */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">API Key</label>
            <Input
              type="password"
              value={config.apiKey}
              onChange={(e) =>
                setConfig((c) => ({ ...c, apiKey: e.target.value }))
              }
              placeholder="sk-..."
            />
          </div>

          {/* Base URL */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Base URL</label>
            <Input
              value={config.baseUrl}
              onChange={(e) =>
                setConfig((c) => ({ ...c, baseUrl: e.target.value }))
              }
              placeholder="https://api.anthropic.com"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
