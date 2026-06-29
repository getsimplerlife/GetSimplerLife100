import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/accounting')({
  component: Accounting,
});

const config: IndustryConfig = {
  id: 'accounting',
  name: 'Accounting',
  icon: '📊',
  accent: '#0d9488',
  bgLight: 'bg-teal-50',
  tagline: 'Close books faster. Reconcile automatically.',
  hook: 'Accounting firms and departments waste 40% of billable time on manual reconciliation and data entry. Automate invoice processing, categorization, and reporting — and stop burning hours on spreadsheets.',
  painPoints: [
    'Invoice processing requires manual data entry from PDFs and emails',
    'Bank reconciliation takes 4-8 hours per statement cycle',
    'Expense categorization is inconsistent across team members',
    'Financial reporting is a frantic scramble every month-end close',
    'Tax filing preparation requires weeks of manual document gathering',
    'Audit trails are fragmented across spreadsheets and email chains',
  ],
  quickScanFeatures: [
    'Invoice processing workflow audit',
    'Reconciliation cycle time analysis',
    'Month-end close process assessment',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full accounting operations audit',
    'AP/AR automation opportunity analysis',
    'Month-end close optimization plan',
    'Compliance & audit trail assessment',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '80%', label: 'Faster month-end close' },
  kpiTwo: { value: '40 hrs', label: 'Saved per accountant monthly' },
  kpiThree: { value: '1.7x', label: 'ROI on automation investment' },
};

function Accounting() {
  return <IndustryLanding config={config} />;
}