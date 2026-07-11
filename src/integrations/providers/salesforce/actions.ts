/**
 * Salesforce Integration — Actions
 *
 * Typed action definitions for the Agent Runtime.
 * Each action maps to a Salesforce API operation with typed inputs/outputs.
 */

import { createSalesforceClient } from "./client";
import { ConnectionConfig } from "../../framework/connection";

export interface ActionDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (config: ConnectionConfig, params: Record<string, any>) => Promise<any>;
}

// ── Contact Actions ──────────────────────────────────────────────────────────

export const searchContacts: ActionDefinition = {
  name: "searchSalesforceContacts",
  description: "Search Salesforce contacts by criteria (email, name, etc.)",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "SOQL WHERE clause fragment, e.g. \"Email LIKE '%@example.com%'\"" },
    },
    required: ["query"],
  },
  handler: async (config, params) => {
    const client = createSalesforceClient(config);
    return client.searchContacts(params.query);
  },
};

export const createContact: ActionDefinition = {
  name: "createSalesforceContact",
  description: "Create a new contact in Salesforce",
  inputSchema: {
    type: "object",
    properties: {
      FirstName: { type: "string" },
      LastName: { type: "string" },
      Email: { type: "string", format: "email" },
      Phone: { type: "string" },
      Title: { type: "string" },
      AccountId: { type: "string" },
    },
    required: ["LastName"],
  },
  handler: async (config, params) => {
    const client = createSalesforceClient(config);
    return client.createContact(params);
  },
};

export const getContact: ActionDefinition = {
  name: "getSalesforceContact",
  description: "Get a Salesforce contact by ID",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Salesforce Contact ID (e.g. 003...)" },
    },
    required: ["id"],
  },
  handler: async (config, params) => {
    const client = createSalesforceClient(config);
    return client.getContact(params.id);
  },
};

// ── Account Actions ──────────────────────────────────────────────────────────

export const searchAccounts: ActionDefinition = {
  name: "searchSalesforceAccounts",
  description: "Search Salesforce accounts by criteria (name, industry, etc.)",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "SOQL WHERE clause fragment" },
    },
    required: ["query"],
  },
  handler: async (config, params) => {
    const client = createSalesforceClient(config);
    return client.queryAll(`SELECT Id, Name, Type, Industry, Phone, Website, BillingCity, BillingState FROM Account WHERE ${params.query}`);
  },
};

export const createAccount: ActionDefinition = {
  name: "createSalesforceAccount",
  description: "Create a new account in Salesforce",
  inputSchema: {
    type: "object",
    properties: {
      Name: { type: "string" },
      Type: { type: "string" },
      Industry: { type: "string" },
      Phone: { type: "string" },
      Website: { type: "string" },
    },
    required: ["Name"],
  },
  handler: async (config, params) => {
    const client = createSalesforceClient(config);
    return client.createAccount(params);
  },
};

// ── Lead Actions ─────────────────────────────────────────────────────────────

export const searchLeads: ActionDefinition = {
  name: "searchSalesforceLeads",
  description: "Search Salesforce leads by criteria",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "SOQL WHERE clause fragment" },
    },
    required: ["query"],
  },
  handler: async (config, params) => {
    const client = createSalesforceClient(config);
    return client.queryAll(`SELECT Id, FirstName, LastName, Company, Email, Phone, Status, Title FROM Lead WHERE ${params.query}`);
  },
};

export const createLead: ActionDefinition = {
  name: "createSalesforceLead",
  description: "Create a new lead in Salesforce",
  inputSchema: {
    type: "object",
    properties: {
      FirstName: { type: "string" },
      LastName: { type: "string" },
      Company: { type: "string" },
      Email: { type: "string" },
      Phone: { type: "string" },
      Title: { type: "string" },
      Status: { type: "string" },
    },
    required: ["LastName", "Company"],
  },
  handler: async (config, params) => {
    const client = createSalesforceClient(config);
    return client.createLead(params);
  },
};

// ── Opportunity Actions ──────────────────────────────────────────────────────

export const getPipelineStages: ActionDefinition = {
  name: "getSalesforcePipelineStages",
  description: "Get all opportunity pipeline stages from Salesforce",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async (config, _params) => {
    const client = createSalesforceClient(config);
    return client.query<{ Id: string; MasterLabel: string; DefaultProbability: number; IsActive: boolean }>(
      "SELECT Id, MasterLabel, DefaultProbability, IsActive FROM OpportunityStage ORDER BY SortOrder",
    );
  },
};

export const searchOpportunities: ActionDefinition = {
  name: "searchSalesforceOpportunities",
  description: "Search Salesforce opportunities by criteria",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "SOQL WHERE clause fragment" },
    },
    required: ["query"],
  },
  handler: async (config, params) => {
    const client = createSalesforceClient(config);
    return client.queryAll(`SELECT Id, Name, StageName, CloseDate, Amount, Probability, Type, LeadSource FROM Opportunity WHERE ${params.query}`);
  },
};

export const createOpportunity: ActionDefinition = {
  name: "createSalesforceOpportunity",
  description: "Create a new opportunity in Salesforce",
  inputSchema: {
    type: "object",
    properties: {
      Name: { type: "string" },
      StageName: { type: "string" },
      CloseDate: { type: "string", format: "date" },
      Amount: { type: "number" },
      AccountId: { type: "string" },
    },
    required: ["Name", "StageName", "CloseDate"],
  },
  handler: async (config, params) => {
    const client = createSalesforceClient(config);
    return client.createOpportunity(params);
  },
};

// ── Task Actions ─────────────────────────────────────────────────────────────

export const createTask: ActionDefinition = {
  name: "createSalesforceTask",
  description: "Create a task in Salesforce",
  inputSchema: {
    type: "object",
    properties: {
      Subject: { type: "string" },
      Status: { type: "string", enum: ["Not Started", "In Progress", "Completed", "Deferred"] },
      Priority: { type: "string", enum: ["High", "Normal", "Low"] },
      Description: { type: "string" },
      ActivityDate: { type: "string", format: "date" },
      WhoId: { type: "string", description: "Contact or Lead ID" },
      WhatId: { type: "string", description: "Account or Opportunity ID" },
    },
    required: ["Subject"],
  },
  handler: async (config, params) => {
    const client = createSalesforceClient(config);
    return client.createTask(params);
  },
};

// ── Health Check ─────────────────────────────────────────────────────────────

export const healthCheck: ActionDefinition = {
  name: "salesforceHealthCheck",
  description: "Check if the Salesforce connection is healthy",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async (config) => {
    const client = createSalesforceClient(config);
    const healthy = await client.healthCheck();
    return { healthy, provider: "salesforce" };
  },
};

// ── All Actions Export ───────────────────────────────────────────────────────

export const salesforceActions: ActionDefinition[] = [
  searchContacts,
  createContact,
  getContact,
  searchAccounts,
  createAccount,
  searchLeads,
  createLead,
  getPipelineStages,
  searchOpportunities,
  createOpportunity,
  createTask,
  healthCheck,
];