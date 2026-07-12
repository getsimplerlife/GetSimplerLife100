import { useState } from "react";
import { socialProofSnippets, type SocialProofSnippet } from "~/content/social-proof";

interface SocialProofBannerProps {
  industry?: string | string[];
  workflow?: string | string[];
}

export function SocialProofBanner({ industry, workflow }: SocialProofBannerProps) {
  const [selectedSnippet, setSelectedSnippet] = useState<SocialProofSnippet | null>(null);

  // Filter logic
  const filteredSnippets = socialProofSnippets.filter((snippet) => {
    // Helper to check overlap
    const checkOverlap = (prop: string | string[] | undefined, target: string[]) => {
      if (!prop) return true;
      const propArray = Array.isArray(prop) ? prop : [prop];
      return propArray.some((p) => target.includes(p.toLowerCase()));
    };

    const matchesIndustry = checkOverlap(industry, snippet.industry);
    const matchesWorkflow = checkOverlap(workflow, snippet.workflow);

    // If both specified, must match both or at least one if we want broader results.
    // Let's do matching: if both are specified, prioritize matching both, otherwise match at least one.
    if (industry && workflow) {
      return matchesIndustry && matchesWorkflow;
    }
    if (industry) return matchesIndustry;
    if (workflow) return matchesWorkflow;
    return true;
  });

  // Fallback to random/general snippets if no match found
  const displaySnippets = (filteredSnippets.length >= 2 ? filteredSnippets : socialProofSnippets).slice(0, 3);

  return (
    <div className="w-full py-12 px-6 bg-stone-950 border-y border-stone-900 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-950/5 via-transparent to-transparent opacity-50 pointer-events-none" />
      
      <div className="max-w-5xl mx-auto space-y-8 relative z-10">
        <div className="text-center space-y-1.5">
          <span className="text-[10px] font-mono font-bold tracking-widest text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-2.5 py-1 rounded-full uppercase">
            ⚡ Proven Impact
          </span>
          <h3 className="text-lg font-black text-white tracking-tight">
            Trusted by operations teams across the industry
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {displaySnippets.map((snippet) => (
            <div
              key={snippet.id}
              onClick={() => setSelectedSnippet(snippet)}
              className="bg-stone-900/40 border border-stone-850 hover:border-emerald-500/30 rounded-2xl p-6 transition-all duration-200 cursor-pointer flex flex-col justify-between group hover:shadow-xl hover:shadow-emerald-950/5"
            >
              <div className="space-y-4">
                {/* Metric */}
                <div className="text-xl font-black text-emerald-400 font-mono tracking-tight group-hover:text-emerald-300 transition-colors">
                  {snippet.metric}
                </div>
                {/* Snippet text */}
                <p className="text-xs text-stone-300 leading-relaxed font-medium">
                  "{snippet.text}"
                </p>
              </div>

              {/* Source/Badge */}
              <div className="pt-4 border-t border-stone-850/60 mt-4 flex items-center justify-between text-[9px] font-mono text-stone-500 uppercase tracking-widest">
                <span>Verified Client</span>
                <span className="text-emerald-500/80 group-hover:text-emerald-400 transition-colors">
                  [ Details → ]
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip Modal */}
      {selectedSnippet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm">
          <div 
            className="absolute inset-0" 
            onClick={() => setSelectedSnippet(null)} 
          />
          <div className="relative bg-stone-900 border border-stone-800 rounded-3xl p-6 max-w-md w-full space-y-6 shadow-2xl z-10 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-stone-850 pb-3">
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-2 py-0.5 rounded">
                CASE SNAPSHOT
              </span>
              <button
                onClick={() => setSelectedSnippet(null)}
                className="text-stone-500 hover:text-white font-mono text-xs border border-stone-850 bg-stone-900 hover:bg-stone-850 rounded px-2.5 py-1 transition-all"
              >
                [ CLOSE ]
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <div className="text-[10px] font-mono text-stone-500 uppercase tracking-wider">KEY METRIC ACHIEVEMENT</div>
                <div className="text-2xl font-black text-emerald-400 font-mono">
                  {selectedSnippet.metric}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-[10px] font-mono text-stone-500 uppercase tracking-wider">VERIFIED DEPLOYMENT OUTCOME</div>
                <p className="text-sm text-stone-200 leading-relaxed font-medium">
                  {selectedSnippet.text}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <div className="text-[9px] font-mono text-stone-500 uppercase">INDUSTRIES</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedSnippet.industry.map((ind) => (
                      <span key={ind} className="px-1.5 py-0.5 bg-stone-950 border border-stone-850 text-[9px] font-mono text-stone-400 rounded uppercase">
                        {ind}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-mono text-stone-500 uppercase">WORKFLOWS</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedSnippet.workflow.map((wf) => (
                      <span key={wf} className="px-1.5 py-0.5 bg-stone-950 border border-stone-850 text-[9px] font-mono text-stone-400 rounded uppercase">
                        {wf.replace(/-/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-stone-850 flex items-center justify-between text-[10px] font-mono text-stone-500">
              <span>S1 DEPLOYMENT SN-{(selectedSnippet.id).toUpperCase()}</span>
              <span className="text-emerald-500">ACTIVE Blueprints</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
