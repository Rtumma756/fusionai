/**
 * Server-only provider resolution.
 *
 * This module reads API keys from server-side environment variables ONLY.
 * It is imported exclusively by the API route (`app/api/chat/route.ts`) and
 * must never be imported from client components — keys must never reach the
 * browser, and must never use a NEXT_PUBLIC_ prefix.
 *
 * All four free providers speak OpenAI-compatible chat completions, so one
 * client type (`createOpenAI` with a per-provider baseURL) covers them all.
 */

import "server-only";

import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { getModelById, type ModelEntry } from "./models";

export class ModelNotFoundError extends Error {
  constructor(modelId: string) {
    super(`Unknown model id: ${modelId}`);
    this.name = "ModelNotFoundError";
  }
}

export class ApiKeyMissingError extends Error {
  constructor(entry: ModelEntry) {
    super(
      `API key not configured for ${entry.label}. Set ${entry.envKey} in .env.local (locally) or in Vercel Dashboard > Settings > Environment Variables.`,
    );
    this.name = "ApiKeyMissingError";
  }
}

const clients = new Map<string, OpenAIProvider>();

function getClient(entry: ModelEntry): OpenAIProvider {
  const cached = clients.get(entry.provider);
  if (cached) return cached;

  const apiKey = process.env[entry.envKey];
  if (!apiKey) {
    throw new ApiKeyMissingError(entry);
  }

  const client = createOpenAI({
    apiKey,
    baseURL: entry.baseURL,
    // OpenRouter recommends identifying the app; harmless for other providers.
    headers:
      entry.provider === "openrouter"
        ? {
            "HTTP-Referer": "https://ai-fiesta-prototype.vercel.app",
            "X-Title": "AI Fiesta Prototype",
          }
        : undefined,
  });
  clients.set(entry.provider, client);
  return client;
}

/**
 * Resolve a client-sent registry id to a concrete language model.
 * Throws ModelNotFoundError for ids outside the registry and
 * ApiKeyMissingError when the provider's key is not configured.
 */
export function resolveModel(modelId: string): LanguageModel {
  const entry = getModelById(modelId);
  if (!entry) {
    throw new ModelNotFoundError(modelId);
  }
  const client = getClient(entry);
  return client.chat(entry.model);
}
