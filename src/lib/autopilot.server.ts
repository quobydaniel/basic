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
      "id, seller_id, buyer_id, store_id, product_id, created_at, store:stores(id, name, slug, area, city, region, payment_terms, plan, auto_pilot, whatsapp_number, currency, owner_id)",
    )
    .eq("id", conversationId)
    .maybeSingle();
  const conv: any = convo;
  if (!conv) throw new Error("Conversation not found");
  if (conv.seller_id !== callerId && conv.buyer_id !== callerId) throw new Error("Not your conversation");
  const st: any = conv.store ?? {};
  if (st.plan !== "pro") throw new Error("Auto-pilot is a Pro feature — upgrade your store to Pro.");
  if (!st.auto_pilot) throw new Error("Auto-pilot is OFF for this store.");

  // Long memory: the last 40 messages (≈ a week of haggling), not 12 — the
  // AI kept re-greeting returning buyers and re-asking answered questions.
  const { data: msgs } = await supabase
    .from("messages")
    .select("sender_id, body, kind, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(40);
  const chat = (msgs ?? []).reverse();
  const lastMessage = chat[chat.length - 1];
  if (!lastMessage || lastMessage.sender_id !== conv.buyer_id) throw new Error("Nothing to reply to");

  const { data: prods } = await (supabase
    .from("products")
    .select("id, slug, title, base_price, currency, negotiable, description, product_variants(title, inventory_qty)")
    .eq("store_id", st.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(12) as any);
  const stockOf = (p: any) => (p.product_variants ?? []).reduce((s2: number, v: any) => s2 + Number(v.inventory_qty ?? 0), 0);
  const catalog = (prods ?? [])
    .map((p: any) => `- ${p.title} — ${p.currency ?? "GHS"} ${p.base_price} (product slug: ${p.slug})${p.product_variants?.length ? ` — variants: ${p.product_variants.map((v: any) => v.title).join(", ")}` : ""} — stock: ${stockOf(p) === 0 ? "SOLD OUT" : stockOf(p)}${p.negotiable ? " — price negotiable" : ""}`)
    .join("\n") || "(no products listed yet)";
  const listingLine = conv.product_id
    ? (() => {
        const p = (prods ?? []).find((x: any) => x.id === conv.product_id);
        return p ? `\nThe conversation is about: "${p.title}" (${p.currency ?? "GHS"} ${p.base_price}).` : "";
      })()
    : "";
  const { data: buyerOrders } = await supabase
    .from("orders")
    .select("order_number, status, total, currency, fulfillment_type, payment_term, notes, created_at")
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

  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("Missing NVIDIA_API_KEY");
  const gateway = createNvidiaNimProvider(key);
  const model = gateway(await resolveModel(supabase, "assistantChat"));
  const result = await generateText({
    model,
    instructions: `You ARE ${st.name}'s salesperson on BASIC, replying to a buyer in chat on the seller's behalf. The seller has auto-pilot ON — you handle this conversation end-to-end.
CATALOG (live data — never invent products, prices, or stock):
${catalog}${listingLine}
Store location: ${[st.area, st.city || st.region].filter(Boolean).join(", ") || "Ghana"}. Payment options: ${JSON.stringify(st.payment_terms ?? [])}.
${memoryBlock}
CONTINUITY RULES: you have the whole chat (up to 40 recent messages) plus the BUYER MEMORY above. Never re-introduce yourself or re-greet a returning buyer like a stranger. Never re-ask a question the buyer already answered — check the history first. If you promised something earlier (a price, a callback), stay consistent with it or explicitly correct it ("Quick correction — earlier I said X, the right figure is Y"). When the buyer asks "what did the seller say", answer from the open order / memory, never with a canned deflection.
CHANGE REQUESTS (be honest about what you can do): you CANNOT edit an order that's already placed — only the seller can change quantity, price, delivery or payment when they confirm it. When the buyer asks to change something on a pending order, say plainly: "Noted — I've flagged the change (1 copy instead of 2) for the seller to update when they confirm your order #X." Never say "I've changed it", never imply it's done, and don't ask them to order again.
HOW TO SELL LIKE A HUMAN: warm, brief (1-3 sentences), Ghana-marketplace tone. Answer questions from the catalog. For products marked "price negotiable", agree on a number like a real shopkeeper: welcome the buyer's offer, counter once if it's far below list, and once the buyer settles on a figure, that IS the deal price — pass it in ORDER_READY (price=<their number>). Every order you book lands as PENDING for the seller to confirm, so the seller always has the final say on price — you never need to refuse an agreed price yourself.
ORDER TRACKING: when the buyer asks about their order ("where is it", "when will it arrive", "did the seller confirm"), answer from the BUYER MEMORY status lines. Statuses move pending → paid → fulfilled → shipped → delivered. If the order is still pending, say it's with the seller for confirmation — and answer their actual question.
DUPLICATE GUARD — CRITICAL: if BUYER MEMORY shows an OPEN ORDER (pending), you must NOT emit ORDER_READY for the same item again — no matter how the buyer phrases confirmation ("ok", "yes", "momo", "kasoa"). Instead reply about the existing order: confirm its details, answer their question, and tell them the seller will confirm it shortly. Only emit ORDER_READY when the buyer is ordering a DIFFERENT item (or the previous order is no longer pending — check the statuses).
ORDER PLACEMENT — MANDATORY MECHANICS: when the buyer's last message gives ALL of item + quantity + delivery area + payment (or confirms them) AND no duplicate applies, you MUST append EXACTLY one last line to your reply:
ORDER_READY: product_slug=<slug> | qty=<n> | variant=<text or "-"> | delivery=<text> | payment=<text> | price=<unit price agreed or "-">
price is the UNIT price the buyer actually agreed to — when the buyer named a price (negotiation), use THEIR number, not the list price; "-" means book the catalog price. This line is a machine command — the order is ONLY created if the line is present, so NEVER omit it once the details are known, even if your visible text already says "confirmed". Write the friendly confirmation ("Order placed ✓ — 2× Samsung A05s on the way to Osu") and THEN the line. Never show the line to the buyer in words; never mention slugs or codes. If any detail is missing, ask for that one thing only — no line.
If a product shows stock: 0, it is SOLD OUT — say so and offer an alternative instead of taking the order. Never promise more units than the stock shows; stock is tracked live and every order you place deducts it automatically. If the buyer is just chatting or asking, reply normally with NO ORDER_READY line.
CRITICAL: prices and stock only from the catalog (except a price the buyer themselves agreed to, which goes in ORDER_READY price=). If asked something you can't know (exact meetup point, custom requests), say the seller will confirm.`,
    messages: chat.map((m: any) => ({
      role: m.sender_id === conv.buyer_id ? "user" : "assistant",
      content: String(m.body ?? "").slice(0, 1000),
    })),
  });

  let reply = result.text.trim();
  let orderNumber: string | null = null;
  let systemCard: { body: string; metadata: any } | null = null;
  const om = reply.match(/ORDER_READY:\s*product_slug=([^\s|]+)\s*\|\s*qty=(\d+)\s*\|\s*variant=([^|]*)\s*\|\s*delivery=([^|]*)\s*\|\s*payment=([^|]*)\s*(?:\|\s*price=([^|\s]*))?\s*$/);
  reply = reply.replace(/ORDER_READY:[\s\S]*$/, "").trim();
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
      // Negotiated unit price: the AI may pass the price the buyer actually
      // agreed to ("price=500" on a GH₵67 listing). Bounded — wildly out of
      // range (0, negative, >10× list) falls back to the list price and the
      // seller still confirms the pending order in the dashboard.
      const claimedPrice = om[6] && om[6].trim() !== "-" ? Number(om[6].replace(/[^0-9.]/g, "")) : NaN;
      const unit = Number.isFinite(claimedPrice) && claimedPrice > 0 && claimedPrice <= listPrice * 10
        ? claimedPrice
        : listPrice;
      const negotiated = unit !== listPrice;
      const total = Number((unit * qty).toFixed(2));
      const { data: order, error: oErr } = await (supabase as any)
        .from("orders")
        .insert({
          store_id: st.id,
          buyer_id: conv.buyer_id,
          status: "pending",
          subtotal: total,
          total,
          currency: prod.currency ?? st.currency ?? "GHS",
          source: "chat_ai",
          fulfillment_type: deliveryArea ? "delivery" : "meet_in_person",
          payment_term: paymentTerm,
          notes: [variant ? `Variant: ${variant}` : null, deliveryArea ? `Delivery area: ${deliveryArea}` : null, negotiated ? `Negotiated unit price: ${prod.currency ?? "GHS"} ${unit} (list ${listPrice})` : null, "Placed by AI auto-pilot in chat"].filter(Boolean).join(" · "),
        })
        .select("id, order_number")
        .single();
      if (!oErr && order) {
        orderNumber = (order as any).order_number;
        await supabase.from("order_items").insert({
          order_id: (order as any).id,
          product_title: prod.title,
          quantity: qty,
          unit_price: unit,
          total,
          variant_title: variant,
        });
        // The card is posted AFTER the text reply (see delivery below) —
        // hoisted here so the loser of an insert race never posts a card
        // for an order it didn't win.
        systemCard = {
          body: `Order #${orderNumber} placed by AI auto-pilot — ${qty}× ${prod.title} · ${prod.currency ?? "GHS"} ${total}${deliveryArea ? ` · ${deliveryArea}` : ""}`,
          metadata: { order_id: (order as any).id, ai: true },
        };
        const waDigits = String(st.whatsapp_number ?? "").replace(/\D/g, "");
        const waText = `BASIC order needs your confirmation: #${orderNumber} — ${qty}× ${prod.title} (${prod.currency ?? "GHS"} ${total})${deliveryArea ? ` — deliver to ${deliveryArea}` : ""}${variant ? ` — ${variant}` : ""}. Buyer chat is in your dashboard.`;
        // Best-effort: RLS may not let the buyer's session notify the seller —
        // the unread counters + dashboard heartbeat cover that case anyway.
        try {
          await supabase.from("notifications").insert({
            user_id: st.owner_id ?? conv.seller_id,
            kind: "order",
            title: "AI placed an order — confirm it",
            body: `#${orderNumber} · ${qty}× ${prod.title} · ${prod.currency ?? "GHS"} ${total}${deliveryArea ? ` · ${deliveryArea}` : ""}`,
            payload: { order_id: (order as any).id, order_number: orderNumber, wa_link: waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(waText)}` : null },
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
  // The order card goes out as a null-sender message via a plain insert —
  // messages RLS allows any participant to post sender_id NULL, it renders
  // as the centered gold card for both sides, and it doesn't consume the
  // RPC's one-reply-per-buyer-message slot.
  if (systemCard) {
    const { error: cardErr } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: null,
      kind: "system_order",
      body: systemCard.body,
      metadata: systemCard.metadata,
    });
    if (cardErr) console.error("[autopilot] order card insert failed:", cardErr.message);
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
    if (!rpcErr) return;
    const missing = /Could not find the function|PGRST202/i.test(String(rpcErr.message ?? ""));
    if (!missing) {
      // Gate refusal (nothing to reply to / not participant) — another surface
      // already answered, or this call is not allowed. Log and stop.
      console.error("[autopilot] rpc insert refused:", rpcErr.message);
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
