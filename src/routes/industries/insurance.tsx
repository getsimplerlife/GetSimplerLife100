import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/insurance')({
  component: Insurance,
});

const config: IndustryConfig = {
  id: 'insurance',
  name: 'Insurance',
  icon: '🛡️',
  accent: '#0284c7',
  bgLight: 'bg-sky-50',
  tagline: 'Process claims in hours, not weeks',
  hook: 'Insurance runs on claims processing speed. Automate every step — from first notice of loss to settlement — and cut weeks of manual review out of every claim lifecycle.',
  painPoints: [
    'Claims intake requires 30+ manual data fields to be entered per claim',
    'Policy verification involves cross-referencing 3+ legacy systems',
    'Underwriting reviews are bottlenecked by manual document analysis',
    'Claim leakage from inconsistent adjustment practices erodes margins',
    'Fraud detection teams spend 70% of time on false-positive triage',
    'Regulatory compliance filings require weeks of manual evidence gathering',
  ],
  quickScanFeatures: [
    'Claims processing workflow audit',
    'Policy administration cycle assessment',
    'Fraud detection efficiency analysis',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full claims operations audit',
    'Claims lifecycle automation opportunity map',
    'Underwriting process efficiency assessment',
    'Fraud detection model optimization plan',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '80%', label: 'Faster claims processing' },
  kpiTwo: { value: '65%', label: 'Claim leakage reduction' },
  kpiThree: { value: '1.8x', label: 'ROI on automation investment' },
  services: [
    { name: 'Compliance Service', description: 'Automated regulatory compliance monitoring and reporting. Tracks changing regulations, maps them to internal policies, and generates audit-ready reports.' },
    { name: 'Insurance Service', description: 'End-to-end claims processing automation — from first notice of loss through adjudication, with fraud scoring and policy verification built in.' },
  ],
};

function Insurance() {
  return <IndustryLanding config={config} />;
}