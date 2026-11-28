import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ImagePlus, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { AI_CHARACTERS, characterById } from "@/lib/ai-characters";

const REGIONS = [
  "Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern", "Greater Accra",
  "North East", "Northern", "Oti", "Savannah", "Upper East", "Upper West",
  "Volta", "Western", "Western North",
];

/* Storefront accent presets — [cssColor, label]. Gold first (the house
   default); saved to stores.theme.accent and consumed by the mini-site. */
const ACCENTS: [string, string][] = [
  ["#D9B45B", "Gold"],
  ["#2E9E6B", "Emerald"],
  ["#C87446", "Terracotta"],
  ["#4A7BD0", "Royal"],
  ["#C25E7A", "Rose"],
];

export const Route = createFileRoute("/_authenticated/dashboard/storefront")({
  component: StorefrontPage,
});

function StorefrontPage() {
  const { user } = useSession();
  const qc = useQueryClient();

  const store = useQuery({
    queryKey: ["my-store-full", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("stores")
        .select("id, name, tagline, description, logo_url, banner_url, region, city, area, ghana_post_gps, whatsapp_number, payment_terms, theme, plan, ai_character")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    name: "", tagline: "", description: "", logo_url: "", banner_url: "",
    region: "", city: "", area: "", ghana_post_gps: "", whatsapp_number: "",
    payment_terms: ["pay_on_delivery"] as string[],
    theme: { accent: "" } as { accent: string },
    ai_character: "" as string,
  });

  useEffect(() => {
    if (store.data) setForm({
      name: store.data.name ?? "",
      tagline: store.data.tagline ?? "",
      description: store.data.description ?? "",
      logo_url: store.data.logo_url ?? "",
      banner_url: store.data.banner_url ?? "",
      region: store.data.region ?? "",
      city: store.data.city ?? "",
      area: store.data.area ?? "",
      ghana_post_gps: store.data.ghana_post_gps ?? "",
      whatsapp_number: store.data.whatsapp_number ?? "",
      payment_terms: store.data.payment_terms ?? ["pay_on_delivery"],
      // Stores that never picked an accent have theme = null — default so
      // the picker never reads into undefined.
      theme: (store.data.theme as { accent: string } | null) ?? { accent: "" },
      ai_character: (store.data as any).ai_character ?? "",
    });
  }, [store.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("stores").update(form).eq("id", store.data!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Storefront saved");
      qc.invalidateQueries({ queryKey: ["my-store-full"] });
      qc.invalidateQueries({ queryKey: ["home", "stores"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  async function upload(kind: "logo" | "banner", file: File | null) {
    if (!file || !store.data) return;
    const path = `${store.data.id}/${kind}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const { error } = await supabase.storage.from("store-assets").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
    setForm((f) => ({ ...f, [`${kind}_url`]: data.publicUrl }));
  }

  if (!store.data) {
    return <div className="p-8 pb-24 text-sm text-muted-foreground">You need a store first.</div>;
  }

  const isProStore = (store.data as any)?.plan === "pro";

  return (
    <div className="p-4 pb-24 md:p-8">
      <h1 className="font-display text-3xl">Storefront</h1>
      <p className="mt-1 text-sm text-muted-foreground">The face of your brand on BASIC.</p>

      <div className="mt-6 space-y-6 rounded-2xl border border-border bg-card p-5">
        <ImageField label="Banner" hint="1600×600 recommended" url={form.banner_url} onFile={(f) => upload("banner", f)} aspect="aspect-[16/6]" />
        <ImageField label="Logo" hint="Square, 512×512" url={form.logo_url} onFile={(f) => upload("logo", f)} aspect="aspect-square w-32" />

        <Field label="Store name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
        <Field label="Tagline" value={form.tagline} onChange={(v) => setForm((f) => ({ ...f, tagline: v }))} placeholder="Shea, soap & scent" />

        <div className="grid grid-cols-3 gap-2">
          <select
            value={form.region}
            onChange={(e) => setForm((f) => ({ ...f, region: e.target.value, city: "", area: "" }))}
            className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
            aria-label="Region"
          >
            <option value="">Region…</option>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="City (e.g. Accra)" className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm" />
          <input value={form.area} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} placeholder="Area (e.g. Osu)" className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm" />
        </div>
        <Field label="GhanaPostGPS digital address" value={form.ghana_post_gps} onChange={(v) => setForm((f) => ({ ...f, ghana_post_gps: v }))} placeholder="GA-183-8164" />
        <Field label="WhatsApp number (buyers can chat you there)" value={form.whatsapp_number} onChange={(v) => setForm((f) => ({ ...f, whatsapp_number: v }))} placeholder="+233 5X XXX XXXX" />

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Payment terms you accept (buyers pick one)</p>
          <div className="flex flex-wrap gap-2">
            {["pay_on_delivery", "pay_before_delivery", "escrow"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    payment_terms: f.payment_terms.includes(t)
                      ? f.payment_terms.filter((x) => x !== t)
                      : [...f.payment_terms, t],
                  }))
                }
                data-active={form.payment_terms.includes(t)}
                className="rounded-full border border-border px-3 py-1.5 text-xs data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
              >
                {t.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
        {/* AI shopkeeper — Premium. A tiny character greets buyers on the
            storefront instead of the generic assistant pill, and the chat
            AI role-plays as them. */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-[var(--gild)]" /> AI shopkeeper character
            </p>
            {(store.data as any)?.plan === "pro" ? (
              <span className="rounded-full border border-[var(--gild)]/40 bg-[var(--gild)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--gild)]">Pro</span>
            ) : (
              <Link to="/pricing" className="rounded-full border border-[var(--gild)]/40 bg-[var(--gild)]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--gild)] hover:opacity-80">
                ✦ Premium
              </Link>
            )}
          </div>
          <div className={`grid grid-cols-3 gap-2 sm:grid-cols-6 ${isProStore ? "" : "pointer-events-none opacity-50"}`}>
            {AI_CHARACTERS.map((c) => {
              const selected = form.ai_character === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, ai_character: selected ? "" : c.id }))}
                  title={c.blurb}
                  className={`flex flex-col items-center gap-1 rounded-2xl border p-2.5 text-center transition-colors ${selected ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-border bg-background hover:border-gold/50"}`}
                >
                  <span aria-hidden className="text-2xl leading-none">{c.emoji}</span>
                  <span className="text-[11px] font-semibold">{c.name}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {form.ai_character
              ? `${characterById(form.ai_character)?.name} ${characterById(form.ai_character)?.emoji} greets buyers on your storefront and the chat AI role-plays as them.`
              : isProStore
                ? "Pick a character to greet buyers on your storefront — otherwise the plain assistant pill shows."
                : "Pick a character to greet buyers on your storefront — Premium stores only."}
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">About your store</span>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={4}
            className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring"
          />
        </label>

        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring"
      />
    </label>
  );
}

function ImageField({ label, hint, url, onFile, aspect }: { label: string; hint: string; url: string; onFile: (f: File | null) => void; aspect: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      <label className={`relative block cursor-pointer overflow-hidden rounded-2xl border border-dashed border-border bg-muted ${aspect}`}>
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground">
            <ImagePlus className="h-6 w-6" />
          </div>
        )}
        <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </label>
    </div>
  );
}
