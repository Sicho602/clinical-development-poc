"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { LocalStorageAssessmentRepository } from "@/repositories/browser/assessment-repository";
import { LocalStorageDevelopmentStrategyRepository } from "@/repositories/browser/development-strategy-repository";
import { LocalStorageEvidenceExtractionRepository } from "@/repositories/browser/evidence-extraction-repository";
import { LocalStorageHistoricalBenchmarkRepository } from "@/repositories/browser/historical-benchmark-repository";
import { LocalStoragePublicationSelectionRepository } from "@/repositories/browser/publication-selection-repository";
import { LocalStorageReferenceTrialRepository } from "@/repositories/browser/reference-trial-repository";
import { LocalStorageSearchLogRepository } from "@/repositories/browser/search-log-repository";
import { DemoNotice } from "@/components/layout/demo-notice";
import { isDemoAssessment } from "@/lib/demo-assessment";
import {
  workflowStepFromPath,
  workflowSteps,
  type WorkflowStepId,
} from "@/lib/ui-copy";

const assessmentRepository = new LocalStorageAssessmentRepository();
const publicationRepository =
  new LocalStoragePublicationSelectionRepository();
const referenceRepository = new LocalStorageReferenceTrialRepository();
const searchLogRepository = new LocalStorageSearchLogRepository();
const extractionRepository = new LocalStorageEvidenceExtractionRepository();
const benchmarkRepository = new LocalStorageHistoricalBenchmarkRepository();
const strategyRepository = new LocalStorageDevelopmentStrategyRepository();

type StepState = "complete" | "current" | "upcoming";

export function WorkflowProgress({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const pathname = usePathname();
  const currentStep = workflowStepFromPath(pathname);
  const [completed, setCompleted] = useState<Set<WorkflowStepId>>(
    new Set(["register"]),
  );

  useEffect(() => {
    Promise.all([
      assessmentRepository.getById(assessmentId),
      referenceRepository.list(assessmentId),
      publicationRepository.list(assessmentId),
      searchLogRepository.list(assessmentId),
      extractionRepository.list(assessmentId),
      benchmarkRepository.getByAssessmentId(assessmentId),
      strategyRepository.getByAssessmentId(assessmentId),
    ]).then(
      ([
        assessment,
        references,
        publications,
        searchLogs,
        extractions,
        benchmark,
        strategy,
      ]) => {
        const next = new Set<WorkflowStepId>();
        if (assessment) next.add("register");
        if (references.length || searchLogs.length) next.add("landscape");
        if (
          publications.length ||
          extractions.some((item) =>
            item.fields.some((field) => field.reviewStatus === "approved"),
          )
        ) {
          next.add("evidence");
        }
        if (benchmark?.status === "approved" || benchmark?.decisions.length) {
          next.add("benchmark");
        }
        if (
          strategy &&
          (strategy.status === "approved" ||
            strategy.status === "reviewed" ||
            strategy.fields.some((field) => field.reviewStatus !== "draft"))
        ) {
          next.add("strategy");
        }
        setCompleted(next);
      },
    );
  }, [assessmentId]);

  return (
    <>
      {isDemoAssessment(assessmentId) ? (
        <DemoNotice showCandidateNote />
      ) : null}
    <nav
      aria-label="검토 진행단계"
      className="mb-5 overflow-x-auto border border-[var(--border)] bg-white"
    >
      <ol className="flex min-w-[880px]">
        {workflowSteps.map((step, index) => {
          const state = stepState(step.id, currentStep, completed);
          return (
            <li
              className={`flex min-w-0 flex-1 items-center ${
                index ? "border-l border-[var(--border)]" : ""
              }`}
              key={step.id}
            >
              <Link
                aria-current={state === "current" ? "step" : undefined}
                className={`flex w-full items-center gap-2 px-3 py-3 ${
                  state === "current"
                    ? "bg-[var(--accent-soft)]"
                    : "hover:bg-[#f8f9fb]"
                }`}
                href={step.href(assessmentId)}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center text-[11px] font-semibold ${
                    state === "complete"
                      ? "bg-[#216e5d] text-white"
                      : state === "current"
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[#eef1f4] text-[#667085]"
                  }`}
                >
                  {state === "complete" ? "✓" : index + 1}
                </span>
                <span
                  className={`truncate text-xs font-semibold ${
                    state === "upcoming"
                      ? "text-[var(--muted)]"
                      : "text-[var(--foreground)]"
                  }`}
                >
                  {step.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
    </>
  );
}

function stepState(
  stepId: WorkflowStepId,
  currentStep: WorkflowStepId,
  completed: Set<WorkflowStepId>,
): StepState {
  if (stepId === currentStep) return "current";
  const order = workflowSteps.map((step) => step.id);
  const currentIndex = order.indexOf(currentStep);
  const stepIndex = order.indexOf(stepId);
  if (stepIndex < currentIndex || completed.has(stepId)) return "complete";
  return "upcoming";
}
