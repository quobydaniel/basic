// /store — smart entry for the STORES nav item.
// Signed out → seller onboarding (/auth?mode=sell).
// Signed in  → the seller dashboard, which is self-aware: it shows the
// "Create storefront" onboarding when the user has no store yet, and the
// full store management view once they do.
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/store")({
  ssr: false,
  beforeLoad: async () => {
    // Session-restore race: poll briefly before judging signed-out state
    // (same pattern as the _authenticated guard).
    let session: unknown = null;
    for (let i = 0; i < 20; i++) {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        session = data.session;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!session) {
      throw redirect({ to: "/auth", search: { mode: "sell" as const } });
    }
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
