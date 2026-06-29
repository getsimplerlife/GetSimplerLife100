import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/government')({
  component: Government,
});

const config: IndustryConfig = {
  id: 'government',
  name: 'Government',
  icon: '🏛️',
  accent: '#475569',
  bgLight: 'bg-slate-50',
  tagline: 'Serve citizens faster. Process permits smarter.',
  hook: 'Government efficiency is measured in wait times and backlog size. Automate permit processing, citizen requests, and records management — and deliver services in days, not months.',
  painPoints: [
    'Permit processing takes 8-12 weeks with manual review at every step',
    'Citizen service requests are fielded through phone and paper forms',
    'Document approvals languish in email inboxes for weeks',
    'Records management is scattered across physical filing and legacy systems',
    'Public records requests require manual search and redaction',
    'Inter-department data sharing requires manual transfers',
  ],
  quickScanFeatures: [
    'Permit & license workflow audit',
    'Citizen service request cycle analysis',
    'Records management efficiency assessment',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full government operations audit',
    'Permit processing automation opportunity map',
    'Citizen services digital transformation plan',
    'Records management & FOIA optimization',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '70%', label: 'Faster permit approval' },
  kpiTwo: { value: '85%', label: 'Citizen satisfaction score' },
  kpiThree: { value: '1.3x', label: 'ROI on automation investment' },
};

function Government() {
  return <IndustryLanding config={config} />;
}