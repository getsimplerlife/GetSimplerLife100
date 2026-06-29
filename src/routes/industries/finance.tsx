import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/finance')({
  component: Finance,
});

const config: IndustryConfig = {
  id: 'finance',
  name: 'Finance',
  icon: '💳',
  accent: '#0891b2',
  bgLight: 'bg-cyan-50',
  tagline: 'Optimize capital operations & reduce risk exposure',
  hook: 'Finance operations run on data accuracy and speed. Automate loan processing, portfolio analysis, and compliance reporting — and free your analysts from spreadsheet work.',
  painPoints: [
    'Loan origination involves 20+ manual touch points across departments',
    'Customer onboarding requires re-entering data into 3+ separate systems',
    'Portfolio performance reports take 3-5 days to compile manually',
    'Regulatory compliance reporting is still managed on spreadsheets',
    'Fraud detection generates false positives that bury investigation teams',
    'AML/KYC documentation is scattered across filing cabinets and shared drives',
  ],
  quickScanFeatures: [
    'Loan processing workflow audit',
    'Customer onboarding cycle analysis',
    'Compliance reporting efficiency assessment',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full finance operations audit',
    'Loan origination automation opportunity map',
    'Portfolio reporting optimization plan',
    'AML/KYC compliance workflow assessment',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '60%', label: 'Faster loan processing' },
  kpiTwo: { value: '3 days', label: 'Reporting cycle time' },
  kpiThree: { value: '1.8x', label: 'ROI on automation investment' },
  services: [
    { name: 'Mortgage Service', description: 'Automated mortgage origination and processing — document collection, income verification, credit checks, and compliance review in a single pipeline.' },
    { name: 'Compliance Service', description: 'Automated regulatory compliance monitoring for lending, reporting, and KYC/AML requirements with audit trail generation.' },
  ],
};

function Finance() {
  return <IndustryLanding config={config} />;
}