"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";

import type {
  Assessment,
  BenchmarkExclusionReason,
  BenchmarkMetric,
  BenchmarkMetricObservation,
  BenchmarkMetricType,
  HistoricalBenchmark,
} from "@/domain/models";
import { LocalStorageAssessmentRepository } from "@/repositories/browser/assessment-repository";
import { LocalStorageEvidenceExtractionRepository } from "@/repositories/browser/evidence-extraction-repository";
import {
  createEmptyBenchmark,
  LocalStorageHistoricalBenchmarkRepository,
} from "@/repositories/browser/historical-benchmark-repository";
import {
  LocalStoragePublicationSelectionRepository,
  type SavedPublicationEvidence,
} from "@/repositories/browser/publication-selection-repository";
import { LocalStorageReferenceTrialRepository } from "@/repositories/browser/reference-trial-repository";
import type { EvidenceExtractionProviderDescriptor } from "@/services/ai/evidence-extraction-contract";
import {
  buildBenchmarkSummaries,
  createUserDefinedMetric,
  discoverBenchmarkMetrics,
  formatEvidenceValue,
  formatMetricDisplay,
} from "./benchmark-utils";
import { DemoBadge } from "@/components/layout/demo-badge";
import { PageGuide } from "@/components/layout/page-guide";
import { WorkflowProgress } from "@/components/layout/workflow-progress";
import { assessmentDisplayTitle, isDemoAssessment } from "@/lib/demo-assessment";
import { pageGuides } from "@/lib/ui-copy";

const assessmentRepository = new LocalStorageAssessmentRepository();
const extractionRepository = new LocalStorageEvidenceExtractionRepository();
const publicationRepository =
  new LocalStoragePublicationSelectionRepository();
const referenceRepository = new LocalStorageReferenceTrialRepository();
const benchmarkRepository =
  new LocalStorageHistoricalBenchmarkRepository();

const exclusionReasons: Array<{
  value: BenchmarkExclusionReason;
  label: string;
}> = [
  { value: "different_population", label: "대상 환자군이 다름" },
  { value: "different_line_of_therapy", label: "치료차수가 다름" },
  { value: "different_treatment_setting", label: "치료 환경이 다름" },
  { value: "different_endpoint_definition", label: "평가변수 정의가 다름" },
  { value: "different_study_design", label: "시험 설계가 다름" },
  { value: "other", label: "기타" },
];

const metricTypeOptions: Array<{ value: BenchmarkMetricType; label: string }> = [
  { value: "RESPONSE_RATE", label: "반응률" },
  { value: "CONTINUOUS_CHANGE", label: "연속 변화" },
  { value: "TIME_TO_EVENT", label: "사건 발생 시간" },
  { value: "BINARY_ENDPOINT", label: "이분형 평가변수" },
  { value: "SAFETY", label: "안전성" },
  { value: "OTHER", label: "기타" },
];

const metricTypeLabels: Record<BenchmarkMetricType, string> = {
  RESPONSE_RATE: "반응률",
  CONTINUOUS_CHANGE: "연속 변화",
  TIME_TO_EVENT: "사건 발생 시간",
  BINARY_ENDPOINT: "이분형 평가변수",
  SAFETY: "안전성",
  OTHER: "기타",
};

const endpointTypeLabels = {
  PRIMARY: "일차",
  SECONDARY: "이차",
  EXPLORATORY: "탐색",
  UNKNOWN: "미분류",
} as const;

const sourceTypeLabels = {
  reference_trial: "참고 임상시험",
  approved_evidence: "검토 완료 문헌",
  user_defined: "User Defined",
} as const;

interface UserMetricForm {
  metricName: string;
  timepoint: string;
  metricType: BenchmarkMetricType;
  population: string;
  unit: string;
  value: string;
}

const emptyUserForm: UserMetricForm = {
  metricName: "",
  timepoint: "",
  metricType: "OTHER",
  population: "",
  unit: "",
  value: "",
};

export function HistoricalBenchmarkWorkspace({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [publications, setPublications] = useState<SavedPublicationEvidence[]>(
    [],
  );
  const [extractions, setExtractions] = useState<
    Awaited<ReturnType<typeof extractionRepository.list>>
  >([]);
  const [references, setReferences] = useState<
    Awaited<ReturnType<typeof referenceRepository.list>>
  >([]);
  const [benchmark, setBenchmark] = useState<HistoricalBenchmark | null>(null);
  const [provider, setProvider] =
    useState<EvidenceExtractionProviderDescriptor | null>(null);
  const [reasons, setReasons] = useState<
    Record<string, BenchmarkExclusionReason | "">
  >({});
  const [userForm, setUserForm] = useState<UserMetricForm>(emptyUserForm);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedMetricId, setExpandedMetricId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/evidence-extraction");
      if (!response.ok) throw new Error("Provider unavailable");
      const descriptor =
        (await response.json()) as EvidenceExtractionProviderDescriptor;
      const [savedAssessment, savedPublications, savedExtractions, savedReferences, saved] =
        await Promise.all([
          assessmentRepository.getById(assessmentId),
          publicationRepository.list(assessmentId),
          extractionRepository.list(assessmentId, descriptor.isMock),
          referenceRepository.list(assessmentId),
          benchmarkRepository.getByAssessmentId(assessmentId, descriptor.isMock),
        ]);
      const next =
        saved ?? createEmptyBenchmark(assessmentId, descriptor.isMock);
      const discovered = discoverBenchmarkMetrics(
        savedReferences,
        savedExtractions,
        savedPublications,
        next.metrics,
      );
      const persisted = await benchmarkRepository.save({
        ...next,
        metrics: discovered.metrics,
        updatedAt: new Date().toISOString(),
      });
      setProvider(descriptor);
      setAssessment(savedAssessment);
      setPublications(savedPublications);
      setExtractions(savedExtractions);
      setReferences(savedReferences);
      setBenchmark(persisted);
    }
    load().catch(() =>
      setMessage("기존 치료성과 기준 데이터를 불러오지 못했습니다."),
    );
  }, [assessmentId]);

  const discovery = useMemo(
    () =>
      discoverBenchmarkMetrics(
        references,
        extractions,
        publications,
        benchmark?.metrics ?? [],
      ),
    [references, extractions, publications, benchmark?.metrics],
  );
  const metrics = discovery.metrics;
  const observations = discovery.observations;
  const decisionById = new Map(
    (benchmark?.decisions ?? []).map((item) => [item.observationId, item]),
  );
  const summaries = buildBenchmarkSummaries(
    metrics,
    observations,
    benchmark?.decisions ?? [],
  );
  const selectedCount = metrics.filter((item) => item.status === "selected").length;
  const includedCount = (benchmark?.decisions ?? []).filter(
    (item) => item.decision === "included",
  ).length;

  async function persistMetrics(nextMetrics: BenchmarkMetric[]) {
    if (!benchmark) return;
    const next = await benchmarkRepository.save({
      ...benchmark,
      metrics: nextMetrics,
      summaries: buildBenchmarkSummaries(
        nextMetrics,
        observations,
        benchmark.decisions,
      ),
      status: "draft",
      reviewer: undefined,
      reviewedAt: undefined,
      updatedAt: new Date().toISOString(),
    });
    setBenchmark(next);
    return next;
  }

  async function toggleMetric(metric: BenchmarkMetric, selected: boolean) {
    const nextMetrics = metrics.map((item) =>
      item.metricId === metric.metricId
        ? { ...item, status: selected ? "selected" : "candidate" }
        : item,
    ) as BenchmarkMetric[];
    await persistMetrics(nextMetrics);
    setMessage(
      selected
        ? `${metric.displayName}을(를) 개발전략 기준 지표로 선택했습니다.`
        : `${metric.displayName} 선택을 해제했습니다.`,
    );
  }

  async function decide(
    observation: BenchmarkMetricObservation,
    decision: "included" | "excluded",
  ) {
    if (!benchmark) return;
    const reason = reasons[observation.observationId] || undefined;
    const next = await benchmarkRepository.updateObservationDecision(
      assessmentId,
      benchmark.isMock,
      observation.observationId,
      observation.metricId,
      decision,
      assessment?.owner ?? "Clinical Reviewer",
      reason,
    );
    const withSummaries = await benchmarkRepository.save({
      ...next,
      metrics,
      summaries: buildBenchmarkSummaries(metrics, observations, next.decisions),
    });
    setBenchmark(withSummaries);
    setMessage(
      decision === "included"
        ? `${observation.displayName} 근거를 기준에 포함했습니다.`
        : `${observation.displayName} 근거를 기준에서 제외했습니다.`,
    );
  }

  async function addUserMetric(event: FormEvent) {
    event.preventDefault();
    if (!userForm.metricName.trim()) {
      setMessage("지표명을 입력하세요.");
      return;
    }
    const created = createUserDefinedMetric({
      metricName: userForm.metricName,
      timepoint: userForm.timepoint,
      metricType: userForm.metricType,
      population: userForm.population,
      unit: userForm.unit,
      value: userForm.value,
      createdBy: assessment?.owner ?? "Clinical Reviewer",
    });
    const existing = metrics.find((item) => item.metricId === created.metricId);
    const nextMetrics = existing
      ? metrics.map((item) =>
          item.metricId === created.metricId
            ? { ...item, status: "selected" as const }
            : item,
        )
      : [...metrics, created];
    await persistMetrics(nextMetrics);
    setUserForm(emptyUserForm);
    setShowAddForm(false);
    setMessage(
      existing
        ? `${created.displayName}은(는) 이미 발견된 지표입니다. 선택 상태로 표시했습니다.`
        : `${created.displayName}을(를) User Defined 지표로 추가했습니다.`,
    );
  }

  async function approveBenchmark() {
    if (!benchmark || !selectedCount) {
      setMessage("개발전략에 사용할 기준 지표를 최소 1개 선택하세요.");
      return;
    }
    const now = new Date().toISOString();
    const next = await benchmarkRepository.save({
      ...benchmark,
      metrics,
      summaries,
      status: "approved",
      reviewer: assessment?.owner ?? "Clinical Reviewer",
      reviewedAt: now,
      updatedAt: now,
    });
    setBenchmark(next);
    setMessage("선택된 기존 치료성과 기준이 확정되었습니다.");
  }

  if (!benchmark || !provider) {
    return (
      <p className="border border-[var(--border)] bg-white p-6 text-sm text-[var(--muted)]">
        기존 치료성과 기준을 불러오는 중입니다.
      </p>
    );
  }

  return (
    <div className="min-w-0">
      <WorkflowProgress assessmentId={assessmentId} />
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4 border border-[var(--border)] bg-white px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">
              {assessmentId} · 기존 치료성과 기준
            </p>
            {isDemoAssessment(assessmentId) ? <DemoBadge compact /> : null}
          </div>
          <h1 className="mt-2 text-2xl font-semibold">
            {assessmentDisplayTitle(assessmentId, assessment?.candidate.name)}
          </h1>
          <PageGuide>{pageGuides.benchmark}</PageGuide>
        </div>
        <div className="text-right">
          <StatusBadge status={benchmark.status} />
          <p className="mt-2 text-xs text-[var(--muted)]">
            발견 지표 {metrics.length}개 · 선택 {selectedCount}개 · 포함 근거{" "}
            {includedCount}건
          </p>
        </div>
      </header>

      {provider.isMock ? (
        <div className="mb-5 border border-[#d5a72f] bg-[#fff8dc] px-5 py-3 text-sm font-semibold text-[#785600]">
          DEMO · Mock 문헌 근거 사용. 가상 후보물질의 유효성 결과는 생성하지
          않습니다.
        </div>
      ) : null}

      {message ? (
        <p className="mb-5 border border-[var(--border)] bg-white px-4 py-3 text-sm">
          {message}
        </p>
      ) : null}

      <section className="mb-5 border border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-semibold">선택된 기준 요약</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            선택한 지표만 표시합니다. 서로 다른 평가시점 또는 환자군 결과는
            하나의 값으로 합치지 않습니다.
          </p>
        </div>
        {summaries.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {summaries.map((summary) => (
              <div
                className="border-b border-r border-[var(--border)] px-5 py-4"
                key={summary.metricId}
              >
                <p className="text-sm font-semibold">{summary.displayName}</p>
                <p className="mt-2 text-lg font-semibold">
                  {summary.observedRange
                    ? `${summary.observedRange}${summary.unit ? ` ${summary.unit}` : ""}`
                    : "확인되지 않음"}
                </p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                  관찰 범위 · 문헌 {summary.studyCount}건
                  <br />
                  {summary.timepoint ?? "평가시점 미기재"}
                  {summary.populations.length
                    ? ` · 환자군 ${summary.populations.join("; ")}`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-8 text-sm text-[var(--muted)]">
            선택된 기준 지표가 없습니다. 아래 발견 목록에서 개발전략에 사용할
            지표를 선택하거나 직접 추가하세요.
          </p>
        )}
      </section>

      <section className="mb-5 border border-[var(--border)] bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="font-semibold">기준 지표 후보</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              참고 임상시험의 일차·이차 평가변수와 검토 완료 문헌의 결과
              지표에서만 후보를 만듭니다. 값이 없으면 임의로 생성하지 않습니다.
            </p>
          </div>
          <button
            className="border border-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--accent)]"
            onClick={() => setShowAddForm((current) => !current)}
            type="button"
          >
            + 기준 지표 추가
          </button>
        </div>

        {showAddForm ? (
          <form
            className="grid grid-cols-1 gap-3 border-b border-[var(--border)] px-5 py-4 md:grid-cols-3"
            onSubmit={addUserMetric}
          >
            <label className="text-xs font-semibold">
              지표명
              <input
                className="mt-1 w-full border border-[var(--border)] px-3 py-2 text-sm"
                onChange={(event) =>
                  setUserForm((current) => ({
                    ...current,
                    metricName: event.target.value,
                  }))
                }
                placeholder="예: EASI-75"
                value={userForm.metricName}
              />
            </label>
            <label className="text-xs font-semibold">
              평가시점
              <input
                className="mt-1 w-full border border-[var(--border)] px-3 py-2 text-sm"
                onChange={(event) =>
                  setUserForm((current) => ({
                    ...current,
                    timepoint: event.target.value,
                  }))
                }
                placeholder="예: Week 16"
                value={userForm.timepoint}
              />
            </label>
            <label className="text-xs font-semibold">
              지표 유형
              <select
                className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2 text-sm"
                onChange={(event) =>
                  setUserForm((current) => ({
                    ...current,
                    metricType: event.target.value as BenchmarkMetricType,
                  }))
                }
                value={userForm.metricType}
              >
                {metricTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold">
              환자군
              <input
                className="mt-1 w-full border border-[var(--border)] px-3 py-2 text-sm"
                onChange={(event) =>
                  setUserForm((current) => ({
                    ...current,
                    population: event.target.value,
                  }))
                }
                placeholder="예: Moderate-to-Severe AD"
                value={userForm.population}
              />
            </label>
            <label className="text-xs font-semibold">
              값
              <input
                className="mt-1 w-full border border-[var(--border)] px-3 py-2 text-sm"
                onChange={(event) =>
                  setUserForm((current) => ({
                    ...current,
                    value: event.target.value,
                  }))
                }
                placeholder="확인된 경우에만 입력"
                value={userForm.value}
              />
            </label>
            <label className="text-xs font-semibold">
              단위
              <input
                className="mt-1 w-full border border-[var(--border)] px-3 py-2 text-sm"
                onChange={(event) =>
                  setUserForm((current) => ({
                    ...current,
                    unit: event.target.value,
                  }))
                }
                placeholder="예: %"
                value={userForm.unit}
              />
            </label>
            <div className="md:col-span-3">
              <p className="mb-3 text-xs text-[var(--muted)]">
                Source Type: User Defined
              </p>
              <button
                className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                type="submit"
              >
                지표 추가
              </button>
            </div>
          </form>
        ) : null}

        <div className="divide-y divide-[var(--border)]">
          {metrics.map((metric) => {
            const rows = observations.filter(
              (item) => item.metricId === metric.metricId,
            );
            const expanded = expandedMetricId === metric.metricId;
            return (
              <div key={metric.metricId}>
                <div className="flex flex-wrap items-start gap-4 px-5 py-4">
                  <label className="mt-1 flex items-center gap-2 text-sm font-semibold">
                    <input
                      checked={metric.status === "selected"}
                      onChange={(event) =>
                        toggleMetric(metric, event.target.checked)
                      }
                      type="checkbox"
                    />
                    {metric.displayName}
                  </label>
                  <p className="text-xs text-[var(--muted)]">
                    {metricTypeLabels[metric.metricType]} ·{" "}
                    {endpointTypeLabels[metric.endpointType]} ·{" "}
                    {sourceTypeLabels[metric.sourceType]} · 근거 {rows.length}건
                    {metric.timepoint ? ` · ${metric.timepoint}` : ""}
                  </p>
                  <button
                    className="ml-auto text-xs font-semibold text-[var(--accent)]"
                    onClick={() =>
                      setExpandedMetricId(expanded ? null : metric.metricId)
                    }
                    type="button"
                  >
                    {expanded ? "근거 접기" : "근거 보기"}
                  </button>
                </div>
                {expanded ? (
                  <ObservationTable
                    decisions={decisionById}
                    observations={rows}
                    onDecide={decide}
                    reasons={reasons}
                    setReasons={setReasons}
                  />
                ) : null}
              </div>
            );
          })}
          {!metrics.length ? (
            <p className="px-5 py-10 text-center text-sm text-[var(--muted)]">
              참고 임상시험 또는 검토 완료 문헌에서 확인된 평가변수가 없습니다.
              유사·경쟁 임상에서 참고 임상을 선택하거나, 문헌 근거를 검토
              완료한 뒤 다시 확인하세요. 값이 없는 지표는 생성하지 않습니다.
            </p>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--border)] bg-white px-5 py-4">
        <div className="text-xs text-[var(--muted)]">
          {benchmark.reviewer
            ? `${benchmark.reviewer}이(가) 확정 · ${benchmark.reviewedAt}`
            : "선택된 기준 지표를 담당자가 확정해야 임상개발 전략에 반영됩니다."}
        </div>
        <div className="flex gap-2">
          {benchmark.status === "approved" ? (
            <Link
              className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
              href={`/assessments/${assessmentId}/development-strategy`}
            >
              임상개발 전략으로 이동
            </Link>
          ) : null}
          <button
            className="border border-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedCount}
            onClick={approveBenchmark}
            type="button"
          >
            선택된 기준 승인
          </button>
        </div>
      </div>
    </div>
  );
}

function ObservationTable({
  observations,
  decisions,
  reasons,
  setReasons,
  onDecide,
}: {
  observations: BenchmarkMetricObservation[];
  decisions: Map<string, HistoricalBenchmark["decisions"][number]>;
  reasons: Record<string, BenchmarkExclusionReason | "">;
  setReasons: Dispatch<
    SetStateAction<Record<string, BenchmarkExclusionReason | "">>
  >;
  onDecide: (
    observation: BenchmarkMetricObservation,
    decision: "included" | "excluded",
  ) => void;
}) {
  return (
    <div className="overflow-x-auto border-t border-[var(--border)]">
      <table className="w-full min-w-[1200px] border-collapse text-left text-xs">
        <thead className="bg-[#f8f9fb] uppercase tracking-wide text-[var(--muted)]">
          <tr>
            {[
              "지표 / 평가시점",
              "환자군",
              "출처",
              "시험 / 문헌",
              "값",
              "N",
              "근거",
              "결정",
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
          {observations.map((observation) => {
            const savedDecision = decisions.get(observation.observationId);
            return (
              <tr
                className="border-b border-[var(--border)] align-top"
                key={observation.observationId}
              >
                <td className="px-3 py-3 font-semibold">
                  {formatMetricDisplay(
                    observation.metricName,
                    observation.timepoint,
                  )}
                  <span className="mt-1 block font-normal text-[var(--muted)]">
                    {endpointTypeLabels[observation.endpointType]}
                  </span>
                </td>
                <td className="max-w-[220px] px-3 py-3">
                  {observation.population || "출처에 환자군 미기재"}
                </td>
                <td className="px-3 py-3">
                  {sourceTypeLabels[observation.sourceType]}
                </td>
                <td className="max-w-[260px] px-3 py-3">
                  {observation.nctId ? (
                    <a
                      className="font-semibold text-[var(--accent)] underline"
                      href={`https://clinicaltrials.gov/study/${observation.nctId}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {observation.nctId}
                    </a>
                  ) : observation.pmid ? (
                    <a
                      className="font-semibold text-[var(--accent)] underline"
                      href={`https://pubmed.ncbi.nlm.nih.gov/${observation.pmid}/`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      PMID {observation.pmid}
                    </a>
                  ) : (
                    "User Defined"
                  )}
                  <p className="mt-1 text-[var(--muted)]">
                    {observation.studyLabel}
                  </p>
                </td>
                <td className="px-3 py-3 font-medium">
                  {formatEvidenceValue(observation.value)}
                  {observation.unit ? ` ${observation.unit}` : ""}
                </td>
                <td className="px-3 py-3">
                  {observation.sampleSize ?? "확인되지 않음"}
                </td>
                <td className="max-w-[280px] px-3 py-3">
                  <details>
                    <summary className="cursor-pointer font-semibold text-[var(--accent)]">
                      근거 원문
                    </summary>
                    <p className="mt-2 leading-5 text-[var(--muted)]">
                      {observation.sourceText || "근거 원문 없음"}
                    </p>
                  </details>
                </td>
                <td className="w-[240px] px-3 py-3">
                  <p className="mb-2 font-semibold">
                    {savedDecision?.decision ?? "pending"}
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="border border-[var(--accent)] px-3 py-1.5 font-semibold text-[var(--accent)]"
                      onClick={() => onDecide(observation, "included")}
                      type="button"
                    >
                      포함
                    </button>
                    <button
                      className="border border-[var(--danger)] px-3 py-1.5 font-semibold text-[var(--danger)]"
                      onClick={() => onDecide(observation, "excluded")}
                      type="button"
                    >
                      제외
                    </button>
                  </div>
                  <select
                    aria-label={`${observation.displayName} 제외 사유`}
                    className="mt-2 w-full border border-[var(--border)] bg-white px-2 py-1.5"
                    onChange={(event) =>
                      setReasons((current) => ({
                        ...current,
                        [observation.observationId]: event.target
                          .value as BenchmarkExclusionReason | "",
                      }))
                    }
                    value={
                      reasons[observation.observationId] ??
                      savedDecision?.exclusionReason ??
                      ""
                    }
                  >
                    <option value="">제외 사유(선택)</option>
                    {exclusionReasons.map((reason) => (
                      <option key={reason.value} value={reason.value}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: HistoricalBenchmark["status"] }) {
  return (
    <span
      className={`inline-block px-3 py-1 text-xs font-semibold uppercase ${
        status === "approved"
          ? "bg-[#e5f5ef] text-[#216e5d]"
          : "bg-[#eef1f4] text-[#596273]"
      }`}
    >
      {status}
    </span>
  );
}
