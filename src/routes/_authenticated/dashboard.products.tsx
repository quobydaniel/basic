import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Package, Trash2, X, ImagePlus, Sparkles, ChevronRight, ChevronLeft, Truck, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { formatGHS } from "@/lib/format";
import { specFieldsFor } from "@/lib/spec-templates";

export const Route = createFileRoute("/_authenticated/dashboard/products")({
  component: ProductsPage,
});

type ProductRow = {
  id: string;
  title: string;
  slug: string;
  base_price: number;
  currency: string;
  status: string;
  views: number;
  store_id: string;
  product_media: { url: string }[] | null;
};


// Tap-first option building: common option types and their typical values.
const OPTION_PRESETS: { type: string; values: string[] }[] = [
  { type: "Size", values: ["XS", "S", "M", "L", "XL", "XXL", "One size"] },
  { type: "Shoe size", values: ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"] },
  { type: "Colour", values: ["Black", "White", "Gold", "Blue", "Red", "Green", "Brown", "Kente print"] },
  { type: "Storage", values: ["64GB", "128GB", "256GB", "512GB", "1TB"] },
  { type: "Material", values: ["Cotton", "Leather", "Kente cloth", "Brass", "Wood", "Ceramic"] },
  { type: "Flavour / Scent", values: ["Original", "Spicy", "Mild", "Lemongrass", "Vanilla", "Unscented"] },
  { type: "Custom", values: [] },
];

// Emoji per department AND sub-category for the Jiji-style category picker.
const DEPT_EMOJI: [RegExp, string][] = [
  [/paint/i, "🖼️"], [/ceramic|pottery/i, "🏺"], [/sculpt|carv/i, "🗿"],
  [/textile|fabric/i, "🧵"], [/candle|decor/i, "🕯️"],
  [/kitchen|dining/i, "🍽️"], [/bedding|bed/i, "🛏️"], [/garden|outdoor/i, "🌿"],
  [/watch/i, "⌚"], [/bead/i, "📿"], [/hair/i, "💇"], [/make-?up|cosmetic/i, "💅"],
  [/fragrance|perfume|scent/i, "🌸"], [/soap|bath|body/i, "🧼"], [/skincare|skin/i, "🧴"],
  [/packaged|snack|grocer/i, "🥫"], [/spice|season/i, "🌶️"], [/drink|beverage/i, "🥤"],
  [/shoe|sneaker|boot|sandal/i, "👟"], [/bag|luggage/i, "👜"], [/wedding/i, "👰"],
  [/phone|tablet/i, "📱"], [/laptop|computer/i, "💻"], [/tv|audio/i, "📺"],
  [/fashion/i, "👗"], [/beauty/i, "💄"], [/electronic|phone/i, "📱"],
  [/food|drink/i, "🍲"], [/home|living/i, "🏠"], [/health/i, "💊"],
  [/art|craft/i, "🎨"], [/jewel/i, "💍"], [/kids/i, "🧸"],
  [/sport/i, "⚽"], [/book|media/i, "📚"], [/pet/i, "🐾"],
  [/auto|moto/i, "🚗"], [/service/i, "🛠️"], [/digital/i, "💻"],
];
const deptEmoji = (name: string) => DEPT_EMOJI.find(([re]) => re.test(name))?.[1] ?? "🏷️";

// Delivery areas the seller can pick — tap region → tap area, or Nationwide.
const GHANA_LOCATIONS: Record<string, string[]> = {
  "Greater Accra": ["Accra Metropolitan", "Osu", "Labone", "East Legon", "Spintex", "Makola", "Haatso", "Achimota", "Adabraka", "Ablekuma", "Madina", "Tema Metropolitan", "Ashaiman", "Teshie", "Nungua", "Dansoman"],
  "Ashanti": ["Kumasi Metropolitan", "Adum", "Asokwa", "Tafo", "Ejisu", "Obuasi", "Konongo", "Mampong"],
  "Northern": ["Tamale Metropolitan", "Savelugu", "Yendi", "Gushegu"],
  "Volta": ["Ho", "Hohoe", "Keta", "Kpando", "Aflao"],
  "Western": ["Takoradi", "Sekondi", "Tarkwa", "Axim"],
  "Central": ["Cape Coast", "Elmina", "Winneba", "Swedru", "Mankessim"],
  "Eastern": ["Koforidua", "Nkawkaw", "Akosombo", "Nsawam", "Suhum"],
  "Bono": ["Sunyani", "Berekum", "Dormaa Ahenkro"],
  "Upper East": ["Bolgatanga", "Navrongo", "Bawku"],
  "Upper West": ["Wa", "Tumu"],
  "Western North": ["Sefwi Wiawso", "Bibiani"],
  "Ahafo": ["Goaso", "Bechem"],
  "Bono East": ["Techiman", "Kintampo"],
  "Oti": ["Dambai", "Nkwanta"],
  "Savannah": ["Damongo", "Salaga"],
  "North East": ["Nalerigu", "Walewale"],
};

function ProductsPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ id?: string; store_id: string } | null>(null);
  const [q, setQ] = useState("");

  const store = useQuery({
    queryKey: ["my-store", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, currency, plan")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const products = useQuery({
    queryKey: ["dashboard-products", store.data?.id],
    enabled: !!store.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, title, slug, base_price, currency, status, views, store_id, product_media(url)")
        .eq("store_id", store.data!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]) as ProductRow[];
    },
  });

  const filtered = (products.data ?? []).filter((p) => p.title.toLowerCase().includes(q.trim().toLowerCase()));
  const liveCount = (products.data ?? []).filter((p) => p.status === "active").length;
  const draftCount = (products.data ?? []).filter((p) => p.status !== "active").length;
  const totalViews = (products.data ?? []).reduce((s, p) => s + Number(p.views ?? 0), 0);

  const toggle = useMutation({
    mutationFn: async (p: ProductRow) => {
      const next = p.status === "active" ? "draft" : "active";
      const { error } = await supabase.from("products").update({ status: next }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard-products"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["dashboard-products"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!store.data) {
    return (
      <div className="p-8 pb-24">
        <p className="text-sm text-muted-foreground">You need a store first. Head to the overview to create one.</p>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">{store.data.name}</p>
        </div>
        <button
          onClick={() => setEditing({ store_id: store.data!.id })}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add product
        </button>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
        {products.isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {(products.data ?? []).length === 0 && !products.isLoading && (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Package className="h-8 w-8 text-muted-foreground" />
            <p className="font-display text-lg">No products yet</p>
            <p className="text-sm text-muted-foreground">Add your first product to start selling.</p>
          </div>
        )}
        {(products.data ?? []).map((p) => (
          <div key={p.id} className="flex items-center gap-3 border-b border-border/60 p-3 last:border-b-0">
            <button onClick={() => setEditing({ id: p.id, store_id: p.store_id })} className="flex flex-1 items-center gap-3 text-left">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                {p.product_media?.[0]?.url && <img src={p.product_media[0].url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 font-medium">{p.title}</p>
                <p className="text-xs text-muted-foreground">
                  <span className={p.status === "active" ? "text-[var(--sage)]" : ""}>{p.status}</span>
                  {" · "}
                  {formatGHS(p.base_price, { currency: p.currency })}
                </p>
              </div>
            </button>
            <button
              onClick={() => toggle.mutate(p)}
              className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent"
            >
              {p.status === "active" ? "Unpublish" : "Publish"}
            </button>
            <button
              onClick={() => { if (confirm(`Delete "${p.title}"?`)) del.mutate(p.id); }}
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-accent"
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <ProductEditor
          storeId={editing.store_id}
          plan={(store.data?.plan ?? "free") as string}
          productId={editing.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["dashboard-products"] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ProductEditor({ storeId, productId, plan = "free", onClose, onSaved }: { storeId: string; productId?: string; plan?: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("10");
  const [status, setStatus] = useState<"active" | "draft">("draft");
  const [images, setImages] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [parentId, setParentId] = useState<string>("");
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [compareAt, setCompareAt] = useState("");
  const [swapAvailable, setSwapAvailable] = useState(false);
  const [negotiable, setNegotiable] = useState(false);  const [vRows, setVRows] = useState<{ id?: string; title: string; price: string; qty: string }[]>([]);
  const [optType, setOptType] = useState<string | null>(null);
  const [customVal, setCustomVal] = useState("");
  const [picker, setPicker] = useState<null | "category" | "location" | "spec">(null);
  const [catDrill, setCatDrill] = useState<string | null>(null);
  const [catQuery, setCatQuery] = useState("");
  const [locDrill, setLocDrill] = useState<string | null>(null);
  const [locQuery, setLocQuery] = useState("");
  const [negotiation, setNegotiation] = useState<"yes" | "no" | "unsure">("unsure");
  const [specKey, setSpecKey] = useState<string | null>(null);
  const [specDraft, setSpecDraft] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [uid, setUid] = useState<string | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);

  // Contact details pre-filled from the seller's profile (Jiji-style).
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUid(user.id);
      const { data: p } = await supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle();
      setContactName((p as any)?.full_name ?? "");
      setContactPhone((p as any)?.phone ?? "");
    })();
  }, []);
  const [deliveryAvailable, setDeliveryAvailable] = useState<boolean | null>(null); // null = not set
  const [paymentType, setPaymentType] = useState<"on_delivery" | "escrow" | "before_delivery" | "">("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [returnsAvailable, setReturnsAvailable] = useState<boolean | null>(null);
  const [returnsPeriod, setReturnsPeriod] = useState("");
  const [categories, setCategories] = useState<{ id: string; slug: string; name: string; parent_id: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  // Tap a suggested value → new option row pre-filled from the base price &
  // stock; tap again → removed. Typing stays available via "Custom value…".
  function toggleOptionValue(val: string) {
    setVRows((rows) => {
      const idx = rows.findIndex((r) => r.title.toLowerCase() === val.toLowerCase());
      if (idx >= 0) return rows.filter((_, j) => j !== idx);
      return [...rows, { title: val, price, qty: stock }];
    });
  }

  useEffect(() => {
    if (!productId) return;
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("title, description, base_price, compare_at_price, status, product_media(url, position), product_variants(id, title, price, inventory_qty, position)")
        .eq("id", productId)
        .single();
      if (!data) return;
      setTitle(data.title);
      setDescription(data.description ?? "");
      setPrice(String(data.base_price));
      setCompareAt(data.compare_at_price ? String(data.compare_at_price) : "");
      setStatus(data.status as any);
      setImages(((data.product_media ?? []) as any[]).sort((a, b) => a.position - b.position).map((m) => m.url));
      const vs = ((data.product_variants ?? []) as any[]).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      setVRows(vs.map((v) => ({ id: v.id, title: v.title, price: String(v.price), qty: String(v.inventory_qty ?? 0) })));
      setStock(String(vs[0]?.inventory_qty ?? 10));
    })();
    // Seller terms — optional columns; ignore failure if the migration hasn't run.
    supabase
      .from("products")
      .select("delivery_available, payment_type, returns_note, attributes, category_id, swap_available, negotiable")
      .eq("id", productId)
      .maybeSingle()
      .then(({ data: extra }) => {
        if (!extra) return;
        const e = extra as any;
        setDeliveryAvailable(e.delivery_available ?? null);
        setPaymentType(e.payment_type ?? "");
        setDeliveryTime(e.delivery_time ?? "");
        setDeliveryLocation(e.delivery_location ?? "");
        setReturnsAvailable(e.returns_available ?? null);
        setReturnsPeriod(e.returns_period ?? "");
        setCategoryId(e.category_id ?? "");
        setSpecs((e.attributes as Record<string, string>) ?? {});
        setSwapAvailable(!!e.swap_available);
        setNegotiable(!!e.negotiable);
      });
  }, [productId]);

  // Categories for the two-level picker (department → category)
  useEffect(() => {
    supabase
      .from("categories")
      .select("id, slug, name, parent_id")
      .order("position")
      .then(({ data }) => setCategories((data ?? []) as any[]));
  }, []);

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const path = `${storeId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
        const { error } = await supabase.storage.from("product-media").upload(path, file, { cacheControl: "3600", upsert: false });
        if (error) throw error;
        const { data: pub } = supabase.storage.from("product-media").getPublicUrl(path);
        urls.push(pub.publicUrl);
      }
      setImages((cur) => [...cur, ...urls]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function aiWriteDescription() {
    if (!title) return toast.error("Enter a title first");
    setAiBusy(true);
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You write short, warm product descriptions for a Ghanaian marketplace. 2-3 sentences, no emojis." },
            { role: "user", content: `Product title: ${title}. Write a description that highlights craftsmanship and value.` },
          ],
        }),
      });
      if (!res.ok) throw new Error("AI request failed");
      const j = await res.json();
      const text = j.choices?.[0]?.message?.content;
      if (text) setDescription(text.trim());
    } catch (e) {
      toast.error("AI unavailable. Fill in manually.");
    } finally {
      setAiBusy(false);
    }
  }

  async function save() {
    if (!title || !price) return toast.error("Title and price are required");
    setBusy(true);
    try {
      // Keep the seller's contact details current (shown to buyers in chat).
      if (uid && (contactName || contactPhone)) {
        try { await supabase.from("profiles").upsert({ id: uid, full_name: contactName, phone: contactPhone }); } catch {}
      }
      const slugBase = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;

      let pid = productId;
      if (pid) {
        const { error } = await supabase
          .from("products")
          .update({ title, description, base_price: Number(price), compare_at_price: compareAt ? Number(compareAt) : null, swap_available: swapAvailable, negotiable, status, category_id: categoryId || null })
          .eq("id", pid);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert({ store_id: storeId, title, description, base_price: Number(price), compare_at_price: compareAt ? Number(compareAt) : null, swap_available: swapAvailable, negotiable, status, slug, category_id: categoryId || null })
          .select("id")
          .single();
        if (error) throw error;
        pid = data.id;
      }

      // Reset media rows
      await supabase.from("product_media").delete().eq("product_id", pid!);
      if (images.length) {
        await supabase.from("product_media").insert(
          images.map((url, i) => ({ product_id: pid!, url, position: i })),
        );
      }

      // Sync option rows — the seller controls each size/colour and its price.
      const { data: existingVariants } = await supabase.from("product_variants").select("id").eq("product_id", pid!);
      const existingIds = new Set((existingVariants ?? []).map((v: any) => v.id));
      const keptIds = new Set<string>();
      let pos = 0;
      for (const r of vRows) {
        const t = r.title.trim();
        if (!t) continue;
        const row = { title: t, price: Number(r.price) || Number(price), inventory_qty: Number(r.qty) || 0, position: pos++ };
        if (r.id && existingIds.has(r.id)) {
          await supabase.from("product_variants").update(row).eq("id", r.id);
          keptIds.add(r.id);
        } else {
          await supabase.from("product_variants").insert({ product_id: pid!, ...row, options: {} });
        }
      }
      // Options tied to orders can't be removed (history references them) —
      // deletion failures are reported, never fatal.
      for (const id of existingIds) {
        if (!keptIds.has(id)) {
          const { error: delErr } = await supabase.from("product_variants").delete().eq("id", id);
          if (delErr) toast.info("One option is part of an order, so it was kept.");
        }
      }
      // Always keep at least one variant (cart + chat flows need it)
      const { data: finalVs } = await supabase.from("product_variants").select("id").eq("product_id", pid!).limit(1);
      if (!finalVs || finalVs.length === 0) {
        await supabase.from("product_variants").insert({ product_id: pid!, title: "Default", price: Number(price), inventory_qty: Number(stock) || 0, position: 0 });
      }

      // Seller terms — saved as a follow-up so the main save never depends
      // on the migration being applied. Failure surfaces a hint, not an error.
      if (deliveryAvailable !== null || returnsAvailable !== null) {
        const { error: termsErr } = await supabase
          .from("products")
          .update({
            delivery_available: deliveryAvailable,
            payment_type: deliveryAvailable ? paymentType || null : null,
            delivery_time: deliveryAvailable ? deliveryTime.trim() || null : null,
            delivery_location: deliveryAvailable ? deliveryLocation.trim() || null : null,
            returns_available: returnsAvailable,
            returns_period: returnsAvailable ? returnsPeriod.trim() || null : null,
            attributes: specs,
          })
          .eq("id", pid!);
        if (termsErr) {
          toast.info("Per-product terms & specs need a quick DB update — run supabase/migrations/20260830120000_product_seller_terms.sql in Supabase.");
        }
      }

      toast.success(productId ? "Product updated" : "Product created");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 md:items-center md:p-4" onClick={onClose}>
      <div className="relative max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-card p-6 md:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        {/* Jiji-style drill-down overlays (category / location) cover the sheet */}
        {picker && (
          <div className="absolute inset-0 z-20 overflow-y-auto rounded-t-3xl bg-card p-4 md:rounded-3xl">
            {picker === "category" ? (
              <>
                <div className="mb-3 flex items-center gap-2">
                  {catDrill && (
                    <button
                      type="button"
                      onClick={() => setCatDrill(null)}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-accent"
                      aria-label="Back to departments"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  )}
                  <p className="flex-1 truncate text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {catDrill ? (categories.find((c) => c.id === catDrill)?.name ?? "") : "Choose a category"}
                  </p>
                  <button type="button" onClick={() => { setPicker(null); setCatDrill(null); }} className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent" aria-label="Close picker">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <input
                  value={catQuery}
                  onChange={(e) => setCatQuery(e.target.value)}
                  placeholder="Search…"
                  className="mb-2 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring"
                />
                {!catDrill ? (
                  <ul className="divide-y divide-border/60">
                    {(categories ?? []).filter((c) => !c.parent_id && c.name.toLowerCase().includes(catQuery.toLowerCase())).map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => { setCatDrill(c.id); setCatQuery(""); }}
                          className="flex w-full items-center gap-3 py-3.5 text-left text-sm hover:bg-accent/50"
                        >
                          <span className="text-xl">{deptEmoji(c.name)}</span>
                          <span className="flex-1 truncate font-medium">{c.name}</span>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {(categories ?? []).filter((s) => s.parent_id === c.id).length || ""}
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {(categories ?? [])
                      .filter((c) => c.parent_id === catDrill && c.name.toLowerCase().includes(catQuery.toLowerCase()))
                      .map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => { setParentId(catDrill); setCategoryId(c.id); setPicker(null); setCatDrill(null); setCatQuery(""); }}
                            className="flex w-full items-center gap-3 py-3.5 text-left text-sm hover:bg-accent/50"
                          >
                            <span className="text-xl">{deptEmoji(c.name)}</span>
                            <span className="flex-1 truncate">{c.name}</span>
                            {categoryId === c.id && <span className="text-xs font-semibold text-primary">Selected</span>}
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </>
            ) : picker === "location" ? (
              <>
                <div className="mb-3 flex items-center gap-2">
                  {locDrill && (
                    <button
                      type="button"
                      onClick={() => setLocDrill(null)}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-accent"
                      aria-label="Back to regions"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  )}
                  <p className="flex-1 truncate text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {locDrill ?? "Delivery location"}
                  </p>
                  <button type="button" onClick={() => { setPicker(null); setLocDrill(null); }} className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent" aria-label="Close picker">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { setDeliveryLocation("Nationwide"); setPicker(null); setLocDrill(null); }}
                  className="mb-2 flex w-full items-center gap-3 rounded-xl border border-gold/40 bg-gold/5 px-3.5 py-3 text-sm font-medium text-gold"
                >
                  <Truck className="h-4 w-4" /> Nationwide — deliver anywhere in Ghana
                </button>
                {!locDrill ? (
                  <>
                    <input
                      value={locQuery}
                      onChange={(e) => setLocQuery(e.target.value)}
                      placeholder="Search region…"
                      className="mb-2 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring"
                    />
                    <ul className="divide-y divide-border/60">
                      {Object.keys(GHANA_LOCATIONS).filter((r) => r.toLowerCase().includes(locQuery.toLowerCase())).map((r) => (
                        <li key={r}>
                          <button
                            type="button"
                            onClick={() => {
                              const areas = GHANA_LOCATIONS[r];
                              if (areas.length) { setLocDrill(r); setLocQuery(""); }
                              else { setDeliveryLocation(r); setPicker(null); }
                            }}
                            className="flex w-full items-center gap-3 py-3.5 text-left text-sm hover:bg-accent/50"
                          >
                            <span className="flex-1 truncate font-medium">{r}</span>
                            {GHANA_LOCATIONS[r].length > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {GHANA_LOCATIONS[locDrill].filter((a) => a.toLowerCase().includes(locQuery.toLowerCase())).map((a) => (
                      <li key={a}>
                        <button
                          type="button"
                          onClick={() => { setDeliveryLocation(`${a}, ${locDrill}`); setPicker(null); setLocDrill(null); }}
                          className="flex w-full items-center py-3.5 pl-2 text-left text-sm hover:bg-accent/50"
                        >
                          <span className="flex-1">{a}</span>
                        </button>
                      </li>
                    ))}
                    <li>
                      <button
                        type="button"
                        onClick={() => { setDeliveryLocation(locDrill); setPicker(null); setLocDrill(null); }}
                        className="flex w-full items-center py-3.5 pl-2 text-left text-sm font-medium text-primary hover:bg-accent/50"
                      >
                        All of {locDrill}
                      </button>
                    </li>
                  </ul>
                )}
              </>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <p className="flex-1 truncate text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{specKey}</p>
                  <button type="button" onClick={() => setPicker(null)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent" aria-label="Close picker">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                {(() => {
                  const child = categories.find((c) => c.id === categoryId);
                  const parent = categories.find((c) => c.id === (child?.parent_id ?? parentId));
                  const field = specFieldsFor(child?.slug ?? "", child?.name ?? parent?.name ?? "").find((f) => f.key === specKey);
                  if (!field || !specKey) return null;
                  const opts = field.options ?? [];
                  const popular = opts.slice(0, 5);
                  const other = opts.slice(5);
                  const pick = (o: string) => { setSpecs((sp) => ({ ...sp, [specKey]: o })); setPicker(null); };
                  const Row = ({ o }: { o: string }) => (
                    <li>
                      <button type="button" onClick={() => pick(o)} className="flex w-full items-center py-3.5 pl-2 text-left text-sm hover:bg-accent/50">
                        <span className="flex-1">{o}</span>
                        {specs[specKey] === o && <span className="pr-3 text-xs font-semibold text-primary">Selected</span>}
                      </button>
                    </li>
                  );
                  return (
                    <>
                      {opts.length > 0 && (
                        <>
                          {popular.length > 0 && (
                            <>
                              <p className="border-b border-border/60 bg-accent/40 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Popular</p>
                              <ul className="divide-y divide-border/60">{popular.map((o) => <Row key={o} o={o} />)}</ul>
                            </>
                          )}
                          {other.length > 0 && (
                            <>
                              <p className="border-b border-border/60 bg-accent/40 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Other</p>
                              <ul className="divide-y divide-border/60">{other.map((o) => <Row key={o} o={o} />)}</ul>
                            </>
                          )}
                        </>
                      )}
                      <div className="mt-3 flex gap-2">
                        <input
                          value={specDraft}
                          onChange={(e) => setSpecDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && specDraft.trim()) pick(specDraft.trim()); }}
                          placeholder={opts.length ? "Type your own…" : (field.placeholder ?? `Enter ${field.key.toLowerCase()}…`)}
                          className="flex-1 rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring"
                        />
                        <button
                          type="button"
                          onClick={() => { if (specDraft.trim()) pick(specDraft.trim()); }}
                          disabled={!specDraft.trim()}
                          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                      {specs[specKey] && (
                        <button type="button" onClick={() => { setSpecs((sp) => ({ ...sp, [specKey]: "" })); setPicker(null); }} className="mt-3 text-xs text-muted-foreground underline hover:text-foreground">
                          Clear {field.key.toLowerCase()}
                        </button>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl">{productId ? "Edit product" : "New product"}</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring" placeholder="Handwoven Kente Scarf" />
          </label>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Description</span>
              <span className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{description.length} / 850</span>
                <button
                type="button"
                onClick={() => {
                  if (plan !== "pro") {
                    toast.error("✨ AI writer is a Pro feature — ask the admin to upgrade your store.");
                    return;
                  }
                  aiWriteDescription();
                }}
                disabled={aiBusy}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-accent disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3 text-[var(--gold)]" /> {aiBusy ? "Writing…" : plan === "pro" ? "Write with AI" : "Write with AI 🔒"}
              </button>
              </span>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring"
              placeholder="What makes this product special?"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Price (GHS)</span>
              <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" step="0.01" min="0" className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Stock</span>
              <input value={stock} onChange={(e) => setStock(e.target.value)} type="number" min="0" className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring" />
            </label>
          </div>

          {/* Seller terms — the buyer sees these three tiles on the product page.
              Leave any blank to fall back to the store's / platform's default. */}
          <div className="rounded-2xl border border-border p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery & returns</p>

            {/* Delivery available? — collapsed to a Jiji-style drill row */}
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setDeliveryOpen((v) => !v)}
                className="flex w-full items-center gap-3 rounded-xl border border-input bg-background px-3.5 py-3 text-left transition-colors hover:border-gold/50"
              >
                <span className="text-lg">🚚</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Delivery</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {deliveryAvailable === true
                      ? `Available${deliveryTime ? ` · ${deliveryTime}` : ""}${deliveryLocation ? ` · ${deliveryLocation}` : ""}`
                      : deliveryAvailable === false
                        ? "Not available — pickup / meet-up"
                        : "Add delivery options"}
                  </span>
                </span>
                <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${deliveryOpen ? "rotate-90" : ""}`} />
              </button>
              {deliveryOpen && (
                <div className="mt-3">
                <div className="flex gap-2">
                {([true, false] as const).map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => {
                      setDeliveryAvailable(v);
                      if (!v) setPaymentType("");
                    }}
                    className={`rounded-xl border px-4 py-2 text-sm transition-colors ${
                      deliveryAvailable === v
                        ? v
                          ? "border-emerald-500 bg-emerald-500/10 font-semibold text-emerald-600"
                          : "border-destructive bg-destructive/10 font-semibold text-destructive"
                        : "border-border text-muted-foreground hover:border-foreground/40"
                    }`}
                  >
                    {v ? "✓ Delivery available" : "✗ No delivery"}
                  </button>
                ))}
              </div>
              {deliveryAvailable === false && (
                <p className="mt-2 text-[11px] text-muted-foreground">Buyers will see "No delivery — meet the seller or arrange pickup".</p>
              )}
              {deliveryAvailable === true && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted-foreground">⏱️ Delivery time</span>
                    <input value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring" placeholder="e.g. 1–3 days" />
                  </label>
                  <button
                    type="button"
                    onClick={() => { setPicker("location"); setLocDrill(null); setLocQuery(""); }}
                    className="flex flex-col items-start rounded-xl border border-input bg-background px-3.5 py-2 text-left transition-colors hover:border-gold/50"
                  >
                    <span className="mb-0.5 block text-xs text-muted-foreground">📍 Delivery location</span>
                    <span className={`flex w-full items-center gap-1.5 text-sm ${deliveryLocation ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                      <span className="min-w-0 flex-1 truncate">{deliveryLocation || "Tap to choose"}</span>
                    </span>
                  </button>
                </div>
              )}
                </div>
              )}
            </div>

            {/* Payment type — only when delivery is available */}
            {deliveryAvailable === true && (
              <div className="mb-4">
                <span className="mb-1.5 block text-xs text-muted-foreground">🛡️ Payment type</span>
                <div className="flex flex-wrap gap-2">
                  {([
                    ["on_delivery", "Pay on delivery"],
                    ["escrow", "Escrow"],
                    ["before_delivery", "Pay before delivery"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPaymentType(value)}
                      className={`rounded-xl border px-4 py-2 text-sm transition-colors ${
                        paymentType === value
                          ? "border-primary bg-primary/10 font-semibold text-primary"
                          : "border-border text-muted-foreground hover:border-foreground/40"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Returns */}
            <div>
              <span className="mb-1.5 block text-xs text-muted-foreground">↩️ Returns</span>
              <div className="flex gap-2">
                {([true, false] as const).map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => {
                      setReturnsAvailable(v);
                      if (!v) setReturnsPeriod("");
                    }}
                    className={`rounded-xl border px-4 py-2 text-sm transition-colors ${
                      returnsAvailable === v
                        ? v
                          ? "border-emerald-500 bg-emerald-500/10 font-semibold text-emerald-600"
                          : "border-destructive bg-destructive/10 font-semibold text-destructive"
                        : "border-border text-muted-foreground hover:border-foreground/40"
                    }`}
                  >
                    {v ? "✓ Returns accepted" : "✗ No returns"}
                  </button>
                ))}
              </div>
              {returnsAvailable === true && (
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs text-muted-foreground">⏱️ Returns window</span>
                  <input value={returnsPeriod} onChange={(e) => setReturnsPeriod(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring sm:max-w-xs" placeholder="e.g. 7 days" />
                </label>
              )}
              {returnsAvailable === false && (
                <p className="mt-2 text-[11px] text-muted-foreground">Buyers will see "No returns — all sales final".</p>
              )}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-xs font-medium text-muted-foreground">Photos</span>
            <div className="grid grid-cols-4 gap-2">
              {images.map((url, i) => (
                <div key={url} className="relative aspect-square overflow-hidden rounded-xl bg-muted">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    onClick={() => setImages((cur) => cur.filter((_, idx) => idx !== i))}
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <label className="grid aspect-square cursor-pointer place-items-center rounded-xl border border-dashed border-border text-muted-foreground hover:bg-accent">
                <ImagePlus className="h-5 w-5" />
                <input type="file" accept="image/*" multiple hidden onChange={(e) => uploadFiles(e.target.files)} />
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={status === "active"} onChange={(e) => setStatus(e.target.checked ? "active" : "draft")} />
              Published
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 rounded-full border border-border py-3 text-sm font-medium hover:bg-accent">Cancel</button>
            <button onClick={save} disabled={busy} className="flex-1 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
