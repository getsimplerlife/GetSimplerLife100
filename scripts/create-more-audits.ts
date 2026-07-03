import { createAuditForEmailInternal } from "../src/db/queries";
import { db } from "../src/db/index";
import { audits } from "../src/db/schema";
import { eq } from "drizzle-orm";

const testAudits = [
  {
    email: "test@example.com",
    type: "Energy Sector Deep-Dive Audit",
    results: `# Energy Sector AI Opportunity Audit

## Client: Test Account - Energy
## Date: July 2, 2026

## Top Opportunities

### 1. Grid Monitoring Automation
**Time Saved:** 400 hrs/yr | **Cost Savings:** $48,000/yr | **ROI:** 2.5x

### 2. Predictive Maintenance
**Time Saved:** 350 hrs/yr | **Cost Savings:** $42,000/yr | **ROI:** 2.8x

### 3. Renewable Energy Credit Tracking
**Time Saved:** 200 hrs/yr | **Cost Savings:** $24,000/yr | **ROI:** 3.1x

### 4. Compliance Reporting
**Time Saved:** 280 hrs/yr | **Cost Savings:** $33,600/yr | **ROI:** 2.2x

**Total Annual Savings: $147,600 | Payback: 1.3 months**`
  },
  {
    email: "e2e_test@example.com",
    type: "Manufacturing Sector Deep-Dive Audit",
    results: `# Manufacturing Sector AI Opportunity Audit

## Client: Test Account - Manufacturing
## Date: July 2, 2026

## Top Opportunities

### 1. Production Monitoring
**Time Saved:** 500 hrs/yr | **Cost Savings:** $60,000/yr | **ROI:** 3.2x

### 2. Quality Inspection Automation
**Time Saved:** 320 hrs/yr | **Cost Savings:** $38,400/yr | **ROI:** 2.8x

### 3. Inventory Automation
**Time Saved:** 280 hrs/yr | **Cost Savings:** $33,600/yr | **ROI:** 2.5x

### 4. Order Processing
**Time Saved:** 240 hrs/yr | **Cost Savings:** $28,800/yr | **ROI:** 3.0x

**Total Annual Savings: $160,800 | Payback: 1.1 months**`
  },
  {
    email: "testuser@example.com",
    type: "Logistics Sector Deep-Dive Audit",
    results: `# Logistics Sector AI Opportunity Audit

## Client: Test Account - Logistics
## Date: July 2, 2026

## Top Opportunities

### 1. Dispatch Automation
**Time Saved:** 450 hrs/yr | **Cost Savings:** $54,000/yr | **ROI:** 3.0x

### 2. Route Optimization
**Time Saved:** 380 hrs/yr | **Cost Savings:** $45,600/yr | **ROI:** 2.6x

### 3. POD Reconciliation
**Time Saved:** 300 hrs/yr | **Cost Savings:** $36,000/yr | **ROI:** 2.8x

### 4. Invoice Matching
**Time Saved:** 260 hrs/yr | **Cost Savings:** $31,200/yr | **ROI:** 2.4x

**Total Annual Savings: $166,800 | Payback: 1.2 months**`
  }
];

async function main() {
  for (const ta of testAudits) {
    const result = await createAuditForEmailInternal(ta.email, ta.type);
    await db.update(audits)
      .set({ results: ta.results, status: "completed", updatedAt: new Date() })
      .where(eq(audits.id, result.auditId));
    console.log(`Created ${ta.type} for ${ta.email} — auditId: ${result.auditId}`);
  }
  console.log("All test audits created and completed.");
}
main().catch(console.error);
