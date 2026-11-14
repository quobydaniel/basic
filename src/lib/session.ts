import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// ── Presence heartbeat ──
// Exactly one per app (module-guarded — useSession is called from many
// components). Beats the signed-in user's last_seen_at every 45s so chat
// headers can show a real "Online now / Last seen 5m ago" instead of a
// canned guess. Silent on failure: a missing column or RLS hiccup must
// never surface to the user — presence is decoration, not a feature gate.
const heartbeat: { userId: string | null; timer: ReturnType<typeof setInterval> | null } = {
  userId: null,
  timer: null,
};
function startHeartbeat(userId: string) {
  if (heartbeat.userId === userId) return;
  stopHeartbeat();
  heartbeat.userId = userId;
  const beat = () =>
    (supabase as any)
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", userId)
      .then(() => {}, () => {});
  beat();
  heartbeat.timer = setInterval(beat, 45_000);
}
function stopHeartbeat() {
  if (heartbeat.timer) clearInterval(heartbeat.timer);
  heartbeat.userId = null;
  heartbeat.timer = null;
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) startHeartbeat(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      // Keep exactly one heartbeat alive for whoever is signed in.
      if (s?.user) startHeartbeat(s.user.id);
      else stopHeartbeat();
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      stopHeartbeat();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}
