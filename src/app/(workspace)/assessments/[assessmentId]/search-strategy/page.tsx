import { ClinicalTrialsWorkspace } from "@/features/clinical-trials/clinical-trials-workspace";

export default async function SearchStrategyPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  return <ClinicalTrialsWorkspace assessmentId={assessmentId} />;
}
