import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";
export interface EnvelopeRecipient { email: string; name?: string; roleName?: string; status?: string; tabs?: Array<Record<string, unknown>>; }
export class DocuSignClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any; private accountId: string; private baseUrl: string; private appToken: string;
  constructor(tokens: OAuthTokens, authConfig: any, accountId: string, baseUrl: string, appToken?: string) {
    this.baseUrl = baseUrl || "https://demo.docusign.net/restapi"; this.client = new HttpClient({ baseUrl: `${this.baseUrl}/v2.1/accounts/${accountId}`, rateLimit: { maxRequestsPerSecond: 20 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig; this.accountId = accountId; this.appToken = appToken || "";
  }
  private get headers() {
    const h: Record<string, string> = { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" };
    if (this.appToken) h["X-DocuSign-AppToken"] = this.appToken;
    return h;
  }
  private rebuildClient(baseUri: string, accountId: string) {
    this.baseUrl = baseUri || this.baseUrl;
    this.accountId = accountId;
    this.client = new HttpClient({ baseUrl: `${this.baseUrl}/v2.1/accounts/${accountId}`, rateLimit: { maxRequestsPerSecond: 20 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
  }
  /** Resolve the account id from the stored token response first, then OAuth userinfo. */
  private async ensureAccount(): Promise<void> {
    if (this.accountId) return;
    const raw = (this.tokens as any).raw as { account_id?: string; accounts?: Array<{ account_id?: string; base_uri?: string }> } | undefined;
    if (raw?.account_id) { this.rebuildClient(this.baseUrl, raw.account_id); return; }
    if (Array.isArray(raw?.accounts) && raw.accounts[0]?.account_id) { this.rebuildClient(raw.accounts[0].base_uri || this.baseUrl, raw.accounts[0].account_id); return; }
    const { resolveDocuSignDefaultAccount } = await import("./auth");
    const resolved = await resolveDocuSignDefaultAccount(this.tokens);
    if (!resolved.accountId) throw new Error("DocuSign account id could not be resolved — no API call possible");
    this.rebuildClient(resolved.baseUri || this.baseUrl, resolved.accountId);
  }
  private async ensureToken() {
    await this.ensureAccount();
    if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshDocuSignToken } = await import("./auth"); this.tokens = await refreshDocuSignToken(this.authConfig, this.tokens.refreshToken); }
  }

  // ─── Understand / Read ─────────────────────────────────────────────
  async getAccountInfo(): Promise<any> { await this.ensureToken(); const r = await this.client.get("/", this.headers); return r.data; }
  async listUsers(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/users", this.headers); return r.data?.users || []; }
  async listBrands(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/brands", this.headers); return r.data?.brands || []; }
  async getBrand(brandId: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/brands/${brandId}`, this.headers); return r.data; }
  async getTemplate(templateId: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/templates/${templateId}`, this.headers); return r.data; }
  async getEnvelopeAudit(id: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/envelopes/${id}/audit_events`, this.headers); return r.data?.auditEvents || []; }
  async listFolders(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/folders", this.headers); return r.data?.folders || []; }
  async getFolder(folderId: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/folders/${folderId}`, this.headers); return r.data; }
  async getEnvelopeCustomFields(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/envelopes/${id}/custom_fields`, this.headers); return r.data; }
  async listSigningGroups(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/signing_groups", this.headers); return r.data?.signingGroups || []; }
  /** Full envelope detail: core record plus recipients, documents, custom fields, audit trail. */
  async getEnvelopeEnhanced(id: string): Promise<any> {
    await this.ensureToken();
    const [envelope, recipients, documents, customFields, audit] = await Promise.all([
      this.client.get(`/envelopes/${id}?include=recipients,documents`, this.headers),
      this.client.get(`/envelopes/${id}/recipients`, this.headers),
      this.client.get(`/envelopes/${id}/documents`, this.headers),
      this.client.get(`/envelopes/${id}/custom_fields`, this.headers),
      this.client.get(`/envelopes/${id}/audit_events`, this.headers),
    ]);
    return { ...(envelope.data || {}), recipients: recipients.data?.signers || recipients.data?.recipients || [], documents: documents.data?.documents || [], customFields: customFields.data || {}, auditEvents: audit.data?.auditEvents || [] };
  }

  // ─── Monitor ───────────────────────────────────────────────────────
  /** List envelopes changed in a window, optionally filtered by status and/or folder. */
  async listEnvelopeStatusChanges(opts: { fromDate?: string; toDate?: string; status?: string; folderIds?: string[] } = {}): Promise<any[]> {
    await this.ensureToken();
    const q = new URLSearchParams();
    q.set("from_date", opts.fromDate || "2020-01-01");
    if (opts.toDate) q.set("to_date", opts.toDate);
    if (opts.status) q.set("status", opts.status);
    if (opts.folderIds?.length) q.set("folder_ids", opts.folderIds.join(","));
    const r = await this.client.get(`/envelopes?${q.toString()}`, this.headers);
    return r.data?.envelopes || [];
  }

  // ─── Automate / Write ──────────────────────────────────────────────
  async createEnvelopeFromTemplate(data: { templateId: string; templateRoles: Array<{ email: string; name?: string; roleName?: string }>; emailSubject?: string; emailBlurb?: string }): Promise<any> {
    await this.ensureToken();
    const r = await this.client.post("/envelopes", { status: "sent", templateId: data.templateId, templateRoles: data.templateRoles, emailSubject: data.emailSubject, emailBlurb: data.emailBlurb }, this.headers);
    return r.data;
  }
  /** Send an envelope built from documents hosted at public URLs, with signing tabs and carbon copies. */
  async sendEnvelopeFromUrl(data: { emailSubject: string; emailBlurb?: string; documents: Array<{ name: string; remoteUrl: string; documentId?: string }>; recipients: EnvelopeRecipient[]; carbonCopies?: Array<{ email: string; name?: string }> }): Promise<any> {
    await this.ensureToken();
    const body: any = { status: "sent", emailSubject: data.emailSubject, emailBlurb: data.emailBlurb, documents: data.documents.map((d) => ({ name: d.name, remoteUrl: d.remoteUrl, documentId: d.documentId })) };
    body.recipients = { signers: data.recipients.map((r) => ({ email: r.email, name: r.name, roleName: r.roleName, tabs: r.tabs })) };
    if (data.carbonCopies?.length) body.recipients.carbonCopies = data.carbonCopies;
    const r = await this.client.post("/envelopes", body, this.headers);
    return r.data;
  }
  async updateEnvelope(id: string, data: Record<string, unknown>): Promise<any> { await this.ensureToken(); const r = await this.client.put(`/envelopes/${id}`, data, this.headers); return r.data; }
  async updateRecipients(id: string, recipients: EnvelopeRecipient[]): Promise<any> { await this.ensureToken(); const r = await this.client.put(`/envelopes/${id}/recipients`, { recipients }, this.headers); return r.data; }
  async createTemplate(data: Record<string, unknown>): Promise<any> { await this.ensureToken(); const r = await this.client.post("/templates", data, this.headers); return r.data; }
  /** Download a single document (returns raw response data — may be base64 for binary). */
  async downloadDocument(id: string, docId: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/envelopes/${id}/documents/${docId}`, this.headers); return r.data; }
  async getCombinedDocument(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/envelopes/${id}/documents/combined`, this.headers); return r.data; }

  // ─── Existing surface (kept) ───────────────────────────────────────
  async listEnvelopes(fromDate?: string): Promise<any[]> { await this.ensureToken(); const p = fromDate ? `/envelopes?from_date=${fromDate}` : "/envelopes?from_date=2020-01-01"; const r = await this.client.get(p, this.headers); return r.data?.envelopes || []; }
  async sendEnvelope(data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post("/envelopes", data, this.headers); return r.data; }
  async getEnvelope(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/envelopes/${id}`, this.headers); return r.data; }
  async listRecipients(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/envelopes/${id}/recipients`, this.headers); return r.data; }
  async listTemplates(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/templates", this.headers); return r.data?.envelopeTemplates || []; }
  async getEnvelopeDocuments(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/envelopes/${id}/documents`, this.headers); return r.data; }
  async voidEnvelope(id: string, reason: string): Promise<any> { await this.ensureToken(); const r = await this.client.put(`/envelopes/${id}`, { status: "voided", voidedReason: reason }, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/envelopes?from_date=2020-01-01&count=1", this.headers); return r.ok; } catch { return false; } }
}
export function createDocuSignClient(config: ConnectionConfig): DocuSignClient {
  return new DocuSignClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
    config.accountId || "", config.baseUrl || "", config.appToken as string | undefined);
}
