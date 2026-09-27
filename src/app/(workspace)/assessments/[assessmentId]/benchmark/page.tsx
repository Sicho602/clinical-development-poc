import { HistoricalBenchmarkWorkspace } from "@/features/benchmark/historical-benchmark-workspace";

export default async function HistoricalBenchmarkPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  return <HistoricalBenchmarkWorkspace assessmentId={assessmentId} />;
}
