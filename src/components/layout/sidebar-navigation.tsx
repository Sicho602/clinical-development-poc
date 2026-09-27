"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { Assessment } from "@/domain/models";
import {
  assessmentDisplayTitle,
  ensureDemoAssessment,
  isDemoAssessment,
} from "@/lib/demo-assessment";
import { navCopy, systemCopy } from "@/lib/ui-copy";
import { LocalStorageAssessmentRepository } from "@/repositories/browser/assessment-repository";
import { DemoBadge } from "./demo-badge";

type NavigationItem = {
  label: string;
  href: string;
  active?: boolean;
};

const globalNavigation: NavigationItem[] = [
  { label: navCopy.dashboard, href: "/dashboard" },
  { label: navCopy.newAssessment, href: "/assessments/new" },
  { label: navCopy.knowledgeBase, href: "/knowledge-base" },
  { label: navCopy.settings, href: "/settings" },
];

const assessmentRepository = new LocalStorageAssessmentRepository();

export function SidebarNavigation() {
  const pathname = usePathname();
  const assessmentId = useMemo(() => getAssessmentId(pathname), [pathname]);
  const [assessment, setAssessment] = useState<Assessment | null>(null);

  useEffect(() => {
    if (!assessmentId) {
      setAssessment(null);
      return;
    }
    const load = async () => {
      if (isDemoAssessment(assessmentId)) {
        await ensureDemoAssessment();
      }
      setAssessment(await assessmentRepository.getById(assessmentId));
    };
    void load();
  }, [assessmentId]);

  const workspaceNavigation: NavigationItem[] = assessmentId
    ? [
        {
          label: navCopy.overview,
          href: `/assessments/${assessmentId}`,
          active: pathname === `/assessments/${assessmentId}`,
        },
        {
          label: navCopy.landscape,
          href: `/assessments/${assessmentId}/search-strategy`,
          active: pathname.startsWith(
            `/assessments/${assessmentId}/search-strategy`,
          ),
        },
        {
          label: navCopy.evidence,
          href: `/assessments/${assessmentId}/evidence`,
          active:
            pathname === `/assessments/${assessmentId}/evidence` ||
            pathname.startsWith(
              `/assessments/${assessmentId}/evidence/review`,
            ) ||
            pathname.startsWith(
              `/assessments/${assessmentId}/evidence/validation`,
            ),
        },
        {
          label: navCopy.matrix,
          href: `/assessments/${assessmentId}/evidence/matrix`,
          active: pathname.startsWith(
            `/assessments/${assessmentId}/evidence/matrix`,
          ),
        },
        {
          label: navCopy.benchmark,
          href: `/assessments/${assessmentId}/benchmark`,
          active: pathname.startsWith(`/assessments/${assessmentId}/benchmark`),
        },
        {
          label: navCopy.strategy,
          href: `/assessments/${assessmentId}/development-strategy`,
          active: pathname.startsWith(
            `/assessments/${assessmentId}/development-strategy`,
          ),
        },
        {
          label: navCopy.feasibility,
          href: `/assessments/${assessmentId}/feasibility`,
          active: pathname.startsWith(
            `/assessments/${assessmentId}/feasibility`,
          ),
        },
        {
          label: navCopy.report,
          href: `/assessments/${assessmentId}/report`,
          active: pathname.startsWith(`/assessments/${assessmentId}/report`),
        },
      ]
    : [];

  return (
    <aside className="flex min-h-screen w-64 shrink-0 flex-col border-r border-[var(--border)] bg-white">
      <div className="border-b border-[var(--border)] px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center bg-[var(--accent)] text-sm font-bold text-white">
            CDE
          </span>
          <div>
            <p className="text-sm font-semibold">{systemCopy.name}</p>
            <p className="text-xs text-[var(--muted)]">{systemCopy.workspace}</p>
          </div>
        </div>
      </div>

      <nav aria-label="주 메뉴" className="flex-1 px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          {navCopy.global}
        </p>
        <ul className="space-y-1">
          {globalNavigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <li key={item.label}>
                <NavigationLink
                  active={isActive}
                  href={item.href}
                  label={item.label}
                />
              </li>
            );
          })}
        </ul>

        {assessmentId ? (
          <div className="mt-6 border-t border-[var(--border)] pt-5">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              {navCopy.currentAssessment}
            </p>
            <AssessmentContext
              assessment={assessment}
              assessmentId={assessmentId}
            />
            <ul className="mt-3 space-y-1">
              {workspaceNavigation.map((item) => (
                <li key={item.label}>
                  <NavigationLink
                    active={Boolean(item.active)}
                    href={item.href}
                    label={item.label}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </nav>

      <div className="border-t border-[var(--border)] px-5 py-4 text-xs text-[var(--muted)]">
        {systemCopy.workspace} · {systemCopy.subtitle}
      </div>
    </aside>
  );
}

function NavigationLink({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      className={`block border-l-2 px-3 py-2.5 text-sm transition-colors ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-[var(--accent)]"
          : "border-transparent text-[#4b5563] hover:bg-[#f4f6f8] hover:text-[var(--foreground)]"
      }`}
      href={href}
    >
      {label}
    </Link>
  );
}

function AssessmentContext({
  assessment,
  assessmentId,
}: {
  assessment: Assessment | null;
  assessmentId: string;
}) {
  return (
    <div className="border border-[var(--border)] bg-[#f8f9fb] px-3 py-3 text-xs">
      <div className="flex items-center gap-2">
        <p className="font-semibold text-[var(--accent)]">{assessmentId}</p>
        {isDemoAssessment(assessmentId) ? <DemoBadge compact /> : null}
      </div>
      {assessment ? (
        <>
          <p className="mt-2 font-semibold">
            {assessmentDisplayTitle(assessmentId, assessment.candidate.name)}
          </p>
          <p className="mt-1 line-clamp-2 text-[var(--muted)]">
            {assessment.candidate.indication} ·{" "}
            {assessment.candidate.targetClinicalPhase}
          </p>
        </>
      ) : (
        <p className="mt-2 text-[var(--muted)]">
          검토 과제 정보를 불러오는 중입니다.
        </p>
      )}
    </div>
  );
}

function getAssessmentId(pathname: string) {
  const match = pathname.match(/^\/assessments\/([^/]+)(?:\/|$)/);
  const id = match?.[1];
  return id && id !== "new" ? decodeURIComponent(id) : null;
}
