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

// ── FREE-TIER RATIONING ──
// Many users share a handful of free keys, so the router budgets proactively
// instead of discovering limits via 429s: each key gets a sliding-window RPM
// budget (NVIDIA) / daily budget (OpenRouter). Under load the router adapts —
// hedged racing and the OpenRouter speed-rescue turn OFF so quota outlasts
// the day, and requests queue for the next window instead of erroring.
const RPM_WINDOW_MS = 60_000;
const DAY_MS = 86_400_000;
const nvidiaRpm = new Map<string, number[]>(); // key -> request timestamps
const orDaily = new Map<string, { day: number; count: number }>();

const num = (v: string | undefined, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : dflt;
};
const nvidiaBudgetPerKey = () => num(process.env.NVIDIA_RPM_PER_KEY, 40); // NIM free tier ≈ 40 rpm
const orDailyPerKey = () => num(process.env.OPENROUTER_DAILY_PER_KEY, 50); // OR free tier = 50/day

function pruneNvidia(key: string): number[] {
  const now = Date.now();
  const arr = (nvidiaRpm.get(key) ?? []).filter((t) => now - t < RPM_WINDOW_MS);
  nvidiaRpm.set(key, arr);
  return arr;
}

function nvidiaSlotsLeft(key: string): number {
  return Math.max(0, nvidiaBudgetPerKey() - pruneNvidia(key).length);
}

function recordNvidia(key: string) {
  pruneNvidia(key).push(Date.now());
}

function orSlotsLeft(key: string): number {
  const today = Math.floor(Date.now() / DAY_MS);
  const rec = orDaily.get(key);
  if (!rec || rec.day !== today) {
    orDaily.set(key, { day: today, count: 0 });
    return orDailyPerKey();
  }
  return Math.max(0, orDailyPerKey() - rec.count);
}

function recordOr(key: string) {
  const today = Math.floor(Date.now() / DAY_MS);
  const rec = orDaily.get(key);
  if (!rec || rec.day !== today) orDaily.set(key, { day: today, count: 1 });
  else rec.count += 1;
}

/** Total NVIDIA requests in the current minute — the load signal. */
function nvidiaRpmNow(): number {
  return nvidiaPool().reduce((sum, k) => sum + pruneNvidia(k).length, 0);
}

/** Pick the key with the most free budget (ties → round-robin-ish first). */
function pickBudgetedKey(pool: string[], tried: Set<string>, slotsOf: (k: string) => number): string | null {
  const now = Date.now();
  const candidates = pool.filter(
    (k) => !tried.has(k) && (keyHealth.get(k)?.failedUntil ?? 0) < now,
  );
  if (!candidates.length) return pickKey(pool, tried); // all benched → forgive
  const best = candidates
    .map((k) => ({ k, slots: slotsOf(k) }))
    .sort((a, b) => b.slots - a.slots);
  return best[0].k;
}

/** Wait until a key's window frees a slot (bounded; never dead-ends). */
async function waitForSlot(pool: string[], tried: Set<string>, maxWaitMs: number): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const waitable = pool.filter(
      (k) => !tried.has(k) && (keyHealth.get(k)?.failedUntil ?? 0) < Date.now(),
    );
    if (waitable.some((k) => nvidiaSlotsLeft(k) > 0)) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false; // out of patience → attempt anyway, best effort
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

/** First fulfillment wins; losers are aborted by the caller's controller. */
function firstSuccess<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let pending = promises.length;
    let lastErr: unknown;
    if (!pending) {
      reject(new Error("no attempts"));
      return;
    }
    for (const p of promises) {
      Promise.resolve(p).then(resolve, (e) => {
        lastErr = e;
        if (--pending === 0) reject(lastErr);
      });
    }
  });
}

/**
 * Drop-in replacement for the AI SDK's `generateText` with smart routing —
 * RACE, don't wait: two healthy NVIDIA keys run the same prompt at once and
 * the first answer wins (NIM queue times swing 5-90s; the fastest of two
 * queues is almost always quick). If NVIDIA hasn't answered within 25s the
 * OpenRouter equivalent joins the race, so the worst case is ~25s + OR
 * latency instead of serial 40s×N. Losers are aborted on settle. App-level
 * errors (validation, permissions, missing context) are rethrown untouched.
 */
const OR_JOIN_DELAY_MS = 25_000;

export async function generateText(
  params: Parameters<typeof generateTextBase>[0],
): ReturnType<typeof generateTextBase> {
  const model = params.model as { provider?: unknown; modelId?: unknown } | undefined;
  const modelId = typeof model?.modelId === "string" ? model.modelId : undefined;
  const isNvidia =
    typeof model?.provider === "string" && model.provider.startsWith("nvidia-nim") && Boolean(modelId);

  if (!isNvidia || !modelId) {
    // Non-NVIDIA models (e.g. a caller built an OpenRouter model directly):
    // single bounded attempt.
    return await generateTextBase({
      ...params,
      abortSignal: params.abortSignal ?? AbortSignal.timeout(60_000),
    });
  }

  const fallbackId = OPENROUTER_FALLBACK_BY_MODEL[modelId];
  const stop = new AbortController();

  const attemptNvidia = (key: string) =>
    generateTextBase({
      ...params,
      model: nim(key)(modelId),
      abortSignal: params.abortSignal ?? stop.signal,
    }).catch((err) => {
      const msg = String((err as { message?: unknown })?.message ?? err);
      if (!isProviderFailure(err)) throw err;
      console.warn(`[ai-gateway] nvidia key .*${key.slice(-6)} failed: ${msg.slice(0, 140)}`);
      benchKey(key);
      throw err;
    });

  // Two healthy keys race — but only when the pool isn't busy. Under load
  // (many users sharing free keys) racing doubles consumption, so it degrades
  // to a single attempt automatically.
  const keys = nvidiaPool();
  const racers: Promise<Awaited<ReturnType<typeof generateTextBase>>>[] = [];
  const usedNvidia = new Set<string>();
  const busy = nvidiaRpmNow() >= num(process.env.AI_RACE_RPM, 12);
  const raceCount = busy ? 1 : Math.min(keys.length, 2);
  for (let i = 0; i < raceCount; i++) {
    const key = pickBudgetedKey(keys, usedNvidia, nvidiaSlotsLeft);
    if (!key) break;
    usedNvidia.add(key);
    if (nvidiaSlotsLeft(key) <= 0) {
      // Whole pool at its minute budget → queue for the next window (bounded)
      // instead of burning attempts into 429s.
      const ok = await waitForSlot(keys, usedNvidia, 20_000);
      if (!ok) console.warn("[ai-gateway] all NVIDIA keys at rpm budget — attempting best-effort");
    }
    recordNvidia(key);
    racers.push(attemptNvidia(key));
  }
  // OpenRouter speed-rescue joins only when the pool has headroom — free OR
  // keys get 50 requests/day each, so under load it's reserved for NVIDIA
  // being properly dead (handled by the reserve below).
  const orKeys = openrouterPool();
  const orKey = orKeys.some((k) => orSlotsLeft(k) > 0) ? pickBudgetedKey(orKeys, new Set(), orSlotsLeft) : null;
  const rescueAllowed = nvidiaRpmNow() < num(process.env.AI_OR_JOIN_RPM, 10);
  if (fallbackId && orKey && rescueAllowed) {
    racers.push(
      (async () => {
        // Head start for NVIDIA — OpenRouter only joins if NVIDIA is slow.
        await new Promise((r) => setTimeout(r, OR_JOIN_DELAY_MS));
        try {
          recordOr(orKey);
          return await generateTextBase({
            ...params,
            model: openrouter(orKey)(fallbackId),
            abortSignal: params.abortSignal ?? stop.signal,
          });
        } catch (err) {
          const msg = String((err as { message?: unknown })?.message ?? err);
          if (/abort/i.test(msg)) throw err; // loser cancelled by the winner
          // Free OpenRouter accounts ration output tokens by remaining
          // credits ("can only afford N") — retry with a budget it CAN
          // afford instead of dying.
          const afford = msg.match(/can only afford (\d+)/i);
          if (!afford) throw err;
          const budget = Math.max(
            120,
            Math.min(Number(afford[1]) - 16, Number(params.maxOutputTokens ?? afford[1])),
          );
          return await generateTextBase({
            ...params,
            model: openrouter(orKey)(fallbackId),
            maxOutputTokens: budget,
            abortSignal: params.abortSignal ?? stop.signal,
          });
        }
      })().catch((err) => {
        const msg = String((err as { message?: unknown })?.message ?? err);
        if (!/abort/i.test(msg)) {
          console.warn(`[ai-gateway] openrouter fallback failed: ${msg.slice(0, 140)}`);
        }
        throw err;
      }),
    );
  }

  try {
    const winner = await firstSuccess(racers);
    stop.abort(); // cancel the losers — stop burning provider compute
    return winner;
  } catch (err) {
    // Every racer failed → one reserved NVIDIA key retry, serial, before
    // giving up (covers "all raced keys were benched mid-race").
    const reserve = pickKey(keys, usedNvidia);
    if (!reserve) throw err;
    return await generateTextBase({
      ...params,
      model: nim(reserve)(modelId),
      abortSignal: params.abortSignal ?? AbortSignal.timeout(70_000),
    });
  }
}
