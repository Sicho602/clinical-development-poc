import "server-only";

import type {
  EvidenceExtractionApiResult,
  ExtractionPublicationPayload,
} from "@/services/ai/evidence-extraction-contract";
import type { EvidenceFieldValue } from "@/domain/models";
import type { EvidenceExtractionService } from "@/services/ai/evidence-extraction-service";
import fixtureData from "@/services/ai/fixtures/evidence-extraction-fixtures.json";

interface FixtureField {
  field: EvidenceExtractionApiResult["fields"][number]["field"];
  value: EvidenceFieldValue;
  unit?: string;
  sourceText: string;
}

interface Fixture {
  provider: "mock";
  model: "fixture-v1";
  isMock: true;
  fields: FixtureField[];
}

const fixtures = fixtureData as Record<string, Fixture>;

export class MockEvidenceExtractionProvider
  implements EvidenceExtractionService
{
  async extract(
    publication: ExtractionPublicationPayload,
  ): Promise<EvidenceExtractionApiResult> {
    const fixture = fixtures[publication.pmid];
    if (!fixture) {
      throw new Error(
        `No deterministic mock fixture exists for PMID ${publication.pmid}.`,
      );
    }

    const validFields = fixture.fields.filter((field) =>
      sourceSpanExists(publication.abstract, field.sourceText),
    );
    return {
      pmid: publication.pmid,
      fields: validFields.map((field) => ({
        field: field.field,
        originalAiValue: field.value,
        originalAiUnit: field.unit,
        reviewedValue: field.value,
        reviewedUnit: field.unit,
        pmid: publication.pmid,
        sourceText: field.sourceText,
        reviewStatus: "ai_draft",
        modified: false,
      })),
      issues: fixture.fields
        .filter(
          (field) =>
            !sourceSpanExists(publication.abstract, field.sourceText),
        )
        .map((field) => ({
          field: field.field,
          code: "SOURCE_MISMATCH",
          value: field.value,
          unit: field.unit,
          sourceText: field.sourceText,
        })),
      provider: fixture.provider,
      model: fixture.model,
      isMock: fixture.isMock,
      extractedAt: new Date().toISOString(),
    };
  }
}

function sourceSpanExists(abstract: string, sourceText: string) {
  const normalize = (value: string) =>
    value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  return normalize(abstract).includes(normalize(sourceText));
}
