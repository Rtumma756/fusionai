"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import ChatColumn, { type ColumnApi } from "@/components/ChatColumn";
import { MAX_MODELS_PER_PROMPT, MODELS } from "@/lib/models";

interface Turn {
  prompt: string;
  responses: Record<string, string>;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  modelIds: string[];
  turns: Turn[];
}

const HISTORY_KEY = "ai-fiesta-prototype:conversations:v1";

function loadHistory(): Conversation[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function Home() {
  const [selected, setSelected] = useState<string[]>([
    "gemini-lite",
    "groq-oss",
  ]);
  const [input, setInput] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [columnStatuses, setColumnStatuses] = useState<Record<string, string>>(
    {},
  );
  // Bumping this remounts all columns (fresh per-column chats).
  const [sessionKey, setSessionKey] = useState(0);

  const columnApis = useRef(new Map<string, ColumnApi>());

  // Tracks currentId for use inside callbacks (avoids stale closures).
  const currentIdRef = useRef<string | null>(null);
  useEffect(() => {
    currentIdRef.current = currentId;
  }, [currentId]);

  useEffect(() => {
    setConversations(loadHistory());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(conversations));
    } catch {
      // localStorage full or unavailable — history is best-effort.
    }
  }, [conversations]);

  const registerApi = useCallback(
    (modelId: string, api: ColumnApi | null) => {
      if (api) columnApis.current.set(modelId, api);
      else columnApis.current.delete(modelId);
    },
    [],
  );

  const handleStatusChange = useCallback(
    (modelId: string, status: string) => {
      setColumnStatuses((prev) =>
        prev[modelId] === status ? prev : { ...prev, [modelId]: status },
      );
    },
    [],
  );

  const handleAssistantDone = useCallback(
    (modelId: string, text: string) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === currentIdRef.current);
        if (idx === -1) return prev;
        const next = [...prev];
        const convo = next[idx];
        const turns = [...convo.turns];
        const lastTurn = turns[turns.length - 1];
        if (!lastTurn) return prev;
        turns[turns.length - 1] = {
          ...lastTurn,
          responses: { ...lastTurn.responses, [modelId]: text },
        };
        next[idx] = { ...convo, turns };
        return next;
      });
    },
    [],
  );

  // currentId inside the callback above (avoids stale closures).
  const anyStreaming = Object.values(columnStatuses).some(
    (s) => s === "streaming" || s === "submitted",
  );

  function toggleModel(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((m) => m !== id);
      if (prev.length >= MAX_MODELS_PER_PROMPT) return prev;
      return [...prev, id];
    });
  }

  function submitPrompt() {
    const prompt = input.trim();
    if (!prompt || selected.length === 0 || anyStreaming) return;

    let conversationId = currentId;
    if (!conversationId) {
      conversationId = crypto.randomUUID();
      const convo: Conversation = {
        id: conversationId,
        title: prompt.slice(0, 60),
        createdAt: Date.now(),
        modelIds: [...selected],
        turns: [{ prompt, responses: {} }],
      };
      setConversations((prev) => [convo, ...prev]);
      setCurrentId(conversationId);
    } else {
      const newTurn: Turn = { prompt, responses: {} };
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, turns: [...c.turns, newTurn] }
            : c,
        ),
      );
    }

    setInput("");
    setViewingId(null);
    // Fan out: one independent request per selected model.
    for (const id of selected) {
      columnApis.current.get(id)?.sendMessage(prompt);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submitPrompt();
  }

  function handleNewChat() {
    setCurrentId(null);
    setViewingId(null);
    setColumnStatuses({});
    setSessionKey((k) => k + 1);
  }

  const viewing = viewingId
    ? conversations.find((c) => c.id === viewingId)
    : null;

  const selectedModels = MODELS.filter((m) => selected.includes(m.id));

  return (
    <div className="app">
      <header className="app-header">
        <h1>AI Fiesta Prototype</h1>
        <p>
          Ask once, compare answers from free-tier AI models side by side.
          Pick up to {MAX_MODELS_PER_PROMPT} models.
        </p>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <button type="button" className="new-chat" onClick={handleNewChat}>
            + New chat
          </button>
          <h2>History</h2>
          {conversations.length === 0 ? (
            <p className="muted">
              No chats yet. History is stored only in this browser.
            </p>
          ) : (
            <ul className="history-list">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={viewingId === c.id ? "active" : ""}
                    onClick={() =>
                      setViewingId(viewingId === c.id ? null : c.id)
                    }
                  >
                    <span className="history-title">{c.title}</span>
                    <span className="history-meta">
                      {c.turns.length} turn{c.turns.length === 1 ? "" : "s"} ·{" "}
                      {new Date(c.createdAt).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="sidebar-note">
            Free-tier demo — limits apply and answers may be rate-limited.
            Don&rsquo;t send sensitive data: free tiers may use prompts for
            training.
          </p>
        </aside>

        <main className="main">
          <section className="picker" aria-label="Choose models">
            {MODELS.map((m) => {
              const checked = selected.includes(m.id);
              const disabled =
                !checked && selected.length >= MAX_MODELS_PER_PROMPT;
              return (
                <label
                  key={m.id}
                  className={`model-card ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleModel(m.id)}
                  />
                  <span className="model-label">{m.label}</span>
                  <span className="model-note">{m.freeTierNote}</span>
                </label>
              );
            })}
          </section>

          <form className="prompt-form" onSubmit={handleSubmit}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitPrompt();
                }
              }}
              placeholder="Ask something… (Enter to send, Shift+Enter for a new line)"
              rows={3}
              aria-label="Prompt"
            />
            <button
              type="submit"
              disabled={
                !input.trim() || selected.length === 0 || anyStreaming
              }
            >
              {anyStreaming ? "Waiting for replies…" : "Ask all models"}
            </button>
          </form>

          {viewing ? (
            <section className="history-view">
              <div className="history-view-header">
                <h2>{viewing.title}</h2>
                <button type="button" onClick={() => setViewingId(null)}>
                  Back to live chat
                </button>
              </div>
              {viewing.turns.map((turn, i) => (
                <div key={i} className="history-turn">
                  <p className="history-prompt">
                    <strong>You:</strong> {turn.prompt}
                  </p>
                  <div className="columns">
                    {viewing.modelIds.map((modelId) => {
                      const model = MODELS.find((m) => m.id === modelId);
                      return (
                        <div key={modelId} className="history-answer">
                          <h3>{model?.label ?? modelId}</h3>
                          <p>
                            {turn.responses[modelId] ??
                              "No reply recorded for this model."}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          ) : (
            <section
              key={sessionKey}
              className="columns"
              aria-label="Model answers"
            >
              {selectedModels.length === 0 ? (
                <p className="muted">
                  Select at least one model above to start.
                </p>
              ) : (
                selectedModels.map((model) => (
                  <ChatColumn
                    key={model.id}
                    model={model}
                    registerApi={registerApi}
                    onStatusChange={handleStatusChange}
                    onAssistantDone={handleAssistantDone}
                  />
                ))
              )}
            </section>
          )}
        </main>
      </div>

      <footer className="app-footer">
        Keys are read from server-only environment variables by{" "}
        <code>/api/chat</code> — they never reach the browser. Models:{" "}
        {MODELS.map((m) => m.model).join(" · ")}
      </footer>
    </div>
  );
}
