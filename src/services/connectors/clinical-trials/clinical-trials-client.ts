import { z } from "zod";

import type {
  ClinicalTrialsConnector,
  ClinicalTrialsSearchInput,
  PageResult,
} from "@/domain/contracts";
import type { ClinicalTrial } from "@/domain/models";
import {
  ConnectorError,
  isConnectorError,
} from "@/services/connectors/connector-error";
import { mapClinicalTrial } from "./clinical-trials-mapper";
import {
  buildClinicalTrialsApiParameters,
  hasServerSearchCriteria,
} from "./clinical-trials-search-strategy";

const searchResponseSchema = z.object({
  studies: z.array(z.unknown()),
  totalCount: z.number().optional(),
  nextPageToken: z.string().optional(),
});

const DEFAULT_BASE_URL = "https://clinicaltrials.gov/api/v2";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_PAGE_SIZE = 100;

export class ClinicalTrialsClient implements ClinicalTrialsConnector {
  private readonly baseUrl: string;

  constructor(
    baseUrl = process.env.CLINICAL_TRIALS_API_BASE_URL ?? DEFAULT_BASE_URL,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async search(
    input: ClinicalTrialsSearchInput,
  ): Promise<PageResult<ClinicalTrial>> {
    if (!hasServerSearchCriteria(input.strategy)) {
      throw new ConnectorError(
        "invalid_request",
        "At least one ClinicalTrials.gov search criterion is required.",
        400,
      );
    }

    const pageSize = Math.min(
      Math.max(Math.floor(input.pageSize), 1),
      MAX_PAGE_SIZE,
    );
    const url = new URL(`${this.baseUrl}/studies`);
    const strategyParameters = buildClinicalTrialsApiParameters(input.strategy);
    strategyParameters.forEach((value, name) => {
      url.searchParams.set(name, value);
    });
    url.searchParams.set("pageSize", String(pageSize));
    url.searchParams.set("format", input.format ?? "json");
    url.searchParams.set("countTotal", String(input.countTotal ?? true));

    if (input.pageToken) {
      url.searchParams.set("pageToken", input.pageToken);
    }

    const response = await this.request(url);
    const payload = searchResponseSchema.safeParse(await response.json());

    if (!payload.success) {
      throw new ConnectorError(
        "invalid_response",
        "ClinicalTrials.gov search response could not be parsed.",
        502,
        undefined,
        { cause: payload.error },
      );
    }

    return {
      items: payload.data.studies.map(mapClinicalTrial),
      totalCount: payload.data.totalCount,
      nextPageToken: payload.data.nextPageToken,
    };
  }

  async getByNctId(nctId: string): Promise<ClinicalTrial | null> {
    const normalizedNctId = nctId.trim().toUpperCase();

    if (!/^NCT\d{8}$/.test(normalizedNctId)) {
      throw new ConnectorError(
        "invalid_request",
        "A valid NCT identifier is required.",
        400,
      );
    }

    const url = new URL(
      `${this.baseUrl}/studies/${encodeURIComponent(normalizedNctId)}`,
    );
    url.searchParams.set("format", "json");

    try {
      const response = await this.request(url);
      return mapClinicalTrial(await response.json());
    } catch (error) {
      if (isConnectorError(error) && error.code === "not_found") {
        return null;
      }
      throw error;
    }
  }

  private async request(url: URL): Promise<Response> {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
      });

      if (response.ok) {
        return response;
      }

      const retryAfter = parseRetryAfter(response.headers.get("retry-after"));

      if (response.status === 404) {
        throw new ConnectorError(
          "not_found",
          "ClinicalTrials.gov study was not found.",
          404,
        );
      }

      if (response.status === 429) {
        throw new ConnectorError(
          "rate_limited",
          "ClinicalTrials.gov request was rate limited.",
          429,
          retryAfter,
        );
      }

      throw new ConnectorError(
        "upstream_error",
        `ClinicalTrials.gov returned HTTP ${response.status}.`,
        502,
        retryAfter,
      );
    } catch (error) {
      if (isConnectorError(error)) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new ConnectorError(
          "timeout",
          "ClinicalTrials.gov request timed out.",
          504,
          undefined,
          { cause: error },
        );
      }

      throw new ConnectorError(
        "network_error",
        "ClinicalTrials.gov could not be reached.",
        502,
        undefined,
        { cause: error },
      );
    }
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : undefined;
}
