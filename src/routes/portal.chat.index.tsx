import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";

export const Route = createFileRoute("/portal/chat/")({
  component: ChatAssistant,
});

interface ChatMessage {
  sender: "ai" | "user";
  time: string;
  text: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
}

function ChatAssistant() {
  const [sessions, setSessions] = useState<ChatSession[]>([
    {
      id: "session-1",
      title: "Invoice AI Reconciliation Error",
      messages: [
        {
          sender: "user",
          time: "10:14 AM",
          text: "Why did Invoice AI fail on GlobalCorp invoice reconciliation yesterday?"
        },
        {
          sender: "ai",
          time: "10:15 AM",
          text: "Let me trace that specific run. On July 03 at 04:12 PM, Invoice AI attempted reconciliation for GlobalCorp Invoice #I-9102.\n\nReconciliation was halted because the Stripe metadata payload lacked the matching purchase order reference 'PO-2026-X'.\n\nI have created a human approval exception card for you on the Dashboard to either manually map the reference or override the mismatch."
        }
      ]
    },
    {
      id: "session-2",
      title: "Workflow Cost Savings Audit",
      messages: [
        {
          sender: "user",
          time: "09:30 AM",
          text: "Show me a brief summary of how much we've saved this month."
        },
        {
          sender: "ai",
          time: "09:31 AM",
          text: "Across all 5 deployed AI coworkers (Sarah, Charlie, Quentin, Ivy, and Caleb), you saved an estimated **47.2 labor hours** this week, translating to approximately **$2,124 in operational savings**.\n\nThe highest performing agent is **Ivy Invoice (Billing Coordinator)**, who auto-reconciled 420 Stripe receipts with 100% accuracy."
        }
      ]
    }
  ]);

  const [activeSessionId, setActiveSessionId] = useState<string>("session-1");
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeSessionMessagesLength(activeSession())]);

  function activeSessionMessages() {
    return employeeMessages();
  }

  // Safely get active messages
  const currentMessages = employee() ? employee().messages : [];

  function employee() {
    return sessions.find(s => s.id === activeSessionId) || null;
  }

  function activeSessionMessagesLength(session: ChatSession | null) {
    return session ? session.messages.length : 0;
  }

  function activeSession() {
    return sessions.find(s => s.id === activeSessionId) || null;
  }

  function employeeMessages() {
    const session = activeSession();
    return session ? session.messages : [];
  }

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    const timeString = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsg: ChatMessage = {
      sender: "user",
      time: timeString,
      text: text,
    };

    // Append user message to active session
    const updatedSessions = sessions.map((s) => {
      if (s.id === activeSessionId) {
        return {
          ...s,
          messages: [...s.messages, userMsg],
        };
      }
      return s;
    });
    setSessions(updatedSessions);
    setInputText("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      
      const aiMsg: ChatMessage = {
        sender: "ai",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: data.reply || "Request processed successfully.",
      };

      setSessions((prevSessions) =>
        prevSessions.map((s) => {
          if (s.id === activeSessionId) {
            return {
              ...s,
              messages: [...s.messages, aiMsg],
            };
          }
          return s;
        })
      );
    } catch (err) {
      console.error(err);
      const errMsg: ChatMessage = {
        sender: "ai",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: "Sorry, I encountered an error communicating with the orchestrator engine.",
      };
      setSessions((prevSessions) =>
        prevSessions.map((s) => {
          if (s.id === activeSessionId) {
            return { ...s, messages: [...s.messages, errMsg] };
          }
          return s;
        })
      );
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = () => {
    const newId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: `New Operations Inquiry`,
      messages: [],
    };
    setSessions([newSession, ...sessions]);
    setActiveSessionId(newId);
  };

  const suggestedPrompts = [
    "Show me failed workflows from this week",
    "Which AI coworker saved the most hours?",
    "Build a dispatch notification workflow",
    "How much money did we save?",
  ];

  return (
    <div className="flex h-[calc(100vh-10rem)] max-w-6xl mx-auto bg-stone-950 border border-stone-900 rounded-2xl overflow-hidden text-stone-100">
      
      {/* ─── Conversational Sidebar ─── */}
      <aside className="w-64 border-r border-stone-900 bg-stone-950 flex flex-col justify-between shrink-0 hidden md:flex select-none">
        <div className="p-4 space-y-4 flex-1 flex flex-col overflow-hidden">
          <button
            onClick={handleNewChat}
            className="w-full bg-stone-900 hover:bg-stone-850 border border-stone-800 text-xs font-mono font-bold text-white py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all"
          >
            <span>💬</span> New Chat Thread
          </button>

          <div className="space-y-1.5 flex-1 overflow-y-auto">
            <p className="text-[9px] font-mono tracking-widest text-stone-500 uppercase px-2 mb-2">PAST DISCUSSIONS</p>
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSessionId(s.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs truncate font-medium transition-all ${
                  activeSessionId === s.id
                    ? "bg-stone-900 text-white font-bold border border-stone-800"
                    : "text-stone-400 hover:text-stone-200 hover:bg-stone-900/30"
                }`}
              >
                📝 {s.title}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-stone-900 bg-stone-950/50 text-[10px] font-mono text-stone-500 space-y-1">
          <div>Engine: Llama 3.3 Orchestrator</div>
          <div>Status: Fully Connected</div>
        </div>
      </aside>

      {/* ─── Primary Chat Interface Frame ─── */}
      <main className="flex-1 flex flex-col bg-stone-950 relative overflow-hidden">
        
        {/* Messages List Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Welcoming Centered Prompt if chat is empty */}
          {currentMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-lg mx-auto text-center space-y-8 select-none py-10">
              <div className="space-y-3">
                <div className="h-12 w-12 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center text-xl mx-auto shadow-md">
                  🤖
                </div>
                <h2 className="text-xl font-black text-white tracking-tight">How can I help you today?</h2>
                <p className="text-stone-400 text-xs leading-relaxed max-w-sm">
                  Ask me to lookup runtime database logs, generate summary financial reports, explain coworkers tasks, or create whole new workflows.
                </p>
              </div>

              {/* Suggested prompt grids */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    className="text-left bg-stone-900/50 hover:bg-stone-900 hover:border-stone-800 border border-stone-900/80 p-3.5 rounded-xl text-[11px] leading-snug font-medium text-stone-300 hover:text-white transition-all transition-duration-300 select-none"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // Message Feed
            <div className="space-y-6">
              {currentMessages.map((msg, idx) => (
                <div key={idx} className={`flex gap-4 ${msg.sender === "user" ? "flex-row-reverse" : ""}`}>
                  
                  {/* Chat Avatar */}
                  <div className={`h-8 w-8 rounded-full border flex items-center justify-center shrink-0 font-mono font-bold text-xs select-none ${
                    msg.sender === "ai" 
                      ? "bg-emerald-950/50 text-emerald-400 border-emerald-900" 
                      : "bg-stone-900 text-stone-300 border-stone-800"
                  }`}>
                    {msg.sender === "ai" ? "🤖" : "👤"}
                  </div>

                  {/* Message Bubble Box */}
                  <div className={`max-w-xl rounded-xl p-4 leading-relaxed space-y-2 border ${
                    msg.sender === "ai"
                      ? "bg-stone-950 border-stone-900 text-stone-300"
                      : "bg-stone-900/50 border-stone-800 text-white"
                  }`}>
                    <div className="flex justify-between items-center text-[9px] font-mono text-stone-500">
                      <span className="font-bold uppercase tracking-wider">{msg.sender === "ai" ? "Orchestrator AI" : "You (John)"}</span>
                      <span>{msg.time}</span>
                    </div>
                    <div className="text-xs font-medium whitespace-pre-line leading-relaxed">
                      {msg.text}
                    </div>
                  </div>

                </div>
              ))}

              {loading && (
                <div className="flex gap-4">
                  <div className="h-8 w-8 rounded-full bg-emerald-950/50 border border-emerald-900 text-emerald-400 flex items-center justify-center shrink-0 font-mono font-bold text-xs select-none animate-pulse">
                    🤖
                  </div>
                  <div className="bg-stone-950 border border-stone-900 rounded-xl p-4 space-y-2 max-w-xl">
                    <div className="flex gap-1.5 py-1">
                      <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

        </div>

        {/* Input Text Form Area */}
        <div className="p-4 border-t border-stone-900 shrink-0 bg-stone-950">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(inputText);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              placeholder="Query task logs, build workflows, or audit coworker states..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-stone-900/40 border border-stone-900 rounded-lg px-4 py-2.5 text-xs outline-none focus:border-stone-800 font-medium placeholder-stone-600 text-stone-200"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-white hover:bg-stone-100 text-black text-xs font-mono font-bold px-4 py-2.5 rounded-lg transition-all select-none disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>

      </main>

    </div>
  );
}
