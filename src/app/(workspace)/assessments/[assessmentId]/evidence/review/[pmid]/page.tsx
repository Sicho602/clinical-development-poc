import { EvidenceReviewWorkspace } from "@/features/evidence/evidence-review-workspace";

export default async function EvidenceReviewPage({
  params,
}: {
  params: Promise<{ assessmentId: string; pmid: string }>;
}) {
  const { assessmentId, pmid } = await params;
  return (
    <EvidenceReviewWorkspace assessmentId={assessmentId} pmid={pmid} />
  );
}
