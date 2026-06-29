import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { getUser, getAudit } from "~/db/queries";

export const Route = createFileRoute("/portal/$auditId")({
  beforeLoad: async () => {
    const user = await getUser();
    if (!user) {
      throw redirect({ to: "/login" });
    }
    return { user };
  },
  loader: async ({ params }) => {
    const audit = await getAudit({ data: params.auditId });
    return { audit };
  },
  component: AuditDetail,
});

function AuditDetail() {
  const { audit } = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/portal" className="text-2xl font-bold text-indigo-600">
            Simpler Life 100
          </Link>
          <Link
            to="/portal"
            className="text-sm font-medium text-gray-600 hover:text-indigo-600"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="p-8 border-b bg-slate-50/50">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{audit.type}</h1>
                <p className="text-gray-600">Audit ID: {audit.id}</p>
              </div>
              <span
                className={`text-sm px-3 py-1 rounded-full font-bold uppercase ${
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
            <div className="grid grid-cols-2 gap-8 mt-6">
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Ordered On
                </div>
                <div className="text-gray-900">
                  {new Date(audit.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Last Updated
                </div>
                <div className="text-gray-900">
                  {new Date(audit.updatedAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>

          <div className="p-8">
            <h2 className="text-xl font-bold mb-4">Results & Deliverables</h2>
            
            {audit.status === "completed" ? (
              <div className="space-y-6">
                {audit.results && (
                  <div className="prose max-w-none text-gray-600 bg-gray-50 p-6 rounded-xl border">
                    {/* Assuming results is some text or JSON summary for now */}
                    <pre className="whitespace-pre-wrap font-sans">
                      {audit.results}
                    </pre>
                  </div>
                )}
                {audit.deliverableUrl && (
                  <a
                    href={audit.deliverableUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
                  >
                    <span>Download Full PDF Report</span>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </a>
                )}
              </div>
            ) : (
              <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed">
                <div className="text-3xl mb-4">⏳</div>
                <h3 className="text-lg font-bold mb-2">Audit in Progress</h3>
                <p className="text-gray-600 max-w-sm mx-auto">
                  Our team is currently analyzing your workflows. You'll receive an email once your results are ready.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
