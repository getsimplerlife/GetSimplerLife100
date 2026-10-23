import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { pageHead } from "~/lib/site-meta";
import { PortalIcon } from "~/components/PortalIcons";

export const Route = createFileRoute("/login")({
  head: () => pageHead("/login"),

  component: Login,
});

/**
 * Sign in — P2-4. Unifies the auth experience with the P2-1 portal visual
 * system (emerald-token dark theme, PortalIcons 24×24 stroke glyphs, ≥10px
 * type). Portal-only restyle: every form behavior, endpoint, and honest copy
 * line below is unchanged from the pre-P2-4 page.
 */

const FIELD =
  "w-full pl-10 pr-4 py-3 rounded-xl border border-stone-800 bg-stone-900/60 " +
  "text-white placeholder-stone-500 focus:outline-none " +
  "focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 transition-all text-sm";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Display server-side redirect error (e.g. /login?error=Invalid+credentials)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setError(err);
      // Clean URL without reloading
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }
      navigate({ to: "/portal" });
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
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
          <div className="flex justify-center">
            <Link to="/" className="flex items-center space-x-2 group">
              <span className="text-2xl font-black bg-gradient-to-r from-emerald-500 to-emerald-400 bg-clip-text text-transparent group-hover:opacity-90 transition-opacity">
                Simpler Life 100
              </span>
            </Link>
          </div>
          <h1 className="mt-6 text-center text-2xl font-black tracking-tight text-white">
            Welcome back
          </h1>
          <p className="mt-2 text-center text-sm text-stone-400">
            Or{" "}
            <Link
              to="/register"
              className="font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              create a new account
            </Link>
          </p>
        </div>
        <form className="mt-8 space-y-5" method="post" action="/login" onSubmit={handleSubmit}>
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3"
            >
              <span aria-hidden className="mt-1.5 h-1.5 w-1.5 rounded-full bg-rose-400 shrink-0" />
              <p className="text-xs font-medium text-rose-300 leading-relaxed">{error}</p>
            </div>
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
                  className={FIELD}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-bold text-stone-300 mb-1.5">
                Password
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
                  autoComplete="current-password"
                  required
                  className={FIELD}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl bg-emerald-500 text-stone-950 text-sm font-bold hover:bg-emerald-400 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50 transition-all duration-200"
            >
              {loading ? "Signing in..." : "Sign in to Portal"}
            </button>
          </div>

          <div className="space-y-3 pt-2 text-center border-t border-stone-900">
            <p className="text-xs text-stone-400">
              First time here?{" "}
              <Link
                to="/set-password"
                className="font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Set your password →
              </Link>
            </p>
            <p className="text-xs text-stone-400">
              Forgot your password?{" "}
              <Link
                to="/set-password"
                className="font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Reset here →
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}