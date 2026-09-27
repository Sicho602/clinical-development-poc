import { PageGuide } from "@/components/layout/page-guide";
import { pageGuides } from "@/lib/ui-copy";

export default function KnowledgeBasePage() {
  return (
    <section className="border border-[var(--border)] bg-white px-5 py-6">
      <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">
        기준정보 관리
      </p>
      <h1 className="mt-2 text-2xl font-semibold">기준정보 관리</h1>
      <PageGuide>{pageGuides.knowledgeBase}</PageGuide>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {[
          ["CRO Unit Cost", "DEMO Cost Dataset이 준비되면 별도 표시합니다."],
          ["일정 가정", "계획서 개발부터 CSR까지 산출 가정을 관리합니다."],
          ["규제 일정", "IND 준비 및 심사 기간 기준을 관리합니다."],
          ["난이도 기준", "모집, 경쟁, 운영, 규제, 통계, 안전성 기준입니다."],
        ].map(([title, description]) => (
          <article
            className="border border-[var(--border)] px-4 py-4"
            key={title}
          >
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
            <p className="mt-3 text-xs font-semibold text-[#9a6700]">
              현재 미연결
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
