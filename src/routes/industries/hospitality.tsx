import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/hospitality')({
  component: Hospitality,
});

const config: IndustryConfig = {
  id: 'hospitality',
  name: 'Hospitality',
  icon: '🏨',
  accent: '#e11d48',
  bgLight: 'bg-rose-50',
  tagline: 'Delight guests. Optimize occupancy. Reduce overhead.',
  hook: 'Hospitality runs on service speed and personalization. Automate reservations, guest communication, and housekeeping coordination — and turn every stay into a 5-star review.',
  painPoints: [
    'Reservation management requires manual entry across OTA platforms',
    'Guest communication is reactive — they call you with questions',
    'Housekeeping scheduling is a paper-based whiteboard system',
    'Review monitoring across 5+ platforms is done manually weekly',
    'Revenue management pricing updates are reactive, not proactive',
    'Staff scheduling doesn\'t account for booking volume fluctuations',
  ],
  quickScanFeatures: [
    'Reservation & booking workflow audit',
    'Guest communication cycle assessment',
    'Housekeeping operations efficiency analysis',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full hospitality operations audit',
    'Property management automation opportunity map',
    'Guest experience workflow optimization plan',
    'Revenue management process assessment',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '4.8★', label: 'Average guest rating' },
  kpiTwo: { value: '40%', label: 'Housekeeping efficiency gain' },
  kpiThree: { value: '1.5x', label: 'ROI on automation investment' },
};

function Hospitality() {
  return <IndustryLanding config={config} />;
}