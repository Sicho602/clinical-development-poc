import { EvidenceWorkspace } from "@/features/evidence/evidence-workspace";

export default async function EvidencePage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  return <EvidenceWorkspace assessmentId={assessmentId} />;
}
