import { NextResponse } from "next/server";

import { ClinicalTrialsClient } from "@/services/connectors/clinical-trials/clinical-trials-client";
import { isConnectorError } from "@/services/connectors/connector-error";

export const dynamic = "force-dynamic";

const clinicalTrials = new ClinicalTrialsClient();

export async function GET(
  _request: Request,
  context: { params: Promise<{ nctId: string }> },
) {
  const { nctId } = await context.params;

  try {
    const trial = await clinicalTrials.getByNctId(nctId);

    if (!trial) {
      return NextResponse.json(
        {
          status: "failed",
          error: {
            code: "not_found",
            message: "Clinical trial was not found.",
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      status: "connected",
      data: trial,
    });
  } catch (error) {
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
}
