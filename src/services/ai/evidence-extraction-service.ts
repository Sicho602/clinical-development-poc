import "server-only";

import { z } from "zod";

import type {
  EvidenceExtractionApiResult,
  ExtractionPublicationPayload,
} from "@/services/ai/evidence-extraction-contract";
import {
  evidenceExtractionSystemPrompt,
  evidenceFieldKeys,
} from "@/services/ai/evidence-extraction-contract";

const fieldSchema = z.object({
  field: z.enum(evidenceFieldKeys),
  value: z.union([
    z.string(),
    z.number(),
    z.array(z.string()),
  ]),
  unit: z.string().optional(),
  sourceText: z.string().min(1),
});

const providerResponseSchema = z.object({
  fields: z.array(fieldSchema),
});

const chatCompletionSchema = z.object({
  model: z.string().optional(),
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string(),
      }),
    }),
  ).min(1),
});

export class ExtractionServiceNotConnectedError extends Error {
  constructor() {
    super(
      "AI Evidence Extraction provider is not connected. Configure EVIDENCE_EXTRACTION_API_URL.",
    );
    this.name = "ExtractionServiceNotConnectedError";
  }
}

export interface EvidenceExtractionService {
  extract(
    publication: ExtractionPublicationPayload,
  ): Promise<EvidenceExtractionApiResult>;
}

export class RemoteEvidenceExtractionService
  implements EvidenceExtractionService
{
  async extract(
    publication: ExtractionPublicationPayload,
  ): Promise<EvidenceExtractionApiResult> {
    const endpoint = process.env.EVIDENCE_EXTRACTION_API_URL;
    if (!endpoint) throw new ExtractionServiceNotConnectedError();
    if (!publication.abstract) {
      throw new Error("Abstract가 없어 AI Evidence Extraction을 실행할 수 없습니다.");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.EVIDENCE_EXTRACTION_API_KEY
          ? {
              Authorization: `Bearer ${process.env.EVIDENCE_EXTRACTION_API_KEY}`,
            }
          : {}),
      },
      body: JSON.stringify({
        ...(process.env.EVIDENCE_EXTRACTION_MODEL
          ? { model: process.env.EVIDENCE_EXTRACTION_MODEL }
          : {}),
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: evidenceExtractionSystemPrompt },
          {
            role: "user",
            content: JSON.stringify({
              pmid: publication.pmid,
              title: publication.title,
              abstract: publication.abstract,
              publicationTypes: publication.publicationTypes,
              evidenceCategories: publication.evidenceCategories,
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(
        `AI Evidence Extraction provider failed (${response.status}).`,
      );
    }

    const completion = chatCompletionSchema.parse(await response.json());
    const parsed = providerResponseSchema.parse(
      JSON.parse(stripCodeFence(completion.choices[0].message.content)),
    );
    const now = new Date().toISOString();
    const acceptedFields = parsed.fields.filter((field) =>
      sourceSpanExists(publication.abstract ?? "", field.sourceText),
    );
    const fields = acceptedFields
      .map((field) => ({
        field: field.field,
        originalAiValue: field.value,
        originalAiUnit: field.unit,
        reviewedValue: field.value,
        reviewedUnit: field.unit,
        pmid: publication.pmid,
        sourceText: field.sourceText,
        reviewStatus: "ai_draft" as const,
        modified: false,
      }));

    return {
      pmid: publication.pmid,
      fields,
      issues: parsed.fields
        .filter(
          (field) =>
            !sourceSpanExists(
              publication.abstract ?? "",
              field.sourceText,
            ),
        )
        .map((field) => ({
          field: field.field,
          code: "SOURCE_MISMATCH" as const,
          value: field.value,
          unit: field.unit,
          sourceText: field.sourceText,
        })),
      provider: "openai-compatible",
      model: completion.model ?? process.env.EVIDENCE_EXTRACTION_MODEL,
      isMock: false,
      extractedAt: now,
    };
  }
}

function sourceSpanExists(abstract: string, sourceText: string) {
  return normalizeText(abstract).includes(normalizeText(sourceText));
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function stripCodeFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}
