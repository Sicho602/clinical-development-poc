import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type {
  ClinicalTrial,
  ClinicalTrialSummary,
  ClinicalTrialsServerSearchStrategy,
} from "@/domain/models";
import { ConnectorError } from "@/services/connectors/connector-error";
import { connectorErrorResponse } from "@/services/connectors/http-error";
import { ClinicalTrialsClient } from "@/services/connectors/clinical-trials/clinical-trials-client";
import { buildClinicalTrialsApiParameters } from "@/services/connectors/clinical-trials/clinical-trials-search-strategy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const clinicalTrials = new ClinicalTrialsClient();

const phaseSchema = z.enum([
  "EARLY_PHASE1",
  "PHASE1",
  "PHASE2",
  "PHASE3",
  "PHASE4",
  "NA",
]);
const studyTypeSchema = z.enum([
  "INTERVENTIONAL",
  "OBSERVATIONAL",
  "EXPANDED_ACCESS",
]);
const statusSchema = z.enum([
  "NOT_YET_RECRUITING",
  "RECRUITING",
  "ENROLLING_BY_INVITATION",
  "ACTIVE_NOT_RECRUITING",
  "SUSPENDED",
  "TERMINATED",
  "COMPLETED",
  "WITHDRAWN",
  "UNKNOWN",
]);
const interventionTypeSchema = z.enum([
  "DRUG",
  "BIOLOGICAL",
  "DEVICE",
  "PROCEDURE",
  "RADIATION",
  "BEHAVIORAL",
  "DIETARY_SUPPLEMENT",
  "GENETIC",
  "COMBINATION_PRODUCT",
  "DIAGNOSTIC_TEST",
  "OTHER",
]);
const ageSchema = z.enum(["CHILD", "ADULT", "OLDER_ADULT"]);
const sexSchema = z.enum(["FEMALE", "MALE", "ALL"]);

export async function GET(request: NextRequest) {
  const pageToken = request.nextUrl.searchParams.get("pageToken") ?? undefined;
  const requestedPageSize = Number(
    request.nextUrl.searchParams.get("pageSize") ?? "50",
  );

  if (!Number.isInteger(requestedPageSize) || requestedPageSize < 1) {
    return errorResponse(
      new ConnectorError(
        "invalid_request",
        "pageSize must be a positive integer.",
        400,
      ),
    );
  }

  try {
    const strategy = parseSearchStrategy(request.nextUrl.searchParams);
    const result = await clinicalTrials.search({
      strategy,
      pageSize: requestedPageSize,
      pageToken,
      countTotal: true,
      format: "json",
    });

    return NextResponse.json({
      status: result.items.length === 0 ? "no_results" : "connected",
      data: result.items.map(toClinicalTrialSummary),
      pagination: {
        totalCount: result.totalCount,
        nextPageToken: result.nextPageToken,
      },
      appliedStrategy: strategy,
      apiParameters: Object.fromEntries(
        buildClinicalTrialsApiParameters(strategy),
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function toClinicalTrialSummary(
  trial: ClinicalTrial,
): ClinicalTrialSummary {
  return {
    nctId: trial.nctId,
    officialTitle: trial.officialTitle,
    briefTitle: trial.briefTitle,
    sponsor: trial.sponsor,
    studyType: trial.studyType,
    phases: trial.phases,
    conditions: trial.conditions,
    interventions: trial.interventions,
    enrollment: trial.enrollment,
    design: trial.design,
    primaryOutcomes: trial.primaryOutcomes,
    secondaryOutcomes: trial.secondaryOutcomes,
    countries: trial.countries,
    overallStatus: trial.overallStatus,
    startDate: trial.startDate,
    source: trial.source,
  };
}

function parseSearchStrategy(
  parameters: URLSearchParams,
): ClinicalTrialsServerSearchStrategy {
  try {
    const startYearValue = parameters.get("startYear");
    return {
      condition: readText(parameters, "condition"),
      phases: readCsv(parameters, "phases", phaseSchema),
      studyTypes: readCsv(parameters, "studyTypes", studyTypeSchema),
      statuses: readCsv(parameters, "statuses", statusSchema),
      interventionTypes: readCsv(
        parameters,
        "interventionTypes",
        interventionTypeSchema,
      ),
      intervention: readText(parameters, "intervention"),
      sponsor: readText(parameters, "sponsor"),
      country: readText(parameters, "country"),
      ageGroups: readCsv(parameters, "ageGroups", ageSchema),
      sex: sexSchema.or(z.literal("")).parse(parameters.get("sex") ?? ""),
      startYear: startYearValue
        ? z.coerce
            .number()
            .int()
            .min(1900)
            .max(new Date().getUTCFullYear() + 10)
            .parse(startYearValue)
        : undefined,
      keyword: readText(parameters, "keyword"),
    };
  } catch (error) {
    throw new ConnectorError(
      "invalid_request",
      "ClinicalTrials.gov 검색 조건이 올바르지 않습니다.",
      400,
      undefined,
      { cause: error },
    );
  }
}

function readText(parameters: URLSearchParams, name: string) {
  return z
    .string()
    .max(300)
    .parse(parameters.get(name) ?? "")
    .trim();
}

function readCsv<T extends z.ZodType<string>>(
  parameters: URLSearchParams,
  name: string,
  schema: T,
): Array<z.infer<T>> {
  const value = parameters.get(name);
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .filter(Boolean)
    .map((item) => schema.parse(item));
}

function errorResponse(error: unknown) {
  return connectorErrorResponse(error);
}
