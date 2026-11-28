// Recently viewed — a lightweight local memory (last 12 products) that feeds
// the homepage rail. Purely client-side: no backend table, no analytics.

export type ViewedProduct = {
  id: string;
  slug: string;
  title: string;
  base_price: number;
  currency: string;
  store: { slug: string; name: string; area: string | null; city: string | null } | null;
  product_media: { url: string }[];
};

const KEY = "basic:recently-viewed";
const CAP = 12;

export function recordRecentlyViewed(p: ViewedProduct) {
  try {
    const rest = list().filter((x) => x.id !== p.id);
    const next = [p, ...rest].slice(0, CAP);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode — the rail just stays empty */
  }
}

export function recentlyViewed(): ViewedProduct[] {
  return list();
}

function list(): ViewedProduct[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ViewedProduct[]) : [];
  } catch {
    return [];
  }
}
