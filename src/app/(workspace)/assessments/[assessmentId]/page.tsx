import { AssessmentOverview } from "@/features/assessments/assessment-overview";

export default async function AssessmentOverviewPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  return <AssessmentOverview assessmentId={assessmentId} />;
}
