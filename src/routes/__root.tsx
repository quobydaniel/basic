import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/nunito-sans/400.css";
import "@fontsource/nunito-sans/500.css";
import "@fontsource/nunito-sans/600.css";
import "@fontsource/nunito-sans/700.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 pb-24">
      <div className="max-w-md text-center">
        <p className="font-display text-6xl text-[var(--gold)]">404</p>
        <h1 className="mt-4 font-display text-2xl">This page wandered off</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {/* Browser back — on mobile this is how users bail out of dead links
              without losing their place in the marketplace. */}
          <button
            onClick={() => (window.history.length > 1 ? router.history.back() : router.navigate({ to: "/" }))}
            className="inline-flex items-center justify-center rounded-full border border-input bg-background px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            Go back
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Back to marketplace
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong on our end.</p>
        {/* Surface the real failure so QA can report it — message only in
            prod, full stack in dev. */}
        <pre className="mt-4 max-w-full overflow-x-auto rounded-xl border border-border bg-muted/40 p-3 text-left text-xs text-muted-foreground">
          {error.message}
          {import.meta.env.DEV && error.stack ? `\n\n${error.stack}` : ""}
        </pre>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
          <a href="/" className="rounded-full border border-input bg-background px-5 py-2.5 text-sm font-medium hover:bg-accent">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#121114" },
      { title: "BASIC — Ghana's premium social marketplace" },
      { name: "description", content: "Discover and shop from Ghana's best independent brands. Sellers, launch your storefront in minutes and sell across Instagram, TikTok, and WhatsApp." },
      { name: "author", content: "BASIC" },
      { property: "og:title", content: "BASIC — Ghana's premium social marketplace" },
      { property: "og:description", content: "Shop from Ghana's best independent brands, and launch your own storefront in minutes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "icon", href: "/icon-512.png", type: "image/png", sizes: "512x512" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
    scripts: [
      // Pre-paint theme: apply the saved mode before first render so light-mode
      // users never flash the dark surface. Default (no saved choice) = dark.
      {
        type: "text/javascript",
        children: `try{if(localStorage.getItem("sellio:theme")==="light")document.documentElement.classList.add("light")}catch(e){}`,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    // The Supabase client is a lazy proxy that throws on first access if
    // VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are unset. That throw
    // inside this effect would otherwise escape into React's error boundary
    // and render the root "This page didn't load" fallback for the entire app
    // — even though every individual route handles Supabase failures via
    // TanStack Query's error state. Catch + log so the page hydrates; queries
    // still fail (gracefully) when env is genuinely missing.
    let sub: { subscription: { unsubscribe: () => void } } | undefined;
    try {
      sub = supabase.auth.onAuthStateChange((event) => {
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }).data;
    } catch (err) {
      console.error("[sellio] auth state subscription skipped — Supabase env missing?", err);
    }
    return () => sub?.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}
