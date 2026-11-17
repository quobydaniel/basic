// Auto-pilot engine — server-only. Shared by both reply paths:
//
//  • autoPilotReply      (seller authenticated: thread open / dashboard
//                         heartbeat) — inserts messages directly, since
//                         messages RLS allows seller_id = auth.uid().
//  • autoPilotReplyRemote (buyer authenticated: the buyer's send pings the
//                         server) — inserts via the basic_autopilot_send RPC,
//                         because RLS correctly forbids a buyer writing as
//                         the seller. This is what makes a Pro store answer
//                         buyers even when the seller's browser is closed.
//
// One engine, so prompts, ORDER_READY handling and order mechanics never
// drift between the two paths.
import "./ws-polyfill.server";
import { createNvidiaNimProvider, generateText } from "@/lib/ai-gateway.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AI_MODELS, type AiFnName } from "@/lib/models.server";
import { characterById } from "@/lib/ai-characters";

type AnySupabase = SupabaseClient<Database>;

// Resolve the model for an AI fn: DB override (ai_model_config) wins unless
// empty/missing — then the file registry is the fallback. One small DB read.
export async function resolveModel(supabase: AnySupabase, fn: AiFnName) {
  try {
    const { data } = await supabase
      .from("ai_model_config")
      .select("model_id")
      .eq("fn_name", fn)
      .maybeSingle();
    const override = (data as { model_id?: string } | null)?.model_id;
    if (override && override !== "") return override;
  } catch {
    // Config table missing or read failed — file registry still works.
  }
  return AI_MODELS[fn];
}

export async function runAutoPilot(
  supabase: AnySupabase,
  opts: {
    conversationId: string;
    callerId: string;
    /** "direct" = caller IS the seller (RLS-clean insert); "rpc" = caller is
        the buyer — messages land via basic_autopilot_send as the seller. */
    delivery: "direct" | "rpc";
  },
): Promise<{ reply: string; order_number: string | null }> {
  const { conversationId, callerId, delivery } = opts;

  const { data: convo } = await supabase
    .from("conversations")
    .select(
      "id, seller_id, buyer_id, store_id, product_id, created_at, ai_price_limit, ai_enabled, store:stores(id, name, slug, area, city, region, payment_terms, plan, auto_pilot, whatsapp_number, currency, owner_id, ai_name, ai_greeting, ai_persona, ai_character)",
    )
    .eq("id", conversationId)
    .maybeSingle();
  const conv: any = convo;
  if (!conv) throw new Error("Conversation not found");
  if (conv.seller_id !== callerId && conv.buyer_id !== callerId) throw new Error("Not your conversation");
  const st: any = conv.store ?? {};
  if (st.plan !== "pro") throw new Error("Auto-pilot is a Pro feature — upgrade your store to Pro.");
  if (!st.auto_pilot) throw new Error("Auto-pilot is OFF for this store.");
  // Per-chat pause — the thread header's Auto-pilot button writes this.
  if (conv.ai_enabled === false) throw new Error("AI paused for this chat by the seller.");

  // Long memory: the last 20 messages (≈ 3 days of haggling), not 40 — the
  // prompt-processing cost of every extra message is the biggest chunk of
  // reply latency on NIM, and the BUYER MEMORY block already carries the
  // durable context (orders, first contact, open order).
  const { data: msgs } = await supabase
    .from("messages")
    .select("sender_id, body, kind, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);
  const chat = (msgs ?? []).reverse();
  const lastMessage = chat[chat.length - 1];
  if (!lastMessage || lastMessage.sender_id !== conv.buyer_id) throw new Error("Nothing to reply to");

  const { data: prods } = await (supabase
    .from("products")
    .select("id, slug, title, base_price, currency, negotiable, ai_min_price, description, product_variants(title, inventory_qty)")
    .eq("store_id", st.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(12) as any);
  const stockOf = (p: any) => (p.product_variants ?? []).reduce((s2: number, v: any) => s2 + Number(v.inventory_qty ?? 0), 0);
  const catalog = (prods ?? [])
    .map((p: any) => `- ${p.title} — ${p.currency ?? "GHS"} ${p.base_price} (product slug: ${p.slug})${p.product_variants?.length ? ` — variants: ${p.product_variants.map((v: any) => v.title).join(", ")}` : ""} — stock: ${stockOf(p) === 0 ? "SOLD OUT" : stockOf(p)}${p.negotiable ? " — price negotiable" : ""}${p.ai_min_price ? ` — AI floor: ${p.currency ?? "GHS"} ${p.ai_min_price}` : ""}`)
    .join("\n") || "(no products listed yet)";
  const listingLine = conv.product_id
    ? (() => {
        const p = (prods ?? []).find((x: any) => x.id === conv.product_id);
        return p ? `\nThe conversation is about: "${p.title}" (${p.currency ?? "GHS"} ${p.base_price}).` : "";
      })()
    : "";
  // Price floor context — the seller's per-chat limit overrides the product
  // floor for this conversation; both come straight from the DB.
  const focused = (prods ?? []).find((x: any) => x.id === conv.product_id) ?? null;
  const chatFloor = Number((conv as any).ai_price_limit ?? 0);
  const productFloor = focused ? Number((focused as any).ai_min_price ?? 0) : 0;
  const floorLine =
    chatFloor > 0 || productFloor > 0
      ? `\nPRICE FLOOR: ${chatFloor > 0 ? `the seller's floor for this chat is ${st.currency ?? "GHS"} ${chatFloor}` : `the seller's floor for "${(focused as any)?.title}" is ${(focused as any)?.currency ?? "GHS"} ${productFloor}`}${chatFloor > 0 && productFloor > 0 ? " (the chat floor overrides the product floor)" : ""}. Never agree below it — see PRICE FLOORS in the rules.`
      : "";
  const { data: buyerOrders } = await supabase
    .from("orders")
    .select("id, order_number, status, total, currency, fulfillment_type, payment_term, notes, created_at")
    .eq("store_id", st.id)
    .eq("buyer_id", conv.buyer_id)
    .order("created_at", { ascending: false })
    .limit(10);
  const orders: any[] = buyerOrders ?? [];
  const statusCounts = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});
  const orderHistory = orders
    .map((o: any) => `- #${o.order_number} — ${o.status} — ${o.currency ?? "GHS"} ${o.total}${o.payment_term ? ` · ${o.payment_term.replace(/_/g, " ")}` : ""} — ${new Date(o.created_at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`)
    .join("\n") || "(this buyer has no orders with the store yet)";
  const pendingOrders = orders.filter((o) => o.status === "pending");
  const openOrder = pendingOrders[0];
  const pendingLine = pendingOrders.length
    ? `OPEN ORDER${pendingOrders.length > 1 ? "S (" + pendingOrders.length + " — duplicates possible, ask the seller to clean up)" : ""} (do not create another for this item — see rules):\n${pendingOrders.slice(0, 3).map((o) => `- #${o.order_number} — pending seller confirmation — ${o.currency ?? "GHS"} ${o.total}${o.fulfillment_type ? ` · ${o.fulfillment_type.replace(/_/g, " ")}` : ""}${o.payment_term ? ` · ${o.payment_term.replace(/_/g, " ")}` : ""} — placed ${new Date(o.created_at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`).join("\n")}`
    : "(no order awaiting confirmation right now)";

  // Past chats with this same buyer — "remember previous chats" without a
  // schema change: the conversations table already holds the history.
  const { data: pastConvos } = await supabase
    .from("conversations")
    .select("id, created_at, last_message_at")
    .eq("buyer_id", conv.buyer_id)
    .eq("store_id", st.id)
    .order("created_at", { ascending: true });
  const firstContact = pastConvos?.[0]?.created_at ?? conv.created_at;
  const daysKnown = Math.max(1, Math.round((Date.now() - new Date(firstContact).getTime()) / 86_400_000));
  const returning = (pastConvos?.length ?? 0) > 1 || orders.length > 0;
  const memoryBlock = [
    `BUYER MEMORY (real history — use it, never reintroduce yourself to a returning buyer):`,
    `- First contact: ${new Date(firstContact).toLocaleDateString()} (${daysKnown} day${daysKnown === 1 ? "" : "s"} ago)${returning ? " — RETURNING buyer; greet them like a familiar face" : " — first-time buyer"}`,
    pastConvos && pastConvos.length > 1 ? `- ${pastConvos.length} conversations with this store to date` : "",
    orders.length ? `- ${orders.length} order${orders.length === 1 ? "" : "s"} so far (${Object.entries(statusCounts).map(([k, v]) => `${v} ${k}`).join(", ")})` : "- No orders yet",
    pendingLine,
    orderHistory !== "(this buyer has no orders with the store yet)" ? `Order history (newest first):\n${orderHistory}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // ── AI engagement rules (after BUYER MEMORY — they need the history) ──
  // NO presence gate on purpose: the seller being online must never make a
  // buyer wait. The old "returning buyer + seller online → stand down" rule
  // sounded polite but meant the buyer sat waiting for the seller's
  // dashboard heartbeat poll (minutes) while the UI promised "✦ AI on duty".
  // The controls are explicit now: the store master switch (auto_pilot) and
  // the per-chat pause (ai_enabled === false). The newest-message gate and
  // the RPC last-message gate already stop the AI from talking over a
  // seller who is typing a personal reply.
  if (conv.ai_enabled === false) {
    throw new Error("Auto-pilot paused for this chat — the seller replies personally.");
  }

  // No artificial grace sleep — it added dead latency to EVERY reply and the
  // correctness it tried to buy is already guaranteed twice: the newest-
  // message gate below (before we spend an NVIDIA call) and the RPC's
  // last-message gate (before anything inserts). A seller typing mid-
  // generation claims the slot; the AI's insert is refused.
  // Newest-message gate (unconditional): the AI only ever answers the
  // buyer's latest word. Seller texts and null-sender system cards are the
  // AI's own output — a trigger landing on one is stale, and answering it
  // would self-loop. Catches it here before an NVIDIA call is spent (the
  // RPC gate would refuse the insert anyway).
  try {
    const { data: newest } = await supabase
      .from("messages")
      .select("sender_id")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1);
    if ((newest ?? [])[0]?.sender_id !== conv.buyer_id) {
      throw new Error("Nothing new to answer — the buyer is no longer the last speaker. AI stands down.");
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("stands down")) throw e;
  }

  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("Missing NVIDIA_API_KEY");
  const gateway = createNvidiaNimProvider(key);
  const model = gateway(await resolveModel(supabase, "assistantChat"));
  // Seller-tuned persona (Settings → AI assistant): identity name, custom
  // greeting, and house rules the AI must follow in every reply.
  const character = characterById(st.ai_character);
  const aiName = String(st.ai_name ?? "").trim();
  const identity = aiName
    ? `You are ${aiName}, the AI sales assistant for ${st.name} on BASIC, replying to a buyer in chat on the seller's behalf.`
    : character
      ? `You are ${character.name} ${character.emoji}, the AI shopkeeper character of ${st.name} on BASIC (${character.blurb}), replying to a buyer in chat on the seller's behalf.`
      : `You ARE ${st.name}'s salesperson on BASIC, replying to a buyer in chat on the seller's behalf.`;
  const personaLine = String(st.ai_persona ?? "").trim()
    ? `\nSELLER PERSONALITY & HOUSE RULES (obey these in every reply — tone, style, do's and don'ts — they override the default voice):\n${String(st.ai_persona).trim()}`
    : "";
  const greetingLine = String(st.ai_greeting ?? "").trim()
    ? `\nGREETING: when you greet a buyer for the first time in this conversation, open with this (adapt it naturally to their message, keep it fresh on repeats):\n"${String(st.ai_greeting).trim()}"`
    : "";
  const result = await generateText({
    model,
    // Replies are 1-3 sentences by rule — cap output so reasoning models
    // can't burn 30s wandering before the short answer ships.
    maxOutputTokens: 600,
    instructions: `${identity} The seller has auto-pilot ON — you handle this conversation end-to-end.
CATALOG (live data — never invent products, prices, or stock):
${catalog}${listingLine}${floorLine}${personaLine}${greetingLine}
Store location: ${[st.area, st.city || st.region].filter(Boolean).join(", ") || "Ghana"}. Payment options: ${JSON.stringify(st.payment_terms ?? [])}.
${memoryBlock}
CONTINUITY RULES: you have the recent chat plus the BUYER MEMORY above. Never re-introduce yourself or re-greet a returning buyer like a stranger. Never re-ask a question the buyer already answered — check the history first. If you promised something earlier (a price, a callback), stay consistent with it or explicitly correct it ("Quick correction — earlier I said X, the right figure is Y"). When the buyer asks "what did the seller say", answer from the open order / memory, never with a canned deflection.
CHANGE REQUESTS (be honest about what you can do): you CANNOT edit an order that's already placed — only the seller can change quantity, price, delivery or payment when they confirm it. When the buyer asks to change something on a pending order, say plainly: "Noted — I've flagged the change (1 copy instead of 2) for the seller to update when they confirm your order #X." Never say "I've changed it", never imply it's done, and don't ask them to order again.
PHOTOS: you cannot see images. When the transcript shows a photo marker, never say the photo "didn't come through" and never ask the buyer to resend — the buyer sent it fine; you just can't view it. Acknowledge it naturally ("Noted, thanks for the photo — the seller will review it when they confirm") and address whatever else is open.
HOW TO SELL LIKE A HUMAN: warm, brief (1-3 sentences), Ghana-marketplace tone. Answer questions from the catalog. For products marked "price negotiable", agree on a number like a real shopkeeper: welcome the buyer's offer, counter once if it's far below list, and once the buyer settles on a figure, that IS the deal price — pass it in ORDER_READY (price=<their number>).
PRICE FLOORS — HARD RULE: some catalog lines show "AI floor: GHS X" and the seller may set a per-chat floor (see PRICE FLOOR above). NEVER agree below the floor. If the buyer's best offer is below it, decline warmly, counter at or just above the floor, and if they push again, say you'll check with the seller — then stop negotiating and wait for the seller. Every order you propose lands as PENDING for the seller to confirm, so the seller always has the final say.
ORDER TRACKING: when the buyer asks about their order ("where is it", "when will it arrive", "did the seller confirm"), answer from the BUYER MEMORY status lines. Statuses move pending → paid → fulfilled → shipped → delivered. If the order is still pending, say it's with the seller for confirmation — and answer their actual question.
DUPLICATE GUARD — CRITICAL: if BUYER MEMORY shows an OPEN ORDER (pending), you must NOT emit ORDER_READY for the same item again — no matter how the buyer phrases confirmation ("ok", "yes", "momo", "kasoa"). Instead reply about the existing order: confirm its details, answer their question, and tell them the seller will confirm it shortly. Only emit ORDER_READY when the buyer is ordering a DIFFERENT item (or the previous order is no longer pending — check the statuses).
ORDER PLACEMENT — MANDATORY MECHANICS: when the buyer's last message gives ALL of item + quantity + delivery area + payment (or confirms them) AND no duplicate applies, you MUST append EXACTLY one last line to your reply:
ORDER_READY: product_slug=<slug> | qty=<n> | variant=<text or "-"> | delivery=<text> | payment=<text> | price=<unit price agreed or "-">
price is the UNIT price the buyer actually agreed to — when the buyer named a price (negotiation), use THEIR number, not the list price; "-" means book the catalog price. This line is a machine command — the proposal is ONLY created if the line is present, so NEVER omit it once the details are known, even if your visible text already sounds confirmed. Write the friendly summary ("Deal — 2× Samsung A05s for Osu, pay on delivery ✓") and THEN the line. Never show the line to the buyer in words; never mention slugs or codes. If any detail is missing, ask for that one thing only — no line. IMPORTANT: your proposal goes to the SELLER for confirmation first — the order only reaches the buyer's Orders after the seller confirms it, so your visible text should say the deal is noted and with the seller for confirmation (never "order placed" or "it's in your Orders").
CANCELLATIONS: when the buyer asks to cancel an order that's still pending, you cancel it yourself — append EXACTLY one line to your reply:
CANCEL_REQUEST: order_number=<order number from BUYER MEMORY, or "-">
Your visible text confirms it plainly ("Done — order #X is cancelled for you"). For orders already paid you can't cancel: say "I've asked the seller to review your cancellation" and never claim it's done — the engine routes those to the seller.
If a product shows stock: 0, it is SOLD OUT — say so and offer an alternative instead of taking the order. Never promise more units than the stock shows; stock is tracked live and every confirmed order deducts it automatically. If the buyer is just chatting or asking, reply normally with NO ORDER_READY line.
CRITICAL: prices and stock only from the catalog (except a price the buyer themselves agreed to, which goes in ORDER_READY price=). If asked something you can't know (exact meetup point, custom requests), say the seller will confirm.`,
    messages: chat.map((m: any) => ({
      role: m.sender_id === conv.buyer_id ? "user" : "assistant",
      // Image messages have no text body — mark them explicitly so the model
      // never mistakes a photo for a glitched/empty message.
      content:
        m.kind === "image"
          ? "[photo sent — you cannot view it; the seller will see it in the chat]"
          : String(m.body ?? "").slice(0, 1000),
    })),
  });

  let reply = result.text.trim();
  let orderNumber: string | null = null;
  let systemCards: { body: string; metadata: any }[] = [];

  // POST-GENERATION RACE GUARD: several surfaces (open thread × N tabs,
  // dashboard heartbeat, buyer trigger) can run this engine at once. The
  // RPC's last-message gate catches most losers, but machine actions (order
  // cancel, proposal cards) bypass it via plain inserts — so re-check that
  // the buyer is STILL the last speaker before acting on the reply.
  try {
    const { data: lastNow } = await supabase
      .from("messages")
      .select("sender_id")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1);
    if ((lastNow ?? [])[0]?.sender_id !== conv.buyer_id) {
      console.log("[autopilot] post-generation stand-down: buyer is no longer the last speaker — another surface answered");
      return { reply: "", order_number: null };
    }
  } catch {
    // Can't verify → proceed; the RPC gate still guards the text.
  }
  const om = reply.match(/ORDER_READY:\s*product_slug=([^\s|]+)\s*\|\s*qty=(\d+)\s*\|\s*variant=([^|]*)\s*\|\s*delivery=([^|]*)\s*\|\s*payment=([^|]*)\s*(?:\|\s*price=([^|\s]*))?\s*$/);
  const cm = reply.match(/CANCEL_REQUEST:\s*order_number=([^\s|]+)\s*$/);
  reply = reply.replace(/ORDER_READY:[\s\S]*$/, "").replace(/CANCEL_REQUEST:[\s\S]*$/, "").trim();
  if (om) {
    // Duplicate guard (live-tested flaw): the buyer had already placed this
    // order from the "Place order" button, and ORDER_READY created a second
    // one. While ANY pending order awaits the seller's confirmation, the AI
    // must not stack another — it confirms the existing one instead.
    const { data: openOrders } = await supabase
      .from("orders")
      .select("order_number")
      .eq("store_id", st.id)
      .eq("buyer_id", conv.buyer_id)
      .eq("status", "pending")
      .limit(1);
    const pending = (openOrders ?? []).length > 0;
    const prod = pending ? null : (prods ?? []).find((p: any) => p.slug === om[1].trim());
    // The AI's pre-ORDER_READY text is order-confirmation language ("order
    // placed ✓ …") — wrong when we just declined to create a duplicate, so
    // swap in clean tracking copy.
    if (pending) {
      reply = "You're all set — your order is already with us and the seller will confirm it shortly. Track it anytime in your Orders.";
    }
    if (prod) {
      const qty = Math.min(99, Math.max(1, parseInt(om[2], 10) || 1));
      const variant = om[3].trim() && om[3].trim() !== "-" ? om[3].trim().slice(0, 200) : null;
      const deliveryArea = om[4].trim() && om[4].trim() !== "-" ? om[4].trim().slice(0, 200) : null;
      const paymentText = om[5].trim().toLowerCase();
      const paymentTerm = paymentText.includes("escrow")
        ? "escrow"
        : paymentText.includes("before") || paymentText.includes("momo") || paymentText.includes("mobile money")
          ? "pay_before_delivery"
          : paymentText.includes("delivery") || paymentText.includes("cod") || paymentText.includes("cash")
            ? "pay_on_delivery"
            : null;
      const listPrice = Number(prod.base_price);
      const floor = Number(prod.ai_min_price ?? 0);
      // Negotiated unit price: the AI may pass the price the buyer actually
      // agreed to ("price=500" on a GH₵67 listing). Bounded — wildly out of
      // range (0, negative, >10× list) falls back to the list price. Below
      // the seller's floor the prompt forbids the deal — if the model emits
      // one anyway, clamp to the floor (the seller still confirms).
      const claimedPrice = om[6] && om[6].trim() !== "-" ? Number(om[6].replace(/[^0-9.]/g, "")) : NaN;
      let unit = Number.isFinite(claimedPrice) && claimedPrice > 0 && claimedPrice <= listPrice * 10
        ? claimedPrice
        : listPrice;
      if (floor > 0 && unit < floor) unit = floor;
      const negotiated = unit !== listPrice;
      const total = Number((unit * qty).toFixed(2));
      // PROPOSAL, not an order — nothing lands in the buyer's Orders until
      // the seller taps Confirm on the card in chat. The payload carries
      // everything the confirm handler needs to create the real order.
      systemCards.push({
        body: `AI proposal — ${qty}× ${prod.title} @ ${prod.currency ?? "GHS"} ${unit}${variant ? ` · ${variant}` : ""}${deliveryArea ? ` · deliver to ${deliveryArea}` : ""}${paymentTerm ? ` · ${paymentTerm.replace(/_/g, " ")}` : ""}${negotiated ? " · negotiated" : ""}. Seller confirmation places this in the buyer's Orders.`,
        metadata: { proposal: "order", ai: true, payload: { product_slug: prod.slug, product_title: prod.title, qty, variant, delivery: deliveryArea, payment: paymentTerm, unit_price: unit, total } },
      });
      const waDigits = String(st.whatsapp_number ?? "").replace(/\D/g, "");
      // Full deterministic recap — the AI already closed the deal with the
      // buyer, so the seller gets every term in one glance (notification
      // body AND WhatsApp prefill) and confirms in the chat.
      const recapLines = [
        `AI closed a deal in "${conv.buyer_name ?? "a buyer"}" chat — needs your confirmation:`,
        `• Deal: ${qty}× ${prod.title} @ ${prod.currency ?? "GHS"} ${unit}${negotiated ? ` (negotiated from ${prod.currency ?? "GHS"} ${listPrice})` : ""} = ${prod.currency ?? "GHS"} ${total}`,
        variant ? `• Variant: ${variant}` : "",
        deliveryArea ? `• Delivery: ${deliveryArea}` : "",
        paymentTerm ? `• Payment: ${paymentTerm}` : "",
        returning
          ? `• Buyer: returning customer${daysKnown > 0 ? ` (${daysKnown} day${daysKnown === 1 ? "" : "s"} known)${orders.length ? `, ${orders.length} order${orders.length === 1 ? "" : "s"} so far` : ""}` : ""}`
          : "• Buyer: first-time customer",
        `Confirm it in your BASIC chat (Dashboard → Messages).`,
      ].filter(Boolean).join("\n");
      const waText = recapLines;
      // Best-effort: RLS may not let the buyer's session notify the seller —
      // the unread counters + dashboard heartbeat cover that case anyway.
      try {
        await supabase.from("notifications").insert({
          user_id: st.owner_id ?? conv.seller_id,
          kind: "order",
          title: "AI has an order proposal — confirm it",
          body: `${qty}× ${prod.title} · ${prod.currency ?? "GHS"} ${total}${deliveryArea ? ` · ${deliveryArea}` : ""}`,
          payload: {
            conversation_id: conversationId,
            wa_link: waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(waText)}` : null,
          },
        });
      } catch {}
    }
  }
  if (cm) {
    // Cancellations — a PENDING order the AI cancels outright (nothing is
    // captured yet and the buyer asked), prompting the seller with an
    // informational card + notification. Paid orders go to the seller as a
    // confirm-first proposal card. If the caller can't edit orders (the RPC
    // path runs as the buyer), the pending cancel falls back to the proposal
    // card so the request is never lost.
    const wantNum = cm[1].trim().replace(/^#/, "");
    const pendingTarget = wantNum && wantNum !== "-" ? pendingOrders.find((o) => o.order_number === wantNum) ?? null : openOrder ?? null;
    const paidTarget = wantNum && wantNum !== "-"
      ? orders.find((o) => ["paid", "fulfilled"].includes(o.status) && o.order_number === wantNum) ?? null
      : null;
    let cancelled = false;
    if (pendingTarget) {
      try {
        const { error } = await supabase
          .from("orders")
          .update({ status: "cancelled" })
          .eq("id", pendingTarget.id)
          .eq("status", "pending");
        if (error) console.error("[autopilot] auto-cancel failed:", error.message);
        else cancelled = true;
      } catch (e) {
        console.error("[autopilot] auto-cancel threw:", e);
      }
    }
    if (cancelled) {
      systemCards.push({
        body: `Order #${pendingTarget!.order_number} was cancelled automatically at the buyer's request.`,
        metadata: { order_id: pendingTarget!.id, cancelled_by_ai: true },
      });
      try {
        await supabase.from("notifications").insert({
          user_id: st.owner_id ?? conv.seller_id,
          kind: "order",
          title: "Order cancelled by the AI",
          body: `#${pendingTarget!.order_number} — the buyer asked to cancel and it was still pending`,
          payload: { order_id: pendingTarget!.id },
        });
      } catch {}
      // The reply was written for the confirm-first flow — make it match reality.
      reply = reply.replace(/(I've asked the seller to confirm the cancellation[.!?]*|asked the seller to confirm[.!?]*)/gi, "Done — I've cancelled it for you ✓");
    } else {
      const target = pendingTarget ?? paidTarget;
      if (target) {
        systemCards.push({
          body: `AI proposal — the buyer asks to cancel order #${target.order_number}. Confirming cancels it.`,
          metadata: { proposal: "cancel", order_id: target.id, ai: true },
        });
        try {
          await supabase.from("notifications").insert({
            user_id: st.owner_id ?? conv.seller_id,
            kind: "order",
            title: "AI cancellation proposal — confirm it",
            body: `#${target.order_number} — the buyer asked to cancel`,
            payload: { order_id: target.id },
          });
        } catch {}
      }
    }
  }

  // Deliver the TEXT first: the RPC's last-message gate only lets a message
  // through when the newest one is the buyer's, so the AI's text must claim
  // that slot before anything else lands. Losers of a multi-surface race are
  // refused here ("nothing to reply to") — one AI answer per buyer message.
  if (reply) {
    await postMessage({ kind: "text", body: reply, metadata: { ai: true } });
  }
  // Proposal cards go out as null-sender messages via plain inserts —
  // messages RLS allows any participant to post sender_id NULL, they render
  // as the centered gold card for both sides, and they don't consume the
  // RPC's one-reply-per-buyer-message slot.
  for (const card of systemCards) {
    const { error: cardErr } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: null,
      kind: "system_order",
      body: card.body,
      metadata: card.metadata,
    });
    if (cardErr) console.error("[autopilot] proposal card insert failed:", cardErr.message);
  }
  return { reply, order_number: orderNumber };

  // Message delivery — ALWAYS through the basic_autopilot_send RPC when it
  // exists: its conversation FOR UPDATE lock + last-message gate serializes
  // every surface (open thread × N tabs, dashboard heartbeat, buyer trigger),
  // so the double-fire seen live (two tabs → two identical AI replies) is
  // refused server-side. Direct insert remains only as the fallback while
  // the RPC migration isn't applied yet — and only when the caller IS the
  // seller (RLS forbids a buyer session writing as the seller).
  async function postMessage(m: { kind: "text" | "system_order"; body: string; metadata: any }) {
    const metadata = { ...(m.metadata ?? {}) };
    const { error: rpcErr } = await (supabase as any)
      .rpc("basic_autopilot_send", {
        p_conversation_id: conversationId,
        p_body: m.body,
        p_kind: m.kind,
        p_metadata: metadata,
      })
      .then((r: any) => r, (e: any) => ({ error: e }));
    if (!rpcErr) {
      console.log(`[autopilot] delivered via rpc (${m.kind})`);
      return;
    }
    const missing = /Could not find the function|PGRST202/i.test(String(rpcErr.message ?? ""));
    if (!missing) {
      // Gate refusal (nothing to reply to / not participant) — another surface
      // already answered, or this call is not allowed. Diagnose WHO holds the
      // last-message slot, then log and stop.
      let who = "unknown";
      try {
        const { data: last } = await supabase
          .from("messages")
          .select("sender_id, kind, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(1);
        const l = (last ?? [])[0];
        if (l)
          who = `sender=${l.sender_id === null ? "SYSTEM(null)" : l.sender_id === conv.seller_id ? "seller" : l.sender_id === conv.buyer_id ? "buyer" : l.sender_id} kind=${l.kind} at=${l.created_at}`;
      } catch {}
      console.error("[autopilot] rpc insert refused:", rpcErr.message, "| last message now:", who);
      return;
    }
    if (delivery !== "direct") {
      console.error("[autopilot] rpc missing and caller is not the seller — message not delivered:", rpcErr.message);
      return;
    }
    const { error: directErr } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: callerId, kind: m.kind, body: m.body, metadata });
    if (directErr) console.error("[autopilot] direct insert failed:", directErr.message);
  }
}
