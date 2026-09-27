"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DemoNotice } from "@/components/layout/demo-notice";
import { PageGuide } from "@/components/layout/page-guide";
import type { Assessment, AssessmentStatus } from "@/domain/models";
import {
  assessmentDisplayTitle,
  ensureDemoAssessment,
  isDemoAssessment,
} from "@/lib/demo-assessment";
import {
  assessmentLabels,
  assessmentStatusLabels,
  navCopy,
  pageGuides,
} from "@/lib/ui-copy";
import { LocalStorageAssessmentRepository } from "@/repositories/browser/assessment-repository";

const assessmentRepository = new LocalStorageAssessmentRepository();

const statusStyles: Record<AssessmentStatus, string> = {
  draft: "bg-[#f2f4f7] text-[#475467]",
  searching: "bg-[#eef4ff] text-[#3538cd]",
  analysis: "bg-[#fff6e5] text-[#9a6700]",
  clinical_review: "bg-[#f3edff] text-[#6941c6]",
  completed: "bg-[#eaf7ef] text-[#18794e]",
};

interface AssessmentListItem {
  id: string;
  candidate: string;
  indication: string;
  phase: string;
  owner: string;
  status: AssessmentStatus;
  lastUpdated: string;
}

interface Filters {
  candidate: string;
  indication: string;
  phase: string;
  status: string;
  owner: string;
}

const initialFilters: Filters = {
  candidate: "",
  indication: "",
  phase: "",
  status: "",
  owner: "",
};

function includes(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

export function DashboardClient() {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [assessments, setAssessments] = useState<AssessmentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    ensureDemoAssessment()
      .then(() => assessmentRepository.list())
      .then((items) => setAssessments(items.map(toListItem)))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      assessments.filter(
        (item) =>
          includes(item.candidate, filters.candidate) &&
          includes(item.indication, filters.indication) &&
          (!filters.phase || item.phase === filters.phase) &&
          (!filters.status || item.status === filters.status) &&
          (!filters.owner || item.owner === filters.owner),
      ),
    [assessments, filters],
  );

  const kpis = [
    {
      label: "진행 중 검토",
      value: assessments.filter((item) => item.status !== "completed").length,
    },
    {
      label: "완료된 검토",
      value: assessments.filter((item) => item.status === "completed").length,
    },
    {
      label: "임상 검토 중",
      value: assessments.filter((item) => item.status === "clinical_review")
        .length,
    },
    { label: "평균 검토 기간", value: "확인되지 않음" },
  ];

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{navCopy.dashboard}</h1>
          <PageGuide>{pageGuides.dashboard}</PageGuide>
        </div>
        <Link
          className="bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#11594c]"
          href="/assessments/new"
        >
          + {navCopy.newAssessment}
        </Link>
      </div>

      {assessments.some((item) => isDemoAssessment(item.id)) ? (
        <DemoNotice showCandidateNote />
      ) : null}

      <section
        aria-label="검토 과제 요약"
        className="mb-6 grid grid-cols-4 border border-[var(--border)] bg-white"
      >
        {kpis.map((kpi, index) => (
          <div
            className={`px-5 py-4 ${index > 0 ? "border-l border-[var(--border)]" : ""}`}
            key={kpi.label}
          >
            <p className="text-xs font-medium tracking-wide text-[var(--muted)]">
              {kpi.label}
            </p>
            <p className="mt-2 text-2xl font-semibold">{kpi.value}</p>
          </div>
        ))}
      </section>

      <section className="border border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-semibold">검토 과제</h2>
          <div className="mt-4 grid grid-cols-5 gap-3">
            <FilterInput
              label={assessmentLabels.candidate}
              onChange={(value) => updateFilter("candidate", value)}
              value={filters.candidate}
            />
            <FilterInput
              label={assessmentLabels.indication}
              onChange={(value) => updateFilter("indication", value)}
              value={filters.indication}
            />
            <FilterSelect
              label={assessmentLabels.targetPhase}
              onChange={(value) => updateFilter("phase", value)}
              options={["Phase 1b/2a", "Phase 2", "Phase 3"]}
              value={filters.phase}
            />
            <FilterSelect
              label={assessmentLabels.status}
              onChange={(value) => updateFilter("status", value)}
              options={Object.entries(assessmentStatusLabels).map(
                ([value, label]) => ({
                  label,
                  value,
                }),
              )}
              value={filters.status}
            />
            <FilterSelect
              label={assessmentLabels.owner}
              onChange={(value) => updateFilter("owner", value)}
              options={Array.from(
                new Set(assessments.map((item) => item.owner)),
              )}
              value={filters.owner}
            />
          </div>
        </div>

        <div>
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <thead className="bg-[#f8f9fb] text-xs tracking-wide text-[var(--muted)]">
              <tr>
                {[
                  assessmentLabels.assessmentId,
                  assessmentLabels.candidate,
                  assessmentLabels.indication,
                  assessmentLabels.targetPhase,
                  assessmentLabels.status,
                  assessmentLabels.owner,
                  assessmentLabels.updatedDate,
                ].map((heading) => (
                  <th
                    className="border-b border-[var(--border)] px-4 py-3 font-semibold"
                    key={heading}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <AssessmentRow
                  item={item}
                  key={item.id}
                  onOpen={() => router.push(`/assessments/${item.id}`)}
                />
              ))}
              {!isLoading && filtered.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-[var(--muted)]"
                    colSpan={7}
                  >
                    저장된 검토 과제가 없거나 조건에 맞는 결과가 없습니다.
                  </td>
                </tr>
              ) : null}
              {isLoading ? (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-[var(--muted)]"
                    colSpan={7}
                  >
                    검토 과제를 불러오는 중입니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--muted)]">
          {filtered.length} / {assessments.length}건
        </div>
      </section>
    </>
  );
}

function AssessmentRow({
  item,
  onOpen,
}: {
  item: AssessmentListItem;
  onOpen: () => void;
}) {
  const displayName = item.candidate;
  return (
    <tr
      aria-label={`${item.id} ${assessmentDisplayTitle(item.id, item.candidate)} 열기`}
      className="cursor-pointer border-b border-[var(--border)] last:border-b-0 hover:bg-[#f4f8f7] focus:bg-[#f4f8f7] focus:outline-none"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
      role="link"
      tabIndex={0}
    >
      <td className="px-4 py-3 font-semibold text-[var(--accent)]">
        {item.id}
      </td>
      <td className="px-4 py-3 font-medium">
        <span className="block">{displayName}</span>
        {isDemoAssessment(item.id) ? (
          <span className="mt-1 block text-xs text-[var(--muted)]">
            {assessmentDisplayTitle(item.id, item.candidate)}
          </span>
        ) : null}
      </td>
      <td className="max-w-56 px-4 py-3">{item.indication}</td>
      <td className="whitespace-nowrap px-4 py-3">{item.phase}</td>
      <td className="whitespace-nowrap px-4 py-3">
        <span
          className={`px-2 py-1 text-xs font-semibold ${statusStyles[item.status]}`}
        >
          {assessmentStatusLabels[item.status]}
        </span>
      </td>
      <td className="truncate px-4 py-3">{item.owner}</td>
      <td className="whitespace-nowrap px-4 py-3">{item.lastUpdated}</td>
    </tr>
  );
}

function toListItem(assessment: Assessment): AssessmentListItem {
  return {
    id: assessment.id,
    candidate: assessment.candidate.name,
    indication: assessment.candidate.indication,
    phase: assessment.candidate.targetClinicalPhase,
    owner: assessment.owner,
    status: assessment.status,
    lastUpdated: formatDate(assessment.updatedAt),
  };
}

function formatDate(value: string) {
  return value.slice(0, 10);
}

function FilterInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-medium text-[#475467]">
      {label}
      <input
        className="mt-1.5 w-full border border-[var(--border)] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[var(--accent)]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={`${label} 검색`}
        type="search"
        value={value}
      />
    </label>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<string | { value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-medium text-[#475467]">
      {label}
      <select
        className="mt-1.5 w-full border border-[var(--border)] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[var(--accent)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">전체</option>
        {options.map((option) => {
          const normalized =
            typeof option === "string"
              ? { value: option, label: option }
              : option;
          return (
            <option key={normalized.value} value={normalized.value}>
              {normalized.label}
            </option>
          );
        })}
      </select>
    </label>
  );
}
