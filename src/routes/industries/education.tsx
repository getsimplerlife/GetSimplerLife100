import IndustryLanding from '../../components/IndustryLanding';
import type { IndustryConfig } from '../../components/IndustryLanding';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/industries/education')({
  component: Education,
});

const config: IndustryConfig = {
  id: 'education',
  name: 'Education',
  icon: '📚',
  accent: '#9333ea',
  bgLight: 'bg-purple-50',
  tagline: 'Automate admin. Focus on students.',
  hook: 'Educators spend 30%+ of their time on paperwork instead of teaching. Automate enrollment, grading workflows, and administrative reporting — and give teachers their time back.',
  painPoints: [
    'Student enrollment requires re-entering data across 5+ systems',
    'Grading workflows are manual — no auto-scoring or rubric tools',
    'Attendance tracking is paper-based and entered days late',
    'FERPA compliance documentation is scattered across filing cabinets',
    'Transcript requests require manual processing and verification',
    'Parent communication is ad-hoc and not tracked systematically',
  ],
  quickScanFeatures: [
    'Administrative workflow audit',
    'Enrollment process efficiency analysis',
    'Compliance documentation assessment',
    '24-hour executive summary with risk score',
  ],
  deepAuditFeatures: [
    'Full education operations audit',
    'Student lifecycle automation opportunity map',
    'Grading & assessment workflow optimization',
    'FERPA compliance & records management plan',
    'Custom automation roadmap with ROI projections',
  ],
  kpiOne: { value: '15+ hrs', label: 'Saved per educator weekly' },
  kpiTwo: { value: '80%', label: 'Faster transcript processing' },
  kpiThree: { value: '1.4x', label: 'ROI on automation investment' },
};

function Education() {
  return <IndustryLanding config={config} />;
}