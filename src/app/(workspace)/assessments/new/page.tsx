import { NewAssessmentForm } from "@/features/assessments/new-assessment-form";

export default function NewAssessmentPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold tracking-wider text-[var(--accent)]">
          신규 검토 등록
        </p>
        <h1 className="text-2xl font-semibold">신규 검토 등록</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          후보물질, 적응증, 검토 임상단계와 핵심 검토사항을 입력하여 신규
          검토 과제를 등록합니다.
        </p>
      </div>
      <NewAssessmentForm />
    </div>
  );
}
