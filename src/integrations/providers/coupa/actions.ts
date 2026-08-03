import { createCoupaClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";

/**
 * Coupa Integration — Actions.
 *
 * Typed action definitions for the Agent Runtime. Each action maps to a
 * Coupa REST API operation on the canonical https://{instance}.coupahost.com/api host.
 */
export const coupaActions: ActionDefinition[] = [
  /* ── Understand (read) ── */
  {
    name: "listCoupaPurchaseOrders",
    description: "List Coupa purchase orders (optional query params)",
    inputSchema: { type: "object", properties: { params: { type: "object" } } },
    handler: async (config, params) => {
      const c = createCoupaClient(config);
      return c.listPurchaseOrders(params?.params as Record<string, unknown> | undefined);
    },
  },
  {
    name: "getCoupaPurchaseOrder",
    description: "Get a Coupa purchase order by ID",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createCoupaClient(config);
      return c.getPurchaseOrder(params.id);
    },
  },
  {
    name: "listCoupaSuppliers",
    description: "List Coupa suppliers",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createCoupaClient(config);
      return c.listSuppliers();
    },
  },
  {
    name: "listCoupaReceipts",
    description: "List Coupa receipts (optional query params)",
    inputSchema: { type: "object", properties: { params: { type: "object" } } },
    handler: async (config, params) => {
      const c = createCoupaClient(config);
      return c.listReceipts(params?.params as Record<string, unknown> | undefined);
    },
  },
  {
    name: "listCoupaInvoices",
    description: "List Coupa invoices (optional query params)",
    inputSchema: { type: "object", properties: { params: { type: "object" } } },
    handler: async (config, params) => {
      const c = createCoupaClient(config);
      return c.listInvoices(params?.params as Record<string, unknown> | undefined);
    },
  },
  {
    name: "listCoupaApprovals",
    description: "List Coupa approval chains",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createCoupaClient(config);
      return c.listApprovals();
    },
  },
  /* ── Monitor ── */
  {
    name: "listCoupaPurchaseOrdersChangedSince",
    description: "Monitor Coupa purchase orders updated since an ISO-8601 timestamp",
    inputSchema: { type: "object", properties: { from: { type: "string" } }, required: ["from"] },
    handler: async (config, params) => {
      const c = createCoupaClient(config);
      return c.listPurchaseOrdersChangedSince(params.from);
    },
  },
  /* ── Automate (write) ── */
  {
    name: "createCoupaPurchaseOrder",
    description: "Create a Coupa purchase order",
    inputSchema: {
      type: "object",
      properties: {
        data: { type: "object" },
      },
      required: ["data"],
    },
    handler: async (config, params) => {
      const c = createCoupaClient(config);
      return c.createPurchaseOrder(params.data);
    },
  },
  {
    name: "updateCoupaPurchaseOrder",
    description: "Update a Coupa purchase order",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, data: { type: "object" } },
      required: ["id", "data"],
    },
    handler: async (config, params) => {
      const c = createCoupaClient(config);
      return c.updatePurchaseOrder(params.id, params.data);
    },
  },
  /* ── Health Check ── */
  {
    name: "coupaHealthCheck",
    description: "Check Coupa connection",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createCoupaClient(config);
      return { healthy: await c.healthCheck(), provider: "coupa" };
    },
  },
];
