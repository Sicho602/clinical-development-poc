import { FeasibilityWorkspace } from "@/features/feasibility/feasibility-workspace";

export default async function FeasibilityPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  return <FeasibilityWorkspace assessmentId={assessmentId} />;
}
