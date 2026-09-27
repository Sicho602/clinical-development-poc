import { DEMO_CANDIDATE_NOTE, DEMO_DISCLAIMER } from "@/lib/demo-assessment";

export function DemoNotice({
  showCandidateNote = false,
}: {
  showCandidateNote?: boolean;
}) {
  return (
    <div className="mb-5 border border-[#d5a72f] bg-[#fff8dc] px-5 py-3 text-sm leading-6 text-[#785600]">
      <p className="font-semibold">DEMO · Sample Assessment</p>
      <p className="mt-1">{DEMO_DISCLAIMER}</p>
      {showCandidateNote ? (
        <p className="mt-1">{DEMO_CANDIDATE_NOTE}</p>
      ) : null}
    </div>
  );
}
