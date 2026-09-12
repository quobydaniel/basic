// Integration-managed pattern: client-only auth gate. SSR is off because
// Supabase stores the session in localStorage.
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Session-restore race: poll briefly before judging signed-out state
    let session: { user: { id: string } } | null = null;
    for (let i = 0; i < 20; i++) {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        session = data.session as unknown as { user: { id: string } };
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!session) {
      throw redirect({ to: "/auth", search: { mode: "shop" as const } });
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { mode: "shop" as const } });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
