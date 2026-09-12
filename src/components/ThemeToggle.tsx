import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "sellio:theme";

/**
 * ThemeToggle — dark (Obsidian, the house default) ⇄ light (Ivory & Champagne).
 * Persists to localStorage; the pre-paint script in __root applies the saved
 * choice before first paint, so switching never flashes the wrong surface.
 */
export function ThemeToggle() {
  const [light, setLight] = useState(false);

  // Sync with whatever the pre-paint script decided (SSR always assumes dark).
  useEffect(() => {
    setLight(document.documentElement.classList.contains("light"));
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    try {
      localStorage.setItem(KEY, next ? "light" : "dark");
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      title={light ? "Dark — after hours" : "Light — daylight"}
      className="grid h-9 w-9 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-accent hover:text-gold"
    >
      {light ? (
        <Sun className="h-[18px] w-[18px]" strokeWidth={1.6} />
      ) : (
        <Moon className="h-[18px] w-[18px]" strokeWidth={1.6} />
      )}
    </button>
  );
}
