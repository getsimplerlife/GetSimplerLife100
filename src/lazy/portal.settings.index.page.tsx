import { Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { authedJson } from "~/lib/portal-primitives";



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

interface InvoiceItem {
  id: string;
  type?: string;
  description?: string | null;
  amount: string | number | null;
  date?: string | null;
  status?: string | null;
}
/**
 * The workspace's own Stripe connection, as the API reports it. The key itself
 * is never part of this shape — only `connected`, a masked hint (last 4), the
 * mode and when it was added.
 */
interface StripeStatus {
  connected: boolean;
  hint: string | null;
  keyMode: "live" | "test" | null;
  addedAt: string | null;
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
  const [activeTab, setActiveTab] = useState<"profile" | "connections" | "payments" | "billing">("profile");

  // 1. Business Profile states
  const [companyName, setCompanyName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [timezone, setTimezone] = useState("");
  const [language, setLanguage] = useState("en");

  // SLICE 175: aiModel, temperature, dataRetention, mfaEnabled, sessionTimeout,
  // notifyEmail, notifySMS and notifySlack used to live here as toggles that
  // wrote a value nothing read. They are gone (see the right-hand column below,
  // which now says plainly that those capabilities do not exist yet).

  // 2. Connected Accounts states
  const [, setProviders] = useState<ProviderItem[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [loadingConns, setLoadingConns] = useState(false);

  // 2b. Payments — the workspace's OWN Stripe account (invoices are paid
  // directly into it; we never hold or move a customer's money).
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [stripeKeyInput, setStripeKeyInput] = useState("");
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeError, setStripeError] = useState("");
  // SLICE 190 — a Stripe status read that failed is NOT "not connected".
  // `fetchStripeStatus` used to `if (!res.ok) return;` inside a bare `catch`,
  // so a 500 or a dead network rendered the amber "No Stripe account
  // connected" box and invited the owner to paste a key that is already
  // stored. `stripeReadError` is the only thing that separates the two.
  const [stripeReadError, setStripeReadError] = useState("");

  // 3. Plan & Billing states
  const [activePlan, setActivePlan] = useState("");
  const [planDesc, setPlanDesc] = useState("");
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loadingBilling, setLoadingBilling] = useState(false);
  // SLICE 178 — a failed read is not an empty workspace. These carry the reason
  // so the tab can say "couldn't load" instead of inventing "no plan".
  const [billingNotice, setBillingNotice] = useState<{ kind: "signedOut" | "error"; message: string } | null>(null);
  const [connsNotice, setConnsNotice] = useState<{ kind: "signedOut" | "error"; message: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<{ brand?: string; last4?: string; expMonth?: number; expYear?: number } | null>(null);

  // General Loading & Feedback
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [feedback, setFeedback] = useState("");

  // SLICE 175 — the load/save shapes now agree with the store.
  //
  // `tenant_settings.json` holds ONE FLAT OBJECT per tenant
  // (`{ "you@example.com": { companyName: "Acme", … } }`) and the POST merges
  // the request body into that object. This loader used to accept ONLY an ARRAY
  // of `{ key, value }` rows — a shape the endpoint never returns — so nothing
  // ever came back after a reload; and the saver posted `{ section, key, value }`,
  // which overwrote the previous key on every request, leaving the workspace
  // holding only the last field it saved. Both sides speak the flat shape now,
  // which is also the shape src/native/invoice/issuer.ts reads to label an
  // invoice with the workspace's own name.
  // SLICE 190 — THE MOST DANGEROUS READ ON THE PORTAL.
  //
  // Before this slice the loader below ended in `.catch(err => console.error)`
  // and `setLoadingSettings(false)` ran regardless: a failed read left every
  // field at "", the page rendered an EDITABLE BLANK form that looked like a
  // workspace with no profile, and `handleSaveProfile` would then POST those
  // blanks over the values that are really stored — silently destroying the
  // issuer name that prints on every invoice. `profileLoaded` is true only when
  // the read came back 2xx, and the form is not rendered without it.
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileReadError, setProfileReadError] = useState("");

  const loadProfile = useCallback(async () => {
    const res = await authedJson<unknown>("/api/data/settings");
    if (!res.ok) {
      setProfileReadError(res.error);
      setProfileLoaded(false);
      return;
    }
    const d = res.data as { data?: unknown } | unknown[] | null;
    const apply = (key: unknown, value: unknown) => {
      if (typeof key !== "string") return;
      const text = value === undefined || value === null ? "" : String(value);
      if (key === "companyName") setCompanyName(text);
      if (key === "logoUrl") setLogoUrl(text);
      if (key === "industry") setIndustry(text);
      if (key === "address") setAddress(text);
      if (key === "phone") setPhone(text);
      if (key === "website") setWebsite(text);
      if (key === "timezone") setTimezone(text);
      if (key === "language") setLanguage(text);
    };
    // `authedJson` already unwraps `data`; the endpoint's body has also been
    // served as `{ data: {...} }` historically, so accept both flat object and
    // `{ key, value }` rows without inventing anything.
    const data = (d as { data?: unknown })?.data ?? d;
    if (Array.isArray(data)) {
      data.forEach((row) => apply((row as { key?: unknown })?.key, (row as { value?: unknown })?.value));
    } else if (data && typeof data === "object") {
      Object.entries(data as Record<string, unknown>).forEach(([key, value]) => apply(key, value));
    }
    setProfileReadError("");
    setProfileLoaded(true);
  }, []);

  const reloadProfile = useCallback(() => {
    setLoadingSettings(true);
    void loadProfile().finally(() => setLoadingSettings(false));
  }, [loadProfile]);

  useEffect(() => {
    void loadProfile().finally(() => setLoadingSettings(false));
  }, [loadProfile]);

  // Fetch Connected Accounts on tab click/mount
  const fetchConnectionsData = async () => {
    setConnsNotice(null);
    try {
      setLoadingConns(true);
      const [providersRes, connsRes] = await Promise.all([
        fetch("/api/integrations/providers"),
        fetch("/api/data/connected-accounts")
      ]);
      // SLICE 178 — neither status was read, so a 401/500 fell through to `[]`
      // and rendered as "No imports yet": an auth failure looked like an answer.
      if (!connsRes.ok) {
        setConnections([]);
        setConnsNotice(
          connsRes.status === 401
            ? { kind: "signedOut", message: "Your session has expired — sign in again to see this workspace's imported accounts." }
            : { kind: "error", message: `Couldn't load your imported accounts (HTTP ${connsRes.status}) — this list is unavailable, not empty.` },
        );
        return;
      }
      const connsData = await connsRes.json();
      if (providersRes.ok) {
        const provsData = await providersRes.json();
        setProviders(provsData.data || provsData || []);
      }
      // a2: derive the list from the real OAuth-store buckets.
      const flat = [...(connsData.crm || []), ...(connsData.erp || []), ...(connsData.other || [])].map((c: any) => ({
        id: c.id,
        userId: "",
        provider: c.providerId || c.provider || "",
        displayName: c._provider?.name || c.provider || c.providerId || "",
        config: {},
        status: (c.status === "Connected" ? "active" : c.status === "error" ? "error" : "pending") as "active" | "expired" | "error" | "pending",
        createdAt: c.connectedAt || new Date().toISOString(),
        updatedAt: c.updatedAt || c.connectedAt || new Date().toISOString(),
      }));
      setConnections(flat);
    } catch (err) {
      console.error("Error fetching integrations:", err);
    } finally {
      setLoadingConns(false);
    }
  };

  // Fetch real billing details from /api/native/billing (P1-1): Stripe or the
  // tenant's own durable purchase rows. Never infers a plan from audit rows and
  // never fabricates a payment method (P1-2).
  const fetchBillingData = async () => {
    setBillingNotice(null);
    try {
      setLoadingBilling(true);
      const billingRes = await fetch("/api/native/billing", { credentials: "include" });
      // SLICE 178 — `billingRes.ok` was never read, so `?? {source:"none", …}`
      // turned a 401 (billing/router.ts:272) into a convincing empty billing
      // state: "No subscription on file", zero invoices, no payment method.
      if (!billingRes.ok) {
        setActivePlan("");
        setPlanDesc("");
        setInvoices([]);
        setPaymentMethod(null);
        setBillingNotice(
          billingRes.status === 401
            ? { kind: "signedOut", message: "Your session has expired — sign in again to see this workspace's plan and invoices." }
            : { kind: "error", message: `Couldn't load billing (HTTP ${billingRes.status}) — the plan and invoices below are unavailable, not empty.` },
        );
        return;
      }
      const packet = await billingRes.json();
      // A 2xx that carries no `billing` view is a genuinely empty answer (the
      // endpoint always sends `{ ok, billing }`), so the shape default stays.
      const billing = packet?.billing ?? { source: "none", subscription: null, invoices: [], paymentMethod: null };
      const sub = billing.subscription ?? null;
      setActivePlan(sub?.planName || "");
      setPlanDesc("");
      setInvoices(Array.isArray(billing.invoices) ? billing.invoices : []);
      setPaymentMethod(billing.paymentMethod ?? null);
    } catch (err) {
      console.error("Error loading billing info:", err);
    } finally {
      setLoadingBilling(false);
    }
  };

  // Handle Tab switches and load corresponding data
  const handleTabSwitch = (tab: "profile" | "connections" | "payments" | "billing") => {
    setActiveTab(tab);
    if (tab === "connections") fetchConnectionsData();
    if (tab === "payments") fetchStripeStatus();
    if (tab === "billing") fetchBillingData();
  };

  // ── Payments: the workspace's own Stripe account ──────────────────────────
  // SLICE 190 — the status read now goes through `authedJson` and keeps the
  // failure. `if (!res.ok) return;` + a bare `catch` used to leave
  // `stripeStatus` null, which the payments tab rendered as "No Stripe account
  // connected" — an invitation to paste a key that may already be stored.
  const fetchStripeStatus = async () => {
    const res = await authedJson<StripeStatus>("/api/native/invoice/stripe");
    if (!res.ok) {
      setStripeReadError(res.error);
      setStripeStatus(null);
      return;
    }
    setStripeReadError("");
    setStripeStatus(res.data as StripeStatus);
  };
  const handleConnectStripe = async () => {
    const secretKey = stripeKeyInput.trim();
    setStripeError("");
    if (!secretKey) {
      setStripeError("Paste your Stripe secret key first.");
      return;
    }
    setStripeBusy(true);
    try {
      const res = await fetch("/api/native/invoice/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ secretKey }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStripeError(json.error || "Could not save that key.");
        return;
      }
      setStripeStatus(json.data as StripeStatus);
      // Never keep the pasted key in memory longer than the request.
      setStripeKeyInput("");
      setFeedback("Stripe connected — your invoices can now be paid online, straight into your own Stripe account.");
    } finally {
      setStripeBusy(false);
    }
  };
  const handleDisconnectStripe = async () => {
    setStripeError("");
    setStripeBusy(true);
    try {
      const res = await fetch("/api/native/invoice/stripe", { method: "DELETE", credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStripeError(json.error || "Could not disconnect Stripe.");
        return;
      }
      setStripeStatus(json.data as StripeStatus);
      setFeedback("Stripe disconnected — invoices go back to “payment arranged with the issuer”.");
    } finally {
      setStripeBusy(false);
    }
  };

  // Handle Profile Update Save
  const handleSaveProfile = async (sectionName: string) => {
    // SLICE 190 — the write path refuses to run on a read that never answered.
    // Without this a blank form (a failed read) could be POSTed over the real
    // values one key at a time. The guard is on the SAVE, not only on the
    // render, because the button is one focus-ring away from a stale DOM.
    if (!profileLoaded) {
      setFeedback("Error: your saved profile was never read, so nothing was saved. Reload this page first.");
      return;
    }
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
      }

      // One FLAT key per request. The endpoint merges the body into the tenant's
      // settings object, so `{ [key]: value }` ADDS a key; the old
      // `{ section, key, value }` body overwrote the previous key on every call.
      for (const [key, value] of Object.entries(payload)) {
        const res = await fetch("/api/data/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ [key]: value }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }

      setFeedback(`Success: ${sectionName} saved.`);
      setTimeout(() => setFeedback(""), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setFeedback("Error: Failed to save changes.");
    }
  };

  // API access is not offered as a key store (cleanup-b 10-26): no API-key
  // store exists, and scoped tokens will be built only when a paying
  // enterprise asks. Nothing here mints or manages keys.

  // Navigate to /pricing for plan upgrades
  const handleUpgradePlan = () => {
    window.location.href = "/pricing";
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
          Configure business brand profiles, review one-shot import history, and manage plan and billing.
        </p>
      </div>

      {/* Control Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-stone-900 pb-px">
        {[
          { id: "profile", label: "🏢 Business Profile", desc: "Corporate profile & brand values" },
          { id: "connections", label: "📥 Import History", desc: "One-shot imports of your tool data" },
          { id: "payments", label: "💸 Payments", desc: "Your own Stripe account for invoice payments" },
          { id: "billing", label: "💳 Plan & Billing", desc: "Subscriptions & invoice history" }
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
              
              {/* SLICE 190 — the form is not rendered over a read that never
                  answered. A blank editable form is indistinguishable from a
                  workspace with no profile, and saving it would overwrite the
                  real values. */}
              {!profileLoaded && (
                <div className="bg-stone-950 border border-rose-900/60 rounded-3xl p-6 md:p-8 space-y-4 shadow-xl">
                  <span className="text-3xl">⚠️</span>
                  <h3 className="text-lg font-black text-white">Your saved profile could not be read</h3>
                  <p className="text-xs text-stone-400 leading-relaxed max-w-xl">
                    {profileReadError || "The read did not answer."} The form is hidden rather than shown blank, because
                    saving a blank form would overwrite the profile that is already stored. This is not an empty
                    profile — it is an unread one.
                  </p>
                  <button
                    onClick={reloadProfile}
                    className="bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-bold py-2 px-4 rounded-xl text-xs"
                  >
                    Retry →
                  </button>
                </div>
              )}

              {profileLoaded && (
              <>
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

                <p className="text-[10px] text-stone-500 border-t border-stone-900 pt-4">
                  All six fields are saved to your workspace record. The company name is the one the product reads
                  today: it is the issuer name printed on invoices. The other five are stored for later use and change
                  nothing in the product yet.
                </p>

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
                  <p className="text-xs text-stone-500">Specify language values and default time coordinates for scheduled automation triggers.</p>
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

                <p className="text-[10px] text-stone-500 border-t border-stone-900 pt-4">
                  Saved to your workspace record. Nothing in the product reads these two values yet — dates, times and
                  amounts are formatted the same way for every workspace.
                </p>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => handleSaveProfile("Regional Options")}
                    className="bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 font-bold px-6 py-3 rounded-xl text-xs transition-all"
                  >
                    💾 Update Regional Settings
                  </button>
                </div>
              </div>
              </>
              )}

            </div>

            {/* Right Hand Side: the capabilities that do NOT exist yet, stated
                plainly. SLICE 175 removed six stored-and-never-read toggles
                here (mfaEnabled, notifySMS, sessionTimeout, aiModel,
                dataRetention, notifySlack) plus two of the same class
                (notifyEmail, temperature). Each one showed "saved" and changed
                nothing, because no server path, auth path, mailer or retention
                job reads any of those keys. Nothing is built for them here —
                they are later waves — so the page says so instead. */}
            <div className="space-y-8">

              <div className="bg-stone-950 border border-stone-900 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="border-b border-stone-900 pb-3">
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <span>🧠</span> AI Settings
                  </h3>
                </div>
                <p className="text-xs text-stone-400">
                  Not available yet. No language model runs in this workspace, so there is no model to choose and no
                  creativity setting to tune — quotes, invoices, reports and reminders are produced by deterministic
                  code.
                </p>
                <p className="text-xs text-stone-400">
                  Data retention is not configurable yet either: nothing currently deletes or expires this workspace's
                  records, so there is no retention period to select.
                </p>
              </div>

              <div className="bg-stone-950 border border-stone-900 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="border-b border-stone-900 pb-3">
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <span>🔑</span> Account Security
                  </h3>
                </div>
                <p className="text-xs text-stone-400">
                  Multi-factor authentication is not available yet. Sign-in is an email address and a password, checked
                  against a bcrypt hash, over an encrypted connection; the session is a signed, HttpOnly cookie. There
                  is no second factor to switch on, so there is no switch here.
                </p>
                <p className="text-xs text-stone-400">
                  Session length is not configurable yet: a session lasts until you sign out or it is revoked.
                </p>
              </div>

              <div className="bg-stone-950 border border-stone-900 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="border-b border-stone-900 pb-3">
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <span>🔔</span> Notification Channels
                  </h3>
                </div>
                <p className="text-xs text-stone-400">
                  Not available yet. This workspace has no SMS lane and no Slack connection, and there is no
                  per-channel switch that would change what gets delivered — so there are no toggles here. Approval
                  requests wait in the portal's approval queue.
                </p>
              </div>

            </div>

          </div>
        )}

        {/* TAB 2: CONNECTED ACCOUNTS */}
        {activeTab === "connections" && (
          <div className="bg-stone-950 border border-stone-900 rounded-[2rem] p-6 md:p-8 space-y-8 animate-fadeIn">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-stone-900 pb-4 gap-4">
              <div>
                <h3 className="text-xl font-black text-white">Import History</h3>
                <p className="text-xs text-stone-500">One-shot, client-initiated imports — nothing stays connected.</p>
              </div>
              <Link
                to="/portal/import"
                className="bg-stone-900 hover:bg-stone-800 text-emerald-400 font-bold text-xs px-5 py-3 rounded-2xl border border-stone-800 flex items-center gap-2"
              >
                📥 Bring your data in
              </Link>
            </div>

            {connsNotice && (
              <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700" role="alert">
                {connsNotice.message}
              </div>
            )}
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
                            <span className="uppercase font-bold text-stone-400 tracking-wider text-[10px]">{conn.status}</span>
                            <span className="text-stone-600">•</span>
                            <span className="font-semibold text-stone-500">{new Date(conn.updatedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-[10px] text-stone-500 shrink-0">read-only</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 border-2 border-dashed border-stone-900 rounded-3xl space-y-4 max-w-xl mx-auto">
                <span className="text-4xl">📥</span>
                <div className="space-y-1">
                  <div className="font-bold text-white text-sm">{connsNotice ? "Import history unavailable" : "No imports yet"}</div>
                  <p className="text-xs text-stone-500 max-w-sm mx-auto">
                    {connsNotice
                      ? "We couldn't read your import history, so this is not a list of zero imports."
                      : "Imports you run from the Import page appear here in your history — one-shot transfers of your own tool data, nothing stays connected."}
                  </p>
                </div>
                <Link
                  to="/portal/import"
                  className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-3 rounded-xl shadow-lg transition-all"
                >
                  Bring your data in
                </Link>
              </div>
            )}
          </div>
        )}

        {/* TAB 2b: PAYMENTS — the workspace's own Stripe account */}
        {activeTab === "payments" && (
          <div className="bg-stone-950 border border-stone-900 rounded-[2rem] p-6 md:p-8 space-y-6 animate-fadeIn">
            <div className="border-b border-stone-900 pb-4">
              <h3 className="text-xl font-black text-white">Get paid on your invoices</h3>
              <p className="text-xs text-stone-500 mt-1 max-w-3xl">
                Connect your own Stripe account and your clients get a real <strong>Pay</strong> button on the invoice
                page you send them. The payment goes straight into your Stripe account — we never hold, collect or
                forward your customers&apos; money.
              </p>
            </div>

            {stripeReadError ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-xs text-rose-200" role="alert">
                Your Stripe status could not be read — {stripeReadError}. This is not “not connected”: whether a key is
                stored is unknown, so do not paste a new one until this page can read the status.
              </div>
            ) : stripeStatus?.connected ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <span className="text-emerald-400 text-lg">✓</span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white">
                      Connected — key ending {stripeStatus.hint}
                    </div>
                    <p className="text-xs text-stone-400">
                      {stripeStatus.keyMode === "live" ? "Live mode" : "Test mode"}
                      {stripeStatus.addedAt ? ` · added ${new Date(stripeStatus.addedAt).toLocaleDateString()}` : ""}
                      {" · "}payments settle in your own Stripe account
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    to="/portal/invoices"
                    className="bg-stone-900 hover:bg-stone-800 text-emerald-400 font-bold text-xs px-5 py-3 rounded-2xl border border-stone-800"
                  >
                    Go to invoices
                  </Link>
                  <button
                    type="button"
                    onClick={handleDisconnectStripe}
                    disabled={stripeBusy}
                    className="bg-stone-900 hover:bg-red-950 text-red-400 font-bold text-xs px-5 py-3 rounded-2xl border border-stone-800 disabled:opacity-50"
                  >
                    {stripeBusy ? "Disconnecting…" : "Disconnect Stripe"}
                  </button>
                </div>
                <p className="text-xs text-stone-500">
                  Disconnecting revokes the stored key immediately. Invoices already sent keep working, but their page
                  stops offering online payment and says payment is arranged with you.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-200">
                  No Stripe account connected. Your invoice pages currently say payment is arranged directly with you —
                  there is no Pay button and no card is charged anywhere.
                </div>
                <div className="space-y-2 max-w-xl">
                  <label className="block font-bold uppercase tracking-wider text-stone-500 text-xs">
                    Your Stripe secret key
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={stripeKeyInput}
                    onChange={(e) => setStripeKeyInput(e.target.value)}
                    placeholder="sk_… or rk_… (secret or restricted key)"
                    className="w-full bg-stone-900 border border-stone-800/80 rounded-xl px-4 py-3 outline-none text-white focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono text-sm"
                  />
                  <p className="text-xs text-stone-500">
                    In your Stripe dashboard, open Developers and copy your secret key (a restricted key with write
                    access to Checkout Sessions is enough). The key is encrypted before it is stored, is never shown
                    again after you save it, and can be revoked here at any time.
                  </p>
                  {stripeError && <p className="text-xs text-red-400">{stripeError}</p>}
                  <button
                    type="button"
                    onClick={handleConnectStripe}
                    disabled={stripeBusy}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-3 rounded-xl shadow-lg transition-all disabled:opacity-50"
                  >
                    {stripeBusy ? "Saving…" : "Connect Stripe"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* TAB 3: PLAN & BILLING */}
        {activeTab === "billing" && (
          <div className="space-y-8 animate-fadeIn">
            
            {billingNotice && (
              <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700" role="alert">
                {billingNotice.message}
              </div>
            )}
            {/* Subscriptions Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Subscription Info Panel */}
              <div className="bg-stone-950 border border-stone-900 rounded-3xl p-6 shadow-xl flex flex-col justify-between gap-6 hover:border-emerald-500/10 transition-all duration-300">
                <div className="space-y-4">
                  <span className="text-[10px] font-black uppercase text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-3 py-1 rounded-full tracking-wider">Current Plan</span>
                  <h3 className="text-2xl font-black text-white">{activePlan || (billingNotice ? "Plan unavailable" : "No subscription on file")}</h3>
                  <p className="text-stone-400 text-xs leading-relaxed font-semibold">
                    {planDesc || (billingNotice ? "We couldn't read your billing record, so nothing is claimed about it here." : "Choose a plan to activate billing for this workspace.")}
                  </p>
                </div>

                <button
                  onClick={handleUpgradePlan}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3.5 rounded-xl shadow-lg shadow-emerald-900/20 hover:shadow-emerald-900/40 transition-all"
                >
                  🚀 Upgrade Plan
                </button>
              </div>

              {/* Payment Method Card */}
              <div className="bg-stone-950 border border-stone-900 rounded-3xl p-6 shadow-xl flex flex-col justify-between gap-4 hover:border-emerald-500/10 transition-all duration-300">
                <div className="space-y-3">
                  <span className="text-[10px] font-black uppercase text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-3 py-1 rounded-full tracking-wider">Payment Method</span>
                  {paymentMethod ? (
                    <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-4 flex items-center gap-4">
                      <div className="w-12 h-8 bg-gradient-to-br from-stone-700 to-stone-800 rounded-lg border border-stone-600 flex items-center justify-center text-lg shadow-inner">
                        💳
                      </div>
                      <div>
                        <div className="text-white font-bold text-sm">{paymentMethod.brand} •••• {paymentMethod.last4}</div>
                        {paymentMethod.expMonth ? (
                          <div className="text-stone-500 text-[10px] font-semibold">Expires {String(paymentMethod.expMonth).padStart(2,"0")}/{String(paymentMethod.expYear).slice(-2)}</div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="text-stone-500 text-xs py-7 text-center border-2 border-dashed border-stone-900 rounded-2xl">
                      No payment method on file
                    </div>
                  )}
                </div>
                <button
                  className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs py-3 rounded-xl border border-stone-800 transition-all"
                  onClick={() => setFeedback("Payment method updates are managed through Stripe. Visit your Stripe dashboard to update.")}
                >
                  {paymentMethod ? "💳 Update Payment Method" : "➕ Add Payment Method"}
                </button>
              </div>
              {/* Purchase History Panel */}
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
                          <div className="font-bold text-white text-sm">{inv.description || inv.type || "Platform subscription"}</div>
                          <div className="text-[10px] text-stone-500">{inv.date || "—"} • ID: {inv.id}</div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <span className="font-black text-emerald-400 text-sm">{inv.amount ?? "—"}</span>
                          {String(inv.status || "").toLowerCase() === "paid" ? (
                            <span className="text-[10px] bg-stone-900 px-2.5 py-1 rounded-full text-stone-500 border border-stone-850 font-bold uppercase tracking-wider">Paid</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-stone-500 text-xs py-12 text-center border-2 border-dashed border-stone-900 rounded-2xl">
                    {billingNotice ? "Purchase history unavailable — see the message above." : "No invoices or purchase records yet."}
                  </div>
                )}
              </div>
            </div>

            {/* Scale Options Grid */}
            <div className="bg-stone-950 border border-stone-900 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl">
              <div className="border-b border-stone-900 pb-4">
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <span>🚀</span> Scale Your Automations
                </h3>
                <p className="text-xs text-stone-500">Upgrade core builds, extend SLA support memberships, or purchase auxiliary functional employee add-ons.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-semibold">
                <div className="p-4 bg-stone-900/30 rounded-2xl border border-stone-900 flex justify-between items-center gap-4">
                  <div>
                    <div className="font-bold text-white text-sm">Growth Platform Tier</div>
                    <p className="text-[11px] text-stone-500 mt-0.5">100% of native capabilities, higher scale limits, multi-step approvals + autonomy allow-lists, priority support.</p>
                  </div>
                  <div className="shrink-0 text-right space-y-1.5">
                    <span className="font-black text-emerald-400 text-sm block">$599/mo</span>
                    <Link
                      to="/pricing"
                      className="inline-block bg-stone-900 hover:bg-stone-800 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] border border-stone-800"
                    >
                      View pricing
                    </Link>
                  </div>
                </div>

                <div className="p-4 bg-stone-900/30 rounded-2xl border border-stone-900 flex justify-between items-center gap-4">
                  <div>
                    <div className="font-bold text-white text-sm">Enterprise Platform Tier</div>
                    <p className="text-[11px] text-stone-500 mt-0.5">100% of native capabilities, highest scale limits, advanced governance, dedicated support, custom vendor-API builds.</p>
                  </div>
                  <div className="shrink-0 text-right space-y-1.5">
                    <span className="font-black text-emerald-400 text-sm block">$1,499/mo</span>
                    <Link
                      to="/pricing"
                      className="inline-block bg-stone-900 hover:bg-stone-800 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] border border-stone-800"
                    >
                      View pricing
                    </Link>
                  </div>
                </div>
              </div>
            </div>

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

export default UnifiedSettingsHub;
