import { createGCalendarClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";

/**
 * Google Calendar — Actions.
 *
 * Typed action definitions for the Agent Runtime. Every action maps to a real
 * Calendar API v3 operation on the canonical www.googleapis.com/calendar/v3
 * host. Fail-closed: missing ids/summary/datetimes throw before any network
 * call. Tenant-scoped: actions execute with the tenant's own OAuth token.
 */
export const googleCalendarActions: ActionDefinition[] = [
  /* ── Understand (read) ── */
  {
    name: "listGoogleCalendars",
    description: "List the calendars available to the connected Google Calendar account",
    inputSchema: { type: "object", properties: { maxResults: { type: "number" } } },
    handler: async (config, params) => {
      const c = createGCalendarClient(config);
      return c.listCalendars(params?.maxResults || 50);
    },
  },
  {
    name: "listGoogleCalendarEvents",
    description: "List upcoming events from a Google Calendar (default: primary), optionally filtered by time window",
    inputSchema: {
      type: "object",
      properties: {
        calendarId: { type: "string" },
        timeMin: { type: "string" },
        timeMax: { type: "string" },
        maxResults: { type: "number" },
      },
    },
    handler: async (config, params) => {
      const c = createGCalendarClient(config);
      return c.listEvents(params?.calendarId || "primary", params?.timeMin, params?.timeMax, params?.maxResults || 50);
    },
  },
  {
    name: "getGoogleCalendarEvent",
    description: "Fetch a single Google Calendar event by id",
    inputSchema: {
      type: "object",
      properties: { calendarId: { type: "string" }, eventId: { type: "string" } },
      required: ["eventId"],
    },
    handler: async (config, params) => {
      const c = createGCalendarClient(config);
      return c.getEvent(params?.calendarId || "primary", params.eventId);
    },
  },
  /* ── Automate (write) ── */
  {
    name: "createGoogleCalendarEvent",
    description: "Create an event in a Google Calendar (default: primary) with summary, start and end datetimes",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
        description: { type: "string" },
        location: { type: "string" },
        calendarId: { type: "string" },
      },
      required: ["summary", "start", "end"],
    },
    handler: async (config, params) => {
      const c = createGCalendarClient(config);
      return c.createEvent({
        summary: params.summary,
        start: params.start,
        end: params.end,
        description: params.description,
        location: params.location,
        calendarId: params.calendarId,
      });
    },
  },
  /* ── Health ── */
  {
    name: "googleCalendarHealthCheck",
    description: "Check the Google Calendar connection (token validity + calendarList access)",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createGCalendarClient(config);
      return { healthy: await c.healthCheck(), provider: "google-calendar" };
    },
  },
];
