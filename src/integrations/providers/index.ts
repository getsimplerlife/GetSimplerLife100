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
    // Customer Support
    "zendeskActions", "freshdeskActions", "intercomActions",
    "helpScoutActions", "servicenowActions", "serviceCloudActions",
    // BI
    "powerBIActions", "tableauActions", "lookerActions",
    "metabaseActions", "qlikSenseActions", "sigmaActions",
    // ECommerce
    "shopifyActions", "wooCommerceActions", "bigCommerceActions",
    "magentoActions", "amazonSellerActions",
    // Logistics
    "mcleodSoftwareActions", "mercurygateActions", "trimbleTmsActions",
    "samsaraActions", "motiveActions", "project44Actions",
    "fourkitesActions", "datActions", "truckstopActions",
    "descartesActions", "pcsTmsActions", "ascendTmsActions",
    // Manufacturing
    "plexActions", "katanaActions", "fishbowlActions",
    "mrpeasyActions", "iqmsActions", "epicorKineticMfgActions",
    "siemensOpcenterActions",
    // Healthcare
    "athenahealthActions", "nextgenActions", "eclinicalworksActions",
    // Scheduling
    "calendlyActions", "microsoftBookingsActions", "googleCalendarActions",
    "outlookCalendarActions", "acuityActions",
    // Forms
    "typeformActions", "jotformActions", "microsoftFormsActions",
    "googleFormsActions", "formstackActions", "gravityFormsActions",
    // Payment
    "squareActions", "paypalActions", "authorizeNetActions",
    "braintreeActions",
    // AI Models
    "openaiActions", "anthropicClaudeActions", "googleGeminiActions",
    "azureOpenaiActions", "awsBedrockActions", "mistralActions",
    "cohereActions",
    // Automation
    "n8nActions", "makeActions", "zapierActions", "powerAutomateActions",
    "uipathActions", "workatoActions", "trayIoActions", "boomiActions",
    // Identity
    "entraIdActions", "oktaActions", "auth0Actions",
    "googleWorkspaceIdentityActions",
    // Storage
    "s3Actions", "azureBlobActions", "gcsActions",
    // Developer Tools
    "restApiActions", "graphqlActions", "webhooksBroadActions",
    "sftpActions", "soapActions", "jsonActions", "xmlActions",
    // Databases
    "sqlServerActions", "postgresqlActions", "mysqlActions",
    "oracleDbActions", "mongodbActions", "snowflakeActions",
    "bigqueryActions", "azureSqlActions", "airtableActions",
            // New Integrations
            "clickhouseActions", "awsLambdaActions", "airflowActions",
            "iguanaActions", "mirthActions",
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

// ── Customer Support Imports ───────────────────────────────────────────────────
import * as zendesk from "./zendesk";
import * as freshdesk from "./freshdesk";
import * as intercom from "./intercom";
import * as helpScout from "./help-scout";
import * as servicenow from "./servicenow";
import * as serviceCloud from "./salesforce-service-cloud";
// ── BI Imports ─────────────────────────────────────────────────────────────────
import * as powerBI from "./power-bi";
import * as tableau from "./tableau";
import * as looker from "./looker";
import * as metabase from "./metabase";
import * as qlikSense from "./qlik-sense";
import * as sigma from "./sigma";
// ── ECommerce Imports ──────────────────────────────────────────────────────────
import * as shopify from "./shopify";
import * as woocommerce from "./woocommerce";
import * as bigcommerce from "./bigcommerce";
import * as magento from "./magento";
import * as amazonSeller from "./amazon-seller";
// ── Logistics Imports ──────────────────────────────────────────────────────────
import * as mcleodSoftware from "./mcleod-software";
import * as mercurygate from "./mercurygate";
import * as trimbleTms from "./trimble-tms";
import * as samsara from "./samsara";
import * as motive from "./motive";
import * as project44 from "./project44";
import * as fourkites from "./fourkites";
import * as dat from "./dat";
import * as truckstop from "./truckstop";
import * as descartes from "./descartes";
import * as pcsTms from "./pcs-tms";
import * as ascendTms from "./ascend-tms";
// ── Manufacturing Imports ──────────────────────────────────────────────────────
import * as plex from "./plex";
import * as katana from "./katana";
import * as fishbowl from "./fishbowl";
import * as mrpeasy from "./mrpeasy";
import * as iqms from "./iqms";
import * as epicorKineticMfg from "./epicor-kinetic-mfg";
import * as siemensOpcenter from "./siemens-opcenter";
// ── Healthcare Imports ─────────────────────────────────────────────────────────
import * as athenahealth from "./athenahealth";
import * as nextgen from "./nextgen";
import * as eclinicalworks from "./eclinicalworks";
// ── Scheduling Imports ─────────────────────────────────────────────────────────
import * as calendly from "./calendly";
import * as microsoftBookings from "./microsoft-bookings";
import * as googleCalendar from "./google-calendar";
import * as outlookCalendar from "./outlook-calendar";
import * as acuity from "./acuity";
// ── Forms Imports ──────────────────────────────────────────────────────────────
import * as typeform from "./typeform";
import * as jotform from "./jotform";
import * as microsoftForms from "./microsoft-forms";
import * as googleForms from "./google-forms";
import * as formstack from "./formstack";
import * as gravityForms from "./gravity-forms";
// ── Payment Imports ────────────────────────────────────────────────────────────
import * as square from "./square";
import * as paypal from "./paypal";
import * as authorizeNet from "./authorize-net";
import * as braintree from "./braintree";
// ── AI Models Imports ──────────────────────────────────────────────────────────
import * as openai from "./openai";
import * as anthropicClaude from "./anthropic-claude";
import * as googleGemini from "./google-gemini";
import * as azureOpenai from "./azure-openai";
import * as awsBedrock from "./aws-bedrock";
import * as mistral from "./mistral";
import * as cohere from "./cohere";
// ── Automation Imports ─────────────────────────────────────────────────────────
import * as n8n from "./n8n";
import * as make from "./make";
import * as zapier from "./zapier";
import * as powerAutomate from "./power-automate";
import * as uipath from "./uipath";
import * as workato from "./workato";
import * as trayIo from "./tray-io";
import * as boomi from "./boomi";
// ── Identity Imports ───────────────────────────────────────────────────────────
import * as entraId from "./entra-id";
import * as okta from "./okta";
import * as auth0 from "./auth0";
import * as googleWorkspaceIdentity from "./google-workspace-identity";
// ── Storage (Cloud) Imports ────────────────────────────────────────────────────
import * as s3 from "./s3";
import * as azureBlob from "./azure-blob";
import * as gcs from "./gcs";
// ── Developer Tools Imports ────────────────────────────────────────────────────
import * as restApi from "./rest-api";
import * as graphql from "./graphql";
import * as webhooksBroad from "./webhooks-broad";
import * as sftp from "./sftp";
import * as soap from "./soap";
import * as json from "./json";
import * as xml from "./xml";
// ── Database Imports ───────────────────────────────────────────────────────────
import * as sqlServer from "./sql-server";
import * as postgresql from "./postgresql";
import * as mysql from "./mysql";
import * as oracleDb from "./oracle-db";
import * as mongodb from "./mongodb";
import * as snowflake from "./snowflake";
import * as bigquery from "./bigquery";
import * as azureSql from "./azure-sql";
import * as airtable from "./airtable";

// ── New Provider Imports ───────────────────────────────────────────────────────
import * as clickhouse from "./clickhouse";
import * as awsLambda from "./aws-lambda";
import * as airflow from "./airflow";
import * as iguana from "./iguana";
import * as mirthConnect from "./mirth-connect";

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
  // Customer Support
  { ...zendesk, zendeskActions: zendesk.zendeskActions },
  { ...freshdesk, freshdeskActions: freshdesk.freshdeskActions },
  { ...intercom, intercomActions: intercom.intercomActions },
  { ...helpScout, helpScoutActions: helpScout.helpScoutActions },
  { ...servicenow, servicenowActions: servicenow.servicenowActions },
  { ...serviceCloud, serviceCloudActions: serviceCloud.serviceCloudActions },
  // BI
  { ...powerBI, powerBIActions: powerBI.powerBIActions },
  { ...tableau, tableauActions: tableau.tableauActions },
  { ...looker, lookerActions: looker.lookerActions },
  { ...metabase, metabaseActions: metabase.metabaseActions },
  { ...qlikSense, qlikSenseActions: qlikSense.qlikSenseActions },
  { ...sigma, sigmaActions: sigma.sigmaActions },
  // ECommerce
  { ...shopify, shopifyActions: shopify.shopifyActions },
  { ...woocommerce, wooCommerceActions: woocommerce.wooCommerceActions },
  { ...bigcommerce, bigCommerceActions: bigcommerce.bigCommerceActions },
  { ...magento, magentoActions: magento.magentoActions },
  { ...amazonSeller, amazonSellerActions: amazonSeller.amazonSellerActions },
  // Logistics
  { ...mcleodSoftware, mcleodSoftwareActions: mcleodSoftware.mcleodSoftwareActions },
  { ...mercurygate, mercurygateActions: mercurygate.mercurygateActions },
  { ...trimbleTms, trimbleTmsActions: trimbleTms.trimbleTmsActions },
  { ...samsara, samsaraActions: samsara.samsaraActions },
  { ...motive, motiveActions: motive.motiveActions },
  { ...project44, project44Actions: project44.project44Actions },
  { ...fourkites, fourkitesActions: fourkites.fourkitesActions },
  { ...dat, datActions: dat.datActions },
  { ...truckstop, truckstopActions: truckstop.truckstopActions },
  { ...descartes, descartesActions: descartes.descartesActions },
  { ...pcsTms, pcsTmsActions: pcsTms.pcsTmsActions },
  { ...ascendTms, ascendTmsActions: ascendTms.ascendTmsActions },
  // Manufacturing
  { ...plex, plexActions: plex.plexActions },
  { ...katana, katanaActions: katana.katanaActions },
  { ...fishbowl, fishbowlActions: fishbowl.fishbowlActions },
  { ...mrpeasy, mrpeasyActions: mrpeasy.mrpeasyActions },
  { ...iqms, iqmsActions: iqms.iqmsActions },
  { ...epicorKineticMfg, epicorKineticMfgActions: epicorKineticMfg.epicorKineticMfgActions },
  { ...siemensOpcenter, siemensOpcenterActions: siemensOpcenter.siemensOpcenterActions },
  // Healthcare
  { ...athenahealth, athenahealthActions: athenahealth.athenahealthActions },
  { ...nextgen, nextgenActions: nextgen.nextgenActions },
  { ...eclinicalworks, eclinicalworksActions: eclinicalworks.eclinicalworksActions },
  // Scheduling
  { ...calendly, calendlyActions: calendly.calendlyActions },
  { ...microsoftBookings, microsoftBookingsActions: microsoftBookings.microsoftBookingsActions },
  { ...googleCalendar, googleCalendarActions: googleCalendar.googleCalendarActions },
  { ...outlookCalendar, outlookCalendarActions: outlookCalendar.outlookCalendarActions },
  { ...acuity, acuityActions: acuity.acuityActions },
  // Forms
  { ...typeform, typeformActions: typeform.typeformActions },
  { ...jotform, jotformActions: jotform.jotformActions },
  { ...microsoftForms, microsoftFormsActions: microsoftForms.microsoftFormsActions },
  { ...googleForms, googleFormsActions: googleForms.googleFormsActions },
  { ...formstack, formstackActions: formstack.formstackActions },
  { ...gravityForms, gravityFormsActions: gravityForms.gravityFormsActions },
  // Payment
  { ...square, squareActions: square.squareActions },
  { ...paypal, paypalActions: paypal.paypalActions },
  { ...authorizeNet, authorizeNetActions: authorizeNet.authorizeNetActions },
  { ...braintree, braintreeActions: braintree.braintreeActions },
  // AI Models
  { ...openai, openaiActions: openai.openaiActions },
  { ...anthropicClaude, anthropicClaudeActions: anthropicClaude.anthropicClaudeActions },
  { ...googleGemini, googleGeminiActions: googleGemini.googleGeminiActions },
  { ...azureOpenai, azureOpenaiActions: azureOpenai.azureOpenaiActions },
  { ...awsBedrock, awsBedrockActions: awsBedrock.awsBedrockActions },
  { ...mistral, mistralActions: mistral.mistralActions },
  { ...cohere, cohereActions: cohere.cohereActions },
  // Automation
  { ...n8n, n8nActions: n8n.n8nActions },
  { ...make, makeActions: make.makeActions },
  { ...zapier, zapierActions: zapier.zapierActions },
  { ...powerAutomate, powerAutomateActions: powerAutomate.powerAutomateActions },
  { ...uipath, uipathActions: uipath.uipathActions },
  { ...workato, workatoActions: workato.workatoActions },
  { ...trayIo, trayIoActions: trayIo.trayIoActions },
  { ...boomi, boomiActions: boomi.boomiActions },
  // Identity
  { ...entraId, entraIdActions: entraId.entraIdActions },
  { ...okta, oktaActions: okta.oktaActions },
  { ...auth0, auth0Actions: auth0.auth0Actions },
  { ...googleWorkspaceIdentity, googleWorkspaceIdentityActions: googleWorkspaceIdentity.googleWorkspaceIdentityActions },
  // Storage
  { ...s3, s3Actions: s3.s3Actions },
  { ...azureBlob, azureBlobActions: azureBlob.azureBlobActions },
  { ...gcs, gcsActions: gcs.gcsActions },
  // Developer Tools
  { ...restApi, restApiActions: restApi.restApiActions },
  { ...graphql, graphqlActions: graphql.graphqlActions },
  { ...webhooksBroad, webhooksBroadActions: webhooksBroad.webhooksBroadActions },
  { ...sftp, sftpActions: sftp.sftpActions },
  { ...soap, soapActions: soap.soapActions },
  { ...json, jsonActions: json.jsonActions },
  { ...xml, xmlActions: xml.xmlActions },
  // Databases
  { ...sqlServer, sqlServerActions: sqlServer.sqlServerActions },
  { ...postgresql, postgresqlActions: postgresql.postgresqlActions },
  { ...mysql, mysqlActions: mysql.mysqlActions },
  { ...oracleDb, oracleDbActions: oracleDb.oracleDbActions },
  { ...mongodb, mongodbActions: mongodb.mongodbActions },
  { ...snowflake, snowflakeActions: snowflake.snowflakeActions },
  { ...bigquery, bigqueryActions: bigquery.bigqueryActions },
  { ...azureSql, azureSqlActions: azureSql.azureSqlActions },
  { ...airtable, airtableActions: airtable.airtableActions },
  // New Integrations
  { ...clickhouse, clickhouseActions: clickhouse.clickhouseActions },
  { ...awsLambda, awsLambdaActions: awsLambda.awsLambdaActions },
  { ...airflow, airflowActions: airflow.airflowActions },
  { ...iguana, iguanaActions: iguana.iguanaActions },
  { ...mirthConnect, mirthActions: mirthConnect.mirthActions },
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
// Customer Support
export * from "./zendesk";
export * from "./freshdesk";
export * from "./intercom";
export * from "./help-scout";
export * from "./servicenow";
export * from "./salesforce-service-cloud";
// BI
export * from "./power-bi";
export * from "./tableau";
export * from "./looker";
export * from "./metabase";
export * from "./qlik-sense";
export * from "./sigma";
// ECommerce
export * from "./shopify";
export * from "./woocommerce";
export * from "./bigcommerce";
export * from "./magento";
export * from "./amazon-seller";
// Logistics
export * from "./mcleod-software";
export * from "./mercurygate";
export * from "./trimble-tms";
export * from "./samsara";
export * from "./motive";
export * from "./project44";
export * from "./fourkites";
export * from "./dat";
export * from "./truckstop";
export * from "./descartes";
export * from "./pcs-tms";
export * from "./ascend-tms";
// Manufacturing
export * from "./plex";
export * from "./katana";
export * from "./fishbowl";
export * from "./mrpeasy";
export * from "./iqms";
export * from "./epicor-kinetic-mfg";
export * from "./siemens-opcenter";
// Healthcare
export * from "./athenahealth";
export * from "./nextgen";
export * from "./eclinicalworks";
// Scheduling
export * from "./calendly";
export * from "./microsoft-bookings";
export * from "./google-calendar";
export * from "./outlook-calendar";
export * from "./acuity";
// Forms
export * from "./typeform";
export * from "./jotform";
export * from "./microsoft-forms";
export * from "./google-forms";
export * from "./formstack";
export * from "./gravity-forms";
// Payment
export * from "./square";
export * from "./paypal";
export * from "./authorize-net";
export * from "./braintree";
// AI Models
export * from "./openai";
export * from "./anthropic-claude";
export * from "./google-gemini";
export * from "./azure-openai";
export * from "./aws-bedrock";
export * from "./mistral";
export * from "./cohere";
// Automation
export * from "./n8n";
export * from "./make";
export * from "./zapier";
export * from "./power-automate";
export * from "./uipath";
export * from "./workato";
export * from "./tray-io";
export * from "./boomi";
// Identity
export * from "./entra-id";
export * from "./okta";
export * from "./auth0";
export * from "./google-workspace-identity";
// Storage (Cloud)
export * from "./s3";
export * from "./azure-blob";
export * from "./gcs";
// Developer Tools
export * from "./rest-api";
export * from "./graphql";
export * from "./webhooks-broad";
export * from "./sftp";
export * from "./soap";
export * from "./json";
export * from "./xml";
// Databases
export * from "./sql-server";
export * from "./postgresql";
export * from "./mysql";
export * from "./oracle-db";
export * from "./mongodb";
export * from "./snowflake";
export * from "./bigquery";
export * from "./azure-sql";
export * from "./airtable";
// New Integrations
export * from "./clickhouse";
export * from "./aws-lambda";
export * from "./airflow";
export * from "./iguana";
export * from "./mirth-connect";