import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Button } from "~/components/ui";

export const Route = createFileRoute("/audit-upload")({
  component: AuditUploadPage,
});

function AuditUpload() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selectedFiles]);
      setError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      
      // Filter out unsupported files or just add them all with basic validation
      const validExtensions = [
        "pdf", "doc", "docx", "xls", "xlsx", "csv",
        "png", "jpg", "jpeg", "gif", "bmp", "tiff", "webp"
      ];
      const filtered = droppedFiles.filter((file) => {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        return validExtensions.includes(ext) || file.type.startsWith("image/");
      });

      if (filtered.length < droppedFiles.length) {
        setError("Some files were skipped. We accept PDF, Word, Excel, CSV, and images.");
      }

      setFiles((prev) => [...prev, ...filtered]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !company) {
      setError("Please fill out all required fields.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("email", email);
      formData.append("company", company);
      formData.append("description", description);

      files.forEach((file) => {
        formData.append("file", file);
      });

      const res = await fetch("/api/audit-upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Submission failed. Please try again.");
      }

      setSubmitted(true);
    } catch (err: any) {
      console.error("Audit upload error:", err);
      setError(err.message || "An error occurred while submitting. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col selection:bg-emerald-500/20 selection:text-emerald-300">
        {/* Header */}
        <header className="px-6 py-6 bg-stone-950/80 sticky top-0 z-50 border-b border-stone-900 backdrop-blur-md">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <Link to="/" className="text-2xl font-black text-emerald-500 tracking-tight">
              Simpler Life 100
            </Link>
            <nav className="flex gap-8 items-center">
              <Link to="/" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">Home</Link>
              <Link to="/login" className="text-sm font-bold text-emerald-500 hover:text-emerald-400 transition-colors">Login</Link>
            </nav>
          </div>
        </header>

        {/* Success View */}
        <main className="flex-1 flex items-center justify-center p-6 relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.04),transparent_60%)] pointer-events-none" />
          <div className="max-w-xl w-full bg-stone-900/60 border border-stone-800 rounded-[2.5rem] p-12 text-center backdrop-blur-sm relative z-10 shadow-2xl animate-fadeIn">
            <div className="w-20 h-20 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl shadow-emerald-500/5 ring-1 border border-emerald-500/20">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-4xl font-black text-white mb-6 tracking-tight">Files Submitted!</h1>
            <div className="text-xl text-stone-300 leading-relaxed mb-10 space-y-4">
              <p>
                Thanks, <span className="text-emerald-400 font-bold">{name}</span>!
              </p>
              <p className="text-stone-400 text-lg">
                Our team will review your files for <span className="text-white font-semibold">{company}</span> and reach out within 24 hours.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/" className="bg-emerald-600 text-white px-8 py-3.5 rounded-xl font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20">
                Back to Home
              </Link>
              <Link to="/roi-calculator" className="bg-stone-800 text-stone-200 border border-stone-700 px-8 py-3.5 rounded-xl font-bold hover:bg-stone-700 transition-all">
                Try ROI Calculator
              </Link>
            </div>
          </div>
        </main>

        <footer className="px-6 py-8 border-t border-stone-900 text-center text-sm text-stone-500 bg-stone-950">
          <p>&copy; {new Date().getFullYear()} Simpler Life 100. All rights reserved.</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Header */}
      <header className="px-6 py-6 bg-stone-950/80 sticky top-0 z-50 border-b border-stone-900 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-2xl font-black text-emerald-500 tracking-tight">
            Simpler Life 100
          </Link>
          <nav className="flex gap-8 items-center">
            <Link to="/" className="text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">Home</Link>
            <Link to="/login" className="text-sm font-bold text-emerald-500 hover:text-emerald-400 transition-colors">Login</Link>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 py-16 px-6 relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.03),transparent_50%)] pointer-events-none" />
        <div className="max-w-3xl mx-auto relative z-10">
          <div className="text-center mb-12">
            <div className="inline-block px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold text-sm uppercase tracking-wider mb-4 border border-emerald-500/15">
              Secure Pre-Audit Portal
            </div>
            <h1 className="text-4xl lg:text-6xl font-black text-white mb-4 tracking-tight">
              Submit Your Files
            </h1>
            <p className="text-xl text-stone-400 max-w-2xl mx-auto leading-relaxed">
              Upload sample documents and share your automation needs. We'll analyze your workflow and map out your custom AI workforce opportunity blueprint.
            </p>
          </div>

          <div className="bg-stone-900/40 border border-stone-800 rounded-[2.5rem] p-8 lg:p-12 shadow-2xl backdrop-blur-sm">
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Personal Details */}
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-stone-300 mb-2">Full Name <span className="text-emerald-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="Jane Smith"
                    className="w-full rounded-xl bg-stone-950/80 border border-stone-800 focus:border-emerald-500 px-4 py-3 text-white placeholder-stone-600 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-stone-300 mb-2">Work Email <span className="text-emerald-500">*</span></label>
                  <input
                    type="email"
                    required
                    placeholder="jane@company.com"
                    className="w-full rounded-xl bg-stone-950/80 border border-stone-800 focus:border-emerald-500 px-4 py-3 text-white placeholder-stone-600 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Company */}
              <div>
                <label className="block text-sm font-bold text-stone-300 mb-2">Company Name <span className="text-emerald-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Acme Operations"
                  className="w-full rounded-xl bg-stone-950/80 border border-stone-800 focus:border-emerald-500 px-4 py-3 text-white placeholder-stone-600 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-bold text-stone-300 mb-2">What workflows do you need automated?</label>
                <textarea
                  rows={4}
                  placeholder="Describe the high-friction manual work eating into your team's time (e.g. data entry, invoice matching, document review, carrier dispatch scheduling...)"
                  className="w-full rounded-xl bg-stone-950/80 border border-stone-800 focus:border-emerald-500 px-4 py-3 text-white placeholder-stone-600 focus:ring-2 focus:ring-emerald-500/20 outline-none transition resize-none"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* File Upload Area */}
              <div>
                <label className="block text-sm font-bold text-stone-300 mb-2">
                  Upload Sample Documents <span className="text-stone-500 font-normal">(PDF, Word, Excel, CSV, images)</span>
                </label>
                
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    isDragOver
                      ? "border-emerald-500 bg-emerald-500/5 shadow-inner shadow-emerald-500/10"
                      : "border-stone-800 bg-stone-950/40 hover:border-stone-700 hover:bg-stone-900/20"
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="w-12 h-12 bg-stone-900 rounded-xl flex items-center justify-center mx-auto mb-4 border border-stone-800 shadow-sm text-stone-400 group-hover:text-stone-300">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-stone-200">
                    Drag and drop files here, or <span className="text-emerald-500">browse</span>
                  </p>
                  <p className="text-xs text-stone-500 mt-2 font-medium">
                    Secure upload. Max file size: 20MB per file.
                  </p>
                </div>

                {/* Uploaded Files List */}
                {files.length > 0 && (
                  <div className="mt-4 space-y-2 max-h-60 overflow-y-auto pr-1">
                    <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2">Selected files ({files.length})</p>
                    {files.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between p-3 bg-stone-950/60 border border-stone-900 rounded-xl animate-fadeIn"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-8 h-8 rounded-lg bg-stone-900 flex items-center justify-center shrink-0 border border-stone-800 text-stone-400 text-xs font-black">
                            {file.name.split(".").pop()?.toUpperCase() || "DOC"}
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-sm font-medium text-stone-200 truncate">{file.name}</p>
                            <p className="text-xs text-stone-500">{formatSize(file.size)}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index);
                          }}
                          className="w-8 h-8 rounded-lg text-stone-500 hover:text-rose-400 hover:bg-stone-900 flex items-center justify-center transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Error message */}
              {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-xl text-sm font-semibold animate-shake">
                  {error}
                </div>
              )}

              {/* Submit button */}
              <Button
                type="submit"
                disabled={loading}
                loading={loading}
                variant="primary"
                size="lg"
                className="w-full text-base py-3.5 shadow-xl shadow-emerald-950/20 rounded-xl"
              >
                {loading ? "Uploading Securely..." : "Submit for Pre-Audit Review →"}
              </Button>

              <p className="text-center text-xs text-stone-500 font-medium">
                🔒 Your files are fully encrypted at rest and in transit. We follow strict data-handling policies.
              </p>
            </form>
          </div>
        </div>
      </main>

      <footer className="px-6 py-12 border-t border-stone-900 bg-stone-950 text-center text-sm text-stone-500">
        <p>&copy; {new Date().getFullYear()} Simpler Life 100. All rights reserved.</p>
      </footer>
    </div>
  );
}

function AuditUploadPage() {
  return <AuditUpload />;
}
