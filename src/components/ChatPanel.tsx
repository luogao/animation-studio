import { useState, useRef, useEffect } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useAgentStore } from "../store/agentStore";
import { useProjectStore, selectPreviewConfig } from "../store/projectStore";
import { sendMessage } from "../hooks/useWebSocket";
import { downloadConfig } from "../lib/exportConfig";

// ============================================================
// ChatPanel — 左侧对话面板
// 对话状态来自 agentStore，配置预览来自 projectStore
// children 渲染在顶部（ProjectSwitcher）
// ============================================================

export function ChatPanel({ children }: { children?: ReactNode }) {
  const chatMessages = useAgentStore((s) => s.chatMessages);
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const addMessage = useAgentStore((s) => s.addMessage);
  const clearChat = useAgentStore((s) => s.clearChat);
  const config = useProjectStore(selectPreviewConfig);

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 新消息时自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    // ── 命令处理 ──
    if (text === "/clear") {
      clearChat();
      setInput("");
      return;
    }

    if (text === "/export") {
      downloadConfig(config);
      setInput("");
      return;
    }

    // ── 普通对话消息 ──
    addMessage({ id: crypto.randomUUID(), role: "user", content: text });
    void sendMessage(text);
    setInput("");

    // 重置 textarea 高度
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <aside className="chat-panel" style={panelStyle}>
      {/* ── 顶部：项目切换（由 App 注入）── */}
      {children}

      {/* ── 消息列表（可滚动） ── */}
      <div className="chat-messages" style={messagesStyle}>
        {chatMessages.length === 0 && (
          <div style={emptyStyle}>
            输入消息开始对话
            <br />
            <span style={{ opacity: 0.5, fontSize: 12 }}>
              /clear 清空 · /export 导出配置
            </span>
          </div>
        )}

        {chatMessages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...bubbleBaseStyle,
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              background: msg.role === "user" ? "#4a9eff" : "#222",
              color: msg.role === "user" ? "#fff" : "#eee",
            }}
          >
            {msg.content || (isStreaming && i === chatMessages.length - 1 ? "…" : "")}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* ── 底部输入区 ── */}
      <div className="chat-input-area" style={inputAreaStyle}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息... (Enter 发送 / Shift+Enter 换行)"
          rows={2}
          style={textareaStyle}
          disabled={isStreaming}
        />
        <button
          onClick={handleSend}
          disabled={isStreaming || !input.trim()}
          style={{
            ...sendButtonStyle,
            opacity: isStreaming || !input.trim() ? 0.5 : 1,
            cursor: isStreaming || !input.trim() ? "not-allowed" : "pointer",
          }}
        >
          {isStreaming ? "生成中…" : "发送"}
        </button>
      </div>
    </aside>
  );
}

// ============================================================
// 样式
// ============================================================

const panelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  background: "#111",
  color: "#eee",
  height: "100vh",
  minWidth: 0,
};

const messagesStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "12px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const bubbleBaseStyle: React.CSSProperties = {
  maxWidth: "85%",
  padding: "8px 12px",
  borderRadius: 8,
  fontSize: 14,
  lineHeight: 1.5,
  wordBreak: "break-word",
  whiteSpace: "pre-wrap",
};

const inputAreaStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: 12,
  borderTop: "1px solid #222",
  flexShrink: 0,
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  background: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: 6,
  color: "#eee",
  padding: "8px 10px",
  fontSize: 14,
  fontFamily: "inherit",
  resize: "none",
  outline: "none",
};

const sendButtonStyle: React.CSSProperties = {
  background: "#4a9eff",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "8px 16px",
  fontSize: 14,
  fontWeight: 500,
  alignSelf: "flex-end",
  whiteSpace: "nowrap",
};

const emptyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  flex: 1,
  color: "#666",
  textAlign: "center",
  gap: 8,
  fontSize: 14,
};
