# 표본수 산출 엔진

이 문서는 `src/services/statistics/sample-size/`의 deterministic 계산을 설명한다.
표본수는 LLM이 생성하지 않는다. 현재 구현은 TypeScript이며, 동일한
`SampleSizeCalculator` 계약으로 R/PASS 엔진으로 교체할 수 있다.

## 공통 가정

- **Alpha**: `0 < α < 1`. 양측이면 `z_{1-α/2}`, 단측이면 `z_{1-α}`.
- **검정력**: `0 < 1−β < 1`, `z_{1-β}`.
- **배정비**: `r = n_T / n_C`. 기본 1:1.
- **탈락률 d**: `0 ≤ d < 1`. 등록 N = `ceil(분석 N / (1 − d))`, 군별 적용.
- **올림**: 분석·등록 인원은 항상 정수 올림. 0은 허용하지 않는다.
- **정규 분위수**: Acklam 근사. **t 분위수**: Cornish–Fisher.

## 1. 우월성 / 연속형

공통 SD `σ`, 차이 `δ = μT − μC` (또는 직접 입력).

```
n_C = (1 + 1/r) σ² (z_{1-α*} + z_{1-β})² / δ²
n_T = r n_C
```

Reference: Chow, Shao, Wang, *Sample Size Calculations in Clinical Research*, §3.1.1.

검증 예: δ=2, σ=4, α=0.05 양측, 80%, 1:1 → 군당 63, 총 126.
탈락 10% → 군당 등록 70, 총 140.

## 2. 우월성 / 이분형

비합동 분산, 연속성 보정 없음.

```
n_C = (pT(1-pT)/r + pC(1-pC)) (z_{1-α*} + z_{1-β})² / (pT − pC)²
```

Reference: Chow et al., §4.2.1.

검증 예: 50% vs 30%, α=0.05 양측, 80% → 군당 91.
탈락 10% → 군당 등록 102.

## 3. 비열등성 / 연속형

UI의 한계 Δ는 항상 양수. 내부에서 가설 부호를 처리한다.

Higher is better:

```
H0: μT − μC ≤ −Δ
H1: μT − μC > −Δ
effect = (μT − μC) + Δ
```

Lower is better:

```
H0: μT − μC ≥ +Δ
H1: μT − μC < +Δ
effect = Δ − (μT − μC)
```

기본 α는 단측 0.025.

```
n_C = (1 + 1/r) σ² (z_{1-α} + z_{1-β})² / effect²
```

effect ≤ 0이면 N을 반환하지 않고 경고한다.

Reference: Chow et al., §6.2; ICH E9/E10.

검증 예: μT=μC=10, Δ=2, σ=4, α=0.025, 80% → 군당 63.

## 4. 비열등성 / 이분형

한계는 **%p(절대 반응률 차이)**. 10 %p = 0.10. 0.10과 10%를 혼동하지 않는다.

가설과 effect 정의는 연속형과 동일하며 pT−pC를 사용한다.

```
n_C = (pT(1-pT)/r + pC(1-pC)) (z_{1-α} + z_{1-β})² / effect²
```

Reference: Chow et al., §4.2.3; Blackwelder (1982).

검증 예: 70% vs 75%, Δ=10 %p, higher better, α=0.025, 80% → 군당 1248.

## 5. 생물학적동등성 / 2×2 crossover

- log 변환 PK (AUC 또는 Cmax, 동일 공식)
- TOST, 기본 90% CI (`α=0.05` 단측 두 번)
- 기본 수용 범위 80.00–125.00%
- `σ_w² = ln(1 + CV²)`
- `se = σ_w √(2/n)`, `df = n − 2`

```
최소 짝수 n은 다음을 모두 만족해야 한다.

1. Φ-TOST power ≥ 목표 검정력
2. binding bound / se ≥ t_{1-α,df} + t_{1-β,df}

Φ-only는 Owen's Q보다 검정력을 과대평가할 수 있어, 두 기준을 함께 쓴다.
TR/RT는 균등 배분한다.

Reference: Diletti, Hauschke, Steinijans (1991); Julious (2004); FDA average BE.

검증 예: GMR 0.95, CV 20%, 80–125%, 80% → Diletti 19, 짝수 올림 20.
90% → Diletti/PowerTOST 26.
탈락 10% → 등록 evenCeil(20/0.9)=24.

## 교체 지점

`DeterministicSampleSizeCalculator`가 `SampleSizeCalculator`를 구현한다.
R 엔진으로 바꿀 때는 같은 `SampleSizeInput` / `SampleSizeResult`만 맞추면 된다.
