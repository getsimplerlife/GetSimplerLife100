import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/financial-services')({
  component: FinancialServices,
});

const config: IndustryConfig = {
  id: 'financial-services',
  name: 'Financial Services',
  icon: '💰',
  accent: '#15803d',
  bgLight: 'bg-green-50',
  tagline: 'Meet every regulatory requirement — automatically',
  hook: 'Financial services face the heaviest compliance burden of any industry. Automate your regulatory controls, audit trails, and security posture — and pass every exam with zero findings.',
  painPoints: [
    'Compliance audits require weeks of manual evidence collection',
    'Regulatory reporting is still managed on spreadsheets and email',
    'Client onboarding KYC/AML checks take 3-5 business days manually',
    'Transaction monitoring generates false-positive alerts that bury compliance teams',
    'Policy attestation and training tracking is fragmented across systems',
    'SEC/FINRA exam preparation creates a month-long scramble every cycle',
  ],
  quickScanFeatures: [
    'Regulatory compliance gap analysis',
    'Audit trail quality assessment',
    'Security posture review',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full regulatory compliance audit',
    'KYC/AML onboarding workflow analysis',
    'Transaction monitoring effectiveness assessment',
    'Audit trail completeness verification',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '100%', label: 'Audit pass rate achieved' },
  kpiTwo: { value: '80%', label: 'Faster regulatory reporting' },
  kpiThree: { value: '14 days', label: 'Client onboarding time' },
  services: [
    { name: 'Compliance Service', description: 'Automated regulatory compliance monitoring and reporting. Tracks SEC/FINRA rule changes, maps them to internal controls, and generates exam-ready evidence packages.' },
  ],
};

function FinancialServices() {
  return <IndustryLanding config={config} />;
}