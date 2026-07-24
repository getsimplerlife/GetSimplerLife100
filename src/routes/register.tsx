import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/register")({
  component: Register,
});

function Register() {
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
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Registration failed");
      }
      navigate({ to: "/portal" });
    } catch (err: any) {
      const msg = err.message || "Registration failed";
      if (msg.includes("already exists")) {
        setError("Account already exists. If you purchased an audit, go to Set Password instead.");
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-stone-900 p-10 rounded-3xl shadow-xl border border-stone-800">
        <div>
          <div className="flex justify-center">
            <Link to="/" className="flex items-center space-x-2 group">
              <span className="text-2xl font-black text-emerald-400 group-hover:opacity-90 transition-opacity">
                Simpler Life 100
              </span>
            </Link>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white tracking-tight">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-stone-400">
            Or{" "}
            <Link
              to="/login"
              className="font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              sign in to your existing account
            </Link>
          </p>
        </div>
        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-2xl text-sm font-medium">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="email-address" className="block text-sm font-semibold text-stone-300 mb-1.5">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none block w-full px-4 py-3 bg-stone-800 border border-stone-700 placeholder-stone-500 text-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-sm"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-stone-300 mb-1.5">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className="appearance-none block w-full px-4 py-3 bg-stone-800 border border-stone-700 placeholder-stone-500 text-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-sm"
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
              className="w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-semibold rounded-2xl text-white bg-emerald-600 hover:bg-emerald-500 hover:shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50 transition-all duration-200"
            >
              {loading ? "Creating Account..." : "Create Account"}
            </button>
          </div>

          <div className="mt-4 pt-4 text-center border-t border-stone-800">
            <Link
              to="/set-password"
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Already purchased? Set your password here →
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
