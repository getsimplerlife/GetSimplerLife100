import { useState, useRef, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/tools/ai-advisor")({
  component: AIAdvisor,
});

// ── Chat Flow Types ──────────────────────────────────────────────────────

interface ChatMessage {
  role: "advisor" | "user";
  text: string;
  timestamp: number;
}

// ── Component ─────────────────────────────────────────────────────────────

function AIAdvisor() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "advisor",
      text: "Hi! I'm your AI Operations Advisor. 🎯\n\nTell me — **what repetitive process frustrates your team the most?** Describe it, and I'll build an automation plan for you.",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addMessage = (role: "advisor" | "user", text: string) => {
    setMessages((prev) => [...prev, { role, text, timestamp: Date.now() }]);
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    addMessage("user", text);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId }),
      });
      if (!res.ok) throw new Error("Chat request failed");
      const data = await res.json(); // { reply, sessionId, actions }
      
      if (data.sessionId) {
        setSessionId(data.sessionId);
      }

      addMessage("advisor", data.reply);
    } catch (error) {
      console.error(error);
      addMessage("advisor", "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  const handleRestart = () => {
    setMessages([
      {
        role: "advisor",
        text: "Hi! I'm your AI Operations Advisor. 🎯\n\nTell me — **what repetitive process frustrates your team the most?** Describe it, and I'll build an automation plan for you.",
        timestamp: Date.now(),
      },
    ]);
    setInput("");
    setSessionId(undefined);
    setLoading(false);
  };

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
          <div className="h-[450px] overflow-y-auto p-6 space-y-4">
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
                      ? "bg-stone-950 border-stone-800 text-stone-300 animate-fadeIn"
                      : "bg-stone-800/50 border-stone-700 text-white animate-fadeIn"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex gap-3 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-emerald-950/50 border border-emerald-800 flex items-center justify-center text-sm">
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
          <div className="p-4 border-t border-stone-800 bg-stone-900/20">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe a repetitive process or ask a question..."
                disabled={loading}
                className="flex-1 bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-700 placeholder-stone-600 text-stone-200 disabled:opacity-50"
              />
              <button
                onClick={() => handleSend(input)}
                disabled={!input.trim() || loading}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-stone-700 disabled:text-stone-500 text-black font-bold text-sm px-5 py-3 rounded-xl transition-all"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* CTA cards displayed if user has started chatting */}
        {messages.length > 1 && (
          <div className="mt-6 space-y-4">
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

            <div className="flex gap-3 justify-center">
              <button
                onClick={handleRestart}
                className="text-xs text-stone-500 hover:text-stone-300 font-mono transition-all bg-stone-900/40 border border-stone-800 px-4 py-2 rounded-lg"
              >
                🔄 Restart Conversation
              </button>
              <a
                href="/tools/can-we-automate-this"
                className="text-xs text-emerald-500 hover:text-emerald-400 font-mono transition-all bg-stone-900/40 border border-stone-800 px-4 py-2 rounded-lg"
              >
                🔍 Try Detailed Analyzer
              </a>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
