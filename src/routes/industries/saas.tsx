import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/saas')({
  component: SaaS,
});

const config: IndustryConfig = {
  id: 'saas',
  name: 'SaaS',
  icon: '☁️',
  accent: '#4f46e5',
  bgLight: 'bg-emerald-50',
  tagline: 'Convert trials, reduce churn, scale smarter',
  hook: 'SaaS growth depends on trial-to-paid conversion and churn reduction. Automate onboarding, nurture sequences, and AI risk detection — and watch your MRR compound.',
  painPoints: [
    'Trial-to-paid conversion stagnates below 5% with manual onboarding',
    'Churn triggers go undetected until it\'s too late to intervene',
    'Customer onboarding is inconsistent and takes 3+ weeks to complete',
    'Feature adoption data is siloed — no proactive engagement campaigns',
    'Support tickets spike 2x during product launches with no automated deflection',
    'Revenue recognition and billing errors create compliance headaches',
  ],
  quickScanFeatures: [
    'Trial conversion funnel audit',
    'Churn risk pattern analysis',
    'Onboarding workflow assessment',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full growth & retention audit',
    'Trial-to-paid conversion optimization plan',
    'Churn prediction model analysis',
    'Customer journey automation opportunity map',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '38%', label: 'Trial conversion increase' },
  kpiTwo: { value: '45%', label: 'Churn rate reduction' },
  kpiThree: { value: '14 days', label: 'Onboarding time cut' },
  services: [
    { name: 'Proposal Writer Service', description: 'Automated proposal and pitch deck generation tailored to SaaS buyers — case studies, technical specs, pricing, and competitive comparisons in one click.' },
  ],
};

function SaaS() {
  return <IndustryLanding config={config} />;
}