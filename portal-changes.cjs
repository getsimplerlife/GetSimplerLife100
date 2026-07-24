const fs = require('fs');
const file = '/home/team/shared/site/standalone-server.ts';
let c = fs.readFileSync(file, 'utf8');

// === 1. Add "Connected Accounts" to sidebar ===
c = c.replace(
  "{ id: \"integrations\", icon: \"🔌\", label: \"Integrations\" },\n    { id: \"crm\", icon: \"🏢\", label: \"CRM / ERP\" },",
  "{ id: \"integrations\", icon: \"🔌\", label: \"Integrations\" },\n    { id: \"connections\", icon: \"🔗\", label: \"Connected Accounts\" },\n    { id: \"crm\", icon: \"🏢\", label: \"CRM / ERP\" },"
);
console.log('1. Sidebar updated');

// === 2. Add route dispatch for /portal/connections ===
c = c.replace(
  'case "integrations": content = renderPortalIntegrations(email); break;',
  'case "integrations": content = renderPortalIntegrations(email); break;\n    case "connections": content = renderPortalConnections(email); break;'
);
// Add connections to titleMap
c = c.replace(
  'integrations: "Integrations", crm: "CRM / ERP",',
  'integrations: "Integrations", connections: "Connected Accounts", crm: "CRM / ERP",'
);
console.log('2. Route dispatch added');

// === 3. Add renderPortalConnections function before the CRM section ===
const crmSection = '// ─── 8. CRM / ERP ───';
const connectionsFunc = `// ─── 7b. Connected Accounts ───
function renderPortalConnections(email: string): string {
  let connHTML = '<div class="portal-skeleton"><div class="portal-skeleton-line w4"></div><div class="portal-skeleton-card"></div></div>';
  if (email) {
    seedTenantDataIfNeeded(email);
    const conns = readTenantData(TENANT_INTEGRATIONS_FILE, email);
    if (conns.length === 0) {
      connHTML = '<div class="portal-empty"><div class="portal-empty-icon">🔗</div><div class="portal-empty-title">No connected accounts yet</div><div class="portal-empty-text">Connect your first integration from the <a href="/portal/integrations" style="color:#10b981">Integrations</a> page.</div><a href="/portal/integrations" class="portal-btn portal-btn-primary portal-btn-sm">Browse Integrations</a></div>';
    } else {
      let rows = '';
      conns.forEach((conn: any) => {
        const statusClass = conn.status === 'Connected' ? 'portal-badge-green' : 'portal-badge-amber';
        const lastSync = conn.lastSync ? new Date(conn.lastSync).toLocaleString() : 'Never';
        rows += '<tr><td style="font-weight:700;color:#e7e5e4">' + conn.provider + '</td><td><span class="portal-badge ' + statusClass + '">' + (conn.status || 'Connected') + '</span></td><td style="font-size:0.8125rem">' + lastSync + '</td><td><button class="portal-btn portal-btn-sm portal-btn-secondary" onclick="testConnection(\\'' + conn.provider + '\\')">Test</button> <button class="portal-btn portal-btn-sm portal-btn-danger" onclick="disconnectProvider(\\'' + conn.provider + '\\', this)">Disconnect</button></td></tr>';
      });
      connHTML = '<div class="portal-card"><table class="portal-table"><thead><tr><th>Provider</th><th>Status</th><th>Last Sync</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    }
  }
  return \`<div class="portal-main-header"><div><h1>Connected Accounts</h1><p style="color:#78716c;font-size:0.875rem">Manage your active connections</p></div><a href="/portal/integrations" class="portal-btn portal-btn-primary portal-btn-sm">+ Add Connection</a></div><div id="conn-content">\${connHTML}</div>\`;
}

`;
c = c.replace(crmSection, connectionsFunc + '\n' + crmSection);
console.log('3. Connected Accounts page added');

// === 4. Expand CRM from 8 to 12 providers ===
// Find the CRM names array and expand it
const oldNames = '["Salesforce","HubSpot","Dynamics 365","NetSuite","SAP","Zoho CRM","Pipedrive","Freshsales"]';
const newNames = '["Salesforce","HubSpot","Dynamics 365","NetSuite","SAP","Zoho CRM","Pipedrive","Freshsales","SugarCRM","Microsoft Dynamics","Oracle CX","Zendesk Sell"]';
c = c.replace(oldNames, newNames);

// Expand CRM icons
const oldIcons = '{"Salesforce":"☁️","HubSpot":"🧲","Dynamics 365":"🟦","NetSuite":"🏢","SAP":"🔷","Zoho CRM":"📋","Pipedrive":"📊","Freshsales":"🌱"}';
const newIcons = '{"Salesforce":"☁️","HubSpot":"🧲","Dynamics 365":"🟦","NetSuite":"🏢","SAP":"🔷","Zoho CRM":"📋","Pipedrive":"📊","Freshsales":"🌱","SugarCRM":"🍬","Microsoft Dynamics":"💼","Oracle CX":"🔴","Zendesk Sell":"🎯"}';
c = c.replace(oldIcons, newIcons);

// Also expand the SSR pre-render CRM names/icon
const oldSSRNames = '["Salesforce","HubSpot","Dynamics 365","NetSuite","SAP","Zoho CRM","Pipedrive","Freshsales"]';
c = c.replace(oldSSRNames, newNames);

const oldSSRIcons = '{"Salesforce":"\\\\u2601\\\\uFE0F","HubSpot":"\\\\uD83E\\\\uDDF2","Dynamics 365":"\\\\uD83D\\\\uDFE6","NetSuite":"\\\\uD83C\\\\uDFE2","SAP":"\\\\uD83D\\\\uDD37","Zoho CRM":"\\\\uD83D\\\\uDCCB","Pipedrive":"\\\\uD83D\\\\uDCCA","Freshsales":"\\\\uD83C\\\\uDF31"}';
const newSSRIcons = '{"Salesforce":"\\\\u2601\\\\uFE0F","HubSpot":"\\\\uD83E\\\\uDDF2","Dynamics 365":"\\\\uD83D\\\\uDFE6","NetSuite":"\\\\uD83C\\\\uDFE2","SAP":"\\\\uD83D\\\\uDD37","Zoho CRM":"\\\\uD83D\\\\uDCCB","Pipedrive":"\\\\uD83D\\\\uDCCA","Freshsales":"\\\\uD83C\\\\uDF31","SugarCRM":"\\\\uD83C\\\\uDF6C","Microsoft Dynamics":"\\\\uD83D\\\\uDCBC","Oracle CX":"\\\\uD83D\\\\uDD34","Zendesk Sell":"\\\\uD83C\\\\uDFAF"}';
c = c.replace(oldSSRIcons, newSSRIcons);

console.log('4. CRM expanded to 12 providers');

fs.writeFileSync(file, c);
console.log('All changes applied');
