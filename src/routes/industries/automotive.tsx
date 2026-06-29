import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/automotive')({
  component: Automotive,
});

const config: IndustryConfig = {
  id: 'automotive',
  name: 'Automotive',
  icon: '🚗',
  accent: '#44403c',
  bgLight: 'bg-stone-50',
  tagline: 'Streamline production. Reduce recalls. Optimize supply chains.',
  hook: 'Automotive margins depend on production precision and supply chain resilience. Automate service scheduling, parts inventory, and warranty processing — and keep the line moving.',
  painPoints: [
    'Service scheduling is a phone-tag coordination exercise',
    'Parts inventory is tracked on whiteboards and spreadsheets',
    'Warranty claims require manual verification across 3+ systems',
    'Production planning is disrupted by supply chain volatility',
    'Quality defect tracking relies on paper-based inspection forms',
    'Recall management requires manual cross-referencing of VINs',
  ],
  quickScanFeatures: [
    'Service operations workflow audit',
    'Parts inventory management assessment',
    'Warranty processing cycle analysis',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full automotive operations audit',
    'Production planning & scheduling optimization',
    'Supply chain resilience automation plan',
    'Quality management & recall process redesign',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '85%', label: 'First-pass quality rate' },
  kpiTwo: { value: '50%', label: 'Warranty processing time cut' },
  kpiThree: { value: '2.1x', label: 'ROI on automation investment' },
};

function Automotive() {
  return <IndustryLanding config={config} />;
}