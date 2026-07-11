import { createFileRoute } from '@tanstack/react-router';
import IntegrationPage from '~/components/IntegrationPage';
import { integrations } from '~/content/integrations';

export const Route = createFileRoute('/integrations/$integrationId')({
  component: IntegrationRoutePage,
  notFoundComponent: () => <div className="text-center py-20 text-stone-400">Integration not found</div>,
});

function IntegrationRoutePage() {
  const { integrationId } = Route.useParams();
  const data = integrations.find(i => i.id === integrationId);
  if (!data) return <div className="text-center py-20 text-stone-400">Integration not found</div>;
  return <IntegrationPage data={data} />;
}
