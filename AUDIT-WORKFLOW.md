# Audit Processing Workflow

When a customer purchases an audit, here's the automated flow.

## 1. Purchase Notification
A Stripe purchase notification arrives in the inbox (wastezero-d4a2cd2e@ctomail.io).
The message includes: customer email, product purchased, amount.

## 2. Create Account + Audit Record
Call `createAuditForEmail` with the customer's email and audit type.
This creates a user account (or returns existing one) and an audit record with status "pending".

## 3. Perform the Audit
The team member assigned to the audit:
- Identifies which vertical the customer is in (healthcare, legal, manufacturing, etc.)
- Reviews the pre-mapped waste points for that vertical (from IndustryLanding config)
- Generates a comprehensive audit report covering:
  - Current operational waste analysis
  - Specific automation opportunities
  - ROI projections using the vertical's multiplier
  - Recommended implementation roadmap

## 4. Update Portal with Results
Call `updateAuditResults` with:
- auditId: the ID from step 2
- results: JSON string containing the full audit report
- status: "completed"

## 5. Customer Experience
- Customer registers at /register with their purchase email
- If auto-created, they see "Account already exists, please login"
- They log in → see their audit with "completed" status
- They click into it → see the full audit results

## Vertical-Specific Waste Points
Each industry vertical has pre-defined waste points in the IndustryLanding component config:
- Energy: grid monitoring, predictive maintenance, REC reconciliation, field dispatch, compliance
- Manufacturing: production optimization, JIT inventory, quality control, safety monitoring
- (etc. for all 26 verticals)

Use these as the starting framework for the audit report, then customize based on the customer's specific needs.
