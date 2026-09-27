import { AssessmentReportWorkspace } from "@/features/report/assessment-report-workspace";

export default async function AssessmentReportPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  return <AssessmentReportWorkspace assessmentId={assessmentId} />;
}
