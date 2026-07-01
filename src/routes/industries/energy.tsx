import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/energy')({
  component: Energy,
});

const config: IndustryConfig = {
  id: 'energy',
  name: 'Energy',
  icon: '⚡',
  accent: '#059669',
  bgLight: 'bg-emerald-50',
  tagline: 'Grid-scale efficiency. Automated asset management.',
  hook: 'Manual overhead in the energy sector eats into margins through manual intake and asset inspections. Simpler Life 100 deploys industry-specific AI coworkers that eliminate these waste points, delivering predictable results.',
  painPoints: [
    'Manual intake workflows for complex asset data are slow and error-prone',
    'Asset inspection reports require hundreds of hours of manual compilation',
    'Maintenance scheduling is reactive rather than predictive',
    'Field reporting is disconnected from central operations databases',
    'Compliance audits take weeks of manual document gathering and review',
    'Real-time grid stability monitoring depends on high-friction manual checks',
  ],
  quickScanFeatures: [
    'Asset data intake workflow audit',
    'Inspection reporting cycle assessment',
    'Compliance document review analysis',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full energy operations audit',
    'Predictive maintenance opportunity analysis',
    'Grid-scale automation roadmap',
    'Real-time data integration assessment',
    'Custom ROI model for AI agent deployment',
  ],
  kpiOne: { value: '2.2x', label: 'Average efficiency gain' },
  kpiTwo: { value: '65%', label: 'Reduction in reporting time' },
  kpiThree: { value: '24/7', label: 'Automated monitoring availability' },
};

function Energy() {
  return <IndustryLanding config={config} />;
}
