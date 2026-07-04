import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/documents/")({
  component: DocumentManagement,
});

function DocumentManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    fetch("/api/data/documents", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
      setDocs(d.data || []);
      setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAction = async (name: string, action: string) => {
    try {
      setFeedback(`Processing doc action: s${action}...`);
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "document_" + action.toLowerCase(), resource: name }),
      });
      setFeedback("Success: Action logged");
      setTimeout(() => setFeedback(""), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredDocs = docs.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-stone-200 pb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-stone-900 tracking-tight">📂 Document Management</h1>
          <p className="text-stone-500 mt-1">Upload and review files processed by AI OCR engines.</p>
        </div>
        <button
          onClick={() => handleAction("new_upload.pdf", "upload")}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 py-3 rounded-2xl"
        >
          📤 Upload Document
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-stone-200">
        <input
          type="text"
          placeholder="Search docs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        />
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-stone-50 text-stone-500 border-b border-stone-150 uppercase tracking-wider">
              <th className="p-4 font-bold">File Name</th>
              <th className="p-4 font-bold">Type</th>
              <th className="p-4 font-bold">Size</th>
              <th className="p-4 font-bold">Status</th>
              <th className="p-4 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
            {filteredDocs.map((doc, idx) => (
              <tr key={idx} className="hover:bg-stone-50/40">
                <td className="p-4 font-black text-stone-900">{doc.name}</td>
                <td className="p-4">{doc.type}</td>
                <td className="p-4">{doc.size}</td>
                <td className="p-4">{doc.status}</td>
                <td className="p-4 text-right">
                  <button onClick={() => handleAction(doc.name, "analyze")} className="text-emerald-600">Re-Analyze</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}

    </div>
  );
}