import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/inbox/")({
  component: UnifiedInbox,
});

interface InboxItem {
  id: string;
  source: "email" | "document" | "sms" | "chat" | "task";
  title: string;
  sender: string;
  time: string;
  content: string;
  aiCategory: "Exception Needed" | "Auto-Processed" | "Information" | "Action Required";
  aiReasoning: string;
  confidenceScore: number;
  status: "Unresolved" | "Resolved" | "Processing";
  details: Record<string, string>;
}

function UnifiedInbox() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "email" | "document" | "sms" | "chat" | "task">("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "Exception Needed" | "Auto-Processed" | "Information" | "Action Required">("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>("item-1");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [replyText, setReplyText] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Initial Seeding / Loading
  useEffect(() => {
    // Check if the backend database has any unified inbox data or seed standard items
    (async () => {
      try {
        const res = await fetch("/api/data/inbox", { credentials: "include" });
        const d = await res.json();
        
        if (d.data && d.data.length > 0) {
          setItems(d.data);
        } else {
          // Seed standard default items to the database
          const defaultItems: InboxItem[] = [
            {
              id: "item-1",
              source: "email",
              title: "Discrepancy: Invoice #INV-2026-901",
              sender: "finance@globalcorp.com",
              time: "10 mins ago",
              content: "Hi team, we received your invoice for the quarterly audit, but the billing entity listed is 'Simpler Life Corporate' instead of our local entity 'Simpler Life Operations'. Can you please update and re-send?",
              aiCategory: "Exception Needed",
              aiReasoning: "Billing entity name mismatch found during automated matching routine. The vendor is requesting an override on our billing registry.",
              confidenceScore: 98,
              status: "Unresolved",
              details: {
                "Sent To": "billing@simplerlife100.com",
                "Vendor Code": "GLOBAL_CORP_99",
                "Stripe Transaction": "ch_3Mv89xLkd"
              }
            },
            {
              id: "item-2",
              source: "document",
              title: "W9_Tax_Form_Jenkins.pdf",
              sender: "Sarah Jenkins (Portal Upload)",
              time: "1 hour ago",
              content: "[Scanned PDF File Upload] Tax ID: XX-XXX4912, Entity: Sarah Jenkins Consulting LLC. Document has been verified by OCR extraction.",
              aiCategory: "Auto-Processed",
              aiReasoning: "RAG & OCR analysis confirmed Tax ID format matches regulatory schema. Verified without operational exception.",
              confidenceScore: 100,
              status: "Resolved",
              details: {
                "Parsed Fields": "TaxID: 12-3454912, Signature: Verified",
                "Store Status": "Turso Cloud DB",
                "Integrations": "QuickBooks Sync Completed"
              }
            },
            {
              id: "item-3",
              source: "sms",
              title: "SMS: Shipment Delayed for PO-391",
              sender: "+1 (555) 902-1823",
              time: "2 hours ago",
              content: "Alert: Carrier dispatch reports PO-391 container is delayed at port entry. Delayed arrival expected July 08 instead of July 05.",
              aiCategory: "Action Required",
              aiReasoning: "Logistical schedule delta exceeds 48-hour tolerance limit. Automatic notification sent to Charlie CRM to update client portal.",
              confidenceScore: 94,
              status: "Unresolved",
              details: {
                "Carrier Link": "Apex Logistix Terminal 2",
                "Affected Clients": "Simpler Life Retail Group",
                "Tracking ID": "APX_90218_CN"
              }
            },
            {
              id: "item-4",
              source: "chat",
              title: "Live Chat: Plan Upgrade Quote",
              sender: "Guest User #4029 (Live Website)",
              time: "4 hours ago",
              content: "Hey, we are currently evaluating your Starter Implementation plan but need 6 custom AI employees instead of 2. Can we get a customized enterprise quote?",
              aiCategory: "Information",
              aiReasoning: "Out-of-scope package query. Pre-compiled enterprise blueprint options routed to Quentin Quote for manual negotiation.",
              confidenceScore: 89,
              status: "Resolved",
              details: {
                "Client IP": "108.162.193.5",
                "Estimated Deal Value": "$15,000.00 / yr",
                "Assigned Representative": "Quentin Quote (Logistics Agent)"
              }
            },
            {
              id: "item-5",
              source: "task",
              title: "Task Trace: Failed Bank Wire",
              sender: "Caleb Collections (Accounts Rep)",
              time: "1 day ago",
              content: "Bank wire rejection notice received for $2,500.00 audit retainer from client 'Omega Services'. Rejection Code: NSF_501.",
              aiCategory: "Exception Needed",
              aiReasoning: "Non-sufficient funds (NSF) triggers retry cooldown. Manual collection workflow initiated.",
              confidenceScore: 97,
              status: "Unresolved",
              details: {
                "Transaction Reference": "TX_901283_WIRE",
                "Last Active Attempt": "July 03, 11:20 AM",
                "Client Account": "Omega Holding Corp"
              }
            }
          ];

          // Save default seed values to database
          await fetch("/api/data/inbox", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ data: defaultItems }),
          });

          setItems(defaultItems);
        }
        setLoading(false);
      } catch (err) {
        console.error("Unified Inbox loading / seeding error:", err);
        setLoading(false);
      }
    })();
  }, []);

  const handleStatusChange = async (itemId: string, newStatus: "Unresolved" | "Resolved") => {
    try {
      setFeedback(`Updating item state to ${newStatus}...`);
      const updatedItems = items.map((itm) => {
        if (itm.id === itemId) {
          return { ...itm, status: itm.status === "Resolved" ? "Unresolved" as const : "Resolved" as const };
        }
        return itm;
      });

      setItems(updatedItems);

      // Persist the changes
      await fetch("/api/data/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data: updatedItems }),
      });

      // Trigger audit log action
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "inbox_resolve",
          resource: itemId,
          details: { id: itemId, status: newStatus },
        }),
      });

      setFeedback(`Success: Item is now marked as ${newStatus}!`);
      setTimeout(() => setFeedback(""), 2000);
    } catch (err) {
      console.error(err);
      setFeedback("Failed to update item state.");
    }
  };

  const handleSendDraftReply = async (itemId: string) => {
    if (!replyText.trim()) return;
    setIsSendingReply(true);
    setFeedback("Drafting response using RAG Context Matrix...");

    try {
      // Simulate/Trigger active response pipeline
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "inbox_reply",
          resource: itemId,
          details: { reply: replyText },
        }),
      });

      setFeedback("Success: Response sent successfully!");
      setReplyText("");
      setIsSendingReply(false);
      setTimeout(() => setFeedback(""), 2000);
    } catch (err) {
      console.error(err);
      setFeedback("Failed to send response.");
      setIsSendingReply(false);
    }
  };

  // Filter & Search Logic
  const filteredItems = items.filter((itm) => {
    const matchesSearch =
      itm.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      itm.sender.toLowerCase().includes(searchTerm.toLowerCase()) ||
      itm.content.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSource = sourceFilter === "all" || itm.source === sourceFilter;
    const matchesCategory = categoryFilter === "all" || itm.aiCategory === categoryFilter;

    return matchesSearch && matchesSource && matchesCategory;
  });

  const selectedItem = items.find((i) => i.id === selectedItemId);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-2 border-stone-800 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-stone-400 text-[10px] font-mono uppercase tracking-widest">Compiling Inbox...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-stone-100 select-none">
      
      {/* ─── Header Operations Center ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-stone-900 pb-5 gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">📥 Unified Operations Inbox</h1>
          <p className="text-stone-400 text-xs mt-1">Single operations console aggregates incoming emails, documents, SMS alerts, and AI exceptions.</p>
        </div>

        {/* Real-time telemetry widgets */}
        <div className="flex gap-4">
          <div className="bg-stone-950 border border-stone-900 px-4 py-2 rounded-xl text-center">
            <span className="text-[9px] font-mono tracking-wider text-stone-500 uppercase block">UNRESOLVED</span>
            <span className="text-lg font-bold text-rose-500 font-mono">
              {items.filter((i) => i.status === "Unresolved").length}
            </span>
          </div>
          <div className="bg-stone-950 border border-stone-900 px-4 py-2 rounded-xl text-center">
            <span className="text-[9px] font-mono tracking-wider text-stone-500 uppercase block">AUTO-PROCESSED</span>
            <span className="text-lg font-bold text-emerald-500 font-mono">
              {items.filter((i) => i.aiCategory === "Auto-Processed").length}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Search & Filters Bar ─── */}
      <div className="flex flex-col md:flex-row gap-4 bg-stone-950 p-4 border border-stone-900 rounded-xl">
        <input
          type="text"
          placeholder="Search items by keywords, sender name, or title..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-stone-900/50 border border-stone-900 rounded-lg px-4 py-2.5 text-xs outline-none focus:border-stone-800 placeholder-stone-600 font-medium text-stone-200"
        />

        <div className="flex flex-wrap gap-2">
          {/* Source Filter Select */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as any)}
            className="bg-stone-900 border border-stone-900 rounded-lg px-3 py-2 text-[10px] font-mono font-bold text-stone-300 outline-none focus:border-stone-800"
          >
            <option value="all">ALL SOURCES</option>
            <option value="email">📧 EMAILS</option>
            <option value="document">📄 DOCUMENTS</option>
            <option value="sms">💬 SMS ALERTS</option>
            <option value="chat">👤 LIVE CHAT</option>
            <option value="task">⚡ AI TASKS</option>
          </select>

          {/* Category Filter Select */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as any)}
            className="bg-stone-900 border border-stone-900 rounded-lg px-3 py-2 text-[10px] font-mono font-bold text-stone-300 outline-none focus:border-stone-800"
          >
            <option value="all">ALL CATEGORIES</option>
            <option value="Exception Needed">⚠️ EXCEPTIONS</option>
            <option value="Auto-Processed">⚙️ AUTO-PROCESSED</option>
            <option value="Information">ℹ️ INFO</option>
            <option value="Action Required">⚡ ACTION NEEDED</option>
          </select>
        </div>
      </div>

      {/* ─── Main Feed Area (Columns) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Col: Inbox Item Feed List (Grid 5/12) */}
        <div className="lg:col-span-5 space-y-3 max-h-[550px] overflow-y-auto pr-1">
          {filteredItems.length === 0 ? (
            <div className="text-center py-10 bg-stone-950 border border-stone-900 rounded-xl space-y-2">
              <span className="text-3xl block opacity-45">📭</span>
              <p className="text-xs font-mono text-stone-500 uppercase tracking-widest">No active items matched</p>
            </div>
          ) : (
            filteredItems.map((itm) => {
              const isSelected = selectedItemId === itm.id;
              return (
                <div
                  key={itm.id}
                  onClick={() => setSelectedItemId(itm.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? "bg-stone-900 border-stone-800 shadow-md"
                      : "bg-stone-950 border-stone-900/60 hover:border-stone-800"
                  }`}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        {itm.source === "email" ? "📧" :
                         itm.source === "document" ? "📄" :
                         itm.source === "sms" ? "💬" :
                         itm.source === "chat" ? "👤" : "⚡"}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-stone-400 truncate max-w-[150px]">{itm.sender}</span>
                    </div>
                    <span className="text-[9px] font-mono text-stone-500">{itm.time}</span>
                  </div>

                  <h4 className="font-bold text-xs text-white mt-2 truncate leading-tight">{itm.title}</h4>
                  <p className="text-[10px] text-stone-400 mt-1 truncate leading-relaxed">{itm.content}</p>

                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-stone-900/60">
                    <span className={`text-[8px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      itm.aiCategory === "Exception Needed" ? "bg-rose-950/50 text-rose-400 border border-rose-900" :
                      itm.aiCategory === "Auto-Processed" ? "bg-emerald-950/50 text-emerald-400 border border-emerald-900" :
                      itm.aiCategory === "Action Required" ? "bg-amber-950/50 text-amber-400 border border-amber-900" :
                      "bg-blue-950/50 text-blue-400 border border-blue-900"
                    }`}>
                      {itm.aiCategory}
                    </span>

                    <span className={`text-[8px] font-mono uppercase font-bold tracking-wider ${
                      itm.status === "Unresolved" ? "text-rose-500 animate-pulse" : "text-stone-500"
                    }`}>
                      {itm.status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Col: Detailed View & Action Panel (Grid 7/12) */}
        <div className="lg:col-span-7 bg-stone-950 border border-stone-900 rounded-2xl min-h-[500px] flex flex-col justify-between overflow-hidden">
          {selectedItem ? (
            <>
              {/* Detailed Header */}
              <div className="border-b border-stone-900 p-5 bg-stone-950/50 flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {selectedItem.source === "email" ? "📧" :
                       selectedItem.source === "document" ? "📄" :
                       selectedItem.source === "sms" ? "💬" :
                       selectedItem.source === "chat" ? "👤" : "⚡"}
                    </span>
                    <span className="text-xs font-bold text-stone-300">{selectedItem.sender}</span>
                  </div>
                  <h3 className="font-black text-sm text-white tracking-tight leading-snug">{selectedItem.title}</h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleStatusChange(selectedItem.id, selectedItem.status === "Resolved" ? "Unresolved" : "Resolved")}
                    className={`text-[10px] font-mono font-bold px-3.5 py-1.5 rounded-lg border transition-all ${
                      selectedItem.status === "Resolved"
                        ? "bg-stone-900 text-stone-400 border-stone-800"
                        : "bg-emerald-950/50 hover:bg-emerald-950 text-emerald-400 border-emerald-900"
                    }`}
                  >
                    {selectedItem.status === "Resolved" ? "✓ Resolved" : "⚙ Resolve Item"}
                  </button>
                </div>
              </div>

              {/* Body Content Details */}
              <div className="flex-1 p-5 space-y-6 overflow-y-auto max-h-[350px]">
                
                {/* Content Box */}
                <div className="space-y-2">
                  <span className="text-[9px] font-mono tracking-wider text-stone-500 uppercase block">INCOMING CONTENT</span>
                  <div className="bg-stone-900/30 border border-stone-900 p-4 rounded-xl text-xs leading-relaxed text-stone-300 whitespace-pre-line font-medium">
                    {selectedItem.content}
                  </div>
                </div>

                {/* AI Reasoning Blueprint Box */}
                <div className="bg-stone-900/50 border border-stone-900 p-4 rounded-xl space-y-3">
                  <div className="flex justify-between items-center select-none">
                    <span className="text-[9px] font-mono tracking-wider text-emerald-500 uppercase font-black">AI COGNITIVE ANALYTICS</span>
                    <div className="text-[10px] font-mono text-stone-500">
                      Conf. Score: <span className="font-bold text-emerald-400 font-mono">{selectedItem.confidenceScore}%</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-stone-300 leading-relaxed font-semibold">
                    {selectedItem.aiReasoning}
                  </p>
                </div>

                {/* Technical Meta Key-Value table */}
                <div className="space-y-2 select-none">
                  <span className="text-[9px] font-mono tracking-wider text-stone-500 uppercase block">METADATA TRACE</span>
                  <div className="bg-stone-900/20 border border-stone-900 rounded-xl overflow-hidden text-[10px] font-mono">
                    {Object.entries(selectedItem.details).map(([key, val]) => (
                      <div key={key} className="flex justify-between p-3 border-b border-stone-900/60 last:border-0">
                        <span className="text-stone-500 font-bold uppercase">{key}</span>
                        <span className="text-stone-300 font-bold">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Response Drafting Bar */}
              <div className="p-4 border-t border-stone-900 bg-stone-950/80">
                <div className="space-y-2">
                  <label className="block text-[9px] font-mono tracking-wider text-stone-500 uppercase select-none">
                    Compose Draft Response
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type email reply or SMS notification draft..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="flex-1 bg-stone-900/40 border border-stone-900 rounded-lg px-4 py-2.5 text-xs outline-none focus:border-stone-850 font-medium placeholder-stone-600 text-stone-200"
                    />
                    <button
                      onClick={() => handleSendDraftReply(selectedItem.id)}
                      disabled={isSendingReply || !replyText.trim()}
                      className="bg-white hover:bg-stone-100 text-black text-xs font-mono font-bold px-4 py-2.5 rounded-lg transition-all disabled:opacity-50"
                    >
                      Draft
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col justify-center items-center text-center p-10 text-stone-500 space-y-2">
              <span className="text-4xl block opacity-40">📥</span>
              <h3 className="font-bold text-xs text-stone-400">No active operations ticket loaded</h3>
              <p className="text-[10px] leading-relaxed max-w-xs mx-auto">
                Select an incoming notification or AI exception tag from the workspace feed list on the left to review telemetry details and initiate manual overrides.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* ─── Feedback Toast Confirmation ─── */}
      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp select-none">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}

    </div>
  );
}
