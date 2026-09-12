// Shopping location — Jiji-style big picker, modal presentation.
// View 1: all regions in a filterable grid with listing counts + letter dividers.
// View 2: drill into a region — merged, alphabetized cities & areas with counts.
// Data-driven from live store listings; a search box filters either view.
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Check, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBuyerLocation } from "@/lib/buyer-location";

type StorePlace = { region: string | null; city: string | null; area: string | null };
type Entry = { name: string; kind: "city" | "area"; city: string | null; count: number };

export function LocationPicker({ direction = "down", wide = false }: { direction?: "down" | "up"; wide?: boolean }) {
  const { location, setLocation } = useBuyerLocation();
  const [open, setOpen] = useState(false);
  const [tree, setTree] = useState<{
    regions: string[];
    regionCounts: Record<string, number>;
    entriesByRegion: Record<string, Entry[]>;
  } | null>(null);
  const [view, setView] = useState<"regions" | "cities">("regions");
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Build the map from live seller listings on first open.
  useEffect(() => {
    if (!open || tree) return;
    supabase
      .from("stores")
      .select("region, city, area")
      .eq("status", "active")
      .limit(2000)
      .then(({ data }) => {
        const regionCounts: Record<string, number> = {};
        const regionSet = new Set<string>();
        // Cities and areas live in one namespace per region; counts aggregate.
        const entries = new Map<string, Map<string, Entry>>();
        for (const row of (data ?? []) as StorePlace[]) {
          const region = row.region?.trim();
          if (!region) continue;
          regionSet.add(region);
          regionCounts[region] = (regionCounts[region] ?? 0) + 1;
          const city = row.city?.trim();
          const area = row.area?.trim();
          if (!city && !area) continue;
          if (!entries.has(region)) entries.set(region, new Map());
          const byName = entries.get(region)!;
          if (city) {
            const cur = byName.get(city);
            if (cur) cur.count += 1;
            else byName.set(city, { name: city, kind: "city", city: null, count: 1 });
          }
          if (area) {
            const cur = byName.get(area);
            if (cur) {
              cur.count += 1;
              if (city && !cur.city) cur.city = city;
            } else {
              byName.set(area, { name: area, kind: "area", city: city ?? null, count: 1 });
            }
          }
        }
        const regions = [...regionSet].sort((a, b) => (regionCounts[b] ?? 0) - (regionCounts[a] ?? 0));
        const entriesByRegion: Record<string, Entry[]> = {};
        for (const [region, byName] of entries) {
          entriesByRegion[region] = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
        }
        setTree({ regions, regionCounts, entriesByRegion });
      });
  }, [open, tree]);

  const totalCount = useMemo(
    () => (tree ? Object.values(tree.regionCounts).reduce((s, n) => s + n, 0) : 0),
    [tree],
  );

  const q = query.trim().toLowerCase();

  // View 1 — busiest region becomes "Popular", the rest alphabetized.
  const regionList = useMemo(() => {
    if (!tree) return { popular: [] as string[], rest: [] as string[] };
    const filtered = tree.regions.filter((r) => r.toLowerCase().includes(q));
    const [top, ...rest] = filtered; // pre-sorted by listing count
    return { popular: q ? [] : top ? [top] : [], rest };
  }, [tree, q]);

  // View 2 — merged cities + areas of the active region, filtered.
  const entryList = useMemo(() => {
    if (!tree || !activeRegion) return [] as Entry[];
    return (tree.entriesByRegion[activeRegion] ?? []).filter((e) => e.name.toLowerCase().includes(q));
  }, [tree, activeRegion, q]);

  /** Letter-divider groups, Jiji-style (A…, B…, …) inside CSS columns. */
  function withLetterDividers(items: { key: string; name: string; render: () => React.ReactNode }) {
    const out: React.ReactNode[] = [];
    let letter = "";
    for (const item of items) {
      const l = item.name[0]?.toUpperCase() ?? "#";
      if (l !== letter) {
        letter = l;
        out.push(
          <div key={`div-${item.key}`} className="flex break-inside-avoid items-end px-1 pb-1 pt-3">
            <span className="text-sm font-semibold text-muted-foreground/60">{l}</span>
          </div>,
        );
      }
      out.push(item.render());
    }
    return out;
  }

  function choose(next: { region: string; city?: string; area?: string } | null) {
    setLocation(next);
    setOpen(false);
  }

  function openPicker() {
    setOpen((v) => !v);
    setView("regions");
    setQuery("");
  }

  const label = location ? location.area || location.city || location.region : "All Ghana";

  /* ── Wide: Jiji-style big panel ── */
  if (wide) {
    return (
      <div className="relative" ref={wrapRef}>
        <button
          onClick={openPicker}
          aria-label="Change shopping location"
          aria-expanded={open}
          className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent data-[open=true]:border-primary data-[open=true]:text-foreground"
          data-open={open}
        >
          <MapPin className={`h-3.5 w-3.5 ${location ? "text-[var(--gold)]" : "text-muted-foreground/60"}`} />
          {label}
          <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div
            className="fixed inset-0 z-[70] bg-background/50 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
        )}

        <div
          className={`fixed left-1/2 top-1/2 z-[71] flex max-h-[min(80dvh,640px)] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[0_60px_120px_-30px_oklch(0_0_0/0.75)] transition-all duration-200 ${
            open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
          }`}
          role="listbox"
          aria-label="Shopping location"
        >
          {/* Header — All Ghana (or Back) + filter box */}
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
            {view === "regions" ? (
              <button onClick={() => choose(null)} className="group flex items-baseline gap-2 text-left" title="Shop all of Ghana">
                <span className="text-sm font-semibold text-foreground transition-colors group-hover:text-gold">All Ghana</span>
                <span className="text-xs text-muted-foreground">· {totalCount.toLocaleString()} listings</span>
                {!location && <Check className="h-4 w-4 self-center text-gold" />}
              </button>
            ) : (
              <button
                onClick={() => {
                  setView("regions");
                  setQuery("");
                }}
                className="flex items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-gold"
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
            )}
            <div className="flex w-56 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 transition-colors focus-within:border-gold/60">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find region, city or area…"
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {view === "regions" && (
              <>
                {/* Popular — the busiest region gets the rail */}
                {regionList.popular.length > 0 && (
                  <div className="mb-2 flex gap-2">
                    <span
                      className="flex w-5 shrink-0 items-start justify-center pt-2 text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50 [writing-mode:vertical-lr]"
                      aria-hidden
                    >
                      Popular
                    </span>
                    <div className="flex-1">
                      {regionList.popular.map((region) => (
                        <button
                          key={region}
                          onClick={() => {
                            setActiveRegion(region);
                            setView("cities");
                          }}
                          className="flex w-full items-center justify-between rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5 text-sm transition-colors hover:bg-gold/10"
                        >
                          <span className={`font-medium ${location?.region === region && !location?.city ? "text-gold" : "text-foreground"}`}>
                            {region}
                          </span>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            {tree!.regionCounts[region].toLocaleString()} · <ChevronRight className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* All regions, alphabetized with letter dividers */}
                <div className="columns-1 gap-x-2 sm:columns-2">
                  {withLetterDividers(
                    regionList.rest.map((region) => ({
                      key: region,
                      name: region,
                      render: () => {
                        const selected = location?.region === region && !location?.city;
                        return (
                          <button
                            key={region}
                            onClick={() => {
                              setActiveRegion(region);
                              setView("cities");
                            }}
                            className="mb-0.5 flex w-full break-inside-avoid items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-accent"
                          >
                            <span className={selected ? "font-semibold text-gold" : "text-foreground/90"}>{region}</span>
                            <span className="flex items-center gap-2 text-xs text-muted-foreground">
                              {tree!.regionCounts[region].toLocaleString()} · <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                            </span>
                          </button>
                        );
                      },
                    })),
                  )}
                  {tree && regionList.popular.length + regionList.rest.length === 0 && (
                    <p className="py-10 text-center text-xs text-muted-foreground">No region matches “{query}”.</p>
                  )}
                  {!tree && <p className="py-10 text-center text-xs text-muted-foreground">Loading regions…</p>}
                </div>
              </>
            )}

            {view === "cities" && activeRegion && (
              <>
                {/* All of the region */}
                <button
                  onClick={() => choose({ region: activeRegion })}
                  className={`mb-2 flex w-full items-center justify-between rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5 text-sm transition-colors hover:bg-gold/10 ${
                    location?.region === activeRegion && !location?.city ? "text-gold" : "font-medium text-foreground"
                  }`}
                >
                  <span>All {activeRegion}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {tree!.regionCounts[activeRegion].toLocaleString()} · <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </button>

                {/* Cities & areas, alphabetized with letter dividers */}
                <div className="columns-1 gap-x-2 sm:columns-2">
                  {withLetterDividers(
                    entryList.map((entry) => ({
                      key: `${entry.kind}-${entry.name}`,
                      name: entry.name,
                      render: () => {
                        const selected =
                          location?.region === activeRegion &&
                          (entry.kind === "city"
                            ? location?.city === entry.name && !location?.area
                            : location?.area === entry.name);
                        return (
                          <button
                            key={`${entry.kind}-${entry.name}`}
                            onClick={() =>
                              entry.kind === "city"
                                ? choose({ region: activeRegion, city: entry.name })
                                : choose({ region: activeRegion, city: entry.city ?? undefined, area: entry.name })
                            }
                            className="mb-0.5 flex w-full break-inside-avoid items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-accent"
                          >
                            <span className="min-w-0 text-left">
                              <span className={`block truncate text-[13px] ${selected ? "font-semibold text-gold" : "text-foreground/90"}`}>
                                {entry.name}
                              </span>
                              <span className="block truncate text-[10px] text-muted-foreground/70">
                                {entry.city ?? activeRegion}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {entry.count.toLocaleString()} · <ChevronRight className="inline h-3.5 w-3.5 text-muted-foreground/60" />
                            </span>
                          </button>
                        );
                      },
                    })),
                  )}
                  {entryList.length === 0 && (
                    <p className="py-10 text-center text-xs text-muted-foreground">
                      {q ? `Nothing matches “${query}” in ${activeRegion}.` : `No cities or areas listed in ${activeRegion} yet.`}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Narrow: compact anchored list, same data, simpler flow ── */
  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={openPicker}
        aria-label="Change shopping location"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent data-[open=true]:border-primary data-[open=true]:text-foreground"
        data-open={open}
      >
        <MapPin className={`h-3.5 w-3.5 ${location ? "text-[var(--gold)]" : "text-muted-foreground/60"}`} />
        {label}
        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      <div
        className={`absolute right-0 ${direction === "up" ? "bottom-full z-[60] mb-2 origin-bottom-right" : "top-full z-[60] mt-2 origin-top-right"} w-80 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all duration-200 ${
          open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
        }`}
        role="listbox"
        aria-label="Shopping location"
      >
        <div className="border-b border-border/60 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <MapPin className="h-3 w-3 text-[var(--gold)]" /> Shopping location
          </p>
        </div>
        <div className="max-h-[60dvh] overflow-y-auto p-1.5">
          <button
            onClick={() => choose(null)}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-accent"
          >
            <span className="font-medium">All Ghana</span>
            {!location && <Check className="h-4 w-4 text-primary" />}
          </button>

          {(tree?.regions ?? []).map((region) => (
            <div key={region}>
              <button
                onClick={() => setActiveRegion(region)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-accent ${
                  activeRegion === region ? "bg-accent font-medium" : ""
                }`}
              >
                <span className="flex items-center gap-2">
                  {region}
                  {location?.region === region && (
                    <span className="text-xs text-muted-foreground">· {location.city}{location.area ? ` / ${location.area}` : ""}</span>
                  )}
                </span>
                <span className="text-[10px] text-muted-foreground/70">{tree!.regionCounts[region]}</span>
              </button>

              {activeRegion === region && (
                <div className="ml-3 border-l border-border/60 pl-1.5">
                  <button
                    onClick={() => choose({ region })}
                    className="flex w-full items-center rounded-lg px-2.5 py-2 text-[13px] font-medium text-primary hover:bg-primary/10"
                  >
                    Whole of {region}
                  </button>
                  {(tree?.entriesByRegion[region] ?? []).map((entry) => (
                    <button
                      key={`${entry.kind}-${entry.name}`}
                      onClick={() =>
                        entry.kind === "city"
                          ? choose({ region, city: entry.name })
                          : choose({ region, city: entry.city ?? undefined, area: entry.name })
                      }
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] hover:bg-accent"
                    >
                      <span>{entry.name}</span>
                      <span className="text-[10px] text-muted-foreground/70">{entry.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {!tree && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</p>}
        </div>
      </div>
    </div>
  );
}
