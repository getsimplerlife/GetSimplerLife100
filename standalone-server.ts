// Standalone Bun HTTP server for Simpler Life 100
// Serves the full homepage and static assets without needing the TanStack SSR build

import { serve, file } from "bun";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { industryContent } from "./src/content/industryContentFixed";

const PORT = 3000;
const HOST = "0.0.0.0";
const SITE_DIR = import.meta.dir;
const PUBLIC_DIR = join(SITE_DIR, "public");

// MIME types
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

// CSS
const CSS = readFileSync(join(SITE_DIR, "standalone.css"), "utf8");

// Read site.json for business name
let businessName = "Simpler Life 100";
try {
  const cfg = JSON.parse(readFileSync(join(SITE_DIR, "site.json"), "utf8"));
  if (cfg.businessName?.trim()) businessName = cfg.businessName.trim();
} catch {}

const year = new Date().getFullYear();

function servePage(url: string) {
  // Parse path from full URL
  const pathname = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0].split("#")[0];
  
  // Serve static files from /public/ (skip root "/" which is the HTML page)
  if (pathname !== "/" && pathname.startsWith("/") && !pathname.includes("..")) {
    const staticPath = join(PUBLIC_DIR, pathname.slice(1));
    if (existsSync(staticPath)) {
      const ext = pathname.substring(pathname.lastIndexOf("."));
      const mime = MIME[ext] || "application/octet-stream";
      return new Response(file(staticPath), {
        headers: { "Content-Type": mime, "Cache-Control": "public, max-age=86400" },
      });
    }
  }

  // For API routes, return 404 for now (they need the full backend)
  if (pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: "API not available in static mode" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Serve the main HTML page for all other routes (SPA-like)
  const html = generateHTML(pathname);
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function generateHTML(pathname: string): string {
  const isHome = pathname === "/";

  // Determine page title
  let title = businessName;
  let description = "AI coworkers for operations teams. Replace hours of manual work with AI that integrates into your existing tools.";
  if (!isHome) {
    const pageName = pathname.replace(/\/$/, "").split("/")[1] || "";
    const titles: Record<string, string> = {
      "how-it-works": "How It Works — AI Agent Architecture",
      "about": "About Us — Our Mission",
      "faq": "Frequently Asked Questions",
      "contact": "Free AI Workflow Assessment",
      "support": "Managed AI Operations — Support Plans",
      "build": "Build Your AI Team — Packages & Pricing",
      "workflows": "AI Operations Library",
      "roi-calculator": "ROI Calculator",
      "pricing": "Pricing — Simple, Transparent",
    };
    title = titles[pageName] || `${pageName.charAt(0).toUpperCase() + pageName.slice(1)} | ${businessName}`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"/>
<title>${title}</title>
<meta name="description" content="${description}"/>
<meta name="theme-color" content="#000000"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
<meta name="apple-mobile-web-app-title" content="Simpler Life"/>
<link rel="manifest" href="/manifest.json"/>
<link rel="apple-touch-icon" href="/icon-192.png"/>
<style>${CSS}</style>
</head>
<body>
<div class="site-wrapper">
  ${renderHeader(isHome, pathname)}
  <main>${isHome ? renderHomePage() : renderPage(pathname)}</main>
  ${renderFooter()}
</div>
</body>
</html>`;
}

const allIndustries = [
  { name: "Aerospace", id: "aerospace", icon: "✈️" },
  { name: "Agriculture", id: "agriculture", icon: "🌾" },
  { name: "Automotive", id: "automotive", icon: "🚗" },
  { name: "Construction", id: "construction", icon: "🏗️" },
  { name: "E-Commerce", id: "e-commerce", icon: "🛒" },
  { name: "Education", id: "education", icon: "📚" },
  { name: "Energy", id: "energy", icon: "⚡" },
  { name: "Financial Services", id: "financial-services", icon: "💰" },
  { name: "Government", id: "government", icon: "🏛️" },
  { name: "Healthcare", id: "healthcare", icon: "🏥" },
  { name: "Hospitality", id: "hospitality", icon: "🏨" },
  { name: "Insurance", id: "insurance", icon: "🛡️" },
  { name: "Legal", id: "legal", icon: "⚖️" },
  { name: "Logistics", id: "logistics", icon: "🚚" },
  { name: "Manufacturing", id: "manufacturing", icon: "🏭" },
  { name: "Media", id: "media", icon: "🎬" },
  { name: "Pharmaceuticals", id: "pharmaceuticals", icon: "💊" },
  { name: "Professional Services", id: "professional-services", icon: "💼" },
  { name: "Real Estate", id: "real-estate", icon: "🏠" },
  { name: "Retail", id: "retail", icon: "🛍️" },
  { name: "Technology", id: "technology", icon: "💻" },
  { name: "Telecom", id: "telecom", icon: "📡" },
  { name: "Transportation", id: "transportation", icon: "🚆" },
];

function renderHeader(isHome: boolean, pathname: string) {
  const industryLinks = allIndustries.map(i =>
    `<a href="/industries/${i.id}" class="dropdown-link">${i.icon} ${i.name}</a>`
  ).join("");

  const toolLinks = [
    { path: "/tools/ai-advisor", label: "🤖 AI Advisor" },
    { path: "/tools/can-we-automate-this", label: "🔍 Can We Automate This?" },
    { path: "/tools/assessment", label: "📋 AI Automation Assessment" },
    { path: "/roi-calculator", label: "📊 ROI Calculator" },
  ].map(t => `<a href="${t.path}" class="dropdown-link">${t.label}</a>`).join("");

  return `<header class="header">
    <div class="header-inner">
      <a href="/" class="logo">${businessName}</a>
      <nav class="nav-desktop">
        <div class="nav-dropdown">
          <button class="nav-link dropdown-trigger">Industries <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg></button>
          <div class="dropdown-menu dropdown-scroll">
            ${industryLinks}
          </div>
        </div>
        <div class="nav-dropdown">
          <button class="nav-link dropdown-trigger">Tools <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg></button>
          <div class="dropdown-menu">
            ${toolLinks}
          </div>
        </div>
        <a href="/build" class="nav-link${pathname === '/build' ? ' active' : ''}">Builder</a>
        <a href="/faq" class="nav-link${pathname === '/faq' ? ' active' : ''}">FAQ</a>
        <a href="/login" class="nav-link">Login</a>
      </nav>
    </div>
  </header>`;
}

function renderHomePage(): string {
  return `
    <!-- Hero -->
    <section class="hero">
      <div class="container hero-grid">
        <div class="hero-left">
          <span class="badge-hero">ACTIVE COGNITIVE WORKFORCES</span>
          <h1 class="hero-title">Stop copy-pasting. Reclaim <span class="text-emerald">80%</span> of your team's time.</h1>
          <p class="hero-subtitle">Describe your worst operational bottleneck in English. Our AI analyzes, maps, and compiles a custom automation blueprint instantly.</p>
          
          <div class="compiler-card">
            <label class="compiler-label">Describe your repetitive manual process:</label>
            <textarea class="compiler-input" rows="2" placeholder="E.g. Auto-read scanned invoice PDFs, extract line-items, update QuickBooks and notify Slack...">Auto-read scanned invoice PDFs, extract line-items, update QuickBooks and notify Slack</textarea>
            <div class="compiler-tags">
              <span class="tag-label">QUICK EXAMPLES:</span>
              <button class="tag-pill">AP/Invoice Parsing</button>
              <button class="tag-pill">Logistics Dispatching</button>
              <button class="tag-pill">Patient Registration</button>
            </div>
            <button class="btn-primary btn-compile">&#x1FA84; Compile AI Blueprint Plan</button>
          </div>
        </div>
        
        <div class="hero-right">
          <div class="roi-card">
            <h3 class="roi-title">Live ROI Calculator</h3>
            <p class="roi-subtitle">Calculate your team's labor savings instantly</p>
            <div class="slider-group">
              <div class="slider-row">
                <span class="slider-label">Team Size</span>
                <span class="slider-value">10 Employees</span>
              </div>
              <div class="slider-bar"><div class="slider-fill" style="width:10%"></div></div>
            </div>
            <div class="slider-group">
              <div class="slider-row">
                <span class="slider-label">Hours Wasted / Week</span>
                <span class="slider-value">8 Hours</span>
              </div>
              <div class="slider-bar"><div class="slider-fill" style="width:20%"></div></div>
            </div>
            <div class="slider-group">
              <div class="slider-row">
                <span class="slider-label">Hourly Loaded Cost</span>
                <span class="slider-value">$35/hr</span>
              </div>
              <div class="slider-bar"><div class="slider-fill" style="width:23%"></div></div>
            </div>
            <div class="roi-stats">
              <div class="roi-stat">
                <span class="stat-label">Hours Reclaimed</span>
                <span class="stat-value">320 hrs/mo</span>
              </div>
              <div class="roi-stat">
                <span class="stat-label">Payback Period</span>
                <span class="stat-value emerald">38 Days</span>
              </div>
            </div>
            <div class="roi-total">
              <span class="stat-label">Monthly Reclaimed Labor</span>
              <span class="stat-value-lg">$11,200 / mo</span>
            </div>
            <div class="roi-annual">
              <span>ANNUALIZED GAIN:</span>
              <span class="emerald">$134,400 / yr</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Social Proof -->
    <section class="section social-proof">
      <div class="container">
        <p class="trusted-by">Trusted by operations teams using</p>
        <div class="logo-bar">
          ${["Salesforce", "HubSpot", "Microsoft", "Google Workspace", "QuickBooks", "Slack", "Teams", "SAP"].map(l => `<span class="logo-item">${l}</span>`).join("")}
        </div>
        <div class="stats-grid">
          <div class="stat-card"><span class="stat-num">140+</span><span class="stat-desc">Labor Hours Saved / Month</span><span class="stat-sub">Per deployed agent</span></div>
          <div class="stat-card"><span class="stat-num">98.7%</span><span class="stat-desc">Task Accuracy Rate</span><span class="stat-sub">Across all workflows</span></div>
          <div class="stat-card"><span class="stat-num">< 3</span><span class="stat-desc">Day Average Setup</span><span class="stat-sub">From purchase to live</span></div>
          <div class="stat-card"><span class="stat-num">23</span><span class="stat-desc">Industry Verticals</span><span class="stat-sub">Pre-built integrations</span></div>
        </div>
        <div class="testimonial-card">
          <span class="testimonial-quote">💬</span>
          <blockquote>"We deployed two AI agents for AP and dispatch. Within the first week, they processed 340 invoices and routed 180 carrier bids — work that used to take three full-time people. The ROI was immediate."</blockquote>
          <p class="testimonial-author">— Operations Director, Midwest Logistics Co. (240 employees)</p>
        </div>
      </div>
    </section>

    <!-- Case Study -->
    <section class="section case-study">
      <div class="container">
        <div class="case-header">
          <span class="section-tag">CUSTOMER TRIAL SUCCESS</span>
          <h2 class="section-title">Vanguard Precision Manufacturing</h2>
        </div>
        <div class="case-card">
          <div class="case-content">
            <span class="industry-tag">INDUSTRY: Aviation & Aerospace Defense (50-person manufacturer)</span>
            <h3 class="case-headline">Reclaiming AP labor: Reducing fax and PDF processing from 18 minutes to 2 minutes.</h3>
            <p class="case-text">Vanguard precision manufacturing processed hundreds of supply-chain supplier invoice PDFs, handwritten faxes, and delivery logs manually. Staff was buried copying records, tracking line-items, and verifying data values.</p>
            <p class="case-text">Simpler Life deployed <strong>Ivy Invoice (Billing Coordinator)</strong> to auto-monitor accounts, utilize advanced OCR to parse table records, reconcile items against standard inventories, and sync clean logs.</p>
          </div>
          <div class="case-metrics">
            <div class="timeline">
              <div class="timeline-row"><span>BEFORE (Manual Entry)</span><span class="rose">18 minutes / bill</span></div>
              <div class="progress-bar"><div class="progress-fill" style="width:100%"></div></div>
              <div class="timeline-row"><span>AFTER (Simpler Life Employee)</span><span class="text-emerald">2 minutes / bill</span></div>
              <div class="progress-bar"><div class="progress-fill green" style="width:11%"></div></div>
            </div>
            <div class="metric-grid">
              <div><span class="metric-label">Labor Reclaimed</span><span class="metric-value">$12,000 / mo</span></div>
              <div><span class="metric-label">Data Accuracy</span><span class="metric-value">100% Correct</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Problems Section -->
    <section class="section problems">
      <div class="container text-center">
        <h2 class="section-title-lg">Your team shouldn't spend hours copying data between systems.</h2>
        <p class="section-text">Most operations teams are buried in manual work that software should already be doing: quoting, scheduling, CRM updates, invoicing, and document processing. We build AI coworkers that handle the repetitive parts so your people can focus on work that actually requires a human.</p>
      </div>
    </section>

    <!-- ROI CTA -->
    <section class="section cta-green">
      <div class="container cta-flex">
        <div><h2 class="cta-title">Calculate Your Potential Savings</h2><p class="cta-text">Use our simple ROI tool to see how many hours your team could reclaim.</p></div>
        <a href="/roi-calculator" class="btn-white">Open ROI Calculator →</a>
      </div>
    </section>

    <!-- Industry Examples -->
    <section class="section industries">
      <div class="container">
        <h2 class="section-title-lg text-center">Real Automations. Real Results.</h2>
        <p class="section-text text-center">We don't build generic bots. We build industry-specific agents for your highest-friction workflows.</p>
        
        <div class="workflow-visual">
          <h3 class="workflow-title">How an AI Coworker handles an inquiry</h3>
          <div class="workflow-steps">
            ${[["📧", "Customer Email"], ["🧠", "AI reads & extracts"], ["📊", "Updates CRM"], ["🧾", "Creates Invoice"], ["✅", "Sends Confirmation"], ["💬", "Slack Notification"]].map(([icon, label], i, arr) => `
              <div class="step-group">
                <div class="step-icon">${icon}</div>
                <span class="step-label">${label}</span>
                ${i < arr.length - 1 ? '<span class="step-arrow">›</span>' : ''}
              </div>
            `).join("")}
          </div>
        </div>

        <div class="industry-grid">
          ${[
            { name: "Healthcare", examples: ["Patient intake automation", "Prior authorization review", "Insurance verification", "Appointment reminders"] },
            { name: "Logistics", examples: ["Carrier dispatching", "Status communication", "POD collection & matching", "Invoice reconciliation"] },
            { name: "Finance", examples: ["AP automation", "Document data extraction", "Compliance reporting", "Client onboarding"] },
          ].map(ind => `
            <div class="industry-card">
              <h3 class="industry-name">${ind.name}</h3>
              <ul class="industry-list">
                ${ind.examples.map(ex => `<li><span class="dot"></span>${ex}</li>`).join("")}
              </ul>
            </div>
          `).join("")}
        </div>
      </div>
    </section>

    <!-- Customer Results -->
    <section class="section">
      <div class="container results-grid">
        <div class="result-card"><span class="result-tag">Manufacturing Client</span><span class="result-num">18 mins → 2 mins</span><p class="result-text">Reduced manual order processing time by over 85% per transaction.</p></div>
        <div class="result-card"><span class="result-tag">Logistics Client</span><span class="result-num">140 hours / month</span><p class="result-text">Total labor hours saved across the dispatch team in the first 30 days.</p></div>
        <div class="result-card"><span class="result-tag">Healthcare Practice</span><span class="result-num">73% Reduction</span><p class="result-text">Decrease in scheduling-related phone calls via automated patient reminders.</p></div>
      </div>
    </section>

    <!-- Journey -->
    <section class="section journey">
      <div class="container">
        <h2 class="section-title-lg">How We Get You There</h2>
        <p class="section-text">We don't just hand you a tool. We build AI coworkers that work inside the systems you already own.</p>
        <div class="journey-grid">
          ${[
            { step: "01", benefit: "Audit", name: "Discover", price: "FREE", desc: "In 30 minutes, we'll identify your top automation opportunities, estimate the time and cost savings, and recommend the best next step.", cta: "Get Your Blueprint ➜" },
            { step: "02", benefit: "Blueprint", name: "Design", price: "$2,500", desc: "We build a technical roadmap and workflow that fits your business, showing exactly how the agents will work.", cta: "Get Your Blueprint" },
            { step: "03", benefit: "Implementation", name: "Build", price: "From $7,500", desc: "Our engineers build and integrate the agents into your existing systems (CRM, ERP, Slack, Email).", cta: "Start Your Build ➜" },
            { step: "04", benefit: "Managed Ops", name: "Support", price: "From $750/mo", desc: "We keep every automation running, improving, and adapting as your business changes.", cta: "See Support Tiers" },
          ].map(s => `
            <div class="journey-card">
              <div class="step-num">${s.step}</div>
              <span class="benefit-tag">${s.benefit}</span>
              <h3 class="journey-name">${s.name}</h3>
              <p class="journey-desc">${s.desc}</p>
              <span class="journey-price">${s.price}</span>
              <button class="btn-primary btn-journey">${s.cta}</button>
            </div>
          `).join("")}
        </div>
      </div>
    </section>

    <!-- Pricing -->
    <section class="section pricing">
      <div class="container">
        <h2 class="section-title-lg text-center">Simple, Transparent Pricing.</h2>
        <p class="section-text text-center">No hidden fees or open-ended hourly billing. You pay for working, deployed agents that handle specific business results.</p>
        <div class="pricing-grid">
          <div class="pricing-card">
            <h3 class="pricing-category">Implementations</h3>
            <div class="plan-card"><div><span class="plan-name">Small Team</span><span class="plan-desc">2 AI Agents • 3 workflows</span></div><div><span class="plan-price">$7,500</span><span class="plan-period">One-Time</span></div></div>
            <div class="plan-card"><div><span class="plan-name">Growing Business</span><span class="plan-desc">5 AI Agents • Cross-department</span></div><div><span class="plan-price">$15,000</span><span class="plan-period">One-Time</span></div></div>
            <div class="plan-card featured"><div><span class="plan-name">Enterprise</span><span class="plan-desc">Custom workflows • Unlimited scale</span></div><div><span class="plan-price">$30k+</span><span class="plan-period">Custom</span></div></div>
            <p class="pricing-note">*The $2,500 blueprint fee is credited toward any implementation.</p>
          </div>
          <div class="pricing-card">
            <h3 class="pricing-category">Managed Operations</h3>
            <div class="plan-card"><div><span class="plan-name">Essential Ops</span><span class="plan-desc">Monitoring • Bug fixes</span></div><span class="plan-price">$750/mo</span></div>
            <div class="plan-card"><div><span class="plan-name">Professional Ops</span><span class="plan-desc">New automations • Strategy call</span></div><span class="plan-price">$2,000/mo</span></div>
            <div class="plan-card"><div><span class="plan-name">Enterprise Ops</span><span class="plan-desc">Dedicated AI engineer • Priority</span></div><span class="plan-price">$5,000/mo+</span></div>
          </div>
        </div>
        <div class="cta-bottom">
          <a href="/contact" class="btn-primary btn-lg">Stop Copy-Pasting. Start Your Plan ➜</a>
          <p class="cta-note">Identify your best opportunities before you commit to a build.</p>
        </div>
      </div>
    </section>

    <!-- Risk Reversal -->
    <section class="section risk">
      <div class="container risk-grid">
        <div class="risk-content">
          <h2 class="section-title-lg">100% Focused on Your Outcome.</h2>
          <div class="guarantees">
            <div class="guarantee"><div class="check">✓</div><div><h4>Audit Fee Credit</h4><p>The $2,500 blueprint fee is applied directly to your implementation costs. We only win when you build.</p></div></div>
            <div class="guarantee"><div class="check">✓</div><div><h4>Fixed-Price Deployment</h4><p>No open-ended billing. You pay for a working, integrated agent that achieves a specific time-saving result.</p></div></div>
            <div class="guarantee"><div class="check">✓</div><div><h4>Continuous Support</h4><p>Our managed operations covers every bug, prompt adjustment, and model update. Your automation never rots.</p></div></div>
          </div>
        </div>
        <div class="risk-cta">
          <span class="risk-tag">Start Today</span>
          <h3 class="risk-headline">Identify where AI can save you the most time.</h3>
          <a href="/contact" class="btn-white btn-block">Stop Copy-Pasting. Reclaim Your Time ➜</a>
          <p class="risk-note">No credit card required. 30-minute assessment.</p>
        </div>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="section final-cta">
      <div class="container">
        <div class="final-card">
          <h2 class="final-title">Every week your team spends hours on work that software should already be doing.</h2>
          <p class="final-text">In 30 minutes, we'll identify your top automation opportunities, estimate the time and cost savings, and recommend the best next step.</p>
          <a href="/contact" class="btn-primary btn-lg">Stop Copy-Pasting. Get Deployed ➜</a>
          <p class="final-quote">"The most productive 30 minutes your operations team will spend this quarter."</p>
        </div>
      </div>
    </section>
  `;
}

function renderPage(pathname: string): string {
  const clean = pathname.replace(/\/$/, "");
  const segments = clean.split("/").filter(Boolean);
  const page = segments[0] || "";
  
  if (page === "tools" && segments[1]) {
    switch (segments[1]) {
      case "ai-advisor": return renderToolsAdvisor();
      case "can-we-automate-this": return renderToolsAutomate();
      case "assessment": return renderToolsAssessment();
    }
  }
  if (page === "industries" && segments[1]) {
    return renderIndustry(segments[1]);
  }
  
  switch (page) {
    case "how-it-works": return renderHowItWorks();
    case "about": return renderAbout();
    case "faq": return renderFAQ();
    case "contact": return renderContact();
    case "support": return renderSupport();
    case "build": return renderBuild();
    case "login": return renderLogin();
    case "register": return renderRegister();
    case "set-password": return renderSetPassword();
    case "tools": return renderToolsHub();
    case "roi-calculator": return renderROICalculator();
    default: return renderComingSoon(pathname);
  }
}

function renderComingSoon(pathname: string): string {
  return `<div class="generic-page"><h1>${businessName}</h1><p>We're building this page: ${pathname}</p><a href="/" class="btn-primary">Back to Home</a></div>`;
}


// ─── Login ───
function renderLogin(): string {
  return "<section class=\"section\" style=\"display:flex;align-items:center;justify-content:center;min-height:70vh\"><div style=\"max-width:28rem;width:100%;background:#292524;border:1px solid #44403c;border-radius:2rem;padding:2.5rem\"><div style=\"text-align:center;margin-bottom:2rem\"><h2 style=\"font-size:1.75rem;font-weight:900;color:#fff;margin-bottom:0.25rem\">Welcome back</h2><p style=\"color:#78716c;font-size:0.875rem\">Or <a href=\"/register\" style=\"color:#10b981;font-weight:700;text-decoration:none\">create a new account</a></p></div><form id=\"login-form\" onsubmit=\"handleLogin(event)\" style=\"display:flex;flex-direction:column;gap:1.25rem\"><div id=\"login-error\" style=\"display:none;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;padding:0.75rem 1rem;border-radius:0.75rem;font-size:0.875rem\"></div><div><label style=\"display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.375rem\">Email</label><input id=\"login-email\" class=\"builder-input\" type=\"email\" required placeholder=\"you@example.com\"></div><div><label style=\"display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.375rem\">Password</label><input id=\"login-password\" class=\"builder-input\" type=\"password\" required placeholder=\"...\"></div><button type=\"submit\" style=\"width:100%;background:#10b981;color:#000;padding:0.875rem;border-radius:0.75rem;font-weight:800;font-size:1rem;border:none;cursor:pointer\">Sign in to Portal</button><div style=\"text-align:center;padding-top:0.5rem;border-top:1px solid #44403c\"><p style=\"font-size:0.75rem;color:#78716c\"><a href=\"/set-password\" style=\"color:#10b981;font-weight:700;text-decoration:none\">Set your password</a></p></div></form></div></section><script>async function handleLogin(e){e.preventDefault();const errEl=document.getElementById('login-error');errEl.style.display='none';const btn=e.target.querySelector('button');btn.disabled=true;btn.textContent='Signing in...';try{const res=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('login-email').value,password:document.getElementById('login-password').value})});const data=await res.json();if(!res.ok)throw new Error(data.error||'Login failed');window.location.href='/portal'}catch(err){errEl.textContent=err.message;errEl.style.display='block'}finally{btn.disabled=false;btn.textContent='Sign in to Portal'}}</script>";
}

// ─── Register ───
function renderRegister(): string {
  return "<section class=\"section\" style=\"display:flex;align-items:center;justify-content:center;min-height:70vh\"><div style=\"max-width:28rem;width:100%;background:#292524;border:1px solid #44403c;border-radius:2rem;padding:2.5rem\"><div style=\"text-align:center;margin-bottom:2rem\"><h2 style=\"font-size:1.75rem;font-weight:900;color:#fff;margin-bottom:0.25rem\">Create your account</h2><p style=\"color:#78716c;font-size:0.875rem\">Or <a href=\"/login\" style=\"color:#10b981;font-weight:700;text-decoration:none\">sign in</a></p></div><form id=\"register-form\" onsubmit=\"handleRegister(event)\" style=\"display:flex;flex-direction:column;gap:1.25rem\"><div id=\"register-error\" style=\"display:none;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;padding:0.75rem 1rem;border-radius:0.75rem;font-size:0.875rem\"></div><div><label style=\"display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.375rem\">Email</label><input id=\"register-email\" class=\"builder-input\" type=\"email\" required placeholder=\"you@example.com\"></div><div><label style=\"display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.375rem\">Password</label><input id=\"register-password\" class=\"builder-input\" type=\"password\" required placeholder=\"Min 8 characters\" minlength=\"8\"></div><button type=\"submit\" style=\"width:100%;background:#10b981;color:#000;padding:0.875rem;border-radius:0.75rem;font-weight:800;font-size:1rem;border:none;cursor:pointer\">Create Account</button><div style=\"text-align:center;padding-top:0.5rem;border-top:1px solid #44403c\"><p style=\"font-size:0.75rem;color:#78716c\">Already have an account? <a href=\"/login\" style=\"color:#10b981;font-weight:700;text-decoration:none\">Sign in</a></p></div></form></div></section><script>async function handleRegister(e){e.preventDefault();const errEl=document.getElementById('register-error');errEl.style.display='none';const btn=e.target.querySelector('button');btn.disabled=true;btn.textContent='Creating...';try{const res=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('register-email').value,password:document.getElementById('register-password').value})});const data=await res.json();if(!res.ok)throw new Error(data.error||'Registration failed');window.location.href='/portal'}catch(err){errEl.textContent=err.message;errEl.style.display='block'}finally{btn.disabled=false;btn.textContent='Create Account'}}</script>";
}

// ─── Set Password ───
function renderSetPassword(): string {
  return "<section class=\"section\" style=\"display:flex;align-items:center;justify-content:center;min-height:70vh\"><div style=\"max-width:28rem;width:100%;background:#292524;border:1px solid #44403c;border-radius:2rem;padding:2.5rem\"><div style=\"text-align:center;margin-bottom:2rem\"><h2 style=\"font-size:1.75rem;font-weight:900;color:#fff;margin-bottom:0.25rem\">Set your password</h2><p style=\"color:#78716c;font-size:0.875rem\">Create or reset your account password</p></div><form id=\"setpw-form\" onsubmit=\"handleSetPassword(event)\" style=\"display:flex;flex-direction:column;gap:1.25rem\"><div id=\"setpw-error\" style=\"display:none;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;padding:0.75rem 1rem;border-radius:0.75rem;font-size:0.875rem\"></div><div id=\"setpw-success\" style=\"display:none;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);color:#6ee7b7;padding:0.75rem 1rem;border-radius:0.75rem;font-size:0.875rem\"></div><div><label style=\"display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.375rem\">Email</label><input id=\"setpw-email\" class=\"builder-input\" type=\"email\" required placeholder=\"you@example.com\"></div><div><label style=\"display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.375rem\">New Password</label><input id=\"setpw-password\" class=\"builder-input\" type=\"password\" required placeholder=\"Min 8 characters\" minlength=\"8\"></div><div><label style=\"display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.375rem\">Confirm Password</label><input id=\"setpw-confirm\" class=\"builder-input\" type=\"password\" required placeholder=\"Re-enter password\"></div><button type=\"submit\" style=\"width:100%;background:#10b981;color:#000;padding:0.875rem;border-radius:0.75rem;font-weight:800;font-size:1rem;border:none;cursor:pointer\">Set Password</button><div style=\"text-align:center;padding-top:0.5rem;border-top:1px solid #44403c\"><p style=\"font-size:0.75rem;color:#78716c\"><a href=\"/login\" style=\"color:#10b981;font-weight:700;text-decoration:none\">Back to login</a></p></div></form></div></section><script>async function handleSetPassword(e){e.preventDefault();const errEl=document.getElementById('setpw-error');const okEl=document.getElementById('setpw-success');errEl.style.display='none';okEl.style.display='none';const pw=document.getElementById('setpw-password').value;if(pw.length<8){errEl.textContent='Password must be at least 8 characters';errEl.style.display='block';return}if(pw!==document.getElementById('setpw-confirm').value){errEl.textContent='Passwords do not match';errEl.style.display='block';return}const btn=e.target.querySelector('button');btn.disabled=true;btn.textContent='Setting...';try{const res=await fetch('/api/set-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('setpw-email').value,password:pw})});const data=await res.json();if(!res.ok)throw new Error(data.error||'Failed');okEl.textContent='Password set! Redirecting...';okEl.style.display='block';setTimeout(function(){window.location.href='/login'},1500)}catch(err){errEl.textContent=err.message;errEl.style.display='block'}finally{btn.disabled=false;btn.textContent='Set Password'}}</script>";
}

// ─── How It Works ───
function renderHowItWorks(): string {
  return `
<section class="section" style="padding-top:5rem;padding-bottom:5rem;background:#1a1917;border-bottom:1px solid #292524;text-align:center">
  <div class="container">
    <span class="badge-hero" style="margin:0 auto 1rem">AGENT ARCHITECTURE</span>
    <h1 style="font-size:3rem;font-weight:900;color:#fff;line-height:1.1;margin-bottom:1.5rem">What is an AI Agent?</h1>
    <p style="font-size:1.25rem;color:#a8a29e;max-width:36rem;margin:0 auto;line-height:1.7">Think of an AI agent as a digital employee that lives inside your existing tools. Unlike traditional automation, agents can read, reason, decide, and act autonomously.</p>
  </div>
</section>
<section class="section">
  <div class="container" style="display:grid;grid-template-columns:1fr;gap:4rem;align-items:center">
    <div style="max-width:48rem">
      <h2 style="font-size:2rem;font-weight:900;color:#fff;margin-bottom:2rem">An AI Employee in your existing tool stack.</h2>
      <p style="font-size:1.125rem;color:#a8a29e;line-height:1.7;margin-bottom:2rem">Traditional software requires perfect structured data. AI agents can reason through messy, unstructured real-world tasks.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        ${["Read & analyze emails","Update HubSpot & Salesforce","Generate reports & charts","Call REST, GraphQL & SOAP APIs","Interact with customers","Schedule and coordinate","Parse invoices & documents","Trigger automated alerts"].map(t => `<div style="display:flex;align-items:center;gap:0.5rem;color:#d6d3d1;font-weight:700;font-size:0.875rem"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg><span>${t}</span></div>`).join("")}
      </div>
    </div>
  </div>
</section>
<section class="section" style="background:#1a1917;border-top:1px solid #292524;border-bottom:1px solid #292524">
  <div class="container" style="text-align:center">
    <h2 style="font-size:2rem;font-weight:900;color:#fff;margin-bottom:1rem">Traditional Software vs. AI Agents</h2>
    <p style="color:#a8a29e;margin-bottom:3rem">Why simple macro triggers fail, and how cognitive agents succeed.</p>
    <table style="width:100%;text-align:left;border-collapse:collapse">
      <thead><tr style="border-bottom:1px solid #44403c;color:#78716c;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em"><th style="padding:1rem 1.5rem 1rem 0">Feature</th><th style="padding:1rem 1.5rem">Traditional Automation</th><th style="padding:1rem 0 1rem 1.5rem;color:#10b981">AI Operations Coworker</th></tr></thead>
      <tbody style="color:#a8a29e;font-size:0.875rem">
        <tr style="border-bottom:1px solid #44403c"><td style="padding:1rem 1.5rem 1rem 0;font-weight:700;color:#fff">Data Requirement</td><td style="padding:1rem 1.5rem">Requires strict APIs and clean CSV inputs.</td><td style="padding:1rem 0 1rem 1.5rem;font-weight:700;color:#10b981">Processes messy emails, scanned images, handwritten PDFs, and voice.</td></tr>
        <tr style="border-bottom:1px solid #44403c"><td style="padding:1rem 1.5rem 1rem 0;font-weight:700;color:#fff">Decision Capability</td><td style="padding:1rem 1.5rem">Simple If-This-Then-That rules. Breaks on deviations.</td><td style="padding:1rem 0 1rem 1.5rem;font-weight:700;color:#10b981">Weighs context, evaluates rules, parses exceptions, reasons logically.</td></tr>
        <tr style="border-bottom:1px solid #44403c"><td style="padding:1rem 1.5rem 1rem 0;font-weight:700;color:#fff">Integration Scale</td><td style="padding:1rem 1.5rem">Locked to pre-existing tool integrations.</td><td style="padding:1rem 0 1rem 1.5rem;font-weight:700;color:#10b981">Compatible with all ERPs, CRMs, local files, faxes, legacy portals.</td></tr>
        <tr><td style="padding:1rem 1.5rem 1rem 0;font-weight:700;color:#fff">Error Handling</td><td style="padding:1rem 1.5rem">Fails silently or crashes the pipeline.</td><td style="padding:1rem 0 1rem 1.5rem;font-weight:700;color:#10b981">Routes exceptions to Human-in-the-Loop dashboard.</td></tr>
      </tbody>
    </table>
  </div>
</section>
<section class="section">
  <div class="container" style="text-align:center">
    <h2 style="font-size:2rem;font-weight:900;color:#fff;margin-bottom:0.5rem">Security & Reliability First</h2>
    <p style="color:#a8a29e;margin-bottom:3rem">Enterprise-grade guardrails for complete peace of mind.</p>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2rem">
      ${[["🛡️","Data Stays Local","Our agents connect directly within your existing systems. We never store or resell your operational credentials."],["👥","Human-In-The-Loop","High-stakes decisions route to an approval dashboard. Your team maintains final authority."],["🔄","Operational Redundancy","If an API is down or latency surges, we retry and auto-scale to ensure zero drop-outs."]].map(([icon,title,desc]) => `<div style="background:#292524;border:1px solid #44403c;border-radius:1.5rem;padding:2rem;text-align:left"><div style="font-size:2rem;margin-bottom:1rem">${icon}</div><h4 style="font-size:1.125rem;font-weight:900;color:#fff;margin-bottom:0.5rem">${title}</h4><p style="font-size:0.875rem;color:#a8a29e;line-height:1.6">${desc}</p></div>`).join("")}
    </div>
  </div>
</section>
<section style="background:#059669;padding:5rem 1rem;text-align:center;color:#fff">
  <div class="container">
    <h2 style="font-size:3rem;font-weight:900;margin-bottom:1rem;line-height:1.2">Stop Copy-Pasting. Get a Free Automation Plan.</h2>
    <p style="font-size:1.125rem;color:#a7f3d0;margin-bottom:2rem;max-width:36rem;margin-left:auto;margin-right:auto">Our 30-minute assessment will outline the exact workflows, cost savings, and timelines for your custom AI employee.</p>
    <a href="/contact" class="btn-white">Get Your Free Blueprint ➜</a>
  </div>
</section>`;
}

// ─── About ───
function renderAbout(): string {
  return `
<section class="section" style="text-align:center">
  <div class="container" style="max-width:48rem">
    <span class="badge-hero" style="margin:0 auto 1rem">ABOUT US</span>
    <h1 style="font-size:3rem;font-weight:900;color:#fff;line-height:1.1;margin-bottom:1.5rem">Our Mission</h1>
    <p style="font-size:1.25rem;color:#a8a29e;line-height:1.7">We build AI operations teams to liberate people from the soul-crushing burden of repetitive, manual data entry.</p>
  </div>
</section>
<section class="section">
  <div class="container" style="max-width:48rem;background:#292524;border-radius:3rem;padding:3rem;border:1px solid #44403c;position:relative;overflow:hidden">
    <h2 style="font-size:2.5rem;font-weight:900;color:#fff;line-height:1.2;margin-bottom:2rem">Software was supposed to make work easier. <span style="color:#10b981">AI actually does.</span></h2>
    <div style="font-size:1.125rem;color:#a8a29e;line-height:1.8;display:flex;flex-direction:column;gap:1.5rem">
      <p>We started Simpler Life 100 because we saw operations teams buried in manual work that software should have solved a decade ago. Copying data between tabs, manually reviewing documents, and chasing status updates isn't "work"—it's waste.</p>
      <p style="font-weight:700;color:#fff">We don't sell generic software. We build AI employees that work inside the systems you already own.</p>
      <p>Our goal is to give your team their time back, so they can focus on growth, strategy, and the human parts of your business that no computer could ever replicate.</p>
    </div>
  </div>
</section>
<section class="section">
  <div class="container" style="max-width:48rem">
    <h3 style="font-size:1.5rem;font-weight:900;color:#fff;text-align:center;margin-bottom:2rem">Our Core Principles</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
      ${[["Outcome Over Output","We don't bill by open-ended hours. We build and deploy fully functional AI employees that deliver real, measurable business results."],["Respect for Human Labor","Copying numbers from a PDF to an ERP is an insult to human intelligence. We automate the mechanical work."],["Radical Simplicity","Our agents live inside the tools your team already uses every day. No new complex portals to learn."],["Continuous Adaptation","Through managed operations, we ensure your automations remain adaptive, responsive, and reliable over time."]].map(([t,d]) => `<div style="background:#292524;border:1px solid #44403c;border-radius:1.5rem;padding:2rem"><h4 style="font-size:1.125rem;font-weight:900;color:#fff;margin-bottom:0.5rem">${t}</h4><p style="font-size:0.875rem;color:#a8a29e;line-height:1.6">${d}</p></div>`).join("")}
    </div>
  </div>
</section>`;
}

// ─── FAQ ───
function renderFAQ(): string {
  const cats = [
    { category: "Capabilities & Scope", items: [
      { q: "Will this replace our employees?", a: "No. Our agents are designed to take over repetitive, high-volume tasks that burn people out. This frees your team to focus on higher-value work." },
      { q: "What happens if the AI makes a mistake?", a: "Reliability is our priority. Every agent includes Human-in-the-Loop review dashboards for high-stakes decisions, ensuring your team retains oversight." },
      { q: "How many agents can we deploy?", a: "There are no architectural limits. Clients run from a single billing agent to 10+ interconnected agents across departments." },
    ]},
    { category: "Integrations & Tech", items: [
      { q: "Will it work with our existing software?", a: "Yes. Our agents integrate with Salesforce, HubSpot, Microsoft 365, Google Workspace, Slack, Teams, QuickBooks, SAP, and most modern APIs." },
      { q: "How long does it take to deploy?", a: "Most agents are fully operational within 2-4 weeks. Complex enterprise implementations take 6-8 weeks." },
      { q: "Do we need an internal IT team?", a: "Not at all. Our Managed Operations tiers handle all model updates, monitoring, API patches, and security auditing." },
    ]},
    { category: "Security & Trust", items: [
      { q: "Is our business data secure?", a: "Absolutely. Your data stays within your existing systems. We use bank-level encryption and never store or resell your credentials." },
      { q: "Do you train models on our data?", a: "Never. All agents use private API endpoints. Your data is never used to train public LLMs." },
    ]},
  ];
  return `
<section class="section" style="text-align:center">
  <div class="container" style="max-width:48rem">
    <span class="badge-hero" style="margin:0 auto 1rem">RESOURCES</span>
    <h1 style="font-size:3rem;font-weight:900;color:#fff;margin-bottom:1.5rem">Common Questions</h1>
    <p style="font-size:1.125rem;color:#a8a29e">Everything you need to know before we build, deploy, and scale your AI operations team.</p>
  </div>
</section>
<section class="section">
  <div class="container" style="max-width:56rem">
    ${cats.map(c => `
      <div style="margin-bottom:3rem">
        <h3 style="font-size:0.75rem;font-family:monospace;font-weight:800;letter-spacing:0.1em;color:#78716c;text-transform:uppercase;border-bottom:1px solid #44403c;padding-bottom:0.75rem;margin-bottom:1.5rem">${c.category}</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
          ${c.items.map(item => `
            <div style="background:#292524;border:1px solid #44403c;border-radius:1.5rem;padding:2rem">
              <h4 style="font-size:1.125rem;font-weight:900;color:#fff;margin-bottom:0.75rem">${item.q}</h4>
              <p style="font-size:0.875rem;color:#a8a29e;line-height:1.6">${item.a}</p>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("")}
    <div style="background:#292524;border:1px solid #44403c;border-radius:2.5rem;padding:3rem;text-align:center">
      <h3 style="font-size:1.5rem;font-weight:900;color:#fff;margin-bottom:1rem">Have a specific technical question?</h3>
      <p style="color:#a8a29e;font-size:0.875rem;margin-bottom:2rem">We build custom integrations for high-security environments. Let's discuss your requirements.</p>
      <a href="/contact" class="btn-primary">Talk to an Integration Engineer</a>
    </div>
  </div>
</section>`;
}

// ─── Contact ───
function renderContact(): string {
  const inds = ["Energy","Manufacturing","Automotive","Financial Services","Logistics","Healthcare","Legal","Accounting","Insurance","Retail","Ecommerce","Construction","Real Estate","Hospitality","Education","Nonprofits","Government","Technology","Telecom","Marketing","HR","Agriculture","Other"];
  return `
<section class="section" style="text-align:center">
  <div class="container" style="max-width:40rem">
    <h1 style="font-size:3rem;font-weight:900;color:#fff;margin-bottom:1rem">Free AI Workflow Assessment</h1>
    <p style="font-size:1.125rem;color:#a8a29e;line-height:1.7">Tell us what's slowing your team down. We'll analyze and recommend the best next step — no commitment, no call required.</p>
  </div>
</section>
<section class="section" style="padding-top:0">
  <div class="container" style="max-width:40rem;background:#292524;border-radius:2.5rem;padding:3rem;border:1px solid #44403c">
    <form action="/contact" method="POST" style="display:flex;flex-direction:column;gap:2rem">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
        <div><label style="display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.5rem">Your Name</label><input type="text" required placeholder="Jane Smith" style="width:100%;border-radius:0.75rem;border:1px solid #44403c;background:#1a1917;padding:0.75rem 1rem;color:#e7e5e4;font-size:1rem;outline:none"/></div>
        <div><label style="display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.5rem">Work Email</label><input type="email" required placeholder="jane@company.com" style="width:100%;border-radius:0.75rem;border:1px solid #44403c;background:#1a1917;padding:0.75rem 1rem;color:#e7e5e4;font-size:1rem;outline:none"/></div>
      </div>
      <div><label style="display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.5rem">Company</label><input type="text" required placeholder="Company name" style="width:100%;border-radius:0.75rem;border:1px solid #44403c;background:#1a1917;padding:0.75rem 1rem;color:#e7e5e4;font-size:1rem;outline:none"/></div>
      <div><label style="display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.5rem">Industry</label><select required style="width:100%;border-radius:0.75rem;border:1px solid #44403c;background:#1a1917;padding:0.75rem 1rem;color:#e7e5e4;font-size:1rem;outline:none"><option value="" disabled selected>Select your industry</option>${inds.map(i => `<option value="${i}">${i}</option>`).join("")}</select></div>
      <div><label style="display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.5rem">What manual work is eating your team's time?</label><textarea rows="5" required placeholder="Describe the repetitive task or workflow..." style="width:100%;border-radius:0.75rem;border:1px solid #44403c;background:#1a1917;padding:0.75rem 1rem;color:#e7e5e4;font-size:1rem;outline:none;resize:none;font-family:inherit"></textarea></div>
      <button type="submit" style="width:100%;background:#10b981;color:#000;padding:1rem;border-radius:0.75rem;font-weight:700;font-size:1.125rem;border:none;cursor:pointer">Get My Recommendation →</button>
      <p style="text-align:center;font-size:0.875rem;color:#78716c">No spam. No sales calls. Just a clear recommendation.</p>
    </form>
  </div>
</section>`;
}

// ─── Support ───
function renderSupport(): string {
  const tiers = [
    {name:"Essential Ops",price:"$750",period:"/mo",desc:"Perfect for small teams with 1-2 key AI agents.",features:["Monitoring & bug fixes","Prompt updates","Monthly optimization","Email support","12-hour response time"],popular:false,cta:"Buy Essential Ops"},
    {name:"Professional Ops",price:"$2,000",period:"/mo",desc:"Our most popular choice for growing businesses.",features:["Everything in Essential","New automations each month","AI model improvements","Monthly strategy call","Priority support","4-hour response time"],popular:true,cta:"Buy Professional Ops"},
    {name:"Enterprise Ops",price:"$5,000",period:"/mo+",desc:"Custom-built for large multi-department AI systems.",features:["Everything in Professional","Unlimited optimization","Dedicated AI engineer","Priority support","Quarterly roadmap review","Custom SLA"],popular:false,cta:"Contact for Quote"},
  ];
  return `
<section class="section" style="text-align:center;padding-bottom:2rem">
  <div class="container" style="max-width:48rem">
    <h1 style="font-size:3rem;font-weight:900;color:#fff;margin-bottom:1rem;line-height:1.1">Managed AI Operations</h1>
    <p style="font-size:1.125rem;color:#a8a29e;line-height:1.7">Model rot and prompt drift are real. We keep your AI employees running at peak performance.</p>
  </div>
</section>
<section class="section" style="padding-top:2rem">
  <div class="container">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2rem;align-items:start">
      ${tiers.map(t => `
        <div style="background:#292524;border:2px solid ${t.popular ? '#10b981' : '#44403c'};border-radius:3rem;padding:3rem;position:relative;${t.popular ? 'transform:scale(1.05);z-index:10' : ''}">
          ${t.popular ? '<div style="position:absolute;top:0;left:50%;transform:translate(-50%,-50%);background:#10b981;color:#000;padding:0.375rem 1.5rem;border-radius:9999px;font-size:0.75rem;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;white-space:nowrap">Most Popular</div>' : ''}
          <h3 style="font-size:1.5rem;font-weight:900;color:#fff;margin-bottom:0.5rem">${t.name}</h3>
          <p style="color:#a8a29e;font-size:0.875rem;line-height:1.6;margin-bottom:2rem">${t.desc}</p>
          <div style="display:flex;align-items:baseline;gap:0.25rem;margin-bottom:2rem"><span style="font-size:3rem;font-weight:900;color:#fff">${t.price}</span><span style="font-size:1.25rem;color:#78716c;font-weight:700">${t.period}</span></div>
          <ul style="display:flex;flex-direction:column;gap:1rem;margin-bottom:2.5rem;list-style:none">
            ${t.features.map(f => `<li style="display:flex;align-items:flex-start;gap:0.75rem;color:#a8a29e;font-weight:500"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" style="flex-shrink:0;margin-top:0.125rem"><path d="M5 13l4 4L19 7"/></svg><span>${f}</span></li>`).join("")}
          </ul>
          <a href="/contact" style="display:block;width:100%;text-align:center;padding:1.25rem;border-radius:1.25rem;font-weight:900;font-size:1.125rem;text-decoration:none;background:${t.popular ? '#10b981' : '#44403c'};color:${t.popular ? '#000' : '#e7e5e4'}">${t.cta}</a>
        </div>
      `).join("")}
    </div>
  </div>
</section>`;
}

// ─── Build (Builder page) ───
function renderBuild(): string {
  const pkgs = [
    {id:"starter",name:"Starter",price:"$7,500",limit:2,features:["2 AI employees","3 automated workflows","CRM integration","30 days support"],desc:"Perfect for small teams ready to automate their highest-friction process.",popular:false,link:"https://buy.stripe.com/00w28tcp97g37Llc642Fa17"},
    {id:"growth",name:"Growth",price:"$15,000",limit:5,features:["5 AI employees","Cross-dept workflows","CRM + ERP integrations","Custom dashboards","60 days support"],desc:"For growing teams that need automation across multiple departments.",popular:true,link:"https://buy.stripe.com/5kQ14pah11VJfdN6LK2Fa18"},
    {id:"scale",name:"Scale",price:"$30,000",limit:18,features:["Up to 18 AI employees","Unlimited workflows","Custom agent training","Advanced integrations","90 days support"],desc:"Enterprise-grade AI workforce for organizations ready to transform operations.",popular:false,link:"https://buy.stripe.com/3cIfZj74PbwjfdNda82Fa19"},
  ];
  const agents = [
    {id:"document_intake",name:"Document AI System",icon:"📄",desc:"Universal document processing & OCR"},
    {id:"healthcare_intake",name:"Healthcare Intake AI",icon:"🏥",desc:"Patient registrations & insurance verification"},
    {id:"invoice_ledger",name:"Invoice & Ledger AI",icon:"💸",desc:"AP/AR automation & reconciliation"},
    {id:"sales_outreach",name:"Sales Outreach AI",icon:"🚀",desc:"Lead gen & CRM pipeline management"},
    {id:"hr_compliance",name:"HR Intake & Compliance AI",icon:"👥",desc:"Onboarding, offboarding & compliance"},
    {id:"dispatch_logistics",name:"Dispatch Logistics AI",icon:"🚚",desc:"Carrier dispatching & route optimization"},
    {id:"audit_logger",name:"Operations Audit AI",icon:"📋",desc:"Automated audit trail logging"},
    {id:"voice_receptionist",name:"Voice AI Receptionist",icon:"📞",desc:"AI-powered call handling (Twilio)"},
    {id:"support_agent",name:"Customer Support AI",icon:"🎧",desc:"Ticket handling & customer support"},
    {id:"knowledge_assistant",name:"Knowledge Assistant",icon:"🧠",desc:"RAG-powered internal knowledge base"},
    {id:"inventory_management",name:"Inventory Management AI",icon:"📦",desc:"Stock tracking & reorder automation"},
    {id:"contract_management",name:"Contract Management AI",icon:"📝",desc:"Contract review & lifecycle management"},
    {id:"customer_success",name:"Customer Success AI",icon:"🌟",desc:"Retention monitoring & engagement"},
    {id:"project_management",name:"Project Management AI",icon:"📊",desc:"Task tracking & milestone automation"},
    {id:"procurement_vendor",name:"Procurement & Vendor AI",icon:"🤝",desc:"Vendor management & purchase orders"},
    {id:"it_operations",name:"IT Operations AI",icon:"🖥️",desc:"DevOps monitoring & infra automation"},
    {id:"fp_and_a",name:"FP&A AI",icon:"💰",desc:"Financial planning & forecasting"},
    {id:"marketing_social",name:"Marketing & Social AI",icon:"📱",desc:"Social media & campaign automation"},
  ];
  const pkgsJSON = JSON.stringify(pkgs);
  const agentsJSON = JSON.stringify(agents);

  return `
<style>
.builder-step { display: none; }
.builder-step.active { display: block; }
.builder-pkg-card { cursor: pointer; background: #292524; border: 2px solid #44403c; border-radius: 1.5rem; padding: 2rem; transition: all .2s; }
.builder-pkg-card.selected { border-color: #10b981; background: rgba(16,185,129,0.05); box-shadow: 0 0 20px rgba(16,185,129,0.1); }
.builder-pkg-card:hover:not(.selected) { border-color: #57534e; }
.builder-agent-card { cursor: pointer; background: #1c1917; border: 2px solid #44403c; border-radius: 0.75rem; padding: 1rem; transition: all .2s; display: flex; align-items: flex-start; gap: 0.75rem; }
.builder-agent-card.selected { border-color: #10b981; background: rgba(16,185,129,0.08); }
.builder-agent-card.disabled { opacity: 0.35; cursor: not-allowed; border-color: #292524; }
.builder-progress-step { display: flex; align-items: center; gap: 0.5rem; transition: color .2s; }
.builder-progress-dot { width: 2rem; height: 2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 900; }
.builder-input { width: 100%; border-radius: 0.75rem; border: 1px solid #44403c; background: #1c1917; padding: 0.75rem 1rem; color: #e7e5e4; font-size: 1rem; outline: none; font-family: inherit; }
.builder-input:focus { border-color: #10b981; box-shadow: 0 0 0 2px rgba(16,185,129,0.2); }
.builder-input::placeholder { color: #57534e; }
</style>

<section class="section" style="text-align:center;padding-bottom:1rem">
  <div class="container" style="max-width:48rem">
    <span class="badge-hero" style="margin:0 auto 1rem">Build Your AI Team</span>
    <h1 style="font-size:3rem;font-weight:900;color:#fff;margin-bottom:1rem;line-height:1.1">Deploy Your AI Operations Team</h1>
    <p style="font-size:1.125rem;color:#a8a29e;line-height:1.7">Select your package, choose your AI employees, and get deployed in days — not months.</p>
  </div>
</section>

<section class="section" style="padding-top:1rem">
  <div class="container" style="max-width:64rem">

    <!-- Progress Bar -->
    <div style="display:flex;align-items:center;justify-content:center;gap:0.5rem;margin-bottom:3rem" id="progress-bar">
      ${['Package','AI Team','Your Info','Review'].map((l,i) => `
        <div class="builder-progress-step" style="color:${i===0?'#10b981':'#57534e'}" data-step="${i}">
          <div class="builder-progress-dot" style="background:${i===0?'#10b981':'#292524'};color:${i===0?'#fff':'#57534e'}">${i===0?'1':i+1}</div>
          <span style="font-size:0.75rem;font-family:monospace;font-weight:800">${l}</span>
        </div>
        ${i<3 ? '<div style="width:2rem;height:2px;background:#292524"></div>' : ''}
      `).join("")}
    </div>

    <div id="build-form" style="background:#292524;border:1px solid #44403c;border-radius:2rem;padding:3rem">

      <!-- STEP 1: Package -->
      <div class="builder-step active" data-step="0">
        <h2 style="font-size:1.5rem;font-weight:900;color:#fff;margin-bottom:2rem">Choose Your Package</h2>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem">
          ${pkgs.map((p,i) => `
            <div class="builder-pkg-card ${i===1?'selected':''}" data-pkg="${p.id}" data-limit="${p.limit}" data-link="${p.link}">
              ${p.popular?'<div style="position:absolute;top:0;left:50%;transform:translate(-50%,-50%);background:#10b981;color:#000;padding:0.25rem 1rem;border-radius:9999px;font-size:0.625rem;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;white-space:nowrap">Most Popular</div>':''}
              <div style="text-align:left;position:relative">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem">
                  <h3 style="font-size:1.25rem;font-weight:900;color:#fff">${p.name}</h3>
                  <div class="pkg-radio" style="width:1.5rem;height:1.5rem;border-radius:50%;border:2px solid ${i===1?'#10b981':'#57534e'};display:flex;align-items:center;justify-content:center">${i===1?'<div style="width:0.5rem;height:0.5rem;border-radius:50%;background:#10b981"></div>':''}</div>
                </div>
                <div style="font-size:2rem;font-weight:900;color:#10b981;margin-bottom:0.5rem">${p.price}</div>
                <p style="color:#78716c;font-size:0.8125rem;line-height:1.5;margin-bottom:1rem">${p.desc}</p>
                <ul style="list-style:none;display:flex;flex-direction:column;gap:0.5rem">${p.features.map(f => `<li style="display:flex;align-items:center;gap:0.5rem;color:#a8a29e;font-size:0.875rem;font-weight:500"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>${f}</li>`).join("")}</ul>
              </div>
            </div>
          `).join("")}
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:2rem;padding-top:2rem;border-top:1px solid #44403c">
          <button onclick="nextStep(1)" style="background:#10b981;color:#000;padding:0.75rem 2rem;border-radius:0.75rem;font-weight:700;font-size:1rem;border:none;cursor:pointer">Continue →</button>
        </div>
      </div>

      <!-- STEP 2: Agents -->
      <div class="builder-step" data-step="1">
        <h2 style="font-size:1.5rem;font-weight:900;color:#fff;margin-bottom:0.5rem">Select Your AI Employees</h2>
        <p style="color:#a8a29e;margin-bottom:0.5rem">Choose up to <span id="agent-limit-display" style="color:#10b981;font-weight:700">2</span> AI employees for your <span id="pkg-name-display" style="color:#10b981;font-weight:700">Starter</span> package.</p>
        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem">
          <div style="flex:1;height:0.5rem;background:#1c1917;border-radius:9999px;overflow:hidden"><div id="agent-bar" style="height:100%;background:#10b981;border-radius:9999px;width:0%;transition:width .3s"></div></div>
          <span id="agent-count" style="font-size:0.875rem;font-family:monospace;font-weight:700;color:#a8a29e">0/2</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem">
          ${agents.map(a => `
            <div class="builder-agent-card" data-agent="${a.id}" onclick="toggleAgent(this,'${a.id}')">
              <span style="font-size:1.5rem;flex-shrink:0">${a.icon}</span>
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;color:#fff;font-size:0.875rem">${a.name}</div>
                <div style="color:#78716c;font-size:0.75rem;margin-top:0.125rem">${a.desc}</div>
              </div>
              <svg class="agent-check" style="width:1.25rem;height:1.25rem;color:#10b981;flex-shrink:0;display:none;margin-top:0.25rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
            </div>
          `).join("")}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:2rem;padding-top:2rem;border-top:1px solid #44403c">
          <button onclick="prevStep(0)" style="background:none;border:none;color:#a8a29e;font-weight:700;cursor:pointer;font-size:0.875rem">← Back</button>
          <button onclick="nextStep(2)" style="background:#10b981;color:#000;padding:0.75rem 2rem;border-radius:0.75rem;font-weight:700;font-size:1rem;border:none;cursor:pointer">Continue →</button>
        </div>
      </div>

      <!-- STEP 3: Info -->
      <div class="builder-step" data-step="2">
        <h2 style="font-size:1.5rem;font-weight:900;color:#fff;margin-bottom:2rem">Your Information</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;max-width:36rem">
          <div><label style="display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.5rem">Company Name *</label><input id="field-company" class="builder-input" type="text" required placeholder="Acme Corp"></div>
          <div><label style="display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.5rem">Your Name *</label><input id="field-name" class="builder-input" type="text" required placeholder="Jane Smith"></div>
          <div><label style="display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.5rem">Work Email *</label><input id="field-email" class="builder-input" type="email" required placeholder="jane@acmecorp.com"></div>
          <div><label style="display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.5rem">Phone Number *</label><input id="field-phone" class="builder-input" type="tel" required placeholder="+1 (555) 123-4567"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:2rem;padding-top:2rem;border-top:1px solid #44403c">
          <button onclick="prevStep(1)" style="background:none;border:none;color:#a8a29e;font-weight:700;cursor:pointer;font-size:0.875rem">← Back</button>
          <button onclick="nextStep(3)" style="background:#10b981;color:#000;padding:0.75rem 2rem;border-radius:0.75rem;font-weight:700;font-size:1rem;border:none;cursor:pointer">Continue →</button>
        </div>
      </div>

      <!-- STEP 4: Review -->
      <div class="builder-step" data-step="3">
        <h2 style="font-size:1.5rem;font-weight:900;color:#fff;margin-bottom:2rem">Review Your Build</h2>
        <div style="display:flex;flex-direction:column;gap:1.5rem;max-width:36rem">
          <div id="review-package" style="background:#1c1917;border:1px solid #44403c;border-radius:1rem;padding:1.5rem"></div>
          <div id="review-agents" style="background:#1c1917;border:1px solid #44403c;border-radius:1rem;padding:1.5rem"></div>
          <div id="review-info" style="background:#1c1917;border:1px solid #44403c;border-radius:1rem;padding:1.5rem"></div>
          <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:1rem;padding:1.5rem;display:flex;justify-content:space-between;align-items:center">
            <div><div style="color:#10b981;font-weight:900;font-size:1.125rem">Total Investment</div><div style="color:#78716c;font-size:0.8125rem">One-time payment · 30-day money-back guarantee</div></div>
            <div id="review-total" style="font-size:2rem;font-weight:900;color:#fff"></div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:2rem;padding-top:2rem;border-top:1px solid #44403c">
          <button onclick="prevStep(2)" style="background:none;border:none;color:#a8a29e;font-weight:700;cursor:pointer;font-size:0.875rem">← Back</button>
          <button onclick="doCheckout()" style="background:#10b981;color:#000;padding:0.75rem 2rem;border-radius:0.75rem;font-weight:900;font-size:1.125rem;border:none;cursor:pointer">Proceed to Payment →</button>
        </div>
      </div>

    </div>
  </div>
</section>

<script>
const pkgs = ${pkgsJSON};
const agents = ${agentsJSON};
let selectedPkg = pkgs[1]; // Growth default
let selectedAgents = [];
let currentStep = 0;

// Package click handlers
document.querySelectorAll('.builder-pkg-card').forEach(card => {
  card.addEventListener('click', function() {
    document.querySelectorAll('.builder-pkg-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.pkg-radio').forEach(r => r.innerHTML = '');
    this.classList.add('selected');
    this.querySelector('.pkg-radio').innerHTML = '<div style="width:0.5rem;height:0.5rem;border-radius:50%;background:#10b981"></div>';
    const pkgId = this.dataset.pkg;
    selectedPkg = pkgs.find(p => p.id === pkgId) || pkgs[0];
    selectedAgents = selectedAgents.slice(0, selectedPkg.limit);
    updateAgentUI();
    updateReview();
  });
});

function toggleAgent(el, id) {
  const limit = selectedPkg.limit;
  if (selectedAgents.includes(id)) {
    selectedAgents = selectedAgents.filter(a => a !== id);
    el.classList.remove('selected');
    el.querySelector('.agent-check').style.display = 'none';
  } else if (selectedAgents.length < limit) {
    selectedAgents.push(id);
    el.classList.add('selected');
    el.querySelector('.agent-check').style.display = 'block';
  }
  updateAgentUI();
  updateReview();
}

function updateAgentUI() {
  const limit = selectedPkg.limit;
  document.getElementById('agent-limit-display').textContent = limit;
  document.getElementById('pkg-name-display').textContent = selectedPkg.name;
  document.getElementById('agent-count').textContent = selectedAgents.length + '/' + limit;
  document.getElementById('agent-bar').style.width = (selectedAgents.length / limit * 100) + '%';
  // Update disabled state
  document.querySelectorAll('.builder-agent-card').forEach(el => {
    const agentId = el.dataset.agent;
    if (!selectedAgents.includes(agentId) && selectedAgents.length >= limit) {
      el.classList.add('disabled');
    } else {
      el.classList.remove('disabled');
    }
  });
}

function updateReview() {
  const agentNames = selectedAgents.map(id => {
    const a = agents.find(ag => ag.id === id);
    return a ? a.icon + ' ' + a.name : id;
  });
  document.getElementById('review-package').innerHTML = '<div style="font-size:0.625rem;font-family:monospace;font-weight:800;color:#78716c;text-transform:uppercase;margin-bottom:0.5rem">Package</div><div style="display:flex;justify-content:space-between"><div><span style="font-size:1.125rem;font-weight:900;color:#fff">' + selectedPkg.name + '</span><span style="color:#78716c;font-size:0.8125rem;display:block">' + selectedPkg.features[0] + ' · ' + selectedPkg.features[1] + '</span></div><span style="font-size:1.5rem;font-weight:900;color:#10b981">' + selectedPkg.price + '</span></div>';
  document.getElementById('review-agents').innerHTML = '<div style="font-size:0.625rem;font-family:monospace;font-weight:800;color:#78716c;text-transform:uppercase;margin-bottom:0.75rem">AI Employees (' + selectedAgents.length + ')</div><div style="display:flex;flex-wrap:wrap;gap:0.5rem">' + agentNames.map(n => '<span style="background:#44403c;color:#d6d3d1;padding:0.375rem 0.75rem;border-radius:0.5rem;font-size:0.875rem;font-weight:700">' + n + '</span>').join('') + (selectedAgents.length === 0 ? '<span style="color:#78716c;font-size:0.875rem">No agents selected</span>' : '') + '</div>';
  document.getElementById('review-total').textContent = selectedPkg.price;
}

function showStep(n) {
  document.querySelectorAll('.builder-step').forEach(s => s.classList.remove('active'));
  document.querySelector('.builder-step[data-step="'+n+'"]').classList.add('active');
  // Update progress bar
  document.querySelectorAll('.builder-progress-step').forEach((el, i) => {
    const dot = el.querySelector('.builder-progress-dot');
    if (i < n) { el.style.color = '#10b981'; dot.style.background = '#10b981'; dot.style.color = '#fff'; dot.textContent = '✓'; }
    else if (i === n) { el.style.color = '#10b981'; dot.style.background = '#10b981'; dot.style.color = '#fff'; dot.textContent = (i+1); }
    else { el.style.color = '#57534e'; dot.style.background = '#292524'; dot.style.color = '#57534e'; dot.textContent = (i+1); }
  });
  if (n === 3) updateReview();
  currentStep = n;
}

function nextStep(n) {
  if (n === 3) {
    // Validate info step
    const company = document.getElementById('field-company').value.trim();
    const name = document.getElementById('field-name').value.trim();
    const email = document.getElementById('field-email').value.trim();
    const phone = document.getElementById('field-phone').value.trim();
    if (!company || !name || !email || !phone) { alert('Please fill in all fields.'); return; }
    if (!email.includes('@')) { alert('Please enter a valid email.'); return; }
    // Update review with info
    document.getElementById('review-info').innerHTML = '<div style="font-size:0.625rem;font-family:monospace;font-weight:800;color:#78716c;text-transform:uppercase;margin-bottom:0.75rem">Deployment Info</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;font-size:0.875rem"><div><span style="color:#78716c">Company:</span> <span style="color:#fff;font-weight:700">'+company+'</span></div><div><span style="color:#78716c">Contact:</span> <span style="color:#fff;font-weight:700">'+name+'</span></div><div><span style="color:#78716c">Email:</span> <span style="color:#fff;font-weight:700">'+email+'</span></div><div><span style="color:#78716c">Phone:</span> <span style="color:#fff;font-weight:700">'+phone+'</span></div></div>';
  }
  showStep(n);
  window.scrollTo({top:0,behavior:'smooth'});
}

function prevStep(n) { showStep(n); window.scrollTo({top:0,behavior:'smooth'}); }

function doCheckout() {
  const config = {
    package: selectedPkg.id,
    agents: selectedAgents,
    company: document.getElementById('field-company').value.trim(),
    name: document.getElementById('field-name').value.trim(),
    email: document.getElementById('field-email').value.trim(),
    phone: document.getElementById('field-phone').value.trim(),
    timestamp: Date.now()
  };
  try { localStorage.setItem('sl100_build_config', JSON.stringify(config)); } catch(e) {}
  window.location.href = selectedPkg.link;
}

// Initialize
updateAgentUI();
</script>`;
}


// ─── Tools Hub ───
function renderToolsHub(): string {
  var tools = [
    {title:"Can We Automate This?",icon:"🔍",desc:"Describe any workflow and we'll match it to our automation library.",link:"/tools/can-we-automate-this",tag:"POPULAR"},
    {title:"AI Operations Advisor",icon:"🤖",desc:"Get personalized AI agent recommendations.",link:"/tools/ai-advisor",tag:"NEW"},
    {title:"AI Automation Assessment",icon:"📋",desc:"Complete assessment. Receive ROI estimates.",link:"/tools/assessment",tag:""},
    {title:"ROI Calculator",icon:"📊",desc:"Quantify labor waste and calculate returns.",link:"/roi-calculator",tag:"FREE"},
  ];
  var html = '<section class="section" style="text-align:center"><div class="container" style="max-width:48rem"><h1 style="font-size:3rem;font-weight:900;color:#fff;margin-bottom:1rem">AI <span style="color:#10b981">Productivity</span> Tools</h1><p style="font-size:1.125rem;color:#a8a29e">Free tools — no signup required.</p></div></section><section class="section" style="padding-top:1rem"><div class="container" style="max-width:48rem">';
  for (var i = 0; i < tools.length; i++) {
    var t = tools[i];
    html += '<div style="background:#292524;border:1px solid #44403c;border-radius:1.5rem;padding:2rem;margin-bottom:1.5rem;display:flex;gap:2rem"><span style="font-size:2.5rem">'+t.icon+'</span><div style="flex:1"><div style="display:flex;gap:0.5rem;margin-bottom:0.5rem">'+(t.tag?'<span style="padding:0.125rem 0.5rem;background:rgba(16,185,129,0.15);color:#10b981;font-size:0.625rem;font-family:monospace;font-weight:800;border-radius:0.25rem">'+t.tag+'</span>':'')+'<span style="padding:0.125rem 0.5rem;background:#292524;color:#78716c;font-size:0.625rem;font-family:monospace;border-radius:0.25rem">FREE</span></div><h2 style="font-size:1.25rem;font-weight:900;color:#fff;margin-bottom:0.5rem">'+t.title+'</h2><p style="color:#a8a29e;font-size:0.875rem;margin-bottom:1rem">'+t.desc+'</p><a href="'+t.link+'" style="display:inline-block;background:#10b981;color:#000;padding:0.75rem 1.5rem;border-radius:0.75rem;font-weight:800;text-decoration:none">Open Tool</a></div></div>';
  }
  return html + '</div></section>';
}

// ─── Tools: AI Advisor ───
function renderToolsAdvisor(): string {
  var indOpts = allIndustries.map(function(i){return '<option value="'+i.id+'">'+i.name+'</option>'}).join("");
  return '<section class="section" style="text-align:center"><div class="container" style="max-width:48rem"><h1 style="font-size:3rem;font-weight:900;color:#fff;margin-bottom:1rem">🤖 AI Operations Advisor</h1><p style="font-size:1.125rem;color:#a8a29e">Get instant, personalized AI agent recommendations.</p></div></section><section class="section" style="padding-top:1rem"><div class="container" style="max-width:40rem"><div style="background:#292524;border:1px solid #44403c;border-radius:2rem;padding:2.5rem"><form id="advisor-form" onsubmit="handleAdvisor(event)" style="display:flex;flex-direction:column;gap:1.5rem"><div><label style="display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.5rem">Industry</label><select id="advisor-industry" class="builder-input">'+indOpts+'</select></div><div><label style="display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.5rem">Team size</label><select id="advisor-team" class="builder-input"><option>1-10</option><option>11-50</option><option>51-200</option><option>201-500</option><option>500+</option></select></div><div><label style="display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.5rem">Bottleneck</label><select id="advisor-bottleneck" class="builder-input"><option>Document processing</option><option>Customer support</option><option>Invoice reconciliation</option><option>Compliance</option><option>Scheduling</option></select></div><button type="submit" style="width:100%;background:#10b981;color:#000;padding:0.875rem;border-radius:0.75rem;font-weight:800;border:none;cursor:pointer">Get Recommendations</button></form><div id="advisor-result" style="margin-top:1.5rem;display:none"></div></div></div></section><script>function handleAdvisor(e){e.preventDefault();var r=document.getElementById("advisor-result");r.style.display="block";r.innerHTML="<div style=\"background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:1rem;padding:2rem;text-align:center\"><h3 style=\"font-size:1.25rem;font-weight:900;color:#fff;margin-bottom:0.5rem\">Your AI Team Recommendation</h3><p style=\"color:#a8a29e;margin-bottom:1rem\">We recommend <strong style=\"color:#10b981\">Invoice & Ledger AI</strong> and <strong style=\"color:#10b981\">Document AI System</strong>. Estimated savings: 15-25 hrs/week.</p><a href=\"/build\" style=\"display:inline-block;background:#10b981;color:#000;padding:0.75rem 1.5rem;border-radius:0.75rem;font-weight:800;text-decoration:none\">Build Your Team</a></div>"}</script>';
}

// ─── Tools: Can We Automate This? ───
function renderToolsAutomate(): string {
  var pills = ["AP/Invoice Parsing","Logistics Dispatching","Patient Registration","CRM Data Entry","HR Onboarding"];
  var phtml = pills.map(function(e){return '<button type="button" onclick="var d=document.getElementById(\'automate-input\');d.value=\''+e+'\';handleAutomate(new Event(\'submit\'))" style="font-size:0.625rem;background:#1c1917;color:#a8a29e;font-weight:700;padding:0.25rem 0.75rem;border-radius:9999px;border:1px solid #44403c;cursor:pointer">'+e+'</button>'}).join("");
  return "<section class=\"section\" style=\"text-align:center\"><div class=\"container\" style=\"max-width:48rem\"><h1 style=\"font-size:3rem;font-weight:900;color:#fff;margin-bottom:1rem\">🔍 Can We Automate This?</h1><p style=\"font-size:1.125rem;color:#a8a29e\">Describe any repetitive workflow and we will tell you if our AI can handle it.</p></div></section><section class=\"section\" style=\"padding-top:1rem\"><div class=\"container\" style=\"max-width:40rem\"><div style=\"background:#292524;border:1px solid #44403c;border-radius:2rem;padding:2.5rem\"><form onsubmit=\"handleAutomate(event)\" style=\"display:flex;flex-direction:column;gap:1rem\"><label style=\"font-size:0.875rem;font-weight:700;color:#d6d3d1\">Describe your process:</label><textarea id=\"automate-input\" class=\"builder-input\" rows=\"4\" placeholder=\"E.g. Every morning we copy invoice data from PDFs into QuickBooks...\" style=\"resize:none\"></textarea><div style=\"display:flex;flex-wrap:wrap;gap:0.5rem\">"+phtml+"</div><button type=\"submit\" style=\"width:100%;background:#10b981;color:#000;padding:0.875rem;border-radius:0.75rem;font-weight:800;border:none;cursor:pointer\">Analyze My Workflow</button></form><div id=\"automate-result\" style=\"margin-top:1.5rem;display:none\"></div></div></div></section><script>function handleAutomate(e){e.preventDefault();var t=document.getElementById('automate-input').value.trim();if(!t)return;var r=document.getElementById('automate-result');r.style.display='block';var m=t.toLowerCase();var rec='Document AI System',hrs='8-12',icon='📄';if(m.indexOf('invoice')>=0||m.indexOf('billing')>=0){rec='Invoice & Ledger AI';hrs='15-20';icon='💸'}else if(m.indexOf('dispatch')>=0||m.indexOf('logistics')>=0){rec='Dispatch Logistics AI';hrs='20-25';icon='🚚'}else if(m.indexOf('patient')>=0||m.indexOf('medical')>=0){rec='Healthcare Intake AI';hrs='18-24';icon='🏥'}else if(m.indexOf('crm')>=0||m.indexOf('sales')>=0){rec='Sales Outreach AI';hrs='10-15';icon='🚀'}r.innerHTML='<div style=\"background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:1rem;padding:2rem\"><div style=\"display:flex;gap:1rem;margin-bottom:1.5rem\"><span style=\"font-size:2.5rem\">'+icon+'</span><div><h3 style=\"font-size:1.25rem;font-weight:900;color:#fff\">'+rec+'</h3><p style=\"color:#10b981;font-weight:700\">Save ~'+hrs+' hrs/week</p></div></div><a href=\"/build\" style=\"display:inline-block;background:#10b981;color:#000;padding:0.75rem 1.5rem;border-radius:0.75rem;font-weight:800;text-decoration:none\">Deploy This Agent</a></div>'}</script>";
}

// ─── Tools: Assessment ───
function renderToolsAssessment(): string {
  return '<section class="section" style="text-align:center"><div class="container" style="max-width:48rem"><h1 style="font-size:3rem;font-weight:900;color:#fff;margin-bottom:1rem">📋 AI Automation Assessment</h1><p style="font-size:1.125rem;color:#a8a29e">Complete a quick assessment and get a personalized report.</p></div></section><section class="section" style="padding-top:1rem"><div class="container" style="max-width:40rem"><div style="background:#292524;border:1px solid #44403c;border-radius:2rem;padding:2.5rem"><form id="assessment-form" onsubmit="handleAssessment(event)" style="display:flex;flex-direction:column;gap:1.5rem"><div><label style="display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.5rem">1. Hours/week on manual data entry?</label><select class="builder-input"><option>< 5 hours</option><option>5-15 hours</option><option>15-30 hours</option><option>30+ hours</option></select></div><div><label style="display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.5rem">2. Software tools used daily?</label><select class="builder-input"><option>1-2</option><option>3-5</option><option>6-10</option><option>10+</option></select></div><div><label style="display:block;font-size:0.875rem;font-weight:700;color:#d6d3d1;margin-bottom:0.5rem">3. Biggest pain point?</label><select class="builder-input"><option>Document processing</option><option>Cross-system data sync</option><option>Customer communication</option><option>Compliance & reporting</option></select></div><button type="submit" style="width:100%;background:#10b981;color:#000;padding:0.875rem;border-radius:0.75rem;font-weight:800;border:none;cursor:pointer">Generate Report</button></form><div id="assessment-result" style="margin-top:1.5rem;display:none"></div></div></div></section><script>function handleAssessment(e){e.preventDefault();var r=document.getElementById("assessment-result");r.style.display="block";r.innerHTML="<div style=\"background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:1rem;padding:2rem;text-align:center\"><h3 style=\"font-size:1.5rem;font-weight:900;color:#fff;margin-bottom:0.5rem\">Automation Readiness: <span style=\"color:#10b981\">High</span></h3><p style=\"color:#a8a29e;margin-bottom:1rem\">We estimate <strong style=\"color:#10b981\">20-35 hrs/week</strong> could be reclaimed.</p><a href=\"/build\" style=\"display:inline-block;background:#10b981;color:#000;padding:0.75rem 1.5rem;border-radius:0.75rem;font-weight:800;text-decoration:none\">Build Your Team</a></div>"}</script>';
}

// ─── ROI Calculator ───
function renderROICalculator(): string {
  const rjs = "function updateROI(){const t=parseInt(document.getElementById('roi-teamsize').value);const h=parseInt(document.getElementById('roi-hours').value);const r=parseInt(document.getElementById('roi-rate').value);document.getElementById('roi-teamsize-val').textContent=t+' Employees';document.getElementById('roi-hours-val').textContent=h+' Hours';document.getElementById('roi-rate-val').textContent=String.fromCharCode(36)+r+'/hr';const m=Math.round(t*h*4*r*0.85);const a=m*12;document.getElementById('roi-output').innerHTML='<div style=\"background:#1c1917;border-radius:1.25rem;padding:1.5rem;border:1px solid #44403c\"><div style=\"display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem\"><div><span style=\"font-size:0.5625rem;font-family:monospace;font-weight:800;color:#78716c;text-transform:uppercase\">Monthly Reclaimed</span><div style=\"font-size:2rem;font-weight:900;color:#fff\">'+String.fromCharCode(36)+m.toLocaleString()+'<span style=\"font-size:1rem;color:#a8a29e\">/mo</span></div></div><div><span style=\"font-size:0.5625rem;font-family:monospace;font-weight:800;color:#78716c;text-transform:uppercase\">Annualized Gain</span><div style=\"font-size:2rem;font-weight:900;color:#10b981\">'+String.fromCharCode(36)+a.toLocaleString()+'<span style=\"font-size:1rem;color:#a8a29e\">/yr</span></div></div></div><div style=\"background:#292524;padding:0.75rem;border-radius:0.5rem;text-align:center\"><span style=\"font-size:0.75rem;font-family:monospace;color:#a8a29e\">Hours Reclaimed: </span><span style=\"font-weight:900;color:#fff\">'+(t*h*4*0.85).toFixed(0)+' hrs/mo</span></div></div><div style=\"text-align:center;margin-top:1rem\"><a href=\"/build\" style=\"display:inline-block;background:#10b981;color:#000;padding:0.875rem 2rem;border-radius:0.75rem;font-weight:800;font-size:1rem;text-decoration:none\">Build Your AI Team →</a></div>'}updateROI()";
  return '<section class="section" style="text-align:center"><div class="container" style="max-width:48rem"><span style="display:inline-block;padding:0.25rem 0.75rem;font-size:0.625rem;font-weight:800;letter-spacing:0.1em;border-radius:9999px;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);text-transform:uppercase;margin-bottom:1rem">Interactive ROI Projections</span><h1 style="font-size:3rem;font-weight:900;color:#fff;margin-bottom:1rem">AI Operations ROI Calculator</h1><p style="font-size:1.125rem;color:#a8a29e">Quantify your labor waste and calculate the precise break-even returns of deploying AI operations.</p></div></section><section class="section" style="padding-top:1rem"><div class="container" style="max-width:40rem"><div style="background:#292524;border:1px solid #44403c;border-radius:2rem;padding:2.5rem"><div style="display:flex;flex-direction:column;gap:1.5rem"><div><div style="display:flex;justify-content:space-between;margin-bottom:0.25rem"><span style="color:#a8a29e;font-size:0.75rem;font-family:monospace;font-weight:700;text-transform:uppercase">Team Size</span><span style="color:#34d399;font-weight:900;font-size:0.75rem;font-family:monospace" id="roi-teamsize-val">10</span></div><input type="range" min="1" max="100" value="10" style="width:100%;accent-color:#10b981" id="roi-teamsize" oninput="updateROI()"></div><div><div style="display:flex;justify-content:space-between;margin-bottom:0.25rem"><span style="color:#a8a29e;font-size:0.75rem;font-family:monospace;font-weight:700;text-transform:uppercase">Hours Wasted/Week</span><span style="color:#34d399;font-weight:900;font-size:0.75rem;font-family:monospace" id="roi-hours-val">8</span></div><input type="range" min="1" max="40" value="8" style="width:100%;accent-color:#10b981" id="roi-hours" oninput="updateROI()"></div><div><div style="display:flex;justify-content:space-between;margin-bottom:0.25rem"><span style="color:#a8a29e;font-size:0.75rem;font-family:monospace;font-weight:700;text-transform:uppercase">Hourly Cost</span><span style="color:#34d399;font-weight:900;font-size:0.75rem;font-family:monospace" id="roi-rate-val">$35</span></div><input type="range" min="15" max="150" value="35" style="width:100%;accent-color:#10b981" id="roi-rate" oninput="updateROI()"></div></div><div id="roi-output" style="margin-top:2rem"></div></div></div></section><script>'+rjs+'</script>';
}

// ─── Industry Pages ───
const SLUG_TO_KEY: Record<string, string> = {
  "e-commerce": "ecommerce",
  "financial-services": "financialServices",
  "professional-services": "professionalServices",
  "real-estate": "realEstate",
};

function renderIndustry(slug: string): string {
  const key = SLUG_TO_KEY[slug] || slug;
  const d = (industryContent as Record<string, any>)[key];

  if (!d) {
    const ind = allIndustries.find(function(i){return i.id===slug}) || { name: slug.charAt(0).toUpperCase()+slug.slice(1).replace(/-/g,' '), icon: '🏢', id: slug };
    var ints = ["Salesforce","HubSpot","QuickBooks","SAP","Oracle NetSuite","Microsoft 365","Google Workspace","Slack","Teams"];
    var wfs = ["Invoice Automation","Document Processing","Data Entry Automation","Compliance Reporting","Supplier Communication","Purchase Orders","Inventory Reconciliation"];
    return '<section class="section" style="text-align:center"><div class="container" style="max-width:48rem"><span style="display:inline-block;padding:0.25rem 0.75rem;font-size:0.625rem;font-weight:800;letter-spacing:0.1em;border-radius:9999px;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);text-transform:uppercase;margin-bottom:1rem">INDUSTRY SOLUTIONS</span><h1 style="font-size:3rem;font-weight:900;color:#fff;margin-bottom:1rem">'+ind.icon+' AI for '+ind.name+'</h1><p style="font-size:1.125rem;color:#a8a29e;line-height:1.7">Pre-built AI operations teams for '+ind.name.toLowerCase()+' companies. Deploy in days, not months.</p></div></section><section class="section" style="padding-top:2rem"><div class="container" style="max-width:64rem"><div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-bottom:3rem"><div style="background:#292524;border:1px solid #44403c;border-radius:2rem;padding:2.5rem"><h3 style="font-size:1.25rem;font-weight:900;color:#fff;margin-bottom:1.5rem">🔌 Recommended Integrations</h3><div style="display:flex;flex-wrap:wrap;gap:0.5rem">'+ints.map(function(i){return '<span style="background:#1c1917;color:#a8a29e;font-weight:700;font-size:0.75rem;padding:0.5rem 0.75rem;border-radius:0.5rem;border:1px solid #44403c">'+i+'</span>'}).join("")+'</div></div><div style="background:#292524;border:1px solid #44403c;border-radius:2rem;padding:2.5rem"><h3 style="font-size:1.25rem;font-weight:900;color:#fff;margin-bottom:1.5rem">⚡ Automated Workflows</h3><div style="display:flex;flex-wrap:wrap;gap:0.5rem">'+wfs.map(function(w){return '<span style="background:rgba(16,185,129,0.08);color:#10b981;font-weight:700;font-size:0.75rem;padding:0.5rem 0.75rem;border-radius:0.5rem;border:1px solid rgba(16,185,129,0.2)">✓ '+w+'</span>'}).join("")+'</div></div></div><div style="background:#292524;border:1px solid #44403c;border-radius:2rem;padding:3rem;text-align:center"><h2 style="font-size:2rem;font-weight:900;color:#fff;margin-bottom:1rem">Ready to automate '+ind.name.toLowerCase()+' operations?</h2><p style="color:#a8a29e;font-size:1.125rem;margin-bottom:2rem">Select your AI team and deploy in under 21 days with pre-built '+ind.name.toLowerCase()+' integrations.</p><div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap"><a href="/build" style="display:inline-block;background:#10b981;color:#000;padding:1rem 2rem;border-radius:1rem;font-weight:800;font-size:1.125rem;text-decoration:none">Build Your AI Team →</a><a href="/tools/assessment" style="display:inline-block;background:#44403c;color:#e7e5e4;padding:1rem 2rem;border-radius:1rem;font-weight:800;font-size:1.125rem;text-decoration:none">Free Assessment →</a></div></div></div></section>';
  }

  var html = '';

  html += '<section class="section" style="text-align:center"><div class="container" style="max-width:56rem"><span style="display:inline-block;padding:0.25rem 0.75rem;font-size:0.625rem;font-weight:800;letter-spacing:0.1em;border-radius:9999px;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);text-transform:uppercase;margin-bottom:1rem">INDUSTRY SOLUTIONS</span><h1 style="font-size:3rem;font-weight:900;color:#fff;margin-bottom:1rem">'+e(d.hero.emoji)+' AI for '+slug.charAt(0).toUpperCase()+slug.slice(1).replace(/-/g," ")+'</h1><h2 style="font-size:1.5rem;font-weight:800;color:#e7e5e4;margin-bottom:0.75rem">'+e(d.hero.headline)+'</h2><p style="font-size:1.125rem;color:#a8a29e;line-height:1.7;max-width:42rem;margin:0 auto">'+e(d.hero.subHeadline)+'</p></div></section>';

  html += '<section class="section" style="padding-top:2rem"><div class="container" style="max-width:56rem"><div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem"><div style="background:#292524;border:1px solid #44403c;border-radius:1.5rem;padding:2rem"><span style="font-size:2rem">⏱️</span><h3 style="font-size:0.75rem;font-weight:800;color:#78716c;text-transform:uppercase;letter-spacing:0.05em;margin:0.75rem 0 0.25rem">Time Savings</h3><p style="font-size:1rem;font-weight:700;color:#fff;margin-bottom:0.5rem">'+e(d.timeSavings.monthlyHours)+'</p><p style="font-size:0.75rem;color:#a8a29e;line-height:1.5">'+e(d.timeSavings.context)+'</p></div><div style="background:#292524;border:1px solid #44403c;border-radius:1.5rem;padding:2rem"><span style="font-size:2rem">💰</span><h3 style="font-size:0.75rem;font-weight:800;color:#78716c;text-transform:uppercase;letter-spacing:0.05em;margin:0.75rem 0 0.25rem">Dollar Savings</h3><p style="font-size:1rem;font-weight:700;color:#10b981;margin-bottom:0.5rem">'+e(d.dollarSavings.annual)+'</p><p style="font-size:0.75rem;color:#a8a29e;line-height:1.5">'+e(d.dollarSavings.context)+'</p></div></div></div></section>';

  html += '<section class="section"><div class="container" style="max-width:64rem"><h3 style="font-size:1.5rem;font-weight:900;color:#fff;margin-bottom:1.5rem;text-align:center">🧩 Operational Pain Points We Solve</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">';
  for (var i = 0; i < d.painPoints.length; i++) {
    var p = d.painPoints[i];
    html += '<div style="background:#292524;border:1px solid #44403c;border-radius:1.25rem;padding:1.5rem"><h4 style="font-size:0.875rem;font-weight:800;color:#fbbf24;margin-bottom:0.5rem">'+e(p.title)+'</h4><p style="font-size:0.8125rem;color:#a8a29e;line-height:1.6">'+e(p.description)+'</p></div>';
  }
  html += '</div></div></section>';

  html += '<section class="section"><div class="container" style="max-width:64rem"><h3 style="font-size:1.5rem;font-weight:900;color:#fff;margin-bottom:1.5rem;text-align:center">🤖 Recommended AI Operations Team</h3><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem">';
  for (var i = 0; i < d.recommendedAgents.length; i++) {
    var a = d.recommendedAgents[i];
    html += '<div style="background:#292524;border:1px solid #44403c;border-radius:1.25rem;padding:1.5rem"><span style="display:inline-block;padding:0.125rem 0.5rem;font-size:0.5625rem;font-weight:800;border-radius:0.25rem;background:rgba(16,185,129,0.12);color:#34d399;text-transform:uppercase;margin-bottom:0.5rem">'+e(a.agentType.replace(/_/g," "))+'</span><h4 style="font-size:1rem;font-weight:800;color:#fff;margin-bottom:0.5rem">'+e(a.name)+'</h4><p style="font-size:0.75rem;color:#a8a29e;line-height:1.5">'+e(a.description)+'</p></div>';
  }
  html += '</div></div></section>';

  html += '<section class="section"><div class="container" style="max-width:64rem"><h3 style="font-size:1.5rem;font-weight:900;color:#fff;margin-bottom:1.5rem;text-align:center">🔌 Key Integrations</h3><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem">';
  for (var i = 0; i < d.keyIntegrations.length; i++) {
    var ki = d.keyIntegrations[i];
    html += '<div style="background:#292524;border:1px solid #44403c;border-radius:1rem;padding:1.25rem"><h4 style="font-size:0.9375rem;font-weight:800;color:#fff;margin-bottom:0.375rem">'+e(ki.name)+'</h4><p style="font-size:0.75rem;color:#a8a29e;line-height:1.5">'+e(ki.description)+'</p></div>';
  }
  html += '</div></div></section>';

  html += '<section class="section"><div class="container" style="max-width:64rem"><h3 style="font-size:1.5rem;font-weight:900;color:#fff;margin-bottom:1.5rem;text-align:center">⚡ Workflow Automation Examples</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">';
  for (var i = 0; i < d.workflowExamples.length; i++) {
    var w = d.workflowExamples[i];
    html += '<div style="background:#292524;border:1px solid #44403c;border-radius:1.25rem;padding:1.5rem"><div style="display:flex;gap:0.75rem;align-items:flex-start"><span style="display:flex;align-items:center;justify-content:center;width:2rem;min-width:2rem;height:2rem;border-radius:0.5rem;background:rgba(16,185,129,0.12);color:#34d399;font-size:0.75rem;font-weight:900;font-family:monospace">'+(i+1)+'</span><div><h4 style="font-size:0.9375rem;font-weight:800;color:#fff;margin-bottom:0.375rem">'+e(w.name)+'</h4><p style="font-size:0.8125rem;color:#a8a29e;line-height:1.6">'+e(w.description)+'</p></div></div></div>';
  }
  html += '</div></div></section>';

  html += '<section class="section"><div class="container" style="max-width:56rem"><div style="background:#292524;border:1px solid #44403c;border-radius:2rem;padding:2.5rem"><h3 style="font-size:1.25rem;font-weight:900;color:#fff;margin-bottom:1.5rem;text-align:center">📊 Verified ROI Metrics</h3><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-bottom:1.5rem"><div style="background:#1c1917;border-radius:1rem;padding:1.25rem;text-align:center"><span style="font-size:0.625rem;font-weight:800;color:#78716c;text-transform:uppercase;display:block;margin-bottom:0.375rem">Payback Period</span><span style="font-size:1.125rem;font-weight:900;color:#10b981">'+d.roi.paybackMonths+' months</span></div><div style="background:#1c1917;border-radius:1rem;padding:1.25rem;text-align:center"><span style="font-size:0.625rem;font-weight:800;color:#78716c;text-transform:uppercase;display:block;margin-bottom:0.375rem">Accuracy</span><span style="font-size:1.125rem;font-weight:900;color:#10b981">'+e(d.roi.accuracyImprovement)+'</span></div>';
  for (var i = 0; i < d.roi.additionalMetrics.length; i++) {
    var m = d.roi.additionalMetrics[i];
    html += '<div style="background:#1c1917;border-radius:1rem;padding:1.25rem;text-align:center"><span style="font-size:0.625rem;font-weight:800;color:#78716c;text-transform:uppercase;display:block;margin-bottom:0.375rem">'+e(m.label)+'</span><span style="font-size:1.125rem;font-weight:900;color:#10b981">'+e(m.value)+'</span></div>';
  }
  html += '</div></div></div></section>';

  var indName = slug.charAt(0).toUpperCase()+slug.slice(1).replace(/-/g," ");
  html += '<section class="section" style="padding-bottom:4rem"><div class="container" style="max-width:48rem"><div style="background:#292524;border:1px solid #44403c;border-radius:2rem;padding:3rem;text-align:center"><h2 style="font-size:2rem;font-weight:900;color:#fff;margin-bottom:1rem">'+e(d.cta.headline)+'</h2><p style="color:#a8a29e;font-size:1.125rem;margin-bottom:2rem">Select your AI team and deploy in under 21 days with pre-built '+indName.toLowerCase()+' integrations.</p><div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap"><a href="'+e(d.cta.buildLink)+'" style="display:inline-block;background:#10b981;color:#000;padding:1rem 2rem;border-radius:1rem;font-weight:800;font-size:1.125rem;text-decoration:none">Build Your AI Team →</a><a href="'+e(d.cta.assessmentLink)+'" style="display:inline-block;background:#44403c;color:#e7e5e4;padding:1rem 2rem;border-radius:1rem;font-weight:800;font-size:1.125rem;text-decoration:none">Free Assessment →</a></div></div></div></section>';

  return html;
}

function e(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function renderFooter() {
  return `<footer class="footer">
    <div class="container footer-inner">
      <div>
        <div class="footer-logo">${businessName}</div>
        <p class="footer-tagline">AI coworkers for operations teams. Work less, live more.</p>
      </div>
      <div class="footer-links">
        <a href="/build">Builder</a>
        <a href="/support">Support</a>
        <a href="/how-it-works">How It Works</a>
        <a href="/faq">FAQ</a>
        <a href="/about">About</a>
        <a href="/demos/audit-portal">Audit Workflow Demo</a>
      </div>
      <div class="footer-copy">&copy; ${year} ${businessName}. All rights reserved.</div>
    </div>
  </footer>`;
}

console.log(`[standalone-server] Starting on ${HOST}:${PORT}...`);
serve({ fetch: req => servePage(req.url), hostname: HOST, port: PORT });
console.log(`[standalone-server] Serving at http://${HOST}:${PORT}`);
