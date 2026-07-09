import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/settings/")({
  component: WorkspaceSettings,
});

function WorkspaceSettings() {
  const [companyName, setCompanyName] = useState("Simpler Life Operations");
  const [logoUrl, setLogoUrl] = useState("https://simplerlife100.ctonew.app/logo.png");
  const [address, setAddress] = useState("100 Operations Way, Chicago, IL");
  const [phone, setPhone] = useState("(555) 000-1939");
  const [website, setWebsite] = useState("www.wayne.com");

  const [timezone, setTimezone] = useState("America/New_York");
  const [language, setLanguage] = useState("en");

  const [aiModel, setAIModel] = useState("openai-gpt4o");
  const [temperature, setTemperature] = useState(0.4);
  const [dataRetention, setDataRetention] = useState("30-days");

  const [mfaEnabled, setMfaEnabled] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState("120-mins");

  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySMS, setNotifySMS] = useState(false);
  const [notifySlack, setNotifySlack] = useState(true);

  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    fetch("/api/data/settings", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
          d.data.forEach((item: any) => {
            if (item.key === "companyName") setCompanyName(item.value);
            if (item.key === "logoUrl") setLogoUrl(item.value);
            if (item.key === "address") setAddress(item.value);
            if (item.key === "phone") setPhone(item.value);
            if (item.key === "website") setWebsite(item.value);
            if (item.key === "timezone") setTimezone(item.value);
            if (item.key === "language") setLanguage(item.value);
            if (item.key === "aiModel") setAIModel(item.value);
            if (item.key === "temperature") setTemperature(parseFloat(item.value));
            if (item.key === "dataRetention") setDataRetention(item.value);
            if (item.key === "mfaEnabled") setMfaEnabled(item.value === "true" || item.value === true);
            if (item.key === "sessionTimeout") setSessionTimeout(item.value);
            if (item.key === "notifyEmail") setNotifyEmail(item.value === "true" || item.value === true);
            if (item.key === "notifySMS") setNotifySMS(item.value === "true" || item.value === true);
            if (item.key === "notifySlack") setNotifySlack(item.value === "true" || item.value === true);
                          });
      setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async (sectionName: string) => {
    try {
      setFeedback(`Saving ${sectionName} settings...`);
      const payload: Record<string, any> = {};
      if (sectionName === "Brand & Profile") {
        payload.companyName = companyName;
        payload.logoUrl = logoUrl;
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
      } else if (sectionName === "MFA Security") {
        payload.mfaEnabled = mfaEnabled;
        payload.sessionTimeout = sessionTimeout;
      } else if (sectionName === "Notification Channels") {
        payload.notifyEmail = notifyEmail;
        payload.notifySMS = notifySMS;
        payload.notifySlack = notifySlack;
      }

      // Save to generic endpoint
      for (const [key, value] of Object.entries(payload)) {
        await fetch("/api/data/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ section: sectionName, key, value }),
        });
      }

      // Hit specific settings endpoint
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ section: sectionName, settings: payload }),
      });

      setFeedback(`Success: ${sectionName} configuration updated`);
      setTimeout(() => setFeedback(""), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans">
      <div className="border-b border-stone-200 pb-6">
        <h1 className="text-3xl font-black text-stone-900 tracking-tight">⚙️ Workspace Settings</h1>
        <p className="text-stone-500 mt-1">Configure tenant brand identities, general profiles, default AI models, notification channels, and MFA security options.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm space-y-6">
          <h3 className="text-lg font-black text-stone-900">Tenant Brand & Profile</h3>
          <div className="space-y-4 text-xs font-semibold text-stone-600">
            <div>
              <label className="block font-bold text-stone-500 uppercase mb-2">Company Name</label>
              <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 outline-none font-semibold focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block font-bold text-stone-500 uppercase mb-2">Logo URL</label>
              <input type="text" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 outline-none font-semibold focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block font-bold text-stone-500 uppercase mb-2">Physical Address</label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-stone-500 uppercase mb-2">Business Phone</label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 outline-none" />
              </div>
              <div>
                <label className="block font-bold text-stone-500 uppercase mb-2">Website URL</label>
                <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 outline-none" />
              </div>
            </div>
            <button onClick={() => handleSave("Brand & Profile")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md">Update Brand Profile</button>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm space-y-6">
          <h3 className="text-lg font-black text-stone-900">AI Model Gateway Settings</h3>
          <div className="space-y-4 text-xs font-semibold text-stone-600">
            <div>
              <label className="block font-bold text-stone-500 uppercase mb-2">Default LLM Model</label>
              <select value={aiModel} onChange={(e) => setAIModel(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 outline-none font-bold text-stone-700">
                <option value="openai-gpt4o">OpenAI GPT-4o (Standard Production)</option>
                <option value="anthropic-claude35-sonnet">Anthropic Claude 3.5 Sonnet</option>
                <option value="meta-llama3-70b">Meta Llama 3 (70B parameter open-source)</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-stone-500 uppercase mb-2">Creativity Temperature: {temperature}</label>
              <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full accent-emerald-600 cursor-pointer" />
            </div>
            <button onClick={() => handleSave("AI Model Gateway")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md">Update Model Gateway</button>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}

    </div>
  );
}