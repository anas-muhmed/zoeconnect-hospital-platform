"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, KeyRound, Building2, UserCircle, Loader2, Copy, Check, ArrowLeft, X,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { VENDOR_API_BASE } from "@/lib/auth-config";
import { useFieldAvailability } from "@/lib/hooks/use-field-availability";

type Step = "email" | "otp" | "details" | "success";

interface SignupResult {
  hospitalName: string;
  adminUsername: string;
  adminEmail: string;
  tempPassword: string;
  loginUrl: string | null;
  provisioningStatus: string;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${VENDOR_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.message ?? "Something went wrong. Please try again..";
    throw new Error(Array.isArray(message) ? message.join(" ") : message);
  }
  return data as T;
}

/**
 * Self-service cloud tenant sign-up — the public counterpart of the Vendor
 * Portal admin's "Provision Cloud Tenant" form (same four fields: Hospital
 * Name, Admin Username, Admin Email, Admin Full Name; same no-password,
 * one-time-temp-password model), gated by an email OTP step since there's
 * no admin session behind this one. Talks to the Vendor Portal backend's
 * Public Self-Service Signup API via the /vendor-api rewrite (see
 * next.config.mjs), never the main ZoeConnect backend.
 */
export function SignUpForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SignupResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Live "is this username taken?" feedback while typing (see
  // use-field-availability.ts doc comment for the full incident writeup).
  // Only enabled on the "details" step so a leftover value from a previous
  // visit to this step doesn't trigger a check while the user is still on
  // the email/otp steps.
  const { status: availability } = useFieldAvailability({
    values: { adminUsername },
    enabled: step === "details",
  });
  const usernameStatus = availability.adminUsername ?? "idle";
  const usernameTaken = usernameStatus === "taken";

  const requestOtp = async () => {
    if (!email.trim()) {
      setError("A valid email address is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await postJson("/public/signup/request-otp", { email: email.trim() });
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send a code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestOtp = (e: React.FormEvent) => {
    e.preventDefault();
    void requestOtp();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError("Enter the code from your email");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await postJson("/public/signup/verify-otp", { email: email.trim(), code: code.trim() });
      setStep("details");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect code.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospitalName.trim() || !adminUsername.trim()) {
      setError("Organization name and admin username are required");
      return;
    }
    if (usernameTaken) {
      setError("That admin username is already in use. Please choose a different one.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const data = await postJson<SignupResult>("/public/signup/register", {
        email: email.trim(),
        hospitalName: hospitalName.trim(),
        adminUsername: adminUsername.trim(),
        adminFullName: adminFullName.trim() || undefined,
      });
      setResult(data);
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't complete sign-up. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyPassword = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    // Plain CSS entrance (animate-rise) on the outer card rather than
    // framer-motion initial/animate — same presentation-only fix applied
    // elsewhere on the site. None of the form state, step logic, or the
    // signup API calls below were touched.
    <div className="glass-strong relative z-10 w-full max-w-md animate-rise rounded-3xl p-8 shadow-2xl shadow-black/10 sm:p-10">
      <div className="mb-8 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center">
          <Logo variant="icon" iconSize={48} />
        </span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {step === "success" ? "You're all set" : "Create your ZoeConnect workspace"}
        </h1>
        <p className="mt-2 text-sm text-foreground/60">
          {step === "email" && "Verify your email to get started."}
          {step === "otp" && `Enter the code we sent to ${email}.`}
          {step === "details" && "Tell us about your organization."}
          {step === "success" && "Your workspace has been provisioned."}
        </p>
      </div>

      {/* initial={false}: the first step ("email") shouldn't need
          hydration to become visible — only step-to-step transitions
          animate after that. */}
      <AnimatePresence mode="wait" initial={false}>
        {step === "email" && (
          <motion.form
            key="email"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.25 }}
            onSubmit={handleRequestOtp}
            noValidate
            className="space-y-5"
          >
            <div>
              <label htmlFor="signup-email" className="mb-2 block text-sm font-medium">
                Work Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
                <input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-border/60 bg-background/40 py-3 pl-10 pr-4 text-sm outline-none ring-accent/50 transition-shadow focus:ring-2"
                />
              </div>
            </div>

            {error && <ErrorBanner message={error} />}

            <SubmitButton submitting={submitting} label="Send Code" busyLabel="Sending…" />
          </motion.form>
        )}

        {step === "otp" && (
          <motion.form
            key="otp"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.25 }}
            onSubmit={handleVerifyOtp}
            noValidate
            className="space-y-5"
          >
            <div>
              <label htmlFor="signup-code" className="mb-2 block text-sm font-medium">
                Verification Code
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
                <input
                  id="signup-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full rounded-xl border border-border/60 bg-background/40 py-3 pl-10 pr-4 text-sm tracking-[0.3em] outline-none ring-accent/50 transition-shadow focus:ring-2"
                />
              </div>
            </div>

            {error && <ErrorBanner message={error} />}

            <SubmitButton submitting={submitting} label="Verify Code" busyLabel="Verifying…" />

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => { setStep("email"); setError(null); }}
                className="flex items-center gap-1 text-foreground/50 hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" /> Change email
              </button>
              <button
                type="button"
                onClick={() => void requestOtp()}
                className="font-medium text-accent hover:underline"
              >
                Resend code
              </button>
            </div>
          </motion.form>
        )}

        {step === "details" && (
          <motion.form
            key="details"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.25 }}
            onSubmit={handleRegister}
            noValidate
            className="space-y-5"
          >
            <div>
              <label htmlFor="signup-hospital" className="mb-2 block text-sm font-medium">
                Organization Name
              </label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
                <input
                  id="signup-hospital"
                  type="text"
                  value={hospitalName}
                  onChange={(e) => setHospitalName(e.target.value)}
                  className="w-full rounded-xl border border-border/60 bg-background/40 py-3 pl-10 pr-4 text-sm outline-none ring-accent/50 transition-shadow focus:ring-2"
                />
              </div>
            </div>

            <div>
              <label htmlFor="signup-username" className="mb-2 block text-sm font-medium">
                Admin Username
              </label>
              <div className="relative">
                <UserCircle className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
                <input
                  id="signup-username"
                  type="text"
                  autoComplete="username"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  aria-invalid={usernameTaken}
                  className="w-full rounded-xl border border-border/60 bg-background/40 py-3 pl-10 pr-9 text-sm outline-none ring-accent/50 transition-shadow focus:ring-2"
                />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">
                  {usernameStatus === "checking" && (
                    <Loader2 className="h-4 w-4 animate-spin text-foreground/40" />
                  )}
                  {usernameStatus === "available" && (
                    <Check className="h-4 w-4 text-emerald-500" />
                  )}
                  {usernameStatus === "taken" && (
                    <X className="h-4 w-4 text-red-400" />
                  )}
                </span>
              </div>
              <p className={`mt-1.5 text-xs ${usernameTaken ? "text-red-400" : "text-foreground/40"}`}>
                {usernameStatus === "available" && "Available"}
                {usernameStatus === "taken" && "Already in use — please choose a different username"}
                {(usernameStatus === "idle" || usernameStatus === "checking") &&
                  "Must be globally unique across every organization on the platform."}
              </p>
            </div>

            <div>
              <label htmlFor="signup-fullname" className="mb-2 block text-sm font-medium">
                Admin Full Name <span className="text-foreground/40">(optional)</span>
              </label>
              <div className="relative">
                <UserCircle className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
                <input
                  id="signup-fullname"
                  type="text"
                  autoComplete="name"
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                  className="w-full rounded-xl border border-border/60 bg-background/40 py-3 pl-10 pr-4 text-sm outline-none ring-accent/50 transition-shadow focus:ring-2"
                />
              </div>
            </div>

            {error && <ErrorBanner message={error} />}

            <SubmitButton submitting={submitting} label="Create Workspace" busyLabel="Provisioning…" />

            {/* Bug fix: this step had no way back to the email step at all --
                if registration failed because the email is already in use
                (a "details"-step error, since email isn't collected here),
                the user was stuck unable to fix it without reloading the
                whole page. Mirrors the "Change email" link already present
                on the otp step. Only the email/code are reset -- hospital
                name and admin username are left as typed so the user isn't
                forced to retype them after fixing the email. */}
            <button
              type="button"
              onClick={() => { setStep("email"); setCode(""); setError(null); }}
              className="flex items-center gap-1 text-xs text-foreground/50 hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Change email
            </button>
          </motion.form>
        )}

        {step === "success" && result && (
          <motion.div
            key="success"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-5"
          >
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-xs text-amber-500">
              This temporary password will <strong>not</strong> be shown again. Copy it now — you&apos;ll be required to change it on first login.
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-foreground/50">Admin Username</p>
              <p className="rounded-xl border border-border/60 bg-background/40 px-4 py-2.5 text-sm font-medium">{result.adminUsername}</p>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-foreground/50">Temporary Password</p>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/40 px-4 py-2.5 font-mono text-sm tracking-wide">
                {result.tempPassword}
                <button
                  type="button"
                  onClick={copyPassword}
                  aria-label="Copy password"
                  className="text-foreground/40 hover:text-foreground"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <a
              href="/sign-in"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-sm font-semibold text-background transition-transform hover:scale-[1.02]"
            >
              Continue to Sign In
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-xs text-red-400">
      {message}
    </div>
  );
}

function SubmitButton({ submitting, label, busyLabel }: { submitting: boolean; label: string; busyLabel: string }) {
  return (
    <button
      type="submit"
      disabled={submitting}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-sm font-semibold text-background transition-transform hover:scale-[1.02] disabled:opacity-70"
    >
      {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
      {submitting ? busyLabel : label}
    </button>
  );
}
