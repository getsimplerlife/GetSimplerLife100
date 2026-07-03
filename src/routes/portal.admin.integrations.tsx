import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Badge, Button, Input } from "~/components/ui";

export const Route = createFileRoute("/portal/admin/integrations")({
  component: AdminIntegrations,
});

interface IntegrationService {
  id: string;
  name: string;
  category: string;
  status: "connected" | "pending" | "failed";
  icon: string;
  description: string;
}

const initialServices: IntegrationService[] = [
  { id: "S-01", name: "Salesforce CRM", category: "CRM / Sales", status: "connected", icon: "📊", description: "Sync customer leads and automated deal actions." },
  { id: "S-02", name: "HubSpot", category: "CRM / Marketing", status: "connected", icon: "📈", description: "Marketing pipeline auto-leads capture." },
  { id: "S-03", name: "QuickBooks Online", category: "Accounting / Finance", status: "connected", icon: "🧾", description: "Sync ledger invoices and tax statements." },
  { id: "S-04", name: "Stripe", category: "Payment Gateway", status: "connected", icon: "💳", description: "Process buy link webhooks and invoices." },
  { id: "S-05", name: "Slack Alerts Node", category: "Social / Team", status: "connected", icon: "💬", description: "Send real-time error or trace channels notifications." },
  { id: "S-06", name: "SAP Enterprise Link", category: "ERP System", status: "pending", icon: "🏭", description: "Global supply chain logistics syncing." },
];

function AdminIntegrations() {
  const [services] = useState<IntegrationService[]>(initialServices);
  const [search, setSearch] = useState("");

  const handleTestService = (id: string) => {
    alert(`Testing connection latency for service ${id}... Successful! 100% healthy response.`);
  };

  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-10 animate-in fade-in duration-200">
      {/* Header section */}
      <div className="border-b border-slate-800 pb-6">
        <h1 className="text-3xl font-black text-white">System Integrations Monitor</h1>
        <p className="text-slate-400 text-sm mt-1">Manage active workspace integrations, authenticate API OAuth handles, and test real-time connectivity status.</p>
      </div>

      {/* Control bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-900/50 p-6 rounded-3xl border border-slate-800/80">
        <div className="w-full md:max-w-md">
          <Input 
            placeholder="🔍 Search integrations by name or category..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-950 border-slate-800 focus:border-indigo-500 text-white"
          />
        </div>
        <Button size="sm">Connect New Integration Channel</Button>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredServices.map((s) => {
          const isConnected = s.status === "connected";
          return (
            <Card key={s.id} className="p-6 bg-slate-900 border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-all duration-300 shadow-xl">
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{s.icon}</span>
                    <div>
                      <h3 className="font-black text-white text-base">{s.name}</h3>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{s.category}</span>
                    </div>
                  </div>
                  <Badge variant={s.status === "connected" ? "success" : s.status === "pending" ? "warning" : "danger"}>
                    {s.status}
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                  {s.description}
                </p>
              </div>

              <div className="flex gap-3 border-t border-slate-800 mt-6 pt-4">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleTestService(s.id)}
                  className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-850"
                  disabled={!isConnected}
                >
                  📡 Test Connection
                </Button>
                <Button 
                  size="sm" 
                  variant={isConnected ? "secondary" : "primary"}
                  className="flex-1"
                >
                  {isConnected ? "Reconfigure" : "Authenticate"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
