import { useState, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/tools/ai-advisor")({
  component: AIAdvisor,
});

interface ChatMessage {
  role: "advisor" | "user";
  text: string;
  timestamp: number;
}

function AIAdvisor() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "advisor",
      text: "Hi! I'm your AI Operations Advisor.\n\nI can help you:\n\u2022 Identify automation opportunities for your business\n\u2022 Explain our 18 AI agent types and which fits your needs\n\u2022 Answer questions about pricing, integrations, and how it works\n\u2022 Walk through our free tools\n\n**What would you like to know?**",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", text, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId: sessionId || undefined,
        }),
      });
      const data = await res.json();

      const advisorMsg: ChatMessage = {
        role: "advisor",
        text: data.reply || "Thanks for sharing! Let me think about that...",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, advisorMsg]);

      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "advisor",
          text: "Sorry, I encountered an issue. Please try again.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  const handleRestart = () => {
    setSessionId("");
    setMessages([
      {
        role: "advisor",
        text: "Hi! I'm your AI Operations Advisor.\n\nI can help you:\n\u2022 Identify automation opportunities for your business\n\u2022 Explain our 18 AI agent types and which fits your needs\n\u2022 Answer questions about pricing, integrations, and how it works\n\u2022 Walk through our free tools\n\n**What would you like to know?**",
        timestamp: Date.now(),
      },
    ]);
    setInput("");
    setLoading(false);
  };

  const suggestedPrompts = [
    "What AI agents can help with invoice processing?",
    "How much does it cost to get started?",
    "What integrations do you support?",
    "Can you automate healthcare patient intake?",
  ];

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <div className="max-w-3xl mx-auto px-6 pt-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-bold text-stone-400 hover:text-emerald-400 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to Simpler Life 100
        </Link>
      </div>
      <section className="max-w-3xl mx-auto px-6 pt-12 pb-8 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-900/30 border border-emerald-800/50 text-emerald-400 text-xs font-mono font-bold tracking-wider mb-6">
          AI-POWERED \u2022 FREE TO USE
        </div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">
          AI Operations <span className="text-emerald-400">Advisor</span>
        </h1>
        <p className="text-stone-400 text-base max-w-xl mx-auto">
          Ask anything about automating your operations. Our AI knows all 18 agent types, 23 industries, and 180+ integrations.
        </p>
      </section>

      <section className="max-w-2xl mx-auto px-6 pb-20">
        <div className="bg-stone-900/50 border border-stone-800 rounded-2xl overflow-hidden">
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
                  {msg.role === "advisor" ? "\u{1F3AF}" : "\u{1F464}"}
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

            {loading && (
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-emerald-950/50 border border-emerald-800 flex items-center justify-center text-sm animate-pulse">
                  {"\u{1F3AF}"}
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

            {messages.length <= 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    disabled={loading}
                    className="text-left bg-stone-900/50 hover:bg-stone-900 hover:border-stone-700 border border-stone-800/80 p-3 rounded-xl text-[11px] leading-snug font-medium text-stone-400 hover:text-stone-200 transition-all disabled:opacity-50"
                  >
                    {"\u{1F4A1}"} {prompt}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-stone-800">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything about automating your operations..."
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
            {messages.length > 1 && (
              <button onClick={handleRestart} className="mt-3 text-xs text-stone-500 hover:text-stone-300 transition-colors">
                {"\u{1F504}"} Start new conversation
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a href="/tools/can-we-automate-this" className="bg-stone-900/50 border border-stone-800 rounded-xl p-4 hover:border-emerald-800/50 transition-all group">
            <div className="flex items-center gap-3">
              <span className="text-xl">{"\u{1F50D}"}</span>
              <div>
                <h3 className="font-bold text-stone-200 text-sm group-hover:text-emerald-400">Can We Automate This?</h3>
                <p className="text-xs text-stone-500">Detailed process analyzer</p>
              </div>
            </div>
          </a>
          <a href="/roi-calculator" className="bg-stone-900/50 border border-stone-800 rounded-xl p-4 hover:border-emerald-800/50 transition-all group">
            <div className="flex items-center gap-3">
              <span className="text-xl">{"\u{1F4B0}"}</span>
              <div>
                <h3 className="font-bold text-stone-200 text-sm group-hover:text-emerald-400">ROI Calculator</h3>
                <p className="text-xs text-stone-500">See your potential savings</p>
              </div>
            </div>
          </a>
        </div>
      </section>
    </div>
  );
}
