import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";

const addOns = [
  { name: "Additional AI Agent", price: "$1,500", link: "https://buy.stripe.com/8x26oIensbBa0Wi4W13Ru07" },
  { name: "CRM Integration", price: "$2,000", link: "https://buy.stripe.com/8x2dRaa7cax66gC0FL3Ru08" },
  { name: "ERP Integration", price: "$3,500", link: "https://buy.stripe.com/aFa9AUa7c7kUawSdsx3Ru09" },
  { name: "Voice AI Receptionist", price: "$3,000", link: "https://buy.stripe.com/dRmeVedjo5cM34qewB3Ru0a" },
  { name: "AI Sales Assistant", price: "$4,000", link: "https://buy.stripe.com/28EcN61AGax6bAW3RX3Ru0b" },
  { name: "AI Customer Support Agent", price: "$4,000", link: "https://buy.stripe.com/fZu3cw3IO20AeN8ewB3Ru0c" },
  { name: "Custom Dashboard", price: "$2,500", link: "https://buy.stripe.com/5kQ7sM3IO20AgVgewB3Ru0d" },
  { name: "Document AI System", price: "$3,500", link: "https://buy.stripe.com/7sY5kEa7cdJi7kG9ch3Ru0e" },
  { name: "Employee Training", price: "$1,500", link: "https://buy.stripe.com/3cI00k0wC0Ww8oKbkp3Ru0g" },
  { name: "Additional Dept. Automation", price: "$5,000", link: "https://buy.stripe.com/cNi00ka7ceNmdJ49ch3Ru0h" },
];

export const Route = createFileRoute("/portal/")({
  beforeLoad: async () => {
    const res = await fetch("/api/me");
    if (!res.ok) {
      throw redirect({ to: "/login" });
    }
    const user = await res.json();
    return { user };
  },
  loader: async () => {
    // Fetch audits via the TanStack server function (this works since it's SSR)
    const { getAudits } = await import("~/db/queries");
    const audits = await getAudits();
    return { audits };
  },
  component: Portal,
});

function Portal() {
  const { user } = Route.useRouteContext();
  const { audits } = Route.useLoaderData();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    navigate({ to: "/" });
  };

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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Your Audits</h1>
          <p className="text-gray-600">Track the progress of your efficiency audits.</p>
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
                <a
                  key={item.name}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex justify-between items-center p-5 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-white transition-all group"
                >
                  <span className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{item.name}</span>
                  <span className="text-indigo-600 font-black text-lg">{item.price}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}