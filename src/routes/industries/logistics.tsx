import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/logistics')({
  component: Logistics,
});

const config: IndustryConfig = {
  id: 'logistics',
  name: 'Logistics',
  icon: '🚚',
  accent: '#ca8a04',
  bgLight: 'bg-yellow-50',
  tagline: 'Ship faster. Optimize routes. Eliminate delays.',
  hook: 'Logistics profits are made or lost on route efficiency and delivery accuracy. Automate dispatch scheduling, shipment tracking, and proof-of-delivery — and cut fuel costs while improving on-time rates.',
  painPoints: [
    'Route planning is done manually and never accounts for real-time traffic',
    'Shipment tracking requires calls to drivers for status updates',
    'Dispatch scheduling is a whiteboard exercise every morning',
    'Delivery confirmation relies on paper signatures that get lost',
    'Fuel costs are 15-20% higher than necessary due to inefficient routing',
    'Driver shortage is compounded by poor shift scheduling',
  ],
  quickScanFeatures: [
    'Dispatch & routing workflow audit',
    'On-time delivery performance analysis',
    'Fuel efficiency opportunity assessment',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full logistics operations audit',
    'Route optimization & fuel savings analysis',
    'Dispatch scheduling automation plan',
    'Shipment tracking & proof-of-delivery assessment',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '98%', label: 'On-time delivery rate' },
  kpiTwo: { value: '22%', label: 'Fuel cost reduction' },
  kpiThree: { value: '2.0x', label: 'ROI on automation investment' },
};

function Logistics() {
  return <IndustryLanding config={config} />;
}