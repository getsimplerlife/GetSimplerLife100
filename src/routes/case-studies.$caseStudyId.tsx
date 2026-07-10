import { createFileRoute } from '@tanstack/react-router';
import CaseStudyPage from '~/components/CaseStudyPage';
import { caseStudies } from '~/content/case-studies';

export const Route = createFileRoute('/case-studies/$caseStudyId')({
  component: CaseStudyRoutePage,
  notFoundComponent: () => <div className="text-center py-20 text-stone-400">Case study not found</div>,
});

function CaseStudyRoutePage() {
  const { caseStudyId } = Route.useParams();
  const data = caseStudies.find(cs => cs.id === caseStudyId);
  if (!data) return <div className="text-center py-20 text-stone-400">Case study not found</div>;
  return <CaseStudyPage data={data} />;
}
