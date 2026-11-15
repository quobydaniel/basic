// /dashboard/shorts — sellers post persistent short ads & videos about
// their store and products (the storefront's Shorts tab showreel).
// Unlike stories these STAY UP until deleted. Compose: video or photo +
// caption + optional product link → media lands in the product-media
// bucket under {storeId}/shorts/…, the row in `shorts` is permanent.
// Manage: view counts, share to WhatsApp, delete anytime. Tables come
// from apply-pending-2026-11-15-shorts.sql — until it runs, the page
// shows the one-time setup card instead of pretending to work.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Clapperboard, Eye, ImagePlus, Loader2, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { shareShort } from "@/components/Stories";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/dashboard/shorts")({
  component: ShortsPage,
});

// Supabase errors arrive as plain PostgrestError objects (not Error
// instances), so message extraction can't rely on instanceof.
function errMsg(e: unknown): string {
  if (typeof e === "string") return e;
  return (e as any)?.message ?? String(e);
}

function setupNeeded(e: unknown): boolean {
  return /PGRST205|schema cache|Could not find the table|does not exist/i.test(errMsg(e));
}

function ShortsPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [productId, setProductId] = useState("");

  const stores = useQuery({
    queryKey: ["dashboard-stores", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, name, slug, logo_url").eq("owner_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const store = stores.data?.[0];

  const products = useQuery({
    queryKey: ["dashboard-shorts-products", store?.id],
    enabled: !!store,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, title")
        .eq("store_id", store!.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const shorts = useQuery({
    queryKey: ["dashboard-shorts", store?.id],
    enabled: !!store,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("shorts")
        .select("id, caption, media_url, media_type, created_at, product_id, product:products(title)")
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // View counts for the store's shorts (sellers read them through
  // short_views_read — same shape as the stories dashboard).
  const views = useQuery({
    queryKey: ["dashboard-shorts-views", store?.id, (shorts.data ?? []).map((s: any) => s.id).join(",")],
    enabled: !!(shorts.data ?? []).length,
    queryFn: async () => {
      const ids = (shorts.data ?? []).map((s: any) => s.id);
      const { data, error } = await (supabase as any).from("short_views").select("short_id").in("short_id", ids);
      if (error) throw error;
      const vCount: Record<string, number> = {};
      for (const r of data ?? []) vCount[r.short_id] = (vCount[r.short_id] ?? 0) + 1;
      return vCount;
    },
  });

  const pick = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) {
      toast.error("Pick a video or a photo");
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      toast.error("Keep it under 50 MB");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const post = useMutation({
    mutationFn: async () => {
      if (!store) throw new Error("Create your store first");
      if (!file) throw new Error("Pick a video or photo first");
      const ext = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || (file.type.startsWith("video/") ? "mp4" : "jpg");
      const path = `${store.id}/shorts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-media")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("product-media").getPublicUrl(path);
      const { error: insErr } = await (supabase as any).from("shorts").insert({
        store_id: store.id,
        seller_id: user!.id,
        product_id: productId || null,
        caption: caption.trim() || null,
        media_url: pub.publicUrl,
        media_type: file.type.startsWith("video/") ? "video" : "image",
      });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      toast.success("Short is live on your storefront");
      setFile(null);
      setPreview(null);
      setCaption("");
      setProductId("");
      if (fileInput.current) fileInput.current.value = "";
      qc.invalidateQueries({ queryKey: ["dashboard-shorts"] });
      qc.invalidateQueries({ queryKey: ["store-shorts"] });
    },
    onError: (e) => {
      const m = errMsg(e);
      toast.error(setupNeeded(m) ? "One-time setup needed — run apply-pending-2026-11-15-shorts.sql in Supabase." : m || "Could not post short");
    },
  });

  const remove = useMutation({
    mutationFn: async (s: any) => {
      const { error } = await (supabase as any).from("shorts").delete().eq("id", s.id);
      if (error) throw error;
      // Best-effort storage cleanup — the URL hides the bucket path.
      try {
        const mark = "/object/public/product-media/";
        const idx = (s.media_url as string).indexOf(mark);
        if (idx !== -1) await supabase.storage.from("product-media").remove([decodeURIComponent(s.media_url.slice(idx + mark.length))]);
      } catch {
        /* orphan object is harmless */
      }
    },
    onSuccess: () => {
      toast.success("Short deleted");
      qc.invalidateQueries({ queryKey: ["dashboard-shorts"] });
      qc.invalidateQueries({ queryKey: ["store-shorts"] });
    },
    onError: (e) => toast.error(errMsg(e) || "Could not delete"),
  });

  if (stores.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!store) {
    return (
      <div className="p-4 pb-24 md:p-8">
        <h1 className="font-display text-3xl">Shorts</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Create your store first — shorts are posted from your store.
        </p>
        <Link to="/dashboard" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const rows = shorts.data ?? [];
  const isVideo = file?.type.startsWith("video/");

  return (
    <div className="p-4 pb-24 md:p-8">
      <h1 className="font-display text-3xl">Shorts</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Short ads &amp; videos about your store and products — they stay on your storefront's Shorts tab until you remove them.
      </p>

      {/* One-time setup — the tables aren't in the database yet */}
      {shorts.error && setupNeeded(shorts.error) && (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-5">
          <p className="font-display text-lg">One-time setup needed</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Run <code className="rounded bg-muted px-1.5 py-0.5 text-xs">apply-pending-2026-11-15-shorts.sql</code> in
            Supabase (Dashboard → SQL Editor) to create the shorts tables.
          </p>
        </div>
      )}

      {/* Compose */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <p className="font-display text-lg">New short</p>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start">
          <div className="shrink-0">
            <input
              ref={fileInput}
              type="file"
              accept="video/*,image/*"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            {preview ? (
              <button
                onClick={() => fileInput.current?.click()}
                className="relative block h-52 w-32 overflow-hidden rounded-xl border border-border"
                aria-label="Change short media"
              >
                {isVideo ? (
                  <video src={preview} muted playsInline className="h-full w-full object-cover" />
                ) : (
                  <img src={preview} alt="" className="h-full w-full object-cover" />
                )}
              </button>
            ) : (
              <button
                onClick={() => fileInput.current?.click()}
                className="flex h-52 w-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-[var(--gold)]/60 hover:text-foreground"
              >
                <ImagePlus className="h-6 w-6" />
                Video or photo
                <span className="text-[10px]">portrait works best · up to 50 MB</span>
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="The pitch — why should buyers want this? (optional)"
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--gold)]/60"
            />
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--gold)]/60"
              aria-label="Link a product"
            >
              <option value="">No product link (optional)</option>
              {(products.data ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <button
              onClick={() => post.mutate()}
              disabled={!file || post.isPending}
              className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
            >
              {post.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
              {post.isPending ? "Posting…" : "Post short"}
            </button>
            <p className="text-[11px] text-muted-foreground">Shorts stay up — a permanent showreel buyers can binge on your storefront.</p>
          </div>
        </div>
      </div>

      {/* Published shorts */}
      <div className="mt-8">
        <p className="font-display text-lg">Published ({rows.length})</p>
        {shorts.isLoading && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
        {rows.length === 0 && !shorts.isLoading && (
          <p className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No shorts yet — post one above and it appears on your storefront's Shorts tab instantly.
          </p>
        )}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {rows.map((s: any) => (
            <article key={s.id} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
              {s.media_type === "video" ? (
                <video src={s.media_url} muted playsInline className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-border/60" />
              ) : (
                <img src={s.media_url} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-border/60" />
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm leading-snug">{s.caption || <span className="text-muted-foreground">No caption</span>}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {s.product?.title ? `Product: ${s.product.title} · ` : ""}
                  {new Date(s.created_at).toLocaleDateString()}
                </p>
                <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Eye className="h-3.5 w-3.5" /> {views.data?.[s.id] ?? 0} views
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5 self-start">
                <button
                  onClick={() => shareShort(store.slug, store.name)}
                  aria-label="Share short to WhatsApp"
                  title="Share to WhatsApp"
                  className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-[var(--gold)]/60 hover:text-foreground"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => { if (window.confirm("Delete this short?")) remove.mutate(s); }}
                  disabled={remove.isPending}
                  aria-label="Delete short"
                  title="Delete short"
                  className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
