import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/ecommerce')({
  component: ECommerce,
});

const config: IndustryConfig = {
  id: 'ecommerce',
  name: 'E-Commerce',
  icon: '🛒',
  accent: '#ea580c',
  bgLight: 'bg-orange-50',
  tagline: 'Plug revenue leakage & automate operations',
  hook: 'E-commerce margins are razor-thin. Stop losing revenue to checkout abandonment, attribution gaps, and return fraud. Automate what drains your bottom line.',
  painPoints: [
    'Cart abandonment rates of 70%+ with no automated recovery sequence',
    'Return fraud and processing costs eat 15-20% of gross revenue',
    'Attribution is broken — you don\'t know which channels actually convert',
    'Inventory sync errors between platforms cause overselling and stockouts',
    'Customer support tickets are 40%+ repetitive "where\'s my order?" queries',
    'Multi-channel order management requires manual data reconciliation',
  ],
  quickScanFeatures: [
    'Revenue leakage & checkout funnel analysis',
    'Attribution accuracy audit',
    'Return process efficiency assessment',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full revenue operations audit',
    'Checkout funnel optimization assessment',
    'Return flow & fraud pattern analysis',
    'Multi-channel attribution verification',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '22%', label: 'Revenue recovered' },
  kpiTwo: { value: '60%', label: 'Return processing time cut' },
  kpiThree: { value: '3.1x', label: 'ROI on automation investment' },
};

function ECommerce() {
  return <IndustryLanding config={config} />;
}