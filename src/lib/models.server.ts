// Per-function AI model registry.
//
// NVIDIA NIM exposes dozens of models behind one OpenAI-compatible endpoint. We
// pick one model per server function so each can use the right cost/capability
// trade-off.
//
// Swap any model id here by editing one line — the 5 server functions in
// `ai.functions.ts` read their model id from this map.
//
// Last audited against the live NVIDIA NIM catalog 2026-08-28 with the
// owner's key (per-account model access verified by real chat completions):
//   - meta/llama-3.2-90b-vision-instruct  WORKS (vision)
//   - minimaxai/minimax-m3                WORKS (owner-requested)
//   - deepseek-ai/deepseek-v4-flash-0731  WORKS (reasoning split into a
//     separate `reasoning_content` field — `content` stays clean for JSON)
//   - retired from catalog: llama-3.1-8b, llama-3.3-70b, deepseek-r1
//   - gated per-account (404): minitron-8b, gemma, granite, mistral-7b…
export const AI_MODELS = {
  // Multi-image vision → extracts title/description/specs/price from a product photo.
  generateListingFromPhotos: "meta/llama-3.2-90b-vision-instruct",

  // Chat reply drafts: fast general chat; MiniMax M3 is the fastest confirmed
  // general model on this account.
  draftChatReplies: "minimaxai/minimax-m3",

  // Marketing copy: DeepSeek per owner's pick. v4-flash (not pro) — reasoning
  // arrives in a separate field so `content` stays clean JSON-extractable.
  generateMarketingPost: "deepseek-ai/deepseek-v4-flash-0731",

  // Pure server-side heuristic — no AI call needed.
  computeStoreInsights: "",

  // Floating seller assistant: MiniMax M3 per owner's explicit request.
  assistantChat: "minimaxai/minimax-m3",
} as const;

export type AiFnName = keyof typeof AI_MODELS;
