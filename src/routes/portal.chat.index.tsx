import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/portal/chat/")({
  component: ChatAssistant,
});

function ChatAssistant() {
  const [messages, setMessages] = useState([
    {
      sender: "ai",
      time: "11:30 AM",
      text: "Hello! I am your Simpler Life 100 AI Operations Assistant. I can help you monitor workflows, explain task failures, lookup database registers, and audit active agents. What can I do for you today?",
    },
    {
      sender: "user",
      time: "11:31 AM",
      text: "Why did workflow WF-LE-606 fail yesterday?",
    },
    {
      sender: "ai",
      time: "11:31 AM",
      text: "Workflow WF-LE-606 (SLA Vendor Contract Auditing) failed at step 'Extract Liability Parameters'. The run logs indicate the document 'PO_3910.xlsx' was missing the mandatory 'Tax ID Number' field on the metadata index. I have automatically routed this task to the Human Approval Queue for manual index overriding.",
    },
  ]);

  const [inputText, setInputText] = useState("");

  const suggestedPrompts = [
    "Show failed workflows",
    "Generate monthly report",
    "Find invoice 1032",
    "Search customer records",
    "Explain workflow",
    "Why did this fail?",
    "Build workflow",
    "Forecast savings",
  ];

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    const userMsg = {
      sender: "user",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");

    // Call the real API
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      const aiMsg = {
        sender: "ai",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: data.reply || "I processed your request.",
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      const aiMsg = {
        sender: "ai",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: "Sorry, I encountered an error processing your request.",
      };
      setMessages((prev) => [...prev, aiMsg]);
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-10rem)] max-w-5xl mx-auto">
      {/* Header */}
      <div className="border-b border-stone-200 pb-4 shrink-0">
        <h1 className="text-3xl font-black text-stone-900 tracking-tight">💬 AI Chat Assistant</h1>
        <p className="text-stone-500 mt-1">Chat directly with the orchestrator AI to ask questions, update instructions, or query run audits.</p>
      </div>

      {/* Chat Messages Frame */}
      <div className="flex-1 bg-white rounded-3xl border border-stone-200 shadow-sm flex flex-col overflow-hidden min-h-0">
        {/* Messages list */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-4 ${msg.sender === "user" ? "flex-row-reverse" : ""}`}>
              {/* Avatar */}
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 select-none ${
                msg.sender === "ai" ? "bg-emerald-600 text-white" : "bg-stone-250 text-stone-700 border border-stone-300"
              }`}>
                {msg.sender === "ai" ? "🤖" : "👤"}
              </div>

              {/* Message Body */}
              <div className={`max-w-lg rounded-2xl p-4 text-xs font-semibold leading-relaxed shadow-sm ${
                msg.sender === "ai"
                  ? "bg-stone-50 border border-stone-200 text-stone-850 rounded-tl-none"
                  : "bg-emerald-600 text-white rounded-tr-none"
              }`}>
                <div className="flex justify-between items-center gap-4 mb-1">
                  <span className="font-black text-[10px] uppercase tracking-wider text-stone-400">
                    {msg.sender === "ai" ? "Orchestrator AI" : "Client User"}
                  </span>
                  <span className="text-[9px] opacity-70">{msg.time}</span>
                </div>
                <p className="whitespace-pre-line">{msg.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Suggested Prompt Chips */}
        <div className="px-6 py-3 bg-stone-50 border-t border-stone-150 shrink-0 flex flex-wrap gap-2">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => handleSend(prompt)}
              className="bg-white hover:bg-emerald-50 hover:text-emerald-700 text-stone-600 font-bold text-[10px] px-3 py-1.5 rounded-full border border-stone-250 transition-all select-none"
            >
              💡 {prompt}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-stone-200 shrink-0 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(inputText);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              placeholder="Ask me to search data, test pipelines, or list tasks..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
            />
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-bold text-sm shadow-md transition-all select-none"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
