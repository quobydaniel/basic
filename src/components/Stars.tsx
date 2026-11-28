// Star display + interactive rating input
import { Star } from "lucide-react";

export function Stars({
  rating,
  size = "sm",
  onRate,
}: {
  rating: number; // 0..5, halves ignored
  size?: "xs" | "sm" | "md";
  onRate?: (r: number) => void;
}) {
  const dim = size === "xs" ? "h-3 w-3" : size === "md" ? "h-6 w-6" : "h-4 w-4";
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const star = (
          <Star
            className={`${dim} ${n <= Math.round(rating) ? "fill-[var(--gild)] text-[var(--gild)]" : "text-muted-foreground/40"}`}
          />
        );
        return onRate ? (
          <button
            key={n}
            type="button"
            aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
            onClick={() => onRate(n)}
            className="p-0.5 transition hover:scale-110"
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </span>
  );
}
