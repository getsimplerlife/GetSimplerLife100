import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import IndustryHub from '~/components/IndustryHub';
import { industries } from '~/content/industries';

export const Route = createFileRoute('/industries/')({
  component: IndustryPage,
  notFoundComponent: () => <div className="text-center py-20 text-stone-400">Industry not found</div>,
});

function IndustryPage() {
  const { industryId } = Route.useParams();
  const data = industries.find(i => i.id === industryId);
  const [agentTypes, setAgentTypes] = useState<any[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/agents/types");
        const d = await res.json();
        const types = (d.types || []).filter((t: any) =>
          t.supportedIndustries && t.supportedIndustries.some(
            (si: string) => si.toLowerCase() === (industryId || "").toLowerCase()
          )
        );
        setAgentTypes(types);
      } catch (err) {
        console.error("Failed to load agent types:", err);
      } finally {
        setLoadingAgents(false);
      }
    })();
  }, [industryId]);

  if (!data) return <div className="text-center py-20 text-stone-400">Industry not found</div>;

  const industryName = data.name || industryId;

  const industryIcons: Record<string, string> = {
    manufacturing: "🏭", healthcare: "🏥", finance: "💰", logistics: "🚚",
    retail: "🛍️", energy: "⚡", construction: "🏗️", insurance: "🛡️",
    legal: "⚖️", education: "📚", technology: "💻", automotive: "🚗",
    aerospace: "✈️", pharmaceutical: "💊", hospitality: "🏨", agriculture: "🌾",
    telecommunications: "📡", government: "🏛️", nonprofit: "🤝",
    "real-estate": "🏠", "e-commerce": "📦", media: "📺", "professional-services": "💼",
    "financial-services": "🏦", "health-insurance": "🩺",
  };

  const topIndustryColors = [
    "from-blue-500 to-blue-600", "from-emerald-500 to-emerald-600",
    "from-purple-500 to-purple-600", "from-amber-500 to-amber-600",
    "from-rose-500 to-rose-600", "from-cyan-500 to-cyan-600",
  ];

  return (
    <div>
      <IndustryHub data={data} />

      {/* Recommended AI Employees Section */}
      <div className="max-w-6xl mx-auto px-4 pb-20">
        <div className="border-t border-stone-800 pt-12 mb-8">
          <h2 className="text-2xl font-black text-white tracking-tight">
            🤖 Recommended AI Employees for {industryName}
          </h2>
          <p className="text-stone-400 text-sm mt-1">
            Pre-configured AI agents purpose-built for operations in the {industryName} industry.
          </p>
        </div>

        {loadingAgents ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
          </div>
        ) : agentTypes.length === 0 ? (
          <div className="text-center py-12 bg-stone-950 border border-stone-900 border-dashed rounded-2xl">
            <span className="text-3xl block mb-2">🤖</span>
            <p className="text-sm text-stone-500 font-medium">No specialized AI agents found for this industry yet.</p>
            <p className="text-xs text-stone-600 mt-1">Check the marketplace for general-purpose agents that can be adapted.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {agentTypes.map((agent, idx) => (
              <div
                key={agent.type}
                className="bg-stone-950 border border-stone-900 rounded-2xl p-5 hover:border-stone-800 transition-all hover:shadow-lg"
              >
                <div className="space-y-4">
                  {/* Icon + Name */}
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${topIndustryColors[idx % topIndustryColors.length]} flex items-center justify-center text-lg`}>
                      {industryIcons[industryId?.toLowerCase() || ""] || "🤖"}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white">{agent.name}</h3>
                      <span className="text-[9px] font-mono text-stone-500 uppercase">{agent.type}</span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-stone-400 leading-relaxed font-medium min-h-[40px] line-clamp-3">
                    {agent.description}
                  </p>

                  {/* Tools */}
                  {agent.defaultTools && agent.defaultTools.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {agent.defaultTools.slice(0, 4).map((tool: string) => (
                        <span key={tool} className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-stone-900 text-stone-500 border border-stone-800">
                          {tool.replace(/_/g, " ")}
                        </span>
                      ))}
                      {agent.defaultTools.length > 4 && (
                        <span className="text-[8px] font-mono text-stone-600">+{agent.defaultTools.length - 4}</span>
                      )}
                    </div>
                  )}

                  {/* Supported Industries */}
                  {agent.supportedIndustries && agent.supportedIndustries.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {agent.supportedIndustries.slice(0, 4).map((ind: string) => (
                        <span key={ind} className="text-[8px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {industryIcons[ind.toLowerCase()] || "🏢"} {ind.replace(/-/g, " ")}
                        </span>
                      ))}
                      {agent.supportedIndustries.length > 4 && (
                        <span className="text-[8px] font-mono text-stone-600">+{agent.supportedIndustries.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}