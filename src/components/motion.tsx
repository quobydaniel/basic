import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Parallax — scroll-linked translate. speed > 0 sinks (depth layer),
 * speed < 0 rises (foreground). rAF-throttled, passive.
 */
export function Parallax({
  speed = 0.2,
  className,
  style,
  children,
}: {
  speed?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const progress = (rect.top + rect.height / 2 - vh / 2) / vh;
      setOffset(progress * speed * 100);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [speed]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...style, transform: `translate3d(0, ${offset.toFixed(1)}px, 0)`, willChange: "transform" }}
    >
      {children}
    </div>
  );
}

/**
 * Reveal — light fade-and-rise on first scroll into view. Deliberately
 * subtle: marketplaces live and die on how fast content reads, so no blur
 * and no long travel (the old 6px blur + 28px rise read as "blank page" on
 * slow devices and in full-page captures).
 */
export function Reveal({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.05, rootMargin: "0px 0px -5% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(className)}
      style={{
        transitionDelay: `${delay}ms`,
        transition: "opacity 320ms ease, transform 320ms ease",
        opacity: shown ? 1 : 0.001,
        transform: shown ? "translate3d(0,0,0)" : "translate3d(0, 12px, 0)",
      }}
    >
      {children}
    </div>
  );
}
