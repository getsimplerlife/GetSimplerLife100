import { Route } from '~/routes/industries.$industryId';
import IndustryHub from '~/components/IndustryHub';
import { industries } from '~/content/industries';

function IndustryPage() {
  const { industryId } = Route.useParams();
  const data = industries.find(i => i.id === industryId);
  if (!data) return <div className="text-center py-20 text-stone-400">Industry not found</div>;
  return <IndustryHub data={data} />;
}

export default IndustryPage;
