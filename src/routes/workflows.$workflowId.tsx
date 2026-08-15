import { createFileRoute } from '@tanstack/react-router';
import WorkflowPage from '~/components/WorkflowPage';
import { workflows } from '~/content/workflows';
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute('/workflows/$workflowId')({
  head: () => pageHead("/workflows"),
  component: WorkflowRoutePage,
  notFoundComponent: () => <div className="text-center py-20 text-stone-400">Workflow not found</div>,
});

function WorkflowRoutePage() {
  const { workflowId } = Route.useParams();
  const data = workflows.find(w => w.id === workflowId);
  if (!data) return <div className="text-center py-20 text-stone-400">Workflow not found</div>;
  return <WorkflowPage data={data} />;
}
