"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { API_BASE } from "@/lib/auth-config";

/**
 * Matches the real ZoeConnect application's actual forgot-password flow: a
 * modal (not a separate page) asking for the same "Username or Email"
 * identifier plus an optional reason, submitted to /auth/forgot-password
 * for administrator review -- not an emailed reset link, which the real
 * product doesn't do. Always shows the same "submitted" success state
 * regardless of whether the account exists, same as the real app, to avoid
 * revealing which usernames/emails are valid.
 */
export function ForgotPasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [identifier, setIdentifier] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setIdentifier("");
      setReason("");
      setSubmitted(false);
    }, 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    setLoading(true);
    try {
      await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          username: identifier.trim(),
          reason: reason.trim() || undefined,
        }),
      });
    } catch {
      // Always show success -- prevents username enumeration, same as the
      // real app's own ForgotPasswordDialog.
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-strong relative w-full max-w-sm rounded-2xl p-6 shadow-2xl"
          >
            <button
              onClick={handleClose}
              aria-label="Close"
              className="absolute right-4 top-4 text-foreground/40 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            {submitted ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                <h2 className="font-display text-lg font-semibold">Request submitted</h2>
                <p className="max-w-xs text-sm text-foreground/60">
                  If the account exists, a password reset request has been submitted for administrator review.
                </p>
                <button
                  onClick={handleClose}
                  className="mt-4 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="pt-2">
                <h2 className="font-display text-lg font-semibold">Forgot Password</h2>
                <p className="mt-1.5 text-sm text-foreground/60">
                  Enter your username or email. A password reset request will be sent to your administrator for review.
                </p>

                <div className="mt-5 space-y-3">
                  <div>
                    <label htmlFor="fp-identifier" className="mb-1.5 block text-xs font-medium">
                      Username or Email
                    </label>
                    <input
                      id="fp-identifier"
                      type="text"
                      autoFocus
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="w-full rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-sm outline-none ring-accent/50 focus:ring-2"
                    />
                  </div>
                  <div>
                    <label htmlFor="fp-reason" className="mb-1.5 block text-xs font-medium">
                      Reason (optional)
                    </label>
                    <textarea
                      id="fp-reason"
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Forgot password, need access to submit reports"
                      className="w-full resize-none rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-sm outline-none ring-accent/50 focus:ring-2"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-foreground/60 hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !identifier.trim()}
                    className="flex items-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background disabled:opacity-60"
                  >
                    {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {loading ? "Submitting…" : "Submit Request"}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
