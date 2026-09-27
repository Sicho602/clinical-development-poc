"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { DemoBadge } from "@/components/layout/demo-badge";
import { PageGuide } from "@/components/layout/page-guide";
import { WorkflowProgress } from "@/components/layout/workflow-progress";
import type {
  Assessment,
  DevelopmentStrategy,
  HistoricalBenchmark,
  RequestType,
} from "@/domain/models";
import {
  assessmentDisplayTitle,
  ensureDemoAssessment,
  isDemoAssessment,
} from "@/lib/demo-assessment";
import {
  assessmentLabels,
  navCopy,
  pageGuides,
  requestTypeLabels,
} from "@/lib/ui-copy";
import { LocalStorageAssessmentRepository } from "@/repositories/browser/assessment-repository";
import { LocalStorageDevelopmentStrategyRepository } from "@/repositories/browser/development-strategy-repository";
import { LocalStorageEvidenceExtractionRepository } from "@/repositories/browser/evidence-extraction-repository";
import { LocalStorageHistoricalBenchmarkRepository } from "@/repositories/browser/historical-benchmark-repository";
import { LocalStoragePublicationSelectionRepository } from "@/repositories/browser/publication-selection-repository";
import { LocalStorageReferenceTrialRepository } from "@/repositories/browser/reference-trial-repository";
import { LocalStorageSearchLogRepository } from "@/repositories/browser/search-log-repository";

const assessmentRepository = new LocalStorageAssessmentRepository();
const publicationRepository =
  new LocalStoragePublicationSelectionRepository();
const referenceRepository = new LocalStorageReferenceTrialRepository();
const searchLogRepository = new LocalStorageSearchLogRepository();
const extractionRepository = new LocalStorageEvidenceExtractionRepository();
const benchmarkRepository = new LocalStorageHistoricalBenchmarkRepository();
const strategyRepository = new LocalStorageDevelopmentStrategyRepository();

export function AssessmentOverview({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [counts, setCounts] = useState({
    referenceTrials: 0,
    publications: 0,
    searchLogs: 0,
    approvedEvidence: 0,
  });
  const [benchmark, setBenchmark] = useState<HistoricalBenchmark | null>(null);
  const [strategy, setStrategy] = useState<DevelopmentStrategy | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (isDemoAssessment(assessmentId)) {
        await ensureDemoAssessment();
      }
      return Promise.all([
      assessmentRepository.getById(assessmentId),
      referenceRepository.list(assessmentId),
      publicationRepository.list(assessmentId),
      searchLogRepository.list(assessmentId),
      extractionRepository.list(assessmentId),
      benchmarkRepository.getByAssessmentId(assessmentId),
      strategyRepository.getByAssessmentId(assessmentId),
    ]).then(
      ([
        savedAssessment,
        references,
        publications,
        searchLogs,
        extractions,
        savedBenchmark,
        savedStrategy,
      ]) => {
        setAssessment(savedAssessment);
        setCounts({
          referenceTrials: references.length,
          publications: publications.length,
          searchLogs: searchLogs.length,
          approvedEvidence: extractions
            .flatMap((item) => item.fields)
            .filter((field) => field.reviewStatus === "approved").length,
        });
        setBenchmark(savedBenchmark);
        setStrategy(savedStrategy);
        setLoaded(true);
      },
    );
    };
    void load();
  }, [assessmentId]);

  if (!loaded) {
    return (
      <p className="border border-[var(--border)] bg-white p-6 text-sm text-[var(--muted)]">
        검토 과제를 불러오는 중입니다.
      </p>
    );
  }

  if (!assessment) {
    return (
      <section className="border border-[var(--border)] bg-white p-6">
        <h1 className="text-xl font-semibold">검토 과제를 찾을 수 없습니다</h1>
        <Link
          className="mt-4 inline-block text-sm font-semibold text-[var(--accent)] underline"
          href="/dashboard"
        >
          임상개발 검토 현황으로 이동
        </Link>
      </section>
    );
  }

  const context = [
    [assessmentLabels.candidate, assessment.candidate.name],
    [assessmentLabels.indication, assessment.candidate.indication],
    [
      `${assessmentLabels.mechanismOfAction} / ${assessmentLabels.target}`,
      [assessment.candidate.mechanismOfAction, assessment.candidate.target]
        .filter(Boolean)
        .join(" · ") || "확인되지 않음",
    ],
    [
      assessmentLabels.currentStage,
      assessment.candidate.currentDevelopmentStage ?? "확인되지 않음",
    ],
    [assessmentLabels.targetPhase, assessment.candidate.targetClinicalPhase],
    [
      assessmentLabels.geography,
      assessment.candidate.targetGeographies.join(", ") || "확인되지 않음",
    ],
    [assessmentLabels.requestType, requestTypeLabel(assessment.requestType)],
    [assessmentLabels.owner, assessment.owner],
  ];

  return (
    <div className="min-w-0">
      <WorkflowProgress assessmentId={assessmentId} />
      <header className="mb-5 border border-[var(--border)] bg-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">
            {assessment.id} · {navCopy.overview}
          </p>
          {isDemoAssessment(assessment.id) ? <DemoBadge compact /> : null}
        </div>
        <h1 className="mt-2 text-2xl font-semibold">
          {assessmentDisplayTitle(assessment.id, assessment.candidate.name)}
        </h1>
        <PageGuide>{pageGuides.overview}</PageGuide>
        {isDemoAssessment(assessment.id) ? (
          <p className="mt-3 text-xs text-[#785600]">
            가상 후보물질 {assessment.candidate.name} ·{" "}
            {assessment.candidate.indication} ·{" "}
            {assessment.candidate.targetClinicalPhase}
          </p>
        ) : null}
      </header>

      <section className="mb-5 grid grid-cols-1 border border-[var(--border)] bg-white md:grid-cols-3">
        {[
          ["선택한 참고 임상시험", counts.referenceTrials],
          ["선택 문헌", counts.publications],
          ["검색 기록", counts.searchLogs],
        ].map(([label, value], index) => (
          <div
            className={`px-5 py-4 ${index ? "border-l border-[var(--border)]" : ""}`}
            key={label}
          >
            <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <section className="mb-5 border border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-semibold">검토 대상</h2>
        </div>
        <dl className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {context.map(([label, value]) => (
            <div
              className="border-b border-r border-[var(--border)] px-5 py-4"
              key={label}
            >
              <dt className="text-[10px] font-semibold text-[var(--muted)]">
                {label}
              </dt>
              <dd className="mt-2 text-sm">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="px-5 py-4">
          <p className="text-[10px] font-semibold text-[var(--muted)]">
            {assessmentLabels.researchQuestion}
          </p>
          <p className="mt-2 text-sm leading-6">
            {assessment.researchQuestion.text}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <WorkspaceLink
          description="ClinicalTrials.gov에서 유사 임상시험을 검색하고 참고 임상시험을 선택합니다."
          href={`/assessments/${assessment.id}/search-strategy`}
          label={navCopy.landscape}
        />
        <WorkspaceLink
          description="PubMed에서 관련 문헌을 검색하고 검토에 사용할 주요 문헌을 선택합니다."
          href={`/assessments/${assessment.id}/evidence`}
          label={navCopy.evidence}
        />
        <WorkspaceLink
          description="검토 완료된 문헌의 환자군, 시험설계 및 주요 유효성 결과를 비교합니다."
          href={`/assessments/${assessment.id}/evidence/matrix`}
          label={navCopy.matrix}
        />
        <WorkspaceLink
          description="참고 임상시험과 검토 완료 문헌에서 확인된 평가변수를 기준으로 기존 치료성과 지표를 선택합니다."
          href={`/assessments/${assessment.id}/benchmark`}
          label={navCopy.benchmark}
        />
        <WorkspaceLink
          description="유사 임상과 문헌 근거를 바탕으로 대상 환자군, 시험설계 및 평가변수를 검토합니다."
          href={`/assessments/${assessment.id}/development-strategy`}
          label={navCopy.strategy}
        />
        <WorkspaceLink
          description="검토된 임상설계를 기준으로 예상 일정, 비용 및 수행 난이도를 검토합니다."
          href={`/assessments/${assessment.id}/feasibility`}
          label={navCopy.feasibility}
        />
        <WorkspaceLink
          description="임상개발 전략, 예상 일정·비용 및 주요 위험요인을 종합하여 검토 결과를 확인합니다."
          href={`/assessments/${assessment.id}/report`}
          label={navCopy.report}
        />
      </section>
      {benchmark || strategy ? (
        <p className="mt-4 text-xs text-[var(--muted)]">
          확정 기준 {benchmark?.status === "approved" ? "승인됨" : "미확정"} ·
          임상개발 전략 {strategy?.status ?? "미작성"}
        </p>
      ) : null}
    </div>
  );
}

function requestTypeLabel(value: RequestType) {
  return requestTypeLabels[value];
}

function WorkspaceLink({
  label,
  description,
  href,
}: {
  label: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      className="border border-[var(--border)] bg-white px-5 py-4 hover:border-[var(--accent)]"
      href={href}
    >
      <span className="font-semibold text-[var(--accent)]">{label}</span>
      <span className="mt-2 block text-xs leading-5 text-[var(--muted)]">
        {description}
      </span>
    </Link>
  );
}
