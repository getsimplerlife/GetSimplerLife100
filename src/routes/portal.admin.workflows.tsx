import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Badge, Button, Input } from "~/components/ui";

export const Route = createFileRoute("/portal/admin/workflows")({
  component: AdminWorkflows,
});

interface WorkflowNode {
  id: string;
  name: string;
  type: "trigger" | "action" | "condition";
  description: string;
  status: "active" | "draft";
}

const initialNodes: WorkflowNode[] = [
  { id: "N-101", name: "Inbound Email Dispatch Receiver", type: "trigger", description: "Monitors office mailbox for dispatcher quotes and fuel surcharge tables.", status: "active" },
  { id: "N-102", name: "Handwriting OCR parser fallback", type: "action", description: "Converts scans into tabular data rows.", status: "active" },
  { id: "N-103", name: "Validate discrepancy PO values", type: "condition", description: "Checks if discrepancy with PO database is within 1% threshold.", status: "active" },
  { id: "N-104", name: "QuickBooks Invoice ledger sync", type: "action", description: "Approves and generates QuickBooks bookkeeping entry.", status: "draft" },
];

function AdminWorkflows() {
  const [nodes, setNodes] = useState<WorkflowNode[]>(initialNodes);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const handleUpdateNode = (id: string, name: string, description: string) => {
    setNodes(nodes.map(n => n.id === id ? { ...n, name, description } : n));
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  return (
    <div className="space-y-10 animate-in fade-in duration-200">
      {/* Header section */}
      <div className="border-b border-slate-800 pb-6">
        <h1 className="text-3xl font-black text-white">Visual Workflow Architect</h1>
        <p className="text-slate-400 text-sm mt-1">Design, edit, and link visual coworker execution nodes into production pipelines.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Canvas editor viewport */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-8 bg-slate-900 border-slate-800 relative min-h-[500px]">
            <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
              <h2 className="text-lg font-black text-white">Pipeline: Invoice Reconciliation Flow</h2>
              <Badge variant="indigo">active</Badge>
            </div>

            {/* Nodes chain */}
            <div className="space-y-6 relative">
              {/* Visual dotted connection line */}
              <div className="absolute top-10 bottom-10 left-8 w-0.5 border-l border-dashed border-indigo-500/40 z-0" />

              {nodes.map((node, idx) => (
                <div 
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`relative z-10 flex gap-6 p-5 rounded-2xl border transition-all cursor-pointer ${
                    selectedNodeId === node.id 
                      ? "bg-indigo-950/25 border-indigo-500 shadow-md shadow-indigo-950/40" 
                      : "bg-slate-950 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-base shrink-0 shadow-md ${
                    node.type === "trigger" ? "bg-amber-900/40 text-amber-300 border border-amber-800/40" : 
                    node.type === "condition" ? "bg-violet-900/40 text-violet-300 border border-violet-800/40" :
                    "bg-indigo-900/40 text-indigo-300 border border-indigo-800/40"
                  }`}>
                    {node.type === "trigger" ? "⚡" : node.type === "condition" ? "❓" : idx}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-100 text-sm">{node.name}</span>
                      <Badge variant={node.type === "trigger" ? "warning" : node.type === "condition" ? "violet" : "indigo"}>
                        {node.type}
                      </Badge>
                      {node.status === "draft" && <Badge variant="slate">draft</Badge>}
                    </div>
                    <p className="text-xs text-slate-400 font-semibold leading-relaxed mt-1">{node.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Node insertion operation */}
            <Button 
              variant="outline" 
              className="w-full mt-8 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-white"
              onClick={() => {
                const newNode: WorkflowNode = {
                  id: `N-${Math.floor(100 + Math.random() * 100)}`,
                  name: "New Automation Step",
                  type: "action",
                  description: "Custom system execution task mapped to API keys.",
                  status: "draft"
                };
                setNodes([...nodes, newNode]);
              }}
            >
              ➕ Append New Action Node
            </Button>
          </Card>
        </div>

        {/* Selected node configuration panel */}
        <div>
          <Card className="p-6 bg-slate-900 border-slate-800 sticky top-8">
            {selectedNode ? (
              <div className="space-y-6">
                <div>
                  <Badge variant={selectedNode.type === "trigger" ? "warning" : selectedNode.type === "condition" ? "violet" : "indigo"}>
                    {selectedNode.type} Node
                  </Badge>
                  <h3 className="text-xl font-black text-white mt-2">{selectedNode.name}</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">Node ID: {selectedNode.id}</p>
                </div>

                <Input 
                  label="Node Name" 
                  value={selectedNode.name}
                  onChange={(e) => handleUpdateNode(selectedNode.id, e.target.value, selectedNode.description)}
                  className="bg-slate-950 border-slate-800 text-white"
                />

                <div>
                  <label className="block text-sm font-bold text-slate-400 mb-1.5">Action Parameters & Descriptions</label>
                  <textarea 
                    rows={4}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 text-white p-3 text-sm font-semibold leading-relaxed focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
                    value={selectedNode.description}
                    onChange={(e) => handleUpdateNode(selectedNode.id, selectedNode.name, e.target.value)}
                  />
                </div>

                <div className="border-t border-slate-800 pt-4 flex gap-4">
                  <Button 
                    variant="danger" 
                    size="sm"
                    onClick={() => {
                      setNodes(nodes.filter(n => n.id !== selectedNode.id));
                      setSelectedNodeId(null);
                    }}
                  >
                    Delete Node
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <div className="text-3xl mb-3">⚙️</div>
                <p className="text-sm font-semibold">Select an action step or trigger point on the canvas to edit variables.</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
