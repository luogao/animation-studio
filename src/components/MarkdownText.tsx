// ============================================================
// MarkdownText — assistant 文本 part 的 markdown 渲染器
//
// 接管 MessagePrimitive.Content 的 components.Text slot：
// - 用 react-markdown + remark-gfm 解析 markdown（GFM 表格/任务列表/删除线）
// - 流式期间（status.type === "running"）末尾追加闪烁的 caret
// - 不做语法高亮（Duotone Poster 风格只用 CSS 给代码块加硬边框 + 等宽）
//
// 注意：每个 token 到达都会重新 parse 一次 markdown。对 5KB 以下的消息
// 耗时 <1ms，无需节流。
// ============================================================

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TextMessagePartComponent } from "@assistant-ui/react";

export const MarkdownText: TextMessagePartComponent = ({ text, status }) => {
  const running = status?.type === "running";
  return (
    <div
      className="markdown-text prose-studio"
      data-status={status?.type ?? "complete"}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 宽表格在气泡内横向滚动，避免撑破对话气泡
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto">
              <table {...props} />
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
      {running && <span className="streaming-caret" aria-hidden="true" />}
    </div>
  );
};
