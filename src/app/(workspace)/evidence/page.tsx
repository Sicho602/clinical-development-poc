import Link from "next/link";

export default function EvidenceIndexPage() {
  return (
    <section className="border border-[var(--border)] bg-white px-6 py-12 text-center">
      <h1 className="text-xl font-semibold">문헌 근거</h1>
      <p className="mt-3 text-sm text-[var(--muted)]">
        임상개발 검토 현황에서 검토 과제를 선택하거나 신규 검토를 등록해
        주세요.
      </p>
      <Link
        className="mt-5 inline-block bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white"
        href="/assessments/new"
      >
        신규 검토 등록
      </Link>
    </section>
  );
}
