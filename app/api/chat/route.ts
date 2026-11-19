import { convertToModelMessages, streamText } from "ai";
import {
  ApiKeyMissingError,
  ModelNotFoundError,
  resolveModel,
} from "@/lib/providers";

export const maxDuration = 30;

const MAX_PROMPT_CHARS = 4000;
const MAX_HISTORY_TURNS = 10; // keep token burn down: send only a recent window
const MAX_OUTPUT_TOKENS = 512;

interface ChatRequestBody {
  messages?: unknown;
  modelId?: unknown;
}

function errorResponse(
  status: number,
  message: string,
  retryAfterSeconds?: number,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(retryAfterSeconds);
  }
  return new Response(JSON.stringify({ error: message, retryAfterSeconds }), {
    status,
    headers,
  });
}

/**
 * POST /api/chat
 * Body: { messages: UIMessage[], modelId: string }
 *
 * The client sends ONLY a registry model id. The server resolves the
 * provider, model and API key (server-only env vars) and streams the
 * provider's response back as a UI message stream.
 */
export async function POST(req: Request) {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }

  const { messages, modelId } = body;

  if (typeof modelId !== "string" || modelId.length === 0) {
    return errorResponse(400, "modelId is required and must be a registry id.");
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return errorResponse(400, "messages must be a non-empty array.");
  }

  // Cap prompt length (last user message) to keep free-tier burn bounded.
  const lastUser = [...messages]
    .reverse()
    .find(
      (m): m is { role: string; parts?: Array<{ type: string; text?: string }> } =>
        typeof m === "object" && m !== null && (m as { role?: string }).role === "user",
    );
  const lastUserText =
    lastUser?.parts
      ?.filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("") ?? "";
  if (lastUserText.length > MAX_PROMPT_CHARS) {
    return errorResponse(
      400,
      `Prompt is too long (max ${MAX_PROMPT_CHARS} characters).`,
    );
  }

  let model;
  try {
    model = resolveModel(modelId);
  } catch (error) {
    if (error instanceof ModelNotFoundError) {
      return errorResponse(400, error.message);
    }
    if (error instanceof ApiKeyMissingError) {
      return errorResponse(503, error.message);
    }
    return errorResponse(500, "Failed to resolve model.");
  }

  try {
    // Send only the most recent turns to each model (history truncation).
    const recentMessages = messages.slice(-MAX_HISTORY_TURNS * 2);
    const result = streamText({
      model,
      messages: await convertToModelMessages(recentMessages),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
    return result.toUIMessageStreamResponse();
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    const message =
      error instanceof Error ? error.message : "Provider request failed.";
    if (statusCode === 429) {
      const retryAfter = (error as { responseHeaders?: Record<string, string> })
        ?.responseHeaders?.["retry-after"];
      const retryAfterSeconds = retryAfter ? Number(retryAfter) : 30;
      return errorResponse(
        429,
        `Rate-limited by the provider (${modelId}). Wait ${retryAfterSeconds}s and retry this column.`,
        Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 30,
      );
    }
    if (statusCode === 401 || statusCode === 403) {
      return errorResponse(
        502,
        `Provider rejected the API key for ${modelId}. Check ${modelId}'s key in .env.local / Vercel env vars.`,
      );
    }
    return errorResponse(502, `Provider error for ${modelId}: ${message}`);
  }
}
