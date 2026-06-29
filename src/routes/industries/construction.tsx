import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/construction')({
  component: Construction,
});

const config: IndustryConfig = {
  id: 'construction',
  name: 'Construction',
  icon: '🏗️',
  accent: '#d97706',
  bgLight: 'bg-amber-50',
  tagline: 'Protect margins. Win bids. Deliver on time.',
  hook: 'Construction margins live or die on accurate estimates and field reporting. Automate your bid generation, change order tracking, and budget monitoring — and build more profitably.',
  painPoints: [
    'Estimators spend 15-30 hours per week on manual spreadsheet bids',
    'Change orders get lost in email threads, causing scope and budget creep',
    'Field reports are handwritten and entered into systems days late',
    'Material price fluctuations aren\'t tracked against active project budgets',
    'Subcontractor compliance documentation is spread across filing cabinets',
    'Progress billing requires manual data aggregation across job sites',
  ],
  quickScanFeatures: [
    'Field reporting workflow audit',
    'Change order process efficiency analysis',
    'Budget tracking gap assessment',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full project operations audit',
    'Estimation accuracy & bid win-rate analysis',
    'Change order lifecycle assessment',
    'Field-to-office data flow audit',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '20+ hrs', label: 'Saved per estimator weekly' },
  kpiTwo: { value: '35%', label: 'Faster project closeouts' },
  kpiThree: { value: '2.5x', label: 'Bid submission speed increase' },
  services: [
    { name: 'Construction Bid Service', description: 'Automated bid generation from project specs, historical data, and material pricing feeds. Generates competitive bids in minutes, not days.' },
    { name: 'Procurement Service', description: 'Automated material procurement workflows — PO generation, supplier matching, and price comparison across vendors.' },
  ],
};

function Construction() {
  return <IndustryLanding config={config} />;
}