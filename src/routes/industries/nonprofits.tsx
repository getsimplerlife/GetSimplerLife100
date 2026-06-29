import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/nonprofits')({
  component: Nonprofits,
});

const config: IndustryConfig = {
  id: 'nonprofits',
  name: 'Nonprofits',
  icon: '🤝',
  accent: '#78716c',
  bgLight: 'bg-stone-50',
  tagline: 'Maximize mission impact. Minimize administrative drag.',
  hook: 'Every dollar spent on admin is a dollar not spent on the mission. Automate donor management, grant reporting, and volunteer coordination — so your team focuses on impact, not paperwork.',
  painPoints: [
    'Donor management is fragmented across spreadsheets and email',
    'Grant reporting requires manual data aggregation from 3+ sources',
    'Volunteer scheduling is a weekly coordination nightmare',
    'Campaign tracking is reactive — results are known weeks after',
    'Donation receipting and tax document generation is manual',
    'Board reporting takes 2-3 days to compile every quarter',
  ],
  quickScanFeatures: [
    'Donor management workflow audit',
    'Grant reporting efficiency analysis',
    'Volunteer operations assessment',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full nonprofit operations audit',
    'Donor lifecycle automation opportunity map',
    'Grant compliance & reporting optimization',
    'Volunteer management workflow plan',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '25%', label: 'Admin cost reduction' },
  kpiTwo: { value: '60%', label: 'Faster grant reporting' },
  kpiThree: { value: '1.4x', label: 'ROI on automation investment' },
};

function Nonprofits() {
  return <IndustryLanding config={config} />;
}