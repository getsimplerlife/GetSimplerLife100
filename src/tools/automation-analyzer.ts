/**
 * Automation Opportunity Analyzer
 *
 * Client-side pattern matching engine that analyzes workflow descriptions
 * and matches them to existing automation workflows in the content data.
 * All logic is embedded — no backend calls needed.
 */

import { workflows, type Workflow } from "../content/workflows";

// ── Types ────────────────────────────────────────────────────────────────

export interface AnalysisResult {
  match: Workflow;
  score: number;
  estimatedHoursSaved: number;
  estimatedWeeklyHours: number;
  confidence: "high" | "medium" | "low";
  suggestedAgentName: string;
  suggestedAgentEmoji: string;
  keywords: string[];
}

export interface AnalysisSummary {
  topMatch: AnalysisResult;
  allMatches: AnalysisResult[];
  industryGuess: string;
  savingsSummary: string;
}

// ── Keyword to Workflow Matching ─────────────────────────────────────────

interface KeywordPattern {
  words: string[];
  workflowMatch: string; // workflow id
  weight: number;
}

const keywordPatterns: KeywordPattern[] = [
  // Invoice / AP
  { words: ["invoice", "bill", "vendor payment", "accounts payable", "pay supplier", "purchase order", "po"], workflowMatch: "invoice-automation", weight: 3 },
  { words: ["reconcile", "reconciliation", "bank statement", "match payment", "unmatched"], workflowMatch: "payment-reconciliation", weight: 3 },
  { words: ["purchase order", "po", "requisition", "procurement", "buy", "ordering"], workflowMatch: "purchase-order-management", weight: 3 },

  // Inventory
  { words: ["inventory", "stock", "warehouse", "sku", "reorder", "supply"], workflowMatch: "inventory-reconciliation", weight: 3 },
  { words: ["vendor", "supplier", "quote", "rfq", "procurement"], workflowMatch: "supplier-communication", weight: 2 },

  // Production / Manufacturing
  { words: ["production", "manufacturing", "batch", "work order", "shop floor"], workflowMatch: "production-reporting", weight: 3 },
  { words: ["quality", "inspection", "defect", "qa", "compliance check"], workflowMatch: "quality-assurance", weight: 3 },
  { words: ["erp", "update erp", "enterprise resource"], workflowMatch: "erp-updates", weight: 2 },

  // Logistics / Dispatch
  { words: ["dispatch", "schedule", "driver", "fleet", "truck", "shipment"], workflowMatch: "dispatch-scheduling", weight: 3 },
  { words: ["route", "delivery", "optimize route", "last mile"], workflowMatch: "route-optimization", weight: 3 },
  { words: ["carrier", "freight", "shipping", "logistics provider"], workflowMatch: "carrier-coordination", weight: 2 },
  { words: ["proof of delivery", "pod", "delivery receipt", "signature"], workflowMatch: "pod-collection", weight: 2 },
  { words: ["freight", "audit freight", "shipping cost", "carrier invoice"], workflowMatch: "freight-audit", weight: 2 },

  // Healthcare
  { words: ["patient", "intake", "registration", "new patient"], workflowMatch: "patient-intake", weight: 3 },
  { words: ["appointment", "schedule patient", "booking", "calendar booking"], workflowMatch: "appointment-scheduling", weight: 3 },
  { words: ["insurance", "verify insurance", "eligibility", "coverage"], workflowMatch: "insurance-verification", weight: 3 },
  { words: ["medical code", "coding", "icd", "cpt", "diagnosis code"], workflowMatch: "medical-coding", weight: 3 },
  { words: ["claim", "insurance claim", "reimbursement", "billing claim"], workflowMatch: "claims-processing", weight: 3 },
  { words: ["compliance", "hipaa", "regulatory", "audit report"], workflowMatch: "compliance-reporting", weight: 2 },

  // Finance / Accounting
  { words: ["accounts payable", "ap", "accounts receivable", "ar", "pay bill", "collect payment"], workflowMatch: "ap-ar-automation", weight: 3 },
  { words: ["data entry", "manual entry", "type into", "copy from", "key in"], workflowMatch: "data-entry-automation", weight: 2 },
  { words: ["document", "pdf", "scan", "extract data", "ocr", "form"], workflowMatch: "document-processing", weight: 2 },
  { words: ["contract", "agreement", "legal", "terms", "sign"], workflowMatch: "contract-review", weight: 2 },

  // HR / Onboarding
  { words: ["onboard", "new hire", "employee setup", "orientation"], workflowMatch: "onboarding", weight: 3 },
  { words: ["client intake", "new client", "customer onboarding", "prospect"], workflowMatch: "client-intake", weight: 2 },
  { words: ["payroll", "pay employees", "timesheet", "wage", "salary"], workflowMatch: "payroll-processing", weight: 3 },
  { words: ["benefits", "enrollment", "insurance benefits", "401k"], workflowMatch: "benefits-administration", weight: 2 },

  // Customer Support
  { words: ["customer support", "ticket", "help desk", "support request"], workflowMatch: "customer-support-triage", weight: 3 },
  { words: ["lead", "prospect", "inquiry", "contact form", "website lead"], workflowMatch: "lead-response", weight: 2 },
  { words: ["social media", "post", "content", "schedule post"], workflowMatch: "social-media-management", weight: 2 },

  // Email
  { words: ["email", "inbox", "sort email", "respond to email", "email template"], workflowMatch: "email-automation", weight: 2 },
  { words: ["newsletter", "campaign", "email blast", "marketing email"], workflowMatch: "email-marketing", weight: 2 },

  // General
  { words: ["report", "generate report", "dashboard", "kpi", "metric"], workflowMatch: "reporting-automation", weight: 2 },
  { words: ["approve", "approval", "manager approve", "routing"], workflowMatch: "approval-workflow", weight: 2 },
  { words: ["notify", "notification", "alert", "send message"], workflowMatch: "notification-automation", weight: 1 },
];

// ── Industry Detection ────────────────────────────────────────────────────

const industryKeywords: { words: string[]; industry: string }[] = [
  { words: ["manufactur", "factory", "plant", "production line", "assembly"], industry: "Manufacturing" },
  { words: ["logistics", "trucking", "warehouse", "freight", "shipping", "delivery"], industry: "Logistics" },
  { words: ["construction", "builder", "contractor", "job site", "blueprint"], industry: "Construction" },
  { words: ["retail", "store", "ecommerce", "shop", "merchant", "inventory"], industry: "Retail" },
  { words: ["energy", "oil", "gas", "utility", "power plant", "renewable"], industry: "Energy" },
  { words: ["healthcare", "hospital", "clinic", "patient", "doctor", "medical"], industry: "Healthcare" },
  { words: "finance banking accounting invest".split(" "), industry: "Financial Services" },
  { words: ["insurance", "policy", "claim", "underwriting"], industry: "Insurance" },
  { words: ["legal", "law", "attorney", "court", "compliance"], industry: "Legal" },
  { words: ["hospitality", "hotel", "restaurant", "food service", "travel"], industry: "Hospitality" },
  { words: ["technology", "saas", "software", "it", "tech"], industry: "Technology" },
  { words: ["education", "school", "university", "training", "student"], industry: "Education" },
  { words: ["real estate", "property", "rental", "mortgage", "apartment"], industry: "Real Estate" },
  { words: ["nonprofit", "charity", "ngo", "donation", "fundraising"], industry: "Nonprofits" },
  { words: ["government", "public sector", "municipal", "federal", "agency"], industry: "Government" },
  { words: ["accounting", "cpa", "tax", "bookkeeping", "firm"], industry: "Accounting" },
];

// ── Agent Name Mapping ────────────────────────────────────────────────────

const agentNameMap: Record<string, { name: string; emoji: string }> = {
  "invoice-automation": { name: "Invoice AI", emoji: "🧾" },
  "purchase-order-management": { name: "Procurement AI", emoji: "📋" },
  "inventory-reconciliation": { name: "Inventory AI", emoji: "📦" },
  "supplier-communication": { name: "Vendor AI", emoji: "🤝" },
  "production-reporting": { name: "Production AI", emoji: "🏭" },
  "quality-assurance": { name: "Quality AI", emoji: "✅" },
  "erp-updates": { name: "ERP Sync AI", emoji: "🔄" },
  "dispatch-scheduling": { name: "Dispatch AI", emoji: "🚛" },
  "route-optimization": { name: "Route AI", emoji: "🗺️" },
  "carrier-coordination": { name: "Carrier AI", emoji: "📡" },
  "pod-collection": { name: "Proof AI", emoji: "📸" },
  "freight-audit": { name: "Freight AI", emoji: "💰" },
  "patient-intake": { name: "Intake AI", emoji: "🏥" },
  "appointment-scheduling": { name: "Schedule AI", emoji: "📅" },
  "insurance-verification": { name: "Verify AI", emoji: "🛡️" },
  "medical-coding": { name: "Code AI", emoji: "🔢" },
  "claims-processing": { name: "Claims AI", emoji: "📄" },
  "compliance-reporting": { name: "Compliance AI", emoji: "⚖️" },
  "ap-ar-automation": { name: "Finance AI", emoji: "💵" },
  "data-entry-automation": { name: "Entry AI", emoji: "⌨️" },
  "document-processing": { name: "Doc AI", emoji: "📑" },
  "contract-review": { name: "Contract AI", emoji: "📝" },
  "onboarding": { name: "Onboard AI", emoji: "👋" },
  "client-intake": { name: "Welcome AI", emoji: "🤗" },
  "payroll-processing": { name: "Payroll AI", emoji: "💳" },
  "benefits-administration": { name: "Benefits AI", emoji: "🎯" },
  "vendor-management": { name: "Vendor AI", emoji: "🤝" },
  "customer-support-triage": { name: "Support AI", emoji: "🎧" },
  "lead-response": { name: "Lead AI", emoji: "⚡" },
  "payment-reconciliation": { name: "Reconcile AI", emoji: "🔄" },
  "reporting-automation": { name: "Report AI", emoji: "📊" },
  "approval-workflow": { name: "Approve AI", emoji: "✅" },
  "notification-automation": { name: "Notify AI", emoji: "🔔" },
  "social-media-management": { name: "Social AI", emoji: "📱" },
  "email-automation": { name: "Mail AI", emoji: "✉️" },
  "email-marketing": { name: "Campaign AI", emoji: "📣" },
};

// ── Savings Estimation ────────────────────────────────────────────────────

function estimateHoursSaved(_matchScore: number, keywordCount: number): number {
  // Base savings per workflow type
  const baseRanges: Record<string, { min: number; max: number }> = {
    "invoice-automation": { min: 15, max: 30 },
    "purchase-order-management": { min: 10, max: 25 },
    "inventory-reconciliation": { min: 10, max: 20 },
    "dispatch-scheduling": { min: 10, max: 25 },
    "patient-intake": { min: 15, max: 30 },
    "claims-processing": { min: 20, max: 40 },
    "payroll-processing": { min: 8, max: 20 },
    "onboarding": { min: 10, max: 20 },
    "customer-support-triage": { min: 15, max: 35 },
    "ap-ar-automation": { min: 10, max: 25 },
    "data-entry-automation": { min: 15, max: 40 },
    "document-processing": { min: 10, max: 25 },
    "compliance-reporting": { min: 8, max: 20 },
    "lead-response": { min: 10, max: 20 },
  };

  const range = baseRanges[Object.keys(baseRanges).find(() => true) || ""] || { min: 8, max: 20 };

  // Use the first matching workflow's range based on matchScore
  const avg = (range.min + range.max) / 2;
  return Math.round(avg * (0.8 + (keywordCount / 10) * 0.4));
}

function estimateWeeklyHours(description: string): number {
  const lower = description.toLowerCase();
  if (lower.includes("every morning") || lower.includes("daily")) return 5;
  if (lower.includes("every hour") || lower.includes("hourly")) return 20;
  if (lower.includes("each invoice") || lower.includes("each order")) return 10;
  if (lower.includes("weekly")) return 3;
  if (lower.includes("monthly")) return 2;
  if (lower.includes("multiple times") || lower.includes("several")) return 8;
  return 4; // default
}

// ── Main Analysis Function ───────────────────────────────────────────────

export function analyzeDescription(description: string): AnalysisSummary {
  const lower = description.toLowerCase();

  // Find matching keyword patterns
  const matches: { workflowId: string; score: number; keywords: string[] }[] = [];
  const matchedKeywords: string[] = [];

  for (const pattern of keywordPatterns) {
    const foundWords = pattern.words.filter(w => lower.includes(w));
    if (foundWords.length > 0) {
      matchedKeywords.push(...foundWords);
      const existing = matches.find(m => m.workflowId === pattern.workflowMatch);
      if (existing) {
        existing.score += pattern.weight * foundWords.length;
        existing.keywords.push(...foundWords.filter((w: string) => !existing.keywords.includes(w)));
      } else {
        matches.push({
          workflowId: pattern.workflowMatch,
          score: pattern.weight * foundWords.length,
          keywords: [...foundWords],
        });
      }
    }
  }

  // Collect unique keywords (for scoring)
  const uniqueKeywords = [...new Set(matchedKeywords)];
  void uniqueKeywords; // used implicitly for scoring above

  // Score each workflow based on description similarity
  const scored: { workflow: Workflow; score: number; keywords: string[] }[] = [];

  for (const workflow of workflows) {
    let score = 0;
    const wfKeywords: string[] = [];

    // Check keyword pattern matches
    const patternMatch = matches.find(m => m.workflowId === workflow.id);
    if (patternMatch) {
      score += patternMatch.score * 10;
      wfKeywords.push(...patternMatch.keywords);
    }

    // Check workflow name in description
    if (lower.includes(workflow.name.toLowerCase())) {
      score += 15;
    }

    // Check pain point keywords
    const painWords = workflow.painPoint.toLowerCase().split(" ");
    for (const word of painWords) {
      if (word.length > 3 && lower.includes(word)) {
        score += 2;
      }
    }

    // Check description keywords
    const descWords = workflow.description.toLowerCase().split(" ");
    for (const word of descWords) {
      if (word.length > 4 && !["with", "from", "into", "that", "this"].includes(word) && lower.includes(word)) {
        score += 1;
        if (!wfKeywords.includes(word)) wfKeywords.push(word);
      }
    }

    if (score > 0) {
      scored.push({ workflow, score, keywords: wfKeywords });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // If no matches found, return a generic result
  if (scored.length === 0) {
    const defaultWorkflow = workflows.find(w => w.id === "data-entry-automation") || workflows[0];
    return {
      topMatch: {
        match: defaultWorkflow,
        score: 1,
        estimatedHoursSaved: 10,
        estimatedWeeklyHours: estimateWeeklyHours(description),
        confidence: "low",
        suggestedAgentName: agentNameMap[defaultWorkflow.id]?.name || "Automation AI",
        suggestedAgentEmoji: agentNameMap[defaultWorkflow.id]?.emoji || "🤖",
        keywords: ["automation", "process"],
      },
      allMatches: [],
      industryGuess: detectIndustry(lower),
      savingsSummary: "Based on a general automation assessment, we estimate significant time savings.",
    };
  }

  // Build results
  const allResults: AnalysisResult[] = scored.map(s => ({
    match: s.workflow,
    score: s.score,
    estimatedHoursSaved: estimateHoursSaved(s.score, s.keywords.length),
    estimatedWeeklyHours: estimateWeeklyHours(description),
    confidence: s.score > 30 ? "high" : s.score > 15 ? "medium" : "low",
    suggestedAgentName: agentNameMap[s.workflow.id]?.name || "Automation AI",
    suggestedAgentEmoji: agentNameMap[s.workflow.id]?.emoji || "🤖",
    keywords: s.keywords,
  }));

  const top = allResults[0];
  const totalHours = allResults.reduce((sum, r) => sum + r.estimatedHoursSaved, 0);

  return {
    topMatch: top,
    allMatches: allResults.slice(0, 5),
    industryGuess: detectIndustry(lower),
    savingsSummary: `We estimate your team could save **${totalHours}+ hours per week** across ${allResults.length} automation opportunities. The top match alone could save **${top.estimatedHoursSaved} hours per week**.`,
  };
}

function detectIndustry(text: string): string {
  for (const entry of industryKeywords) {
    for (const word of entry.words) {
      if (text.includes(word)) return entry.industry;
    }
  }
  return "General Business";
}

/**
 * Get follow-up questions for the AI Advisor based on partial description
 */
export function getFollowUpQuestions(description: string): string[] {
  const lower = description.toLowerCase();
  const questions: string[] = [];

  if (!lower.includes("how many") && !lower.includes("volume")) {
    questions.push("How many times per day/week does this task happen?");
  }
  if (!lower.includes("system") && !lower.includes("software") && !lower.includes("tool")) {
    questions.push("What systems or software does this process involve?");
  }
  if (!lower.includes("person") && !lower.includes("team") && !lower.includes("employee") && !lower.includes("staff")) {
    questions.push("How many people are currently doing this work?");
  }
  if (!lower.includes("error") && !lower.includes("mistake") && !lower.includes("rework")) {
    questions.push("Do errors in this process cause problems downstream?");
  }
  if (!lower.includes("approve") && !lower.includes("manager") && !lower.includes("review")) {
    questions.push("Does this task require manager approval or review?");
  }

  return questions.slice(0, 3);
}
