"use client";

import { useEffect, useState } from "react";

import type {
  Assessment,
  EvidenceExtraction,
  EvidenceFieldKey,
  ExtractedEvidenceField,
} from "@/domain/models";
import { LocalStorageAssessmentRepository } from "@/repositories/browser/assessment-repository";
import { LocalStorageEvidenceExtractionRepository } from "@/repositories/browser/evidence-extraction-repository";
import {
  LocalStoragePublicationSelectionRepository,
  type SavedPublicationEvidence,
} from "@/repositories/browser/publication-selection-repository";
import type { EvidenceExtractionProviderDescriptor } from "@/services/ai/evidence-extraction-contract";
import { DemoBadge } from "@/components/layout/demo-badge";
import { PageGuide } from "@/components/layout/page-guide";
import { WorkflowProgress } from "@/components/layout/workflow-progress";
import { assessmentDisplayTitle, isDemoAssessment } from "@/lib/demo-assessment";
import { pageGuides } from "@/lib/ui-copy";

const assessmentRepository = new LocalStorageAssessmentRepository();
const selectionRepository =
  new LocalStoragePublicationSelectionRepository();
const extractionRepository =
  new LocalStorageEvidenceExtractionRepository();

export function EvidenceMatrix({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [evidence, setEvidence] = useState<SavedPublicationEvidence[]>([]);
  const [extractions, setExtractions] = useState<EvidenceExtraction[]>([]);
  const [provider, setProvider] =
    useState<EvidenceExtractionProviderDescriptor | null>(null);

  useEffect(() => {
    async function load() {
      const providerResponse = await fetch("/api/evidence-extraction");
      if (!providerResponse.ok) return;
      const descriptor =
        (await providerResponse.json()) as EvidenceExtractionProviderDescriptor;
      const [savedAssessment, savedEvidence, savedExtractions] =
        await Promise.all([
          assessmentRepository.getById(assessmentId),
          selectionRepository.list(assessmentId),
          extractionRepository.list(assessmentId, descriptor.isMock),
        ]);
      setProvider(descriptor);
      setAssessment(savedAssessment);
      setEvidence(savedEvidence);
      setExtractions(savedExtractions);
    }
    load();
  }, [assessmentId]);

  const extractionByPmid = new Map(
    extractions.map((item) => [item.pmid, item]),
  );
  const approvedFields = extractions.flatMap((item) => item.fields).filter(
    (field) => field.reviewStatus === "approved",
  ).length;

  return (
    <div className="min-w-0">
      <WorkflowProgress assessmentId={assessmentId} />
      <div className="mb-5 flex items-start justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">
              {assessmentId} · 근거 비교표
            </p>
            {isDemoAssessment(assessmentId) ? <DemoBadge compact /> : null}
          </div>
          <h1 className="mt-2 text-2xl font-semibold">
            {assessmentDisplayTitle(assessmentId, assessment?.candidate.name)}
          </h1>
          <PageGuide>{pageGuides.matrix}</PageGuide>
        </div>
        <a
          className="text-xs font-semibold text-[var(--accent)] underline"
          href={`/assessments/${assessmentId}/evidence`}
        >
          문헌 근거로 이동
        </a>
      </div>
      {provider?.isMock ? (
        <div className="mb-5 border border-[#d5a72f] bg-[#fff8dc] px-5 py-3 text-sm font-semibold text-[#785600]">
          DEMO MODE — Mock AI Extraction · fixture-v1
        </div>
      ) : null}
      <section className="border border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-semibold">선택 문헌 비교</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {evidence.length}건 문헌 · {approvedFields}개 검토 완료 항목
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] border-collapse text-left text-xs">
            <thead className="bg-[#f8f9fb] uppercase tracking-wide text-[var(--muted)]">
              <tr>
                {[
                  "문헌",
                  "대상 환자군",
                  "치료차수",
                  "시험약 / 대조군",
                  "N",
                  "시험 설계",
                  "일차 평가변수",
                  "ORR",
                  "PFS",
                  "OS",
                  "안전성",
                  "출처",
                ].map((heading) => (
                  <th
                    className="border-b border-[var(--border)] px-3 py-3"
                    key={heading}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {evidence.map(({ publication }) => {
                const extraction = extractionByPmid.get(publication.pmid);
                return (
                  <tr
                    className="border-b border-[var(--border)] align-top"
                    key={publication.pmid}
                  >
                    <td className="max-w-[360px] px-3 py-3 font-medium">
                      {publication.title}
                      {extraction?.isMock ? (
                        <span className="mt-2 block w-fit border border-[#d5a72f] bg-[#fff8dc] px-2 py-1 text-[10px] font-semibold text-[#785600]">
                          DEMO DATA
                        </span>
                      ) : null}
                      <a
                        className="mt-2 block text-[10px] font-semibold text-[var(--accent)] underline"
                        href={`/assessments/${assessmentId}/evidence/review/${publication.pmid}`}
                      >
                        담당자 검토
                      </a>
                    </td>
                    <MatrixValue
                      field={findField(extraction, "population")}
                    />
                    <MatrixValue
                      field={findField(extraction, "line_of_therapy")}
                    />
                    <MatrixValue
                      field={combineFields(
                        findField(extraction, "treatment"),
                        findField(extraction, "comparator"),
                      )}
                    />
                    <MatrixValue
                      field={findField(extraction, "sample_size")}
                    />
                    <MatrixValue
                      field={findField(extraction, "study_design")}
                    />
                    <MatrixValue
                      field={findField(extraction, "primary_endpoint")}
                    />
                    <MatrixValue field={findField(extraction, "orr")} />
                    <MatrixValue field={findField(extraction, "pfs")} />
                    <MatrixValue field={findField(extraction, "os")} />
                    <MatrixValue
                      field={findField(extraction, "safety_findings")}
                    />
                    <td className="px-3 py-3">
                      <a
                        className="font-semibold text-[var(--accent)] underline"
                        href={publication.sourceUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        PMID {publication.pmid}
                      </a>
                    </td>
                  </tr>
                );
              })}
              {!evidence.length ? (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-[var(--muted)]"
                    colSpan={12}
                  >
                    선택된 문헌이 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MatrixValue({
  field,
}: {
  field?: ExtractedEvidenceField;
}) {
  if (!field) {
    return (
      <td className="px-3 py-3 text-[var(--muted)]">미추출</td>
    );
  }
  if (field.reviewStatus !== "approved") {
    return (
      <td className="px-3 py-3 text-[var(--muted)]">
        {field.reviewStatus === "rejected"
          ? "제외"
          : "AI 추출값 — 미검토"}
      </td>
    );
  }
  const value = Array.isArray(field.reviewedValue)
    ? field.reviewedValue.join("; ")
    : String(field.reviewedValue ?? "확인되지 않음");
  return (
    <td className="px-3 py-3" title={field.sourceText}>
      <span className="font-medium">{value}</span>
      {field.reviewedUnit ? (
        <span className="ml-1 text-[var(--muted)]">
          {field.reviewedUnit}
        </span>
      ) : null}
      <span className="mt-1 block text-[10px] font-semibold text-[#2f6f61]">
        검토 완료 · PMID {field.pmid}
      </span>
    </td>
  );
}

function findField(
  extraction: EvidenceExtraction | undefined,
  key: EvidenceFieldKey,
) {
  return extraction?.fields.find((field) => field.field === key);
}

function combineFields(
  treatment: ExtractedEvidenceField | undefined,
  comparator: ExtractedEvidenceField | undefined,
) {
  if (!treatment) return comparator;
  if (!comparator || treatment.reviewStatus !== "approved") return treatment;
  const treatmentValue = Array.isArray(treatment.reviewedValue)
    ? treatment.reviewedValue.join("; ")
    : String(treatment.reviewedValue ?? "");
  const comparatorValue = Array.isArray(comparator.reviewedValue)
    ? comparator.reviewedValue.join("; ")
    : String(comparator.reviewedValue ?? "");
  return {
    ...treatment,
    reviewedValue: `${treatmentValue} / ${comparatorValue}`,
    sourceText: [treatment.sourceText, comparator.sourceText]
      .filter(Boolean)
      .join("\n"),
  };
}
