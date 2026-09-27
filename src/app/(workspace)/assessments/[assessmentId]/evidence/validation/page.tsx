import { ExtractionValidationWorkspace } from "@/features/evidence/extraction-validation-workspace";

export default async function ExtractionValidationPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  return <ExtractionValidationWorkspace assessmentId={assessmentId} />;
}
