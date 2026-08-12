import { createPowerPointClient, type PresentationSlide } from "./client";
import type { ActionDefinition } from "../salesforce/actions";

/**
 * Microsoft PowerPoint — Actions.
 *
 * Typed action definitions for the Agent Runtime. Every action maps to a real
 * Microsoft Graph operation on the canonical graph.microsoft.com host.
 * Fail-closed: missing ids/names throw before any network call.
 */
export const microsoftPowerPointActions: ActionDefinition[] = [
  /* ── Understand (read) ── */
  {
    name: "readPowerPointPresentation",
    description: "Read a PowerPoint deck's slide text by OneDrive item id",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createPowerPointClient(config);
      return c.readPresentationText(params.id);
    },
  },
  {
    name: "listPowerPointPresentations",
    description: "List PowerPoint (.pptx) decks in the OneDrive root",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createPowerPointClient(config);
      return c.listPresentations();
    },
  },
  /* ── Automate (write) ── */
  {
    name: "createPowerPointPresentation",
    description: "Create a PowerPoint deck in OneDrive from an outline of slides",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        slides: { type: "array", items: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["title"] } },
      },
      required: ["name", "slides"],
    },
    handler: async (config, params) => {
      const c = createPowerPointClient(config);
      return c.createPresentation(params.name, params.slides as PresentationSlide[]);
    },
  },
  /* ── Health ── */
  {
    name: "microsoftPowerPointHealthCheck",
    description: "Check the Microsoft PowerPoint connection (token validity + drive access)",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createPowerPointClient(config);
      return { healthy: await c.healthCheck(), provider: "microsoft-powerpoint" };
    },
  },
];
