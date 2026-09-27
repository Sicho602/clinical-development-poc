"use client";

import { useEffect, useState } from "react";

import { DemoBadge } from "@/components/layout/demo-badge";
import { PageGuide } from "@/components/layout/page-guide";
import { WorkflowProgress } from "@/components/layout/workflow-progress";
import type {
  Assessment,
  DevelopmentStrategy,
  HistoricalBenchmark,
} from "@/domain/models";
import { assessmentDisplayTitle, isDemoAssessment } from "@/lib/demo-assessment";
import { missingValueCopy, pageGuides } from "@/lib/ui-copy";
import { LocalStorageAssessmentRepository } from "@/repositories/browser/assessment-repository";
import { LocalStorageDevelopmentStrategyRepository } from "@/repositories/browser/development-strategy-repository";
import { LocalStorageEvidenceExtractionRepository } from "@/repositories/browser/evidence-extraction-repository";
import { LocalStorageHistoricalBenchmarkRepository } from "@/repositories/browser/historical-benchmark-repository";
import { LocalStoragePublicationSelectionRepository } from "@/repositories/browser/publication-selection-repository";
import { LocalStorageReferenceTrialRepository } from "@/repositories/browser/reference-trial-repository";

const assessmentRepository = new LocalStorageAssessmentRepository();
const referenceRepository = new LocalStorageReferenceTrialRepository();
const publicationRepository =
  new LocalStoragePublicationSelectionRepository();
const extractionRepository = new LocalStorageEvidenceExtractionRepository();
const benchmarkRepository = new LocalStorageHistoricalBenchmarkRepository();
const strategyRepository = new LocalStorageDevelopmentStrategyRepository();

export function AssessmentReportWorkspace({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [referenceCount, setReferenceCount] = useState(0);
  const [publicationCount, setPublicationCount] = useState(0);
  const [approvedFieldCount, setApprovedFieldCount] = useState(0);
  const [benchmark, setBenchmark] = useState<HistoricalBenchmark | null>(null);
  const [strategy, setStrategy] = useState<DevelopmentStrategy | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      assessmentRepository.getById(assessmentId),
      referenceRepository.list(assessmentId),
      publicationRepository.list(assessmentId),
      extractionRepository.list(assessmentId),
      benchmarkRepository.getByAssessmentId(assessmentId),
      strategyRepository.getByAssessmentId(assessmentId),
    ]).then(
      ([
        savedAssessment,
        references,
        publications,
        extractions,
        savedBenchmark,
        savedStrategy,
      ]) => {
        setAssessment(savedAssessment);
        setReferenceCount(references.length);
        setPublicationCount(publications.length);
        setApprovedFieldCount(
          extractions
            .flatMap((item) => item.fields)
            .filter((field) => field.reviewStatus === "approved").length,
        );
        setBenchmark(savedBenchmark);
        setStrategy(savedStrategy);
        setLoaded(true);
      },
    );
  }, [assessmentId]);

  if (!loaded) {
    return (
      <p className="border border-[var(--border)] bg-white p-6 text-sm text-[var(--muted)]">
        종합 검토 결과를 불러오는 중입니다.
      </p>
    );
  }

  const field = (key: DevelopmentStrategy["fields"][number]["key"]) =>
    strategy?.fields.find((item) => item.key === key);
  const reviewedOrSuggested = (
    key: DevelopmentStrategy["fields"][number]["key"],
  ) =>
    field(key)?.reviewedValue ??
    field(key)?.originalSuggestedValue ??
    missingValueCopy.notCalculated;
  const selectedSummaries = (benchmark?.summaries ?? []).filter((item) =>
    (benchmark?.metrics ?? []).some(
      (metric) => metric.metricId === item.metricId && metric.status === "selected",
    ),
  );
  const benchmarkRows =
    selectedSummaries.length > 0
      ? selectedSummaries.map((item) => [
          item.displayName,
          item.observedRange ?? missingValueCopy.notCalculated,
        ])
      : [["선택된 기준 지표", missingValueCopy.notReported]];
  const benchmarkSummaryText = selectedSummaries.length
    ? selectedSummaries
        .map(
          (item) =>
            `${item.displayName}: ${item.observedRange ?? missingValueCopy.notCalculated}`,
        )
        .join("; ")
    : missingValueCopy.notCalculated;

  const sections = [
    {
      title: "1. 검토 대상",
      rows: [
        ["후보물질 / 제품", assessment?.candidate.name ?? missingValueCopy.notReported],
        ["적응증", assessment?.candidate.indication ?? missingValueCopy.notReported],
        [
          "검토 임상단계",
          assessment?.candidate.targetClinicalPhase ??
            missingValueCopy.notReported,
        ],
        [
          "개발 대상 국가",
          assessment?.candidate.targetGeographies.join(", ") ||
            missingValueCopy.notReported,
        ],
      ],
    },
    {
      title: "2. 핵심 검토사항",
      rows: [
        [
          "핵심 검토사항",
          assessment?.researchQuestion.text ?? missingValueCopy.notReported,
        ],
      ],
    },
    {
      title: "3. 주요 근거",
      rows: [
        ["선택한 참고 임상시험", String(referenceCount)],
        ["선택 문헌", String(publicationCount)],
        ["검토 완료 항목", String(approvedFieldCount)],
      ],
    },
    {
      title: "4. 기존 치료성과",
      rows: benchmarkRows,
    },
    {
      title: "5. 임상개발 검토안",
      rows: [
        ["임상단계", reviewedOrSuggested("target_phase")],
        ["대상 환자군", reviewedOrSuggested("target_population")],
        ["시험 설계", reviewedOrSuggested("study_design")],
        ["일차 평가변수", reviewedOrSuggested("primary_endpoint")],
        ["목표 치료효과", reviewedOrSuggested("target_effect")],
      ],
    },
    {
      title: "6. 예상 대상자 수",
      rows: [["예상 대상자 수", reviewedOrSuggested("sample_size")]],
    },
    {
      title: "7. 예상 임상 일정",
      rows: [["예상 임상기간", missingValueCopy.notCalculated]],
    },
    {
      title: "8. 예상 비용",
      rows: [["예상 비용", missingValueCopy.notCalculated]],
    },
    {
      title: "9. 수행 난이도",
      rows: [
        ["대상자 모집", missingValueCopy.reviewRequired],
        ["경쟁 임상", missingValueCopy.reviewRequired],
        ["운영 복잡도", missingValueCopy.reviewRequired],
        ["규제", missingValueCopy.reviewRequired],
        ["통계", missingValueCopy.reviewRequired],
        ["안전성", missingValueCopy.reviewRequired],
      ],
    },
    {
      title: "10. 주요 Risk",
      rows: [["주요 Risk", missingValueCopy.reviewRequired]],
    },
    {
      title: "11. 추가 확인 필요사항",
      rows: [["추가 확인 필요사항", missingValueCopy.reviewRequired]],
    },
  ];

  return (
    <div className="min-w-0">
      <WorkflowProgress assessmentId={assessmentId} />
      <header className="mb-5 border border-[var(--border)] bg-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">
            {assessmentId} · 종합 검토 결과
          </p>
          {isDemoAssessment(assessmentId) ? <DemoBadge compact /> : null}
        </div>
        <h1 className="mt-2 text-2xl font-semibold">
          {assessmentDisplayTitle(assessmentId, assessment?.candidate.name)}
        </h1>
        <PageGuide>{pageGuides.report}</PageGuide>
      </header>

      <section className="mb-5 border border-[var(--border)] bg-white px-5 py-4">
        <h2 className="font-semibold">한 화면 요약</h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["임상단계", reviewedOrSuggested("target_phase")],
            ["대상 환자군", reviewedOrSuggested("target_population")],
            ["시험설계", reviewedOrSuggested("study_design")],
            ["일차 평가변수", reviewedOrSuggested("primary_endpoint")],
            ["기존 치료성과", benchmarkSummaryText],
            [
              "목표 치료효과",
              reviewedOrSuggested("target_effect") ===
              missingValueCopy.notCalculated
                ? missingValueCopy.userInputRequired
                : reviewedOrSuggested("target_effect"),
            ],
            ["예상 대상자 수", reviewedOrSuggested("sample_size")],
            ["예상 임상기간", missingValueCopy.notCalculated],
            ["예상 비용", missingValueCopy.notCalculated],
            ["모집 난이도", missingValueCopy.reviewRequired],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] font-semibold text-[var(--muted)]">
                {label}
              </dt>
              <dd className="mt-1 text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {sections.map((section) => (
        <section
          className="mb-5 border border-[var(--border)] bg-white"
          key={section.title}
        >
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h2 className="font-semibold">{section.title}</h2>
          </div>
          <dl className="grid grid-cols-1 md:grid-cols-2">
            {section.rows.map(([label, value]) => (
              <div
                className="border-b border-r border-[var(--border)] px-5 py-4"
                key={label}
              >
                <dt className="text-[11px] font-semibold text-[var(--muted)]">
                  {label}
                </dt>
                <dd className="mt-2 text-sm leading-6">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
