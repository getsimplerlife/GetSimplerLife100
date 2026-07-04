import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 via-stone-100/50 to-emerald-50/20 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-3xl shadow-xl shadow-stone-100/50 border border-stone-100/80">
        <div>
          <div className="flex justify-center">
            <Link to="/" className="flex items-center space-x-2 group">
              <span className="text-2xl font-black bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent group-hover:opacity-90 transition-opacity">
                Simpler Life 100
              </span>
            </Link>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-stone-900 tracking-tight">
            Welcome back
          </h2>
          <p className="mt-2 text-center text-sm text-stone-600">
            Or{" "}
            <Link
              to="/register"
              className="font-semibold text-emerald-600 hover:text-emerald-500 transition-colors"
            >
              create a new account
            </Link>
          </p>
        </div>
        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200/60 text-red-700 px-4 py-3 rounded-2xl text-sm font-medium animate-shake">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="email-address" className="block text-sm font-semibold text-stone-700 mb-1.5">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none block w-full px-4 py-3 border border-stone-200 placeholder-stone-400 text-stone-900 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-100/80 focus:border-emerald-500 transition-all text-sm"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-stone-700 mb-1.5">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none block w-full px-4 py-3 border border-stone-200 placeholder-stone-400 text-stone-900 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-100/80 focus:border-emerald-500 transition-all text-sm"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-semibold rounded-2xl text-white bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/10 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:opacity-50 transition-all duration-200"
            >
              {loading ? "Signing in..." : "Sign in to Portal"}
            </button>
          </div>

          <div className="space-y-3 pt-2 text-center border-t border-stone-100">
            <p className="text-xs text-stone-500">
              First time here?{" "}
              <Link
                to="/set-password"
                className="font-semibold text-emerald-600 hover:text-emerald-500 transition-colors"
              >
                Set your password →
              </Link>
            </p>
            <p className="text-xs text-stone-500">
              Forgot your password?{" "}
              <Link
                to="/set-password"
                className="font-semibold text-emerald-600 hover:text-emerald-500 transition-colors"
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
