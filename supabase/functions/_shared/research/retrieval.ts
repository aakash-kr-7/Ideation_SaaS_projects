import { canonicalUrl } from "./discovery.ts";
import { getEnv, type PageExtractor } from "./providers.ts";

export interface RetrievedPage { canonicalUrl: string; text: string; contentType: string; etag?: string | null; lastModified?: string | null; contentHash: string; strategy: string; status: number; }
export interface CachedPage { canonical_url: string; text_content: string; content_hash: string; content_type?: string; etag?: string | null; last_modified?: string | null; expires_at: string; fetch_status?: number; extraction_version?: string; }
export function cacheTtlSeconds(url: string) {
  if (/pricing|plans|github\.com\/(?!.*\/blob\/)/i.test(url)) return 6 * 60 * 60;
  if (/docs|documentation|changelog/i.test(url)) return 7 * 24 * 60 * 60;
  if (/\.gov|worldbank|census|bls|annual|report/i.test(url)) return 90 * 24 * 60 * 60;
  return 30 * 24 * 60 * 60;
}
export function usableCache(entry: CachedPage | null | undefined, now = Date.now()) { return !!entry && Date.parse(entry.expires_at) > now && entry.text_content.length >= 50; }
export interface SourceAcceptanceInput { retrieved: boolean; readable: boolean; relevance: number; claimCount: number; attributable: boolean; excluded: boolean; duplicate: boolean; }
export function sourceAcceptance(input: SourceAcceptanceInput) {
  if (!input.retrieved) return { accepted: false, reason: "retrieval_failed" };
  if (!input.readable) return { accepted: false, reason: "unreadable_content" };
  if (input.relevance < .2) return { accepted: false, reason: "below_relevance_threshold" };
  if (input.claimCount < 1) return { accepted: false, reason: "no_extractable_claim" };
  if (!input.attributable) return { accepted: false, reason: "unattributable_evidence" };
  if (input.excluded) return { accepted: false, reason: "policy_or_quality_exclusion" };
  if (input.duplicate) return { accepted: false, reason: "duplicate_or_syndicated" };
  return { accepted: true, reason: null };
}
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((x) => x.toString(16).padStart(2, "0")).join("");
const strip = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
export function extractionStrategy(url: string, contentType = "text/html") {
  if (/\.xml($|\?)/i.test(url) || /xml/i.test(contentType)) return "structured_xml";
  if (/\.json($|\?)/i.test(url) || /json/i.test(contentType)) return "structured_json";
  if (/pricing|plans|features|faq|docs|changelog|github\.com|datasets?|data\./i.test(url)) return "domain_parser";
  return "direct_html";
}
export async function retrieveDirect(url: string, init: { etag?: string | null; lastModified?: string | null } = {}): Promise<RetrievedPage> {
  const canonical = canonicalUrl(url); if (!canonical) throw new Error("Invalid URL");
  const response = await fetch(canonical, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { Accept: "text/html,application/xhtml+xml,application/json,application/xml;q=0.9", ...(init.etag ? { "If-None-Match": init.etag } : {}), ...(init.lastModified ? { "If-Modified-Since": init.lastModified } : {}) } });
  if (response.status === 304) throw new Error("Not modified");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!/html|json|xml|text|csv/i.test(contentType)) throw new Error(`Unsupported content type: ${contentType}`);
  const bytes = await response.arrayBuffer(); if (bytes.byteLength > 2_000_000) throw new Error("Response exceeds 2MB limit");
  const raw = new TextDecoder().decode(bytes); const text = /html/i.test(contentType) ? strip(raw) : raw;
  if (text.length < 50) throw new Error("Unreadable content");
  return { canonicalUrl: canonical, text, contentType, etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified"), contentHash: await hash(text), strategy: extractionStrategy(canonical, contentType), status: response.status };
}
export async function retrieveWithLadder(url: string, extractor?: PageExtractor) {
  try { return await retrieveDirect(url); } catch (directError) {
    if (!extractor || !getEnv("FIRECRAWL_API_KEY")) throw directError;
    const text = await extractor.extract(url); if (text.length < 50) throw new Error("Firecrawl returned unreadable content");
    return { canonicalUrl: canonicalUrl(url)!, text, contentType: "text/markdown", etag: null, lastModified: null, contentHash: await hash(text), strategy: "firecrawl_fallback", status: 200 };
  }
}
