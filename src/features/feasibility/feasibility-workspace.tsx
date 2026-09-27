"use client";

import { useEffect, useState } from "react";

import { DemoBadge } from "@/components/layout/demo-badge";
import { PageGuide } from "@/components/layout/page-guide";
import { WorkflowProgress } from "@/components/layout/workflow-progress";
import type { Assessment } from "@/domain/models";
import { assessmentDisplayTitle, isDemoAssessment } from "@/lib/demo-assessment";
import { missingValueCopy, pageGuides } from "@/lib/ui-copy";
import { LocalStorageAssessmentRepository } from "@/repositories/browser/assessment-repository";

const assessmentRepository = new LocalStorageAssessmentRepository();

const timelineStages = [
  { id: "protocol", label: "계획서 개발", abbreviation: "Protocol Development" },
  { id: "regulatory", label: "IND 준비", abbreviation: "Regulatory Preparation" },
  { id: "ind_review", label: "IND 심사", abbreviation: "IND Review" },
  { id: "startup", label: "기관 개시 준비", abbreviation: "Site Startup" },
  { id: "fpi", label: "FPI", abbreviation: "FPI" },
  { id: "enrollment", label: "대상자 등록", abbreviation: "Enrollment" },
  { id: "lpi", label: "LPI", abbreviation: "LPI" },
  { id: "followup", label: "추적관찰", abbreviation: "Follow-up" },
  { id: "dbl", label: "DBL", abbreviation: "DBL" },
  { id: "topline", label: "Topline", abbreviation: "Topline" },
  { id: "csr", label: "CSR", abbreviation: "CSR" },
] as const;

const costItems = [
  { id: "cro_pm", label: "CRO 과제관리" },
  { id: "startup", label: "기관 개시" },
  { id: "site_mgmt", label: "기관 관리" },
  { id: "monitoring", label: "모니터링" },
  { id: "investigator", label: "기관/연구자 비용" },
  { id: "dm", label: "데이터관리" },
  { id: "stats", label: "통계" },
  { id: "writing", label: "Medical Writing" },
  { id: "lab", label: "중앙검사" },
  { id: "pk", label: "PK / Biomarker" },
  { id: "pv", label: "안전성/PV" },
  { id: "regulatory", label: "허가 업무" },
  { id: "edc", label: "시스템/EDC" },
  { id: "other", label: "기타" },
] as const;

const difficultyAreas = [
  { id: "recruitment", label: "대상자 모집" },
  { id: "competition", label: "경쟁 임상" },
  { id: "operation", label: "운영 복잡도" },
  { id: "regulatory", label: "규제" },
  { id: "statistics", label: "통계" },
  { id: "safety", label: "안전성" },
] as const;

export function FeasibilityWorkspace({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);

  useEffect(() => {
    assessmentRepository.getById(assessmentId).then(setAssessment);
  }, [assessmentId]);

  return (
    <div className="min-w-0">
      <WorkflowProgress assessmentId={assessmentId} />
      <header className="mb-5 border border-[var(--border)] bg-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">
            {assessmentId} · 수행 가능성 검토
          </p>
          {isDemoAssessment(assessmentId) ? <DemoBadge compact /> : null}
        </div>
        <h1 className="mt-2 text-2xl font-semibold">
          {assessmentDisplayTitle(assessmentId, assessment?.candidate.name)}
        </h1>
        <PageGuide>{pageGuides.feasibility}</PageGuide>
      </header>

      <section className="mb-5 border border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-semibold">예상 임상 일정</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            일정 산출 엔진이 연결되기 전에는 값을 임의 생성하지 않습니다.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-xs">
            <thead className="bg-[#f8f9fb] text-[var(--muted)]">
              <tr>
                {["단계", "예상 기간", "산출 근거", "Source"].map((heading) => (
                  <th
                    className="border-b border-[var(--border)] px-4 py-3"
                    key={heading}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timelineStages.map((stage) => (
                <tr
                  className="border-b border-[var(--border)]"
                  key={stage.id}
                >
                  <td className="px-4 py-3">
                    <span className="font-semibold">{stage.label}</span>
                    {stage.label !== stage.abbreviation ? (
                      <span className="ml-2 text-[var(--muted)]">
                        {stage.abbreviation}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {missingValueCopy.notCalculated}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {missingValueCopy.insufficientEvidence}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[var(--border)] px-5 py-4 text-sm font-semibold">
          예상 총 임상기간 {missingValueCopy.notCalculated}
        </div>
      </section>

      <section className="mb-5 border border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-semibold">예상 비용</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            CRO Unit Cost DB가 없어 실제 비용을 생성하지 않습니다. DEMO Cost
            Dataset을 사용할 경우 반드시 DEMO로 표시합니다.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-xs">
            <thead className="bg-[#f8f9fb] text-[var(--muted)]">
              <tr>
                {["항목", "산출기준", "수량", "Unit Cost", "예상비용", "Source"].map(
                  (heading) => (
                    <th
                      className="border-b border-[var(--border)] px-4 py-3"
                      key={heading}
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {costItems.map((item) => (
                <tr className="border-b border-[var(--border)]" key={item.id}>
                  <td className="px-4 py-3 font-semibold">{item.label}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {missingValueCopy.insufficientEvidence}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {missingValueCopy.notCalculated}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {missingValueCopy.notCalculated}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {missingValueCopy.notCalculated}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[var(--border)] px-5 py-4 text-sm font-semibold">
          예상 총 비용 {missingValueCopy.notCalculated}
        </div>
      </section>

      <section className="border border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-semibold">수행 난이도</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            영역별 낮음 / 보통 / 높음만 표시하며, 단일 종합점수는 만들지
            않습니다.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {difficultyAreas.map((area) => (
            <article
              className="border-b border-r border-[var(--border)] px-5 py-4"
              key={area.id}
            >
              <h3 className="text-sm font-semibold">{area.label}</h3>
              <p className="mt-2 text-lg font-semibold text-[#9a6700]">
                {missingValueCopy.reviewRequired}
              </p>
              <p className="mt-2 text-xs text-[var(--muted)]">
                근거: {missingValueCopy.insufficientEvidence}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">출처: —</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
