import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useSession();
  const qc = useQueryClient();

  const store = useQuery({
    queryKey: ["my-store-settings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("stores")
        .select("id, name, currency, country, paystack_public_key, paystack_subaccount_code, plan, ai_name, ai_greeting, ai_persona")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({ currency: "GHS", country: "GH", paystack_public_key: "", paystack_subaccount_code: "" });
  useEffect(() => {
    if (store.data) setForm({
      currency: store.data.currency ?? "GHS",
      country: store.data.country ?? "GH",
      paystack_public_key: store.data.paystack_public_key ?? "",
      paystack_subaccount_code: store.data.paystack_subaccount_code ?? "",
    });
  }, [store.data]);

  // AI assistant persona — how the auto-pilot introduces itself, greets new
  // buyers, and speaks. Columns live in apply-pending-2026-11-14g.sql; the
  // save is tolerant so a missing column hints instead of failing.
  const [ai, setAi] = useState({ ai_name: "", ai_greeting: "", ai_persona: "" });
  const [aiDirty, setAiDirty] = useState(false);
  useEffect(() => {
    if (store.data) setAi({
      ai_name: (store.data as any).ai_name ?? "",
      ai_greeting: (store.data as any).ai_greeting ?? "",
      ai_persona: (store.data as any).ai_persona ?? "",
    });
  }, [store.data]);

  const saveAi = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("stores")
        .update({
          ai_name: ai.ai_name.trim() || null,
          ai_greeting: ai.ai_greeting.trim() || null,
          ai_persona: ai.ai_persona.trim() || null,
        })
        .eq("id", store.data!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setAiDirty(false);
      toast.success("AI assistant saved");
      qc.invalidateQueries({ queryKey: ["my-store-settings"] });
    },
    onError: (e) => {
      const m = e instanceof Error ? e.message : "";
      toast.error(/ai_name|ai_greeting|ai_persona|PGRST204|column/i.test(m) ? "One-time setup needed — run apply-pending-2026-11-14g.sql in Supabase." : m || "Failed");
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("stores").update(form).eq("id", store.data!.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["my-store-settings"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!store.data) return <div className="p-8 pb-24 text-sm text-muted-foreground">You need a store first.</div>;

  return (
    <div className="p-4 pb-24 md:p-8">
      <h1 className="font-display text-3xl">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Payments, currency, and business details for {store.data.name}.</p>

      <div className="mt-6 space-y-5 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-[var(--sage)]" /> Paystack (Ghana)
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Public key (pk_live_… or pk_test_…)</span>
          <input
            value={form.paystack_public_key}
            onChange={(e) => setForm((f) => ({ ...f, paystack_public_key: e.target.value }))}
            className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 font-mono text-xs outline-none focus:border-ring"
            placeholder="pk_test_xxx"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Subaccount code (optional, for split payouts)</span>
          <input
            value={form.paystack_subaccount_code}
            onChange={(e) => setForm((f) => ({ ...f, paystack_subaccount_code: e.target.value }))}
            className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 font-mono text-xs outline-none focus:border-ring"
            placeholder="ACCT_xxx"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Your Paystack secret key is stored securely on the server when we ship checkout. For now, paste your public key so the initialize call works.
        </p>

        <div className="grid grid-cols-2 gap-3 pt-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Currency</span>
            <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-ring">
              <option value="GHS">GHS · Ghana Cedi</option>
              <option value="NGN">NGN · Nigerian Naira</option>
              <option value="USD">USD · US Dollar</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Country</span>
            <select value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-ring">
              <option value="GH">Ghana</option>
              <option value="NG">Nigeria</option>
              <option value="KE">Kenya</option>
              <option value="ZA">South Africa</option>
            </select>
          </label>
        </div>

        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {save.isPending ? "Saving…" : "Save settings"}
        </button>
      </div>

      {/* AI assistant — persona, greeting and identity for the auto-pilot.
          Saved separately from the payment settings (different columns). */}
      <div className="mt-5 rounded-2xl border border-[var(--gild)]/40 bg-card p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-4 w-4 text-[var(--gild)]" /> AI assistant
          </div>
          {(store.data as any)?.plan === "pro" ? (
            <span className="rounded-full border border-[var(--gild)]/40 bg-[var(--gild)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--gild)]">Pro · Auto-pilot</span>
          ) : (
            <Link to="/pricing" className="rounded-full border border-[var(--gild)]/40 bg-[var(--gild)]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--gild)] hover:opacity-80">
              ✦ Premium
            </Link>
          )}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Shapes how your AI salesperson speaks in chats — identity, first-contact greeting, and any house rules it must follow. These apply wherever auto-pilot is on.
        </p>

        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">AI assistant name (optional)</span>
            <input
              value={ai.ai_name}
              onChange={(e) => { setAi((v) => ({ ...v, ai_name: e.target.value })); setAiDirty(true); }}
              placeholder={`Leave empty to be "${store.data.name}'s salesperson"`}
              className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Custom greeting (opening line for new buyers)</span>
            <textarea
              value={ai.ai_greeting}
              onChange={(e) => { setAi((v) => ({ ...v, ai_greeting: e.target.value })); setAiDirty(true); }}
              rows={2}
              placeholder={`e.g. "Welcome to ${store.data.name}! 🎉 What are you shopping for today?"`}
              className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring resize-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">How to respond — character & house rules</span>
            <textarea
              value={ai.ai_persona}
              onChange={(e) => { setAi((v) => ({ ...v, ai_persona: e.target.value })); setAiDirty(true); }}
              rows={4}
              placeholder={`e.g. "Warm and respectful, call the customer 'boss'. Always mention delivery to Accra is free over GH₵200. Never negotiate below the listed price. Offer bundle deals on Fridays."`}
              className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring resize-none"
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">Tone, style, do's and don'ts — the AI follows these in every reply.</span>
          </label>
          <button
            onClick={() => saveAi.mutate()}
            disabled={saveAi.isPending || (!aiDirty && !saveAi.isPending)}
            className="rounded-full bg-[var(--gild)] px-6 py-2.5 text-sm font-semibold text-[var(--gild-foreground)] transition-shadow hover:shadow-[0_0_24px_-6px_var(--gild)] disabled:opacity-60"
          >
            {saveAi.isPending ? "Saving…" : "Save AI assistant"}
          </button>
        </div>
      </div>
    </div>
  );
}
