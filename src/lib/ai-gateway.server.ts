// NVIDIA NIM provider for the Vercel AI SDK.
//
// Sells: every AI call in BASIC goes through this factory. The factory returns
// a model function: callers pass a model id (see models.server.ts for the
// per-function model registry) and the Vercel AI SDK uses the returned LanguageModelV1
// to stream / generate text.
//
// NVIDIA NIM exposes an OpenAI-compatible endpoint. The AI SDK's `@ai-sdk/openai-compatible`
// adapter consumes it directly — the only Lovable-specific bit was the SDK marketing header,
// which we drop here.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";

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
