// /dashboard/stories — sellers post WhatsApp-style 24h statuses.
// Compose: photo or video + caption + optional product link → media lands
// in the product-media bucket under {storeId}/stories/…, the row in
// `stories` expires itself after 24h. Manage: live stories with view and
// reaction counts, delete anytime. Tables come from
// apply-pending-2026-11-14k.sql — until it runs, the page shows the
// one-time setup card instead of pretending to work.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { CirclePlay, Eye, Heart, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/dashboard/stories")({
  component: StoriesPage,
});

function setupNeeded(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /PGRST205|schema cache|Could not find the table|does not exist/i.test(m);
}

function timeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `${h}h left`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m left`;
}

function StoriesPage() {
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
    queryKey: ["dashboard-stories-products", store?.id],
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

  const stories = useQuery({
    queryKey: ["dashboard-stories", store?.id],
    enabled: !!store,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("stories")
        .select("id, caption, media_url, media_type, created_at, expires_at, product_id, product:products(title)")
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // View + reaction counts for the store's stories (sellers can read these
  // through story_views_read / story_reactions_public_read).
  const social = useQuery({
    queryKey: ["dashboard-stories-social", store?.id, (stories.data ?? []).map((s: any) => s.id).join(",")],
    enabled: !!(stories.data ?? []).length,
    queryFn: async () => {
      const ids = (stories.data ?? []).map((s: any) => s.id);
      const [{ data: views, error: ve }, { data: reacts, error: re }] = await Promise.all([
        (supabase as any).from("story_views").select("story_id").in("story_id", ids),
        (supabase as any).from("story_reactions").select("story_id").in("story_id", ids),
      ]);
      if (ve) throw ve;
      if (re) throw re;
      const vCount: Record<string, number> = {};
      for (const r of views ?? []) vCount[r.story_id] = (vCount[r.story_id] ?? 0) + 1;
      const rCount: Record<string, number> = {};
      for (const r of reacts ?? []) rCount[r.story_id] = (rCount[r.story_id] ?? 0) + 1;
      return { vCount, rCount };
    },
  });

  const pick = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) {
      toast.error("Pick a photo or a video");
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
      if (!file) throw new Error("Pick a photo or video first");
      const ext = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || (file.type.startsWith("video/") ? "mp4" : "jpg");
      const path = `${store.id}/stories/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-media")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("product-media").getPublicUrl(path);
      const { error: insErr } = await (supabase as any).from("stories").insert({
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
      toast.success("Story is live for 24 hours");
      setFile(null);
      setPreview(null);
      setCaption("");
      setProductId("");
      if (fileInput.current) fileInput.current.value = "";
      qc.invalidateQueries({ queryKey: ["dashboard-stories"] });
      qc.invalidateQueries({ queryKey: ["store-stories"] });
    },
    onError: (e) => {
      const m = e instanceof Error ? e.message : "";
      toast.error(setupNeeded(m) ? "One-time setup needed — run apply-pending-2026-11-14k.sql in Supabase." : m || "Could not post story");
    },
  });

  const remove = useMutation({
    mutationFn: async (s: any) => {
      const { error } = await (supabase as any).from("stories").delete().eq("id", s.id);
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
      toast.success("Story deleted");
      qc.invalidateQueries({ queryKey: ["dashboard-stories"] });
      qc.invalidateQueries({ queryKey: ["store-stories"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete"),
  });

  if (stores.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!store) {
    return (
      <div className="p-4 pb-24 md:p-8">
        <h1 className="font-display text-3xl">Stories</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Create your store first — stories are posted from your store.
        </p>
        <Link to="/dashboard" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const rows = stories.data ?? [];
  const isVideo = file?.type.startsWith("video/");

  return (
    <div className="p-4 pb-24 md:p-8">
      <h1 className="font-display text-3xl">Stories</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Short 24-hour statuses, like WhatsApp — buyers watch them on your storefront.
      </p>

      {/* One-time setup — the tables aren't in the database yet */}
      {stories.error && setupNeeded(stories.error) && (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-5">
          <p className="font-display text-lg">One-time setup needed</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Run <code className="rounded bg-muted px-1.5 py-0.5 text-xs">apply-pending-2026-11-14k.sql</code> in
            Supabase (Dashboard → SQL Editor) to create the stories tables.
          </p>
        </div>
      )}

      {/* Compose */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <p className="font-display text-lg">New story</p>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start">
          <div className="shrink-0">
            <input
              ref={fileInput}
              type="file"
              accept="image/*,video/*"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            {preview ? (
              <button
                onClick={() => fileInput.current?.click()}
                className="relative block h-40 w-32 overflow-hidden rounded-xl border border-border"
                aria-label="Change story media"
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
                className="flex h-40 w-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-[var(--gold)]/60 hover:text-foreground"
              >
                <ImagePlus className="h-6 w-6" />
                Photo or video
                <span className="text-[10px]">up to 50 MB</span>
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="Say something about it… (optional)"
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
              {post.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CirclePlay className="h-4 w-4" />}
              {post.isPending ? "Posting…" : "Post story"}
            </button>
            <p className="text-[11px] text-muted-foreground">Stories vanish after 24 hours — no clutter, just now.</p>
          </div>
        </div>
      </div>

      {/* Live stories */}
      <div className="mt-8">
        <p className="font-display text-lg">Live now ({rows.length})</p>
        {stories.isLoading && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
        {rows.length === 0 && !stories.isLoading && (
          <p className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No story live right now — post one above and it appears on your storefront instantly.
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
                  {timeLeft(s.expires_at)}
                </p>
                <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {social.data?.vCount[s.id] ?? 0} views</span>
                  <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {social.data?.rCount[s.id] ?? 0} reactions</span>
                </div>
              </div>
              <button
                onClick={() => { if (window.confirm("Delete this story?")) remove.mutate(s); }}
                disabled={remove.isPending}
                aria-label="Delete story"
                title="Delete story"
                className="grid h-8 w-8 shrink-0 place-items-center self-start rounded-full border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
