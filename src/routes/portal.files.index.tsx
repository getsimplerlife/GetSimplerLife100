import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Card, Badge, Button } from "~/components/ui";

export const Route = createFileRoute("/portal/files/")({
  component: FileLibrary,
});

/** Portal File Library — mirrors src/lib/client-files.ts ClientFile shape. */
export interface PortalFile {
  id: string;
  provider: string;
  workspace?: "google" | "microsoft";
  providerFileId: string;
  name: string;
  kind: "doc" | "sheet" | "slides" | "word" | "excel" | "ppt" | "file";
  url?: string;
  nativeUrl?: string;
  createdConnector?: string;
  embedUrl?: string;
  createdAt: number;
  updatedAt: number;
}

const KIND_META: Record<PortalFile["kind"], { label: string; icon: string }> = {
  doc: { label: "Google Doc", icon: "📝" },
  sheet: { label: "Google Sheet", icon: "📊" },
  slides: { label: "Google Slides", icon: "📽️" },
  word: { label: "Word", icon: "📄" },
  excel: { label: "Excel", icon: "📈" },
  ppt: { label: "PowerPoint", icon: "🖼️" },
  file: { label: "File", icon: "📁" },
};

const PROVIDER_LABEL: Record<string, string> = {
  "google-docs": "Google Docs",
  "google-sheets": "Google Sheets",
  "google-slides": "Google Slides",
  "google-drive": "Google Drive",
  "onedrive": "OneDrive",
  "microsoft-word": "Word",
  "microsoft-excel": "Excel",
  "microsoft-powerpoint": "PowerPoint",
};

function FileLibrary() {
  const [files, setFiles] = useState<PortalFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [previewFile, setPreviewFile] = useState<PortalFile | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  // Workspace preference (owner directive 2026-08-13): where AI employees
  // create data files — Google, Microsoft, or auto (route to what's connected).
  const [workspacePref, setWorkspacePref] = useState<"google" | "microsoft" | "auto">("auto");
  const [prefSaving, setPrefSaving] = useState(false);
  const showToast = useCallback((msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 4000);
  }, []);
  const loadPreference = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/settings");
      if (res.ok) {
        const json = await res.json();
        const p = json?.data?.workspacePreference;
        if (p === "google" || p === "microsoft" || p === "auto") setWorkspacePref(p);
      }
    } catch { /* preference is best-effort */ }
  }, []);
  useEffect(() => {
    void loadPreference();
  }, [loadPreference]);
  const savePreference = useCallback(async () => {
    setPrefSaving(true);
    try {
      const res = await fetch("/api/portal/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspacePreference: workspacePref }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        showToast(`File workspace preference saved: ${workspacePref === "auto" ? "Auto (pick connected workspace)" : workspacePref === "google" ? "Google Workspace" : "Microsoft 365"}`);
      } else {
        showToast(json?.error || "Could not save preference");
      }
    } catch (err) {
      console.error("Error saving preference:", err);
      showToast("Could not save preference");
    } finally {
      setPrefSaving(false);
    }
  }, [workspacePref, showToast]);

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/portal/files");
      if (res.ok) {
        const json = await res.json();
        setFiles(json.data || []);
      } else if (res.status === 401) {
        setError("Please log in to view your file library.");
      } else {
        setError("Failed to load your file library. Please try again.");
      }
    } catch (err) {
      console.error("Error loading files:", err);
      setError("Error loading file library.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const auditView = useCallback(async (file: PortalFile) => {
    try {
      await fetch("/api/portal/files/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id }),
      });
    } catch { /* audit is best-effort */ }
  }, []);

  const openPreview = useCallback((file: PortalFile) => {
    setPreviewFile(file);
    void auditView(file);
  }, [auditView]);

  const printFile = useCallback(() => {
    // Render the preview modal content in a print-friendly view and print.
    window.print();
  }, []);

  const downloadFile = useCallback(async (file: PortalFile) => {
    try {
      const res = await fetch(`/api/portal/files/download?fileId=${encodeURIComponent(file.id)}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name || "file";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast(`Downloading ${file.name}…`);
      } else {
        const json = await res.json().catch(() => null);
        showToast(json?.error || "Download failed");
      }
    } catch (err) {
      console.error("Download error:", err);
      showToast("Download failed");
    }
  }, [showToast]);

  const filtered = files.filter((f) => {
    const q = searchTerm.toLowerCase();
    return (
      !q ||
      f.name.toLowerCase().includes(q) ||
      (KIND_META[f.kind]?.label || "").toLowerCase().includes(q) ||
      (PROVIDER_LABEL[f.provider] || f.provider).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8 text-white animate-fade-in select-none">
      {/* Page header */}
      <div className="pb-6 border-b border-stone-850 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            📚 File Library
          </h1>
          <p className="text-stone-400 font-medium text-sm mt-1">
            Files your AI employees created for you — view, edit, print, or download them.
          </p>
        </div>
        {files.length > 0 && (
          <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider bg-stone-900 border border-stone-800 rounded-lg px-3 py-1.5">
            {files.length} file{files.length === 1 ? "" : "s"} ready
          </span>
        )}
      </div>
      {/* Workspace preference — owner directive 2026-08-13 */}
      <Card className="bg-stone-900/40 border border-stone-850 p-5 rounded-2xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-black flex items-center gap-1.5">🧭 Where should AI-created files go?</h3>
            <p className="text-stone-400 text-xs mt-1">
              Choose the workspace AI employees use when they create files for you. <span className="text-stone-300 font-semibold">Auto</span> uses the workspace you have connected — and when both Google and Microsoft are connected, it picks the least-loaded one.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(["google", "microsoft", "auto"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setWorkspacePref(p)}
                className={`text-[11px] font-bold rounded-lg px-3 py-1.5 border transition-colors ${
                  workspacePref === p
                    ? "bg-emerald-600/20 border-emerald-600 text-emerald-300"
                    : "bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-700"
                }`}
              >
                {p === "google" ? "Google" : p === "microsoft" ? "Microsoft" : "Auto"}
              </button>
            ))}
            <Button size="sm" onClick={savePreference} disabled={prefSaving}>
              {prefSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="bg-stone-900/40 border border-stone-850 p-6 rounded-2xl space-y-6">
        {/* Search */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div>
            <h3 className="text-sm font-black flex items-center gap-1.5">🗂️ Your Files</h3>
            <p className="text-stone-400 text-xs mt-1">
              Created by AI employees in your connected Google / Microsoft accounts
            </p>
          </div>
          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Search file name, type…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-stone-950 border border-stone-800 text-white rounded-xl placeholder-stone-600 focus:border-emerald-600 text-xs py-2 px-3 w-full outline-none"
            />
          </div>
        </div>

        {/* Loading */}
        {loading && files.length === 0 && (
          <div className="flex items-center justify-center min-h-[300px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-600 border-t-transparent mx-auto mb-4"></div>
              <p className="text-stone-400 font-bold">Loading your file library…</p>
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="text-center py-16 space-y-3">
            <span className="text-3xl block">⚠️</span>
            <h4 className="text-xs font-extrabold text-rose-400">{error}</h4>
            <Button onClick={fetchFiles} className="mx-auto">Retry</Button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <span className="text-4xl block">📂</span>
            <h4 className="text-xs font-extrabold text-stone-400">
              {files.length === 0 ? "No files yet" : "No matching files"}
            </h4>
            <p className="text-[10px] text-stone-400 max-w-sm mx-auto leading-relaxed font-semibold">
              {files.length === 0
                ? "When your AI employees create documents, spreadsheets, or presentations, they'll appear here ready to view, edit, print, or download."
                : "Try a different search term."}
            </p>
          </div>
        )}

        {/* File grid */}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((file) => {
              const kind = KIND_META[file.kind] || KIND_META.file;
              const providerLabel = PROVIDER_LABEL[file.provider] || file.provider;
              const editUrl = file.url || null;
              const embedUrl = file.embedUrl || null;
              return (
                <div key={file.id} className="bg-stone-950/40 border border-stone-850 rounded-2xl p-4 space-y-3 hover:border-stone-700 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl">{kind.icon}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-white truncate" title={file.name}>{file.name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="emerald">{kind.label}</Badge>
                          <span className={`text-[9px] font-mono font-bold rounded px-1.5 py-0.5 ${file.workspace === "microsoft" ? "bg-sky-900/40 text-sky-300" : "bg-emerald-900/40 text-emerald-300"}`}>
                            {file.workspace === "microsoft" ? "Microsoft" : "Google"}
                          </span>
                          <span className="text-[9px] font-mono text-stone-500">{providerLabel}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] font-mono text-stone-500 uppercase tracking-wider">
                    <span>Created {new Date(file.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-stone-900">
                    {embedUrl && (
                      <Button variant="outline" size="sm" onClick={() => openPreview(file)}>👁️ View</Button>
                    )}
                    {editUrl && (
                      <a
                        href={editUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-lg text-[11px] font-bold px-3 py-1.5 bg-stone-900 border border-stone-800 text-stone-300 hover:text-emerald-400 hover:border-emerald-800 transition-colors"
                        onClick={() => void auditView(file)}
                      >
                        ✏️ Edit
                      </a>
                    )}
                    {embedUrl && (
                      <Button variant="outline" size="sm" onClick={() => { setPreviewFile(file); setTimeout(() => printFile(), 300); }}>
                        🖨️ Print
                      </Button>
                    )}
                    <Button size="sm" onClick={() => downloadFile(file)}>⬇️ Download</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Preview modal (embed + print-friendly) */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setPreviewFile(null)}>
          <div
            className="bg-stone-950 border border-stone-900 rounded-3xl w-full max-w-5xl shadow-2xl flex flex-col print:shadow-none print:border-0 print:rounded-none print:max-w-none print:h-auto"
            style={{ height: "85vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-stone-900 px-6 py-4 print:hidden">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl">{(KIND_META[previewFile.kind] || KIND_META.file).icon}</span>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-white text-sm truncate">{previewFile.name}</h3>
                  <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wider">
                    {PROVIDER_LABEL[previewFile.provider] || previewFile.provider} · {previewFile.kind}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={printFile}
                  className="text-xs font-bold text-emerald-400 hover:text-emerald-300 hover:underline"
                >
                  🖨️ Print
                </button>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="text-stone-400 hover:text-white text-xs font-mono"
                >
                  CLOSE [X]
                </button>
              </div>
            </div>
            {previewFile.embedUrl ? (
              <iframe
                src={previewFile.embedUrl}
                title={previewFile.name}
                className="flex-1 w-full border-0"
                style={{ minHeight: "70vh" }}
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-stone-400 text-xs p-8">
                Preview not available for this file type — use Edit or Download.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {feedback && (
        <div className="fixed bottom-6 right-6 border border-emerald-500 bg-stone-900 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp select-none">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold font-mono uppercase tracking-wider">{feedback}</span>
        </div>
      )}

      <style>{`@media print { body * { visibility: hidden; } .print\\:hidden { display: none !important; } .fixed { position: static !important; } .fixed * { visibility: visible; } }`}</style>
    </div>
  );
}

export default FileLibrary;
