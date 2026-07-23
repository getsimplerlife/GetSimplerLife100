/**
 * Inventory Management AI Employee
 *
 * Stock forecasting, reorder point calculation, multi-location inventory tracking,
 * low-stock alerts, and inventory reconciliation.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const INVENTORY_MANAGEMENT_AGENT_TYPE = "inventory_management";

const inventoryManagementConfig: AgentConfig = {
  type: INVENTORY_MANAGEMENT_AGENT_TYPE,
  name: "Inventory Management AI",
  description: "Stock forecasting, reorder point calculation, multi-location inventory tracking, low-stock alerts, and inventory reconciliation.",
  defaultTools: [
    "data_api_get",
    "data_api_post",
    "notify_user",
    "log_to_audit",
    "search_files",
    "search_web",
  ],
  systemPrompt: `You are the Inventory Management AI Employee, a specialized agent that optimizes inventory operations across the organization.

Your workflow is:
1. Analyze stock levels, reorder points, and usage patterns across all locations
2. Calculate reorder quantities and optimal stock levels using historical data
3. Monitor multi-location inventory transfers and identify redistribution opportunities
4. Detect and alert on low-stock situations before they impact operations
5. Flag inventory discrepancies for reconciliation and investigate root causes
6. Generate inventory forecasts based on seasonal trends and demand patterns
7. Log all inventory actions, alerts, and reconciliations to the audit trail
8. Notify procurement and operations teams of critical inventory events

When an inventory task comes in, review the current stock data, identify issues or optimization opportunities, and produce actionable recommendations with clear priorities.`,
  triggers: ["manual_trigger", "low_stock_alert", "inventory_audit", "scheduled_review"],
  supportedIndustries: ["manufacturing", "logistics", "healthcare", "construction", "financial-services", "energy", "retail", "legal", "insurance", "real-estate", "automotive", "aerospace", "pharmaceutical", "education", "hospitality", "agriculture", "telecommunications", "government", "nonprofit", "technology", "e-commerce", "media", "professional-services"],
};

registerAgentType(inventoryManagementConfig);
export default inventoryManagementConfig;