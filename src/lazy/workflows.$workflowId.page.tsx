import { Route } from '~/routes/workflows.$workflowId';
import WorkflowPage from '~/components/WorkflowPage';
import { workflows } from '~/content/workflows';

function WorkflowRoutePage() {
  const { workflowId } = Route.useParams();
  const data = workflows.find(w => w.id === workflowId);
  if (!data) return <div className="text-center py-20 text-stone-400">Workflow not found</div>;
  return <WorkflowPage data={data} />;
}

export default WorkflowRoutePage;
