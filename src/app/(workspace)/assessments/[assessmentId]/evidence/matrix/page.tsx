import { EvidenceMatrix } from "@/features/evidence/evidence-matrix";

export default async function EvidenceMatrixPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  return <EvidenceMatrix assessmentId={assessmentId} />;
}
