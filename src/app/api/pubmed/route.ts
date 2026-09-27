import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { PubMedSearchStrategy } from "@/domain/models";
import { isConnectorError } from "@/services/connectors/connector-error";
import { PubMedClient } from "@/services/connectors/pubmed/pubmed-client";
import { buildPubMedApiQuery } from "@/services/connectors/pubmed/pubmed-search-strategy";

export const dynamic = "force-dynamic";

const pubmed = new PubMedClient();
const categorySchema = z.enum([
  "disease_landscape",
  "historical_benchmark",
  "target_moa",
  "similar_drugs",
  "study_design",
  "safety",
]);
const datePresetSchema = z.enum([
  "all",
  "last_5_years",
  "last_10_years",
  "custom",
]);

export async function GET(request: NextRequest) {
  try {
    const parameters = request.nextUrl.searchParams;
    const strategy: PubMedSearchStrategy = {
      category: categorySchema.parse(parameters.get("category")),
      query: z.string().min(1).max(2_000).parse(parameters.get("query")),
      datePreset: datePresetSchema.parse(
        parameters.get("datePreset") ?? "all",
      ),
      customStartDate: parameters.get("customStartDate") || undefined,
      customEndDate: parameters.get("customEndDate") || undefined,
      publicationTypes: (parameters.get("publicationTypes") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    };
    const pageSize = z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .parse(parameters.get("pageSize") ?? "20");
    const appliedQuery = buildPubMedApiQuery(strategy);
    const result = await pubmed.search({
      query: appliedQuery,
      pageSize,
      pageToken: parameters.get("pageToken") || undefined,
    });

    return NextResponse.json({
      status: result.items.length ? "connected" : "no_results",
      data: result.items,
      pagination: {
        totalCount: result.totalCount,
        nextPageToken: result.nextPageToken,
      },
      appliedStrategy: strategy,
      appliedQuery,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        status: "failed",
        error: {
          code: "invalid_request",
          message: "One or more PubMed search parameters are invalid.",
        },
      },
      { status: 400 },
    );
  }
  if (isConnectorError(error)) {
    return NextResponse.json(
      {
        status:
          error.code === "rate_limited" ? "rate_limited" : "failed",
        error: {
          code: error.code,
          message: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
        },
      },
      { status: error.status },
    );
  }
  return NextResponse.json(
    {
      status: "failed",
      error: {
        code: "internal_error",
        message: "An unexpected server error occurred.",
      },
    },
    { status: 500 },
  );
}
