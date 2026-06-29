import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/telecommunications')({
  component: Telecommunications,
});

const config: IndustryConfig = {
  id: 'telecommunications',
  name: 'Telecommunications',
  icon: '📡',
  accent: '#c026d3',
  bgLight: 'bg-fuchsia-50',
  tagline: 'Connect customers faster. Reduce churn. Optimize networks.',
  hook: 'Telecom profits depend on customer retention and network reliability. Automate onboarding, support routing, and billing reconciliation — and slash churn while improving service quality.',
  painPoints: [
    'Customer onboarding requires manual identity verification and credit checks',
    'Network monitoring generates 1000s of alerts — most are false positives',
    'Support tickets are manually triaged, delaying resolution by hours',
    'Billing reconciliation is a week-long exercise every month',
    'Service outage notifications are reactive, not proactive',
    'Customer churn triggers go undetected until cancellation',
  ],
  quickScanFeatures: [
    'Customer onboarding workflow audit',
    'Support ticket routing efficiency analysis',
    'Billing reconciliation cycle assessment',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full telecom operations audit',
    'Customer lifecycle automation opportunity map',
    'Network monitoring & incident response optimization',
    'Billing & revenue assurance automation plan',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '65%', label: 'Churn rate reduction' },
  kpiTwo: { value: '70%', label: 'Faster issue resolution' },
  kpiThree: { value: '1.8x', label: 'ROI on automation investment' },
};

function Telecommunications() {
  return <IndustryLanding config={config} />;
}