import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/agriculture')({
  component: Agriculture,
});

const config: IndustryConfig = {
  id: 'agriculture',
  name: 'Agriculture',
  icon: '🌾',
  accent: '#16a34a',
  bgLight: 'bg-green-50',
  tagline: 'Monitor crops automatically. Reduce yield loss.',
  hook: 'Modern farming generates more data than farmers can process. Automate crop monitoring, equipment scheduling, and compliance reporting — and make data-driven decisions at scale.',
  painPoints: [
    'Crop monitoring relies on manual field walks and visual inspection',
    'Equipment scheduling conflicts cause costly downtime during harvest',
    'Inventory tracking is paper-based and always behind',
    'Compliance reporting for subsidies requires weeks of documentation',
    'Weather data isn\'t integrated into planting and spraying decisions',
    'Supply chain documentation is fragmented across buyers and brokers',
  ],
  quickScanFeatures: [
    'Field operations workflow audit',
    'Equipment utilization efficiency analysis',
    'Compliance reporting process assessment',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full agricultural operations audit',
    'Precision agriculture automation opportunity map',
    'Equipment & fleet management optimization',
    'Crop monitoring & yield prediction plan',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '20%', label: 'Yield improvement achieved' },
  kpiTwo: { value: '35%', label: 'Equipment downtime reduction' },
  kpiThree: { value: '2.0x', label: 'ROI on automation investment' },
};

function Agriculture() {
  return <IndustryLanding config={config} />;
}