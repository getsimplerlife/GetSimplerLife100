import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/agency')({
  component: Agency,
});

const config: IndustryConfig = {
  id: 'agency',
  name: 'Agency',
  icon: '🎯',
  accent: '#db2777',
  bgLight: 'bg-pink-50',
  tagline: 'Deliver more. Grow faster. Waste less.',
  hook: 'Agency profitability depends on utilization and delivery efficiency. Automate client reporting, resource planning, and margin tracking — and stop leaving money on the table.',
  painPoints: [
    'Project overruns happen in 60%+ of engagements due to scope creep',
    'Account managers spend 8+ hours weekly on manual status reports',
    'Resource utilization data is opaque — you don\'t know who\'s over or underbooked',
    'Client onboarding requires re-entering the same data across 5+ tools',
    'Margin leakage from unbilled hours and out-of-scope work is invisible',
    'Retainer profitability isn\'t tracked at the individual client level',
  ],
  quickScanFeatures: [
    'Client delivery process audit',
    'Resource utilization analysis',
    'Margin leakage assessment',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full agency operations audit',
    'Project delivery & scope management analysis',
    'Resource utilization optimization plan',
    'Client reporting automation opportunity map',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '15+ hrs', label: 'Saved per account manager weekly' },
  kpiTwo: { value: '92%', label: 'Resource utilization rate' },
  kpiThree: { value: '25%', label: 'Margin improvement achieved' },
  services: [
    { name: 'Proposal Writer Service', description: 'Automated proposal and pitch deck generation from past work, case studies, and team expertise. Generate client-ready proposals in under an hour.' },
  ],
};

function Agency() {
  return <IndustryLanding config={config} />;
}
