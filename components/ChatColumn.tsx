"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { ModelEntry } from "@/lib/models";

export interface ColumnApi {
  sendMessage: (text: string) => void;
}

interface ChatColumnProps {
  model: ModelEntry;
  registerApi: (modelId: string, api: ColumnApi | null) => void;
  onStatusChange: (modelId: string, status: string) => void;
  onAssistantDone: (modelId: string, text: string) => void;
}

function messageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/**
 * One model column. Each column owns an independent `useChat` instance bound
 * to a single registry model id, so one model's failure (e.g. 429) never
 * affects the other columns.
 */
export default function ChatColumn({
  model,
  registerApi,
  onStatusChange,
  onAssistantDone,
}: ChatColumnProps) {
  const { messages, sendMessage, status, error, regenerate, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { modelId: model.id },
      // Surface the API route's JSON error message (e.g. "API key not
      // configured", "Rate-limited") instead of a bare HTTP status.
      fetch: async (input, init) => {
        const res = await fetch(input, init);
        if (!res.ok) {
          let message = `Request failed (HTTP ${res.status})`;
          try {
            const data = (await res.clone().json()) as { error?: string };
            if (data?.error) message = data.error;
          } catch {
            // Keep the generic message if the body is not JSON.
          }
          throw new Error(message);
        }
        return res;
      },
    }),
  });

  // Expose this column's sendMessage to the parent so one submit fans out.
  useEffect(() => {
    registerApi(model.id, {
      sendMessage: (text: string) => {
        void sendMessage({ text });
      },
    });
    return () => registerApi(model.id, null);
  }, [model.id, registerApi, sendMessage]);

  useEffect(() => {
    onStatusChange(model.id, status);
  }, [model.id, status, onStatusChange]);

  // Report a finished assistant reply once, so the parent can store it in
  // the local chat history.
  const lastReportedId = useRef<string | null>(null);
  useEffect(() => {
    if (status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (lastReportedId.current === last.id) return;
    const text = messageText(last);
    if (!text) return;
    lastReportedId.current = last.id;
    onAssistantDone(model.id, text);
  }, [messages, status, model.id, onAssistantDone]);

  const isStreaming = status === "streaming" || status === "submitted";
  const isRateLimited =
    !!error && /429|rate-limit|rate limit/i.test(error.message);

  // Latest assistant reply, for the per-column Copy button.
  const latestAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const latestAssistantText = latestAssistant
    ? messageText(latestAssistant)
    : "";
  const [copied, setCopied] = useState(false);

  async function copyAnswer() {
    if (!latestAssistantText) return;
    try {
      await navigator.clipboard.writeText(latestAssistantText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — stay silent.
    }
  }

  return (
    <section className="column" aria-label={model.label}>
      <header className="column-header">
        <div>
          <h2>{model.label}</h2>
          <p className="column-sub">
            {model.provider} · {model.model}
          </p>
        </div>
        <span className={`status status-${status}`}>
          {isStreaming
            ? "Streaming…"
            : status === "error"
              ? "Error"
              : messages.length > 0
                ? "Done"
                : "Idle"}
        </span>
      </header>

      <div className="column-body">
        {messages.length === 0 && (
          <p className="empty-note">
            No messages yet. Send a prompt and this model&rsquo;s answer will
            stream here.
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${message.role === "user" ? "message-user" : "message-assistant"}`}
          >
            <span className="message-role">
              {message.role === "user" ? "You" : model.label}
            </span>
            <p>{messageText(message)}</p>
          </div>
        ))}
        {isStreaming && (
          <p className="streaming-note">
            <span className="dot" /> Receiving tokens…
          </p>
        )}
      </div>

      <footer className="column-footer">
        {error && (
          <div className="error-box" role="alert">
            <strong>{isRateLimited ? "Rate-limited" : "Error"}</strong>
            <p>{error.message}</p>
            <button
              type="button"
              className="retry-button"
              onClick={() => void regenerate()}
            >
              ↻ Retry this model
            </button>
          </div>
        )}
        <div className="column-actions">
          {isStreaming && (
            <button
              type="button"
              className="stop-button"
              onClick={() => stop()}
            >
              ■ Stop
            </button>
          )}
          <button
            type="button"
            className="copy-button"
            onClick={() => void copyAnswer()}
            disabled={!latestAssistantText}
          >
            {copied ? "✓ Copied" : "Copy answer"}
          </button>
        </div>
        <p className="column-limit">{model.freeTierNote}</p>
      </footer>
    </section>
  );
}
