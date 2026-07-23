const fs = require('fs');
const path = require('path');
const root = __dirname;

// Read the current (already fixed) standalone-server.ts
let ss = fs.readFileSync(path.join(root, 'standalone-server.ts'), 'utf8');
console.log('Read standalone-server.ts:', ss.length, 'bytes');

// ============================================================
// STEP 1: Expand allProviders from 24 to 180
// ============================================================
const providersDir = path.join(root, 'src', 'integrations', 'providers');
const dirs = fs.readdirSync(providersDir, { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name).sort();

const nameMap = {
  'abbyy': ['ABBYY', 'Document Processing'], 'acuity': ['Acuity Scheduling', 'Scheduling'],
  'acumatica': ['Acumatica', 'ERP'], 'adobe-sign': ['Adobe Sign', 'Document Processing'],
  'adp': ['ADP', 'HR'], 'aircall': ['Aircall', 'Communication'],
  'airflow': ['Apache Airflow', 'Dev Tools'], 'airtable': ['Airtable', 'Databases'],
  'amazon-seller': ['Amazon Seller Central', 'E-Commerce'], 'anthropic-claude': ['Anthropic Claude', 'AI Models'],
  'asana': ['Asana', 'Project Mgmt'], 'ascend-tms': ['AscendTMS', 'Logistics'],
  'athenahealth': ['Athenahealth', 'Healthcare'], 'auth0': ['Auth0', 'Identity'],
  'authorize-net': ['Authorize.net', 'Payments'], 'aws-bedrock': ['AWS Bedrock', 'AI Models'],
  'aws-lambda': ['AWS Lambda', 'Dev Tools'], 'aws-textract': ['AWS Textract', 'Document Processing'],
  'azure-blob': ['Azure Blob Storage', 'Storage'], 'azure-doc-intel': ['Azure Document Intelligence', 'Document Processing'],
  'azure-openai': ['Azure OpenAI', 'AI Models'], 'azure-sql': ['Azure SQL', 'Databases'],
  'bamboohr': ['BambooHR', 'HR'], 'basecamp': ['Basecamp', 'Project Mgmt'],
  'bigcommerce': ['BigCommerce', 'E-Commerce'], 'bigquery': ['BigQuery', 'Databases'],
  'bill': ['Bill.com', 'Accounting'], 'boomi': ['Boomi', 'Automation'],
  'box': ['Box', 'Storage'], 'braintree': ['Braintree', 'Payments'],
  'brex': ['Brex', 'Accounting'], 'calendly': ['Calendly', 'Scheduling'],
  'clickhouse': ['ClickHouse', 'Databases'], 'clickup': ['ClickUp', 'Project Mgmt'],
  'cohere': ['Cohere', 'AI Models'], 'confluence': ['Confluence', 'Productivity'],
  'copper': ['Copper', 'CRM'], 'creatio': ['Creatio', 'CRM'],
  'dat': ['DAT', 'Logistics'], 'descartes': ['Descartes', 'Logistics'],
  'dialpad': ['Dialpad', 'Communication'], 'discord': ['Discord', 'Communication'],
  'docusign': ['DocuSign', 'Document Processing'], 'dropbox': ['Dropbox', 'Storage'],
  'dropbox-sign': ['Dropbox Sign', 'Document Processing'], 'dynamics-365': ['Dynamics 365', 'CRM'],
  'dynamics-365-bc': ['Dynamics 365 Business Central', 'ERP'], 'dynamics-365-fo': ['Dynamics 365 Finance & Ops', 'ERP'],
  'eclinicalworks': ['eClinicalWorks', 'Healthcare'], 'egnyte': ['Egnyte', 'Storage'],
  'entra-id': ['Microsoft Entra ID', 'Identity'], 'epicor': ['Epicor', 'ERP'],
  'epicor-kinetic': ['Epicor Kinetic', 'ERP'], 'epicor-kinetic-mfg': ['Epicor Kinetic Mfg', 'Manufacturing'],
  'exchange': ['Exchange', 'Email'], 'expensify': ['Expensify', 'Accounting'],
  'fishbowl': ['Fishbowl', 'Manufacturing'], 'formstack': ['Formstack', 'Forms'],
  'fourkites': ['FourKites', 'Logistics'], 'freshbooks': ['FreshBooks', 'Accounting'],
  'freshdesk': ['Freshdesk', 'Support'], 'freshsales': ['Freshsales', 'CRM'],
  'gcs': ['Google Cloud Storage', 'Storage'], 'github': ['GitHub', 'Dev Tools'],
  'gitlab': ['GitLab', 'Dev Tools'], 'gmail': ['Gmail', 'Email'],
  'google-calendar': ['Google Calendar', 'Scheduling'], 'google-doc-ai': ['Google Document AI', 'Document Processing'],
  'google-drive': ['Google Drive', 'Storage'], 'google-forms': ['Google Forms', 'Forms'],
  'google-gemini': ['Google Gemini', 'AI Models'], 'google-workspace': ['Google Workspace', 'Email'],
  'google-workspace-identity': ['Google Workspace Identity', 'Identity'], 'graphql': ['GraphQL', 'Dev Tools'],
  'gravity-forms': ['Gravity Forms', 'Forms'], 'greenhouse': ['Greenhouse', 'HR'],
  'gusto': ['Gusto', 'HR'], 'helpscout': ['Help Scout', 'Support'],
  'hubspot': ['HubSpot', 'CRM'], 'iguana': ['Iguana', 'Healthcare'],
  'imap': ['IMAP', 'Email'], 'infor-cloudsuite': ['Infor CloudSuite', 'ERP'],
  'intercom': ['Intercom', 'Support'], 'iqms': ['IQMS', 'Manufacturing'],
  'jira': ['Jira', 'Project Mgmt'], 'jotform': ['Jotform', 'Forms'],
  'json': ['JSON API', 'Dev Tools'], 'katana': ['Katana', 'Manufacturing'],
  'lever': ['Lever', 'HR'], 'looker': ['Looker', 'BI'],
  'magento': ['Magento', 'E-Commerce'], 'make': ['Make', 'Automation'],
  'mcleod-software': ['McLeod Software', 'Logistics'], 'mercurygate': ['MercuryGate', 'Logistics'],
  'metabase': ['Metabase', 'BI'], 'microsoft-bookings': ['Microsoft Bookings', 'Scheduling'],
  'microsoft-forms': ['Microsoft Forms', 'Forms'], 'mirth-connect': ['Mirth Connect', 'Healthcare'],
  'mistral': ['Mistral', 'AI Models'], 'monday-com': ['Monday.com', 'Project Mgmt'],
  'monday-crm': ['Monday CRM', 'CRM'], 'mongodb': ['MongoDB', 'Databases'],
  'motive': ['Motive', 'Logistics'], 'mrpeasy': ['MRPeasy', 'Manufacturing'],
  'mysql': ['MySQL', 'Databases'], 'n8n': ['n8n', 'Automation'],
  'netsuite': ['NetSuite', 'ERP'], 'nextgen': ['NextGen', 'Healthcare'],
  'notion': ['Notion', 'Productivity'], 'ocr-space': ['OCR.space', 'Document Processing'],
  'odoo': ['Odoo', 'ERP'], 'okta': ['Okta', 'Identity'],
  'onedrive': ['OneDrive', 'Storage'], 'openai': ['OpenAI', 'AI Models'],
  'oracle-db': ['Oracle DB', 'Databases'], 'oracle-erp-cloud': ['Oracle ERP Cloud', 'ERP'],
  'outlook': ['Outlook', 'Email'], 'outlook-calendar': ['Outlook Calendar', 'Scheduling'],
  'pandadoc': ['PandaDoc', 'Document Processing'], 'paychex': ['Paychex', 'HR'],
  'paypal': ['PayPal', 'Payments'], 'pcs-tms': ['PCS TMS', 'Logistics'],
  'pdf-co': ['PDF.co', 'Document Processing'], 'pipedrive': ['Pipedrive', 'CRM'],
  'plex': ['Plex', 'Manufacturing'], 'postgresql': ['PostgreSQL', 'Databases'],
  'power-automate': ['Power Automate', 'Automation'], 'power-bi': ['Power BI', 'BI'],
  'project44': ['project44', 'Logistics'], 'qlik-sense': ['Qlik Sense', 'BI'],
  'quickbooks-desktop': ['QuickBooks Desktop', 'Accounting'], 'quickbooks-enterprise': ['QuickBooks Enterprise', 'ERP'],
  'quickbooks-online': ['QuickBooks Online', 'Accounting'], 'ramp': ['Ramp', 'Accounting'],
  'rest-api': ['REST API', 'Dev Tools'], 'ringcentral': ['RingCentral', 'Communication'],
  'rippling': ['Rippling', 'HR'], 's3': ['Amazon S3', 'Storage'],
  'sage-50': ['Sage 50', 'Accounting'], 'sage-intacct': ['Sage Intacct', 'ERP'],
  'sage-x3': ['Sage X3', 'ERP'], 'salesforce': ['Salesforce', 'CRM'],
  'salesforce-service-cloud': ['Salesforce Service Cloud', 'Support'], 'samsara': ['Samsara', 'Logistics'],
  'sap-business-one': ['SAP Business One', 'ERP'], 'sap-s4hana': ['SAP S/4HANA', 'ERP'],
  'servicenow': ['ServiceNow', 'Support'], 'sftp': ['SFTP', 'Dev Tools'],
  'sharepoint': ['SharePoint', 'Storage'], 'shopify': ['Shopify', 'E-Commerce'],
  'siemens-opcenter': ['Siemens Opcenter', 'Manufacturing'], 'sigma': ['Sigma', 'BI'],
  'slack': ['Slack', 'Communication'], 'smartsheet': ['Smartsheet', 'Project Mgmt'],
  'smtp': ['SMTP', 'Email'], 'snowflake': ['Snowflake', 'Databases'],
  'soap': ['SOAP API', 'Dev Tools'], 'sql-server': ['SQL Server', 'Databases'],
  'square': ['Square', 'Payments'], 'stripe': ['Stripe', 'Payments'],
  'sugarcrm': ['SugarCRM', 'CRM'], 'tableau': ['Tableau', 'BI'],
  'teams': ['Teams', 'Communication'], 'tray-io': ['Tray.io', 'Automation'],
  'trello': ['Trello', 'Project Mgmt'], 'trimble-tms': ['Trimble TMS', 'Logistics'],
  'truckstop': ['Truckstop', 'Logistics'], 'twilio': ['Twilio', 'Communication'],
  'typeform': ['Typeform', 'Forms'], 'uipath': ['UiPath', 'Automation'],
  'ukg': ['UKG', 'HR'], 'wave': ['Wave', 'Accounting'],
  'webex': ['Webex', 'Communication'], 'webhooks-broad': ['Webhooks', 'Dev Tools'],
  'woocommerce': ['WooCommerce', 'E-Commerce'], 'workato': ['Workato', 'Automation'],
  'workday': ['Workday', 'HR'], 'wrike': ['Wrike', 'Project Mgmt'],
  'xero': ['Xero', 'Accounting'], 'xml': ['XML API', 'Dev Tools'],
  'zapier': ['Zapier', 'Automation'], 'zendesk': ['Zendesk', 'Support'],
  'zoho-crm': ['Zoho CRM', 'CRM'], 'zoom': ['Zoom', 'Communication'],
};
const iconMap = { 'CRM':'📋','ERP':'🏢','Accounting':'📒','Email':'✉️','Communication':'💬','Storage':'📁','Document Processing':'📄','Project Mgmt':'📊','HR':'👥','Support':'🎧','BI':'📈','E-Commerce':'🛍️','Logistics':'🚛','Manufacturing':'🏭','Healthcare':'🏥','Scheduling':'📅','Forms':'📝','Payments':'💳','AI Models':'🤖','Automation':'⚡','Identity':'🔐','Dev Tools':'🛠️','Databases':'🗄️','Productivity':'✅' };

const entries = [];
for (const dir of dirs) {
  const [name, cat] = nameMap[dir] || [dir.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 'Other'];
  entries.push(`{ name: "${name}", icon: "${iconMap[cat] || '🔌'}", cat: "${cat}" }`);
}
let newProviders = '  const allProviders = [\n';
for (let i = 0; i < entries.length; i++) {
  if (i % 6 === 0) newProviders += '    ';
  newProviders += entries[i];
  if (i < entries.length - 1) newProviders += ', ';
  if ((i + 1) % 6 === 0 && i < entries.length - 1) newProviders += '\n';
}
newProviders += '\n  ];';
ss = ss.replace(/  const allProviders = \[\s*\{[^}]*\}.*?\];/s, newProviders);
console.log('Providers expanded to', entries.length);

// Update category filter buttons
ss = ss.replace(/\["CRM","Communication","Storage","ERP","Project Mgmt","Payments","Accounting","Support","E-Commerce","Dev Tools","Productivity"\]/,
  '["CRM","ERP","Accounting","Email","Communication","Storage","Document Processing","Project Mgmt","HR","Support","BI","E-Commerce","Logistics","Manufacturing","Healthcare","Scheduling","Forms","Payments","AI Models","Automation","Identity","Dev Tools","Databases","Productivity"]');
console.log('Category filters updated');

// Replace connect alerts with real handlers
const oldConnect = "onclick=\"alert(\\\\\\'Connect flow coming soon\\\\\\')\"";
ss = ss.replace(oldConnect, "onclick=\"connectProvider(\\\\\\'\"+i.name+\"\\\\\\')\"");
ss = ss.replace(oldConnect, "onclick=\"connectProvider(\\\\\\'\"+name+\"\\\\\\')\"");
console.log('Connect buttons updated');

// Add connect/disconnect JS functions
ss = ss.replace("})</script>';\n}\n\n// ─── 8. CRM",
`function connectProvider(name){var btn=event.target;btn.disabled=true;btn.textContent="Connecting...";fetch("/api/integrations/connect",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({provider:name})}).then(function(r){if(!r.ok)throw r;return r.json()}).then(function(d){btn.textContent="✓ Connected";btn.className="portal-btn portal-btn-sm portal-btn-success";btn.disabled=true;btn.onclick=function(){disconnectProvider(name,btn)};setTimeout(function(){location.reload()},500)}).catch(function(e){btn.disabled=false;btn.textContent="Connect";alert("Connection failed.")})}
function disconnectProvider(name,btn){if(!confirm("Disconnect "+name+"?"))return;btn.disabled=true;btn.textContent="Disconnecting...";fetch("/api/integrations/disconnect",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({provider:name})}).then(function(r){if(!r.ok)throw r;return r.json()}).then(function(){location.reload()}).catch(function(e){btn.disabled=false;btn.textContent="✓ Connected";alert("Disconnect failed.")})}
})</script>';\n}\n\n// ─── 8. CRM`);
console.log('Added connect/disconnect JS');

// Add API routes
ss = ss.replace('if (pathname.startsWith("/api/")) {\n    return new Response(JSON.stringify({ error: "Not found" }), {',
  'if (pathname === "/api/integrations/connect" && req.method === "POST") {\n    return handleIntegrationConnect(req);\n  }\n  if (pathname === "/api/integrations/disconnect" && req.method === "POST") {\n    return handleIntegrationDisconnect(req);\n  }\n  if (pathname.startsWith("/api/")) {\n    return new Response(JSON.stringify({ error: "Not found" }), {');
console.log('Added API routes');

// Write back
fs.writeFileSync(path.join(root, 'standalone-server.ts'), ss);
console.log('standalone-server.ts written:', ss.length, 'bytes');

// Update package.json
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
pkg.scripts.start = 'bun run standalone-server.ts';
fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
console.log('package.json updated');
console.log('\n✅ All done!');
