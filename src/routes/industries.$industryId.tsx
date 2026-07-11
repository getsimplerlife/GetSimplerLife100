import { createFileRoute } from '@tanstack/react-router';
import IndustryHub from '~/components/IndustryHub';
import { industries } from '~/content/industries';

export const Route = createFileRoute('/industries/$industryId')({
  component: IndustryPage,
  notFoundComponent: () => <div className="text-center py-20 text-stone-400">Industry not found</div>,
});

function IndustryPage() {
  const { industryId } = Route.useParams();
  const data = industries.find(i => i.id === industryId);
  if (!data) return <div className="text-center py-20 text-stone-400">Industry not found</div>;
  return <IndustryHub data={data} />;
}
