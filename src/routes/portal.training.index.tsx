import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/training/")({
  component: ModelTraining,
});

function ModelTraining() {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    fetch("/api/data/training", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
      setModels(d.data || []);
      setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAction = async (name: string, action: string) => {
    try {
      setFeedback(`Processing model action: ${action}...`);
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "training_" + action.toLowerCase(), resource: name }),
      });
      await res.json();
      setFeedback(`Success: Model ${action} execution complete`);
      setTimeout(() => setFeedback(""), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans">
      <div className="border-b border-stone-200 pb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-stone-900 tracking-tight">🏋️ AI Model Training</h1>
          <p className="text-stone-500 mt-1">Upload customized datasets to fine-tune system OCR parsing weights and neural pipelines.</p>
        </div>
        <button onClick={() => handleAction("Generic model", "upload_dataset")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 py-3 rounded-2xl shadow-lg">📤 Upload Dataset</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {models.map((m, idx) => (
          <div key={idx} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-stone-900">{m.name}</span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">{m.status}</span>
              </div>
              <p className="text-xs text-stone-500 font-semibold">{m.type}</p>
              <div className="text-xs font-bold text-stone-800">Target Accuracy: {m.accuracy}%</div>
            </div>
            <button onClick={() => handleAction(m.name, "train")} className="w-full bg-stone-900 hover:bg-stone-850 text-white font-bold py-2 rounded-xl text-xs">🏋️ Train neural weights</button>
          </div>
        ))}
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