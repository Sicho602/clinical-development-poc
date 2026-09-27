import { DemoAssessmentBootstrap } from "@/components/layout/demo-assessment-bootstrap";
import { SidebarNavigation } from "@/components/layout/sidebar-navigation";

export default function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen">
      <DemoAssessmentBootstrap />
      <SidebarNavigation />
      <div className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between border-b border-[var(--border)] bg-white px-8">
          <p className="text-sm text-[var(--muted)]">
            근거 기반 임상개발 검토
          </p>
          <div className="flex items-center gap-3 text-sm">
            <span className="h-2 w-2 rounded-full bg-[#2f855a]" />
            <span>PoC</span>
          </div>
        </header>
        <main className="px-8 py-7">{children}</main>
      </div>
    </div>
  );
}
