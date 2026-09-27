import { PageGuide } from "@/components/layout/page-guide";
import { pageGuides, systemCopy } from "@/lib/ui-copy";

export default function SettingsPage() {
  return (
    <section className="border border-[var(--border)] bg-white px-5 py-6">
      <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">
        설정
      </p>
      <h1 className="mt-2 text-2xl font-semibold">설정</h1>
      <PageGuide>{pageGuides.settings}</PageGuide>
      <dl className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="border border-[var(--border)] px-4 py-4">
          <dt className="text-xs font-semibold text-[var(--muted)]">시스템</dt>
          <dd className="mt-2 text-sm">{systemCopy.name}</dd>
        </div>
        <div className="border border-[var(--border)] px-4 py-4">
          <dt className="text-xs font-semibold text-[var(--muted)]">환경</dt>
          <dd className="mt-2 text-sm">{systemCopy.workspace}</dd>
        </div>
        <div className="border border-[var(--border)] px-4 py-4">
          <dt className="text-xs font-semibold text-[var(--muted)]">
            Evidence Extraction
          </dt>
          <dd className="mt-2 text-sm">
            Mock provider가 기본입니다. 실제 비용·일정 값은 생성하지 않습니다.
          </dd>
        </div>
      </dl>
    </section>
  );
}
