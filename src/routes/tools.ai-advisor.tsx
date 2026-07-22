import { useState, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { analyzeDescription, getFollowUpQuestions } from "../tools/automation-analyzer";

export const Route = createFileRoute("/tools/ai-advisor")({
  component: AIAdvisor,
});

// ── Chat Flow Types ──────────────────────────────────────────────────────

type AdvisorStep = "greeting" | "listening" | "followup" | "results";

interface ChatMessage {
  role: "advisor" | "user";
  text: string;
  timestamp: number;
}

// ── Component ─────────────────────────────────────────────────────────────

function AIAdvisor() {
  const [step, setStep] = useState<AdvisorStep>("greeting");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "advisor",
      text: "Hi! I'm your AI Operations Advisor. 🎯\n\nTell me — **what repetitive process frustrates your team the most?**",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [userDescription, setUserDescription] = useState("");
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [followUpIndex, setFollowUpIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addMessage = (role: "advisor" | "user", text: string) => {
    setMessages((prev) => [...prev, { role, text, timestamp: Date.now() }]);
  };

  const handleSend = (text: string) => {
    if (!text.trim() || loading || analyzing) return;

    addMessage("user", text);
    setInput("");
    setLoading(true);

    setTimeout(() => {
      switch (step) {
        case "greeting":
          // User responded to the initial question
          setUserDescription(text);
          addMessage("advisor", "Great, thanks for sharing! Let me understand a bit more...");
          setStep("listening");

          // Generate follow-up questions
          setTimeout(() => {
            const questions = getFollowUpQuestions(text);
            setFollowUps(questions);
            setFollowUpIndex(0);

            if (questions.length > 0) {
              addMessage("advisor", `📋 **Quick follow-ups:**\n\n**${questions[0]}**`);
              setStep("followup");
            } else {
              // No follow-ups needed, go straight to results
              generateResults(text, {});
            }
            setLoading(false);
          }, 800);
          break;

        case "followup":
          // User answered a follow-up question
          const currentQ = followUps[followUpIndex] || "";
          const newResponses = { ...responses, [currentQ]: text };
          setResponses(newResponses);

          const nextIdx = followUpIndex + 1;
          if (nextIdx < followUps.length) {
            setFollowUpIndex(nextIdx);
            setTimeout(() => {
              addMessage("advisor", `📋 **${followUps[nextIdx]}**`);
              setLoading(false);
            }, 600);
          } else {
            // All follow-ups answered, generate results
            setTimeout(() => {
              generateResults(userDescription, newResponses);
              setLoading(false);
            }, 600);
          }
          break;

        default:
          setLoading(false);
          break;
      }
    }, 500);
  };

  const generateResults = (description: string, _responses: Record<string, string>) => {
    setAnalyzing(true);
    setStep("results");

    // Brief delay for UX
    setTimeout(() => {
      const analysis = analyzeDescription(description);
      const top = analysis.topMatch;

      const totalHours = analysis.allMatches.reduce((sum: number, r: any) => sum + r.estimatedHoursSaved, 0);

      const resultMessage = [
        "🎯 **Analysis Complete! Here's what I found:**\n",
        `Based on what you've shared, here are the top automation opportunities for your team:\n`,
        `**🥇 ${top.suggestedAgentEmoji} ${top.match.name}**`,
        `   → ${top.estimatedHoursSaved}h/week saved | ${top.confidence} match confidence`,
        `   → ${top.match.description}`,
        "",
        ...analysis.allMatches.slice(1, 3).map(
          (r: any, i: number) =>
            `**${i === 0 ? "🥈" : "🥉"} ${r.suggestedAgentEmoji} ${r.match.name}**\n   → ${r.estimatedHoursSaved}h/week saved | ${r.confidence} match\n   → ${r.match.description}`
        ),
        "",
        `📊 **Total estimated savings: ~${totalHours} hours per week**`,
        `💰 **That's approximately $${(totalHours * 25 * 4).toLocaleString()} per month in labor savings**`,
        "",
        `*Based on a blended labor rate of $25/hr*`,
      ].join("\n");

      addMessage("advisor", resultMessage.trim());
      setAnalyzing(false);
    }, 1200);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  const handleRestart = () => {
    setStep("greeting");
    setMessages([
      {
        role: "advisor",
        text: "Hi! I'm your AI Operations Advisor. 🎯\n\nTell me — **what repetitive process frustrates your team the most?**",
        timestamp: Date.now(),
      },
    ]);
    setInput("");
    setUserDescription("");
    setFollowUps([]);
    setFollowUpIndex(0);
    setResponses({});
    setLoading(false);
    setAnalyzing(false);
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-16 pb-8 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-900/30 border border-emerald-800/50 text-emerald-400 text-xs font-mono font-bold tracking-wider mb-6">
          🎯 FREE CONSULTATION
        </div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">
          AI Operations <span className="text-emerald-400">Advisor</span>
        </h1>
        <p className="text-stone-400 text-base max-w-xl mx-auto">
          Tell us about your team's pain points. We'll identify automation opportunities and estimate your savings.
        </p>
      </section>

      {/* Chat Interface */}
      <section className="max-w-2xl mx-auto px-6 pb-20">
        <div className="bg-stone-900/50 border border-stone-800 rounded-2xl overflow-hidden">
          {/* Messages */}
          <div className="h-[400px] overflow-y-auto p-6 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div
                  className={`h-8 w-8 rounded-full border flex items-center justify-center shrink-0 text-sm ${
                    msg.role === "advisor"
                      ? "bg-emerald-950/50 border-emerald-800 text-emerald-400"
                      : "bg-stone-800 border-stone-700 text-stone-300"
                  }`}
                >
                  {msg.role === "advisor" ? "🎯" : "👤"}
                </div>
                <div
                  className={`max-w-[80%] rounded-xl p-4 text-sm leading-relaxed border whitespace-pre-line ${
                    msg.role === "advisor"
                      ? "bg-stone-950 border-stone-800 text-stone-300"
                      : "bg-stone-800/50 border-stone-700 text-white"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {(loading || analyzing) && (
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-emerald-950/50 border border-emerald-800 flex items-center justify-center text-sm animate-pulse">
                  🎯
                </div>
                <div className="bg-stone-950 border border-stone-800 rounded-xl p-4">
                  <div className="flex gap-1.5">
                    <span className="h-2 w-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="p-4 border-t border-stone-800">
            {step !== "results" ? (
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    step === "greeting"
                      ? "Describe your team's biggest frustration..."
                      : "Tell me more..."
                  }
                  disabled={loading || analyzing}
                  className="flex-1 bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-700 placeholder-stone-600 text-stone-200 disabled:opacity-50"
                />
                <button
                  onClick={() => handleSend(input)}
                  disabled={!input.trim() || loading || analyzing}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-stone-700 disabled:text-stone-400 text-black font-bold text-sm px-5 py-3 rounded-xl transition-all"
                >
                  Send
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={handleRestart}
                  className="flex-1 bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-sm py-3 rounded-xl transition-all"
                >
                  🔄 Start New Assessment
                </button>
                <a
                  href="/tools/can-we-automate-this"
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm py-3 rounded-xl text-center transition-all"
                >
                  🔍 Try Detailed Analyzer
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Result Action Cards (shown after analysis) */}
        {step === "results" && (
          <div className="mt-6 space-y-3">
            <div className="bg-gradient-to-br from-emerald-950/30 to-stone-900/60 border border-emerald-900/40 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">🚀</span>
                <div>
                  <h3 className="font-bold text-emerald-400">Ready to automate?</h3>
                  <p className="text-xs text-stone-400">
                    Deploy your AI Operations Team and start saving hours today
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <a
                  href="https://buy.stripe.com/eVq14p74P43RaXxfig2Fa0k"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm py-3 rounded-xl text-center transition-all"
                >
                  🛒 Deploy Now — $750/mo
                </a>
                <a
                  href="/contact"
                  className="px-6 bg-stone-800 hover:bg-stone-700 text-stone-200 text-sm font-bold py-3 rounded-xl transition-all whitespace-nowrap"
                >
                  Book Consultation
                </a>
              </div>
            </div>

            <div className="text-center">
              <a
                href="/"
                className="text-xs text-stone-400 hover:text-stone-300 font-mono transition-all"
              >
                ← Back to Home
              </a>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
