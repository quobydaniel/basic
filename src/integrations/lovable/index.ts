// Social OAuth broker — originally wrapped `@lovable.dev/cloud-auth-js`.
// BASIC's rebuild drops Lovable Cloud; this module now drives OAuth through
// Supabase directly (`supabase.auth.signInWithOAuth`) so the route code
// (`auth.tsx`) keeps the same `lovable.auth.signInWithOAuth(provider)` API.
//
// To enable Google/Apple/Azure, configure the corresponding provider in
// the Supabase dashboard (Authentication → Providers) and add the right
// redirect URL (https://<your-project>.supabase.co/auth/v1/callback) to the
// OAuth provider's console.
//
// Note: Supabase's Provider enum uses `"azure"` (not `"microsoft"`) for the
// Microsoft Identity platform — that's what the public OAuth flows actually
// hit. We map our `lovable`-style `"microsoft"` to Supabase's `"azure"` here
// so route code can stay agnostic to that rename.

import type { Provider } from "@supabase/supabase-js";

import { supabase } from "../supabase/client";

type PublicProvider = "google" | "apple" | "microsoft" | "lovable";
type SupabaseSupportedProvider = Exclude<PublicProvider, "lovable" | "microsoft"> | "azure";

function toSupabaseProvider(provider: PublicProvider): SupabaseSupportedProvider {
  if (provider === "lovable") return "google";
  if (provider === "microsoft") return "azure";
  return provider;
}

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: PublicProvider,
      opts?: SignInOptions,
    ) => {
      const supabaseProvider = toSupabaseProvider(provider) as Provider;

      const redirectTo = opts?.redirect_uri ?? window.location.origin;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: supabaseProvider,
        options: {
          redirectTo,
          queryParams: opts?.extraParams ?? {},
        },
      });
      // Supabase returns `{ data: { provider, url }, error: null }` and
      // *navigates the browser* to the OAuth provider via `redirectTo`
      // (popup is the default when no `skipBrowserRedirect` is set).
      // We return a Lovable-style `{ redirected: true }` so callers don't
      // branch on a different shape.
      if (error) return { error };
      return { redirected: true, url: data?.url };
    },
  },
};
