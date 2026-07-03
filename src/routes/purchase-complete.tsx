import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/purchase-complete")({
  component: PurchaseComplete,
});

function PurchaseComplete() {
  // TanStack Router search params
  const search = useSearch({ from: "/purchase-complete" }) as any;
  const productParam = search.product || "deep-audit";

  const productMap: Record<string, { name: string, link: string }> = {
    "deep-audit": {
      name: "Deep-Dive AI Opportunity Audit",
      link: "https://buy.stripe.com/14A3cw2EKfRqcF0gEJ3Ru00"
    },
    "Deep-Dive AI Opportunity Audit": {
      name: "Deep-Dive AI Opportunity Audit",
      link: "https://buy.stripe.com/14A3cw2EKfRqcF0gEJ3Ru00"
    },
    "essential-ops": {
      name: "Essential Ops",
      link: "https://buy.stripe.com/28E4gAens20AfRcbkp3Ru04"
    },
    "Essential Ops": {
      name: "Essential Ops",
      link: "https://buy.stripe.com/28E4gAens20AfRcbkp3Ru04"
    },
    "professional-ops": {
      name: "Professional Ops",
      link: "https://buy.stripe.com/cNieVe7Z4ax6fRc0FL3Ru05"
    },
    "Professional Ops": {
      name: "Professional Ops",
      link: "https://buy.stripe.com/cNieVe7Z4ax6fRc0FL3Ru05"
    },
    "Additional AI Agent": {
      name: "Additional AI Agent",
      link: "https://buy.stripe.com/8x26oIensbBa0Wi4W13Ru07"
    },
    "CRM Integration": {
      name: "CRM Integration",
      link: "https://buy.stripe.com/8x2dRaa7cax66gC0FL3Ru08"
    },
    "ERP Integration": {
      name: "ERP Integration",
      link: "https://buy.stripe.com/aFa9AUa7c7kUawSdsx3Ru09"
    },
    "Voice AI Receptionist": {
      name: "Voice AI Receptionist",
      link: "https://buy.stripe.com/dRmeVedjo5cM34qewB3Ru0a"
    },
    "AI Sales Assistant": {
      name: "AI Sales Assistant",
      link: "https://buy.stripe.com/28EcN61AGax6bAW3RX3Ru0b"
    },
    "AI Customer Support Agent": {
      name: "AI Customer Support Agent",
      link: "https://buy.stripe.com/fZu3cw3IO20AeN8ewB3Ru0c"
    },
    "Custom Dashboard": {
      name: "Custom Dashboard",
      link: "https://buy.stripe.com/5kQ7sM3IO20AgVgewB3Ru0d"
    },
    "Document AI System": {
      name: "Document AI System",
      link: "https://buy.stripe.com/7sY5kEa7cdJi7kG9ch3Ru0e"
    },
    "Employee Training": {
      name: "Employee Training",
      link: "https://buy.stripe.com/3cI00k0wC0Ww8oKbkp3Ru0g"
    },
    "Additional Dept. Automation": {
      name: "Additional Dept. Automation",
      link: "https://buy.stripe.com/cNi00ka7ceNmdJ49ch3Ru0h"
    },
  };

  const productInfo = productMap[productParam] || productMap["deep-audit"];
  const productName = productInfo.name;
  const stripeLink = productInfo.link;
  
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/claim-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, product: productName }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        if (res.status === 409) {
          setError(data.error);
        } else {
          throw new Error(data.error || "Failed to claim purchase");
        }
        return;
      }

      // Success! Redirect to set-password
      navigate({ 
        to: "/set-password", 
        // Pass email as a search param to pre-fill the form
        search: (prev: any) => ({ ...prev, email }) 
      });
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white p-8 sm:p-12 rounded-3xl shadow-sm border border-slate-200">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-6">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-4xl font-black text-slate-900 mb-4">Start Your {productName}</h1>
            <p className="text-xl text-slate-600">Secure checkout and automated account setup.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-900">What happens next?</h2>
              <ul className="space-y-4">
                <li className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">1</div>
                  <p className="text-slate-600">
                    <span className="font-bold text-slate-900">Claim your purchase:</span> Enter your email address to link the purchase to your account.
                  </p>
                </li>
                <li className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">2</div>
                  <p className="text-slate-600">
                    <span className="font-bold text-slate-900">Set your password:</span> You'll choose a password for your portal access.
                  </p>
                </li>
                <li className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">3</div>
                  <p className="text-slate-600">
                    <span className="font-bold text-slate-900">Access your audit:</span> Log in to see your audit progress and results in real-time.
                  </p>
                </li>
              </ul>
            </div>

            <div className="bg-slate-50 p-6 sm:p-8 rounded-2xl border border-slate-100 shadow-inner">
              {/* Added Buy Now Section */}
              <div className="mb-10 pb-10 border-b border-slate-200 text-center">
                <h2 className="text-xl font-bold text-slate-900 mb-4">Step 0: Purchase</h2>
                <p className="text-sm text-slate-500 mb-6">If you haven't bought your {productName} yet, do that first.</p>
                <a
                  href={stripeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-4 px-6 rounded-xl transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                >
                  Purchase Audit →
                </a>
              </div>

              <h2 className="text-xl font-bold text-slate-900 mb-6 text-center">Step 1: Claim your Audit</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm leading-relaxed">
                    {error}
                  </div>
                )}
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-1 ml-1">
                    Your Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    placeholder="you@company.com"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 active:scale-[0.98]"
                >
                  {loading ? "Linking Account..." : "Start My Audit →"}
                </button>
                <p className="text-[10px] text-center text-slate-400 mt-4 px-4 uppercase tracking-wider font-semibold">
                  Use the same email you used for the purchase.
                </p>
              </form>
            </div>
          </div>
          
          <div className="mt-12 pt-8 border-t border-slate-100 text-center">
            <p className="text-slate-500 text-sm">
              Having trouble? Contact us at <a href="mailto:support@simplerlife100.com" className="text-indigo-600 font-semibold">support@simplerlife100.com</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
