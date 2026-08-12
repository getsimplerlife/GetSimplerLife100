import { createGSlidesClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";

/**
 * Google Slides — Actions.
 *
 * Typed action definitions for the Agent Runtime. Every action maps to a real
 * Slides API operation on the canonical slides.googleapis.com host. Fail-closed:
 * missing titles/presentation ids throw before any network call.
 */
export const googleSlidesActions: ActionDefinition[] = [
  /* ── Understand (read) ── */
  {
    name: "getGoogleSlides",
    description: "Fetch a Google Slides presentation resource by presentation id",
    inputSchema: { type: "object", properties: { presentationId: { type: "string" } }, required: ["presentationId"] },
    handler: async (config, params) => {
      const c = createGSlidesClient(config);
      return c.getPresentation(params.presentationId);
    },
  },
  /* ── Automate (write) ── */
  {
    name: "createGoogleSlides",
    description: "Create a new Google Slides presentation with a title",
    inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
    handler: async (config, params) => {
      const c = createGSlidesClient(config);
      return c.createPresentation(params.title);
    },
  },
  {
    name: "createGoogleSlidesFromOutline",
    description: "Create a Google Slides presentation from an outline [{title, body?}, ...]",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        slides: {
          type: "array",
          items: {
            type: "object",
            properties: { title: { type: "string" }, body: { type: "string" } },
            required: ["title"],
          },
        },
      },
      required: ["title", "slides"],
    },
    handler: async (config, params) => {
      const c = createGSlidesClient(config);
      return c.createPresentationFromOutline(params.title, params.slides);
    },
  },
  {
    name: "addGoogleSlides",
    description: "Add N slides to an existing Google Slides presentation",
    inputSchema: {
      type: "object",
      properties: { presentationId: { type: "string" }, count: { type: "number" } },
      required: ["presentationId", "count"],
    },
    handler: async (config, params) => {
      const c = createGSlidesClient(config);
      return c.addSlides(params.presentationId, params.count);
    },
  },
  {
    name: "insertGoogleSlidesText",
    description: "Insert text into a shape/page element of a Google Slides presentation",
    inputSchema: {
      type: "object",
      properties: { presentationId: { type: "string" }, objectId: { type: "string" }, text: { type: "string" } },
      required: ["presentationId", "objectId", "text"],
    },
    handler: async (config, params) => {
      const c = createGSlidesClient(config);
      return c.insertText(params.presentationId, params.objectId, params.text);
    },
  },
  /* ── Health ── */
  {
    name: "googleSlidesHealthCheck",
    description: "Check the Google Slides connection (token validity)",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createGSlidesClient(config);
      return { healthy: await c.healthCheck(), provider: "google-slides" };
    },
  },
];
