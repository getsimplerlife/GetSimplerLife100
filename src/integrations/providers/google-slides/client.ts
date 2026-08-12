import { HttpClient } from "../../framework/client";
import { OAuthTokens, isTokenExpired } from "../../framework/oauth";
import { ConnectionConfig } from "../../framework/connection";

/**
 * Google Slides client.
 *
 * Canonical host: https://slides.googleapis.com/v1 (vetted Google-owned domain).
 * Presentations are created through the Slides API (title in the POST body),
 * then slides + text are added via presentations.batchUpdate. All createSlide
 * requests carry a client-generated objectId so retries are idempotent.
 */
const SLIDES_BASE = "https://slides.googleapis.com/v1";

export class GoogleSlidesClient {
  private client: HttpClient;
  private tokens: OAuthTokens;
  private authConfig: any;

  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({
      baseUrl: SLIDES_BASE,
      rateLimit: { maxRequestsPerSecond: 60 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
      timeout: 30000,
    });
    this.tokens = tokens;
    this.authConfig = authConfig;
  }

  private get headers() {
    return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" };
  }

  private async ensureToken() {
    if (isTokenExpired(this.tokens) && this.tokens.refreshToken) {
      const { refreshSlidesToken } = await import("./auth");
      this.tokens = await refreshSlidesToken(this.authConfig, this.tokens.refreshToken);
    }
  }

  /* ── Create ─────────────────────────────────────────────────────────── */
  /** Create an empty presentation with a title. */
  async createPresentation(title: string): Promise<any> {
    await this.ensureToken();
    if (!title) throw new Error("Google Slides: createPresentation requires a title");
    const r = await this.client.post("/presentations", { title }, this.headers);
    return r.data;
  }

  /**
   * Create a presentation from an outline, e.g. [{ title, body? }, ...].
   * Each slide gets a client-generated objectId (idempotency on retry) and a
   * title placeholder is filled via insertText into the default TITLE placeholder.
   */
  async createPresentationFromOutline(title: string, slides: Array<{ title: string; body?: string }>): Promise<any> {
    await this.ensureToken();
    if (!Array.isArray(slides) || slides.length === 0) {
      throw new Error("Google Slides: createPresentationFromOutline requires a non-empty slides array");
    }
    const created = await this.createPresentation(title);
    const presentationId = created?.presentationId || created?.id;
    if (!presentationId) throw new Error("Google Slides: create returned no presentation id");

    const requests: any[] = [];
    const slideIds: string[] = [];
    for (let i = 0; i < slides.length; i++) {
      const objectId = `slide-${i + 1}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      slideIds.push(objectId);
      requests.push({
        createSlide: {
          objectId,
          slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" },
        },
      });
    }
    const batch = await this.batchUpdate(presentationId, requests);

    // Fill each slide's title placeholder (and body when provided).
    const titleRequests: any[] = [];
    slides.forEach((slide, i) => {
      const slideObjectId = slideIds[i];
      titleRequests.push(
        {
          insertText: {
            objectId: slideObjectId,
            text: slide.title,
            insertionIndex: 0,
          },
        },
      );
      if (slide.body) {
        titleRequests.push({
          insertText: {
            objectId: slideObjectId,
            text: `\n${slide.body}`,
            insertionIndex: 0,
          },
        });
      }
    });
    // Find the first TEXT placeholder element on each slide to target insertText.
    const layoutIds = await this.findTitleTextPlaceholders(presentationId, slideIds);
    const precise: any[] = [];
    for (const { slideObjectId, textBoxId } of layoutIds) {
      const slide = slides[slideIds.indexOf(slideObjectId)];
      if (!slide) continue;
      precise.push({
        insertText: { objectId: textBoxId, text: slide.title, insertionIndex: 0 },
      });
      if (slide.body) {
        precise.push({
          insertText: { objectId: textBoxId, text: `\n${slide.body}`, insertionIndex: 0 },
        });
      }
    }
    if (precise.length > 0) {
      await this.batchUpdate(presentationId, precise);
    } else if (titleRequests.length > 0) {
      // Fallback: best-effort insert at index 0 (may be replaced by layout placeholders).
      await this.batchUpdate(presentationId, titleRequests).catch(() => undefined);
    }
    return { ...created, batch, slideIds };
  }

  /* ── Read ───────────────────────────────────────────────────────────── */
  /** Fetch the full presentation resource. */
  async getPresentation(presentationId: string): Promise<any> {
    await this.ensureToken();
    const r = await this.client.get(`/presentations/${encodeURIComponent(presentationId)}`, this.headers);
    return r.data;
  }

  /* ── Update ─────────────────────────────────────────────────────────── */
  /** Run a batch of presentations.batchUpdate requests. */
  async batchUpdate(presentationId: string, requests: any[]): Promise<any> {
    await this.ensureToken();
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new Error("Google Slides: batchUpdate requires a non-empty requests array");
    }
    const r = await this.client.post(
      `/presentations/${encodeURIComponent(presentationId)}:batchUpdate`,
      { requests },
      this.headers,
    );
    return r.data;
  }

  /** Add N blank TITLE_AND_BODY slides, returning their object ids. */
  async addSlides(presentationId: string, count: number): Promise<string[]> {
    await this.ensureToken();
    const requests: any[] = [];
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const objectId = `slide-${Date.now()}-${i}-${Math.floor(Math.random() * 1e6)}`;
      ids.push(objectId);
      requests.push({ createSlide: { objectId, slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" } } });
    }
    await this.batchUpdate(presentationId, requests);
    return ids;
  }

  /** Insert text into a known shape/page element. */
  async insertText(presentationId: string, objectId: string, text: string, insertionIndex = 0): Promise<any> {
    await this.ensureToken();
    if (!objectId) throw new Error("Google Slides: insertText requires an objectId");
    return this.batchUpdate(presentationId, [{ insertText: { objectId, text, insertionIndex } }]);
  }

  /** Locate the first TEXT placeholder box on each slide (for content injection). */
  private async findTitleTextPlaceholders(
    presentationId: string,
    slideObjectIds: string[],
  ): Promise<Array<{ slideObjectId: string; textBoxId: string }>> {
    try {
      const pres = await this.getPresentation(presentationId);
      const found: Array<{ slideObjectId: string; textBoxId: string }> = [];
      const byId = new Map<string, any>((pres.slides || []).map((s: any) => [s.objectId, s]));
      for (const slideId of slideObjectIds) {
        const slide = byId.get(slideId);
        if (!slide) continue;
        for (const el of slide.pageElements || []) {
          const shape = el.shape;
          if (shape?.shapeType === "TEXT_BOX" || (shape?.placeholder?.type === "TITLE" || shape?.placeholder?.type === "BODY" || shape?.placeholder?.type === "CENTERED_TITLE")) {
            found.push({ slideObjectId: slideId, textBoxId: el.objectId });
            break;
          }
        }
      }
      return found;
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // presentations.list does not exist; a GET on a non-existent id returns 404
      // only after auth — 401/403 means bad token, so treat those as unhealthy.
      const r = await this.client.get("/presentations/nonexistent-healthcheck", this.headers);
      return r.status === 404;
    } catch {
      return false;
    }
  }
}

export function createGSlidesClient(config: ConnectionConfig): GoogleSlidesClient {
  return new GoogleSlidesClient(
    {
      accessToken: config.accessToken || "",
      refreshToken: config.refreshToken,
      expiresAt: config.expiresAt,
      scope: config.scope,
      raw: config,
    },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
  );
}
