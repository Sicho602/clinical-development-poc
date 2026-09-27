"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  Assessment,
  EvidenceExtraction,
  EvidenceFieldKey,
  EvidenceFieldValue,
  ExtractedEvidenceField,
  Publication,
} from "@/domain/models";
import { LocalStorageAssessmentRepository } from "@/repositories/browser/assessment-repository";
import { LocalStorageEvidenceExtractionRepository } from "@/repositories/browser/evidence-extraction-repository";
import {
  LocalStoragePublicationSelectionRepository,
  type SavedPublicationEvidence,
} from "@/repositories/browser/publication-selection-repository";
import {
  evidenceFieldKeys,
  evidenceFieldLabels,
  materializeEvidenceExtraction,
  toExtractionPublicationPayload,
  type EvidenceExtractionApiResult,
  type EvidenceExtractionProviderDescriptor,
} from "@/services/ai/evidence-extraction-contract";
import { DemoBadge } from "@/components/layout/demo-badge";
import { PageGuide } from "@/components/layout/page-guide";
import { WorkflowProgress } from "@/components/layout/workflow-progress";
import { isDemoAssessment } from "@/lib/demo-assessment";
import { pageGuides } from "@/lib/ui-copy";

const assessmentRepository = new LocalStorageAssessmentRepository();
const extractionRepository =
  new LocalStorageEvidenceExtractionRepository();
const selectionRepository =
  new LocalStoragePublicationSelectionRepository();

interface ExtractionResponse {
  status: "extracted" | "not_connected" | "failed";
  data?: EvidenceExtractionApiResult;
  error?: { message: string };
}

interface EditState {
  field: EvidenceFieldKey;
  value: string;
  unit: string;
  sourceText: string;
}

export function EvidenceReviewWorkspace({
  assessmentId,
  pmid,
}: {
  assessmentId: string;
  pmid: string;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [publication, setPublication] = useState<Publication | null>(null);
  const [extraction, setExtraction] =
    useState<EvidenceExtraction | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [provider, setProvider] =
    useState<EvidenceExtractionProviderDescriptor | null>(null);

  useEffect(() => {
    async function load() {
      const providerResponse = await fetch("/api/evidence-extraction");
      if (!providerResponse.ok) {
        throw new Error("Provider configuration unavailable.");
      }
      const descriptor =
        (await providerResponse.json()) as EvidenceExtractionProviderDescriptor;
      const [savedAssessment, selections, savedExtraction] =
        await Promise.all([
          assessmentRepository.getById(assessmentId),
          selectionRepository.list(assessmentId),
          extractionRepository.get(
            assessmentId,
            pmid,
            descriptor.isMock,
          ),
        ]);
        setProvider(descriptor);
        setAssessment(savedAssessment);
        setPublication(findPublication(selections, pmid));
        setExtraction(savedExtraction);
    }
    load().catch(() =>
      setError("Evidence review 데이터를 불러오지 못했습니다."),
    );
  }, [assessmentId, pmid]);

  const fieldsByKey = useMemo(
    () =>
      new Map(
        (extraction?.fields ?? []).map((field) => [field.field, field]),
      ),
    [extraction],
  );
  const approvedCount =
    extraction?.fields.filter(
      (field) => field.reviewStatus === "approved",
    ).length ?? 0;

  async function runExtraction() {
    if (!publication || !provider) return;
    setIsExtracting(true);
    setError(null);
    await extractionRepository.setStatus(
      assessmentId,
      pmid,
      provider.isMock,
      "extracting",
    );
    try {
      const response = await fetch("/api/evidence-extraction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publication: toExtractionPublicationPayload(publication),
        }),
      });
      const payload = (await response.json()) as ExtractionResponse;
      if (!response.ok || !payload.data) {
        const next = await extractionRepository.setStatus(
          assessmentId,
          pmid,
          provider.isMock,
          payload.status === "not_connected" ? "not_connected" : "failed",
          payload.error?.message,
        );
        setExtraction(next);
        setError(payload.error?.message ?? "AI extraction에 실패했습니다.");
        return;
      }
      const saved = await extractionRepository.save(
        materializeEvidenceExtraction(assessmentId, payload.data),
      );
      setExtraction(saved);
    } catch {
      const next = await extractionRepository.setStatus(
        assessmentId,
        pmid,
        provider.isMock,
        "failed",
        "Evidence Extraction API에 연결할 수 없습니다.",
      );
      setExtraction(next);
      setError(next.errorMessage ?? null);
    } finally {
      setIsExtracting(false);
    }
  }

  async function approveField(field: ExtractedEvidenceField) {
    const next = await extractionRepository.reviewField(
      assessmentId,
      pmid,
      extraction?.isMock ?? provider?.isMock ?? false,
      field.field,
      {
        action: "approve",
        reviewer: assessment?.owner ?? "Clinical Reviewer",
      },
    );
    setExtraction(next);
  }

  async function rejectField(field: EvidenceFieldKey) {
    const next = await extractionRepository.reviewField(
      assessmentId,
      pmid,
      extraction?.isMock ?? provider?.isMock ?? false,
      field,
      {
        action: "reject",
        reviewer: assessment?.owner ?? "Clinical Reviewer",
      },
    );
    setExtraction(next);
  }

  function beginEdit(
    field: EvidenceFieldKey,
    current?: ExtractedEvidenceField,
  ) {
    setEditState({
      field,
      value: formatValue(
        current?.reviewedValue ?? current?.originalAiValue ?? "",
      ),
      unit: current?.reviewedUnit ?? current?.originalAiUnit ?? "",
      sourceText: current?.sourceText ?? "",
    });
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editState || !publication) return;
    if (
      publication.abstract &&
      !sourceSpanExists(publication.abstract, editState.sourceText)
    ) {
      setError(
        "Source Text는 현재 PubMed abstract에서 확인 가능한 문구여야 합니다.",
      );
      return;
    }
    const next = await extractionRepository.reviewField(
      assessmentId,
      pmid,
      extraction?.isMock ?? provider?.isMock ?? false,
      editState.field,
      {
        action: "edit",
        value: parseReviewedValue(editState.value),
        unit: editState.unit || undefined,
        sourceText: editState.sourceText,
        reviewer: assessment?.owner ?? "Clinical Reviewer",
      },
    );
    setExtraction(next);
    setError(null);
    setEditState(null);
  }

  if (!publication) {
    return (
      <p className="border border-[var(--border)] bg-white p-6 text-sm">
        선택된 Publication을 찾을 수 없습니다.
      </p>
    );
  }

  return (
    <div className="min-w-0">
      <WorkflowProgress assessmentId={assessmentId} />
      <header className="mb-5 border border-[var(--border)] bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">
                {assessmentId} · 담당자 검토
              </p>
              {isDemoAssessment(assessmentId) ? <DemoBadge compact /> : null}
            </div>
            <PageGuide>{pageGuides.review}</PageGuide>
            <h1 className="mt-2 max-w-4xl text-xl font-semibold">
              {publication.title}
            </h1>
            <a
              className="mt-2 inline-block text-xs font-semibold text-[var(--accent)] underline"
              href={publication.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              PMID {pmid}
            </a>
          </div>
          <div className="flex gap-3">
            <a
              className="border border-[var(--border)] px-4 py-2 text-xs font-semibold"
              href={`/assessments/${assessmentId}/evidence`}
            >
              문헌 근거로 이동
            </a>
            <button
              className="bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              disabled={isExtracting || !publication.abstract}
              onClick={runExtraction}
              type="button"
            >
              {isExtracting ? "추출 중…" : "주요 정보 추출"}
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--muted)]">
          <span>
            추출: {statusLabel(extraction?.extractionStatus)}
          </span>
          <span>검토 완료 항목: {approvedCount}</span>
          <span>
            Provider: {extraction?.provider ?? "미연결"}
          </span>
        </div>
      </header>

      {provider?.isMock ? (
        <div className="mb-5 border border-[#d5a72f] bg-[#fff8dc] px-5 py-3 text-sm font-semibold text-[#785600]">
          DEMO MODE — Mock AI Extraction · fixture-v1
        </div>
      ) : null}

      {error ? (
        <div className="mb-5 border border-[#f0b8b4] bg-[#fff4f3] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <section className="mb-5 border border-[#e1c986] bg-[#fffbed] px-5 py-4 text-xs leading-5">
        <strong>추적 규칙:</strong> 각 값은 PMID와 초록 근거 원문을 개별
        보존합니다. 기존 치료성과 기준과 임상개발 전략에는 검토 완료된 값만
        사용할 수 있습니다.
      </section>

      <section className="border border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-semibold">추출 항목</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            AI 추출값과 담당자 검토값을 분리해 보존합니다.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] border-collapse text-left text-xs">
            <thead className="bg-[#f8f9fb] uppercase tracking-wide text-[var(--muted)]">
              <tr>
                {[
                  "항목",
                  "AI 추출값",
                  "담당자 검토값",
                  "단위",
                  "PMID / 근거 원문",
                  "검토",
                  "작업",
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
              {evidenceFieldKeys.map((key) => {
                const field = fieldsByKey.get(key);
                return (
                  <FieldRow
                    field={field}
                    fieldKey={key}
                    key={key}
                    onApprove={approveField}
                    onEdit={beginEdit}
                    onReject={rejectField}
                    publication={publication}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editState ? (
        <EditFieldPanel
          editState={editState}
          onCancel={() => setEditState(null)}
          onChange={setEditState}
          onSubmit={saveEdit}
          publication={publication}
        />
      ) : null}
    </div>
  );
}

function FieldRow({
  fieldKey,
  field,
  publication,
  onApprove,
  onEdit,
  onReject,
}: {
  fieldKey: EvidenceFieldKey;
  field?: ExtractedEvidenceField;
  publication: Publication;
  onApprove: (field: ExtractedEvidenceField) => void;
  onEdit: (
    key: EvidenceFieldKey,
    field?: ExtractedEvidenceField,
  ) => void;
  onReject: (key: EvidenceFieldKey) => void;
}) {
  return (
    <tr className="border-b border-[var(--border)] align-top">
      <td className="px-3 py-3 font-semibold">
        {evidenceFieldLabels[fieldKey]}
      </td>
      <td className="max-w-56 px-3 py-3">
        {field?.originalAiValue !== null &&
        field?.originalAiValue !== undefined
          ? formatValue(field.originalAiValue)
          : "미추출"}
      </td>
      <td className="max-w-56 px-3 py-3">
        {field?.reviewStatus === "approved"
          ? formatValue(field.reviewedValue)
          : "미검토"}
        {field?.modified ? (
          <span className="mt-1 block text-[10px] font-semibold text-[#8a5a00]">
            담당자 수정
          </span>
        ) : null}
      </td>
      <td className="px-3 py-3">
        {field?.reviewedUnit ?? field?.originalAiUnit ?? "—"}
      </td>
      <td className="max-w-[430px] px-3 py-3">
        <a
          className="font-semibold text-[var(--accent)] underline"
          href={publication.sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          PMID {publication.pmid}
        </a>
        <p className="mt-1 whitespace-pre-wrap leading-5 text-[var(--muted)]">
          {field?.sourceText
            ? `“${field.sourceText}”`
            : "항목별 근거 원문 없음"}
        </p>
      </td>
      <td className="px-3 py-3">
        <ReviewBadge status={field?.reviewStatus} />
        {field?.reviewer ? (
          <span className="mt-1 block text-[10px] text-[var(--muted)]">
            {field.reviewer}
            {field.reviewedAt
              ? ` · ${new Date(field.reviewedAt).toLocaleDateString()}`
              : ""}
          </span>
        ) : null}
      </td>
      <td className="px-3 py-3">
        <div className="flex gap-2">
          <button
            className="font-semibold text-[var(--accent)] disabled:text-[var(--muted)]"
            disabled={!field || field.originalAiValue === null}
            onClick={() => field && onApprove(field)}
            type="button"
          >
            검토 완료
          </button>
          <button
            className="font-semibold"
            onClick={() => onEdit(fieldKey, field)}
            type="button"
          >
            수정
          </button>
          <button
            className="font-semibold text-[var(--danger)] disabled:text-[var(--muted)]"
            disabled={!field}
            onClick={() => onReject(fieldKey)}
            type="button"
          >
            제외
          </button>
        </div>
      </td>
    </tr>
  );
}

function EditFieldPanel({
  editState,
  publication,
  onChange,
  onCancel,
  onSubmit,
}: {
  editState: EditState;
  publication: Publication;
  onChange: (state: EditState) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/20"
      onMouseDown={onCancel}
      role="presentation"
    >
      <aside
        aria-label={`Edit ${evidenceFieldLabels[editState.field]}`}
        className="ml-auto h-full w-full max-w-[620px] overflow-y-auto border-l border-[var(--border)] bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form className="p-6" onSubmit={onSubmit}>
          <div className="mb-5 flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-[var(--accent)]">
                담당자 검토
              </p>
              <h2 className="mt-2 text-lg font-semibold">
                {evidenceFieldLabels[editState.field]}
              </h2>
            </div>
            <button onClick={onCancel} type="button">
              ×
            </button>
          </div>
          <label className="block text-xs font-semibold">
            담당자 검토값
            <textarea
              className="mt-2 min-h-24 w-full border border-[var(--border)] p-3 text-sm"
              onChange={(event) =>
                onChange({ ...editState, value: event.target.value })
              }
              required
              value={editState.value}
            />
          </label>
          <label className="mt-4 block text-xs font-semibold">
            단위
            <input
              className="mt-2 w-full border border-[var(--border)] p-3 text-sm"
              onChange={(event) =>
                onChange({ ...editState, unit: event.target.value })
              }
              placeholder="%, months, patients"
              value={editState.unit}
            />
          </label>
          <label className="mt-4 block text-xs font-semibold">
            초록 근거 원문
            <textarea
              className="mt-2 min-h-32 w-full border border-[var(--border)] p-3 text-sm"
              onChange={(event) =>
                onChange({
                  ...editState,
                  sourceText: event.target.value,
                })
              }
              required
              value={editState.sourceText}
            />
          </label>
          <details className="mt-4 border border-[var(--border)] p-3 text-xs">
            <summary className="cursor-pointer font-semibold">
              PMID {publication.pmid} 초록
            </summary>
            <p className="mt-3 whitespace-pre-wrap leading-5 text-[var(--muted)]">
              {publication.abstract ?? "확인되지 않음"}
            </p>
          </details>
          <div className="mt-5 flex justify-end gap-3">
            <button
              className="border border-[var(--border)] px-4 py-2 text-xs font-semibold"
              onClick={onCancel}
              type="button"
            >
              취소
            </button>
            <button
              className="bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
              type="submit"
            >
              저장 후 검토 완료
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function ReviewBadge({
  status,
}: {
  status?: ExtractedEvidenceField["reviewStatus"];
}) {
  const label =
    status === "approved"
      ? "검토 완료"
      : status === "rejected"
        ? "제외"
        : status === "ai_draft"
          ? "AI 추출값"
          : "미추출";
  return (
    <span className="border border-[var(--border)] bg-[#f8f9fb] px-2 py-1 text-[10px] font-semibold">
      {label}
    </span>
  );
}

function findPublication(
  selections: SavedPublicationEvidence[],
  pmid: string,
) {
  const selection = selections.find(
    (item) => item.publication.pmid === pmid,
  );
  return selection
    ? {
        ...selection.publication,
        evidenceCategories: selection.categories,
      }
    : null;
}

function formatValue(value: EvidenceFieldValue | null | "") {
  if (value === null || value === "") return "확인되지 않음";
  return Array.isArray(value) ? value.join("; ") : String(value);
}

function parseReviewedValue(value: string): EvidenceFieldValue {
  const trimmed = value.trim();
  const numeric = Number(trimmed);
  return trimmed !== "" && Number.isFinite(numeric) ? numeric : trimmed;
}

function sourceSpanExists(abstract: string, sourceText: string) {
  const normalize = (value: string) =>
    value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  return normalize(abstract).includes(normalize(sourceText));
}

function statusLabel(
  status: EvidenceExtraction["extractionStatus"] | undefined,
) {
  if (!status) return "미추출";
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
