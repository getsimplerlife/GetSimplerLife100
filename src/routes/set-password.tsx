import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { pageHead } from "~/lib/site-meta";
export const Route = createFileRoute("/set-password")({
  head: () => pageHead("/set-password"),
  component: SetPassword,
});
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Reset Your Password
          </h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            {step === "done"
              ? "Your password has been reset. Sign in with your new password."
              : "Verify ownership of your account email to choose a new password."}
          </p>
        </div>

        {step === "done" ? (
          <div className="mt-8 rounded-md bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-700">
            Your password was changed successfully. You can now sign in.
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={step === "email" ? handleSendCode : handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            {notice && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">
                {notice}
              </div>
            )}
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="email-address" className="sr-only">Email address</label>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={step !== "email"}
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 focus:z-10 sm:text-sm disabled:bg-gray-100"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {step === "code" && (
                <>
                  <div>
                    <label htmlFor="reset-code" className="sr-only">One-time code</label>
                    <input
                      id="reset-code"
                      name="code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 focus:z-10 sm:text-sm"
                      placeholder="One-time code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className="sr-only">New Password</label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 focus:z-10 sm:text-sm"
                      placeholder="New Password"
                      value={password}
                      onChange={(e) => setPasswordState(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="confirm-password" className="sr-only">Confirm Password</label>
                    <input
                      id="confirm-password"
                      name="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 focus:z-10 sm:text-sm"
                      placeholder="Confirm Password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50"
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
                  className="text-sm text-gray-600 hover:text-emerald-500"
                >
                  Didn't get a code? Restart
                </button>
              </div>
            )}
            <div className="text-center">
              <Link to="/login" className="text-sm text-gray-600 hover:text-emerald-500">
                Back to Sign In
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
