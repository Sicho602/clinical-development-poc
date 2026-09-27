import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

import type {
  PageResult,
  PubMedConnector,
  PubMedSearchInput,
} from "@/domain/contracts";
import type { Publication } from "@/domain/models";
import {
  ConnectorError,
  isConnectorError,
} from "@/services/connectors/connector-error";
import { mapPubMedXml } from "./pubmed-mapper";

const searchResponseSchema = z.object({
  esearchresult: z.object({
    count: z.string(),
    retstart: z.string(),
    retmax: z.string(),
    idlist: z.array(z.string()),
  }),
});

const DEFAULT_BASE_URL =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_PAGE_SIZE = 50;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  removeNSPrefix: true,
  trimValues: true,
});

export class PubMedClient implements PubMedConnector {
  private readonly baseUrl: string;

  constructor(
    baseUrl = process.env.PUBMED_EUTILS_BASE_URL ?? DEFAULT_BASE_URL,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async search(input: PubMedSearchInput): Promise<PageResult<Publication>> {
    const query = input.query.trim();
    if (!query) {
      throw new ConnectorError(
        "invalid_request",
        "PubMed search query is required.",
        400,
      );
    }

    const pageSize = Math.min(
      Math.max(Math.floor(input.pageSize), 1),
      MAX_PAGE_SIZE,
    );
    const offset = parseOffset(input.pageToken);
    const searchUrl = new URL(`${this.baseUrl}/esearch.fcgi`);
    searchUrl.searchParams.set("db", "pubmed");
    searchUrl.searchParams.set("term", query);
    searchUrl.searchParams.set("retmode", "json");
    searchUrl.searchParams.set("retstart", String(offset));
    searchUrl.searchParams.set("retmax", String(pageSize));
    searchUrl.searchParams.set("sort", "relevance");
    this.addIdentification(searchUrl);

    const searchResponse = await this.request(searchUrl, "application/json");
    const payload = searchResponseSchema.safeParse(
      await searchResponse.json(),
    );
    if (!payload.success) {
      throw new ConnectorError(
        "invalid_response",
        "PubMed ESearch response could not be parsed.",
        502,
        undefined,
        { cause: payload.error },
      );
    }

    const totalCount = Number(payload.data.esearchresult.count);
    const pmids = payload.data.esearchresult.idlist;
    const items = pmids.length ? await this.getByPmids(pmids) : [];
    const nextOffset = offset + pmids.length;

    return {
      items,
      totalCount,
      nextPageToken:
        nextOffset < totalCount ? String(nextOffset) : undefined,
    };
  }

  async getByPmids(pmids: string[]): Promise<Publication[]> {
    const validPmids = Array.from(
      new Set(pmids.filter((pmid) => /^\d+$/.test(pmid))),
    );
    if (!validPmids.length) return [];

    const fetchUrl = new URL(`${this.baseUrl}/efetch.fcgi`);
    fetchUrl.searchParams.set("db", "pubmed");
    fetchUrl.searchParams.set("id", validPmids.join(","));
    fetchUrl.searchParams.set("retmode", "xml");
    this.addIdentification(fetchUrl);

    const response = await this.request(fetchUrl, "application/xml");
    try {
      const parsed = xmlParser.parse(await response.text()) as unknown;
      const publications = mapPubMedXml(parsed);
      const order = new Map(validPmids.map((pmid, index) => [pmid, index]));
      return publications.sort(
        (a, b) =>
          (order.get(a.pmid) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.pmid) ?? Number.MAX_SAFE_INTEGER),
      );
    } catch (error) {
      if (isConnectorError(error)) throw error;
      throw new ConnectorError(
        "invalid_response",
        "PubMed EFetch XML could not be parsed.",
        502,
        undefined,
        { cause: error },
      );
    }
  }

  private addIdentification(url: URL) {
    url.searchParams.set(
      "tool",
      process.env.NCBI_TOOL || "clinical-development-explorer",
    );
    if (process.env.NCBI_EMAIL) {
      url.searchParams.set("email", process.env.NCBI_EMAIL);
    }
    if (process.env.NCBI_API_KEY) {
      url.searchParams.set("api_key", process.env.NCBI_API_KEY);
    }
  }

  private async request(url: URL, accept: string) {
    try {
      const response = await fetch(url, {
        headers: { Accept: accept },
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
      });
      if (response.ok) return response;

      const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
      if (response.status === 429) {
        throw new ConnectorError(
          "rate_limited",
          "PubMed request was rate limited.",
          429,
          retryAfter,
        );
      }
      throw new ConnectorError(
        "upstream_error",
        `PubMed returned HTTP ${response.status}.`,
        502,
        retryAfter,
      );
    } catch (error) {
      if (isConnectorError(error)) throw error;
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new ConnectorError(
          "timeout",
          "PubMed request timed out.",
          504,
          undefined,
          { cause: error },
        );
      }
      throw new ConnectorError(
        "network_error",
        "PubMed could not be reached.",
        502,
        undefined,
        { cause: error },
      );
    }
  }
}

function parseOffset(pageToken?: string) {
  if (!pageToken) return 0;
  const offset = Number(pageToken);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new ConnectorError(
      "invalid_request",
      "PubMed page token is invalid.",
      400,
    );
  }
  return offset;
}

function parseRetryAfter(value: string | null) {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : undefined;
}
