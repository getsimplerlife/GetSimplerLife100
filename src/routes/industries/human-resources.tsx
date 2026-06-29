import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/human-resources')({
  component: HumanResources,
});

const config: IndustryConfig = {
  id: 'human-resources',
  name: 'Human Resources',
  icon: '👥',
  accent: '#65a30d',
  bgLight: 'bg-lime-50',
  tagline: 'Hire faster. Onboard better. Retain longer.',
  hook: 'HR teams spend 40% of their time on manual processing instead of strategic people work. Automate screening, onboarding, and performance workflows — and build a better employee experience.',
  painPoints: [
    'Resume screening takes 6-8 hours per open position',
    'Employee onboarding requires 20+ manual signature collections',
    'Payroll administration is a weekly spreadsheet-intensive process',
    'Performance review cycles require months of manual coordination',
    'Compliance documentation (I-9, W-4) is scattered across files',
    'Employee offboarding has 15+ steps, most of which are manual',
  ],
  quickScanFeatures: [
    'Talent acquisition workflow audit',
    'Onboarding process efficiency analysis',
    'HR compliance documentation assessment',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full HR operations audit',
    'Recruitment & screening automation opportunity map',
    'Onboarding workflow optimization plan',
    'Performance management process redesign',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '50%', label: 'Faster time-to-hire' },
  kpiTwo: { value: '80%', label: 'Paperwork elimination' },
  kpiThree: { value: '1.8x', label: 'ROI on automation investment' },
  services: [
    { name: 'Vendor Onboarding Service', description: 'Automated vendor onboarding — tax document collection, insurance verification, contract signing, and system provisioning in one workflow.' },
  ],
};

function HumanResources() {
  return <IndustryLanding config={config} />;
}