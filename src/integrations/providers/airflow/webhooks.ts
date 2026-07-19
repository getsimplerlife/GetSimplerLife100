/**
 * Airflow Orchestration Integration — Webhooks
 *
 * Webhook handlers for Airflow events.
 * Supports DAG run status changes and task instance state changes.
 */
export interface AirflowWebhookEvent {
  eventType: "dag_run_state" | "task_instance_state";
  payload: Record<string, any>;
  dagId?: string;
  taskId?: string;
  timestamp?: string;
}

export interface WebhookHandler {
  name: string;
  description: string;
  eventType: string;
  handler: (event: AirflowWebhookEvent) => Promise<void>;
}

export const dagRunStateHandler: WebhookHandler = {
  name: "airflow_dag_run_state_handler",
  description: "Process Airflow DAG run state change events",
  eventType: "dag_run_state",
  handler: async (event) => {
    console.log(`[Airflow] DAG run state change: ${JSON.stringify(event.payload)}`);
  },
};

export const taskInstanceStateHandler: WebhookHandler = {
  name: "airflow_task_instance_state_handler",
  description: "Process Airflow task instance state change events",
  eventType: "task_instance_state",
  handler: async (event) => {
    console.log(`[Airflow] Task instance state change: ${JSON.stringify(event.payload)}`);
  },
};

export const airflowWebhookHandlers: WebhookHandler[] = [
  dagRunStateHandler,
  taskInstanceStateHandler,
];