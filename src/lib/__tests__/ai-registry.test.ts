import { describe, it, expect } from "vitest";
import { AI_MODELS } from "../models.server";

/**
 * Registry sanity — every AI surface that makes a real model call must have
 * a non-empty model id; the pure-heuristic one is the documented exception.
 */
describe("AI_MODELS registry", () => {
  it("assigns a model to every AI-backed function", () => {
    for (const [fn, model] of Object.entries(AI_MODELS)) {
      if (fn === "computeStoreInsights") {
        expect(model, "computeStoreInsights is a pure heuristic — empty model id is the documented exception").toBe("");
      } else {
        expect(model, `${fn} must have a model id`).not.toBe("");
        expect(model.length, `${fn} model id looks malformed`).toBeGreaterThan(3);
      }
    }
  });

  it("routes assistantChat to a model NVIDIA NIM actually hosts", () => {
    // NVIDIA NIM hosts nvidia/* and partner ids; anything else must be routed
    // via OpenRouter explicitly (generateViaOpenRouter) — this guard keeps a
    // future registry edit honest.
    expect(AI_MODELS.assistantChat).toMatch(/^(nvidia\/|minimaxai\/|meta\/|deepseek-ai\/)/);
  });
});
