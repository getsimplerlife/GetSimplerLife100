import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { pageHead } from "~/lib/site-meta";
import { PortalIcon } from "~/components/PortalIcons";

export const Route = createFileRoute("/set-password")({
  head: () => pageHead("/set-password"),
  component: SetPassword,
});

/**
 * Set / reset password — P2-4. Unifies the auth experience with the P2-1
 * portal visual system (emerald-token dark theme, PortalIcons stroke glyphs,
 * ≥10px type). Portal-only restyle: the step machine (email → code → done),
 * validation, endpoints, and the honest no-enumeration copy are unchanged.
 */

const FIELD =
  "w-full pl-10 pr-4 py-3 rounded-xl border border-stone-800 bg-stone-900/60 " +
  "text-white placeholder-stone-500 focus:outline-none " +
  "focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 transition-all text-sm disabled:opacity-50";

function SetPassword() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPasswordState] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // step machine: "email" (request code) → "code" (enter code + new pw) → "done"
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [notice, setNotice] = useState<string | null>(null);

  // Step 1 — request a one-time code (proof of ownership). The server emails a
  // short-lived, single-use code to the account address. A generic success is
  // shown whether or not the account exists (no enumeration).
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "We could not send a reset code right now. Try again shortly.");
        return;
      }
      setNotice(
        "If an account exists for this email, a one-time reset code has been sent to it. " +
          "Enter the code below along with your new password. The code expires in 10 minutes."
      );
      setStep("code");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2 — exchange the verified code for a new password. Without a correct
  // code the server never changes the password.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!code.trim()) {
      setError("Enter the one-time code you received by email.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to reset password. Request a new code and try again.");
        return;
      }
      setStep("done");
    } catch (err: any) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  const goBackToEmail = () => {
    setError(null);
    setNotice(null);
    setCode("");
    setStep("email");
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden px-4 py-12 sm:px-6">
      {/* Subtle emerald glow behind the card — pure decoration, aria-hidden */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-72 w-[36rem] rounded-full bg-emerald-500/10 blur-3xl"
      />
      <div className="relative w-full max-w-md space-y-8 bg-stone-950 border border-stone-900 rounded-2xl p-8 sm:p-10 shadow-2xl shadow-black/60">
        <div>
          <h1 className="text-center text-2xl font-black tracking-tight text-white">
            Reset Your Password
          </h1>
          <p className="mt-2 text-center text-sm text-stone-400">
            {step === "done"
              ? "Your password has been reset. Sign in with your new password."
              : "Verify ownership of your account email to choose a new password."}
          </p>
        </div>

        {step === "done" ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            Your password was changed successfully. You can now sign in.
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={step === "email" ? handleSendCode : handleSubmit}>
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3"
              >
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 rounded-full bg-rose-400 shrink-0" />
                <p className="text-xs font-medium text-rose-300 leading-relaxed">{error}</p>
              </div>
            )}
            {notice && (
              <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs leading-relaxed text-emerald-300">
                {notice}
              </p>
            )}
            <div className="space-y-4">
              <div>
                <label htmlFor="email-address" className="block text-xs font-bold text-stone-300 mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <PortalIcon
                    name="mail"
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none"
                  />
                  <input
                    id="email-address"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    disabled={step !== "email"}
                    className={FIELD}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              {step === "code" && (
                <>
                  <div>
                    <label htmlFor="reset-code" className="block text-xs font-bold text-stone-300 mb-1.5">
                      One-time code
                    </label>
                    <div className="relative">
                      <PortalIcon
                        name="secure"
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none"
                      />
                      <input
                        id="reset-code"
                        name="code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                        className={FIELD}
                        placeholder="6-digit code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] text-stone-500">
                      The code is single-use and expires 10 minutes after it is sent.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="password" className="block text-xs font-bold text-stone-300 mb-1.5">
                      New Password
                    </label>
                    <div className="relative">
                      <PortalIcon
                        name="secure"
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none"
                      />
                      <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        required
                        className={FIELD}
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={(e) => setPasswordState(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="confirm-password" className="block text-xs font-bold text-stone-300 mb-1.5">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <PortalIcon
                        name="secure"
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none"
                      />
                      <input
                        id="confirm-password"
                        name="confirm-password"
                        type="password"
                        autoComplete="new-password"
                        required
                        className={FIELD}
                        placeholder="Re-enter your new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl bg-emerald-500 text-stone-950 text-sm font-bold hover:bg-emerald-400 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50 transition-all duration-200"
              >
                {loading
                  ? "Processing..."
                  : step === "email"
                  ? "Send Reset Code"
                  : "Reset Password"}
              </button>
            </div>
            {step === "code" && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={goBackToEmail}
                  className="text-xs font-semibold text-stone-400 hover:text-emerald-300 transition-colors"
                >
                  Didn't get a code? Restart
                </button>
              </div>
            )}
            <div className="text-center border-t border-stone-900 pt-4">
              <Link
                to="/login"
                className="text-xs font-semibold text-stone-400 hover:text-emerald-300 transition-colors"
              >
                Back to Sign In
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}