import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Badge, Button, Input, Modal } from "~/components/ui";

export const Route = createFileRoute("/portal/admin/ai-config")({
  component: AdminAiConfig,
});

interface PromptTemplate {
  id: string;
  name: string;
  industry: string;
  systemPrompt: string;
  version: string;
  updatedAt: string;
}

const initialPrompts: PromptTemplate[] = [
  {
    id: "P-01",
    name: "Energy Analyst Carrier Dispatcher",
    industry: "Energy",
    systemPrompt: "You are an autonomous AI Dispatcher for an Energy operations team. Your task is to monitor incoming carrier emails, scan any attachments for freight quote values (rate, equipment type, fuel surcharges), and compare them with standard dispatch parameters. Act with high compliance and flag any rates exceeding the $3.50/mile baseline for human review.",
    version: "v2.4.1",
    updatedAt: "2026-07-02"
  },
  {
    id: "P-02",
    name: "AP Invoice Extraction Agent",
    industry: "Finance",
    systemPrompt: "You are an AI Invoice Reconciler. You will process scanned PDFs or CSV ledgers containing invoice transactions. Extract the Vendor Name, Due Date, Tax ID, and Subtotal. Check the extracted Subtotal against the original Purchase Order database. If the discrepancy is under 1%, auto-approve and sync via QuickBooks webhook.",
    version: "v1.9.0",
    updatedAt: "2026-06-30"
  },
  {
    id: "P-03",
    name: "Handwriting Patient Intake OCR",
    industry: "Healthcare",
    systemPrompt: "You are an AI Handwriting Processing Specialist. Your role is to convert low-quality faxed patient registration documents into structured FHIR JSON payloads. Perform horizontal projection profiling to detect tabular fields and chromatic ink analysis to identify signature presence. Strictly reject files missing signatures with standard REJECT code.",
    version: "v3.1.2",
    updatedAt: "2026-07-03"
  }
];

function AdminAiConfig() {
  const [prompts, setPrompts] = useState<PromptTemplate[]>(initialPrompts);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate | null>(null);
  const [editedPromptText, setEditedPromptText] = useState("");
  const [editedName, setEditedName] = useState("");
  const [modelType, setModelType] = useState("gemini-3.5-flash");
  const [temperature, setTemperature] = useState(0.2);

  const handleSavePrompt = () => {
    if (!selectedPrompt) return;
    setPrompts(prompts.map(p => {
      if (p.id === selectedPrompt.id) {
        return {
          ...p,
          name: editedName,
          systemPrompt: editedPromptText,
          updatedAt: new Date().toISOString().split("T")[0],
          version: `v${(parseFloat(p.version.substring(1)) + 0.1).toFixed(1)}.0`
        };
      }
      return p;
    }));
    setSelectedPrompt(null);
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-200">
      {/* Header section */}
      <div className="border-b border-slate-800 pb-6">
        <h1 className="text-3xl font-black text-white">AI Engine Configuration</h1>
        <p className="text-slate-400 text-sm mt-1">Configure foundational LLM hyper-parameters, edit system-level instructions, and manage prompt library versions.</p>
      </div>

      {/* Global LLM hyperparams */}
      <Card className="p-8 bg-slate-900 border-slate-800 space-y-6">
        <h2 className="text-xl font-black text-white">Global LLM Hyper-parameters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-bold text-slate-400 mb-1.5">Foundation Model Selector</label>
            <select 
              value={modelType}
              onChange={(e) => setModelType(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="gemini-3.5-flash">Gemini 3.5 Flash (Optimized latency/cost)</option>
              <option value="gemini-3.5-pro">Gemini 3.5 Pro (Advanced complex reasoning)</option>
              <option value="claude-3.5-sonnet">Claude 3.5 Sonnet (Fallback runner)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-400 mb-1.5">Temperature: {temperature}</label>
            <div className="pt-2">
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.1" 
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-bold mt-1">
                <span>Deterministic (0.0)</span>
                <span>Creative (1.0)</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-400 mb-1.5">Model Fallback Handlers</label>
            <div className="pt-2 flex items-center gap-2">
              <input type="checkbox" id="fallback" defaultChecked className="rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500" />
              <label htmlFor="fallback" className="text-sm font-semibold text-slate-300">Auto-fallback on rate limits</label>
            </div>
          </div>
        </div>
      </Card>

      {/* Prompts list */}
      <div className="space-y-6">
        <h2 className="text-xl font-black text-white">System Prompt Library</h2>
        <div className="grid grid-cols-1 gap-6">
          {prompts.map((p) => (
            <Card key={p.id} className="p-6 bg-slate-900 border-slate-800 space-y-4 hover:border-slate-700 transition-all duration-300">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-black text-white">{p.name}</h3>
                    <Badge variant="indigo">{p.industry}</Badge>
                    <Badge variant="slate">{p.version}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-wider">ID: {p.id} • Last Updated: {p.updatedAt}</p>
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => {
                    setSelectedPrompt(p);
                    setEditedPromptText(p.systemPrompt);
                    setEditedName(p.name);
                  }}
                  className="border-slate-700 text-slate-300 hover:bg-slate-850"
                >
                  Configure Instructions
                </Button>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <code className="text-xs text-indigo-300 font-mono leading-relaxed line-clamp-2 block">
                  {p.systemPrompt}
                </code>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Edit modal */}
      {selectedPrompt && (
        <Modal 
          isOpen={!!selectedPrompt} 
          onClose={() => setSelectedPrompt(null)} 
          title={`Edit System Instructions - ${selectedPrompt.id}`}
        >
          <div className="space-y-5">
            <Input 
              label="Prompt Module Title" 
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              className="bg-slate-950 border-slate-800 text-white"
            />

            <div>
              <label className="block text-sm font-bold text-slate-400 mb-1.5">System Prompt Content</label>
              <textarea 
                rows={8}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 text-white p-3 text-sm font-semibold leading-relaxed focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
                value={editedPromptText}
                onChange={(e) => setEditedPromptText(e.target.value)}
              />
              <p className="text-[10px] text-slate-500 font-medium mt-1">This context defines the core personality and execution parameters of the agent node. Be detailed.</p>
            </div>

            <div className="flex gap-4 pt-4 border-t border-slate-800">
              <Button onClick={handleSavePrompt} className="flex-1">Deploy New Version</Button>
              <Button variant="outline" onClick={() => setSelectedPrompt(null)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
