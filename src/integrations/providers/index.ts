/**
 * Integration Providers — Main Export
 *
 * Re-exports all provider modules and registers them with
 * the integration framework registry.
 */

import { registry, type ProviderMetadata } from "../framework/registry";

// ── Provider Metadata Registry ────────────────────────────────────────────────

function registerProvider(module: {
  PROVIDER_ID: string;
  PROVIDER_NAME: string;
  PROVIDER_CATEGORY: string;
  salesforceActions?: any[];
  hubSpotActions?: any[];
  dynamicsActions?: any[];
  zohoActions?: any[];
  pipedriveActions?: any[];
  copperActions?: any[];
  freshsalesActions?: any[];
  mondayActions?: any[];
  sugarActions?: any[];
  creatioActions?: any[];
  [key: string]: any;
}) {
  // Get actions from the module
  const actionKeys = [
    "salesforceActions", "hubSpotActions", "dynamicsActions",
    "zohoActions", "pipedriveActions", "copperActions",
    "freshsalesActions", "mondayActions", "sugarActions", "creatioActions",
  ];

  const actions: any[] = [];
  for (const key of actionKeys) {
    const actionList = (module as any)[key];
    if (Array.isArray(actionList)) {
      actions.push(...actionList);
    }
  }

  const metadata: ProviderMetadata = {
    id: module.PROVIDER_ID,
    name: module.PROVIDER_NAME,
    description: `${module.PROVIDER_NAME} CRM integration for Simpler Life 100`,
    category: module.PROVIDER_CATEGORY as any,
    authType: "oauth2",
    docsUrl: `https://developers.${module.PROVIDER_ID}.com`,
    actions: actions.map((a) => ({
      name: a.name,
      description: a.description,
      inputSchema: a.inputSchema,
    })),
    triggers: [],
    configSchema: {},
    status: "active",
  };

  registry.register(metadata);
}

// ── Register All Providers ────────────────────────────────────────────────────

import * as salesforce from "./salesforce";
import * as hubspot from "./hubspot";
import * as dynamics365 from "./dynamics-365";
import * as zoho from "./zoho-crm";
import * as pipedrive from "./pipedrive";
import * as copper from "./copper";
import * as freshsales from "./freshsales";
import * as monday from "./monday-crm";
import * as sugarcrm from "./sugarcrm";
import * as creatio from "./creatio";

// Register each provider with its actions
const providerModules = [
  { ...salesforce, salesforceActions: salesforce.salesforceActions },
  { ...hubspot, hubSpotActions: hubspot.hubSpotActions },
  { ...dynamics365, dynamicsActions: dynamics365.dynamicsActions },
  { ...zoho, zohoActions: zoho.zohoActions },
  { ...pipedrive, pipedriveActions: pipedrive.pipedriveActions },
  { ...copper, copperActions: copper.copperActions },
  { ...freshsales, freshsalesActions: freshsales.freshsalesActions },
  { ...monday, mondayActions: monday.mondayActions },
  { ...sugarcrm, sugarActions: sugarcrm.sugarActions },
  { ...creatio, creatioActions: creatio.creatioActions },
];

for (const mod of providerModules) {
  registerProvider(mod);
}

// ── Re-export all providers ───────────────────────────────────────────────────

export { registry };
export * from "./salesforce";
export * from "./hubspot";
export * from "./dynamics-365";
export * from "./zoho-crm";
export * from "./pipedrive";
export * from "./copper";
export * from "./freshsales";
export * from "./monday-crm";
export * from "./sugarcrm";
export * from "./creatio";