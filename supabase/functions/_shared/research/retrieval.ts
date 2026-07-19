import { canonicalUrl } from "./discovery.ts";
import { getEnv, type PageExtractor } from "./providers.ts";
import { getRegistryEntryForDomain } from "./source-registry.ts";

export interface RetrievedPage {
  canonicalUrl: string;
  text: string;
  contentType: string;
  etag?: string | null;
  lastModified?: string | null;
  contentHash: string;
  strategy: string;
  status: number;
}

export interface CachedPage {
  canonical_url: string;
  text_content: string;
  content_hash: string;
  content_type?: string;
  etag?: string | null;
  last_modified?: string | null;
  expires_at: string;
  fetch_status?: number;
  extraction_version?: string;
}

export function cacheTtlSeconds(url: string) {
  const registryEntry = getRegistryEntryForDomain(url);
  if (registryEntry) return registryEntry.cacheTtlSeconds;
  
  if (/pricing|plans|github\.com\/(?!.*\/blob\/)/i.test(url)) return 6 * 60 * 60;
  if (/docs|documentation|changelog/i.test(url)) return 7 * 24 * 60 * 60;
  if (/\.gov|worldbank|census|bls|annual|report/i.test(url)) return 90 * 24 * 60 * 60;
  return 30 * 24 * 60 * 60;
}

export function usableCache(
  entry: CachedPage | null | undefined,
  now = Date.now(),
) {
  return !!entry && Date.parse(entry.expires_at) > now &&
    entry.text_content.length >= 50;
}

export interface SourceAcceptanceInput {
  retrieved: boolean;
  readable: boolean;
  relevance: number;
  claimCount: number;
  attributable: boolean;
  excluded: boolean;
  duplicate: boolean;
}

export function sourceAcceptance(input: SourceAcceptanceInput) {
  if (!input.retrieved) return { accepted: false, reason: "retrieval_failed" };
  if (!input.readable) return { accepted: false, reason: "unreadable_content" };
  if (input.relevance < 0.2) {
    return { accepted: false, reason: "below_relevance_threshold" };
  }
  if (input.claimCount < 1) {
    return { accepted: false, reason: "no_extractable_claim" };
  }
  if (!input.attributable) {
    return { accepted: false, reason: "unattributable_evidence" };
  }
  if (input.excluded) {
    return { accepted: false, reason: "policy_or_quality_exclusion" };
  }
  if (input.duplicate) {
    return { accepted: false, reason: "duplicate_or_syndicated" };
  }
  return { accepted: true, reason: null };
}

const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ).map((x) => x.toString(16).padStart(2, "0")).join("");

// Deterministic HTML strip using basic regex
const strip = (html: string) => {
  // Strip scripts, styles, noscript, and SVG
  let clean = html.replace(
    /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>/gi,
    " ",
  );
  // Strip head
  clean = clean.replace(/<head[\s\S]*?<\/head>/gi, " ");
  // Strip all remaining tags
  clean = clean.replace(/<[^>]+>/g, " ");
  // Compress whitespace
  return clean.replace(/\s+/g, " ").trim();
};

export function extractionStrategy(url: string, contentType = "text/html") {
  const registryEntry = getRegistryEntryForDomain(url);
  if (registryEntry) return registryEntry.defaultStrategy;

  if (/\.xml($|\?)/i.test(url) || /xml/i.test(contentType)) {
    return "structured_xml";
  }
  if (/\.json($|\?)/i.test(url) || /json/i.test(contentType)) {
    return "structured_json";
  }
  if (
    /pricing|plans|features|faq|docs|changelog|github\.com|datasets?|data\./i
      .test(url)
  ) return "domain_parser";
  return "direct_html";
}

export async function retrieveDirect(
  url: string,
  init: { etag?: string | null; lastModified?: string | null } = {},
): Promise<RetrievedPage> {
  const canonical = canonicalUrl(url);
  if (!canonical) throw new Error("Invalid URL");

  const response = await fetch(canonical, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Accept: "text/html,application/xhtml+xml,application/json,application/xml;q=0.9",
      "User-Agent": "Pipeline-Research-Bot/1.0",
      ...(init.etag ? { "If-None-Match": init.etag } : {}),
      ...(init.lastModified ? { "If-Modified-Since": init.lastModified } : {}),
    },
  });

  if (response.status === 304) throw new Error("Not modified");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  
  const contentType = response.headers.get("content-type") || "";
  if (!/html|json|xml|text|csv/i.test(contentType)) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 2_000_000) {
    throw new Error("Response exceeds 2MB limit");
  }

  const raw = new TextDecoder().decode(bytes);
  let text = raw;
  if (/html/i.test(contentType)) {
      text = strip(raw);
  } else if (/json/i.test(contentType)) {
      // Basic JSON flattening
      try {
        const obj = JSON.parse(raw);
        text = JSON.stringify(obj, null, 2);
      } catch {
        // Fallback to raw text
      }
  }
  
  if (text.length < 50) throw new Error("Unreadable content or SPA shell");

  return {
    canonicalUrl: canonical,
    text,
    contentType,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    contentHash: await hash(text),
    strategy: extractionStrategy(canonical, contentType),
    status: response.status,
  };
}

/**
 * The fetch ladder:
 * 1. structured API (if defined by registry) -> Handled in discovery typically, but direct access here goes via HTTP.
 * 2. direct HTTP fetch + JSON/XML parsing
 * 3. deterministic HTML strip
 * 4. Firecrawl fallback (large-model/browser rendering)
 */
export async function retrieveWithLadder(
  url: string,
  extractor?: PageExtractor,
) {
  try {
    return await retrieveDirect(url);
  } catch (directError: any) {
    if (directError.message === "Not modified") throw directError;
    
    // Only fallback if the direct fetch failed due to SPA/unreadable or certain HTTP errors (like 403 blocks that Firecrawl can bypass)
    if (!extractor || !getEnv("FIRECRAWL_API_KEY")) {
      throw directError;
    }
    
    try {
        const text = await extractor.extract(url);
        if (text.length < 50) {
          throw new Error("Firecrawl returned unreadable content");
        }
        return {
          canonicalUrl: canonicalUrl(url)!,
          text,
          contentType: "text/markdown",
          etag: null,
          lastModified: null,
          contentHash: await hash(text),
          strategy: "firecrawl_fallback",
          status: 200,
        };
    } catch (fallbackError) {
        // Bubble up the original failure if fallback fails
        throw directError;
    }
  }
}
