import React from "react";
import { Card, Badge } from "./ui";

export interface Provider {
  id: string;
  name: string;
  category: string;
  authType: string;
  description: string;
  isConnected?: boolean;
}

interface IntegrationsProviderCardProps {
  provider: Provider;
  onClick?: () => void;
}

// Icon mappings or fallbacks
export const getProviderIcon = (id: string): string => {
  const icons: Record<string, string> = {
    salesforce: "☁️",
    hubspot: "🧡",
    netsuite: "🟢",
    slack: "💬",
    gdrive: "📂",
    stripe: "💳",
    outlook: "📧",
    shopify: "🛒",
    sap: "🏢",
    "sap-business-one": "⚙️",
    "ms-dynamics-365": "📐",
    "dynamics-365-bc": "📈",
    "quickbooks-online": "💼",
    xero: "✖️",
    twilio: "📞",
    gmail: "✉️",
    teams: "👥",
    zoom: "📹",
    docusign: "✍️",
    asana: "🎯",
    jira: "🎟️",
    notion: "📓",
    gusto: "💵",
    zendesk: "🛡️",
    openai: "🧠",
  };
  const key = id.toLowerCase().replace(/-crm|-online|-cloud/g, "");
  return icons[key] || "🔌";
};

export const IntegrationsProviderCard: React.FC<IntegrationsProviderCardProps> = ({ provider, onClick }) => {
  const icon = getProviderIcon(provider.id);
  return (
    <Card
      onClick={onClick}
      className="p-5 border border-stone-900 bg-stone-950 hover:border-emerald-500/30 transition-all group flex flex-col justify-between"
    >
      <div className="space-y-3">
        <div className="flex justify-between items-start">
          <div className="h-10 w-10 bg-stone-900 border border-stone-850 rounded-xl flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
            {icon}
          </div>
          <div className="flex gap-1.5">
            <Badge variant={provider.authType === "oauth2" ? "blue" : "stone"} className="text-[8px]">
              {provider.authType === "oauth2" ? "OAuth" : "API Key"}
            </Badge>
            {provider.isConnected && (
              <Badge variant="emerald" className="text-[8px]">Connected</Badge>
            )}
          </div>
        </div>
        <div>
          <h4 className="text-sm font-bold text-white leading-snug group-hover:text-emerald-400 transition-colors">
            {provider.name}
          </h4>
          <p className="text-[10px] text-stone-400 font-semibold line-clamp-2 mt-1 leading-relaxed">
            {provider.description}
          </p>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-stone-900/60 flex justify-between items-center text-[10px] font-mono text-stone-500">
        <span>CATEGORY</span>
        <span className="uppercase text-stone-400 font-bold">{provider.category}</span>
      </div>
    </Card>
  );
};
