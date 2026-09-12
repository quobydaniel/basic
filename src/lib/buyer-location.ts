// Buyer shopping location — a filter, not a cage. Stored locally; "All
// Ghana" (null) means no location filtering. Region → city → area cascade
// matches the seller's store location fields.
import { useCallback, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BuyerLocation = {
  region: string;
  city?: string;
  area?: string;
};

const KEY = "sellio.location.v1";

let cached: BuyerLocation | null | undefined; // undefined = not yet read
const listeners = new Set<() => void>();

function read(): BuyerLocation | null {
  if (cached !== undefined) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    cached = raw ? (JSON.parse(raw) as BuyerLocation) : null;
  } catch {
    cached = null;
  }
  return cached;
}

function write(next: BuyerLocation | null) {
  cached = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

export function setBuyerLocation(next: BuyerLocation | null) {
  write(next);
}

export function useBuyerLocation() {
  const location = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => null,
  );

  const openPicker = useCallback(() => {
    window.dispatchEvent(new CustomEvent("sellio:open-location-picker"));
  }, []);

  const clear = useCallback(() => setBuyerLocation(null), []);

  return { location, openPicker, clear, setLocation: setBuyerLocation };
}

// Fetch the location cascade (distinct regions; cities/areas on demand)
export async function fetchRegions(): Promise<string[]> {
  const { data, error } = await supabase
    .from("locations")
    .select("region")
    .order("region");
  if (error) throw error;
  return [...new Set((data ?? []).map((r: { region: string }) => r.region))];
}

export async function fetchCities(region: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("locations")
    .select("city")
    .eq("region", region)
    .order("city");
  if (error) throw error;
  return [...new Set((data ?? []).map((r: { city: string }) => r.city))];
}

export async function fetchAreas(region: string, city: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("locations")
    .select("area")
    .eq("region", region)
    .eq("city", city)
    .order("area");
  if (error) throw error;
  return [...new Set((data ?? []).map((r: { area: string | null }) => r.area).filter((a): a is string => !!a))];
}
