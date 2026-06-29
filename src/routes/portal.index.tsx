import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { getUser, getAudits, logout } from "~/db/queries";

export const Route = createFileRoute("/portal/")({
  beforeLoad: async () => {
    const user = await getUser();
    if (!user) {
      throw redirect({ to: "/login" });
    }
    return { user };
  },
  loader: async () => {
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
    await logout();
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
          <div className="bg-white p-12 rounded-2xl border text-center">
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
          <div className="grid gap-6">
            {audits.map((audit) => (
              <Link
                key={audit.id}
                to="/portal/$auditId"
                params={{ auditId: audit.id }}
                className="bg-white p-6 rounded-2xl border hover:shadow-md transition-shadow flex justify-between items-center"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-lg text-gray-900">
                      {audit.type}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
                        audit.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : audit.status === "in-progress"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
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
      </main>
    </div>
  );
}
