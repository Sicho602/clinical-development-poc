import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { ExtractionPublicationPayload } from "@/services/ai/evidence-extraction-contract";
import {
  createEvidenceExtractionProvider,
  getEvidenceExtractionProviderDescriptor,
} from "@/services/ai/evidence-extraction-provider-factory";
import {
  ExtractionServiceNotConnectedError,
} from "@/services/ai/evidence-extraction-service";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  publication: z.object({
    pmid: z.string().regex(/^\d+$/),
    title: z.string().min(1).max(2_000),
    abstract: z.string().min(1).max(100_000),
    publicationTypes: z.array(z.string().max(200)).max(50),
    evidenceCategories: z.array(z.string().max(100)).max(20),
  }).strict(),
}).strict();

export async function GET() {
  return NextResponse.json(getEvidenceExtractionProviderDescriptor());
}

export async function POST(request: NextRequest) {
  try {
    const input = requestSchema.parse(await request.json());
    const service = createEvidenceExtractionProvider();
    const extraction = await service.extract(
      input.publication as ExtractionPublicationPayload,
    );
    return NextResponse.json({ status: "extracted", data: extraction });
  } catch (error) {
    if (error instanceof ExtractionServiceNotConnectedError) {
      return NextResponse.json(
        {
          status: "not_connected",
          error: { code: "not_connected", message: error.message },
        },
        { status: 503 },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          status: "failed",
          error: {
            code: "invalid_request",
            message: "Evidence Extraction request is invalid.",
          },
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        status: "failed",
        error: {
          code: "extraction_failed",
          message: "Evidence Extraction provider request failed.",
        },
      },
      { status: 502 },
    );
  }
}
