import { SampleSizeWorkspace } from "@/features/sample-size/sample-size-workspace";

export default async function SampleSizePage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  return <SampleSizeWorkspace assessmentId={assessmentId} />;
}
