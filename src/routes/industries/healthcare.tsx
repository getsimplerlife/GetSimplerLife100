import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/healthcare')({
  component: Healthcare,
});

const config: IndustryConfig = {
  id: 'healthcare',
  name: 'Healthcare',
  icon: '🏥',
  accent: '#059669',
  bgLight: 'bg-emerald-50',
  tagline: 'HIPAA-compliant automation for providers',
  hook: 'Automate patient intake, scheduling, and compliance documentation. Eliminate administrative drag so your clinical staff can focus on care — not paperwork.',
  painPoints: [
    'Staff spends 4-8 hours daily on manual patient intake data entry',
    'No-show rates of 15-30% due to ineffective reminder systems',
    'HIPAA compliance audits require weeks of manual evidence gathering',
    'Insurance eligibility verification is still done by phone and fax',
    'Referral tracking and follow-ups fall through the cracks',
    'Billing and coding errors lead to delayed or denied claims',
  ],
  quickScanFeatures: [
    'HIPAA/PHI compliance gap analysis',
    'Patient intake workflow map',
    'Scheduling bottleneck identification',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full HIPAA compliance diagnostic',
    'Patient intake & scheduling audit',
    'Denial management pattern analysis',
    'Custom automation roadmap with ROI projections',
    'Staff workflow time-motion study',
  ],
  kpiOne: { value: '18+ hrs', label: 'Saved per provider weekly' },
  kpiTwo: { value: '94%', label: 'No-show reduction achieved' },
  kpiThree: { value: '100%', label: 'HIPAA compliance assured' },
  services: [
    { name: 'Compliance Service', description: 'HIPAA compliance automation — automated PHI tracking, audit log generation, policy attestation workflows, and breach notification triggers.' },
  ],
};

function Healthcare() {
  return <IndustryLanding config={config} />;
}