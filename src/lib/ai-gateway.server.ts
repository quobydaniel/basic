// AI providers for the Vercel AI SDK — NVIDIA NIM (primary) + OpenRouter (fallback).
//
// Sells: every AI call in BASIC goes through here. Callers build a model with
// the factory (model ids from models.server.ts / ai_model_config overrides)
// and call `generateText` — which is THIS module's wrapped version: if NVIDIA
// fails at the provider level (dead key, retired/gated model, outage, rate
// limit), the call automatically retries once through OpenRouter with the
// equivalent model. Added 2026-11-14 after the NVIDIA key died and took every
// AI feature down with it (see Session Log 2026-11-14).
//
// Both endpoints are OpenAI-compatible, so the same `@ai-sdk/openai-compatible`
// adapter serves both.
import { generateText as generateTextBase } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * NVIDIA model id → OpenRouter equivalent (verified working 2026-11-14 with
 * real completions). OpenRouter carries the same minimax id; the vision
 * successor for llama-3.2-90b-vision is llama-4-maverick.
 */
const OPENROUTER_FALLBACK_BY_MODEL: Record<string, string> = {
  "minimaxai/minimax-m3.1-flash": "minimax/minimax-m3.1-flash",
  "meta/llama-3.2-90b-vision-instruct": "meta-llama/llama-4-maverick",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": "meta-llama/llama-4-maverick",
  "deepseek-ai/deepseek-v4.1-flash": "deepseek/deepseek-v4.1-flash",
  "nvidia/nemotron-3-super-120b-a12b": "nvidia/nemotron-3-super-120b-a12b",
};

/** Provider-level failures that warrant an OpenRouter retry — not app bugs. */
function isProviderFailure(err: unknown): boolean {
  const msg = String((err as { message?: unknown })?.message ?? err);
  return /forbidden|not found|not found for account|end of life|gone\b|\b40[1349]\b|\b429\b|timed out|timeout|fetch failed|ECONN|socket hang up|overloaded|no connection/i.test(
    msg,
  );
}

/**
 * Build a model factory backed by NVIDIA NIM. Callers pass their `NVIDIA_API_KEY`
 * (read inside the server function handler from `process.env.NVIDIA_API_KEY`) so
 * the key is never captured at module scope.
 */
export function createNvidiaNimProvider(nvidiaApiKey: string) {
  return createOpenAICompatible({
    name: "nvidia-nim",
    baseURL: NVIDIA_NIM_BASE_URL,
    headers: {
      Authorization: `Bearer ${nvidiaApiKey}`,
    },
  });
}

/**
 * ── SMART ROUTING ──
 * Key pools (comma-separated env values) with health-benched rotation.
 * One dead/rate-limited key never takes a feature down and never stalls a
 * reply: the wrapper rotates to the next healthy key immediately, benches
 * the failing one (3 min, escalating to 10 min for repeat offenders), and
 * only after the whole NVIDIA pool is benched falls through to OpenRouter.
 */
type KeyHealth = { failedUntil: number; fails: number };
const keyHealth = new Map<string, KeyHealth>();

function poolFrom(envValue: string | undefined): string[] {
  return (envValue ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function nvidiaPool(): string[] {
  // The pool includes every key; NVIDIA_API_KEY stays as a legacy fallback
  // for callers that build their own provider.
  const pool = poolFrom(process.env.NVIDIA_API_KEYS);
  return pool.length ? pool : poolFrom(process.env.NVIDIA_API_KEY);
}

function openrouterPool(): string[] {
  const pool = poolFrom(process.env.OPENROUTER_API_KEYS);
  return pool.length ? pool : poolFrom(process.env.OPENROUTER_API_KEY);
}

function benchKey(key: string) {
  const h = keyHealth.get(key) ?? { failedUntil: 0, fails: 0 };
  h.fails += 1;
  h.failedUntil = Date.now() + Math.min(180_000 * h.fails, 600_000);
  keyHealth.set(key, h);
}

function pickKey(pool: string[], tried: Set<string>): string | null {
  const now = Date.now();
  const healthy = pool.filter(
    (k) => !tried.has(k) && (keyHealth.get(k)?.failedUntil ?? 0) < now,
  );
  if (healthy.length) {
    // Round-robin through the healthy keys so load spreads across the pool.
    const idx = healthy.findIndex((k) => !tried.has(k));
    return healthy[idx % healthy.length];
  }
  // Every key benched (or tried) → forgive the least-recently-failed one so
  // we never dead-end; a 429 usually clears within minutes.
  const rest = pool.filter((k) => !tried.has(k));
  if (!rest.length) return null;
  return rest.reduce((best, k) =>
    (keyHealth.get(k)?.failedUntil ?? 0) < (keyHealth.get(best)?.failedUntil ?? 0) ? k : best,
  );
}

function nim(key: string) {
  return createOpenAICompatible({ name: "nvidia-nim", baseURL: NVIDIA_NIM_BASE_URL, headers: { Authorization: `Bearer ${key}` } });
}

function openrouter(key: string) {
  return createOpenAICompatible({
    name: "openrouter",
    baseURL: OPENROUTER_BASE_URL,
    headers: {
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
      "X-Title": "BASIC",
    },
  });
}

/**
 * Drop-in replacement for the AI SDK's `generateText` with smart routing:
 * NVIDIA key pool (health-benched, round-robin) → OpenRouter key pool with
 * the model-equivalent fallback. Every attempt is time-bounded so a hung
 * provider never stalls a reply. App-level errors (validation, permissions,
 * missing context) are rethrown untouched.
 */
export async function generateText(
  params: Parameters<typeof generateTextBase>[0],
): ReturnType<typeof generateTextBase> {
  const model = params.model as { provider?: unknown; modelId?: unknown } | undefined;
  const modelId = typeof model?.modelId === "string" ? model.modelId : undefined;
  const isNvidia =
    typeof model?.provider === "string" && model.provider.startsWith("nvidia-nim") && Boolean(modelId);
  let lastErr: unknown;

  if (isNvidia && modelId) {
    const keys = nvidiaPool();
    const tried = new Set<string>();
    for (let i = 0; i < Math.min(keys.length, 3); i++) {
      const key = pickKey(keys, tried);
      if (!key) break;
      tried.add(key);
      try {
        // 40s bound per attempt: normal replies land in 4-15s; a hung or
        // queued request hands over to the next key / OpenRouter fast.
        return await generateTextBase({
          ...params,
          model: nim(key)(modelId),
          abortSignal: params.abortSignal ?? AbortSignal.timeout(40_000),
        });
      } catch (err) {
        lastErr = err;
        if (!isProviderFailure(err)) throw err;
        benchKey(key);
      }
    }
    // NVIDIA pool exhausted → OpenRouter equivalent.
    const fallbackId = OPENROUTER_FALLBACK_BY_MODEL[modelId];
    const orKeys = openrouterPool();
    const triedOr = new Set<string>();
    if (fallbackId) {
      for (let i = 0; i < Math.min(orKeys.length, 2); i++) {
        const key = pickKey(orKeys, triedOr);
        if (!key) break;
        triedOr.add(key);
        try {
          return await generateTextBase({
            ...params,
            model: openrouter(key)(fallbackId),
            abortSignal: params.abortSignal ?? AbortSignal.timeout(60_000),
          });
        } catch (err) {
          lastErr = err;
          if (!isProviderFailure(err)) throw err;
          benchKey(key);
        }
      }
    }
    throw lastErr ?? new Error("All AI providers failed");
  }

  // Non-NVIDIA models (e.g. a caller built an OpenRouter model directly):
  // single bounded attempt.
  return await generateTextBase({
    ...params,
    abortSignal: params.abortSignal ?? AbortSignal.timeout(60_000),
  });
}
