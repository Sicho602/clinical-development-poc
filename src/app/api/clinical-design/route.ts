import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getEvidenceExtractionProviderDescriptor } from "@/services/ai/evidence-extraction-provider-factory";
import { createIdleTrialDesignComparison } from "@/services/ai/trial-design-comparator";
import { buildClinicalDesignComparison } from "@/services/clinical-design/compare-clinical-design";
import {
  createFailedDesignProfile,
  extractClinicalDesignProfile,
} from "@/services/clinical-design/extract-clinical-design";
import { ClinicalTrialsClient } from "@/services/connectors/clinical-trials/clinical-trials-client";
import { ConnectorError } from "@/services/connectors/connector-error";
import { connectorErrorResponse } from "@/services/connectors/http-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const extractSchema = z.object({
  assessmentId: z.string().min(1).max(80),
  nctIds: z.array(z.string().regex(/^NCT\d{8}$/i)).min(1).max(12),
});

const clinicalTrials = new ClinicalTrialsClient();

export async function GET() {
  const descriptor = getEvidenceExtractionProviderDescriptor();
  const idle = createIdleTrialDesignComparison(
    descriptor.isMock
      ? "현재 AI Provider가 mock으로 설정되어 있어 임상 디자인 AI 분석을 실행하지 않습니다."
      : "Phase 1는 API 추출과 프로그램 비교만 수행하며, AI 시사점 생성은 이후 Phase에서 연결합니다.",
  );
  return NextResponse.json({
    extraction: "api",
    comparisonAi: idle.status,
    provider: descriptor.provider,
    isMock: descriptor.isMock,
    reason: idle.reason,
  });
}

export async function POST(request: NextRequest) {
  try {
    const input = extractSchema.parse(await request.json());
    const nctIds = Array.from(
      new Set(input.nctIds.map((nctId) => nctId.trim().toUpperCase())),
    );
    const profiles = [];

    for (const nctId of nctIds) {
      try {
        const rawStudy = await clinicalTrials.getRawStudy(nctId);
        if (!rawStudy) {
          profiles.push(
            createFailedDesignProfile(nctId, "해당 임상시험을 찾지 못했습니다."),
          );
          continue;
        }
        profiles.push(extractClinicalDesignProfile(rawStudy));
      } catch (error) {
        const message =
          error instanceof ConnectorError
            ? error.message
            : "ClinicalTrials.gov 상세정보를 수집하지 못했습니다.";
        profiles.push(createFailedDesignProfile(nctId, message));
      }
    }

    const comparison = buildClinicalDesignComparison({
      assessmentId: input.assessmentId,
      profiles,
    });

    return NextResponse.json({
      status: comparison.jobStatus,
      data: comparison,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          status: "failed",
          error: {
            code: "invalid_request",
            message: "선택한 NCT ID 목록이 올바르지 않습니다.",
          },
        },
        { status: 400 },
      );
    }
    return connectorErrorResponse(error);
  }
}
