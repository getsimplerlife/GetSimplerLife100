import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/settings/")({
  component: UnifiedSettingsHub,
});

interface ProviderAction {
  name: string;
  description: string;
}

interface ProviderItem {
  id: string;
  name: string;
  category: string;
  authType: string;
  description: string;
  actions: ProviderAction[];
}

interface ConnectionItem {
  id: string;
  userId: string;
  provider: string;
  displayName: string;
  config: Record<string, any>;
  status: "active" | "expired" | "error" | "pending";
  healthAt?: string;
  errorMsg?: string;
  createdAt: string;
  updatedAt: string;
}

interface DeveloperKey {
  name: string;
  type: string;
  value: string;
  _id?: string;
}

interface InvoiceItem {
  id: string;
  type: string;
  amount: string;
  date: string;
}

const verticalIndustries = [
  "Aerospace & Defense",
  "Agriculture & Farming",
  "Automotive & Transportation",
  "Chemical & Biotech",
  "Construction & Real Estate",
  "Consumer Goods & Retail",
  "E-Commerce & Retail",
  "Education & EdTech",
  "Energy, Oil & Gas",
  "Financial Services & Banking",
  "Food & Hospitality",
  "Healthcare & Life Sciences",
  "Insurance",
  "IT Operations & DevOps",
  "Logistics & Supply Chain",
  "Media & Entertainment",
  "Mining & Metallurgy",
  "Pharmaceuticals & Clinical Trials",
  "Professional Services & Consulting",
  "Telecommunications",
  "Utilities & Green Tech",
  "Government & Public Sector",
  "Venture Capital & Private Equity"
];

function UnifiedSettingsHub() {
  const [activeTab, setActiveTab] = useState<"profile" | "connections" | "billing" | "keys">("profile");

  // 1. Business Profile states
  const [companyName, setCompanyName] = useState("Simpler Life Operations");
  const [logoUrl, setLogoUrl] = useState("https://simplerlife100.ctonew.app/logo.png");
  const [industry, setIndustry] = useState("Logistics & Supply Chain");
  const [address, setAddress] = useState("100 Operations Way, Chicago, IL");
  const [phone, setPhone] = useState("(555) 000-1939");
  const [website, setWebsite] = useState("www.wayne.com");
  const [timezone, setTimezone] = useState("America/New_York");
  const [language, setLanguage] = useState("en");

  // AI & Security states (saved under profile/model section)
  const [aiModel, setAIModel] = useState("openai-gpt4o");
  const [temperature, setTemperature] = useState(0.4);
  const [dataRetention, setDataRetention] = useState("30-days");
  const [mfaEnabled, setMfaEnabled] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState("120-mins");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySMS, setNotifySMS] = useState(false);
  const [notifySlack, setNotifySlack] = useState(true);

  // 2. Connected Accounts states
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [loadingConns, setLoadingConns] = useState(false);

  // 3. Plan & Billing states
  const [activePlan, setActivePlan] = useState("Starter Build Package");
  const [planDesc, setPlanDesc] = useState("Includes 2 active AI employees, 3 operational workflows, and 30 days of standard tech support.");
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loadingBilling, setLoadingBilling] = useState(false);

  // 4. API Key states
  const [developerKeys, setDeveloperKeys] = useState<DeveloperKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);

  // General Loading & Feedback
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [feedback, setFeedback] = useState("");

  // Load Business Profile settings on mount
  useEffect(() => {
    fetch("/api/data/settings", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.data && Array.isArray(d.data)) {
          d.data.forEach((item: any) => {
            if (item.key === "companyName") setCompanyName(item.value);
            if (item.key === "logoUrl") setLogoUrl(item.value);
            if (item.key === "industry") setIndustry(item.value);
            if (item.key === "address") setAddress(item.value);
            if (item.key === "phone") setPhone(item.value);
            if (item.key === "website") setWebsite(item.value);
            if (item.key === "timezone") setTimezone(item.value);
            if (item.key === "language") setLanguage(item.value);
            if (item.key === "aiModel") setAIModel(item.value);
            if (item.key === "temperature") setTemperature(parseFloat(item.value) || 0.4);
            if (item.key === "dataRetention") setDataRetention(item.value);
            if (item.key === "mfaEnabled") setMfaEnabled(item.value === "true" || item.value === true);
            if (item.key === "sessionTimeout") setSessionTimeout(item.value);
            if (item.key === "notifyEmail") setNotifyEmail(item.value === "true" || item.value === true);
            if (item.key === "notifySMS") setNotifySMS(item.value === "true" || item.value === true);
            if (item.key === "notifySlack") setNotifySlack(item.value === "true" || item.value === true);
          });
        }
        setLoadingSettings(false);
      })
      .catch((err) => {
        console.error("Error loading settings:", err);
        setLoadingSettings(false);
      });
  }, []);

  // Fetch Connected Accounts on tab click/mount
  const fetchConnectionsData = async () => {
    try {
      setLoadingConns(true);
      const [providersRes, connsRes] = await Promise.all([
        fetch("/api/integrations/providers"),
        fetch("/api/integrations")
      ]);
      const provsData = await providersRes.json();
      const connsData = await connsRes.json();
      setProviders(provsData || []);
      setConnections(connsData || []);
    } catch (err) {
      console.error("Error fetching integrations:", err);
    } finally {
      setLoadingConns(false);
    }
  };

  // Fetch Plan & Billing details
  const fetchBillingData = async () => {
    try {
      setLoadingBilling(true);
      const [billingRes, auditsRes] = await Promise.all([
        fetch("/api/data/billing", { credentials: "include" }),
        fetch("/api/data/audits", { credentials: "include" })
      ]);
      const billingData = await billingRes.json();
      const auditsData = await auditsRes.json();

      setInvoices(billingData.data || []);

      const audits = auditsData.data || [];
      if (audits.length > 0) {
        const latest = audits[audits.length - 1];
        setActivePlan(latest.type || "Starter Implementation");
        if (latest.type.includes("Starter")) {
          setPlanDesc("Includes 2 active AI employees, 3 operational workflows, and 30 days of standard tech support.");
        } else if (latest.type.includes("Growth")) {
          setPlanDesc("Includes 5 active AI employees, cross-department automations, and 60 days of standard tech support.");
        } else if (latest.type.includes("Scale")) {
          setPlanDesc("Includes unlimited AI employees, custom integrations, and 90 days of standard tech support.");
        } else if (latest.type.includes("Audit")) {
          setPlanDesc("Your Deep-Dive AI Opportunity Audit blueprint package is active.");
        } else {
          setPlanDesc("Your custom AI workforce package is active and deployed.");
        }
      }
    } catch (err) {
      console.error("Error loading billing info:", err);
    } finally {
      setLoadingBilling(false);
    }
  };

  // Fetch Developer Keys
  const fetchDeveloperKeys = async () => {
    try {
      setLoadingKeys(true);
      const res = await fetch("/api/data/api", { credentials: "include" });
      const data = await res.json();
      setDeveloperKeys(data.data || []);
    } catch (err) {
      console.error("Error loading developer keys:", err);
    } finally {
      setLoadingKeys(false);
    }
  };

  // Handle Tab switches and load corresponding data
  const handleTabSwitch = (tab: "profile" | "connections" | "billing" | "keys") => {
    setActiveTab(tab);
    if (tab === "connections") fetchConnectionsData();
    if (tab === "billing") fetchBillingData();
    if (tab === "keys") fetchDeveloperKeys();
  };

  // Handle Profile Update Save
  const handleSaveProfile = async (sectionName: string) => {
    try {
      setFeedback(`Saving ${sectionName} settings...`);
      const payload: Record<string, any> = {};

      if (sectionName === "Brand & Profile") {
        payload.companyName = companyName;
        payload.logoUrl = logoUrl;
        payload.industry = industry;
        payload.address = address;
        payload.phone = phone;
        payload.website = website;
      } else if (sectionName === "Regional Options") {
        payload.timezone = timezone;
        payload.language = language;
      } else if (sectionName === "AI Model Gateway") {
        payload.aiModel = aiModel;
        payload.temperature = temperature;
        payload.dataRetention = dataRetention;
      } else if (sectionName === "Security Options") {
        payload.mfaEnabled = mfaEnabled;
        payload.sessionTimeout = sessionTimeout;
      } else if (sectionName === "Notification Channels") {
        payload.notifyEmail = notifyEmail;
        payload.notifySMS = notifySMS;
        payload.notifySlack = notifySlack;
      }

      // Save to generic endpoint row by row
      for (const [key, value] of Object.entries(payload)) {
        await fetch("/api/data/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ section: sectionName, key, value }),
        });
      }

      // Hit specialized settings endpoint
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ section: sectionName, settings: payload }),
      });

      setFeedback(`Success: ${sectionName} updated successfully`);
      setTimeout(() => setFeedback(""), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setFeedback("Error: Failed to save changes.");
    }
  };

  // Sync / Health Trigger for connection
  const handleSyncConnection = async (connectionId: string, displayName: string) => {
    try {
      setFeedback(`Verifying secure link to ${displayName}...`);
      const res = await fetch(`/api/integrations/${connectionId}/sync`);
      const result = await res.json();
      
      if (result.synced) {
        setFeedback(`Success: Connected accounts verified! Health: ${result.health ? "Healthy" : "Attention Required"}`);
        fetchConnectionsData();
      } else {
        setFeedback(`Verification failed: ${result.error || "Unable to sync connection"}`);
      }
      setTimeout(() => setFeedback(""), 3500);
    } catch (err) {
      console.error("Sync connection error:", err);
      setFeedback("Error: Communication link timeout.");
    }
  };

  // Disconnect Handler
  const handleDisconnect = async (connectionId: string, displayName: string) => {
    if (!confirm(`Are you sure you want to disconnect ${displayName}? This will erase active OAuth tokens and disconnect associated AI employees.`)) {
      return;
    }

    try {
      setFeedback(`Erasing credentials for ${displayName}...`);
      const res = await fetch(`/api/integrations/${connectionId}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      if (res.ok) {
        setFeedback(`Success: Safely disconnected ${displayName}`);
        fetchConnectionsData();
      } else {
        const data = await res.json();
        setFeedback(`Error: ${data.error || "Failed to disconnect"}`);
      }
      setTimeout(() => setFeedback(""), 3000);
    } catch (err) {
      console.error("Disconnect error:", err);
      setFeedback("Error: Failed to disconnect integration.");
    }
  };

  // API Developer Action (Generate or Revoke keys)
  const handleKeyAction = async (name: string, action: string) => {
    try {
      setFeedback(`Executing developer request: ${action}...`);
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "api_" + action.toLowerCase(), resource: name }),
      });
      await res.json();
      setFeedback(`Success: Token successfully ${action === "generate_key" ? "generated" : "revoked"}`);
      fetchDeveloperKeys();
      setTimeout(() => setFeedback(""), 3000);
    } catch (err) {
      console.error("Developer gateway key action error:", err);
      setFeedback("Error: Failed to process key request.");
    }
  };

  // Stripe Portal trigger
  const handleStripePortal = async () => {
    try {
      setFeedback("Preparing secure Stripe Customer Portal access...");
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "invoice_download", resource: "stripe_portal" }),
      });
      setFeedback("Stripe Billing Portal launched. Check your support contact.");
      setTimeout(() => setFeedback(""), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  if (loadingSettings) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto p-4 md:p-6 text-stone-100">
      {/* Premium Header */}
      <div className="border-b border-stone-800/80 pb-6">
        <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
          <span className="text-emerald-500">⚙️</span> Workspace Settings
        </h1>
        <p className="text-stone-400 mt-1 max-w-3xl">
          Configure business brand profiles, manage connected accounts, monitor deployment billing licenses, and generate secure API keys.
        </p>
      </div>

      {/* Control Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-stone-900 pb-px">
        {[
          { id: "profile", label: "🏢 Business Profile", desc: "Corporate profile & brand values" },
          { id: "connections", label: "🔌 Connected Accounts", desc: "SaaS integrations & API logs" },
          { id: "billing", label: "💳 Plan & Billing", desc: "Subscriptions & invoice history" },
          { id: "keys", label: "🔑 Developer Keys", desc: "Access tokens & API management" }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabSwitch(tab.id as any)}
            className={`px-5 py-3 rounded-t-2xl font-bold text-xs tracking-wider uppercase transition-all flex flex-col gap-0.5 border-t border-x ${
              activeTab === tab.id
                ? "bg-stone-950 border-stone-800 text-white shadow-[0_-4px_12px_rgba(16,185,129,0.05)]"
                : "border-transparent text-stone-500 hover:text-stone-300 hover:bg-stone-900/30"
            }`}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Main Tab Panel Content */}
      <div className="min-h-[400px]">
        
        {/* TAB 1: BUSINESS PROFILE */}
        {activeTab === "profile" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn">
            
            {/* Left Hand: General Business Information */}
            <div className="lg:col-span-2 space-y-8">
              
              {/* Profile Card */}
              <div className="bg-stone-950 border border-stone-900 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl">
                <div className="border-b border-stone-900 pb-3">
                  <h3 className="text-lg font-black text-white">Brand Profile Identity</h3>
                  <p className="text-xs text-stone-500">Edit key tenant names, selected industry verticals, and official contact metadata.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-semibold text-stone-400">
                  <div className="space-y-2">
                    <label className="block font-bold uppercase tracking-wider text-stone-500">Company / Workspace Name</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800/80 rounded-xl px-4 py-3 outline-none text-white focus:ring-2 focus:ring-emerald-500/50 transition-all font-semibold"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold uppercase tracking-wider text-stone-500">Primary Industry Vertical</label>
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800/80 rounded-xl px-4 py-3 outline-none text-white focus:ring-2 focus:ring-emerald-500/50 transition-all font-black text-xs"
                    >
                      {verticalIndustries.map((ind) => (
                        <option key={ind} value={ind}>{ind}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="block font-bold uppercase tracking-wider text-stone-500">Workspace Logo URL</label>
                    <input
                      type="text"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800/80 rounded-xl px-4 py-3 outline-none text-white focus:ring-2 focus:ring-emerald-500/50 transition-all"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="block font-bold uppercase tracking-wider text-stone-500">Physical Corporate Address</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800/80 rounded-xl px-4 py-3 outline-none text-white focus:ring-2 focus:ring-emerald-500/50 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold uppercase tracking-wider text-stone-500">Official Phone Number</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800/80 rounded-xl px-4 py-3 outline-none text-white focus:ring-2 focus:ring-emerald-500/50 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold uppercase tracking-wider text-stone-500">Corporate Website URL</label>
                    <input
                      type="text"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800/80 rounded-xl px-4 py-3 outline-none text-white focus:ring-2 focus:ring-emerald-500/50 transition-all"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => handleSaveProfile("Brand & Profile")}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl text-xs shadow-lg transition-all"
                  >
                    💾 Update Brand Profile
                  </button>
                </div>
              </div>

              {/* Regional and Location Options */}
              <div className="bg-stone-950 border border-stone-900 rounded-3xl p-6 shadow-xl space-y-6">
                <div className="border-b border-stone-900 pb-3">
                  <h3 className="text-base font-black text-white">Regional & Operational Standards</h3>
                  <p className="text-xs text-stone-500">Specify language values and default time coordinates for scheduled AI task triggers.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-semibold text-stone-400">
                  <div className="space-y-2">
                    <label className="block font-bold uppercase tracking-wider text-stone-500">Timezone Preference</label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800/80 rounded-xl px-4 py-3 outline-none text-white font-bold"
                    >
                      <option value="America/New_York">America/New_York (Eastern Time)</option>
                      <option value="America/Chicago">America/Chicago (Central Time)</option>
                      <option value="America/Denver">America/Denver (Mountain Time)</option>
                      <option value="America/Los_Angeles">America/Los_Angeles (Pacific Time)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                      <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold uppercase tracking-wider text-stone-500">System Primary Language</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800/80 rounded-xl px-4 py-3 outline-none text-white font-bold"
                    >
                      <option value="en">English (US Standard)</option>
                      <option value="es">Español (Latin American)</option>
                      <option value="fr">Français (European)</option>
                      <option value="de">Deutsch (German)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => handleSaveProfile("Regional Options")}
                    className="bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 font-bold px-6 py-3 rounded-xl text-xs transition-all"
                  >
                    💾 Update Regional Settings
                  </button>
                </div>
              </div>

            </div>

            {/* Right Hand Side Settings: AI, Security, Notifications */}
            <div className="space-y-8">
              
              {/* AI Model Settings */}
              <div className="bg-stone-950 border border-stone-900 rounded-3xl p-6 shadow-xl space-y-6">
                <div className="border-b border-stone-900 pb-3">
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <span>🧠</span> AI Model Gateway
                  </h3>
                  <p className="text-xs text-stone-500">Select default LLM brains used across standard operational task executions.</p>
                </div>

                <div className="space-y-5 text-xs font-semibold text-stone-400">
                  <div className="space-y-2">
                    <label className="block font-bold uppercase tracking-wider text-stone-500">Default AI Model Brain</label>
                    <select
                      value={aiModel}
                      onChange={(e) => setAIModel(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800/80 rounded-xl px-4 py-3 outline-none text-white font-black text-xs"
                    >
                      <option value="openai-gpt4o">OpenAI GPT-4o (Production Core)</option>
                      <option value="anthropic-claude35-sonnet">Anthropic Claude 3.5 Sonnet</option>
                      <option value="meta-llama3-70b">Meta Llama 3 70B (Open-Source)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <label className="font-bold uppercase tracking-wider text-stone-500">Creativity Temperature</label>
                      <span className="text-emerald-400 font-bold">{temperature}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-stone-500 font-bold">
                      <span>PRECISE (0.0)</span>
                      <span>BALANCED</span>
                      <span>CREATIVE (1.0)</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold uppercase tracking-wider text-stone-500">Standard Data Retention</label>
                    <select
                      value={dataRetention}
                      onChange={(e) => setDataRetention(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800/80 rounded-xl px-4 py-3 outline-none text-white font-bold"
                    >
                      <option value="30-days">30 Days (Standard Audit)</option>
                      <option value="90-days">90 Days (Enterprise Compliant)</option>
                      <option value="365-days">1 Year (Long-term Archives)</option>
                    </select>
                  </div>

                  <button
                    onClick={() => handleSaveProfile("AI Model Gateway")}
                    className="w-full bg-stone-900 hover:bg-stone-850 border border-stone-800 text-stone-200 font-bold py-3 rounded-xl shadow-md transition-all text-center"
                  >
                    💾 Update AI Gateway Settings
                  </button>
                </div>
              </div>

              {/* MFA & Identity Security settings */}
              <div className="bg-stone-950 border border-stone-900 rounded-3xl p-6 shadow-xl space-y-6">
                <div className="border-b border-stone-900 pb-3">
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <span>🔑</span> Account Security Settings
                  </h3>
                  <p className="text-xs text-stone-500">Control workspace credential access rules and tenant security thresholds.</p>
                </div>

                <div className="space-y-4 text-xs font-semibold text-stone-400">
                  <div className="flex items-center justify-between p-3 bg-stone-900/50 rounded-2xl border border-stone-900">
                    <div>
                      <div className="font-bold text-white text-xs">MFA Multi-Factor Auth</div>
                      <div className="text-[10px] text-stone-500">Require secondary OTP codes on administrative logins.</div>
                    </div>
                    <button
                      onClick={() => setMfaEnabled(!mfaEnabled)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        mfaEnabled ? "bg-emerald-600" : "bg-stone-800"
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        mfaEnabled ? "translate-x-5" : "translate-x-0"
                      }`} />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold uppercase tracking-wider text-stone-500">Console Session Timeout</label>
                    <select
                      value={sessionTimeout}
                      onChange={(e) => setSessionTimeout(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800/80 rounded-xl px-4 py-3 outline-none text-white font-bold"
                    >
                      <option value="60-mins">60 Minutes</option>
                      <option value="120-mins">120 Minutes (2 hours)</option>
                      <option value="1440-mins">24 Hours (Long session)</option>
                    </select>
                  </div>

                  <button
                    onClick={() => handleSaveProfile("Security Options")}
                    className="w-full bg-stone-900 hover:bg-stone-850 border border-stone-800 text-stone-200 font-bold py-3 rounded-xl transition-all"
                  >
                    💾 Save Security Thresholds
                  </button>
                </div>
              </div>

              {/* Notification Channels settings */}
              <div className="bg-stone-950 border border-stone-900 rounded-3xl p-6 shadow-xl space-y-6">
                <div className="border-b border-stone-900 pb-3">
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <span>🔔</span> Notification Routing
                  </h3>
                  <p className="text-xs text-stone-500">Configure alert channels when AI employees require manual approval interventions.</p>
                </div>

                <div className="space-y-4 text-xs font-semibold text-stone-400">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white text-xs">Email Notifications</div>
                      <div className="text-[10px] text-stone-500">Primary dashboard inbox messages.</div>
                    </div>
                    <button
                      onClick={() => setNotifyEmail(!notifyEmail)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        notifyEmail ? "bg-emerald-600" : "bg-stone-800"
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        notifyEmail ? "translate-x-5" : "translate-x-0"
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white text-xs">SMS Emergency Alerts</div>
                      <div className="text-[10px] text-stone-500">Receive system failures as text alerts.</div>
                    </div>
                    <button
                      onClick={() => setNotifySMS(!notifySMS)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        notifySMS ? "bg-emerald-600" : "bg-stone-800"
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        notifySMS ? "translate-x-5" : "translate-x-0"
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white text-xs">Slack Dispatch logs</div>
                      <div className="text-[10px] text-stone-500">Post system task updates directly to Slack.</div>
                    </div>
                    <button
                      onClick={() => setNotifySlack(!notifySlack)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        notifySlack ? "bg-emerald-600" : "bg-stone-800"
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        notifySlack ? "translate-x-5" : "translate-x-0"
                      }`} />
                    </button>
                  </div>

                  <button
                    onClick={() => handleSaveProfile("Notification Channels")}
                    className="w-full bg-stone-900 hover:bg-stone-850 border border-stone-800 text-stone-200 font-bold py-3 rounded-xl transition-all"
                  >
                    💾 Save Alert Preferences
                  </button>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB 2: CONNECTED ACCOUNTS */}
        {activeTab === "connections" && (
          <div className="bg-stone-950 border border-stone-900 rounded-[2rem] p-6 md:p-8 space-y-8 animate-fadeIn">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-stone-900 pb-4 gap-4">
              <div>
                <h3 className="text-xl font-black text-white">Active Integrations & Connected Accounts</h3>
                <p className="text-xs text-stone-500">Manage connected SaaS systems used by active AI employee workloads.</p>
              </div>
              <Link
                to="/portal/integrations/"
                className="bg-stone-900 hover:bg-stone-800 text-emerald-400 font-bold text-xs px-5 py-3 rounded-2xl border border-stone-800 flex items-center gap-2"
              >
                🔌 Connect New Account
              </Link>
            </div>

            {loadingConns ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-emerald-500"></div>
              </div>
            ) : connections.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {connections.map((conn) => {
                  const lowerProv = conn.provider.toLowerCase();
                  let emoji = "🔌";
                  if (lowerProv.includes("salesforce")) emoji = "☁️";
                  else if (lowerProv.includes("hubspot")) emoji = "🧡";
                  else if (lowerProv.includes("slack")) emoji = "💬";
                  else if (lowerProv.includes("gmail") || lowerProv.includes("outlook")) emoji = "📧";
                  else if (lowerProv.includes("google")) emoji = "📁";
                  else if (lowerProv.includes("stripe")) emoji = "💳";
                  else if (lowerProv.includes("twilio")) emoji = "📞";
                  
                  return (
                    <div
                      key={conn.id}
                      className="p-5 bg-stone-900/40 rounded-2xl border border-stone-900 hover:border-stone-800/80 transition-all duration-300 flex justify-between items-center"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-3xl p-3 bg-stone-900 rounded-xl">{emoji}</span>
                        <div>
                          <div className="font-black text-white text-sm">{conn.displayName}</div>
                          <div className="text-[10px] text-stone-500 flex items-center gap-1.5 mt-1">
                            <span className={`h-2 w-2 rounded-full ${
                              conn.status === "active" ? "bg-emerald-500" : "bg-rose-500"
                            }`}></span>
                            <span className="uppercase font-bold text-stone-400 tracking-wider text-[9px]">{conn.status}</span>
                            <span className="text-stone-600">•</span>
                            <span className="font-semibold text-stone-500">{new Date(conn.updatedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleSyncConnection(conn.id, conn.displayName)}
                          className="p-2.5 bg-stone-900 hover:bg-stone-800 rounded-xl text-stone-400 hover:text-white transition-all border border-stone-800"
                          title="Verify Sync Integrity"
                        >
                          🔄 Check Health
                        </button>
                        <button
                          onClick={() => handleDisconnect(conn.id, conn.displayName)}
                          className="p-2.5 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/30 hover:border-rose-900/50 text-rose-400 font-bold rounded-xl transition-all"
                          title="Disconnect Integration"
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 border-2 border-dashed border-stone-900 rounded-3xl space-y-4 max-w-xl mx-auto">
                <span className="text-4xl">🔌</span>
                <div className="space-y-1">
                  <div className="font-bold text-white text-sm">No Connected SaaS Accounts</div>
                  <p className="text-xs text-stone-500 max-w-sm mx-auto">Connect your workspace databases, CRMs, email servers, or helpdesks to deploy autonomous digital employees.</p>
                </div>
                <Link
                  to="/portal/integrations/"
                  className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-3 rounded-xl shadow-lg transition-all"
                >
                  Configure Integrations Directory
                </Link>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PLAN & BILLING */}
        {activeTab === "billing" && (
          <div className="space-y-8 animate-fadeIn">
            
            {/* Subscriptions Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Subscription Info Panel */}
              <div className="bg-stone-950 border border-stone-900 rounded-3xl p-6 shadow-xl flex flex-col justify-between gap-6 hover:border-emerald-500/10 transition-all duration-300">
                <div className="space-y-4">
                  <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-3 py-1 rounded-full tracking-wider">Active Workspace Build</span>
                  <h3 className="text-2xl font-black text-white">{activePlan}</h3>
                  <p className="text-stone-400 text-xs leading-relaxed font-semibold">{planDesc}</p>
                </div>

                <button
                  onClick={handleStripePortal}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3.5 rounded-xl shadow-lg shadow-emerald-900/20 hover:shadow-emerald-900/40 transition-all"
                >
                  💳 Manage via Stripe Portal
                </button>
              </div>

              {/* Invoice History Panel */}
              <div className="lg:col-span-2 bg-stone-950 border border-stone-900 rounded-3xl p-6 shadow-xl space-y-6">
                <h3 className="text-base font-black text-white">Purchase History</h3>
                
                {loadingBilling ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500"></div>
                  </div>
                ) : invoices.length > 0 ? (
                  <div className="divide-y divide-stone-900 text-xs font-semibold text-stone-400">
                    {invoices.map((inv) => (
                      <div key={inv.id} className="flex justify-between items-center py-3.5">
                        <div className="space-y-0.5">
                          <div className="font-bold text-white text-sm">{inv.type}</div>
                          <div className="text-[10px] text-stone-500">{inv.date} • ID: {inv.id}</div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <span className="font-black text-emerald-400 text-sm">{inv.amount}</span>
                          <span className="text-[10px] bg-stone-900 px-2.5 py-1 rounded-full text-stone-500 border border-stone-850 font-bold uppercase tracking-wider">Paid</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-stone-500 text-xs py-12 text-center border-2 border-dashed border-stone-900 rounded-2xl">
                    No recent invoice records found. Active systems operating standards.
                  </div>
                )}
              </div>
            </div>

            {/* Scale Options Grid */}
            <div className="bg-stone-950 border border-stone-900 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl">
              <div className="border-b border-stone-900 pb-4">
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <span>🚀</span> Scale Your AI Operations Scopes
                </h3>
                <p className="text-xs text-stone-500">Upgrade core builds, extend SLA support memberships, or purchase auxiliary functional employee add-ons.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-semibold">
                <div className="p-4 bg-stone-900/30 rounded-2xl border border-stone-900 flex justify-between items-center gap-4">
                  <div>
                    <div className="font-bold text-white text-sm">Growth Build Package</div>
                    <p className="text-[11px] text-stone-500 mt-0.5">5 active AI employees, full API systems integration, 60-day tech support.</p>
                  </div>
                  <div className="shrink-0 text-right space-y-1.5">
                    <span className="font-black text-emerald-400 text-sm block">$15,000</span>
                    <a
                      href="https://buy.stripe.com/00wdRb4WH57V7Ll9XW2Fa15"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block bg-stone-900 hover:bg-stone-800 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] border border-stone-800"
                    >
                      Buy Upgrade
                    </a>
                  </div>
                </div>

                <div className="p-4 bg-stone-900/30 rounded-2xl border border-stone-900 flex justify-between items-center gap-4">
                  <div>
                    <div className="font-bold text-white text-sm">Scale Build Package</div>
                    <p className="text-[11px] text-stone-500 mt-0.5">Unlimited AI employees, customizable modeling, priority SLA support.</p>
                  </div>
                  <div className="shrink-0 text-right space-y-1.5">
                    <span className="font-black text-emerald-400 text-sm block">$30,000</span>
                    <a
                      href="https://buy.stripe.com/cNi5kFexh1VJaXxc642Fa16"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block bg-stone-900 hover:bg-stone-800 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] border border-stone-800"
                    >
                      Buy Upgrade
                    </a>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 4: DEVELOPER GATEWAY API KEYS */}
        {activeTab === "keys" && (
          <div className="bg-stone-950 border border-stone-900 rounded-[2rem] p-6 md:p-8 space-y-6 shadow-xl animate-fadeIn">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-stone-900 pb-4 gap-4">
              <div>
                <h3 className="text-xl font-black text-white flex items-center gap-2">
                  <span>🔑</span> Developer Access Gateways
                </h3>
                <p className="text-xs text-stone-500">Generate secure API authorization tokens for human or automated client operations.</p>
              </div>
              <button
                onClick={() => handleKeyAction("Token", "generate_key")}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-3 rounded-2xl shadow-lg transition-all flex items-center gap-1.5"
              >
                <span>➕</span> Generate API Key
              </button>
            </div>

            {loadingKeys ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-emerald-500"></div>
              </div>
            ) : developerKeys.length > 0 ? (
              <div className="overflow-hidden border border-stone-900 rounded-3xl bg-stone-950">
                <table className="w-full text-left text-xs font-semibold">
                  <thead>
                    <tr className="bg-stone-900/60 text-stone-400 border-b border-stone-900 uppercase tracking-wider text-[10px]">
                      <th className="p-4 font-black">Credential Name</th>
                      <th className="p-4 font-black">Type</th>
                      <th className="p-4 font-black">Credential Token Key</th>
                      <th className="p-4 text-right font-black">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-900 font-semibold text-stone-300">
                    {developerKeys.map((k, idx) => (
                      <tr key={idx} className="hover:bg-stone-900/20 transition-colors">
                        <td className="p-4 font-black text-white">{k.name}</td>
                        <td className="p-4 text-stone-500 font-medium">{k.type}</td>
                        <td className="p-4 font-mono text-[10px] text-emerald-400/80">{k.value}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleKeyAction(k.name, "revoke")}
                            className="text-rose-400 hover:text-rose-300 font-bold transition-colors"
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16 border-2 border-dashed border-stone-900 rounded-3xl space-y-4 max-w-xl mx-auto">
                <span className="text-4xl">🔑</span>
                <div className="space-y-1">
                  <div className="font-bold text-white text-sm">No API Access Tokens Generated</div>
                  <p className="text-xs text-stone-500 max-w-sm mx-auto">Generate workspace developer keys to safely trigger agent executions, webhooks, or database lookups from external scripts.</p>
                </div>
                <button
                  onClick={() => handleKeyAction("Token", "generate_key")}
                  className="bg-stone-900 hover:bg-stone-800 text-emerald-400 font-bold text-xs px-5 py-3 rounded-xl border border-stone-800 transition-all"
                >
                  Generate First Secret API Key
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Persistent Toast Feedback System */}
      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500/40 text-white px-5 py-3.5 rounded-2xl shadow-2xl z-50 flex items-center gap-3 animate-slideUp">
          <span className="text-emerald-400 animate-pulse">✓</span>
          <span className="text-xs font-bold tracking-wide">{feedback}</span>
        </div>
      )}

    </div>
  );
}
