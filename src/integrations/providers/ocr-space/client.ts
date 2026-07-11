import { ConnectionConfig } from "../../framework/connection";

export class OCRSpaceClient {
  private apiKey: string;
  constructor(apiKey: string) { this.apiKey = apiKey; }

  async ocrUrl(url: string, lang = "eng"): Promise<any> {
    const r = await fetch("https://api.ocr.space/parse/imageurl?apikey=" + this.apiKey + "&url=" + encodeURIComponent(url) + "&language=" + lang + "&isOverlayRequired=false", { method: "POST" });
    return r.json();
  }
  async ocrBase64(base64: string, lang = "eng", filename = "scan.png"): Promise<any> {
    const form = new URLSearchParams();
    form.append("apikey", this.apiKey); form.append("base64Image", base64); form.append("language", lang); form.append("isOverlayRequired", "false"); form.append("filename", filename);
    const r = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: form });
    return r.json();
  }
  async healthCheck(): Promise<boolean> { try { const r = await this.ocrUrl("https://www.ocr.space/ocr-test-image.png"); return !r.IsErroredOnProcessing; } catch { return false; } }
}

export function createOCRSpaceClient(config: ConnectionConfig): OCRSpaceClient {
  return new OCRSpaceClient(config.apiKey || "");
}