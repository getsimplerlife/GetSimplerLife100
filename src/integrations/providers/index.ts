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
  [key: string]: any;
}) {
  const actionKeys = [
    "salesforceActions", "hubSpotActions", "dynamicsActions",
    "zohoActions", "pipedriveActions", "copperActions",
    "freshsalesActions", "mondayActions", "sugarActions", "creatioActions",
    "netSuiteActions", "sapS4Actions", "b1Actions",
    "bcActions", "foActions", "oracleERPActions",
    "acumaticaActions", "epicorActions", "kineticActions",
    "inforActions", "intacctActions", "sageX3Actions",
    "odooActions", "qbeActions", "qboActions",
    "qbdActions", "xeroActions", "freshBooksActions",
    "waveActions", "sage50Actions", "billActions",
    "expensifyActions", "rampActions", "brexActions",
    "outlookActions", "exchangeActions", "gmailActions",
    "gwsActions", "imapActions", "smtpActions",
    "teamsActions", "slackActions", "zoomActions",
    "ringCentralActions", "webexActions", "discordActions",
    "twilioActions", "dialpadActions", "aircallActions",
    // Storage
    "sharepointActions", "onedriveActions", "gdriveActions",
    "dropboxActions", "boxActions", "egnyteActions",
    // Document Processing
    "adobeSignActions", "docusignActions", "pandadocActions",
    "dropboxSignActions", "pdfCoActions", "ocrSpaceActions",
    "abbyyActions", "textractActions", "azureDocIntelActions",
    "googleDocAIActions",
    // Project Management
    "mondayComActions", "asanaActions", "clickUpActions",
    "jiraActions", "trelloActions", "basecampActions",
    "notionActions", "wrikeActions", "smartsheetActions",
    // HR
    "bamboohrActions", "workdayActions", "ukgActions",
    "adpActions", "gustoActions", "ripplingActions",
    "paychexActions", "greenhouseActions", "leverActions",
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
    description: `${module.PROVIDER_NAME} integration for Simpler Life 100`,
    category: module.PROVIDER_CATEGORY as any,
    authType: "oauth2",
    docsUrl: `https://developers.${module.PROVIDER_ID}.com`,
    actions: actions.map((a: any) => ({
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

// ── CRM Imports ──────────────────────────────────────────────────────────────

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

// ── ERP Imports ──────────────────────────────────────────────────────────────

import * as netsuite from "./netsuite";
import * as saps4hana from "./sap-s4hana";
import * as sapb1 from "./sap-business-one";
import * as dynbc from "./dynamics-365-bc";
import * as dynfo from "./dynamics-365-fo";
import * as oracle from "./oracle-erp-cloud";
import * as acumatica from "./acumatica";
import * as epicor from "./epicor";
import * as kinetic from "./epicor-kinetic";
import * as infor from "./infor-cloudsuite";
import * as sageIntacct from "./sage-intacct";
import * as sageX3 from "./sage-x3";
import * as odoo from "./odoo";
import * as qbe from "./quickbooks-enterprise";

// ── Accounting Imports ───────────────────────────────────────────────────────

import * as qbo from "./quickbooks-online";
import * as qbd from "./quickbooks-desktop";
import * as xero from "./xero";
import * as freshbooks from "./freshbooks";
import * as wave from "./wave";
import * as sage50 from "./sage-50";
import * as bill from "./bill";
import * as expensify from "./expensify";
import * as ramp from "./ramp";
import * as brex from "./brex";

// ── Email Imports ────────────────────────────────────────────────────────────

import * as outlook from "./outlook";
import * as exchange from "./exchange";
import * as gmail from "./gmail";
import * as gws from "./google-workspace";
import * as imap from "./imap";
import * as smtp from "./smtp";

// ── Communication Imports ────────────────────────────────────────────────────

import * as teams from "./teams";
import * as slack from "./slack";
import * as zoom from "./zoom";
import * as ringcentral from "./ringcentral";
import * as webex from "./webex";
import * as discord from "./discord";
import * as twilio from "./twilio";
import * as dialpad from "./dialpad";
import * as aircall from "./aircall";

// ── Storage Imports ──────────────────────────────────────────────────────────

import * as sharepoint from "./sharepoint";
import * as onedrive from "./onedrive";
import * as gdrive from "./google-drive";
import * as dropbox from "./dropbox";
import * as box from "./box";
import * as egnyte from "./egnyte";

// ── Document Processing Imports ───────────────────────────────────────────────

import * as adobeSign from "./adobe-sign";
import * as docusign from "./docusign";
import * as pandadoc from "./pandadoc";
import * as dropboxSign from "./dropbox-sign";
import * as pdfCo from "./pdf-co";
import * as ocrSpace from "./ocr-space";
import * as abbyy from "./abbyy";
import * as textract from "./aws-textract";
import * as azureDocIntel from "./azure-doc-intel";
import * as googleDocAI from "./google-doc-ai";

// ── Project Management Imports ────────────────────────────────────────────────

import * as mondayCom from "./monday-com";
import * as asana from "./asana";
import * as clickup from "./clickup";
import * as jira from "./jira";
import * as trello from "./trello";
import * as basecamp from "./basecamp";
import * as notion from "./notion";
import * as wrike from "./wrike";
import * as smartsheet from "./smartsheet";

// ── HR Imports ────────────────────────────────────────────────────────────────

import * as bamboohr from "./bamboohr";
import * as workday from "./workday";
import * as ukg from "./ukg";
import * as adp from "./adp";
import * as gusto from "./gusto";
import * as rippling from "./rippling";
import * as paychex from "./paychex";
import * as greenhouse from "./greenhouse";
import * as lever from "./lever";

// ── Register All Providers ────────────────────────────────────────────────────

const providerModules = [
  // CRM
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
  // ERP
  { ...netsuite, netSuiteActions: netsuite.netSuiteActions },
  { ...saps4hana, sapS4Actions: saps4hana.sapS4Actions },
  { ...sapb1, b1Actions: sapb1.b1Actions },
  { ...dynbc, bcActions: dynbc.bcActions },
  { ...dynfo, foActions: dynfo.foActions },
  { ...oracle, oracleERPActions: oracle.oracleERPActions },
  { ...acumatica, acumaticaActions: acumatica.acumaticaActions },
  { ...epicor, epicorActions: epicor.epicorActions },
  { ...kinetic, kineticActions: kinetic.kineticActions },
  { ...infor, inforActions: infor.inforActions },
  { ...sageIntacct, intacctActions: sageIntacct.intacctActions },
  { ...sageX3, sageX3Actions: sageX3.sageX3Actions },
  { ...odoo, odooActions: odoo.odooActions },
  { ...qbe, qbeActions: qbe.qbeActions },
  // Accounting
  { ...qbo, qboActions: qbo.qboActions },
  { ...qbd, qbdActions: qbd.qbdActions },
  { ...xero, xeroActions: xero.xeroActions },
  { ...freshbooks, freshBooksActions: freshbooks.freshBooksActions },
  { ...wave, waveActions: wave.waveActions },
  { ...sage50, sage50Actions: sage50.sage50Actions },
  { ...bill, billActions: bill.billActions },
  { ...expensify, expensifyActions: expensify.expensifyActions },
  { ...ramp, rampActions: ramp.rampActions },
  { ...brex, brexActions: brex.brexActions },
  // Email
  { ...outlook, outlookActions: outlook.outlookActions },
  { ...exchange, exchangeActions: exchange.exchangeActions },
  { ...gmail, gmailActions: gmail.gmailActions },
  { ...gws, gwsActions: gws.gwsActions },
  { ...imap, imapActions: imap.imapActions },
  { ...smtp, smtpActions: smtp.smtpActions },
  // Communication
  { ...teams, teamsActions: teams.teamsActions },
  { ...slack, slackActions: slack.slackActions },
  { ...zoom, zoomActions: zoom.zoomActions },
  { ...ringcentral, ringCentralActions: ringcentral.ringCentralActions },
  { ...webex, webexActions: webex.webexActions },
  { ...discord, discordActions: discord.discordActions },
  { ...twilio, twilioActions: twilio.twilioActions },
  { ...dialpad, dialpadActions: dialpad.dialpadActions },
  { ...aircall, aircallActions: aircall.aircallActions },
  // Storage
  { ...sharepoint, sharepointActions: sharepoint.sharepointActions },
  { ...onedrive, onedriveActions: onedrive.onedriveActions },
  { ...gdrive, gdriveActions: gdrive.gdriveActions },
  { ...dropbox, dropboxActions: dropbox.dropboxActions },
  { ...box, boxActions: box.boxActions },
  { ...egnyte, egnyteActions: egnyte.egnyteActions },
  // Document Processing
  { ...adobeSign, adobeSignActions: adobeSign.adobeSignActions },
  { ...docusign, docusignActions: docusign.docusignActions },
  { ...pandadoc, pandadocActions: pandadoc.pandadocActions },
  { ...dropboxSign, dropboxSignActions: dropboxSign.dropboxSignActions },
  { ...pdfCo, pdfCoActions: pdfCo.pdfCoActions },
  { ...ocrSpace, ocrSpaceActions: ocrSpace.ocrSpaceActions },
  { ...abbyy, abbyyActions: abbyy.abbyyActions },
  { ...textract, textractActions: textract.textractActions },
  { ...azureDocIntel, azureDocIntelActions: azureDocIntel.azureDocIntelActions },
  { ...googleDocAI, googleDocAIActions: googleDocAI.googleDocAIActions },
  // Project Management
  { ...mondayCom, mondayComActions: mondayCom.mondayComActions },
  { ...asana, asanaActions: asana.asanaActions },
  { ...clickup, clickUpActions: clickup.clickUpActions },
  { ...jira, jiraActions: jira.jiraActions },
  { ...trello, trelloActions: trello.trelloActions },
  { ...basecamp, basecampActions: basecamp.basecampActions },
  { ...notion, notionActions: notion.notionActions },
  { ...wrike, wrikeActions: wrike.wrikeActions },
  { ...smartsheet, smartsheetActions: smartsheet.smartsheetActions },
  // HR
  { ...bamboohr, bamboohrActions: bamboohr.bamboohrActions },
  { ...workday, workdayActions: workday.workdayActions },
  { ...ukg, ukgActions: ukg.ukgActions },
  { ...adp, adpActions: adp.adpActions },
  { ...gusto, gustoActions: gusto.gustoActions },
  { ...rippling, ripplingActions: rippling.ripplingActions },
  { ...paychex, paychexActions: paychex.paychexActions },
  { ...greenhouse, greenhouseActions: greenhouse.greenhouseActions },
  { ...lever, leverActions: lever.leverActions },
];

for (const mod of providerModules) {
  registerProvider(mod);
}

// ── Re-export all providers ───────────────────────────────────────────────────

export { registry };
// CRM
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
// ERP
export * from "./netsuite";
export * from "./sap-s4hana";
export * from "./sap-business-one";
export * from "./dynamics-365-bc";
export * from "./dynamics-365-fo";
export * from "./oracle-erp-cloud";
export * from "./acumatica";
export * from "./epicor";
export * from "./epicor-kinetic";
export * from "./infor-cloudsuite";
export * from "./sage-intacct";
export * from "./sage-x3";
export * from "./odoo";
export * from "./quickbooks-enterprise";
// Accounting
export * from "./quickbooks-online";
export * from "./quickbooks-desktop";
export * from "./xero";
export * from "./freshbooks";
export * from "./wave";
export * from "./sage-50";
export * from "./bill";
export * from "./expensify";
export * from "./ramp";
export * from "./brex";
// Email
export * from "./outlook";
export * from "./exchange";
export * from "./gmail";
export * from "./google-workspace";
export * from "./imap";
export * from "./smtp";
// Communication
export * from "./teams";
export * from "./slack";
export * from "./zoom";
export * from "./ringcentral";
export * from "./webex";
export * from "./discord";
export * from "./twilio";
export * from "./dialpad";
export * from "./aircall";
// Storage
export * from "./sharepoint";
export * from "./onedrive";
export * from "./google-drive";
export * from "./dropbox";
export * from "./box";
export * from "./egnyte";
// Document Processing
export * from "./adobe-sign";
export * from "./docusign";
export * from "./pandadoc";
export * from "./dropbox-sign";
export * from "./pdf-co";
export * from "./ocr-space";
export * from "./abbyy";
export * from "./aws-textract";
export * from "./azure-doc-intel";
export * from "./google-doc-ai";
// Project Management
export * from "./monday-com";
export * from "./asana";
export * from "./clickup";
export * from "./jira";
export * from "./trello";
export * from "./basecamp";
export * from "./notion";
export * from "./wrike";
export * from "./smartsheet";
// HR
export * from "./bamboohr";
export * from "./workday";
export * from "./ukg";
export * from "./adp";
export * from "./gusto";
export * from "./rippling";
export * from "./paychex";
export * from "./greenhouse";
export * from "./lever";