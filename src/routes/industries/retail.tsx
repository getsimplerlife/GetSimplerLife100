import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/retail')({
  component: Retail,
});

const config: IndustryConfig = {
  id: 'retail',
  name: 'Retail',
  icon: '🏬',
  accent: '#dc2626',
  bgLight: 'bg-red-50',
  tagline: 'Prevent stockouts. Reduce shrinkage. Sell more.',
  hook: 'Retail margins live or die on inventory accuracy and labor efficiency. Automate ordering, fulfillment workflows, and pricing updates — and stop losing money to operational gaps.',
  painPoints: [
    'Inventory management is reactive — stockouts trigger emergency orders',
    'Order fulfillment requires manual pick-pack coordination across teams',
    'Customer support inquiries spike 3x during sales events',
    'Pricing updates across 100s of SKUs are done one-by-one',
    'Shrinkage detection relies on quarterly physical counts',
    'Demand forecasting is gut-feel based, not data-driven',
  ],
  quickScanFeatures: [
    'Inventory management workflow audit',
    'Order fulfillment cycle analysis',
    'Shrinkage detection process assessment',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full retail operations audit',
    'Supply chain & inventory optimization plan',
    'Fulfillment automation opportunity map',
    'Pricing & promotions workflow assessment',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '99.5%', label: 'Inventory accuracy achieved' },
  kpiTwo: { value: '55%', label: 'Shrinkage reduction' },
  kpiThree: { value: '1.6x', label: 'ROI on automation investment' },
};

function Retail() {
  return <IndustryLanding config={config} />;
}