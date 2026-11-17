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
 * Drop-in replacement for the AI SDK's `generateText` with one extra behaviour:
 * on a NVIDIA provider-level failure, retry once through OpenRouter with the
 * equivalent model (OPENROUTER_API_KEY from .env). App-level errors (validation,
 * permissions, missing context) are rethrown untouched.
 */
export async function generateText(
  params: Parameters<typeof generateTextBase>[0],
): ReturnType<typeof generateTextBase> {
  try {
    // Bound the NVIDIA attempt: a hung/queued NIM request used to stall the
    // caller for 60-90s before the fallback ever fired. Normal replies land
    // in 4-15s; abort at 40s so the OpenRouter retry starts while the user
    // is still watching the typing bubble.
    return await generateTextBase({ ...params, abortSignal: params.abortSignal ?? AbortSignal.timeout(40_000) });
  } catch (err) {
    if (!isProviderFailure(err)) throw err;
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const nvidiaModelId = (params.model as { modelId?: unknown } | undefined)?.modelId;
    const fallbackId =
      typeof nvidiaModelId === "string" ? OPENROUTER_FALLBACK_BY_MODEL[nvidiaModelId] : undefined;
    if (!openrouterKey || !fallbackId) throw err;
    const openrouter = createOpenAICompatible({
      name: "openrouter",
      baseURL: OPENROUTER_BASE_URL,
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
        "X-Title": "BASIC",
      },
    });
    return await generateTextBase({
      ...params,
      model: openrouter(fallbackId),
      abortSignal: params.abortSignal ?? AbortSignal.timeout(60_000),
    });
  }
}
