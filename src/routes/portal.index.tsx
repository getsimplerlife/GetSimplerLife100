import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";

const addOns = [
  { name: "Additional AI Agent", price: "$1,500" },
  { name: "CRM Integration", price: "$2,000" },
  { name: "ERP Integration", price: "$3,500" },
  { name: "Voice AI Receptionist", price: "$3,000" },
  { name: "AI Sales Assistant", price: "$4,000" },
  { name: "AI Customer Support Agent", price: "$4,000" },
  { name: "Custom Dashboard", price: "$2,500" },
  { name: "Document AI System", price: "$3,500" },
  { name: "Employee Training", price: "$1,500" },
  { name: "Additional Dept. Automation", price: "$5,000" },
];

export const Route = createFileRoute("/portal/")({
  component: Portal,
});

function Portal() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [audits, setAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch("/api/me");
        if (!meRes.ok) { navigate({ to: "/login" as any }); return; }
        const me = await meRes.json();
        setUser(me);
        const auditsRes = await fetch("/api/audits");
        if (auditsRes.ok) setAudits(await auditsRes.json());
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, []);

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    navigate({ to: "/" });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🔄</div>
          <p className="text-gray-600">Loading your portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-bold text-indigo-600">
            Simpler Life 100
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user.email}</span>
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-gray-600 hover:text-indigo-600"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Your Audits</h1>
            <p className="text-gray-600">Track the progress of your efficiency audits.</p>
          </div>
          <Link
            to="/portal/agents"
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2"
          >
            🤖 AI Agents Dashboard
          </Link>
        </div>

        {audits.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border text-center mb-12">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-lg font-bold mb-2">No audits found</h3>
            <p className="text-gray-600 mb-6">
              You haven't purchased any audits yet or they haven't been linked to your account.
            </p>
            <Link
              to={"/#services" as any}
              className="inline-block bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold"
            >
              Browse Services
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 mb-12">
            {audits.map((audit) => (
              <Link
                key={audit.id}
                to="/portal/$auditId"
                params={{ auditId: audit.id }}
                className="bg-white p-6 rounded-2xl border hover:shadow-md transition-shadow flex justify-between items-center"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-lg text-gray-900">{audit.type}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
                      audit.status === "completed" ? "bg-green-100 text-green-700" :
                      audit.status === "implemented" ? "bg-indigo-100 text-indigo-700" :
                      audit.status === "in-progress" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {audit.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    Started on {new Date(audit.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-indigo-600 font-bold">View Details →</div>
              </Link>
            ))}
          </div>
        )}

        {/* Add-ons Section */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="p-8 border-b bg-slate-50/50">
            <h2 className="text-2xl font-bold text-gray-900">Need More? Add to Your Implementation</h2>
            <p className="text-gray-600 mt-1">Expand your AI automation with additional capabilities.</p>
          </div>
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {addOns.map((item) => (
                <Link
                  key={item.name}
                  to="/purchase-complete"
                  search={{ product: item.name } as any}
                  className="flex justify-between items-center p-5 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-white transition-all group"
                >
                  <span className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{item.name}</span>
                  <span className="text-indigo-600 font-black text-lg">{item.price}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}