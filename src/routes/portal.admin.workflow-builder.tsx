import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Badge, Button, Input, Modal } from "~/components/ui";

export const Route = createFileRoute("/portal/admin/workflow-builder")({
  component: AdminWorkflowBuilder,
});

interface WorkflowNodeInstance {
  id: string;
  componentId: string;
  name: string;
  type: "trigger" | "action" | "output";
  icon: string;
  description: string;
  config: Record<string, string>;
}

interface IntegrationCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  defaultConfig: Record<string, string>;
}

const TRIGGER_TEMPLATES: IntegrationCategory[] = [
  { id: "t_upload", name: "File Upload Trigger", icon: "📁", description: "Fires when user uploads PDFs, CSVs, or handwriting scans to the portal.", defaultConfig: { allowedTypes: "PDF, CSV, JPEG", maxBytes: "10485760" } },
  { id: "t_cron", name: "Time Schedule Trigger", icon: "⏰", description: "Fires on a background cron schedule (e.g. every 5 mins).", defaultConfig: { cron: "*/5 * * * *", cooldown: "300" } },
  { id: "t_webhook", name: "REST Webhook Trigger", icon: "🔌", description: "Listens for incoming POST requests from external systems.", defaultConfig: { secretHeader: "X-SL100-Signature", path: "/api/v1/trigger" } },
];

const ACTION_TEMPLATES: IntegrationCategory[] = [
  { id: "a_ai", name: "Run AI Employee", icon: "🤖", description: "Executes autonomous LLM reasoning engine with a selected prompt blueprint.", defaultConfig: { model: "gemini-3.5-flash", temperature: "0.2", prompt: "Energy carrier dispatch comparison" } },
  { id: "a_ocr", name: "OCR Parser Fallback", icon: "📂", description: "Processes PDFs and images to extract digital table grids and metadata.", defaultConfig: { extractHandwriting: "true", layoutDetection: "true" } },
  { id: "a_email", name: "Compose & Send Email", icon: "📧", description: "Dynamically writes and delivers transactional email responses.", defaultConfig: { recipient: "{{customer.email}}", subject: "Reconciliation Complete" } },
  { id: "a_transform", name: "Transform Data Schema", icon: "🔄", description: "Formats extracted values into validated JSON or FHIR structures.", defaultConfig: { format: "JSON", enforceTypes: "true" } },
];

const OUTPUT_TEMPLATES: IntegrationCategory[] = [
  { id: "o_db", name: "Save Results Storage", icon: "💾", description: "Saves structured datasets into SQLite/Turso or Amazon S3.", defaultConfig: { targetTable: "agent_runs", primaryKey: "id" } },
  { id: "o_slack", name: "Send Slack Alert", icon: "💬", description: "Delivers notifications and trace error payloads to Slack channels.", defaultConfig: { channel: "#ops-feed", priority: "high" } },
];

function AdminWorkflowBuilder() {
  const [nodes, setNodes] = useState<WorkflowNodeInstance[]>([
    {
      id: "node_1",
      componentId: "t_upload",
      name: "File Upload Trigger",
      type: "trigger",
      icon: "📁",
      description: "Fires when user uploads PDFs, CSVs, or handwriting scans to the portal.",
      config: { allowedTypes: "PDF, CSV, JPEG", maxBytes: "10485760" },
    },
    {
      id: "node_2",
      componentId: "a_ai",
      name: "Run AI Employee",
      type: "action",
      icon: "🤖",
      description: "Executes autonomous LLM reasoning engine with a selected prompt blueprint.",
      config: { model: "gemini-3.5-flash", temperature: "0.2", prompt: "Energy carrier dispatch comparison" },
    },
    {
      id: "node_3",
      componentId: "o_db",
      name: "Save Results Storage",
      type: "output",
      icon: "💾",
      description: "Saves structured datasets into SQLite/Turso or Amazon S3.",
      config: { targetTable: "agent_runs", primaryKey: "id" },
    },
  ]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("node_2");
  const [workflowName, setWorkflowName] = useState("Carrier Dispatch Reconciliation Pipeline");
  const [activeTab, setActiveTab] = useState<"visual" | "json" | "code">("visual");
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [draggedTemplate, setDraggedTemplate] = useState<IntegrationCategory | null>(null);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // Drag and Drop handlers
  const handleDragStart = (template: IntegrationCategory) => {
    setDraggedTemplate(template);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, type: "trigger" | "action" | "output") => {
    e.preventDefault();
    if (!draggedTemplate) return;

    const newNode: WorkflowNodeInstance = {
      id: `node_${Math.floor(1000 + Math.random() * 9000)}`,
      componentId: draggedTemplate.id,
      name: draggedTemplate.name,
      type: type,
      icon: draggedTemplate.icon,
      description: draggedTemplate.description,
      config: { ...draggedTemplate.defaultConfig },
    };

    setNodes([...nodes, newNode]);
    setSelectedNodeId(newNode.id);
    setDraggedTemplate(null);
  };

  const handleUpdateConfig = (key: string, value: string) => {
    if (!selectedNodeId) return;
    setNodes(
      nodes.map((n) => {
        if (n.id === selectedNodeId) {
          return {
            ...n,
            config: { ...n.config, [key]: value },
          };
        }
        return n;
      })
    );
  };

  const handleDeleteNode = (id: string) => {
    setNodes(nodes.filter((n) => n.id !== id));
    if (selectedNodeId === id) {
      setSelectedNodeId(null);
    }
  };

  // Generate serialized JSON
  const serializedWorkflow = JSON.stringify(
    {
      workflow_name: workflowName,
      version: "1.0.0",
      steps: nodes.map((n, idx) => ({
        step_index: idx + 1,
        id: n.id,
        type: n.type,
        component_id: n.componentId,
        config: n.config,
      })),
    },
    null,
    2
  );

  // Generate python blueprint code
  const pythonBlueprint = `from ai_employee import AIEmployee, WorkflowExecutor

# Autogenerated Pipeline: ${workflowName}
def main():
    agent = AIEmployee(name="${workflowName}")
    executor = WorkflowExecutor(agent)

    # Configure step chain${nodes.map((n, idx) => `
    # Step ${idx + 1}: ${n.name}
    executor.add_node(
        id="${n.id}",
        node_type="${n.type}",
        component="${n.componentId}",
        params=${JSON.stringify(n.config)}
    )`).join("\n")}

    executor.run()

if __name__ == "__main__":
    main()
`;

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Title bar */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-black text-white">Visual Workflow Builder</h1>
          <p className="text-slate-400 text-sm mt-1">
            Build and stitch automation triggers, AI reasoning engines, and data storage connectors in a unified canvas.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-slate-800 text-slate-300" onClick={() => setIsSaveModalOpen(true)}>
            💾 Save Blueprint
          </Button>
          <Button variant="primary" onClick={() => alert("Pipeline deployed and compiled live successfully!")}>
            🚀 Deploy Live
          </Button>
        </div>
      </div>

      {/* Workflow Settings & Mode selector */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 border border-slate-800 p-6 rounded-3xl">
        <div className="flex-1 w-full md:max-w-md">
          <Input
            label="Workflow Pipeline Name"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="bg-slate-950 border-slate-800 text-white font-bold"
          />
        </div>
        <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveTab("visual")}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === "visual" ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-white"
            }`}
          >
            🎨 Canvas Designer
          </button>
          <button
            onClick={() => setActiveTab("json")}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === "json" ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-white"
            }`}
          >
            📋 JSON Schema
          </button>
          <button
            onClick={() => setActiveTab("code")}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === "code" ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-slate-850"
            }`}
          >
            🐍 Python Code
          </button>
        </div>
      </div>

      {activeTab === "visual" && (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          {/* Sidebar - Available nodes */}
          <div className="space-y-6">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest px-2">Components Toolcase</h2>
            
            {/* Triggers Category */}
            <div className="space-y-3">
              <span className="text-xs font-black text-amber-400 uppercase tracking-wider px-2 block">1. Triggers</span>
              <div className="space-y-2">
                {TRIGGER_TEMPLATES.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    draggable
                    onDragStart={() => handleDragStart(tmpl)}
                    className="bg-slate-900 border border-slate-800/80 p-4 rounded-2xl hover:border-amber-500/50 cursor-grab active:cursor-grabbing transition-all select-none group"
                  >
                    <div className="flex gap-3">
                      <span className="text-2xl">{tmpl.icon}</span>
                      <div>
                        <h3 className="text-xs font-black text-slate-100 group-hover:text-amber-300 transition-colors">{tmpl.name}</h3>
                        <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{tmpl.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions Category */}
            <div className="space-y-3">
              <span className="text-xs font-black text-indigo-400 uppercase tracking-wider px-2 block">2. Actions</span>
              <div className="space-y-2">
                {ACTION_TEMPLATES.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    draggable
                    onDragStart={() => handleDragStart(tmpl)}
                    className="bg-slate-900 border border-slate-800/80 p-4 rounded-2xl hover:border-indigo-500/50 cursor-grab active:cursor-grabbing transition-all select-none group"
                  >
                    <div className="flex gap-3">
                      <span className="text-2xl">{tmpl.icon}</span>
                      <div>
                        <h3 className="text-xs font-black text-slate-100 group-hover:text-indigo-300 transition-colors">{tmpl.name}</h3>
                        <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{tmpl.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Outputs Category */}
            <div className="space-y-3">
              <span className="text-xs font-black text-emerald-400 uppercase tracking-wider px-2 block">3. Outputs</span>
              <div className="space-y-2">
                {OUTPUT_TEMPLATES.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    draggable
                    onDragStart={() => handleDragStart(tmpl)}
                    className="bg-slate-900 border border-slate-800/80 p-4 rounded-2xl hover:border-emerald-500/50 cursor-grab active:cursor-grabbing transition-all select-none group"
                  >
                    <div className="flex gap-3">
                      <span className="text-2xl">{tmpl.icon}</span>
                      <div>
                        <h3 className="text-xs font-black text-slate-100 group-hover:text-emerald-300 transition-colors">{tmpl.name}</h3>
                        <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{tmpl.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Canvas Viewport Area */}
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Visual dropping canvas */}
            <div className="md:col-span-2 space-y-6">
              <Card className="p-8 bg-slate-900 border-slate-800 min-h-[600px] flex flex-col justify-between">
                <div className="space-y-8 relative">
                  {/* Connection trace design line */}
                  {nodes.length > 1 && (
                    <div className="absolute top-10 bottom-10 left-8 w-0.5 border-l border-dashed border-indigo-500/40 z-0" />
                  )}

                  {nodes.map((node) => (
                    <div 
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`relative z-10 flex gap-5 p-5 rounded-2xl border transition-all cursor-pointer ${
                        selectedNodeId === node.id 
                          ? "bg-indigo-950/20 border-indigo-500 shadow-xl shadow-indigo-950/30" 
                          : "bg-slate-950 border-slate-800/80 hover:border-slate-700"
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-base shrink-0 shadow-md ${
                        node.type === "trigger" ? "bg-amber-900/30 text-amber-300 border border-amber-800/25" : 
                        node.type === "output" ? "bg-emerald-900/30 text-emerald-300 border border-emerald-800/25" :
                        "bg-indigo-900/30 text-indigo-300 border border-indigo-800/25"
                      }`}>
                        {node.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100 text-sm">{node.name}</span>
                          <Badge variant={node.type === "trigger" ? "warning" : node.type === "output" ? "success" : "indigo"}>
                            {node.type}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{node.description}</p>
                      </div>
                    </div>
                  ))}

                  {/* Drop Targets Areas */}
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-800/80">
                    {/* Drop Trigger area */}
                    <div
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, "trigger")}
                      className="border border-dashed border-slate-800 hover:border-indigo-500 hover:bg-indigo-950/10 transition-all p-4 rounded-2xl text-center cursor-default group"
                    >
                      <div className="text-xl mb-1 group-hover:scale-110 transition-transform">📥</div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Drop Trigger</p>
                    </div>
                    {/* Drop Action area */}
                    <div
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, "action")}
                      className="border border-dashed border-slate-800 hover:border-indigo-500/60 p-4 rounded-2xl text-center"
                    >
                      <div className="text-xl mb-1">⚙️</div>
                      <p className="text-[10px] text-slate-400 font-black uppercase">Drop Action</p>
                    </div>
                    {/* Drop Output area */}
                    <div
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, "output")}
                      className="border border-dashed border-slate-800 hover:border-indigo-500/60 p-4 rounded-2xl text-center"
                    >
                      <div className="text-xl mb-3"> 🔔</div>
                      <p className="text-[10px] text-slate-400 font-black uppercase">Drop Output</p>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-500 font-bold text-center mt-6">
                  💡 Tip: Drag components from the left column and drop them onto the canvas drop targets above.
                </div>
              </Card>
            </div>

            {/* Right configuration side panel */}
            <div>
              <Card className="p-6 bg-slate-900 border-slate-800 h-full">
                {selectedNode ? (
                  <div className="space-y-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <Badge variant={selectedNode.type === "trigger" ? "warning" : selectedNode.type === "output" ? "success" : "indigo"}>
                          {selectedNode.type} Node
                        </Badge>
                        <h3 className="text-base font-black text-white mt-1">{selectedNode.name}</h3>
                      </div>
                      <button onClick={() => handleDeleteNode(selectedNode.id)} className="text-xs text-rose-500 hover:text-rose-400 font-black">
                        Remove
                      </button>
                    </div>

                    <Input
                      label="Node Label Name"
                      value={selectedNode.name}
                      onChange={(e) => {
                        setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, name: e.target.value } : n));
                      }}
                      className="bg-slate-950 border-slate-800 text-white py-2"
                    />

                    {/* Config fields dynamically rendered based on Node template */}
                    <div className="space-y-4 pt-4 border-t border-slate-800">
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider block">Node Settings Parameters</span>
                      {Object.entries(selectedNode.config).map(([key, value]) => (
                        <Input
                          key={key}
                          label={key.replace(/([A-Z])/g, " $1").toUpperCase()}
                          value={value}
                          onChange={(e) => handleUpdateConfig(key, e.target.value)}
                          className="bg-slate-950 border-slate-800 text-white font-mono text-xs"
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-20 text-slate-500">
                    <div className="text-4xl mb-3">🛠️</div>
                    <p className="text-xs font-semibold">Select a component node from your designer canvas to configure parameters.</p>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}

      {activeTab === "json" && (
        <Card className="p-8 bg-slate-900 border-slate-800">
          <h2 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4">Serialized Output Schema JSON</h2>
          <pre className="p-5 bg-slate-950 border border-slate-800 rounded-2xl overflow-x-auto text-xs text-indigo-400 font-mono leading-relaxed">
            {serializedWorkflow}
          </pre>
        </Card>
      )}

      {activeTab === "code" && (
        <Card className="p-8 bg-slate-900 border-slate-800">
          <h2 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4">Autonomous AI Python Script Blueprint</h2>
          <pre className="p-5 bg-slate-950 border border-slate-800 rounded-2xl overflow-x-auto text-xs text-emerald-400 font-mono leading-relaxed">
            {pythonBlueprint}
          </pre>
        </Card>
      )}

      {/* Save Modal */}
      <Modal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} title="Save Workflow Blueprint">
        <div className="space-y-5">
          <p className="text-sm text-slate-300 font-semibold leading-relaxed">
            Are you sure you want to serialize and export this configured AI agent pipeline to the system registry?
          </p>
          <div className="bg-slate-950 p-4 border border-slate-800 rounded-2xl">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Workflow Configuration</p>
            <p className="text-sm font-black text-white mt-1">{workflowName}</p>
            <p className="text-xs text-indigo-400 font-mono mt-1">{nodes.length} nodes configured</p>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="secondary" onClick={() => setIsSaveModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setIsSaveModalOpen(false);
                alert("Workflow successfully stored into system registry database!");
              }}
            >
              Confirm Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
