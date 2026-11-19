# FusionAI — Free Multi-Model Chat Companion

A minimal Next.js prototype in the style of [AI Fiesta](https://chat.aifiesta.ai/):
pick up to 3 free AI models, send one prompt, and watch their answers stream
side by side. One model's failure (e.g. a 429 rate limit) never kills the
other columns — each column has its own retry button.

> **Note:** AI Fiesta itself is a *paid* product ($12/mo Basic) built on
> premium models (GPT, Claude, Grok). This prototype is free because it uses
> genuinely free-tier models instead — see the model table below.

## Starter models (free tiers, verified 19 Nov 2026)

| Model (registry id) | Provider model ID | Free tier (Nov 2026) |
|---|---|---|
| Gemini 3.5 Flash-Lite (`gemini-lite`) | `gemini-3.5-flash-lite` | ~500 req/day, 250k TPM, no card |
| GPT-OSS 120B, Groq (`groq-oss`) | `openai/gpt-oss-120b` | 30 RPM, 1,000 req/day, 8,000 TPM per model |
| Gemma 4 31B, OpenRouter `:free` (`openrouter-gemma`) | `google/gemma-4-31b-it:free` | 20 RPM, 50 req/day (1,000/day after a one-time $10 purchase) |
| Mistral Small (`mistral-small`) | `mistral-small-latest` | Free mode, no card; caps are per-account and unpublished |

Free tiers change fast — re-check each provider's console before relying on
a limit. The `:free` list on OpenRouter rotates every few weeks; if
`google/gemma-4-31b-it:free` ever 404s, swap the registry entry for another
`:free` id from `GET https://openrouter.ai/api/v1/models`.

## How to get each free key

1. **Gemini** — Google AI Studio: https://aistudio.google.com/ → Get API key.
   No card required. → `GEMINI_API_KEY`
2. **Groq** — Groq console: https://console.groq.com/keys → Create API Key.
   No card required. → `GROQ_API_KEY`
3. **OpenRouter** — https://openrouter.ai/keys → Create Key. No card required
   for the 50/day free tier. → `OPENROUTER_API_KEY`
4. **Mistral** — La Plateforme: https://console.mistral.ai/api-keys → Create
   API key. No card required (phone verification). → `MISTRAL_API_KEY`

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in your keys — never commit .env.local
npm run dev                  # http://localhost:3000
```

Only the keys for models you actually use are needed — a missing key just
makes that model show a clear "API key not configured" error in its column.

## How it works

- **Backend proxy** — `app/api/chat/route.ts` is the only place that touches
  API keys. The browser sends `{ messages, modelId }`; the server validates
  `modelId` against the registry in `lib/models.ts`, resolves the provider +
  real model id + key in `lib/providers.ts` (server-only env vars, no
  `NEXT_PUBLIC_` prefix anywhere), and streams the answer back with the
  Vercel AI SDK (`streamText` → `toUIMessageStreamResponse()`).
- **Model registry** — `lib/models.ts` is the single source of truth. Adding
  a model = one registry entry + one env var. The client may only send a
  registry `id`; it can never choose an arbitrary model or base URL.
- **Fan-out** — the UI fires one `POST /api/chat` per selected model in
  parallel; each column owns an independent `useChat` instance, so a 429 in
  one column is isolated (per-column error + Retry button).
- **History** — conversations are stored in the browser's `localStorage`
  only. Click a history item to re-read it; "New chat" starts fresh.
- **Limits enforced** — max 3 models per prompt, max 4,000 prompt
  characters, last 10 turns sent per call, 512 max output tokens, Send
  disabled while any column is streaming.

## Deploy to Vercel (free Hobby plan)

1. Push this folder to a GitHub repo (e.g. `Rtumma756/fusionai`).
2. In the [Vercel dashboard](https://vercel.com/dashboard) → **Add New →
   Project** → **Import** the repo.
3. Framework preset: **Next.js** (auto-detected). Leave build settings as-is.
4. **Environment Variables** — add the four keys from `.env.example`
   (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`,
   `MISTRAL_API_KEY`). You can add only the ones you use.
5. **Deploy.** Hobby plan is $0 — do not select Pro.
6. Open the deployed URL and send one prompt to confirm each model streams.

To update a model later: edit `lib/models.ts`, commit, push — Vercel
redeploys automatically.

## Known limits / caveats

- **One prompt = N requests.** Fanning out to 3 models costs 3 requests;
  Gemini Flash-Lite's 500/day and OpenRouter's 50/day are the tightest pools.
- **429s are expected on free tiers.** Each column shows its own
  rate-limit error with a Retry button; check the provider console for your
  real quota (Gemini: AI Studio → Rate limits; Mistral: Admin Panel → API →
  Limits).
- **Free-model rotation.** A model ID that works today can be retired or
  moved behind a paywall (e.g. Groq moved Llama to Enterprise in Oct 2026).
  Keep model IDs in the registry, never in UI code.
- **Privacy.** Gemini's free tier, Mistral Free mode and some OpenRouter free
  routes may use prompts for training. Don't send sensitive data in the demo.
- **No billing, no surprises.** These free tiers are rate-limited, not
  billed — but only while billing stays off. Never link a card to the demo
  project; OpenRouter blocks free models on a negative balance (402).
- **No auth / no shared state.** This is a prototype: history lives in each
  visitor's own browser, and there is no per-user rate limiting beyond the
  prompt-length/token caps above.
