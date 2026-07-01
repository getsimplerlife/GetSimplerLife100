import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/manufacturing')({
  component: Manufacturing,
});

const config: IndustryConfig = {
  id: 'manufacturing',
  name: 'Manufacturing',
  icon: '🏭',
  accent: '#0891b2',
  bgLight: 'bg-cyan-50',
  tagline: 'Precision automation. Lean operations.',
  hook: 'Manual document review and inventory reconciliation are massive overhead costs for modern manufacturers. Simpler Life 100 deploys AI agents that eliminate these bottlenecks, delivering real-world efficiency gains.',
  painPoints: [
    'Manual document review for quality assurance is slow and prone to oversight',
    'Inventory reconciliation across multiple systems requires constant manual intervention',
    'Quality control logging is often fragmented and paper-based',
    'Supply chain tracking lacks automated exception handling',
    'Just-in-Time replenishment depends on high-latency manual data entry',
    'Production scheduling remains a manual puzzle despite having the data',
  ],
  quickScanFeatures: [
    'QA document workflow audit',
    'Inventory reconciliation cycle analysis',
    'QC logging process assessment',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full manufacturing operations audit',
    'Supply chain automation analysis',
    'Production scheduling optimization plan',
    'Lean AI deployment roadmap',
    'Custom ROI projections for AI coworkers',
  ],
  kpiOne: { value: '2.1x', label: 'Measured efficiency gain' },
  kpiTwo: { value: '50%', label: 'Reduction in QC overhead' },
  kpiThree: { value: '99.9%', label: 'Inventory data accuracy' },
};

function Manufacturing() {
  return <IndustryLanding config={config} />;
}
