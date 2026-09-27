export function DemoBadge({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center border border-[#d5a72f] bg-[#fff8dc] font-semibold text-[#785600] ${
        compact
          ? "gap-1 px-1.5 py-0.5 text-[10px]"
          : "gap-1.5 px-2 py-1 text-[11px]"
      }`}
    >
      <span>DEMO</span>
      <span className="font-medium text-[#9a7a20]">Sample Assessment</span>
    </span>
  );
}
