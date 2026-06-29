import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/marketing')({
  component: Marketing,
});

const config: IndustryConfig = {
  id: 'marketing',
  name: 'Marketing',
  icon: '📣',
  accent: '#ec4899',
  bgLight: 'bg-pink-50',
  tagline: 'Attribute every dollar. Automate every campaign.',
  hook: 'Marketing waste is invisible when attribution is broken. Automate campaign reporting, lead scoring, and content approvals — and prove ROI on every channel.',
  painPoints: [
    'Campaign reporting takes 2-3 days to compile across platforms',
    'Content approvals languish in email threads for a week+',
    'Lead scoring is gut-feel based — no systematic qualification',
    'Social media scheduling is manual and inconsistent',
    'Attribution is broken — you don\'t know which channels convert',
    'Budget tracking is a monthly spreadsheet exercise',
  ],
  quickScanFeatures: [
    'Campaign reporting workflow audit',
    'Attribution accuracy assessment',
    'Content approval cycle analysis',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full marketing operations audit',
    'Multi-channel attribution optimization plan',
    'Campaign automation opportunity map',
    'Lead scoring & nurturing workflow redesign',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '3.5x', label: 'Attribution accuracy improvement' },
  kpiTwo: { value: '60%', label: 'Campaign reporting time cut' },
  kpiThree: { value: '1.7x', label: 'ROI on automation investment' },
};

function Marketing() {
  return <IndustryLanding config={config} />;
}