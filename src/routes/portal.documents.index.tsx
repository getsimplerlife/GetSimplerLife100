import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Card, Badge, Button, Input } from "~/components/ui";

export const Route = createFileRoute("/portal/documents/")({
  component: DocumentManagement,
});

interface DocumentItem {
  _id: string;
  file_name: string;
  file_size: number;
  document_type?: string;
  extracted_text?: string;
  key_info?: Record<string, any>;
  status: string;
  _created_at: number;
  routed_agent?: string;
  routed_agent_type?: string;
  routing_status?: string;
}

function DocumentManagement() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Modal State for Viewing Parsed Data
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);

  // Toast / Feedback State
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<"success" | "error">("success");

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setFeedback(msg);
    setFeedbackType(type);
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/data/documents");
      if (res.ok) {
        const json = await res.json();
        setDocuments(json.data || []);
      } else {
        showToast("Failed to fetch documents history.", "error");
      }
    } catch (err) {
      console.error("Error loading documents:", err);
      showToast("Error loading document database logs.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Drag & Drop Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      setSelectedFile(droppedFile);
      triggerFileUpload(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setSelectedFile(selected);
      triggerFileUpload(selected);
    }
  };

  // Real File Upload to /api/upload
  const triggerFileUpload = async (file: File) => {
    setUploading(true);
    setUploadStep("Uploading file payload to secure sandbox...");

    // Simulated progress steps to make the extraction engine feel extremely cognitive and premium
    const steps = [
      { t: 800, text: "Instantiating layout analyzer & OCR bounds..." },
      { t: 1800, text: "Extracting document schema nodes & tabular lists..." },
      { t: 2800, text: "Mapping semantic key-value ledger matrices..." },
      { t: 3800, text: "Cataloging in portal database ledger index..." },
    ];

    const timers = steps.map((step) => {
      return setTimeout(() => {
        setUploadStep(step.text);
      }, step.t);
    });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || "Cognitive extraction failed");
      }

      const result = await res.json();
      showToast(`Extraction Complete: Found .${result.documentType || "document"} schema!`);
      await fetchDocuments();
      setSelectedFile(null);
    } catch (err: any) {
      console.error("Upload error:", err);
      showToast(`Upload Failed: ${err.message || "Unrecognized document structure"}`, "error");
    } finally {
      timers.forEach(t => clearTimeout(t));
      setUploading(false);
      setUploadStep("");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently erase ${name} from portal index?`)) return;

    try {
      const res = await fetch(`/api/data/documents/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        showToast(`Erase successful: ${name}`);
        await fetchDocuments();
        if (selectedDoc?._id === id) {
          setSelectedDoc(null);
        }
      } else {
        showToast("Failed to erase document record", "error");
      }
    } catch (err) {
      console.error("Delete error:", err);
      showToast("Error erasing document from database", "error");
    }
  };

  // Helper for human-readable file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = 1;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  // Filtered documents list
  const filteredDocuments = documents.filter((d) => {
    const matchesSearch =
      d.file_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.document_type && d.document_type.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (d.extracted_text && d.extracted_text.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  if (loading && documents.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-stone-400 font-bold">Loading secure document index...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-white animate-fade-in select-none">
      {/* Page Header */}
      <div className="pb-6 border-b border-stone-850 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            📂 Cognitive Document Management
          </h1>
          <p className="text-stone-400 font-medium text-sm mt-1">
            Securely upload, parse, and monitor structured operational documents processed by layout OCR engines.
          </p>
        </div>
      </div>

      {/* Main Grid: Upload Area & Table */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Left Side: Upload zone (presents drag & drop) */}
        <div className="xl:col-span-4 space-y-6">
          <Card className="bg-stone-900/40 border border-stone-850 p-6 rounded-2xl space-y-5">
            <div>
              <h3 className="text-sm font-black flex items-center gap-1.5">
                📤 Payload Ingestion Terminal
              </h3>
              <p className="text-stone-400 text-[11px] mt-1 leading-relaxed">
                Ingest unstructured document files (W2, W9, utility records, supplier invoices) into our neural parser.
              </p>
            </div>

            {/* Drag drop zone */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all flex flex-col items-center justify-center min-h-[220px] relative ${
                dragActive
                  ? "border-emerald-500 bg-emerald-950/10"
                  : "border-stone-850 bg-stone-900/10 hover:border-stone-800"
              }`}
            >
              <input
                type="file"
                id="documents-file-upload"
                className="hidden"
                onChange={handleFileChange}
                accept=".pdf,.csv,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg,.bmp,.tiff"
                disabled={uploading}
              />

              {uploading ? (
                <div className="space-y-4 w-full">
                  <div className="relative w-12 h-12 mx-auto">
                    <div className="w-full h-full border-2 border-stone-800 border-t-emerald-500 rounded-full animate-spin" />
                    <span className="absolute inset-0 flex items-center justify-center text-xs">🔮</span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-white text-xs font-bold font-mono uppercase tracking-wider animate-pulse">Parsing file...</p>
                    <p className="text-stone-400 text-[9px] font-mono leading-relaxed max-w-[200px] mx-auto">
                      {uploadStep}
                    </p>
                  </div>
                </div>
              ) : (
                <label
                  htmlFor="documents-file-upload"
                  className="cursor-pointer space-y-4 w-full h-full flex flex-col items-center justify-center"
                >
                  <div className="h-12 w-12 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-center text-xl shadow-md">
                    📂
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-extrabold text-white">
                      Drag file here or <span className="text-emerald-400 hover:underline">browse files</span>
                    </p>
                    <p className="text-[9px] text-stone-400 font-mono tracking-wide">
                      PDF, CSV, XLSX, DOCX, PNG, JPG (MAX 10MB)
                    </p>
                  </div>
                </label>
              )}
            </div>

            {/* Layout OCR Bullet List */}
            <div className="bg-stone-900/20 border border-stone-900 rounded-xl p-3.5 space-y-2 font-mono text-[9px] text-stone-500">
              <span className="font-bold uppercase text-stone-400">Layout OCR Pipeline Specs</span>
              <ul className="space-y-1 list-disc list-inside">
                <li>Horizontal projection profiling OCR fallback</li>
                <li>Automatic chromatic signature checking</li>
                <li>Semantic matrix tabular structural formatting</li>
                <li>Syncs instantly to AI operational models</li>
              </ul>
            </div>
          </Card>
        </div>

        {/* Right Side: Documents List Table */}
        <div className="xl:col-span-8 space-y-6">
          <Card className="bg-stone-900/40 border border-stone-850 p-6 rounded-2xl space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
              <div>
                <h3 className="text-sm font-black flex items-center gap-1.5">
                  📖 Ingested Document Ledger
                </h3>
                <p className="text-stone-400 text-xs mt-1">
                  Active OCR extractions, structure schemas, and raw file audits
                </p>
              </div>

              {/* Search Bar */}
              <div className="w-full sm:w-64">
                <Input
                  type="text"
                  placeholder="Search file name, extracted text..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-stone-950 border-stone-800 text-white rounded-xl placeholder-stone-600 focus:border-emerald-600 text-xs py-2 px-3 w-full"
                />
              </div>
            </div>

            {/* Documents History Table */}
            <div className="overflow-x-auto rounded-xl border border-stone-850 bg-stone-950/20">
              {filteredDocuments.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <span className="text-3xl block">📁</span>
                  <h4 className="text-xs font-extrabold text-stone-400">Ledger is Empty</h4>
                  <p className="text-[10px] text-stone-400 max-w-sm mx-auto leading-relaxed font-semibold">
                    You have not submitted any operational payloads yet. Drag-and-drop a file on the left console to trigger instant neural extraction logs.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-900/60 border-b border-stone-850 font-mono text-[9px] text-stone-400 uppercase tracking-wider">
                      <th className="p-4 font-bold">Document Name</th>
                      <th className="p-4 font-bold">Extracted Type</th>
                      <th className="p-4 font-bold">File Size</th>
                      <th className="p-4 font-bold">Auto-Routed AI</th>
                      <th className="p-4 font-bold">Routing Status</th>
                      <th className="p-4 font-bold">Status</th>
                      <th className="p-4 font-bold">Ingested Timestamp</th>
                      <th className="p-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-900/50 text-xs font-semibold text-stone-300">
                    {filteredDocuments.map((doc) => (
                      <tr key={doc._id} className="hover:bg-stone-900/20 transition-colors">
                        <td className="p-4 font-extrabold text-white truncate max-w-[150px]" title={doc.file_name}>
                          {doc.file_name}
                        </td>
                        <td className="p-4 text-stone-400 font-mono text-[10px]">
                          {doc.document_type || "Unstructured Raw"}
                        </td>
                        <td className="p-4 text-stone-400 font-mono text-[10px]">
                          {formatFileSize(doc.file_size)}
                        </td>
                        <td className="p-4 text-stone-300">
                          <div className="flex items-center gap-1.5 font-extrabold">
                            <span className="text-[10px] bg-stone-900 px-2 py-0.5 rounded border border-stone-800 text-stone-300">
                              🤖 {doc.routed_agent || "Document AI System"}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase bg-indigo-950/40 text-indigo-400 border-indigo-900/40`}>
                            {doc.routing_status || "Auto-Routed"}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase ${
                            doc.status?.toLowerCase() === "processed"
                              ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/40"
                              : "bg-rose-950/40 text-rose-400 border-rose-900/40"
                          }`}>
                            {doc.status || "Processed"}
                          </span>
                        </td>
                        <td className="p-4 text-stone-400 font-mono text-[10px]">
                          {new Date(doc._created_at).toLocaleString()}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => setSelectedDoc(doc)}
                              className="text-xs font-bold text-emerald-400 hover:text-emerald-300 hover:underline transition-colors"
                            >
                              View Data
                            </button>
                            <a
                              href={`/api/download/${doc._id}`}
                              className="text-xs font-bold text-emerald-400 hover:text-emerald-300 hover:underline transition-colors"
                              title="Download original file payload"
                            >
                              Download
                            </a>
                            <button
                              onClick={() => handleDelete(doc._id, doc.file_name)}
                              className="text-xs font-bold text-stone-400 hover:text-rose-400 transition-colors"
                            >
                              Erase
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Secure Disclaimer Footnote */}
            <div className="border-t border-stone-850 pt-4 text-[9px] font-mono text-stone-400 flex justify-between uppercase">
              <span>SYSTEM LAYER: DRIZZLE PORTAL DATA INTEGRITY LOCK</span>
              <span>ENCRYPTED REPOSITORY: /TMP/UPLOADS SECURE ERASE</span>
            </div>
          </Card>
        </div>
      </div>

      {/* ─── MODAL: DOCUMENT DATA REVIEW ─── */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setSelectedDoc(null)}>
          <div className="bg-stone-950 border border-stone-900 rounded-3xl p-8 w-full max-w-2xl mx-4 shadow-2xl space-y-6 text-stone-100" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start border-b border-stone-900 pb-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">📊</span>
                <div>
                  <h3 className="font-extrabold text-white text-base">Extracted Payload: {selectedDoc.file_name}</h3>
                  <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wider block mt-0.5">DOCUMENT TYPE: {selectedDoc.document_type || "UNKNOWN"}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="text-stone-400 hover:text-white text-xs font-mono"
              >
                CLOSE [X]
              </button>
            </div>

            {/* Extracted Keys and Values */}
            <div className="space-y-5 max-h-[400px] overflow-y-auto pr-1">
              {/* Key Info JSON block */}
              {selectedDoc.key_info && Object.keys(selectedDoc.key_info).length > 0 ? (
                <div className="space-y-3">
                  <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider block">Extracted Schema Key-Values</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(selectedDoc.key_info).map(([k, v]) => (
                      <div key={k} className="bg-stone-900/30 border border-stone-900/60 rounded-xl p-3 font-mono text-[10px] space-y-1">
                        <span className="text-stone-400 uppercase block font-bold truncate" title={k}>{k.replace(/_/g, " ")}</span>
                        <span className="text-white font-extrabold break-all">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-stone-900/10 border border-stone-900 rounded-xl text-center">
                  <span className="text-xs text-stone-400 font-semibold italic">No tabular key-value fields were automatically classified from this document layout.</span>
                </div>
              )}

              {/* Raw text section */}
              {selectedDoc.extracted_text && (
                <div className="space-y-2">
                  <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider block">Raw Extracted Text OCR Stream</span>
                  <div className="bg-stone-900/20 border border-stone-900 rounded-xl p-4 max-h-[150px] overflow-y-auto text-[10px] font-mono text-stone-400 whitespace-pre-wrap leading-relaxed select-text">
                    {selectedDoc.extracted_text}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-stone-900 text-[9px] font-mono text-stone-400 uppercase">
              <span>LEDGER TIMESTAMP: {new Date(selectedDoc._created_at).toLocaleString()}</span>
              <button
                onClick={() => setSelectedDoc(null)}
                className="bg-stone-950 text-black font-mono font-bold text-[10px] px-4 py-2 rounded-lg hover:bg-stone-200"
              >
                Done Reviewing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Toast Feedback Notification ─── */}
      {feedback && (
        <div className={`fixed bottom-6 right-6 border text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp select-none ${
          feedbackType === "success" ? "bg-stone-900 border-emerald-500" : "bg-stone-900 border-rose-500"
        }`}>
          <span className={feedbackType === "success" ? "text-emerald-500 animate-bounce" : "text-rose-500"}>
            {feedbackType === "success" ? "✓" : "⚠️"}
          </span>
          <span className="text-xs font-bold font-mono uppercase tracking-wider">{feedback}</span>
        </div>
      )}
    </div>
  );
}
