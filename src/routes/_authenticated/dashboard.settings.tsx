import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
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
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, currency, country, paystack_public_key, paystack_subaccount_code")
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
    </div>
  );
}
