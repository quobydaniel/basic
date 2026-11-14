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
      "id, seller_id, buyer_id, store_id, product_id, store:stores(id, name, slug, area, city, region, payment_terms, plan, auto_pilot, whatsapp_number, currency, owner_id)",
    )
    .eq("id", conversationId)
    .maybeSingle();
  const conv: any = convo;
  if (!conv) throw new Error("Conversation not found");
  if (conv.seller_id !== callerId && conv.buyer_id !== callerId) throw new Error("Not your conversation");
  const st: any = conv.store ?? {};
  if (st.plan !== "pro") throw new Error("Auto-pilot is a Pro feature — upgrade your store to Pro.");
  if (!st.auto_pilot) throw new Error("Auto-pilot is OFF for this store.");

  const { data: msgs } = await supabase
    .from("messages")
    .select("sender_id, body, kind")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(12);
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
    .select("order_number, status, total, currency, created_at")
    .eq("store_id", st.id)
    .eq("buyer_id", conv.buyer_id)
    .order("created_at", { ascending: false })
    .limit(5);
  const orderHistory = (buyerOrders ?? [])
    .map((o: any) => `- #${o.order_number} — ${o.status} — ${o.currency ?? "GHS"} ${o.total} — ${new Date(o.created_at).toLocaleDateString()}`)
    .join("\n") || "(this buyer has no orders with the store yet)";

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
HOW TO SELL LIKE A HUMAN: warm, brief (1-3 sentences), Ghana-marketplace tone. Answer questions from the catalog. For products marked "price negotiable", invite the buyer's offer instead of quoting a fixed number. To close a sale, collect: item → quantity → size/variant (only if the product has variants) → delivery area → payment preference — at most ONE question per message.
ORDER TRACKING: when the buyer asks about their order, use this real history (statuses move pending → paid → fulfilled → shipped → delivered):
${orderHistory}
ORDER PLACEMENT — MANDATORY MECHANICS: when the buyer's last message gives ALL of item + quantity + delivery area + payment (or confirms them), you MUST append EXACTLY one last line to your reply:
ORDER_READY: product_slug=<slug> | qty=<n> | variant=<text or "-"> | delivery=<text> | payment=<text> | price=<unit price agreed or "-">
price is the UNIT price the buyer actually agreed to — when the buyer named a price (negotiation), use THEIR number, not the list price; "-" means book the catalog price. This line is a machine command — the order is ONLY created if the line is present, so NEVER omit it once the details are known, even if your visible text already says "confirmed". Write the friendly confirmation ("Order placed ✓ — 2× Samsung A05s on the way to Osu") and THEN the line. Never show the line to the buyer in words; never mention slugs or codes. If any detail is missing, ask for that one thing only — no line.
If a product shows stock: 0, it is SOLD OUT — say so and offer an alternative instead of taking the order. Never promise more units than the stock shows; stock is tracked live and every order you place deducts it automatically. If the buyer is just chatting or asking, reply normally with NO ORDER_READY line.
CRITICAL: prices and stock only from the catalog. If asked something you can't know (exact meetup point, negotiation beyond listed price), say the seller will confirm.`,
    messages: chat.map((m: any) => ({
      role: m.sender_id === conv.buyer_id ? "user" : "assistant",
      content: String(m.body ?? "").slice(0, 1000),
    })),
  });

  let reply = result.text.trim();
  let orderNumber: string | null = null;
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
        postMessage({
          kind: "system_order",
          body: `Order #${orderNumber} placed by AI auto-pilot — ${qty}× ${prod.title} · ${prod.currency ?? "GHS"} ${total}${deliveryArea ? ` · ${deliveryArea}` : ""}`,
          metadata: { order_id: (order as any).id },
        });
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

  if (reply) {
    postMessage({ kind: "text", body: reply, metadata: null });
  }
  return { reply, order_number: orderNumber };

  // Message delivery — direct insert when the caller is the seller, RPC when
  // the caller is the buyer (RLS: only basic_autopilot_send may write as the
  // seller, after re-checking plan/auto-pilot/last-message inside Postgres).
  function postMessage(m: { kind: "text" | "system_order"; body: string; metadata: any }) {
    if (delivery === "direct") {
      return supabase
        .from("messages")
        .insert({ conversation_id: conversationId, sender_id: callerId, kind: m.kind, body: m.body, metadata: m.metadata ?? {} })
        .then(({ error }: any) => {
          if (error) console.error("[autopilot] direct insert failed:", error.message);
        });
    }
    return (supabase as any)
      .rpc("basic_autopilot_send", {
        p_conversation_id: conversationId,
        p_body: m.body,
        p_kind: m.kind,
        p_metadata: m.metadata ?? {},
      })
      .then(({ error }: any) => {
        if (error) console.error("[autopilot] rpc insert failed:", error.message);
      });
  }
}
