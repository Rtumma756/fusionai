/**
 * Model registry — the single source of truth for which models the app offers.
 *
 * This file is SAFE to import from client code: it contains only public
 * metadata (labels, model IDs, base URLs, free-tier notes). It contains NO
 * API keys and NO secret values. The server resolves a registry `id` to a
 * provider client + key in `lib/providers.ts` (server-only).
 *
 * To add a model: add ONE entry here (plus its env key in `.env.local` and
 * in Vercel). The client may only ever send a registry `id`; the server
 * rejects anything not in this list.
 *
 * Model IDs / limits verified against the research report of 19 Nov 2026.
 * Free tiers rotate — re-check the provider console before relying on a limit.
 */

export type ProviderId = "gemini" | "groq" | "openrouter" | "mistral";

export interface ModelEntry {
  /** Stable id the client sends; the server maps it to provider + model. */
  id: string;
  /** Display name shown in the model picker. */
  label: string;
  /** Short provider name shown in the column header. */
  provider: ProviderId;
  /** Exact model ID as the provider expects it. */
  model: string;
  /** OpenAI-compatible base URL for this provider. */
  baseURL: string;
  /** Name of the server-only env var holding this provider's API key. */
  envKey: string;
  /** Free-tier limit note (Nov 2026 research — verify in the provider console). */
  freeTierNote: string;
}

export const MODELS: ModelEntry[] = [
  {
    id: "gemini-lite",
    label: "Gemini 3.5 Flash-Lite",
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    envKey: "GEMINI_API_KEY",
    freeTierNote: "Free: ~500 req/day, 250k TPM, no card (Google AI Studio)",
  },
  {
    id: "groq-oss",
    label: "GPT-OSS 120B (Groq)",
    provider: "groq",
    model: "openai/gpt-oss-120b",
    baseURL: "https://api.groq.com/openai/v1",
    envKey: "GROQ_API_KEY",
    freeTierNote: "Free: 30 RPM, 1,000 req/day, 8,000 TPM per model",
  },
  {
    id: "openrouter-gemma",
    label: "Gemma 4 31B (OpenRouter :free)",
    provider: "openrouter",
    model: "google/gemma-4-31b-it:free",
    baseURL: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
    freeTierNote: "Free: 20 RPM, 50 req/day (1,000/day after a one-time $10 purchase)",
  },
  {
    id: "mistral-small",
    label: "Mistral Small",
    provider: "mistral",
    model: "mistral-small-latest",
    baseURL: "https://api.mistral.ai/v1",
    envKey: "MISTRAL_API_KEY",
    freeTierNote: "Free mode: no card; caps are per-account, see Admin Panel > API > Limits",
  },
];

export const MAX_MODELS_PER_PROMPT = 3;

export function getModelById(id: string): ModelEntry | undefined {
  return MODELS.find((m) => m.id === id);
}
