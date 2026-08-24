import { Route } from '~/routes/case-studies.$caseStudyId';
import CaseStudyPage from '~/components/CaseStudyPage';
import { caseStudies } from '~/content/case-studies';

function CaseStudyRoutePage() {
  const { caseStudyId } = Route.useParams();
  const data = caseStudies.find(cs => cs.id === caseStudyId);
  if (!data) return <div className="text-center py-20 text-stone-400">Case study not found</div>;
  return <CaseStudyPage data={data} />;
}

export default CaseStudyRoutePage;
