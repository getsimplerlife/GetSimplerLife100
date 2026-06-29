import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/technology')({
  component: Technology,
});

const config: IndustryConfig = {
  id: 'technology',
  name: 'Technology',
  icon: '💻',
  accent: '#1d4ed8',
  bgLight: 'bg-blue-50',
  tagline: 'Ship faster. Reduce technical debt. Automate QA.',
  hook: 'Tech teams waste 30% of sprint capacity on manual processes. Automate QA testing, deployment pipelines, and support triage — and ship better code faster.',
  painPoints: [
    'QA testing is still done manually for 60%+ of test cases',
    'Support triage requires senior engineers to classify every issue',
    'Documentation is perpetually outdated and scattered across wikis',
    'Release management is a high-anxiety manual checklist',
    'Security vulnerabilities get reported but take weeks to prioritize',
    'Sprint reporting requires manual data aggregation across tools',
  ],
  quickScanFeatures: [
    'QA & testing workflow audit',
    'Release process efficiency analysis',
    'Support triage cycle assessment',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full engineering operations audit',
    'CI/CD pipeline automation opportunity map',
    'QA process optimization & test automation plan',
    'Security vulnerability management workflow assessment',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '40%', label: 'Faster release cycles' },
  kpiTwo: { value: '85%', label: 'Test automation coverage' },
  kpiThree: { value: '2.0x', label: 'ROI on automation investment' },
};

function Technology() {
  return <IndustryLanding config={config} />;
}