// Product gallery — Jiji-style on desktop: vertical thumbnail rail on the
// left, main image with prev/next arrows (already wrap). Mobile keeps a
// swipeable snap carousel that loops INFINITELY — three copies of the slide
// list, parked on the middle copy, jumping (unanimated) whenever momentum
// lands in a clone band. Fullscreen lightbox on tap for both.
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type Media = { url: string; alt?: string | null; position?: number };

export function ProductGallery({ media, title }: { media: Media[]; title: string }) {
  const sorted = [...media].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);

  const n = sorted.length;
  const loop = n > 1; // nothing to loop with a single image
  const step = (dir: 1 | -1) => setActive((a) => (n ? (a + dir + n) % n : 0));

  // Park the track on the middle copy on mount (and whenever the slide
  // count changes) — the copies to the left/right are the loop seams.
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !loop) return;
    const park = () => {
      if (el.clientWidth > 0) el.scrollLeft = n * el.clientWidth;
      else requestAnimationFrame(park);
    };
    park();
  }, [n, loop]);

  function onMobileScroll() {
    const el = trackRef.current;
    if (!el || !loop || el.clientWidth === 0) return;
    const raw = Math.round(el.scrollLeft / el.clientWidth);
    // Momentum landed in a clone band — teleport (unanimated) back into the
    // middle band. snap-mandatory keeps the landing point on a slide edge.
    if (raw < n) {
      el.scrollLeft += n * el.clientWidth;
      return;
    }
    if (raw >= 2 * n) {
      el.scrollLeft -= n * el.clientWidth;
      return;
    }
    const i = raw - n;
    if (i !== active) setActive(i);
  }

  if (n === 0) {
    return <div className="aspect-square w-full overflow-hidden bg-muted md:rounded-3xl" />;
  }

  // The mobile slide list: one copy, or three for the infinite loop.
  const mobileSlides = loop ? [...sorted, ...sorted, ...sorted] : sorted;

  return (
    <section className="relative">
      <div className="flex gap-3">
        {/* Desktop — vertical thumbnail rail */}
        {n > 1 && (
          <div className="no-scrollbar hidden w-16 shrink-0 flex-col gap-2 self-start overflow-y-auto md:flex">
            {sorted.map((m, i) => (
              <button
                key={m.url + i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show image ${i + 1}`}
                className={`relative aspect-square w-16 shrink-0 overflow-hidden rounded-xl border transition-colors ${
                  i === active ? "border-gold" : "border-border hover:border-foreground/40"
                }`}
              >
                <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Mobile — infinite snap carousel */}
        <div className="relative min-w-0 flex-1 md:hidden">
          <div
            ref={trackRef}
            onScroll={onMobileScroll}
            className="no-scrollbar flex aspect-square w-full snap-x snap-mandatory overflow-x-auto bg-muted"
          >
            {mobileSlides.map((m, idx) => {
              const real = idx % n;
              return (
                <button
                  key={`${Math.floor(idx / n)}-${m.url}-${real}`}
                  type="button"
                  onClick={() => setZoom(true)}
                  aria-label={`View image ${real + 1} fullscreen`}
                  className="block h-full w-full shrink-0 snap-center"
                >
                  <img
                    src={m.url}
                    alt={m.alt ?? title}
                    loading={loop ? undefined : idx === 0 ? "eager" : "lazy"}
                    className="pointer-events-none h-full w-full object-cover"
                  />
                </button>
              );
            })}
          </div>
          {n > 1 && (
            <div className="mt-2 flex justify-center gap-1.5">
              {sorted.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === active ? "w-4 bg-gold" : "w-1.5 bg-muted-foreground/30"}`} />
              ))}
            </div>
          )}
        </div>

        {/* Desktop — main image with wrapping arrows */}
        <div className="relative hidden min-w-0 flex-1 md:block">
          <button
            type="button"
            onClick={() => setZoom(true)}
            aria-label="View image fullscreen"
            className="block aspect-square w-full overflow-hidden rounded-3xl bg-muted"
          >
            <img
              src={sorted[active]?.url}
              alt={sorted[active]?.alt ?? title}
              loading={active === 0 ? "eager" : "lazy"}
              className="h-full w-full object-cover"
            />
          </button>

          {n > 1 && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous image"
                className="absolute left-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-border bg-background/85 text-foreground shadow-[var(--shadow-soft)] backdrop-blur transition-colors hover:border-gold hover:text-gold"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next image"
                className="absolute right-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-border bg-background/85 text-foreground shadow-[var(--shadow-soft)] backdrop-blur transition-colors hover:border-gold hover:text-gold"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
                {sorted.map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full transition-all ${i === active ? "w-5 bg-gold" : "w-1.5 bg-muted-foreground/40"}`} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Fullscreen lightbox */}
      {zoom && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95"
          onClick={() => setZoom(false)}
          role="dialog"
          aria-label="Product image fullscreen"
        >
          <button
            aria-label="Close"
            onClick={() => setZoom(false)}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={sorted[active]?.url}
            alt={sorted[active]?.alt ?? title}
            className="max-h-[90dvh] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {n > 1 && (
            <div className="absolute bottom-5 flex gap-1.5">
              {sorted.map((_, i) => (
                <button
                  key={i}
                  aria-label={`Go to image ${i + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActive(i);
                    // Keep the mobile track in sync with the lightbox choice
                    const el = trackRef.current;
                    if (el && loop && el.clientWidth > 0) el.scrollLeft = (n + i) * el.clientWidth;
                  }}
                  className={`h-2 rounded-full transition-all ${i === active ? "w-6 bg-gold" : "w-2 bg-white/40"}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
