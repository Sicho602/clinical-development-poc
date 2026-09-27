"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { DemoBadge } from "@/components/layout/demo-badge";
import { PageGuide } from "@/components/layout/page-guide";
import { WorkflowProgress } from "@/components/layout/workflow-progress";
import {
  assessmentDisplayTitle,
  ensureDemoAssessment,
  isDemoAssessment,
} from "@/lib/demo-assessment";
import { clinicalTrialLabels, pageGuides } from "@/lib/ui-copy";

import type {
  Assessment,
  ApiRequestStatus,
  ClinicalTrial,
  ClinicalTrialAgeGroup,
  ClinicalTrialInterventionType,
  ClinicalTrialPhase,
  ClinicalTrialSummary,
  ClinicalTrialStudyType,
  ClinicalTrialsLocalFilters,
  ClinicalTrialsServerSearchStrategy,
  ClinicalTrialStatus,
} from "@/domain/models";
import { deriveClinicalTrialsStrategy } from "@/features/assessments/assessment-search-defaults";
import { LocalStorageAssessmentRepository } from "@/repositories/browser/assessment-repository";
import {
  LocalStorageReferenceTrialRepository,
  type SavedReferenceTrial,
} from "@/repositories/browser/reference-trial-repository";
import { LocalStorageSearchLogRepository } from "@/repositories/browser/search-log-repository";

interface SearchResponse {
  status: ApiRequestStatus;
  data?: ClinicalTrialSummary[];
  pagination?: {
    totalCount?: number;
    nextPageToken?: string;
  };
  appliedStrategy?: ClinicalTrialsServerSearchStrategy;
  apiParameters?: Record<string, string>;
  error?: {
    code: string;
    message: string;
    status?: number;
    retryAfterSeconds?: number;
  };
}

interface DetailResponse {
  status: ApiRequestStatus;
  data?: ClinicalTrial;
  error?: { message: string };
}

const referenceRepository = new LocalStorageReferenceTrialRepository();
const assessmentRepository = new LocalStorageAssessmentRepository();
const searchLogRepository = new LocalStorageSearchLogRepository();

const emptyStrategy: ClinicalTrialsServerSearchStrategy = {
  condition: "",
  phases: [],
  studyTypes: [],
  statuses: [],
  interventionTypes: [],
  intervention: "",
  sponsor: "",
  country: "",
  ageGroups: [],
  sex: "ALL",
  keyword: "",
};

const emptyLocalFilters: ClinicalTrialsLocalFilters = {
  sponsor: "",
  intervention: "",
  country: "",
  endpoint: "",
  minEnrollment: "",
  maxEnrollment: "",
};

const statusOptions: Array<[ClinicalTrialStatus, string]> = [
  ["NOT_YET_RECRUITING", "Not yet recruiting"],
  ["RECRUITING", "Recruiting"],
  ["ENROLLING_BY_INVITATION", "Enrolling by invitation"],
  ["ACTIVE_NOT_RECRUITING", "Active, not recruiting"],
  ["COMPLETED", "Completed"],
  ["SUSPENDED", "Suspended"],
  ["TERMINATED", "Terminated"],
  ["WITHDRAWN", "Withdrawn"],
  ["UNKNOWN", "Unknown"],
];

export function ClinicalTrialsWorkspace({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [strategy, setStrategy] =
    useState<ClinicalTrialsServerSearchStrategy>(emptyStrategy);
  const [executedStrategy, setExecutedStrategy] =
    useState<ClinicalTrialsServerSearchStrategy | null>(null);
  const [apiParameters, setApiParameters] = useState<Record<string, string>>({});
  const [trials, setTrials] = useState<ClinicalTrialSummary[]>([]);
  const [apiMatched, setApiMatched] = useState<number | undefined>();
  const [nextPageToken, setNextPageToken] = useState<string>();
  const [status, setStatus] = useState<ApiRequestStatus>("idle");
  const [loadMoreStatus, setLoadMoreStatus] =
    useState<ApiRequestStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [localFilters, setLocalFilters] =
    useState<ClinicalTrialsLocalFilters>(emptyLocalFilters);
  const [references, setReferences] = useState<SavedReferenceTrial[]>([]);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [selectedSummary, setSelectedSummary] =
    useState<ClinicalTrialSummary | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ClinicalTrial | null>(
    null,
  );
  const [detailStatus, setDetailStatus] =
    useState<ApiRequestStatus>("idle");

  useEffect(() => {
    Promise.resolve(
      isDemoAssessment(assessmentId)
        ? ensureDemoAssessment()
        : Promise.resolve(null),
    ).then(() =>
    Promise.all([
      referenceRepository.list(assessmentId),
      assessmentRepository.getById(assessmentId),
    ])
    )
      .then(async ([savedReferences, savedAssessment]) => {
        setReferences(savedReferences);
        if (savedAssessment) {
          const savedReferenceIds = savedReferences.map(
            (item) => item.trial.nctId,
          );
          const assessmentReferenceIds =
            savedAssessment.selectedReferenceTrialIds ?? [];
          const referencesAreSynchronized =
            savedReferenceIds.length === assessmentReferenceIds.length &&
            savedReferenceIds.every((id) => assessmentReferenceIds.includes(id));
          const synchronizedAssessment = referencesAreSynchronized
            ? savedAssessment
            : await assessmentRepository.update({
                ...savedAssessment,
                selectedReferenceTrialIds: savedReferenceIds,
                updatedAt: new Date().toISOString(),
                updatedBy: savedAssessment.owner,
              });

          setAssessment(synchronizedAssessment);
          setStrategy(
            synchronizedAssessment.clinicalTrialsSearchStrategy ??
              deriveClinicalTrialsStrategy(synchronizedAssessment),
          );
        } else {
          setAssessment(null);
          setPersistenceError(
            "검토 과제를 찾을 수 없습니다. 신규 검토 등록에서 먼저 생성해 주세요.",
          );
        }
      })
      .catch(() =>
        setPersistenceError("검토 과제 데이터를 불러오지 못했습니다."),
      );
  }, [assessmentId]);

  const referenceIds = useMemo(
    () => new Set(references.map((item) => item.trial.nctId)),
    [references],
  );
  const displayedTrials = useMemo(
    () => trials.filter((trial) => matchesLocalFilters(trial, localFilters)),
    [localFilters, trials],
  );
  const stats = useMemo(() => summarizeRetrievedTrials(trials), [trials]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setError(null);
    setTrials([]);
    setApiMatched(undefined);
    setNextPageToken(undefined);
    setLocalFilters(emptyLocalFilters);

    const payload = await requestTrials(strategy);
    if (!payload) return;

    setTrials(payload.data ?? []);
    setApiMatched(payload.pagination?.totalCount);
    setNextPageToken(payload.pagination?.nextPageToken);
    setExecutedStrategy(payload.appliedStrategy ?? strategy);
    setApiParameters(payload.apiParameters ?? {});
    setStatus(payload.data?.length ? "connected" : "no_results");
    await saveSearchLog(
      "structured",
      strategy,
      payload.pagination?.totalCount ?? null,
      payload.data?.length ?? 0,
    );
    if (assessment) {
      const updatedAssessment: Assessment = {
        ...assessment,
        clinicalTrialsSearchStrategy: strategy,
        status: "searching",
        updatedAt: new Date().toISOString(),
        updatedBy: assessment.owner,
      };
      await assessmentRepository.update(updatedAssessment);
      setAssessment(updatedAssessment);
    }
  }

  async function handleLoadMore() {
    if (!nextPageToken || !executedStrategy) return;
    setLoadMoreStatus("loading");
    setError(null);

    const payload = await requestTrials(executedStrategy, nextPageToken, true);
    if (!payload) return;

    const combined = deduplicateTrials(trials, payload.data ?? []);
    setTrials(combined);
    setNextPageToken(payload.pagination?.nextPageToken);
    setLoadMoreStatus("connected");
    await saveSearchLog(
      "pagination",
      executedStrategy,
      payload.pagination?.totalCount ?? apiMatched ?? null,
      combined.length,
    );
  }

  async function requestTrials(
    searchStrategy: ClinicalTrialsServerSearchStrategy,
    pageToken?: string,
    isLoadMore = false,
  ): Promise<SearchResponse | null> {
    try {
      const response = await fetch(buildSearchUrl(searchStrategy, pageToken), {
        cache: "no-store",
      });
      const payload = await readJsonResponse<SearchResponse>(response);

      if (!response.ok || !payload?.data) {
        const message =
          payload?.error?.message ?? "검색 요청에 실패했습니다.";
        setError(`${message} (HTTP ${response.status})`);
        if (isLoadMore) {
          setLoadMoreStatus(payload?.status ?? "failed");
        } else {
          setStatus(payload?.status ?? "failed");
        }
        return null;
      }
      return payload;
    } catch {
      setError("ClinicalTrials.gov 검색 서비스에 연결할 수 없습니다.");
      if (isLoadMore) {
        setLoadMoreStatus("failed");
      } else {
        setStatus("failed");
      }
      return null;
    }
  }

  async function toggleReference(trial: ClinicalTrialSummary) {
    setPersistenceError(null);
    try {
      const next = referenceIds.has(trial.nctId)
        ? await referenceRepository.remove(assessmentId, trial.nctId)
        : await referenceRepository.add(assessmentId, trial);
      setReferences(next);
      if (assessment) {
        const updatedAssessment = {
          ...assessment,
          selectedReferenceTrialIds: next.map((item) => item.trial.nctId),
          updatedAt: new Date().toISOString(),
          updatedBy: assessment.owner,
        };
        await assessmentRepository.update(updatedAssessment);
        setAssessment(updatedAssessment);
      }
    } catch {
      setPersistenceError("참고 임상시험 선택을 저장하지 못했습니다.");
    }
  }

  async function openTrial(trial: ClinicalTrialSummary) {
    setSelectedSummary(trial);
    setSelectedDetail(null);
    setDetailStatus("loading");
    try {
      const response = await fetch(`/api/clinical-trials/${trial.nctId}`, {
        cache: "no-store",
      });
      const payload = await readJsonResponse<DetailResponse>(response);
      if (!response.ok || !payload?.data) {
        setDetailStatus("failed");
        return;
      }
      setSelectedDetail(payload.data);
      setDetailStatus("connected");
    } catch {
      setDetailStatus("failed");
    }
  }

  function updateStrategy<K extends keyof ClinicalTrialsServerSearchStrategy>(
    key: K,
    value: ClinicalTrialsServerSearchStrategy[K],
  ) {
    setStrategy((current) => ({ ...current, [key]: value }));
  }

  function updateLocalFilter(
    key: keyof ClinicalTrialsLocalFilters,
    value: string,
  ) {
    setLocalFilters((current) => ({ ...current, [key]: value }));
  }

  async function saveSearchLog(
    searchType: string,
    searchStrategy: ClinicalTrialsServerSearchStrategy,
    matchedCount: number | null,
    retrievedCount: number,
  ) {
    await searchLogRepository.append({
      assessmentId,
      source: "clinicaltrials",
      searchType,
      query: searchStrategy.condition,
      structuredFilters: {
        phases: searchStrategy.phases,
        studyTypes: searchStrategy.studyTypes,
        statuses: searchStrategy.statuses,
        interventionTypes: searchStrategy.interventionTypes,
        intervention: searchStrategy.intervention,
        sponsor: searchStrategy.sponsor,
        country: searchStrategy.country,
        ageGroups: searchStrategy.ageGroups,
        sex: searchStrategy.sex,
        startYear: searchStrategy.startYear ?? null,
        keyword: searchStrategy.keyword,
      },
      matchedCount,
      retrievedCount,
      status: retrievedCount > 0 ? "connected" : "no_results",
    });
  }

  return (
    <div className="min-w-0">
      <WorkflowProgress assessmentId={assessmentId} />
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <p className="text-xs font-semibold tracking-wider text-[var(--accent)]">
            {assessmentId} · 유사·경쟁 임상
          </p>
          {isDemoAssessment(assessmentId) ? <DemoBadge compact /> : null}
        </div>
        <h1 className="text-2xl font-semibold">
          {assessmentDisplayTitle(assessmentId, assessment?.candidate.name)}
        </h1>
        <PageGuide>{pageGuides.landscape}</PageGuide>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {assessment
            ? `${assessment.candidate.indication} · ${assessment.candidate.targetClinicalPhase}`
            : "검토 과제 정보를 불러오는 중입니다."}
        </p>
        <a
          className="mt-2 inline-block text-xs font-semibold text-[var(--accent)] underline"
          href={`/assessments/${assessmentId}/evidence`}
        >
          문헌 근거로 이동
        </a>
      </div>

      <SearchStrategyForm
        onSubmit={handleSearch}
        status={status}
        strategy={strategy}
        updateStrategy={updateStrategy}
      />

      {executedStrategy ? (
        <ExecutedStrategy
          apiParameters={apiParameters}
          strategy={executedStrategy}
        />
      ) : null}

      {error ? (
        <div className="mb-5 flex items-center justify-between border border-[#f0b8b4] bg-[#fff4f3] px-4 py-3 text-sm text-[var(--danger)]">
          <span>{error}</span>
          <button
            className="font-semibold underline"
            onClick={() => setError(null)}
            type="button"
          >
            닫기
          </button>
        </div>
      ) : null}

      <SelectedReferenceTrials
        onOpen={openTrial}
        onRemove={toggleReference}
        references={references}
      />

      {persistenceError ? (
        <p className="mb-4 text-sm text-[var(--danger)]">
          {persistenceError}
        </p>
      ) : null}

      {status === "connected" ? (
        <>
          <LandscapeSummary
            apiMatched={apiMatched}
            displayed={displayedTrials.length}
            retrieved={trials.length}
            stats={stats}
          />

          <section className="border border-[var(--border)] bg-white">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">검색된 임상시험</h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {clinicalTrialLabels.apiMatched}{" "}
                    {apiMatched?.toLocaleString() ?? "확인되지 않음"} ·{" "}
                    {clinicalTrialLabels.retrieved} {trials.length} ·{" "}
                    {clinicalTrialLabels.displayed} {displayedTrials.length}
                  </p>
                </div>
                <button
                  className="text-xs font-semibold text-[var(--accent)]"
                  onClick={() => setLocalFilters(emptyLocalFilters)}
                  type="button"
                >
                  표시 필터 초기화
                </button>
              </div>
              <LocalFilters
                filters={localFilters}
                trials={trials}
                updateFilter={updateLocalFilter}
              />
            </div>
            <TrialTable
              onOpen={openTrial}
              onToggleReference={toggleReference}
              referenceIds={referenceIds}
              trials={displayedTrials}
            />
            <LoadMorePanel
              apiMatched={apiMatched}
              hasNextPage={Boolean(nextPageToken)}
              loadMoreStatus={loadMoreStatus}
              onLoadMore={handleLoadMore}
              retrieved={trials.length}
            />
          </section>
        </>
      ) : null}

      {status === "no_results" ? (
        <EmptyState text="검색은 정상 완료됐지만 조건에 맞는 임상시험이 없습니다." />
      ) : null}
      {status === "idle" ? (
        <EmptyState text="검색 조건을 검토한 후 ClinicalTrials.gov 검색을 실행하세요." />
      ) : null}

      {selectedSummary ? (
        <TrialDrawer
          detail={selectedDetail}
          detailStatus={detailStatus}
          isReference={referenceIds.has(selectedSummary.nctId)}
          onClose={() => setSelectedSummary(null)}
          onToggleReference={() => toggleReference(selectedSummary)}
          summary={selectedSummary}
        />
      ) : null}
    </div>
  );
}

function SearchStrategyForm({
  strategy,
  status,
  updateStrategy,
  onSubmit,
}: {
  strategy: ClinicalTrialsServerSearchStrategy;
  status: ApiRequestStatus;
  updateStrategy: <K extends keyof ClinicalTrialsServerSearchStrategy>(
    key: K,
    value: ClinicalTrialsServerSearchStrategy[K],
  ) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="mb-5 border border-[var(--border)] bg-white">
      <div className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
        <div>
          <h2 className="font-semibold">검색 조건 · ClinicalTrials.gov</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            아래 조건은 검색 실행 시 ClinicalTrials.gov API에 전달됩니다.
          </p>
        </div>
        <ApiStatus status={status} />
      </div>
      <form className="p-5" onSubmit={onSubmit}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 xl:grid-cols-4">
          <TextField
            label="적응증 / 질환"
            onChange={(value) => updateStrategy("condition", value)}
            required
            value={strategy.condition}
          />
          <SelectField
            label="검토 임상단계"
            onChange={(value) =>
              updateStrategy(
                "phases",
                value ? [value as ClinicalTrialPhase] : [],
              )
            }
            options={[
              ["PHASE1", "Phase 1"],
              ["PHASE2", "Phase 2"],
              ["PHASE3", "Phase 3"],
              ["PHASE4", "Phase 4"],
              ["NA", "Not applicable"],
            ]}
            value={strategy.phases[0] ?? ""}
          />
          <SelectField
            label="시험 유형"
            onChange={(value) =>
              updateStrategy(
                "studyTypes",
                value ? [value as ClinicalTrialStudyType] : [],
              )
            }
            options={[
              ["INTERVENTIONAL", "Interventional"],
              ["OBSERVATIONAL", "Observational"],
              ["EXPANDED_ACCESS", "Expanded Access"],
            ]}
            value={strategy.studyTypes[0] ?? ""}
          />
          <SelectField
            label="중재 유형"
            onChange={(value) =>
              updateStrategy(
                "interventionTypes",
                value ? [value as ClinicalTrialInterventionType] : [],
              )
            }
            options={[
              ["DRUG", "Drug"],
              ["BIOLOGICAL", "Biological"],
              ["DEVICE", "Device"],
              ["PROCEDURE", "Procedure"],
              ["RADIATION", "Radiation"],
              ["OTHER", "Other"],
            ]}
            value={strategy.interventionTypes[0] ?? ""}
          />
          <TextField
            label="시험약 / 중재"
            onChange={(value) => updateStrategy("intervention", value)}
            value={strategy.intervention}
          />
          <TextField
            label="의뢰자"
            onChange={(value) => updateStrategy("sponsor", value)}
            value={strategy.sponsor}
          />
          <TextField
            label="국가"
            onChange={(value) => updateStrategy("country", value)}
            value={strategy.country}
          />
          <SelectField
            label="연령"
            onChange={(value) =>
              updateStrategy(
                "ageGroups",
                value ? [value as ClinicalTrialAgeGroup] : [],
              )
            }
            options={[
              ["CHILD", "Child"],
              ["ADULT", "Adult"],
              ["OLDER_ADULT", "Older adult"],
            ]}
            value={
              strategy.ageGroups.length === 1 ? strategy.ageGroups[0] : ""
            }
          />
          <SelectField
            label="성별"
            onChange={(value) =>
              updateStrategy(
                "sex",
                value as ClinicalTrialsServerSearchStrategy["sex"],
              )
            }
            options={[
              ["ALL", "All"],
              ["FEMALE", "Female"],
              ["MALE", "Male"],
            ]}
            value={strategy.sex}
          />
          <TextField
            inputType="number"
            label="시작 연도(부터)"
            onChange={(value) =>
              updateStrategy(
                "startYear",
                value ? Number(value) : undefined,
              )
            }
            value={strategy.startYear ? String(strategy.startYear) : ""}
          />
          <TextField
            label="키워드"
            onChange={(value) => updateStrategy("keyword", value)}
            value={strategy.keyword}
          />
        </div>

        <fieldset className="mt-5 border-t border-[var(--border)] pt-4">
          <legend className="pr-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            모집 상태
          </legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {statusOptions.map(([value, label]) => (
              <label className="flex items-center gap-2 text-xs" key={value}>
                <input
                  checked={strategy.statuses.includes(value)}
                  onChange={(event) =>
                    updateStrategy(
                      "statuses",
                      event.target.checked
                        ? [...strategy.statuses, value]
                        : strategy.statuses.filter((item) => item !== value),
                    )
                  }
                  type="checkbox"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 flex justify-end">
          <button
            className="bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            disabled={status === "loading"}
            type="submit"
          >
            {status === "loading"
              ? "검색 중…"
              : "ClinicalTrials.gov 검색"}
          </button>
        </div>
      </form>
    </section>
  );
}

function ExecutedStrategy({
  strategy,
  apiParameters,
}: {
  strategy: ClinicalTrialsServerSearchStrategy;
  apiParameters: Record<string, string>;
}) {
  const chips = [
    strategy.condition && `Condition: ${strategy.condition}`,
    strategy.phases.length && `Phase: ${strategy.phases.join(", ")}`,
    strategy.studyTypes.length &&
      `Study Type: ${strategy.studyTypes.join(", ")}`,
    strategy.interventionTypes.length &&
      `Intervention Type: ${strategy.interventionTypes.join(", ")}`,
    strategy.statuses.length && `Status: ${strategy.statuses.join(", ")}`,
    strategy.country && `Country: ${strategy.country}`,
    strategy.keyword && `Keyword: ${strategy.keyword}`,
  ].filter(Boolean);

  return (
    <section className="mb-5 border border-[#b8d8cf] bg-[#f4faf8] px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-2 text-xs font-semibold uppercase text-[#245c50]">
          적용된 검색 조건
        </span>
        {chips.map((chip) => (
          <span
            className="border border-[#c9e3dc] bg-white px-2 py-1 text-xs"
            key={String(chip)}
          >
            {chip}
          </span>
        ))}
      </div>
      <details className="mt-3 text-xs text-[var(--muted)]">
        <summary className="cursor-pointer">ClinicalTrials.gov parameters</summary>
        <code className="mt-2 block break-all">
          {new URLSearchParams(apiParameters).toString()}
        </code>
      </details>
    </section>
  );
}

function LandscapeSummary({
  apiMatched,
  retrieved,
  displayed,
  stats,
}: {
  apiMatched?: number;
  retrieved: number;
  displayed: number;
  stats: ReturnType<typeof summarizeRetrievedTrials>;
}) {
  const kpis = [
    [clinicalTrialLabels.apiMatched, apiMatched?.toLocaleString() ?? "확인되지 않음"],
    [clinicalTrialLabels.retrieved, retrieved],
    [clinicalTrialLabels.displayed, displayed],
    ["진행 중 임상", stats.active],
    ["의뢰자 수", stats.sponsors],
    ["시험약 / 중재 수", stats.interventions],
  ];

  return (
    <section className="mb-5 border border-[var(--border)] bg-white">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map(([label, value], index) => (
          <div
            className={`px-4 py-4 ${index ? "border-l border-[var(--border)]" : ""}`}
            key={label}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              {label}
            </p>
            <p className="mt-2 text-xl font-semibold">{value}</p>
            {index >= 3 ? (
              <p className="mt-1 text-[10px] text-[var(--muted)]">
                불러온 임상 기준
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 border-t border-[var(--border)] lg:grid-cols-3">
        <Distribution
          title="임상단계 분포"
          values={stats.phaseDistribution}
        />
        <Distribution
          title="모집 상태 분포"
          values={stats.statusDistribution}
        />
        <Distribution
          title="주요 국가"
          values={stats.countryDistribution}
        />
      </div>
    </section>
  );
}

function SelectedReferenceTrials({
  references,
  onRemove,
  onOpen,
}: {
  references: SavedReferenceTrial[];
  onRemove: (trial: ClinicalTrialSummary) => void;
  onOpen: (trial: ClinicalTrialSummary) => void;
}) {
  return (
    <section className="mb-5 border border-[var(--border)] bg-white">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">선택한 참고 임상시험</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            검토 과제별로 브라우저에 임시 저장됩니다.
          </p>
        </div>
        <span className="text-sm font-semibold">{references.length}</span>
      </div>
      {references.length ? (
        <div className="divide-y divide-[var(--border)]">
          {references.map(({ trial }) => (
            <div
              className="flex items-center justify-between gap-4 px-5 py-3 text-xs"
              key={trial.nctId}
            >
              <button
                className="text-left"
                onClick={() => onOpen(trial)}
                type="button"
              >
                <span className="font-semibold text-[var(--accent)]">
                  {trial.nctId}
                </span>
                <span className="ml-3">{trial.briefTitle}</span>
              </button>
              <button
                className="font-semibold text-[var(--danger)]"
                onClick={() => onRemove(trial)}
                type="button"
              >
                해제
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-4 text-xs text-[var(--muted)]">
          선택한 참고 임상시험이 없습니다.
        </p>
      )}
    </section>
  );
}

function LocalFilters({
  filters,
  trials,
  updateFilter,
}: {
  filters: ClinicalTrialsLocalFilters;
  trials: ClinicalTrialSummary[];
  updateFilter: (key: keyof ClinicalTrialsLocalFilters, value: string) => void;
}) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        현재 불러온 임상 필터
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <TextFilter
          label="의뢰자"
          onChange={(value) => updateFilter("sponsor", value)}
          value={filters.sponsor}
        />
        <TextFilter
          label="시험약 / 중재"
          onChange={(value) => updateFilter("intervention", value)}
          value={filters.intervention}
        />
        <label className="text-[11px] font-medium text-[#475467]">
          국가
          <select
            className="mt-1 w-full border border-[var(--border)] bg-white px-2 py-2 text-xs"
            onChange={(event) => updateFilter("country", event.target.value)}
            value={filters.country}
          >
            <option value="">전체</option>
            {unique(trials.flatMap((trial) => trial.countries)).map((country) => (
              <option key={country}>{country}</option>
            ))}
          </select>
        </label>
        <TextFilter
          label="평가변수 키워드"
          onChange={(value) => updateFilter("endpoint", value)}
          value={filters.endpoint}
        />
        <TextFilter
          inputType="number"
          label="최소 대상자 수"
          onChange={(value) => updateFilter("minEnrollment", value)}
          value={filters.minEnrollment}
        />
        <TextFilter
          inputType="number"
          label="최대 대상자 수"
          onChange={(value) => updateFilter("maxEnrollment", value)}
          value={filters.maxEnrollment}
        />
      </div>
    </div>
  );
}

function TrialTable({
  trials,
  referenceIds,
  onOpen,
  onToggleReference,
}: {
  trials: ClinicalTrialSummary[];
  referenceIds: Set<string>;
  onOpen: (trial: ClinicalTrialSummary) => void;
  onToggleReference: (trial: ClinicalTrialSummary) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1450px] border-collapse text-left text-xs">
        <thead className="bg-[#f8f9fb] uppercase tracking-wide text-[var(--muted)]">
          <tr>
            {[
              "참고",
              "NCT ID",
              "시험약 / 중재",
              "의뢰자",
              "Phase",
              "모집 상태",
              "대상 환자군 / 질환",
              "대상자 수",
              "시험 설계",
              "일차 평가변수",
              "국가",
              "시작일",
              "임상 관련성",
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
          {trials.map((trial) => (
            <tr
              className="cursor-pointer border-b border-[var(--border)] hover:bg-[#fafbfc]"
              key={trial.nctId}
              onClick={() => onOpen(trial)}
            >
              <td className="px-3 py-3">
                <input
                  aria-label={`Add ${trial.nctId} to Reference Trials`}
                  checked={referenceIds.has(trial.nctId)}
                  onChange={() => onToggleReference(trial)}
                  onClick={(event) => event.stopPropagation()}
                  type="checkbox"
                />
              </td>
              <td className="px-3 py-3 font-semibold text-[var(--accent)]">
                <a
                  href={trial.source.url}
                  onClick={(event) => event.stopPropagation()}
                  rel="noreferrer"
                  target="_blank"
                >
                  {trial.nctId}
                </a>
              </td>
              <td className="max-w-52 px-3 py-3">
                {trial.interventions.join(", ") || "확인되지 않음"}
              </td>
              <td className="max-w-44 px-3 py-3">
                {trial.sponsor ?? "확인되지 않음"}
              </td>
              <td className="px-3 py-3">
                {trial.phases.join(", ") || "확인되지 않음"}
              </td>
              <td className="px-3 py-3">
                {trial.overallStatus ?? "확인되지 않음"}
              </td>
              <td className="max-w-56 px-3 py-3">
                {trial.conditions.join(", ") || "확인되지 않음"}
              </td>
              <td className="px-3 py-3">
                {trial.enrollment ?? "확인되지 않음"}
              </td>
              <td className="max-w-48 px-3 py-3">
                {[
                  trial.design.allocation,
                  trial.design.interventionModel,
                  trial.design.masking,
                ]
                  .filter(Boolean)
                  .join(" · ") || "확인되지 않음"}
              </td>
              <td className="max-w-60 px-3 py-3">
                {trial.primaryOutcomes[0]?.measure ?? "확인되지 않음"}
              </td>
              <td className="max-w-48 px-3 py-3">
                {trial.countries.join(", ") || "확인되지 않음"}
              </td>
              <td className="px-3 py-3">
                {trial.startDate ?? "확인되지 않음"}
              </td>
              <td className="px-3 py-3">
                <span className="text-[var(--muted)]">미평가</span>
                <span className="block text-[10px]">미검토</span>
              </td>
            </tr>
          ))}
          {!trials.length ? (
            <tr>
              <td
                className="px-4 py-10 text-center text-[var(--muted)]"
                colSpan={13}
              >
                현재 표시 필터에 맞는 임상시험이 없습니다.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function LoadMorePanel({
  apiMatched,
  retrieved,
  hasNextPage,
  loadMoreStatus,
  onLoadMore,
}: {
  apiMatched?: number;
  retrieved: number;
  hasNextPage: boolean;
  loadMoreStatus: ApiRequestStatus;
  onLoadMore: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-4 border-t border-[var(--border)] px-5 py-4">
      <span className="text-xs text-[var(--muted)]">
        {clinicalTrialLabels.retrieved} {retrieved} /{" "}
        {apiMatched?.toLocaleString() ?? "확인되지 않음"}
      </span>
      {hasNextPage ? (
        <button
          className="border border-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent)] disabled:opacity-60"
          disabled={loadMoreStatus === "loading"}
          onClick={onLoadMore}
          type="button"
        >
          {loadMoreStatus === "loading"
            ? "불러오는 중…"
            : loadMoreStatus === "failed" ||
                loadMoreStatus === "rate_limited"
              ? "추가 불러오기 재시도"
              : "추가 불러오기"}
        </button>
      ) : (
        <span className="text-xs font-semibold">모두 불러옴</span>
      )}
    </div>
  );
}

function TrialDrawer({
  summary,
  detail,
  detailStatus,
  isReference,
  onClose,
  onToggleReference,
}: {
  summary: ClinicalTrialSummary;
  detail: ClinicalTrial | null;
  detailStatus: ApiRequestStatus;
  isReference: boolean;
  onClose: () => void;
  onToggleReference: () => void;
}) {
  const trial = detail ?? summary;
  return (
    <div
      className="fixed inset-0 z-40 bg-black/20"
      onMouseDown={onClose}
      role="presentation"
    >
      <aside
        aria-label={`${summary.nctId} 상세`}
        className="ml-auto h-full w-full max-w-[680px] overflow-y-auto border-l border-[var(--border)] bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between border-b border-[var(--border)] bg-white px-6 py-5">
          <div>
            <a
              className="text-sm font-semibold text-[var(--accent)] underline"
              href={summary.source.url}
              rel="noreferrer"
              target="_blank"
            >
              {summary.nctId}
            </a>
            <h2 className="mt-2 max-w-lg text-lg font-semibold leading-6">
              {summary.officialTitle ?? summary.briefTitle}
            </h2>
          </div>
          <button
            aria-label="임상시험 상세 닫기"
            className="text-xl text-[var(--muted)]"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="space-y-6 p-6">
          {detailStatus === "loading" ? (
            <p className="text-sm text-[var(--muted)]">상세 정보를 불러오는 중…</p>
          ) : null}
          {detailStatus === "failed" ? (
            <p className="text-sm text-[var(--danger)]">
              상세정보를 불러오지 못했습니다. 목록 정보를 표시합니다.
            </p>
          ) : null}
          <DetailGrid trial={trial} />
          <DetailSection
            title="일차 평가변수"
            values={trial.primaryOutcomes.map(
              (item) =>
                `${item.measure}${item.timeFrame ? ` (${item.timeFrame})` : ""}`,
            )}
          />
          {detail ? (
            <>
              <DetailSection
                title="이차 평가변수"
                values={detail.secondaryOutcomes.map((item) => item.measure)}
              />
              <DetailSection
                title="선정/제외 기준"
                values={[detail.eligibilityCriteria ?? "확인되지 않음"]}
              />
              <DetailSection
                title="실시 기관"
                values={detail.locations.map((location) =>
                  [location.facility, location.city, location.country]
                    .filter(Boolean)
                    .join(", "),
                )}
              />
            </>
          ) : null}
          <button
            className="w-full border border-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--accent)]"
            onClick={onToggleReference}
            type="button"
          >
            {isReference
              ? "참고 임상시험에서 해제"
              : "참고 임상시험으로 선택"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function DetailGrid({
  trial,
}: {
  trial: ClinicalTrial | ClinicalTrialSummary;
}) {
  const detail = "collaborators" in trial ? trial : null;
  const rows: Array<[string, string | number | undefined]> = [
    ["의뢰자", trial.sponsor],
    ["공동 의뢰자", detail?.collaborators.join(", ")],
    ["Phase", trial.phases.join(", ")],
    ["모집 상태", trial.overallStatus],
    ["질환", trial.conditions.join(", ")],
    ["시험약 / 중재", trial.interventions.join(", ")],
    ["대상자 수", trial.enrollment],
    [
      "시험 설계",
      [
        trial.design.allocation,
        trial.design.interventionModel,
        trial.design.masking,
        trial.design.primaryPurpose,
      ]
        .filter(Boolean)
        .join(" · "),
    ],
    ["연령", detail ? `${detail.minimumAge ?? "N/A"} – ${detail.maximumAge ?? "N/A"}` : undefined],
    ["성별", detail?.sex],
    ["국가", trial.countries.join(", ")],
    ["시작일", trial.startDate],
    ["Primary Completion", detail?.primaryCompletionDate],
    ["완료일", detail?.studyCompletionDate],
  ];
  return (
    <dl className="grid grid-cols-2 border border-[var(--border)]">
      {rows.map(([label, value]) => (
        <div
          className="border-b border-r border-[var(--border)] p-3 even:border-r-0"
          key={label}
        >
          <dt className="text-[10px] font-semibold uppercase text-[var(--muted)]">
            {label}
          </dt>
          <dd className="mt-1 text-sm">{value || "확인되지 않음"}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailSection({ title, values }: { title: string; values: string[] }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </h3>
      <ul className="mt-2 space-y-2 text-sm">
        {(values.length ? values : ["확인되지 않음"]).map((value, index) => (
          <li
            className="border-l-2 border-[#b8d8cf] pl-3"
            key={`${title}-${index}`}
          >
            {value}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ApiStatus({ status }: { status: ApiRequestStatus }) {
  const labels: Record<ApiRequestStatus, string> = {
    idle: "대기",
    connected: "연결됨",
    loading: "검색 중",
    failed: "실패",
    no_results: "결과 없음",
    rate_limited: "요청 제한",
  };
  return (
    <span className="border border-[var(--border)] bg-[#f8f9fb] px-2.5 py-1 text-xs font-semibold">
      {labels[status]}
    </span>
  );
}

function Distribution({
  title,
  values,
}: {
  title: string;
  values: Array<[string, number]>;
}) {
  const max = Math.max(...values.map(([, value]) => value), 1);
  return (
    <div className="border-r border-[var(--border)] p-4 last:border-r-0">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          {title}
        </h3>
        <span className="text-[10px] text-[var(--muted)]">
          Based on retrieved trials
        </span>
      </div>
      <div className="space-y-2">
        {values.slice(0, 5).map(([label, value]) => (
          <div
            className="grid grid-cols-[105px_1fr_28px] items-center gap-2 text-xs"
            key={label}
          >
            <span className="truncate" title={label}>
              {label}
            </span>
            <span className="h-2 bg-[#edf0f2]">
              <span
                className="block h-full bg-[var(--accent)]"
                style={{ width: `${(value / max) * 100}%` }}
              />
            </span>
            <span className="text-right font-semibold">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  required = false,
  inputType = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  inputType?: "text" | "number";
}) {
  return (
    <label className="text-xs font-medium text-[#475467]">
      {label}
      <input
        className="mt-1.5 w-full border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={inputType}
        value={value}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-medium text-[#475467]">
      {label}
      <select
        className="mt-1.5 w-full border border-[var(--border)] bg-white px-3 py-2 text-sm"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">Any</option>
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextFilter({
  label,
  value,
  onChange,
  inputType = "search",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputType?: "search" | "number";
}) {
  return (
    <label className="text-[11px] font-medium text-[#475467]">
      {label}
      <input
        className="mt-1 w-full border border-[var(--border)] px-2 py-2 text-xs"
        onChange={(event) => onChange(event.target.value)}
        type={inputType}
        value={value}
      />
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-[#c7cdd4] bg-white px-6 py-14 text-center text-sm text-[var(--muted)]">
      {text}
    </div>
  );
}

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function buildSearchUrl(
  strategy: ClinicalTrialsServerSearchStrategy,
  pageToken?: string,
) {
  const parameters = new URLSearchParams({
    condition: strategy.condition,
    phases: strategy.phases.join(","),
    studyTypes: strategy.studyTypes.join(","),
    statuses: strategy.statuses.join(","),
    interventionTypes: strategy.interventionTypes.join(","),
    intervention: strategy.intervention,
    sponsor: strategy.sponsor,
    country: strategy.country,
    ageGroups: strategy.ageGroups.join(","),
    sex: strategy.sex,
    startYear: strategy.startYear ? String(strategy.startYear) : "",
    keyword: strategy.keyword,
    pageSize: "50",
  });
  if (pageToken) parameters.set("pageToken", pageToken);
  return `/api/clinical-trials?${parameters.toString()}`;
}

function deduplicateTrials(
  current: ClinicalTrialSummary[],
  incoming: ClinicalTrialSummary[],
) {
  const byNctId = new Map(
    [...current, ...incoming].map((trial) => [trial.nctId, trial]),
  );
  return Array.from(byNctId.values());
}

function matchesLocalFilters(
  trial: ClinicalTrialSummary,
  filters: ClinicalTrialsLocalFilters,
) {
  const contains = (value: string, query: string) =>
    value.toLowerCase().includes(query.trim().toLowerCase());
  const enrollment = trial.enrollment;
  return (
    (!filters.sponsor || contains(trial.sponsor ?? "", filters.sponsor)) &&
    (!filters.intervention ||
      contains(trial.interventions.join(" "), filters.intervention)) &&
    (!filters.country || trial.countries.includes(filters.country)) &&
    (!filters.endpoint ||
      contains(
        trial.primaryOutcomes.map((item) => item.measure).join(" "),
        filters.endpoint,
      )) &&
    (!filters.minEnrollment ||
      (enrollment !== undefined &&
        enrollment >= Number(filters.minEnrollment))) &&
    (!filters.maxEnrollment ||
      (enrollment !== undefined &&
        enrollment <= Number(filters.maxEnrollment)))
  );
}

function summarizeRetrievedTrials(trials: ClinicalTrialSummary[]) {
  const activeStatuses = new Set([
    "RECRUITING",
    "NOT_YET_RECRUITING",
    "ACTIVE_NOT_RECRUITING",
    "ENROLLING_BY_INVITATION",
  ]);
  return {
    active: trials.filter(
      (trial) =>
        trial.overallStatus && activeStatuses.has(trial.overallStatus),
    ).length,
    sponsors: unique(trials.map((trial) => trial.sponsor)).length,
    interventions: unique(
      trials.flatMap((trial) => trial.interventions),
    ).length,
    phaseDistribution: countValues(
      trials.flatMap((trial) => trial.phases),
    ),
    statusDistribution: countValues(
      trials.map((trial) => trial.overallStatus),
    ),
    countryDistribution: countValues(
      trials.flatMap((trial) => trial.countries),
    ),
  };
}

function unique(values: Array<string | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  ).sort();
}

function countValues(
  values: Array<string | undefined>,
): Array<[string, number]> {
  const counts = new Map<string, number>();
  values
    .filter((value): value is string => Boolean(value))
    .forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}
