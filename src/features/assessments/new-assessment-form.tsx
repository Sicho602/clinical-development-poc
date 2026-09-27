"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import type { RequestType } from "@/domain/models";
import { assessmentLabels, requestTypeFormOptions } from "@/lib/ui-copy";
import { LocalStorageAssessmentRepository } from "@/repositories/browser/assessment-repository";

const assessmentRepository = new LocalStorageAssessmentRepository();

export function NewAssessmentForm() {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!form.reportValidity()) {
      return;
    }

    setIsSaving(true);
    setNotice(null);
    try {
      const values = new FormData(form);
      const assessment = await assessmentRepository.create({
        candidate: {
          name: readValue(values, "candidateName"),
          indication: readValue(values, "indication"),
          mechanismOfAction:
            readValue(values, "mechanismOfAction") || undefined,
          target: readValue(values, "target") || undefined,
          modality: readValue(values, "modality") || undefined,
          currentDevelopmentStage:
            readValue(values, "currentDevelopmentStage") || undefined,
          targetClinicalPhase: readValue(values, "targetClinicalPhase"),
          targetGeographies: readValue(values, "targetGeography")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        },
        researchQuestion: readValue(values, "researchQuestion"),
        requestType: mapRequestType(readValue(values, "requestType")),
        requesterDepartment: readValue(values, "requesterDepartment"),
        requester: readValue(values, "requester"),
        owner: readValue(values, "assessmentOwner"),
      });
      router.push(`/assessments/${assessment.id}`);
    } catch {
      setNotice("검토 과제를 저장하지 못했습니다. 다시 시도해 주세요.");
      setIsSaving(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <FormSection
        description="검토 대상 후보물질과 목표 임상개발 범위를 입력합니다."
        number="A"
        title="기본 정보"
      >
        <div className="grid grid-cols-2 gap-x-5 gap-y-4">
          <Field
            label={assessmentLabels.candidate}
            name="candidateName"
            required
          />
          <Field label={assessmentLabels.indication} name="indication" required />
          <Field
            label={assessmentLabels.mechanismOfAction}
            name="mechanismOfAction"
          />
          <Field label={assessmentLabels.target} name="target" />
          <SelectField
            label={assessmentLabels.modality}
            name="modality"
            options={[
              "Small molecule",
              "Monoclonal antibody",
              "ADC",
              "Cell therapy",
              "Gene therapy",
              "Other",
            ]}
          />
          <Field
            label={assessmentLabels.currentStage}
            name="currentDevelopmentStage"
          />
          <SelectField
            label={assessmentLabels.targetPhase}
            name="targetClinicalPhase"
            options={[
              "Phase 1",
              "Phase 1b/2a",
              "Phase 2",
              "Phase 2/3",
              "Phase 3",
              "Phase 4",
            ]}
            required
          />
          <Field
            help="쉼표로 구분해 입력합니다. 예: Korea, United States"
            label={assessmentLabels.geography}
            name="targetGeography"
            required
          />
        </div>
      </FormSection>

      <FormSection
        description="검토 요청 유형과 담당자를 지정합니다."
        number="B"
        title="요청 정보"
      >
        <div className="grid grid-cols-2 gap-x-5 gap-y-4">
          <SelectField
            label={assessmentLabels.requestType}
            name="requestType"
            options={[...requestTypeFormOptions]}
            required
          />
          <Field
            label={assessmentLabels.requesterDepartment}
            name="requesterDepartment"
            required
          />
          <Field label={assessmentLabels.requester} name="requester" required />
          <Field
            label={assessmentLabels.owner}
            name="assessmentOwner"
            required
          />
        </div>
      </FormSection>

      <section className="border-2 border-[var(--accent)] bg-white">
        <div className="border-b border-[#c9e3dc] bg-[var(--accent-soft)] px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center bg-[var(--accent)] text-xs font-bold text-white">
              C
            </span>
            <div>
              <h2 className="font-semibold">{assessmentLabels.researchQuestion}</h2>
              <p className="mt-1 text-sm text-[#52615e]">
                검색 조건과 이후 분석 범위를 결정하는 핵심 검토사항입니다.
              </p>
            </div>
          </div>
        </div>
        <div className="p-5">
          <label className="block text-sm font-semibold" htmlFor="researchQuestion">
            핵심 검토사항
          </label>
          <textarea
            className="mt-2 min-h-40 w-full resize-y border border-[var(--border)] px-3 py-3 text-sm leading-6 outline-none focus:border-[var(--accent)]"
            id="researchQuestion"
            name="researchQuestion"
            placeholder="예: 중등도–중증 아토피피부염 성인 환자를 대상으로 Phase 2 개발 시 환자군, 시험설계 및 평가변수를 검토하고 유사·경쟁 임상 환경을 비교해 주세요."
            required
          />
          <p className="mt-2 text-xs text-[var(--muted)]">
            환자군, 치료 차수, 목표 phase, 검토할 의사결정 항목을 포함하면 검색
            전략을 더 명확하게 구성할 수 있습니다.
          </p>
        </div>
      </section>

      {notice ? (
        <div
          aria-live="polite"
          className="border border-[#b8d8cf] bg-[#eef8f5] px-4 py-3 text-sm text-[#245c50]"
          role="status"
        >
          {notice}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-[var(--border)] pt-5">
        <Link className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]" href="/dashboard">
          취소
        </Link>
        <div className="flex gap-3">
          <button
            className="border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-semibold hover:bg-[#f8f9fb]"
            disabled={isSaving}
            type="submit"
          >
            초안 저장
          </button>
          <button
            className="bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#11594c]"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? "등록 중…" : "등록 후 검토 개요로 이동"}
          </button>
        </div>
      </div>
    </form>
  );
}

function readValue(values: FormData, name: string) {
  return String(values.get(name) ?? "").trim();
}

function mapRequestType(value: string): RequestType {
  const mapping: Record<string, RequestType> = {
    "New Development": "new_development",
    "In-licensing": "in_licensing",
    "Follow-up Study": "follow_up_study",
    "Indication Expansion": "indication_expansion",
    "Development Strategy Review": "development_strategy_review",
    Other: "other",
  };
  return mapping[value] ?? "other";
}

function FormSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-[var(--border)] bg-white">
      <div className="flex items-start gap-3 border-b border-[var(--border)] px-5 py-4">
        <span className="grid h-7 w-7 shrink-0 place-items-center bg-[#eef1f4] text-xs font-bold">
          {number}
        </span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  help,
  required = false,
}: {
  label: string;
  name: string;
  help?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {required ? <span className="ml-1 text-[var(--danger)]">*</span> : null}
      <input
        className="mt-1.5 w-full border border-[var(--border)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
        name={name}
        required={required}
      />
      {help ? (
        <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
          {help}
        </span>
      ) : null}
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
  required = false,
}: {
  label: string;
  name: string;
  options: Array<string | { value: string; label: string }>;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {required ? <span className="ml-1 text-[var(--danger)]">*</span> : null}
      <select
        className="mt-1.5 w-full border border-[var(--border)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
        defaultValue=""
        name={name}
        required={required}
      >
        <option disabled={required} value="">
          선택
        </option>
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
