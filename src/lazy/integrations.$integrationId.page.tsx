import { Route } from '~/routes/integrations.$integrationId';
import IntegrationPage from '~/components/IntegrationPage';
import { integrations } from '~/content/integrations';

function IntegrationRoutePage() {
  const { integrationId } = Route.useParams();
  const data = integrations.filter(Boolean).find(i => i.id === integrationId);
  if (!data) return <div className="text-center py-20 text-stone-400">Integration not found</div>;
  return <IntegrationPage data={data} />;
}

export default IntegrationRoutePage;
