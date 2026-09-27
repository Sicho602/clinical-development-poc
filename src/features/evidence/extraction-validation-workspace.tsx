"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  Assessment,
  EvidenceExtraction,
  EvidenceFieldKey,
  EvidenceFieldValue,
  ExtractionGoldStandard,
  ExtractionValidationErrorType,
  ExtractionValidationResult,
  Publication,
} from "@/domain/models";
import { LocalStorageAssessmentRepository } from "@/repositories/browser/assessment-repository";
import { LocalStorageEvidenceExtractionRepository } from "@/repositories/browser/evidence-extraction-repository";
import {
  LocalStorageExtractionValidationRepository,
  summarizeExtractionValidation,
} from "@/repositories/browser/extraction-validation-repository";
import {
  LocalStoragePublicationSelectionRepository,
  type SavedPublicationEvidence,
} from "@/repositories/browser/publication-selection-repository";
import {
  evidenceExtractionSystemPrompt,
  evidenceFieldKeys,
  evidenceFieldLabels,
  materializeEvidenceExtraction,
  toExtractionPublicationPayload,
  type EvidenceExtractionApiResult,
  type EvidenceExtractionProviderDescriptor,
} from "@/services/ai/evidence-extraction-contract";

const assessmentRepository = new LocalStorageAssessmentRepository();
const extractionRepository =
  new LocalStorageEvidenceExtractionRepository();
const validationRepository =
  new LocalStorageExtractionValidationRepository();
const selectionRepository =
  new LocalStoragePublicationSelectionRepository();

const resultOptions: Array<
  [ExtractionValidationResult, string]
> = [
  ["unreviewed", "Unreviewed"],
  ["correct", "Correct"],
  ["incorrect", "Incorrect"],
  ["missed", "Missed"],
  ["unsupported", "Unsupported / Hallucinated"],
  ["source_mismatch", "Source Mismatch"],
  ["not_reported_correct", "Not Reported Correct"],
];

const errorTypes: ExtractionValidationErrorType[] = [
  "VALUE_ERROR",
  "UNIT_ERROR",
  "POPULATION_ERROR",
  "ENDPOINT_CLASSIFICATION_ERROR",
  "SOURCE_MISMATCH",
  "MISSED_VALUE",
  "UNSUPPORTED_INFERENCE",
  "OTHER",
];

interface DraftGold {
  humanValue: string;
  humanUnit: string;
  humanSourceText: string;
  result: ExtractionValidationResult;
  errorType: ExtractionValidationErrorType | "";
}

interface ExtractionResponse {
  status: "extracted" | "not_connected" | "failed";
  data?: EvidenceExtractionApiResult;
  error?: { message: string };
}

export function ExtractionValidationWorkspace({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [activePmid, setActivePmid] = useState("");
  const [extractions, setExtractions] = useState<EvidenceExtraction[]>([]);
  const [records, setRecords] = useState<ExtractionGoldStandard[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftGold>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] =
    useState<EvidenceExtractionProviderDescriptor | null>(null);

  useEffect(() => {
    async function load() {
      const providerResponse = await fetch("/api/evidence-extraction");
      if (!providerResponse.ok) {
        throw new Error("Provider configuration unavailable.");
      }
      const descriptor =
        (await providerResponse.json()) as EvidenceExtractionProviderDescriptor;
      const [savedAssessment, selections, savedExtractions, savedRecords] =
        await Promise.all([
          assessmentRepository.getById(assessmentId),
          selectionRepository.list(assessmentId),
          extractionRepository.list(assessmentId, descriptor.isMock),
          validationRepository.list(assessmentId, descriptor.isMock),
        ]);
      const selected = selectValidationPublications(selections, 5);
      setProvider(descriptor);
      setAssessment(savedAssessment);
      setPublications(selected);
      setActivePmid(selected[0]?.pmid ?? "");
      setExtractions(savedExtractions);
      setRecords(savedRecords);
      setDrafts(buildDrafts(savedRecords));
    }
    load().catch(() =>
      setError("Extraction validation 데이터를 불러오지 못했습니다."),
    );
  }, [assessmentId]);

  const activePublication = publications.find(
    (item) => item.pmid === activePmid,
  );
  const activeExtraction = extractions.find(
    (item) => item.pmid === activePmid,
  );
  const baseSummary = useMemo(
    () => summarizeExtractionValidation(records),
    [records],
  );
  const sourceMismatchCount = useMemo(() => {
    const recorded = new Set(
      records
        .filter((item) => item.result === "source_mismatch")
        .map((item) => `${item.pmid}:${item.field}`),
    );
    const unrecordedIssues = extractions
      .flatMap((item) =>
        item.issues.map((issue) => `${item.pmid}:${issue.field}`),
      )
      .filter((key) => !recorded.has(key)).length;
    return baseSummary.sourceMismatch + unrecordedIssues;
  }, [baseSummary.sourceMismatch, extractions, records]);

  async function runBatchExtraction() {
    if (!publications.length || !provider) return;
    setIsRunning(true);
    setError(null);
    const nextExtractions = [...extractions];
    try {
      for (let index = 0; index < publications.length; index += 1) {
        const publication = publications[index];
        setProgress(
          `${index + 1} / ${publications.length} · PMID ${publication.pmid}`,
        );
        await extractionRepository.setStatus(
          assessmentId,
          publication.pmid,
          provider.isMock,
          "extracting",
        );
        const response = await fetch("/api/evidence-extraction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publication: toExtractionPublicationPayload(publication),
          }),
        });
        const payload = (await response.json()) as ExtractionResponse;
        const result =
          response.ok && payload.data
            ? await extractionRepository.save(
                materializeEvidenceExtraction(
                  assessmentId,
                  payload.data,
                ),
              )
            : await extractionRepository.setStatus(
                assessmentId,
                publication.pmid,
                provider.isMock,
                payload.status === "not_connected"
                  ? "not_connected"
                  : "failed",
                payload.error?.message,
              );
        const existingIndex = nextExtractions.findIndex(
          (item) => item.pmid === publication.pmid,
        );
        if (existingIndex >= 0) nextExtractions[existingIndex] = result;
        else nextExtractions.push(result);
        setExtractions([...nextExtractions]);
        if (!response.ok) {
          setError(payload.error?.message ?? "AI extraction failed.");
          if (payload.status === "not_connected") break;
        }
      }
    } catch {
      setError("Evidence Extraction API에 연결할 수 없습니다.");
    } finally {
      setIsRunning(false);
      setProgress("");
    }
  }

  async function saveGold(fieldKey: EvidenceFieldKey) {
    if (!activePublication) return;
    const key = recordKey(activePublication.pmid, fieldKey);
    const draft = drafts[key] ?? emptyDraft();
    if (
      draft.humanSourceText &&
      !sourceSpanExists(
        activePublication.abstract ?? "",
        draft.humanSourceText,
      )
    ) {
      setError(
        "Human Gold source text는 현재 PubMed abstract에 존재하는 문구여야 합니다.",
      );
      return;
    }
    const aiField = activeExtraction?.fields.find(
      (item) => item.field === fieldKey,
    );
    const issue = activeExtraction?.issues.find(
      (item) => item.field === fieldKey,
    );
    const record = await validationRepository.save({
      assessmentId,
      pmid: activePublication.pmid,
      isMock: provider?.isMock ?? false,
      field: fieldKey,
      aiValue: aiField?.originalAiValue ?? issue?.value ?? null,
      aiUnit: aiField?.originalAiUnit ?? issue?.unit,
      aiSourceText: aiField?.sourceText ?? issue?.sourceText,
      humanValue: parseGoldValue(draft.humanValue),
      humanUnit: draft.humanUnit || undefined,
      humanSourceText: draft.humanSourceText || undefined,
      result: draft.result,
      errorType: draft.errorType || undefined,
      reviewer: assessment?.owner ?? "Human Reviewer",
    });
    setRecords((current) => [
      ...current.filter(
        (item) =>
          !(item.pmid === record.pmid && item.field === record.field),
      ),
      record,
    ]);
    setError(null);
  }

  function updateDraft(
    pmid: string,
    field: EvidenceFieldKey,
    patch: Partial<DraftGold>,
  ) {
    const key = recordKey(pmid, field);
    setDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] ?? emptyDraft()), ...patch },
    }));
  }

  return (
    <div className="min-w-0">
      <header className="mb-5 border border-[var(--border)] bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
              {assessmentId} · 추출 검증
            </p>
            <h1 className="mt-2 text-2xl font-semibold">
              주요 정보 추출 정확도
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              추출 정확도를 검증하기 위한 화면입니다. 실제 검토 흐름에서는
              담당자 검토 화면을 사용합니다.
            </p>
          </div>
          <div className="flex gap-3">
            <a
              className="border border-[var(--border)] px-4 py-2 text-xs font-semibold"
              href={`/assessments/${assessmentId}/evidence`}
            >
              문헌 근거로 이동
            </a>
            <button
              className="bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            disabled={
              isRunning || publications.length < 5 || !provider
            }
              onClick={runBatchExtraction}
              type="button"
            >
              {isRunning
                ? `Extracting ${progress}`
                : "Run AI Extraction for 5 Publications"}
            </button>
          </div>
        </div>
      </header>

      {provider?.isMock ? (
        <div className="mb-5 border border-[#d5a72f] bg-[#fff8dc] px-5 py-3 text-sm font-semibold text-[#785600]">
          DEMO MODE — Mock AI Extraction · fixture-v1
        </div>
      ) : null}

      {error ? (
        <div className="mb-5 border border-[#f0b8b4] bg-[#fff4f3] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <ValidationSummary
        sourceMismatch={sourceMismatchCount}
        summary={baseSummary}
      />

      <section className="mb-5 border border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-semibold">Validation Publications</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Abstract의 임상 정보 키워드 포함도를 기준으로 선택된 실제
            PubMed 문헌입니다.
          </p>
        </div>
        <div className="grid grid-cols-1 divide-y divide-[var(--border)] xl:grid-cols-5 xl:divide-x xl:divide-y-0">
          {publications.map((publication) => {
            const extraction = extractions.find(
              (item) => item.pmid === publication.pmid,
            );
            return (
              <button
                className={`p-4 text-left text-xs ${
                  activePmid === publication.pmid
                    ? "bg-[var(--accent-soft)]"
                    : ""
                }`}
                key={publication.pmid}
                onClick={() => setActivePmid(publication.pmid)}
                type="button"
              >
                <span className="font-semibold text-[var(--accent)]">
                  PMID {publication.pmid}
                </span>
                <span className="mt-2 line-clamp-3 block font-medium">
                  {publication.title}
                </span>
                <span className="mt-2 block text-[var(--muted)]">
                  {extraction?.extractionStatus ?? "not_extracted"} ·{" "}
                  {extraction?.fields.length ?? 0} fields
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {activePublication ? (
        <GoldStandardTable
          drafts={drafts}
          extraction={activeExtraction}
          onDraftChange={updateDraft}
          onSave={saveGold}
          publication={activePublication}
          records={records}
        />
      ) : (
        <p className="border border-dashed border-[var(--border)] bg-white p-8 text-center text-sm">
          검증할 선택 Publication이 최소 5건 필요합니다.
        </p>
      )}

      <details className="mt-5 border border-[var(--border)] bg-white px-5 py-4 text-xs">
        <summary className="cursor-pointer font-semibold">
          AI Extraction Prompt
        </summary>
        <pre className="mt-4 whitespace-pre-wrap text-[var(--muted)]">
          {evidenceExtractionSystemPrompt}
        </pre>
      </details>
    </div>
  );
}

function ValidationSummary({
  summary,
  sourceMismatch,
}: {
  summary: ReturnType<typeof summarizeExtractionValidation>;
  sourceMismatch: number;
}) {
  const values = [
    ["Total Evaluated", summary.totalFieldsEvaluated],
    ["Correct", summary.correct],
    ["Incorrect", summary.incorrect],
    ["Missed", summary.missed],
    ["Unsupported", summary.unsupported],
    ["Source Mismatch", sourceMismatch],
    ["Not Reported Correct", summary.notReportedCorrect],
    ["Exact Match Rate", `${summary.exactMatchRate.toFixed(1)}%`],
  ];
  return (
    <section className="mb-5 grid grid-cols-2 border border-[var(--border)] bg-white md:grid-cols-4 xl:grid-cols-8">
      {values.map(([label, value], index) => (
        <div
          className={`px-4 py-4 ${index ? "border-l border-[var(--border)]" : ""}`}
          key={label}
        >
          <p className="text-[10px] font-semibold uppercase text-[var(--muted)]">
            {label}
          </p>
          <p className="mt-2 text-xl font-semibold">{value}</p>
        </div>
      ))}
    </section>
  );
}

function GoldStandardTable({
  publication,
  extraction,
  records,
  drafts,
  onDraftChange,
  onSave,
}: {
  publication: Publication;
  extraction?: EvidenceExtraction;
  records: ExtractionGoldStandard[];
  drafts: Record<string, DraftGold>;
  onDraftChange: (
    pmid: string,
    field: EvidenceFieldKey,
    patch: Partial<DraftGold>,
  ) => void;
  onSave: (field: EvidenceFieldKey) => void;
}) {
  return (
    <section className="border border-[var(--border)] bg-white">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="font-semibold">{publication.title}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          PMID {publication.pmid} · AI model{" "}
          {extraction?.model ?? "Not Available"}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1600px] border-collapse text-left text-xs">
          <thead className="bg-[#f8f9fb] uppercase tracking-wide text-[var(--muted)]">
            <tr>
              {[
                "Field",
                "AI Original",
                "AI Source Text",
                "Human Gold / Source",
                "Human Unit",
                "Result",
                "Error Type",
                "Save",
              ].map((heading) => (
                <th
                  className="border-b border-[var(--border)] px-3 py-3"
                  key={heading}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {evidenceFieldKeys.map((fieldKey) => {
              const aiField = extraction?.fields.find(
                (item) => item.field === fieldKey,
              );
              const issue = extraction?.issues.find(
                (item) => item.field === fieldKey,
              );
              const saved = records.find(
                (item) =>
                  item.pmid === publication.pmid &&
                  item.field === fieldKey,
              );
              const key = recordKey(publication.pmid, fieldKey);
              const draft = drafts[key] ?? draftFromRecord(saved);
              return (
                <tr
                  className="border-b border-[var(--border)] align-top"
                  key={fieldKey}
                >
                  <td className="px-3 py-3 font-semibold">
                    {evidenceFieldLabels[fieldKey]}
                  </td>
                  <td className="max-w-56 px-3 py-3">
                    {issue
                      ? `${formatValue(issue.value)} ${issue.unit ?? ""}`
                      : aiField
                        ? `${formatValue(aiField.originalAiValue)} ${aiField.originalAiUnit ?? ""}`
                        : "Not Reported"}
                    {issue ? (
                      <span className="mt-1 block font-semibold text-[var(--danger)]">
                        SOURCE_MISMATCH
                      </span>
                    ) : null}
                  </td>
                  <td className="max-w-[360px] px-3 py-3 text-[var(--muted)]">
                    {aiField?.sourceText ??
                      issue?.sourceText ??
                      "Not Reported"}
                  </td>
                  <td className="px-3 py-3">
                    <textarea
                      aria-label={`Human value for ${fieldKey}`}
                      className="min-h-20 w-64 border border-[var(--border)] p-2"
                      onChange={(event) =>
                        onDraftChange(publication.pmid, fieldKey, {
                          humanValue: event.target.value,
                        })
                      }
                      placeholder="Leave empty for Not Reported"
                      value={draft.humanValue}
                    />
                    <textarea
                      aria-label={`Human source for ${fieldKey}`}
                      className="mt-2 min-h-16 w-64 border border-[var(--border)] p-2 text-[11px]"
                      onChange={(event) =>
                        onDraftChange(publication.pmid, fieldKey, {
                          humanSourceText: event.target.value,
                        })
                      }
                      placeholder="Exact abstract source text"
                      value={draft.humanSourceText}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      aria-label={`Human unit for ${fieldKey}`}
                      className="w-28 border border-[var(--border)] p-2"
                      onChange={(event) =>
                        onDraftChange(publication.pmid, fieldKey, {
                          humanUnit: event.target.value,
                        })
                      }
                      value={draft.humanUnit}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <select
                      aria-label={`Validation result for ${fieldKey}`}
                      className="w-48 border border-[var(--border)] bg-white p-2"
                      onChange={(event) =>
                        onDraftChange(publication.pmid, fieldKey, {
                          result: event.target
                            .value as ExtractionValidationResult,
                        })
                      }
                      value={draft.result}
                    >
                      {resultOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      aria-label={`Error type for ${fieldKey}`}
                      className="w-56 border border-[var(--border)] bg-white p-2"
                      onChange={(event) =>
                        onDraftChange(publication.pmid, fieldKey, {
                          errorType: event.target
                            .value as DraftGold["errorType"],
                        })
                      }
                      value={draft.errorType}
                    >
                      <option value="">None</option>
                      {errorTypes.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      className="font-semibold text-[var(--accent)]"
                      onClick={() => onSave(fieldKey)}
                      type="button"
                    >
                      Save Gold
                    </button>
                    {saved ? (
                      <span className="mt-2 block text-[10px] text-[var(--muted)]">
                        {saved.reviewer}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function selectValidationPublications(
  selections: SavedPublicationEvidence[],
  count: number,
) {
  return selections
    .map((item) => ({
      ...item.publication,
      evidenceCategories: item.categories,
    }))
    .filter((publication) => Boolean(publication.abstract))
    .sort(
      (a, b) =>
        clinicalInformationScore(b.abstract ?? "") -
        clinicalInformationScore(a.abstract ?? ""),
    )
    .slice(0, count);
}

function clinicalInformationScore(abstract: string) {
  const terms = [
    "patients",
    "phase",
    "randomized",
    "endpoint",
    "response rate",
    "progression-free",
    "overall survival",
    "median",
    "safety",
    "adverse",
    "enrolled",
    "treatment",
  ];
  const normalized = abstract.toLocaleLowerCase();
  return terms.filter((term) => normalized.includes(term)).length;
}

function buildDrafts(records: ExtractionGoldStandard[]) {
  return Object.fromEntries(
    records.map((record) => [
      recordKey(record.pmid, record.field),
      draftFromRecord(record),
    ]),
  );
}

function draftFromRecord(
  record?: ExtractionGoldStandard,
): DraftGold {
  return record
    ? {
        humanValue: formatValue(record.humanValue),
        humanUnit: record.humanUnit ?? "",
        humanSourceText: record.humanSourceText ?? "",
        result: record.result,
        errorType: record.errorType ?? "",
      }
    : emptyDraft();
}

function emptyDraft(): DraftGold {
  return {
    humanValue: "",
    humanUnit: "",
    humanSourceText: "",
    result: "unreviewed",
    errorType: "",
  };
}

function recordKey(pmid: string, field: EvidenceFieldKey) {
  return `${pmid}:${field}`;
}

function formatValue(value: EvidenceFieldValue | null) {
  if (value === null) return "";
  return Array.isArray(value) ? value.join("; ") : String(value);
}

function parseGoldValue(value: string): EvidenceFieldValue | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : trimmed;
}

function sourceSpanExists(abstract: string, sourceText: string) {
  const normalize = (value: string) =>
    value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  return normalize(abstract).includes(normalize(sourceText));
}
