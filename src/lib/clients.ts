/**
 * clients.ts — the CLIENT + PROJECT spine (slice 189).
 *
 * THE GAP THIS FILLS. The plan's honest-gap line: "no client record and no
 * project record — 50 routes, and the customer entity everything should hang
 * off does not exist." Every quote, invoice, checklist and deal room in this
 * product is about a customer that the product could not name, so a
 * quote-to-cash loop had nothing to loop over. This module is the record shape
 * and the input contract for the two entities, and nothing else: it is
 * deliberately PURE (no fetch, no fs, no React) because it is imported by the
 * server (which stores the rows) and by the portal pages (which render them).
 * Anything with a runtime dependency in here would end up in the browser
 * bundle; anything with a policy in here would be a second source of truth.
 *
 * WHAT IS DELIBERATELY NOT HERE: no wiring to invoices, proposals, checklists
 * or deal rooms. This slice makes the spine exist, be honest and be reachable.
 * Linking the money path to it is the next slice and needs its own brief — a
 * half-wired invoice is worse than an unwired one.
 *
 * The field set is the minimum that is genuinely useful, not a CRM schema:
 * a client has a display name, a contact (name / email / phone), a status and
 * the two timestamps; a project has a name, the client it belongs to, a status
 * and the two timestamps. Nothing is invented, so nothing here can go stale
 * against a store that has never held a row.
 */

export type ClientStatus = "active" | "paused" | "archived";
export type ProjectStatus = "planned" | "active" | "on_hold" | "complete";

/**
 * The allowed values — the ONE list the server validates against and the pages
 * build their pickers from, so a picker can never offer a value the server
 * rejects.
 */
export const CLIENT_STATUSES: readonly ClientStatus[] = ["active", "paused", "archived"];
export const PROJECT_STATUSES: readonly ProjectStatus[] = ["planned", "active", "on_hold", "complete"];

export const MAX_NAME_LENGTH = 200;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_PHONE_LENGTH = 40;
export const MAX_ID_LENGTH = 80;

/** A customer record. `id` is stable for the life of the row. */
export interface Client {
  id: string;
  /** Display name — the only required field. */
  name: string;
  /** The person we talk to, if a name is known. */
  contactName: string;
  email: string;
  phone: string;
  status: ClientStatus;
  /** ISO-8601, set by the server. */
  createdAt: string;
  updatedAt: string;
}

/** A piece of work for one client. A client owns zero or more of these. */
export interface Project {
  id: string;
  /** The client this project belongs to. Must exist in the same tenant. */
  clientId: string;
  name: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

/** The validated input a POST carries — never the raw body. */
export interface ClientInput {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  status: ClientStatus;
}

export interface ProjectInput {
  clientId: string;
  name: string;
  status: ProjectStatus;
}

export type ParseResult<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

/**
 * Coerce one body field to a bounded, trimmed string. A non-string is empty,
 * not "[object Object]": a page must never render a JSON blob as a name.
 */
export function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Loose on purpose: the shape of an address, not a deliverability claim. */
export function isEmailish(value: string): boolean {
  if (value.length > MAX_EMAIL_LENGTH) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function pick<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * Validate a client POST body. Returns the value to store, or a sentence the
 * page can show the person who submitted it. Never throws, never guesses: an
 * unknown status is rejected rather than defaulted, because silently writing
 * "active" over a typo would make the record lie.
 */
export function parseClientInput(raw: unknown): ParseResult<ClientInput> {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const name = text(body.name, MAX_NAME_LENGTH);
  if (!name) return { error: "A client name is required." };

  const email = text(body.email, MAX_EMAIL_LENGTH);
  if (email && !isEmailish(email)) return { error: "That email address does not look like an address." };

  let status: ClientStatus = "active";
  if (body.status !== undefined && body.status !== null && body.status !== "") {
    const picked = pick(CLIENT_STATUSES, body.status);
    if (!picked) return { error: `A client status must be one of: ${CLIENT_STATUSES.join(", ")}.` };
    status = picked;
  }

  return {
    value: {
      name,
      contactName: text(body.contactName, MAX_NAME_LENGTH),
      email,
      phone: text(body.phone, MAX_PHONE_LENGTH),
      status,
    },
  };
}

/**
 * Validate a project POST body. The clientId is only SHAPE-checked here —
 * whether that client exists in this tenant is a store question, and the
 * server answers it against the tenant's own rows before writing. A project
 * against a client id that does not exist would be an orphan, which is exactly
 * the defect this spine exists to prevent.
 */
export function parseProjectInput(raw: unknown): ParseResult<ProjectInput> {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const name = text(body.name, MAX_NAME_LENGTH);
  if (!name) return { error: "A project name is required." };

  const clientId = text(body.clientId, MAX_ID_LENGTH);
  if (!clientId) return { error: "A project must belong to a client." };

  let status: ProjectStatus = "planned";
  if (body.status !== undefined && body.status !== null && body.status !== "") {
    const picked = pick(PROJECT_STATUSES, body.status);
    if (!picked) return { error: `A project status must be one of: ${PROJECT_STATUSES.join(", ")}.` };
    status = picked;
  }

  return { value: { clientId, name, status } };
}

/** A label per status value. Display only — nothing is inferred from it. */
export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Planned",
  active: "Active",
  on_hold: "On hold",
  complete: "Complete",
};
