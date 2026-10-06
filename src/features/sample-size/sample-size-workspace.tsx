"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { DemoBadge } from "@/components/layout/demo-badge";
import { PageGuide } from "@/components/layout/page-guide";
import { WorkflowProgress } from "@/components/layout/workflow-progress";
import type {
  DevelopmentStrategy,
  HistoricalBenchmark,
  SampleSizeInput,
  SampleSizeScenario,
  SampleSizeSuccess,
} from "@/domain/models";
import {
  assessmentDisplayTitle,
  isDemoAssessment,
} from "@/lib/demo-assessment";
import { pageGuides, strategyFieldLabels } from "@/lib/ui-copy";
import { LocalStorageAssessmentRepository } from "@/repositories/browser/assessment-repository";
import { LocalStorageDevelopmentStrategyRepository } from "@/repositories/browser/development-strategy-repository";
import { LocalStorageHistoricalBenchmarkRepository } from "@/repositories/browser/historical-benchmark-repository";
import { LocalStorageSampleSizeRepository } from "@/repositories/browser/sample-size-repository";
import { calculateSampleSize } from "@/services/statistics/sample-size";

import { buildSampleSizeInput } from "./build-sample-size-input";
import {
  demoSampleSizeForm,
  emptySampleSizeForm,
  type SampleSizeFormState,
} from "./sample-size-defaults";

const assessmentRepository = new LocalStorageAssessmentRepository();
const strategyRepository = new LocalStorageDevelopmentStrategyRepository();
const benchmarkRepository = new LocalStorageHistoricalBenchmarkRepository();
const sampleSizeRepository = new LocalStorageSampleSizeRepository();

const powerOptions = ["0.80", "0.85", "0.90", "0.95"];

export function SampleSizeWorkspace({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const isDemo = isDemoAssessment(assessmentId);
  const [form, setForm] = useState<SampleSizeFormState>(
    isDemo ? demoSampleSizeForm : emptySampleSizeForm,
  );
  const [showBasis, setShowBasis] = useState(false);
  const [scenarios, setScenarios] = useState<SampleSizeScenario[]>([]);
  const [strategy, setStrategy] = useState<DevelopmentStrategy | null>(null);
  const [benchmark, setBenchmark] = useState<HistoricalBenchmark | null>(null);
  const [assessmentName, setAssessmentName] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      assessmentRepository.getById(assessmentId),
      strategyRepository.getByAssessmentId(assessmentId),
      benchmarkRepository.getByAssessmentId(assessmentId),
      sampleSizeRepository.list(assessmentId),
    ]).then(([assessment, savedStrategy, savedBenchmark, savedScenarios]) => {
      setAssessmentName(assessment?.candidate.name);
      setStrategy(savedStrategy);
      setBenchmark(savedBenchmark);
      setScenarios(
        savedScenarios.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      );
    });
  }, [assessmentId]);

  const result = useMemo(
    () => calculateSampleSize(buildSampleSizeInput(form)),
    [form],
  );

  function patch<K extends keyof SampleSizeFormState>(
    key: K,
    value: SampleSizeFormState[K],
  ) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "analysisType") {
        if (value === "superiority") {
          next.sides = "two_sided";
          next.alpha = "0.05";
          if (next.outcomeType === "pk") next.outcomeType = "continuous";
        } else if (value === "non_inferiority") {
          next.sides = "one_sided";
          next.alpha = "0.025";
          if (next.outcomeType === "pk") next.outcomeType = "continuous";
        } else {
          next.outcomeType = "pk";
          next.alpha = "0.05";
        }
      }
      return next;
    });
  }

  async function saveScenario() {
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    const now = new Date().toISOString();
    const name =
      form.scenarioName.trim() ||
      `시나리오 ${scenarios.length + 1} · 검정력 ${Number(form.power) * 100}%`;
    const scenario: SampleSizeScenario = {
      calculationId: `SS-${crypto.randomUUID()}`,
      assessmentId,
      name,
      analysisType: form.analysisType,
      outcomeType:
        form.analysisType === "bioequivalence" ? "pk" : form.outcomeType,
      inputs: buildSampleSizeInput(form),
      results: result,
      selectedForStrategy: false,
      isDemoInput: isDemo,
      status: "saved",
      createdAt: now,
      updatedAt: now,
    };
    await sampleSizeRepository.save(scenario);
    setScenarios(await sampleSizeRepository.list(assessmentId));
    setMessage("시나리오를 저장했습니다. 임상개발 전략에는 자동 확정하지 않습니다.");
  }

  async function removeScenario(calculationId: string) {
    await sampleSizeRepository.remove(assessmentId, calculationId);
    setScenarios(await sampleSizeRepository.list(assessmentId));
  }

  async function markStrategyCandidate(scenario: SampleSizeScenario) {
    await sampleSizeRepository.save({
      ...scenario,
      selectedForStrategy: !scenario.selectedForStrategy,
      updatedAt: new Date().toISOString(),
    });
    setScenarios(await sampleSizeRepository.list(assessmentId));
  }

  function loadScenario(scenario: SampleSizeScenario, clone: boolean) {
    setForm(formFromInput(scenario.inputs, clone ? `${scenario.name} 복제` : scenario.name));
    setShowBasis(false);
    setMessage(clone ? "시나리오 입력을 복제했습니다." : "저장된 시나리오를 불러왔습니다.");
  }

  return (
    <div className="min-w-0">
      <WorkflowProgress assessmentId={assessmentId} />
      <header className="mb-5 border border-[var(--border)] bg-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">
            {assessmentId} · 표본수 산출
          </p>
          {isDemo ? <DemoBadge compact /> : null}
        </div>
        <h1 className="mt-2 text-2xl font-semibold">
          {assessmentDisplayTitle(assessmentId, assessmentName)}
        </h1>
        <PageGuide>{pageGuides.sampleSize}</PageGuide>
      </header>

      <ReferenceNotes benchmark={benchmark} strategy={strategy} />

      <div className="mb-4 flex border border-[var(--border)] bg-white">
        {(
          [
            ["superiority", "우월성"],
            ["non_inferiority", "비열등성"],
            ["bioequivalence", "생물학적동등성"],
          ] as const
        ).map(([value, label]) => (
          <button
            className={`flex-1 px-4 py-3 text-sm font-semibold ${
              form.analysisType === value
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[var(--muted)] hover:bg-[#f8f9fb]"
            }`}
            key={value}
            onClick={() => patch("analysisType", value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="border border-[var(--border)] bg-white">
          <div className="border-b border-[var(--border)] px-5 py-3">
            <h2 className="font-semibold">설계 및 통계 가정</h2>
            {isDemo ? (
              <p className="mt-1 text-xs font-semibold text-[var(--accent)]">
                DEMO INPUT
              </p>
            ) : null}
          </div>
          <div className="space-y-5 px-5 py-4 text-sm">
            {form.analysisType !== "bioequivalence" ? (
              <FieldGroup title="평가변수 유형">
                <Segmented
                  onChange={(value) =>
                    patch("outcomeType", value as "continuous" | "binary")
                  }
                  options={[
                    ["continuous", "연속형"],
                    ["binary", "이분형"],
                  ]}
                  value={form.outcomeType === "pk" ? "continuous" : form.outcomeType}
                />
              </FieldGroup>
            ) : (
              <FieldGroup title="시험 설계">
                <p>2×2 crossover · Sequence TR / RT · log 변환 PK · TOST</p>
                <Segmented
                  onChange={(value) =>
                    patch("pkParameter", value as "AUC" | "Cmax")
                  }
                  options={[
                    ["AUC", "AUC"],
                    ["Cmax", "Cmax"],
                  ]}
                  value={form.pkParameter}
                />
              </FieldGroup>
            )}

            {form.analysisType === "superiority" ? (
              <FieldGroup title="검정">
                <Segmented
                  onChange={(value) => {
                    patch("sides", value as "one_sided" | "two_sided");
                    if (value === "two_sided") patch("alpha", "0.05");
                  }}
                  options={[
                    ["two_sided", "양측"],
                    ["one_sided", "단측"],
                  ]}
                  value={form.sides}
                />
              </FieldGroup>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                {form.analysisType === "non_inferiority"
                  ? "비열등성은 단측 검정을 사용합니다."
                  : "생물학적동등성은 TOST(단측 α 두 번, 기본 90% CI)를 사용합니다."}
              </p>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs">
                유의수준 Alpha
                <input
                  className="mt-1 w-full border border-[var(--border)] px-2 py-2 text-sm"
                  onChange={(event) => patch("alpha", event.target.value)}
                  value={form.alpha}
                />
                <span className="mt-1 block text-[10px] leading-4 text-[var(--muted)]">
                  {alphaHelp(form)}
                </span>
              </label>
              <label className="text-xs">
                검정력
                <select
                  className="mt-1 w-full border border-[var(--border)] px-2 py-2 text-sm"
                  onChange={(event) =>
                    patch(
                      "power",
                      event.target.value === "custom" ? "" : event.target.value,
                    )
                  }
                  value={powerOptions.includes(form.power) ? form.power : "custom"}
                >
                  {powerOptions.map((option) => (
                    <option key={option} value={option}>
                      {Number(option) * 100}%
                    </option>
                  ))}
                  <option value="custom">직접 입력</option>
                </select>
                {!powerOptions.includes(form.power) ? (
                  <input
                    className="mt-2 w-full border border-[var(--border)] px-2 py-2 text-sm"
                    onChange={(event) => patch("power", event.target.value)}
                    value={form.power}
                  />
                ) : null}
              </label>
            </div>

            {form.analysisType !== "bioequivalence" &&
            form.outcomeType === "continuous" ? (
              <>
                {form.analysisType === "superiority" ? (
                  <FieldGroup title="차이 입력 방식">
                    <Segmented
                      onChange={(value) =>
                        patch("meanEntryMode", value as "means" | "difference")
                      }
                      options={[
                        ["means", "군별 평균"],
                        ["difference", "예상 군간 차이"],
                      ]}
                      value={form.meanEntryMode}
                    />
                  </FieldGroup>
                ) : null}
                {form.meanEntryMode === "difference" &&
                form.analysisType === "superiority" ? (
                  <NumberField
                    label="예상 군간 차이"
                    onChange={(value) => patch("expectedDifference", value)}
                    value={form.expectedDifference}
                  />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <NumberField
                      label="시험군 예상 평균"
                      onChange={(value) => patch("treatmentMean", value)}
                      value={form.treatmentMean}
                    />
                    <NumberField
                      label="대조군 예상 평균"
                      onChange={(value) => patch("controlMean", value)}
                      value={form.controlMean}
                    />
                  </div>
                )}
                <NumberField
                  label="표준편차 (공통 SD)"
                  onChange={(value) => patch("sd", value)}
                  value={form.sd}
                />
              </>
            ) : null}

            {form.analysisType !== "bioequivalence" &&
            form.outcomeType === "binary" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <NumberField
                  label="시험군 반응률 (%)"
                  onChange={(value) => patch("treatmentRatePct", value)}
                  value={form.treatmentRatePct}
                />
                <NumberField
                  label="대조군 반응률 (%)"
                  onChange={(value) => patch("controlRatePct", value)}
                  value={form.controlRatePct}
                />
              </div>
            ) : null}

            {form.analysisType === "non_inferiority" ? (
              <>
                <NumberField
                  label={
                    form.outcomeType === "binary"
                      ? "비열등성 한계 (%p)"
                      : "비열등성 한계"
                  }
                  onChange={(value) => patch("margin", value)}
                  value={form.margin}
                />
                {form.outcomeType === "binary" ? (
                  <p className="text-xs text-[var(--muted)]">
                    10을 입력하면 10 %p (= 0.10)입니다. 비율 0.10과 혼동하지 마세요.
                  </p>
                ) : null}
                <FieldGroup title="유리한 방향">
                  <Segmented
                    onChange={(value) =>
                      patch("direction", value as "higher" | "lower")
                    }
                    options={
                      form.outcomeType === "binary"
                        ? [
                            ["higher", "반응이 높을수록 유리"],
                            ["lower", "사건률이 낮을수록 유리"],
                          ]
                        : [
                            ["higher", "값이 클수록 유리"],
                            ["lower", "값이 작을수록 유리"],
                          ]
                    }
                    value={form.direction}
                  />
                </FieldGroup>
              </>
            ) : null}

            {form.analysisType === "bioequivalence" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <NumberField
                  label="예상 Test/Reference 기하평균비"
                  onChange={(value) => patch("expectedGmr", value)}
                  value={form.expectedGmr}
                />
                <NumberField
                  label="개체 내 CV (%)"
                  onChange={(value) => patch("intraSubjectCvPct", value)}
                  value={form.intraSubjectCvPct}
                />
                <NumberField
                  label="BE 하한"
                  onChange={(value) => patch("beLower", value)}
                  value={form.beLower}
                />
                <NumberField
                  label="BE 상한"
                  onChange={(value) => patch("beUpper", value)}
                  value={form.beUpper}
                />
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-3">
                <NumberField
                  label="배정비 시험군"
                  onChange={(value) => patch("allocationTreatment", value)}
                  value={form.allocationTreatment}
                />
                <NumberField
                  label="배정비 대조군"
                  onChange={(value) => patch("allocationControl", value)}
                  value={form.allocationControl}
                />
                <NumberField
                  label="탈락률 (%)"
                  onChange={(value) => patch("dropoutPct", value)}
                  value={form.dropoutPct}
                />
              </div>
            )}

            {form.analysisType === "bioequivalence" ? (
              <NumberField
                label="탈락률 (%)"
                onChange={(value) => patch("dropoutPct", value)}
                value={form.dropoutPct}
              />
            ) : null}

            <label className="block text-xs">
              시나리오 이름
              <input
                className="mt-1 w-full border border-[var(--border)] px-2 py-2 text-sm"
                onChange={(event) => patch("scenarioName", event.target.value)}
                value={form.scenarioName}
              />
            </label>
          </div>
        </section>

        <ResultPanel
          form={form}
          onSave={() => void saveScenario()}
          onToggleBasis={() => setShowBasis((value) => !value)}
          result={result.ok ? result : null}
          showBasis={showBasis}
          warning={!result.ok ? result.message : null}
        />
      </div>

      {message ? (
        <p className="mt-4 text-sm text-[var(--accent)]">{message}</p>
      ) : null}

      <section className="mt-5 border border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] px-5 py-3">
          <h2 className="font-semibold">저장된 산출 시나리오</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            여러 가정을 비교할 수 있습니다. 향후 임상개발 전략의 최종 표본수와
            연결할 수 있도록 후보 표시만 준비되어 있습니다.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-xs">
            <thead className="bg-[#f8f9fb] text-[var(--muted)]">
              <tr>
                {[
                  "시나리오",
                  "시험설계",
                  "효과/한계",
                  "검정력",
                  "탈락률",
                  "분석 N",
                  "등록 N",
                  "작업",
                ].map((heading) => (
                  <th
                    className="border-b border-[var(--border)] px-4 py-3"
                    key={heading}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scenarios.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-6 text-[var(--muted)]"
                    colSpan={8}
                  >
                    저장된 시나리오가 없습니다.
                  </td>
                </tr>
              ) : (
                scenarios.map((scenario) => (
                  <tr
                    className="border-b border-[var(--border)]"
                    key={scenario.calculationId}
                  >
                    <td className="px-4 py-3">
                      {scenario.name}
                      {scenario.isDemoInput ? (
                        <span className="ml-2 text-[var(--accent)]">DEMO INPUT</span>
                      ) : null}
                      {scenario.selectedForStrategy ? (
                        <span className="ml-2 text-[var(--muted)]">전략 연결 후보</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{designLabel(scenario)}</td>
                    <td className="px-4 py-3">
                      {effectLabel(scenario.inputs)}
                    </td>
                    <td className="px-4 py-3">
                      {Math.round(powerFromInput(scenario.inputs) * 100)}%
                    </td>
                    <td className="px-4 py-3">
                      {Math.round(dropoutFromInput(scenario.inputs) * 100)}%
                    </td>
                    <td className="px-4 py-3">
                      {scenario.results?.analysisN?.total ??
                        scenario.results?.crossover?.completers ??
                        "—"}
                    </td>
                    <td className="px-4 py-3">
                      {scenario.results?.enrollmentN?.total ??
                        scenario.results?.crossover?.enrollment ??
                        "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="underline"
                          onClick={() => loadScenario(scenario, false)}
                          type="button"
                        >
                          보기
                        </button>
                        <button
                          className="underline"
                          onClick={() => loadScenario(scenario, true)}
                          type="button"
                        >
                          복제
                        </button>
                        <button
                          className="underline"
                          onClick={() => void markStrategyCandidate(scenario)}
                          type="button"
                        >
                          후보
                        </button>
                        <button
                          className="underline text-[var(--danger)]"
                          onClick={() => void removeScenario(scenario.calculationId)}
                          type="button"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-4 text-xs leading-6 text-[var(--muted)]">
        본 산출 결과는 입력된 통계적 가정에 따른 표본수 검토 결과입니다.
        최종 임상시험 설계 및 표본수는 통계 담당자의 검토를 거쳐 확정해야 합니다.
      </p>
    </div>
  );
}

function ResultPanel({
  form,
  result,
  warning,
  showBasis,
  onToggleBasis,
  onSave,
}: {
  form: SampleSizeFormState;
  result: SampleSizeSuccess | null;
  warning: string | null;
  showBasis: boolean;
  onToggleBasis: () => void;
  onSave: () => void;
}) {
  return (
    <section className="border border-[var(--border)] bg-white">
      <div className="border-b border-[var(--border)] px-5 py-3">
        <h2 className="font-semibold">표본수 산출 결과</h2>
      </div>
      <div className="px-5 py-4 text-sm">
        <p className="text-xs text-[var(--muted)]">시험설계</p>
        <p className="mt-1 font-semibold">{currentDesignLabel(form)}</p>
        {warning ? (
          <p className="mt-4 border border-[#f0b8b4] bg-[#fff4f3] px-3 py-3 text-[var(--danger)]">
            {warning}
          </p>
        ) : null}
        {result ? (
          <>
            <AssumptionList form={form} result={result} />
            {result.analysisN ? (
              <CountBlock
                enrollment={result.enrollmentN}
                dropoutPct={form.dropoutPct}
                title="분석 필요 대상자"
                values={result.analysisN}
              />
            ) : null}
            {result.crossover ? (
              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <p className="font-semibold">분석 필요 대상자 수</p>
                <p className="mt-2">Required Completers {result.crossover.completers}명</p>
                <p>Sequence TR {result.crossover.sequenceTR}명</p>
                <p>Sequence RT {result.crossover.sequenceRT}명</p>
                <p className="mt-3 font-semibold">
                  탈락률 {form.dropoutPct}% 반영 등록 대상자 수
                </p>
                <p className="mt-2">총 {result.crossover.enrollment}명</p>
                <p>TR {result.crossover.sequenceTREnrollment}명 · RT {result.crossover.sequenceRTEnrollment}명</p>
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                className="border border-[var(--border)] px-3 py-2 text-xs font-semibold"
                onClick={onToggleBasis}
                type="button"
              >
                {showBasis ? "계산 근거 닫기" : "계산 근거 보기"}
              </button>
              <button
                className="bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white"
                onClick={onSave}
                type="button"
              >
                시나리오 저장
              </button>
            </div>
            {showBasis ? <BasisBlock result={result} /> : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

function AssumptionList({
  form,
  result,
}: {
  form: SampleSizeFormState;
  result: SampleSizeSuccess;
}) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
      <dt className="text-[var(--muted)]">Alpha</dt>
      <dd>{form.alpha}</dd>
      <dt className="text-[var(--muted)]">검정력</dt>
      <dd>{Number(form.power) * 100}%</dd>
      {form.analysisType !== "bioequivalence" ? (
        <>
          <dt className="text-[var(--muted)]">배정비</dt>
          <dd>
            {form.allocationTreatment}:{form.allocationControl}
          </dd>
        </>
      ) : null}
      <dt className="text-[var(--muted)]">탈락률</dt>
      <dd>{form.dropoutPct}%</dd>
      <dt className="text-[var(--muted)]">효과/한계</dt>
      <dd>{result.diagnostics.effect}</dd>
    </dl>
  );
}

function CountBlock({
  title,
  values,
  enrollment,
  dropoutPct,
}: {
  title: string;
  values: { treatment: number; control: number; total: number };
  enrollment: { treatment: number; control: number; total: number } | null;
  dropoutPct: string;
}) {
  return (
    <div className="mt-5 border-t border-[var(--border)] pt-4">
      <p className="font-semibold">{title}</p>
      <p className="mt-2">시험군 {values.treatment}명</p>
      <p>대조군 {values.control}명</p>
      <p>총 {values.total}명</p>
      {enrollment ? (
        <>
          <p className="mt-3 font-semibold">탈락률 {dropoutPct}% 반영</p>
          <p className="mt-2">시험군 {enrollment.treatment}명</p>
          <p>대조군 {enrollment.control}명</p>
          <p>총 {enrollment.total}명</p>
        </>
      ) : null}
    </div>
  );
}

function BasisBlock({ result }: { result: SampleSizeSuccess }) {
  const items = [
    ["검정 방법", result.diagnostics.method],
    ["검정가설", result.diagnostics.hypothesis],
    ["사용 공식", result.diagnostics.formula],
    ["Z alpha", String(round(result.diagnostics.zAlpha))],
    ["Z beta", String(round(result.diagnostics.zBeta))],
    ["Effect", String(round(result.diagnostics.effect))],
    ["Variance", String(round(result.diagnostics.variance, 6))],
    ["raw N", String(round(result.diagnostics.rawN, 4))],
    ["올림 규칙", result.diagnostics.roundingRule],
    ["탈락 보정", `탈락률 ${result.diagnostics.dropoutRate * 100}%`],
  ];
  if (result.diagnostics.tCritical !== undefined) {
    items.splice(4, 0, ["t critical", String(round(result.diagnostics.tCritical))]);
  }
  return (
    <dl className="mt-4 space-y-2 border border-[var(--border)] bg-[#f8f9fb] px-3 py-3 text-xs">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[var(--muted)]">{label}</dt>
          <dd className="mt-0.5 break-words">{value}</dd>
        </div>
      ))}
      {result.diagnostics.notes.map((note) => (
        <p key={note}>{note}</p>
      ))}
    </dl>
  );
}

function ReferenceNotes({
  strategy,
  benchmark,
}: {
  strategy: DevelopmentStrategy | null;
  benchmark: HistoricalBenchmark | null;
}) {
  const fields = ["primary_endpoint", "target_effect", "historical_benchmark", "study_design"] as const;
  const selected = benchmark?.metrics.filter((metric) => metric.status === "selected") ?? [];
  if (!strategy && selected.length === 0) return null;

  return (
    <section className="mb-4 border border-[var(--border)] bg-white px-5 py-4">
      <h2 className="text-sm font-semibold">참고 정보</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Evidence → 기존 치료성과 기준 → 임상개발 전략에서 확인된 값입니다.
        자동으로 표본수 입력에 확정하지 않습니다.
      </p>
      <dl className="mt-3 grid gap-2 text-xs md:grid-cols-2">
        {fields.map((key) => {
          const field = strategy?.fields.find((item) => item.key === key);
          const value =
            field?.reviewStatus === "rejected"
              ? null
              : field?.reviewedValue ?? field?.originalSuggestedValue;
          return (
            <div key={key}>
              <dt className="text-[var(--muted)]">{strategyFieldLabels[key]}</dt>
              <dd className="mt-1">{value || "확인되지 않음"}</dd>
            </div>
          );
        })}
        {selected.map((metric) => (
          <div key={metric.metricId}>
            <dt className="text-[var(--muted)]">기존 치료성과 기준</dt>
            <dd className="mt-1">
              {metric.displayName}
              {metric.value !== undefined && metric.value !== null
                ? `: ${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`
                : ""}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function FieldGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold">{title}</p>
      {children}
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([option, label]) => (
        <button
          className={`border px-3 py-1.5 text-xs font-semibold ${
            value === option
              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
              : "border-[var(--border)] text-[var(--muted)]"
          }`}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs">
      {label}
      <input
        className="mt-1 w-full border border-[var(--border)] px-2 py-2 text-sm"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function alphaHelp(form: SampleSizeFormState) {
  if (form.analysisType === "bioequivalence") {
    return "TOST 단측 Alpha입니다. 0.05이면 90% CI이며, 우월성 양측 0.05와 같지 않습니다.";
  }
  if (form.analysisType === "non_inferiority") {
    return "단측 Alpha입니다. 기본 0.025는 우월성 양측 0.05의 한쪽 꼬리와 같습니다.";
  }
  if (form.sides === "two_sided") {
    return "양측 Alpha입니다. 0.05이면 각 꼬리 0.025를 사용합니다.";
  }
  return "단측 Alpha입니다. 입력한 Alpha를 한쪽 꼬리에 그대로 사용합니다.";
}

function currentDesignLabel(form: SampleSizeFormState) {
  if (form.analysisType === "bioequivalence") {
    return `생물학적동등성 / 2×2 crossover / ${form.pkParameter} / TOST`;
  }
  const analysis = form.analysisType === "superiority" ? "우월성" : "비열등성";
  const outcome = form.outcomeType === "binary" ? "이분형" : "연속형";
  const sides =
    form.analysisType === "superiority"
      ? form.sides === "two_sided"
        ? "양측"
        : "단측"
      : "단측";
  return `${analysis} / 두 군 / ${outcome} / ${sides}`;
}

function designLabel(scenario: SampleSizeScenario) {
  const analysis =
    scenario.analysisType === "superiority"
      ? "우월성"
      : scenario.analysisType === "non_inferiority"
        ? "비열등성"
        : "BE";
  const outcome =
    scenario.outcomeType === "binary"
      ? "이분형"
      : scenario.outcomeType === "pk"
        ? "2×2"
        : "연속형";
  return `${analysis} / ${outcome}`;
}

function effectLabel(input: SampleSizeInput) {
  switch (input.kind) {
    case "superiority_continuous":
      return input.meanEntryMode === "difference"
        ? String(input.expectedDifference ?? "—")
        : `${input.treatmentMean} − ${input.controlMean}`;
    case "superiority_binary":
      return `${pct(input.treatmentRate)} vs ${pct(input.controlRate)}`;
    case "non_inferiority_continuous":
      return `Δ ${input.margin}`;
    case "non_inferiority_binary":
      return `Δ ${input.margin * 100} %p`;
    case "bioequivalence_2x2":
      return `GMR ${input.expectedGmr}`;
  }
}

function powerFromInput(input: SampleSizeInput) {
  return input.power;
}

function dropoutFromInput(input: SampleSizeInput) {
  return input.dropoutRate;
}

function formFromInput(input: SampleSizeInput, name: string): SampleSizeFormState {
  const base = emptySampleSizeForm();
  base.scenarioName = name;
  base.power = String(input.power);
  base.alpha = String(input.alpha);
  base.dropoutPct = String(input.dropoutRate * 100);

  switch (input.kind) {
    case "superiority_continuous":
      return {
        ...base,
        analysisType: "superiority",
        outcomeType: "continuous",
        sides: input.sides,
        meanEntryMode: input.meanEntryMode,
        treatmentMean: String(input.treatmentMean ?? ""),
        controlMean: String(input.controlMean ?? ""),
        expectedDifference: String(input.expectedDifference ?? ""),
        sd: String(input.sd),
        allocationTreatment: String(input.allocationTreatment),
        allocationControl: String(input.allocationControl),
      };
    case "superiority_binary":
      return {
        ...base,
        analysisType: "superiority",
        outcomeType: "binary",
        sides: input.sides,
        treatmentRatePct: String(input.treatmentRate * 100),
        controlRatePct: String(input.controlRate * 100),
        allocationTreatment: String(input.allocationTreatment),
        allocationControl: String(input.allocationControl),
      };
    case "non_inferiority_continuous":
      return {
        ...base,
        analysisType: "non_inferiority",
        outcomeType: "continuous",
        sides: "one_sided",
        treatmentMean: String(input.treatmentMean),
        controlMean: String(input.controlMean),
        margin: String(input.margin),
        sd: String(input.sd),
        direction: input.direction,
        allocationTreatment: String(input.allocationTreatment),
        allocationControl: String(input.allocationControl),
      };
    case "non_inferiority_binary":
      return {
        ...base,
        analysisType: "non_inferiority",
        outcomeType: "binary",
        sides: "one_sided",
        treatmentRatePct: String(input.treatmentRate * 100),
        controlRatePct: String(input.controlRate * 100),
        margin: String(input.margin * 100),
        direction: input.direction,
        allocationTreatment: String(input.allocationTreatment),
        allocationControl: String(input.allocationControl),
      };
    case "bioequivalence_2x2":
      return {
        ...base,
        analysisType: "bioequivalence",
        outcomeType: "pk",
        pkParameter: input.pkParameter,
        expectedGmr: String(input.expectedGmr),
        intraSubjectCvPct: String(input.intraSubjectCv * 100),
        beLower: String(input.lowerLimit),
        beUpper: String(input.upperLimit),
      };
  }
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
