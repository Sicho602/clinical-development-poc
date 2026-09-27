import { NextResponse } from "next/server";

import { ClinicalTrialsClient } from "@/services/connectors/clinical-trials/clinical-trials-client";
import { connectorErrorResponse } from "@/services/connectors/http-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

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
            message: "해당 임상시험을 찾지 못했습니다.",
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
    return connectorErrorResponse(error);
  }
}
