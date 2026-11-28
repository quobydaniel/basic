import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "sellio:theme";

/**
 * ThemeToggle — BASIC PEARL (light, the house default) ⇄ Palm & Gold (dark).
 * Persists to localStorage; the pre-paint script in __root applies the saved
 * choice before first paint, so switching never flashes the wrong surface.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  // Sync with whatever the pre-paint script decided (SSR always assumes pearl).
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {}
    // Keep the mobile browser chrome in step with the surface.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", next ? "#121511" : "#FAF9F6");
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light — daylight pearl" : "Dark — after hours"}
      className="grid h-9 w-9 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-accent hover:text-gold"
    >
      {dark ? (
        <Sun className="h-[18px] w-[18px]" strokeWidth={1.6} />
      ) : (
        <Moon className="h-[18px] w-[18px]" strokeWidth={1.6} />
      )}
    </button>
  );
}
