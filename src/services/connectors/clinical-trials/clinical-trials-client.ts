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
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_PAGE_SIZE = 100;
const DEFAULT_USER_AGENT =
  process.env.CLINICAL_TRIALS_USER_AGENT?.trim() ||
  "clinical-development-explorer/0.1 (https://github.com/Sicho602/clinical-development-poc; research-poc)";

export class ClinicalTrialsClient implements ClinicalTrialsConnector {
  private readonly baseUrl: string;
  private readonly userAgent: string;

  constructor(
    baseUrl = process.env.CLINICAL_TRIALS_API_BASE_URL,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
    userAgent = DEFAULT_USER_AGENT,
  ) {
    this.baseUrl = resolveBaseUrl(baseUrl);
    this.userAgent = userAgent;
  }

  async search(
    input: ClinicalTrialsSearchInput,
  ): Promise<PageResult<ClinicalTrial>> {
    if (!hasServerSearchCriteria(input.strategy)) {
      throw new ConnectorError(
        "invalid_request",
        "ClinicalTrials.gov 검색 조건이 최소 1개 필요합니다.",
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
    const payload = searchResponseSchema.safeParse(await readJsonBody(response));

    if (!payload.success) {
      throw new ConnectorError(
        "invalid_response",
        "ClinicalTrials.gov 검색 응답을 해석하지 못했습니다.",
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
        "올바른 NCT 번호가 필요합니다.",
        400,
      );
    }

    const url = new URL(
      `${this.baseUrl}/studies/${encodeURIComponent(normalizedNctId)}`,
    );
    url.searchParams.set("format", "json");

    try {
      const response = await this.request(url);
      return mapClinicalTrial(await readJsonBody(response));
    } catch (error) {
      if (isConnectorError(error) && error.code === "not_found") {
        return null;
      }
      throw error;
    }
  }

  private async request(url: URL): Promise<Response> {
    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": this.userAgent,
        },
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.ok) {
        return response;
      }

      const retryAfter = parseRetryAfter(response.headers.get("retry-after"));

      if (response.status === 404) {
        throw new ConnectorError(
          "not_found",
          "해당 임상시험을 찾지 못했습니다.",
          404,
        );
      }

      if (response.status === 429) {
        throw new ConnectorError(
          "rate_limited",
          "ClinicalTrials.gov 요청이 제한되었습니다. 잠시 후 다시 시도하세요.",
          429,
          retryAfter,
        );
      }

      throw new ConnectorError(
        "upstream_error",
        `ClinicalTrials.gov가 HTTP ${response.status}를 반환했습니다.`,
        response.status >= 400 && response.status < 500 ? response.status : 502,
        retryAfter,
      );
    } catch (error) {
      if (isConnectorError(error)) {
        throw error;
      }

      if (isTimeoutError(error)) {
        throw new ConnectorError(
          "timeout",
          "ClinicalTrials.gov 응답 시간이 초과되었습니다.",
          504,
          undefined,
          { cause: error },
        );
      }

      throw new ConnectorError(
        "network_error",
        "ClinicalTrials.gov에 연결하지 못했습니다.",
        502,
        undefined,
        { cause: error },
      );
    }
  }
}

function resolveBaseUrl(value?: string) {
  const trimmed = value?.trim();
  return (trimmed || DEFAULT_BASE_URL).replace(/\/$/, "");
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new ConnectorError(
      "invalid_response",
      "ClinicalTrials.gov가 JSON이 아닌 응답을 반환했습니다.",
      502,
      undefined,
      { cause: error },
    );
  }
}

function isTimeoutError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const name = "name" in error ? String(error.name) : "";
  return name === "TimeoutError" || name === "AbortError";
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : undefined;
}
