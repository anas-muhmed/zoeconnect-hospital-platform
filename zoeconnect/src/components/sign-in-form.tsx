"use client";

import { useState } from "react";
import Image from "next/image";

import { Eye, EyeOff, Lock, User, Loader2 } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { API_BASE, APP_URL, localizeIsoTimestamps } from "@/lib/auth-config";
import { ForgotPasswordDialog } from "@/components/forgot-password-dialog";

/**
 * Real authentication against the ZoeConnect application — the same
 * "Username or Email" + Password identifier flow as the app's own /login
 * page (no organization/subdomain step, no SSO, no MFA, none of which
 * exist in the real product). On success this redirects into the real
 * app's dashboard, handing off the access token via the `ssoToken` URL
 * param the app's AuthProvider already knows how to consume (the same
 * mechanism used for HIS auto-login), plus a `loginOrigin=website` marker
 * so the app knows to send the user back here — not to its own /login —
 * when they eventually sign out. That marker is only honored in cloud
 * deployments; self-hosted instances always use their own /login on
 * logout, unchanged.
 */
export function SignInForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!identifier.trim()) nextErrors.identifier = "Username or email is required";
    if (!password.trim()) nextErrors.password = "Password is required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), username: identifier.trim(), password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const message = data?.message ?? "Incorrect username or password.";
        setServerError(localizeIsoTimestamps(Array.isArray(message) ? message.join(" ") : message));
        return;
      }

      const accessToken: string | undefined = data?.accessToken;
      if (!accessToken) {
        setServerError("Sign-in succeeded but no session token was returned. Please try again.");
        return;
      }

      const redirectUrl = new URL("/dashboard", APP_URL);
      redirectUrl.searchParams.set("ssoToken", accessToken);
      redirectUrl.searchParams.set("loginOrigin", "website");
      window.location.href = redirectUrl.toString();
    } catch {
      setServerError("Couldn't reach the ZoeConnect application. Please try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // Plain CSS entrance (animate-rise) rather than framer-motion
    // initial/animate: purely a presentation change, same fix applied
    // site-wide — a JS-driven opacity:0 start can sit invisible on a slow
    // hydration until something re-renders. No form state, submit handler,
    // or auth request logic below this line was touched.
    <div className="glass-strong relative z-10 w-full max-w-md animate-rise rounded-3xl p-8 shadow-2xl shadow-black/10 sm:p-10">
      <div className="mb-8 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center">
          <Logo variant="icon" iconSize={48} />
        </span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Sign in to ZoeConnect
        </h1>
        <p className="mt-2 text-sm text-foreground/60">
          Enter your credentials to access the platform.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label htmlFor="identifier" className="mb-2 block text-sm font-medium">
            Username or Email
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-background/40 py-3 pl-10 pr-4 text-sm outline-none ring-accent/50 transition-shadow focus:ring-2"
            />
          </div>
          {errors.identifier && <p className="mt-1.5 text-xs text-red-400">{errors.identifier}</p>}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="text-xs font-medium text-accent hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-background/40 py-3 pl-10 pr-10 text-sm outline-none ring-accent/50 transition-shadow focus:ring-2"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="mt-1.5 text-xs text-red-400">{errors.password}</p>}
        </div>

        {serverError && (
          <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-xs text-red-400">
            {serverError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-sm font-semibold text-background transition-transform hover:scale-[1.02] disabled:opacity-70"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <div className="mt-8 flex flex-col items-center gap-1.5 border-t border-border/60 pt-6">
        <div className="flex items-center gap-2">
          <Image
            src="/brand/camerin-logo-icon.png"
            alt="Camerin Innovate"
            width={28}
            height={28}
            className="h-6 w-6 opacity-90"
          />
          <p className="text-xs text-foreground/40">Powered by Camerin Innovate</p>
        </div>
      </div>

      <ForgotPasswordDialog open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </div>
  );
}
