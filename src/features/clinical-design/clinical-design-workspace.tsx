"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  ClinicalDesignComparison,
  ClinicalDesignDomain,
  ClinicalDesignFieldKey,
  DesignAutomationStatus,
  SourcedDesignField,
} from "@/domain/models";
import type { SavedReferenceTrial } from "@/repositories/browser/reference-trial-repository";
import { LocalStorageClinicalDesignRepository } from "@/repositories/browser/clinical-design-repository";
import {
  applyDesignFieldReview,
  buildClinicalDesignComparison,
} from "@/services/clinical-design/compare-clinical-design";
import {
  effectiveDesignValue,
  formatDesignValue,
} from "@/services/clinical-design/extract-clinical-design";
import {
  clinicalDesignDomainLabels,
  designAiStatusLabels,
  designAutomationStatusLabels,
  designReviewStatusLabels,
} from "@/services/clinical-design/fields";

const repository = new LocalStorageClinicalDesignRepository();

interface ExtractResponse {
  status: DesignAutomationStatus;
  data?: ClinicalDesignComparison;
  error?: { message: string };
}

export function ClinicalDesignWorkspace({
  assessmentId,
  references,
}: {
  assessmentId: string;
  references: SavedReferenceTrial[];
}) {
  const [record, setRecord] = useState<ClinicalDesignComparison | null>(null);
  const [jobStatus, setJobStatus] =
    useState<DesignAutomationStatus>("not_started");
  const [error, setError] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<{
    nctId: string;
    field: SourcedDesignField;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [aiReason, setAiReason] = useState<string | null>(null);

  const nctIds = useMemo(
    () => references.map((item) => item.trial.nctId),
    [references],
  );

  useEffect(() => {
    void repository.getByAssessmentId(assessmentId).then((saved) => {
      if (!saved) return;
      setRecord(saved);
      setJobStatus(saved.jobStatus);
    });
    void fetch("/api/clinical-design", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { reason?: string }) => {
        setAiReason(payload.reason ?? null);
      })
      .catch(() => {
        setAiReason(null);
      });
  }, [assessmentId]);

  async function extractDesigns() {
    if (!nctIds.length) return;
    setJobStatus("processing");
    setError(null);
    try {
      const response = await fetch("/api/clinical-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId, nctIds }),
      });
      const payload = (await response.json()) as ExtractResponse;
      if (!payload.data) {
        setJobStatus("failed");
        setError(payload.error?.message ?? "임상 디자인을 수집하지 못했습니다.");
        return;
      }
      const previous = await repository.getByAssessmentId(assessmentId);
      const next = buildClinicalDesignComparison({
        assessmentId,
        profiles: payload.data.profiles,
        previous,
      });
      const saved = await repository.save(next);
      setRecord(saved);
      setJobStatus(saved.jobStatus);
    } catch {
      setJobStatus("failed");
      setError("ClinicalTrials.gov 디자인 수집 서비스에 연결하지 못했습니다.");
    }
  }

  async function reviewField(
    action: "approve" | "edit" | "reject",
    fieldKey: ClinicalDesignFieldKey,
    nctId: string,
  ) {
    if (!record) return;
    const next = applyDesignFieldReview(record, nctId, fieldKey, {
      action,
      value: action === "edit" ? parseEditedValue(editValue) : undefined,
      reviewer: "Clinical Reviewer",
    });
    const saved = await repository.save(next);
    setRecord(saved);
    setSelectedField(null);
    setEditValue("");
  }

  const stale =
    record !== null &&
    (record.nctIds.length !== nctIds.length ||
      record.nctIds.some((nctId) => !nctIds.includes(nctId)));

  return (
    <section className="mb-5 border border-[var(--border)] bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div>
          <h2 className="font-semibold">임상 디자인 비교</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            선택한 참고 임상시험의 ClinicalTrials.gov 상세정보를 수집하고,
            환자군·대조군·평가변수·시험설계·표본수를 비교합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={jobStatus} />
          <button
            className="bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            disabled={!nctIds.length || jobStatus === "processing"}
            onClick={() => void extractDesigns()}
            type="button"
          >
            {jobStatus === "processing"
              ? "수집 중…"
              : "선택한 임상시험 디자인 수집"}
          </button>
        </div>
      </div>

      <div className="space-y-2 px-5 py-3 text-xs text-[var(--muted)]">
        <p>
          AI 분석: {record ? designAiStatusLabels[record.aiStatus] : "AI 분석 미실행"}
          {aiReason ? ` · ${aiReason}` : ""}
        </p>
        {stale ? (
          <p className="text-[var(--danger)]">
            참고 임상시험 선택이 변경되었습니다. 비교표를 다시 수집하세요.
          </p>
        ) : null}
        {error ? <p className="text-[var(--danger)]">{error}</p> : null}
      </div>

      {!nctIds.length ? (
        <p className="px-5 pb-5 text-sm text-[var(--muted)]">
          참고 임상시험을 선택한 뒤 디자인 수집을 실행하세요. NCT ID는 하드코딩하지
          않으며, 현재 선택된 시험만 대상입니다.
        </p>
      ) : null}

      {record ? (
        <ComparisonMatrix
          onSelect={(nctId, field) => {
            setSelectedField({ nctId, field });
            setEditValue(
              formatEditableValue(effectiveDesignValue(field)),
            );
          }}
          record={record}
        />
      ) : null}

      {selectedField ? (
        <SourceDetail
          editValue={editValue}
          field={selectedField.field}
          nctId={selectedField.nctId}
          onApprove={() =>
            void reviewField(
              "approve",
              selectedField.field.key,
              selectedField.nctId,
            )
          }
          onCancel={() => setSelectedField(null)}
          onChangeEdit={setEditValue}
          onEdit={() =>
            void reviewField("edit", selectedField.field.key, selectedField.nctId)
          }
          onReject={() =>
            void reviewField(
              "reject",
              selectedField.field.key,
              selectedField.nctId,
            )
          }
        />
      ) : null}
    </section>
  );
}

function ComparisonMatrix({
  record,
  onSelect,
}: {
  record: ClinicalDesignComparison;
  onSelect: (nctId: string, field: SourcedDesignField) => void;
}) {
  let currentDomain: ClinicalDesignDomain | null = null;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-t border-[var(--border)] text-left text-xs">
        <thead className="bg-[#f8f9fb]">
          <tr>
            <th className="sticky left-0 bg-[#f8f9fb] px-4 py-3 font-semibold">
              비교 항목
            </th>
            {record.nctIds.map((nctId) => (
              <th className="px-4 py-3 font-semibold" key={nctId}>
                <a
                  className="text-[var(--accent)] underline"
                  href={`https://clinicaltrials.gov/study/${nctId}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  {nctId}
                </a>
              </th>
            ))}
            <th className="px-4 py-3 font-semibold">차이 요약 (프로그램)</th>
            <th className="px-4 py-3 font-semibold">AI Comparison</th>
            <th className="px-4 py-3 font-semibold">Clinical Implication</th>
            <th className="px-4 py-3 font-semibold">Evidence Source</th>
            <th className="px-4 py-3 font-semibold">Review Status</th>
          </tr>
        </thead>
        <tbody>
          {record.rows.map((row) => {
            const showDomain = row.domain !== currentDomain;
            currentDomain = row.domain;
            return (
              <tr
                className="border-t border-[var(--border)] align-top"
                key={row.fieldKey}
              >
                <th className="sticky left-0 bg-white px-4 py-3 font-medium">
                  {showDomain ? (
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                      {clinicalDesignDomainLabels[row.domain]}
                    </p>
                  ) : null}
                  {row.label}
                </th>
                {record.nctIds.map((nctId) => {
                  const field = row.valuesByNct[nctId];
                  const highlight =
                    row.differenceKind === "different" &&
                    field &&
                    effectiveDesignValue(field) !== null;
                  return (
                    <td
                      className={`px-4 py-3 ${highlight ? "bg-[#fff8e8]" : ""}`}
                      key={`${row.fieldKey}:${nctId}`}
                    >
                      <button
                        className="text-left"
                        onClick={() => field && onSelect(nctId, field)}
                        type="button"
                      >
                        <span>
                          {formatDesignValue(
                            field?.reviewStatus === "re_review_required"
                              ? field.value
                              : effectiveDesignValue(field),
                          )}
                        </span>
                        {field?.reviewStatus === "re_review_required" ? (
                          <span className="mt-1 block text-[10px] font-semibold text-[var(--danger)]">
                            재검토 필요 · 확정 근거 제외
                          </span>
                        ) : null}
                        {field?.extractionMethod === "ai" && !field.value ? (
                          <span className="mt-1 block text-[10px] text-[var(--muted)]">
                            AI 미실행
                          </span>
                        ) : null}
                      </button>
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-[var(--muted)]">
                  {row.programmaticNote}
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">
                  {row.aiComparison ?? designAiStatusLabels[record.aiStatus]}
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">
                  {row.clinicalImplication ?? "AI 분석 미실행"}
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">
                  {record.nctIds.join(", ")}
                </td>
                <td className="px-4 py-3">
                  {designReviewStatusLabels[row.reviewStatus]}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SourceDetail({
  field,
  nctId,
  editValue,
  onChangeEdit,
  onApprove,
  onEdit,
  onReject,
  onCancel,
}: {
  field: SourcedDesignField;
  nctId: string;
  editValue: string;
  onChangeEdit: (value: string) => void;
  onApprove: () => void;
  onEdit: () => void;
  onReject: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border-t border-[var(--border)] px-5 py-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            출처 확인 · {nctId} · {field.key}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            추출 방법: {field.extractionMethod.toUpperCase()} · 검토:{" "}
            {designReviewStatusLabels[field.reviewStatus]}
            {field.missingReason ? ` · ${field.missingReason}` : ""}
            {field.valueChangeKind === "formal"
              ? " · 형식적 변경(승인 유지)"
              : field.reviewStatus === "re_review_required"
                ? " · 실질적 변경 · 재승인 전 확정 근거에서 제외"
                : ""}
          </p>
        </div>
        <button
          className="text-xs font-semibold text-[var(--muted)]"
          onClick={onCancel}
          type="button"
        >
          닫기
        </button>
      </div>
      <dl className="grid gap-2 text-xs md:grid-cols-2">
        <div>
          <dt className="text-[var(--muted)]">현재 API 원본</dt>
          <dd>{formatDesignValue(field.value)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">이전 API 원본</dt>
          <dd>
            {field.previousApiValue !== undefined
              ? formatDesignValue(field.previousApiValue)
              : "변경 없음"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">변경 구분</dt>
          <dd>
            {field.valueChangeKind === "substantive"
              ? "실질적 변경"
              : field.valueChangeKind === "formal"
                ? "형식적 변경"
                : "변경 없음"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">마지막 검토값</dt>
          <dd>
            {field.reviewStatus === "not_reviewed"
              ? "미검토"
              : formatDesignValue(field.reviewedValue ?? null)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">API Field</dt>
          <dd>{field.source?.apiField ?? "—"}</dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-[var(--muted)]">Source URL</dt>
          <dd>
            {field.source?.url ? (
              <a
                className="text-[var(--accent)] underline"
                href={field.source.url}
                rel="noreferrer"
                target="_blank"
              >
                {field.source.url}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        {field.sourceText ? (
          <div className="md:col-span-2">
            <dt className="text-[var(--muted)]">Source Text</dt>
            <dd className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap border border-[var(--border)] bg-[#f8f9fb] p-3">
              {field.sourceText}
            </dd>
          </div>
        ) : null}
      </dl>
      {field.extractionMethod === "ai" && !field.value ? (
        <p className="mt-3 text-xs text-[var(--muted)]">
          AI가 추출한 값이 없어 승인할 근거가 없습니다.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1 text-xs">
            수정값
            <textarea
              className="mt-1 w-full border border-[var(--border)] px-3 py-2"
              onChange={(event) => onChangeEdit(event.target.value)}
              rows={3}
              value={editValue}
            />
          </label>
          <button
            className="border border-[var(--border)] px-3 py-2 text-xs font-semibold"
            onClick={onApprove}
            type="button"
          >
            승인
          </button>
          <button
            className="border border-[var(--border)] px-3 py-2 text-xs font-semibold"
            onClick={onEdit}
            type="button"
          >
            수정 후 승인
          </button>
          <button
            className="text-xs font-semibold text-[var(--danger)]"
            onClick={onReject}
            type="button"
          >
            제외
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: DesignAutomationStatus }) {
  const tone =
    status === "failed"
      ? "text-[var(--danger)]"
      : status === "completed"
        ? "text-[#216e5d]"
        : "text-[var(--muted)]";
  return (
    <span className={`text-xs font-semibold ${tone}`}>
      {designAutomationStatusLabels[status]}
    </span>
  );
}

function formatEditableValue(value: ReturnType<typeof effectiveDesignValue>) {
  if (value === null || value === undefined) return "";
  return Array.isArray(value) ? value.join("\n") : String(value);
}

function parseEditedValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("\n")) {
    return trimmed.split("\n").map((item) => item.trim()).filter(Boolean);
  }
  return trimmed;
}
