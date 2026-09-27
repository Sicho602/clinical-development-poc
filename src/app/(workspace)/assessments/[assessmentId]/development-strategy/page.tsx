import { DevelopmentStrategyWorkspace } from "@/features/strategy/development-strategy-workspace";

export default async function DevelopmentStrategyPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  return <DevelopmentStrategyWorkspace assessmentId={assessmentId} />;
}
