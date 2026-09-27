"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import type {
  ApiRequestStatus,
  Assessment,
  EvidenceCategory,
  Publication,
  PublicationReviewStatus,
  PubMedSearchStrategy,
} from "@/domain/models";
import { LocalStorageAssessmentRepository } from "@/repositories/browser/assessment-repository";
import {
  LocalStoragePublicationSelectionRepository,
  type SavedPublicationEvidence,
} from "@/repositories/browser/publication-selection-repository";
import { LocalStorageReferenceTrialRepository } from "@/repositories/browser/reference-trial-repository";
import { LocalStorageSearchLogRepository } from "@/repositories/browser/search-log-repository";
import {
  derivePubMedStrategies,
  evidenceCategories,
  evidenceCategoryLabels,
  evidenceCategoryQuestions,
} from "@/services/connectors/pubmed/pubmed-search-strategy";
import type { EvidenceExtractionProviderDescriptor } from "@/services/ai/evidence-extraction-contract";
import { DemoBadge } from "@/components/layout/demo-badge";
import { PageGuide } from "@/components/layout/page-guide";
import { WorkflowProgress } from "@/components/layout/workflow-progress";
import {
  assessmentDisplayTitle,
  ensureDemoAssessment,
  isDemoAssessment,
} from "@/lib/demo-assessment";
import { assessmentLabels, pageGuides } from "@/lib/ui-copy";

interface PubMedResponse {
  status: ApiRequestStatus;
  data?: Publication[];
  pagination?: {
    totalCount?: number;
    nextPageToken?: string;
  };
  appliedStrategy?: PubMedSearchStrategy;
  appliedQuery?: string;
  error?: {
    code: string;
    message: string;
    retryAfterSeconds?: number;
  };
}

const assessmentRepository = new LocalStorageAssessmentRepository();
const selectionRepository =
  new LocalStoragePublicationSelectionRepository();
const referenceRepository = new LocalStorageReferenceTrialRepository();
const searchLogRepository = new LocalStorageSearchLogRepository();

const publicationTypeOptions = [
  "Clinical Trial",
  "Randomized Controlled Trial",
  "Meta-Analysis",
  "Systematic Review",
  "Review",
  "Observational Study",
];

export function EvidenceWorkspace({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [strategies, setStrategies] = useState<Record<
    EvidenceCategory,
    PubMedSearchStrategy
  > | null>(null);
  const [category, setCategory] =
    useState<EvidenceCategory>("disease_landscape");
  const [publications, setPublications] = useState<Publication[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<
    SavedPublicationEvidence[]
  >([]);
  const [referenceTrialCount, setReferenceTrialCount] = useState(0);
  const [matchedCount, setMatchedCount] = useState<number | undefined>();
  const [nextPageToken, setNextPageToken] = useState<string>();
  const [status, setStatus] = useState<ApiRequestStatus>("idle");
  const [loadMoreStatus, setLoadMoreStatus] =
    useState<ApiRequestStatus>("idle");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [detailPublication, setDetailPublication] =
    useState<Publication | null>(null);
  const [isMockProvider, setIsMockProvider] = useState(false);

  useEffect(() => {
    Promise.resolve(
      isDemoAssessment(assessmentId)
        ? ensureDemoAssessment()
        : Promise.resolve(null),
    ).then(() =>
    Promise.all([
      assessmentRepository.getById(assessmentId),
      selectionRepository.list(assessmentId),
      referenceRepository.list(assessmentId),
      fetch("/api/evidence-extraction").then(
        (response) =>
          response.json() as Promise<EvidenceExtractionProviderDescriptor>,
      ),
    ])
    )
      .then(([savedAssessment, savedEvidence, references, provider]) => {
        setAssessment(savedAssessment);
        setSelectedEvidence(savedEvidence);
        setReferenceTrialCount(references.length);
        setIsMockProvider(provider.isMock);
        if (savedAssessment) {
          setStrategies(derivePubMedStrategies(savedAssessment));
        } else {
          setError("Assessment를 찾을 수 없습니다.");
        }
      })
      .catch(() => setError("Evidence 데이터를 불러오지 못했습니다."));
  }, [assessmentId]);

  const strategy = strategies?.[category] ?? null;
  const selectedForCategory = useMemo(
    () =>
      selectedEvidence.filter((item) => item.categories.includes(category)),
    [category, selectedEvidence],
  );
  const selectedPmids = useMemo(
    () => new Set(selectedForCategory.map((item) => item.publication.pmid)),
    [selectedForCategory],
  );
  const categoryCounts = useMemo(
    () =>
      Object.fromEntries(
        evidenceCategories.map((item) => [
          item,
          selectedEvidence.filter((entry) => entry.categories.includes(item))
            .length,
        ]),
      ) as Record<EvidenceCategory, number>,
    [selectedEvidence],
  );

  function updateStrategy(patch: Partial<PubMedSearchStrategy>) {
    setStrategies((current) =>
      current
        ? {
            ...current,
            [category]: { ...current[category], ...patch },
          }
        : current,
    );
  }

  function changeCategory(nextCategory: EvidenceCategory) {
    setCategory(nextCategory);
    setPublications([]);
    setMatchedCount(undefined);
    setNextPageToken(undefined);
    setAppliedQuery("");
    setStatus("idle");
    setError(null);
    setDetailPublication(null);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!strategy) return;
    setStatus("loading");
    setError(null);
    setPublications([]);
    setMatchedCount(undefined);
    setNextPageToken(undefined);

    const payload = await requestPublications(strategy);
    if (!payload) return;
    const retrieved = payload.data ?? [];
    setPublications(retrieved);
    setMatchedCount(payload.pagination?.totalCount);
    setNextPageToken(payload.pagination?.nextPageToken);
    setAppliedQuery(payload.appliedQuery ?? strategy.query);
    setStatus(retrieved.length ? "connected" : "no_results");
    await appendSearchLog(
      "evidence_category",
      strategy,
      payload.appliedQuery ?? strategy.query,
      payload.pagination?.totalCount ?? null,
      retrieved.length,
    );
  }

  async function handleLoadMore() {
    if (!strategy || !nextPageToken) return;
    setLoadMoreStatus("loading");
    setError(null);
    const payload = await requestPublications(strategy, nextPageToken, true);
    if (!payload) return;
    const combined = deduplicatePublications(
      publications,
      payload.data ?? [],
    );
    setPublications(combined);
    setNextPageToken(payload.pagination?.nextPageToken);
    setLoadMoreStatus("connected");
    await appendSearchLog(
      "pagination",
      strategy,
      payload.appliedQuery ?? strategy.query,
      payload.pagination?.totalCount ?? matchedCount ?? null,
      combined.length,
    );
  }

  async function requestPublications(
    searchStrategy: PubMedSearchStrategy,
    pageToken?: string,
    isLoadMore = false,
  ): Promise<PubMedResponse | null> {
    try {
      const response = await fetch(buildPubMedUrl(searchStrategy, pageToken));
      const payload = (await response.json()) as PubMedResponse;
      if (!response.ok || !payload.data) {
        setError(payload.error?.message ?? "PubMed 검색에 실패했습니다.");
        if (isLoadMore) {
          setLoadMoreStatus(payload.status ?? "failed");
        } else {
          setStatus(payload.status ?? "failed");
        }
        return null;
      }
      return payload;
    } catch {
      setError("PubMed E-utilities에 연결할 수 없습니다.");
      if (isLoadMore) setLoadMoreStatus("failed");
      else setStatus("failed");
      return null;
    }
  }

  async function togglePublication(publication: Publication) {
    const next = selectedPmids.has(publication.pmid)
      ? await selectionRepository.remove(
          assessmentId,
          category,
          publication.pmid,
        )
      : await selectionRepository.add(assessmentId, category, publication);
    setSelectedEvidence(next);
    await updateAssessmentPublicationIds(next);
  }

  async function updateReviewStatus(
    pmid: string,
    reviewStatus: PublicationReviewStatus,
  ) {
    const next = await selectionRepository.updateReview(
      assessmentId,
      pmid,
      reviewStatus,
    );
    setSelectedEvidence(next);
  }

  async function updateAssessmentPublicationIds(
    evidence: SavedPublicationEvidence[],
  ) {
    if (!assessment) return;
    const updatedAssessment = {
      ...assessment,
      selectedPublicationPmids: evidence.map(
        (item) => item.publication.pmid,
      ),
      updatedAt: new Date().toISOString(),
      updatedBy: assessment.owner,
    };
    await assessmentRepository.update(updatedAssessment);
    setAssessment(updatedAssessment);
  }

  async function appendSearchLog(
    searchType: string,
    searchStrategy: PubMedSearchStrategy,
    query: string,
    matched: number | null,
    retrieved: number,
  ) {
    await searchLogRepository.append({
      assessmentId,
      source: "pubmed",
      searchType,
      query,
      structuredFilters: {
        category: searchStrategy.category,
        datePreset: searchStrategy.datePreset,
        customStartDate: searchStrategy.customStartDate ?? null,
        customEndDate: searchStrategy.customEndDate ?? null,
        publicationTypes: searchStrategy.publicationTypes,
      },
      matchedCount: matched,
      retrievedCount: retrieved,
      status: retrieved ? "connected" : "no_results",
    });
  }

  return (
    <div className="min-w-0">
      <WorkflowProgress assessmentId={assessmentId} />
      <AssessmentHeader
        assessment={assessment}
        assessmentId={assessmentId}
      />
      {isMockProvider ? (
        <div className="mb-5 border border-[#d5a72f] bg-[#fff8dc] px-5 py-3 text-sm font-semibold text-[#785600]">
          DEMO MODE — Mock AI Extraction · fixture-v1
        </div>
      ) : null}
      <EvidenceSummary
        categoryCounts={categoryCounts}
        referenceTrialCount={referenceTrialCount}
        selectedPublicationCount={selectedEvidence.length}
      />
      <CategoryTabs
        category={category}
        counts={categoryCounts}
        onChange={changeCategory}
      />

      {strategy ? (
        <SearchStrategyPanel
          onSubmit={handleSearch}
          status={status}
          strategy={strategy}
          updateStrategy={updateStrategy}
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
            다시 시도
          </button>
        </div>
      ) : null}

      <SelectedEvidence
        category={category}
        items={selectedForCategory}
        onOpen={(publication) => setDetailPublication(publication)}
        onRemove={togglePublication}
        onReview={updateReviewStatus}
      />

      {status === "connected" ? (
        <section className="border border-[var(--border)] bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div>
              <h2 className="font-semibold">PubMed 검색 결과</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                검색된 문헌 {matchedCount?.toLocaleString() ?? "확인되지 않음"} ·
                불러온 문헌 {publications.length} · 선택 문헌{" "}
                {selectedForCategory.length}
              </p>
            </div>
            <a
              className="text-xs font-semibold text-[var(--accent)] underline"
              href={`/assessments/${assessmentId}/evidence/matrix`}
            >
              근거 비교표 열기
            </a>
          </div>
          {appliedQuery ? (
            <details className="border-b border-[var(--border)] px-5 py-3 text-xs">
              <summary className="cursor-pointer font-semibold">
                적용된 PubMed 검색식
              </summary>
              <code className="mt-2 block whitespace-pre-wrap break-words text-[var(--muted)]">
                {appliedQuery}
              </code>
            </details>
          ) : null}
          <PublicationTable
            category={category}
            onOpen={setDetailPublication}
            onToggle={togglePublication}
            publications={publications}
            selectedPmids={selectedPmids}
          />
          <LoadMore
            hasNext={Boolean(nextPageToken)}
            matched={matchedCount}
            onClick={handleLoadMore}
            retrieved={publications.length}
            status={loadMoreStatus}
          />
        </section>
      ) : null}

      {status === "idle" ? (
        <EmptyState text="근거 유형에 맞는 검색식을 검토한 후 PubMed 검색을 실행하세요." />
      ) : null}
      {status === "no_results" ? (
        <EmptyState text="검색은 정상 완료됐지만 PubMed 결과가 없습니다." />
      ) : null}

      {detailPublication ? (
        <PublicationDrawer
          isSelected={selectedPmids.has(detailPublication.pmid)}
          onClose={() => setDetailPublication(null)}
          onToggle={() => togglePublication(detailPublication)}
          publication={detailPublication}
        />
      ) : null}
    </div>
  );
}

function AssessmentHeader({
  assessment,
  assessmentId,
}: {
  assessment: Assessment | null;
  assessmentId: string;
}) {
  return (
    <div className="mb-5 border border-[var(--border)] bg-white px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">
              {assessmentId} · 문헌 근거
            </p>
            {isDemoAssessment(assessmentId) ? <DemoBadge compact /> : null}
          </div>
          <h1 className="mt-2 text-xl font-semibold">
            {assessmentDisplayTitle(
              assessmentId,
              assessment?.candidate.name,
            )}
          </h1>
          <PageGuide>{pageGuides.evidence}</PageGuide>
        </div>
        <div className="flex gap-4">
          {isDemoAssessment(assessmentId) ? null : (
            <a
              className="text-xs font-semibold text-[var(--accent)] underline"
              href={`/assessments/${assessmentId}/evidence/validation`}
            >
              추출 검증
            </a>
          )}
          <a
            className="text-xs font-semibold text-[var(--accent)] underline"
            href={`/assessments/${assessmentId}/search-strategy`}
          >
            유사·경쟁 임상
          </a>
        </div>
      </div>
      {assessment ? (
        <dl className="mt-4 grid grid-cols-1 gap-3 text-xs md:grid-cols-4">
          <ContextValue
            label={assessmentLabels.indication}
            value={assessment.candidate.indication}
          />
          <ContextValue
            label={assessmentLabels.targetPhase}
            value={assessment.candidate.targetClinicalPhase}
          />
          <ContextValue
            label={`${assessmentLabels.target} / ${assessmentLabels.mechanismOfAction}`}
            value={
              assessment.candidate.target ||
              assessment.candidate.mechanismOfAction ||
              "확인되지 않음"
            }
          />
          <ContextValue
            label={assessmentLabels.researchQuestion}
            value={assessment.researchQuestion.text}
          />
        </dl>
      ) : null}
    </div>
  );
}

function ContextValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold uppercase text-[var(--muted)]">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}

function EvidenceSummary({
  referenceTrialCount,
  selectedPublicationCount,
  categoryCounts,
}: {
  referenceTrialCount: number;
  selectedPublicationCount: number;
  categoryCounts: Record<EvidenceCategory, number>;
}) {
  const values = [
    ["참고 임상시험", referenceTrialCount],
    ["선택 문헌", selectedPublicationCount],
    ["기존 치료성과", categoryCounts.historical_benchmark],
    ["표적 / 작용기전", categoryCounts.target_moa],
    ["시험 설계", categoryCounts.study_design],
  ];
  return (
    <section className="mb-5 grid grid-cols-2 border border-[var(--border)] bg-white md:grid-cols-5">
      {values.map(([label, value], index) => (
        <div
          className={`px-4 py-3 ${index ? "border-l border-[var(--border)]" : ""}`}
          key={label}
        >
          <p className="text-[10px] font-semibold uppercase text-[var(--muted)]">
            {label}
          </p>
          <p className="mt-1 text-xl font-semibold">{value}</p>
        </div>
      ))}
    </section>
  );
}

function CategoryTabs({
  category,
  counts,
  onChange,
}: {
  category: EvidenceCategory;
  counts: Record<EvidenceCategory, number>;
  onChange: (category: EvidenceCategory) => void;
}) {
  return (
    <nav className="mb-5 flex overflow-x-auto border border-[var(--border)] bg-white">
      {evidenceCategories.map((item) => (
        <button
          className={`whitespace-nowrap border-r border-[var(--border)] px-4 py-3 text-xs font-semibold ${
            category === item
              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
              : "hover:bg-[#f8f9fb]"
          }`}
          key={item}
          onClick={() => onChange(item)}
          type="button"
        >
          {evidenceCategoryLabels[item]}{" "}
          <span className="ml-1 text-[var(--muted)]">{counts[item]}</span>
        </button>
      ))}
    </nav>
  );
}

function SearchStrategyPanel({
  strategy,
  status,
  updateStrategy,
  onSubmit,
}: {
  strategy: PubMedSearchStrategy;
  status: ApiRequestStatus;
  updateStrategy: (patch: Partial<PubMedSearchStrategy>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="mb-5 border border-[var(--border)] bg-white">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="font-semibold">
          {evidenceCategoryLabels[strategy.category]}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {evidenceCategoryQuestions[strategy.category]}
        </p>
      </div>
      <form className="p-5" onSubmit={onSubmit}>
        <label className="text-xs font-semibold text-[#475467]">
          PubMed 검색식
          <textarea
            className="mt-2 min-h-28 w-full border border-[var(--border)] px-3 py-3 font-mono text-xs leading-5 outline-none focus:border-[var(--accent)]"
            onChange={(event) =>
              updateStrategy({ query: event.target.value })
            }
            required
            value={strategy.query}
          />
        </label>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
          <label className="text-xs font-medium">
            발표일
            <select
              className="mt-1.5 w-full border border-[var(--border)] bg-white px-3 py-2 text-sm"
              onChange={(event) =>
                updateStrategy({
                  datePreset:
                    event.target.value as PubMedSearchStrategy["datePreset"],
                })
              }
              value={strategy.datePreset}
            >
              <option value="all">전체</option>
              <option value="last_5_years">최근 5년</option>
              <option value="last_10_years">최근 10년</option>
              <option value="custom">직접 지정</option>
            </select>
          </label>
          <fieldset>
            <legend className="text-xs font-medium">문헌 유형</legend>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {publicationTypeOptions.map((type) => (
                <label className="flex items-center gap-2 text-xs" key={type}>
                  <input
                    checked={strategy.publicationTypes.includes(type)}
                    onChange={(event) =>
                      updateStrategy({
                        publicationTypes: event.target.checked
                          ? [...strategy.publicationTypes, type]
                          : strategy.publicationTypes.filter(
                              (item) => item !== type,
                            ),
                      })
                    }
                    type="checkbox"
                  />
                  {type}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        {strategy.datePreset === "custom" ? (
          <div className="mt-3 flex gap-3">
            <input
              aria-label="Custom publication start date"
              className="border border-[var(--border)] px-3 py-2 text-xs"
              onChange={(event) =>
                updateStrategy({ customStartDate: event.target.value })
              }
              type="date"
              value={strategy.customStartDate ?? ""}
            />
            <input
              aria-label="Custom publication end date"
              className="border border-[var(--border)] px-3 py-2 text-xs"
              onChange={(event) =>
                updateStrategy({ customEndDate: event.target.value })
              }
              type="date"
              value={strategy.customEndDate ?? ""}
            />
          </div>
        ) : null}
        <div className="mt-4 flex justify-end">
          <button
            className="bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            disabled={status === "loading"}
            type="submit"
          >
            {status === "loading" ? "PubMed 검색 중…" : "PubMed 검색"}
          </button>
        </div>
      </form>
    </section>
  );
}

function SelectedEvidence({
  category,
  items,
  onOpen,
  onRemove,
  onReview,
}: {
  category: EvidenceCategory;
  items: SavedPublicationEvidence[];
  onOpen: (publication: Publication) => void;
  onRemove: (publication: Publication) => void;
  onReview: (pmid: string, status: PublicationReviewStatus) => void;
}) {
  return (
    <section className="mb-5 border border-[var(--border)] bg-white">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">
            선택 문헌 · {evidenceCategoryLabels[category]}
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {items.length}건 선택
          </p>
        </div>
      </div>
      {items.length ? (
        <div className="divide-y divide-[var(--border)]">
          {items.map((item) => (
            <div
              className="grid grid-cols-[1fr_150px_110px_70px] items-center gap-3 px-5 py-3 text-xs"
              key={item.publication.pmid}
            >
              <button
                className="text-left"
                onClick={() => onOpen(item.publication)}
                type="button"
              >
                <span className="font-semibold">
                  {item.publication.title}
                </span>
                <span className="mt-1 block text-[var(--muted)]">
                  {publicationYear(item.publication)} · PMID{" "}
                  {item.publication.pmid}
                </span>
              </button>
              <select
                aria-label={`Review status for PMID ${item.publication.pmid}`}
                className="border border-[var(--border)] bg-white px-2 py-1.5"
                onChange={(event) =>
                  onReview(
                    item.publication.pmid,
                    event.target.value as PublicationReviewStatus,
                  )
                }
                value={item.reviewStatus}
              >
                <option value="unreviewed">미검토</option>
                <option value="reviewed">검토 중</option>
                <option value="included">포함</option>
                <option value="excluded">제외</option>
              </select>
              <a
                className="font-semibold text-[var(--accent)] underline"
                href={`/assessments/${item.assessmentId}/evidence/review/${item.publication.pmid}`}
              >
                담당자 검토
              </a>
              <button
                className="font-semibold text-[var(--danger)]"
                onClick={() => onRemove(item.publication)}
                type="button"
              >
                해제
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-4 text-xs text-[var(--muted)]">
          이 근거 유형에 선택된 문헌이 없습니다.
        </p>
      )}
    </section>
  );
}

function PublicationTable({
  publications,
  selectedPmids,
  category,
  onOpen,
  onToggle,
}: {
  publications: Publication[];
  selectedPmids: Set<string>;
  category: EvidenceCategory;
  onOpen: (publication: Publication) => void;
  onToggle: (publication: Publication) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
        <thead className="bg-[#f8f9fb] uppercase tracking-wide text-[var(--muted)]">
          <tr>
            {[
              "선택",
              "PMID",
              "제목",
              "학술지 / 연도",
              "문헌 유형",
              "저자",
              "근거 유형",
              "검토 상태",
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
          {publications.map((publication) => (
            <tr
              className="cursor-pointer border-b border-[var(--border)] hover:bg-[#fafbfc]"
              key={publication.pmid}
              onClick={() => onOpen(publication)}
            >
              <td className="px-3 py-3">
                <input
                  aria-label={`PMID ${publication.pmid}을 검토 문헌에 추가`}
                  checked={selectedPmids.has(publication.pmid)}
                  onChange={() => onToggle(publication)}
                  onClick={(event) => event.stopPropagation()}
                  type="checkbox"
                />
              </td>
              <td className="px-3 py-3 font-semibold text-[var(--accent)]">
                <a
                  href={publication.sourceUrl}
                  onClick={(event) => event.stopPropagation()}
                  rel="noreferrer"
                  target="_blank"
                >
                  {publication.pmid}
                </a>
              </td>
              <td className="max-w-[420px] px-3 py-3 font-medium">
                {publication.title}
              </td>
              <td className="max-w-48 px-3 py-3">
                {publication.journal ?? "확인되지 않음"} /{" "}
                {publicationYear(publication)}
              </td>
              <td className="max-w-48 px-3 py-3">
                {publication.publicationTypes.join(", ") || "확인되지 않음"}
              </td>
              <td className="max-w-56 px-3 py-3">
                {publication.authors.slice(0, 4).join(", ")}
                {publication.authors.length > 4 ? " et al." : ""}
              </td>
              <td className="px-3 py-3">
                {evidenceCategoryLabels[category]}
              </td>
              <td className="px-3 py-3">미검토</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PublicationDrawer({
  publication,
  isSelected,
  onClose,
  onToggle,
}: {
  publication: Publication;
  isSelected: boolean;
  onClose: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/20"
      onMouseDown={onClose}
      role="presentation"
    >
      <aside
        aria-label={`PMID ${publication.pmid} detail`}
        className="ml-auto h-full w-full max-w-[720px] overflow-y-auto border-l border-[var(--border)] bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between border-b border-[var(--border)] bg-white px-6 py-5">
          <div>
            <a
              className="text-sm font-semibold text-[var(--accent)] underline"
              href={publication.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              PMID {publication.pmid}
            </a>
            <h2 className="mt-2 text-lg font-semibold leading-6">
              {publication.title}
            </h2>
          </div>
          <button
            aria-label="Close publication detail"
            className="text-xl text-[var(--muted)]"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="space-y-5 p-6 text-sm">
          <DetailValue
            label="저자"
            value={publication.authors.join(", ") || "확인되지 않음"}
          />
          <DetailValue
            label="학술지 / 발표일"
            value={`${publication.journal ?? "확인되지 않음"} · ${publication.publicationDate ?? "확인되지 않음"}`}
          />
          <DetailValue
            label="문헌 유형"
            value={
              publication.publicationTypes.join(", ") || "확인되지 않음"
            }
          />
          <DetailValue
            label="초록"
            value={publication.abstract ?? "확인되지 않음"}
            preserveWhitespace
          />
          <DetailValue
            label="MeSH"
            value={publication.meshTerms.join(", ") || "확인되지 않음"}
          />
          <DetailValue
            label="DOI"
            value={publication.doi ?? "확인되지 않음"}
          />
          <button
            className="w-full border border-[var(--accent)] px-4 py-3 font-semibold text-[var(--accent)]"
            onClick={onToggle}
            type="button"
          >
            {isSelected ? "선택 문헌에서 해제" : "검토 문헌에 추가"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function DetailValue({
  label,
  value,
  preserveWhitespace = false,
}: {
  label: string;
  value: string;
  preserveWhitespace?: boolean;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </h3>
      <p
        className={`mt-2 leading-6 ${preserveWhitespace ? "whitespace-pre-wrap" : ""}`}
      >
        {value}
      </p>
    </section>
  );
}

function LoadMore({
  matched,
  retrieved,
  hasNext,
  status,
  onClick,
}: {
  matched?: number;
  retrieved: number;
  hasNext: boolean;
  status: ApiRequestStatus;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-4 border-t border-[var(--border)] px-5 py-4">
      <span className="text-xs text-[var(--muted)]">
        불러온 문헌 {retrieved} / {matched?.toLocaleString() ?? "확인되지 않음"}
      </span>
      {hasNext ? (
        <button
          className="border border-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent)] disabled:opacity-60"
          disabled={status === "loading"}
          onClick={onClick}
          type="button"
        >
          {status === "loading"
            ? "불러오는 중…"
            : status === "failed" || status === "rate_limited"
              ? "추가 불러오기 재시도"
              : "추가 불러오기"}
        </button>
      ) : (
        <span className="text-xs font-semibold">모두 불러옴</span>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-[#c7cdd4] bg-white px-6 py-12 text-center text-sm text-[var(--muted)]">
      {text}
    </div>
  );
}

function buildPubMedUrl(
  strategy: PubMedSearchStrategy,
  pageToken?: string,
) {
  const parameters = new URLSearchParams({
    category: strategy.category,
    query: strategy.query,
    datePreset: strategy.datePreset,
    customStartDate: strategy.customStartDate ?? "",
    customEndDate: strategy.customEndDate ?? "",
    publicationTypes: strategy.publicationTypes.join(","),
    pageSize: "20",
  });
  if (pageToken) parameters.set("pageToken", pageToken);
  return `/api/pubmed?${parameters.toString()}`;
}

function deduplicatePublications(
  current: Publication[],
  incoming: Publication[],
) {
  return Array.from(
    new Map(
      [...current, ...incoming].map((publication) => [
        publication.pmid,
        publication,
      ]),
    ).values(),
  );
}

function publicationYear(publication: Publication) {
  return publication.publicationDate?.match(/\d{4}/)?.[0] ?? "확인되지 않음";
}
