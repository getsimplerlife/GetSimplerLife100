import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/restaurants')({
  component: Restaurants,
});

const config: IndustryConfig = {
  id: 'restaurants',
  name: 'Restaurants',
  icon: '🍽️',
  accent: '#f97316',
  bgLight: 'bg-orange-50',
  tagline: 'Cut food waste. Streamline orders. Boost margins.',
  hook: 'Restaurant margins are the thinnest of any industry. Automate inventory ordering, shift scheduling, and online order management — and protect every percentage point of profit.',
  painPoints: [
    'Inventory ordering is gut-feel based, not data-driven',
    'Staff scheduling doesn\'t account for reservation volume',
    'Online orders come through 4+ platforms, each managed separately',
    'Supplier coordination requires phone calls and paper invoices',
    'Food waste tracking is a weekly spreadsheet exercise',
    'Health inspection prep requires a frantic scramble every time',
  ],
  quickScanFeatures: [
    'Inventory & ordering workflow audit',
    'Online order management efficiency analysis',
    'Labor scheduling optimization assessment',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full restaurant operations audit',
    'Inventory & supplier management automation plan',
    'Online order aggregation opportunity assessment',
    'Labor cost optimization workflow',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '35%', label: 'Food waste reduction' },
  kpiTwo: { value: '20%', label: 'Labor cost optimization' },
  kpiThree: { value: '1.5x', label: 'ROI on automation investment' },
};

function Restaurants() {
  return <IndustryLanding config={config} />;
}