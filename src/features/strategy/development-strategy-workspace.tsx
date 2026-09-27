"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import type {
  Assessment,
  DevelopmentStrategy,
  DevelopmentStrategyField,
  DevelopmentStrategyFieldKey,
} from "@/domain/models";
import { LocalStorageAssessmentRepository } from "@/repositories/browser/assessment-repository";
import { LocalStorageDevelopmentStrategyRepository } from "@/repositories/browser/development-strategy-repository";
import { LocalStorageEvidenceExtractionRepository } from "@/repositories/browser/evidence-extraction-repository";
import { LocalStorageHistoricalBenchmarkRepository } from "@/repositories/browser/historical-benchmark-repository";
import { LocalStorageReferenceTrialRepository } from "@/repositories/browser/reference-trial-repository";
import type { EvidenceExtractionProviderDescriptor } from "@/services/ai/evidence-extraction-contract";
import {
  buildDevelopmentStrategy,
  mergeStrategyReview,
} from "./development-strategy-builder";
import { DemoBadge } from "@/components/layout/demo-badge";
import { PageGuide } from "@/components/layout/page-guide";
import { WorkflowProgress } from "@/components/layout/workflow-progress";
import {
  assessmentDisplayTitle,
  isDemoAssessment,
  resetDemoStrategyCopy,
} from "@/lib/demo-assessment";
import {
  missingValueCopy,
  pageGuides,
  strategyBasisCopy,
  strategyFieldLabels,
  strategyReviewStatusLabels,
  strategySourceLabels,
  strategyStatusLabels,
} from "@/lib/ui-copy";

const assessmentRepository = new LocalStorageAssessmentRepository();
const strategyRepository =
  new LocalStorageDevelopmentStrategyRepository();
const extractionRepository = new LocalStorageEvidenceExtractionRepository();
const benchmarkRepository =
  new LocalStorageHistoricalBenchmarkRepository();
const referenceRepository = new LocalStorageReferenceTrialRepository();

interface EditState {
  key: DevelopmentStrategyFieldKey;
  value: string;
}

export function DevelopmentStrategyWorkspace({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [strategy, setStrategy] = useState<DevelopmentStrategy | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (isDemoAssessment(assessmentId)) {
        await resetDemoStrategyCopy();
      }
      const providerResponse = await fetch("/api/evidence-extraction");
      if (!providerResponse.ok) throw new Error("Provider unavailable");
      const provider =
        (await providerResponse.json()) as EvidenceExtractionProviderDescriptor;
      const [savedAssessment, references, extractions, benchmark, saved] =
        await Promise.all([
          assessmentRepository.getById(assessmentId),
          referenceRepository.list(assessmentId),
          extractionRepository.list(assessmentId, provider.isMock),
          benchmarkRepository.getByAssessmentId(
            assessmentId,
            provider.isMock,
          ),
          strategyRepository.getByAssessmentId(assessmentId),
        ]);
      if (!savedAssessment) {
        setMessage("검토 과제를 찾을 수 없습니다.");
        return;
      }
      const generated = buildDevelopmentStrategy({
        assessment: savedAssessment,
        referenceTrials: references,
        extractions,
        benchmark,
      });
      const merged = mergeStrategyReview(generated, saved);
      const persisted = await strategyRepository.save(merged);
      setAssessment(savedAssessment);
      setStrategy(persisted);
    }
    load().catch(() =>
      setMessage("임상개발 전략을 불러오지 못했습니다."),
    );
  }, [assessmentId]);

  async function reviewField(
    field: DevelopmentStrategyField,
    status: "accepted" | "rejected",
  ) {
    if (!assessment) return;
    const next = await strategyRepository.reviewField(
      assessmentId,
      field.key,
      status,
      assessment.owner,
    );
    setStrategy(next);
    setMessage(`${strategyFieldLabels[field.key]} 검토 결과를 저장했습니다.`);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!assessment || !editState?.value.trim()) return;
    const submittedEdit = editState;
    const next = await strategyRepository.reviewField(
      assessmentId,
      submittedEdit.key,
      "accepted",
      assessment.owner,
      submittedEdit.value.trim(),
    );
    setStrategy(next);
    setEditState(null);
    setMessage(
      `${strategyFieldLabels[submittedEdit.key]} 수정값을 저장했습니다.`,
    );
  }

  async function setOverallStatus(status: "reviewed" | "approved") {
    if (!strategy || !assessment) return;
    if (
      status === "reviewed" &&
      strategy.fields.some((field) => field.reviewStatus === "draft")
    ) {
      setMessage(
        "모든 검토안을 수락, 수정 또는 제외한 후 검토 완료로 전환할 수 있습니다.",
      );
      return;
    }
    if (status === "approved" && strategy.status !== "reviewed") {
      setMessage("먼저 임상개발 전략을 검토 완료 상태로 전환하세요.");
      return;
    }
    const now = new Date().toISOString();
    const next = await strategyRepository.save({
      ...strategy,
      status,
      reviewer: assessment.owner,
      reviewedAt: strategy.reviewedAt ?? now,
      approvedAt: status === "approved" ? now : undefined,
      updatedAt: now,
    });
    setStrategy(next);
    setMessage(
      `임상개발 전략이 ${status === "approved" ? "승인" : "검토 완료"} 상태로 저장되었습니다.`,
    );
  }

  if (!strategy) {
    return (
      <div className="border border-[var(--border)] bg-white p-6 text-sm text-[var(--muted)]">
        {message ?? "임상개발 전략을 불러오는 중입니다."}
      </div>
    );
  }

  const reviewedCount = strategy.fields.filter(
    (field) => field.reviewStatus !== "draft",
  ).length;

  return (
    <div className="min-w-0">
      <WorkflowProgress assessmentId={assessmentId} />
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4 border border-[var(--border)] bg-white px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">
              {assessmentId} · 임상개발 전략
            </p>
            {isDemoAssessment(assessmentId) ? <DemoBadge compact /> : null}
          </div>
          <h1 className="mt-2 text-2xl font-semibold">
            {assessmentDisplayTitle(assessmentId, assessment?.candidate.name)}
          </h1>
          <PageGuide>{pageGuides.strategy}</PageGuide>
        </div>
        <div className="text-right">
          <span className="inline-block bg-[#eef1f4] px-3 py-1 text-xs font-semibold">
            {strategyStatusLabels[strategy.status]}
          </span>
          <p className="mt-2 text-xs text-[var(--muted)]">
            {reviewedCount} / {strategy.fields.length}개 항목 검토
          </p>
        </div>
      </header>

      {strategy.isMockEvidenceUsed ? (
        <div className="mb-5 border border-[#d5a72f] bg-[#fff8dc] px-5 py-3 text-sm font-semibold text-[#785600]">
          DEMO · Mock 문헌 근거 사용
        </div>
      ) : null}

      {message ? (
        <p className="mb-5 border border-[var(--border)] bg-white px-4 py-3 text-sm">
          {message}
        </p>
      ) : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {strategy.fields.map((field) => (
          <article
            className="border border-[var(--border)] bg-white"
            key={field.key}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
              <h2 className="font-semibold">
                {strategyFieldLabels[field.key]}
              </h2>
              <span className="text-[10px] font-semibold text-[var(--muted)]">
                {strategyReviewStatusLabels[field.reviewStatus]}
                {field.modified ? " · 수정됨" : ""}
              </span>
            </div>
            <div className="space-y-4 px-5 py-4 text-sm">
              <ValueBlock
                label="검토안"
                value={displayProposedValue(field)}
              />
              {field.modified ? (
                <ValueBlock
                  label="담당자 검토값"
                  value={field.reviewedValue ?? "제외"}
                />
              ) : null}
              <ValueBlock label="검토 근거" value={field.basis} />
              <div>
                <p className="text-[10px] font-semibold uppercase text-[var(--muted)]">
                  출처
                </p>
                <p className="mt-1 font-medium">
                  {strategySourceLabels[field.sourceType]}
                  {field.sources.some((source) => source.isMock)
                    ? " · 데모 데이터"
                    : ""}
                </p>
                {field.sources.length ? (
                  <details className="mt-2 border border-[var(--border)] bg-[#f8f9fb] px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold text-[var(--accent)]">
                      출처 {field.sources.length}건 보기
                    </summary>
                    <ul className="mt-2 space-y-2 text-xs">
                      {field.sources.map((source) => (
                        <li key={source.id}>
                          {source.href ? (
                            <a
                              className="font-semibold text-[var(--accent)] underline"
                              href={source.href}
                              rel={
                                source.href.startsWith("http")
                                  ? "noreferrer"
                                  : undefined
                              }
                              target={
                                source.href.startsWith("http")
                                  ? "_blank"
                                  : undefined
                              }
                            >
                              {source.label}
                            </a>
                          ) : (
                            <span className="font-semibold">
                              {source.label}
                            </span>
                          )}
                          {source.sourceText ? (
                            <p className="mt-1 leading-5 text-[var(--muted)]">
                              “{source.sourceText}”
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    승인된 출처가 없습니다.
                  </p>
                )}
              </div>

              {editState?.key === field.key ? (
                <form className="flex gap-2" onSubmit={saveEdit}>
                  <input
                    aria-label={`Reviewed value for ${strategyFieldLabels[field.key]}`}
                    className="min-w-0 flex-1 border border-[var(--border)] px-3 py-2"
                    onChange={(event) =>
                      setEditState({
                        key: field.key,
                        value: event.target.value,
                      })
                    }
                    required
                    value={editState.value}
                  />
                  <button
                    className="bg-[var(--accent)] px-3 py-2 font-semibold text-white"
                    type="submit"
                  >
                    저장
                  </button>
                  <button
                    className="border border-[var(--border)] px-3 py-2"
                    onClick={() => setEditState(null)}
                    type="button"
                  >
                    취소
                  </button>
                </form>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    className="border border-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={field.originalSuggestedValue === null}
                    onClick={() => reviewField(field, "accepted")}
                    type="button"
                  >
                    수락
                  </button>
                  <button
                    className="border border-[var(--border)] px-3 py-1.5 text-xs font-semibold"
                    onClick={() =>
                      setEditState({
                        key: field.key,
                        value:
                          field.reviewedValue ??
                          field.originalSuggestedValue ??
                          "",
                      })
                    }
                    type="button"
                  >
                    수정
                  </button>
                  <button
                    className="border border-[var(--danger)] px-3 py-1.5 text-xs font-semibold text-[var(--danger)]"
                    onClick={() => reviewField(field, "rejected")}
                    type="button"
                  >
                    제외
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-[var(--border)] bg-white px-5 py-4">
        <div className="text-xs text-[var(--muted)]">
          시스템 검토안과 담당자 검토값은 분리하여 저장합니다.
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="cursor-not-allowed border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]"
            disabled
            type="button"
          >
            통계 설계 · 다음 단계
          </button>
          <Link
            className="border border-[var(--border)] px-4 py-2 text-sm font-semibold"
            href={`/assessments/${assessmentId}/benchmark`}
          >
            기존 치료성과 기준 검토
          </Link>
          <button
            className="border border-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent)]"
            onClick={() => setOverallStatus("reviewed")}
            type="button"
          >
            검토 완료로 표시
          </button>
          <button
            className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={strategy.status !== "reviewed"}
            onClick={() => setOverallStatus("approved")}
            type="button"
          >
            전략 승인
          </button>
        </div>
      </section>
    </div>
  );
}

function displayProposedValue(field: DevelopmentStrategyField) {
  if (field.originalSuggestedValue) return field.originalSuggestedValue;
  if (field.key === "study_design") {
    return strategyBasisCopy.referenceTrialRequired;
  }
  return missingValueCopy.userInputRequired;
}

function ValueBlock({ label, value }: { label: string; value: string }) {
  const needsInput =
    value === missingValueCopy.userInputRequired ||
    value === strategyBasisCopy.referenceTrialRequired;
  return (
    <div>
      <p className="text-[10px] font-semibold text-[var(--muted)]">{label}</p>
      <p
        className={`mt-1 leading-6 ${
          needsInput ? "font-semibold text-[#9a6700]" : "font-medium"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
