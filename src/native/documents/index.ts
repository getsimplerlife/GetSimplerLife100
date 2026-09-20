/**
 * native/documents/index.ts — Phase 1.2 native capability: per-tenant
 * document store + template-based PDF generation. Barrel.
 */
import { handleNativeDocumentsAuthed, type NativeDocumentsCtx } from "./router";
import { mergeFields, renderHtmlDocument, validateLogoDataUrl, htmlToLayoutLines } from "./pdf";
import type { NativeRenderOptions } from "./types";

export { handleNativeDocumentsAuthed, mergeFields, renderHtmlDocument, validateLogoDataUrl, htmlToLayoutLines };
export type { NativeDocumentsCtx, NativeRenderOptions };