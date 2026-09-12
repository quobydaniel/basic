import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useSession } from "@/lib/session";

const searchSchema = z.object({
  mode: z.enum(["shop", "sell"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — BASIC" },
      { name: "description", content: "Sign in or create your BASIC account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const isSellMode = mode === "sell";
  const [tab, setTab] = useState<"sign_in" | "sign_up">(isSellMode ? "sign_up" : "sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  // "forgot" = email-first form; "reset" = arrived from a recovery link with
  // a session, so show the new-password form instead.
  const [flow, setFlow] = useState<"auth" | "forgot" | "reset">("auth");
  const navigate = useNavigate();
  const { user } = useSession();

  // Recovery links land here with a session + type=recovery in the URL
  // fragment — detect and switch to the new-password form.
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setFlow("reset");
    }
  }, []);

  useEffect(() => {
    if (user) navigate({ to: isSellMode ? "/dashboard" : "/account", replace: true });
  }, [user, isSellMode, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (tab === "sign_up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name },
          },
        });
        if (error) throw error;
        toast.success("Welcome to BASIC!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error(result.error.message || "Google sign-in failed");
  }

  // Forgot password: email a recovery link that lands back here.
  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/auth",
      });
      if (error) throw error;
      toast.success("Reset link sent — check your email.");
      setFlow("auth");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the reset link");
    } finally {
      setBusy(false);
    }
  }

  // Arrived from the recovery link (session restored): set the new password.
  async function applyNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated — welcome back!");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
        <Link to="/" className="mb-6 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground font-display text-xl">S</span>
          <span className="font-display text-2xl">BASIC</span>
        </Link>

        <h1 className="font-display text-3xl leading-tight">
          {flow === "forgot"
            ? "Reset your password"
            : flow === "reset"
              ? "Set a new password"
              : isSellMode
                ? "Open your storefront"
                : tab === "sign_in"
                  ? "Welcome back"
                  : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {flow === "forgot"
            ? "Enter your email and we'll send you a reset link."
            : flow === "reset"
              ? "Choose a new password for your account."
              : isSellMode
                ? "Create an account to launch your store, list products, and start selling."
                : "Sign in to shop, save favorites, and track orders."}
        </p>

        {flow === "auth" && (
          <button
            onClick={google}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card py-3 text-sm font-medium hover:bg-accent"
          >
            <GoogleG /> Continue with Google
          </button>
        )}

        {flow === "auth" && (
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or with email <span className="h-px flex-1 bg-border" />
          </div>
        )}

        {flow === "auth" && (
          <div className="mb-4 flex gap-1 rounded-full border border-border bg-card p-1 text-sm">
            {(["sign_in", "sign_up"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 rounded-full py-2 font-medium data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                data-active={tab === t}
              >
                {t === "sign_in" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>
        )}

        {flow === "forgot" ? (
          <form onSubmit={sendReset} className="space-y-3">
            <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Please wait…" : "Send reset link"}
            </button>
            <button type="button" onClick={() => setFlow("auth")} className="w-full text-center text-xs text-muted-foreground hover:text-foreground">
              Back to sign in
            </button>
          </form>
        ) : flow === "reset" ? (
          <form onSubmit={applyNewPassword} className="space-y-3">
            <p className="text-sm text-muted-foreground">Choose a new password for your account.</p>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">New password</span>
              <span className="relative block">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  minLength={6}
                  required
                  className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 pr-11 text-sm outline-none ring-0 focus:border-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Please wait…" : "Update password"}
            </button>
          </form>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {tab === "sign_up" && (
              <Field label="Full name" value={name} onChange={setName} placeholder="Ama Boateng" />
            )}
            <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Password</span>
              <span className="relative block">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  required
                  minLength={6}
                  className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 pr-11 text-sm outline-none ring-0 focus:border-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>
            {tab === "sign_in" && (
              <button type="button" onClick={() => setFlow("forgot")} className="text-xs text-muted-foreground hover:text-foreground">
                Forgot password?
              </button>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Please wait…" : tab === "sign_in" ? "Sign in" : "Create account"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to BASIC's Terms and Privacy.
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, ...rest }: any) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none ring-0 focus:border-ring"
      />
    </label>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.8-6.8C35.7 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.3 17.7 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.2-3.2-.4-4.8H24v9.1h12.7c-.6 3-2.3 5.6-4.8 7.3l7.6 5.9c4.4-4 7-10 7-17.5z"/>
      <path fill="#FBBC05" d="M10.5 28.3c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8l-7.9-6.1C1 16.1 0 20 0 24s1 7.9 2.6 11.4l7.9-7.1z"/>
      <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.6-5.9c-2.1 1.4-4.8 2.3-7.7 2.3-6.3 0-11.6-3.8-13.5-9.2l-7.9 7.1C6.5 42.6 14.6 48 24 48z"/>
    </svg>
  );
}
