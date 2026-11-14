// Per-function AI model registry.
//
// NVIDIA NIM exposes dozens of models behind one OpenAI-compatible endpoint. We
// pick one model per server function so each can use the right cost/capability
// trade-off.
//
// Swap any model id here by editing one line — the 5 server functions in
// `ai.functions.ts` read their model id from this map.
//
// Last audited against the live NVIDIA NIM catalog 2026-11-14 with a fresh
// owner key (the 2026-08-28 key lost all inference access; every model 403'd).
// Verified by real chat completions on 2026-11-14:
//   - meta/llama-3.2-90b-vision-instruct  WORKS (vision) — still on the account
//   - minimaxai/minimax-m3.1-flash        WORKS (successor of m3, EOL'd
//     2026-09-09); reasoning split into `reasoning_content`, `content` clean
//   - deepseek-ai/deepseek-v4.1-flash     HANGS (60s timeout, no response) —
//     revisit before re-enabling for marketing copy
//   - nvidia/nemotron-3.5-super-vl-120b-a12b  WORKS (vision backup)
//   - retired/EOL: minimaxai/minimax-m3 (Gone 2026-09-09),
//     deepseek-ai/deepseek-v4-flash-0731 (Gone 2026-09-21)
export const AI_MODELS = {
  // Multi-image vision → extracts title/description/specs/price from a product photo.
  generateListingFromPhotos: "meta/llama-3.2-90b-vision-instruct",

  // Chat reply drafts: fast general chat; MiniMax M3.1 flash is the verified
  // successor on this account.
  draftChatReplies: "minimaxai/minimax-m3.1-flash",

  // Marketing copy: was DeepSeek v4-flash per owner's pick — that line EOL'd
  // (2026-09-21) and v4.1-flash hangs. M3.1 flash until deepseek answers again.
  generateMarketingPost: "minimaxai/minimax-m3.1-flash",

  // Pure server-side heuristic — no AI call needed.
  computeStoreInsights: "",

  // Floating seller assistant: MiniMax per owner's explicit request (m3.1 now).
  assistantChat: "minimaxai/minimax-m3.1-flash",
} as const;

export type AiFnName = keyof typeof AI_MODELS;
