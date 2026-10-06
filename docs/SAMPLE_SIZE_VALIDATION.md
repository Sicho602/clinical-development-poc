# 표본수 산출 독립 QC

검증일: 2026-10-06

현재 TypeScript 구현을 정답으로 두지 않고, 공개 z 상수와 공개 표로
다시 계산했다. 기존 unit test 통과는 근거로 사용하지 않았다.

공개 상수 (NIST / Abramowitz–Stegun, 구현체와 독립):

- \(z_{0.975} = 1.959963984540054\)
- \(z_{0.80} = 0.841621233572914\)
- \(z_{0.90} = 1.2815515655446004\)
- \(z_{0.95} = 1.6448536269514722\)

판정:

- VALIDATED: 명시된 공식과 공개 reference가 일치
- PARTIALLY VALIDATED: 명시된 공식은 맞지만 PASS 기본 procedure와 가정이 다름
- NOT VALIDATED: 독립 검산 불가 또는 공식 오류

---

## Alpha 정의

| UI 입력 | 내부 tail | 임계값 |
|---|---|---|
| 우월성 양측 0.05 | 각 꼬리 0.025 | \(z_{0.975}\) |
| 우월성 단측 α | 한쪽 꼬리 α | \(z_{1-α}\) |
| 비열등성 단측 0.025 | 한쪽 꼬리 0.025 | \(z_{0.975}\) |
| BE TOST α=0.05 | 단측 두 번 | \(t_{0.95, n-2}\), 90% CI |

양측 0.05와 BE TOST 0.05는 같은 숫자가 아니다.

---

## Dropout

등록 N = `ceil(분석 N / (1 − d))`, 군별 적용.

BE는 짝수 completer를 유지한 뒤 `evenCeil(n / (1 − d))`로 TR/RT 균형을 맞춘다.

예: 분석 63, d=10% → `ceil(63/0.9)=70`.

---

## 1. 우월성 / 연속형

**판정: PARTIALLY VALIDATED**

가설: H0 μT−μC=0 vs H1 μT−μC≠0 (양측)

공식 (공통 SD, 정규근사):

```
n_C = (1 + 1/r) σ² (z_{1-α/2} + z_{1-β})² / δ²
n_T = r n_C
```

가정: 등분산, z-검정. σ는 알려진 것으로 취급한다.

Reference: Chow, Shao, Wang §3.1.1; Julious z-shortcut.

독립 검산 (δ=2, σ=4, α=0.05 양측, 80%, 1:1):

```
n_C = 2 × 16 × (1.959964 + 0.841621)² / 4 = 62.791 → 63
```

구현 결과: 63.

PASS / G*Power / R `power.t.test` 기본은 **이표본 t-검정**이다.
같은 입력에서 군당 **64**이다. 이유는 t가 σ 추정의 df를 반영하기 때문이다.
z-공식 63과 t-공식 64의 차이는 구현 버그가 아니라 검정 가정 차이다.
n=63의 t-검정 검정력은 약 79.5%로 80%에 미달한다.

이 모듈은 Chow z-공식으로는 검증됐고, PASS 기본 t-검정과는 1명 차이가 난다.

---

## 2. 우월성 / 이분형

**판정: PARTIALLY VALIDATED**

가설: H0 pT−pC=0 vs H1 pT−pC≠0

구현 공식 (비합동 분산, 연속성 보정 없음):

```
n_C = (pT(1-pT)/r + pC(1-pC)) (z_{1-α/2} + z_{1-β})² / (pT−pC)²
```

Reference: Chow §4.2.1 unpooled.

독립 검산 (50% vs 30%, 양측 0.05, 80%):

```
var = 0.25 + 0.21 = 0.46
n = 0.46 × 7.84888 / 0.04 = 90.262 → 91
```

구현 결과: 91.

Fleiss / R `power.prop.test` / 일부 PASS pooled z는 H0 분산 `2p̄(1-p̄)`를 α 항에 쓴다:

```
n = [1.959964√0.48 + 0.841621√0.46]² / 0.04 = 93.00 → 93
```

차이는 H0 vs H1 분산 가정이다. 구현은 Chow unpooled를 정확히 수행한다.

---

## 3. 비열등성 / 연속형

**판정: PARTIALLY VALIDATED**

Higher is better, UI 한계 Δ>0:

```
H0: μT − μC ≤ −Δ
H1: μT − μC > −Δ
effect = (μT − μC) + Δ
```

단측 α, `z_{1-α}`. 등평균·Δ=2·σ=4·α=0.025는 우월성 양측 0.05와 같은 z를 쓰므로 군당 63.

PASS 기본 t-검정은 64. 차이의 이유는 우월성 연속형과 같다.

가정상 비열등이 불가능한 경우(effect≤0)는 N을 반환하지 않는다. 이 부분은 확인됐다.

---

## 4. 비열등성 / 이분형 — 1,248명 재검산

**판정: VALIDATED** (Blackwelder / Chow unpooled)

입력:

- pT = 0.70, pC = 0.75
- Δ = 0.10 (10 %p, 절대 반응률 차이)
- 단측 α = 0.025, 검정력 80%, 1:1
- 방향: 반응이 높을수록 유리

정의:

- treatment−control difference: pT−pC = −0.05
- 가설: H0 pT−pC ≤ −0.10 vs H1 pT−pC > −0.10
- effective difference to margin: (−0.05)+0.10 = 0.05
- variance: 0.70×0.30 + 0.75×0.25 = 0.3975
- Z alpha: \(z_{0.975}=1.959964\)
- Z beta: \(z_{0.80}=0.841621\)
- raw N per group: 0.3975 × (2.801585)² / 0.05² = 1247.972
- rounding: ceil → **1248**
- allocation: 1:1

구현 결과: 군당 1248.

같은 Blackwelder 공식의 공개 예 (85% vs 85%, Δ=10 %p)는 201명/군이다.
독립 계산과 구현 모두 201이다.

PASS 기본이 Farrington–Manning score이면 null 분산이 달라질 수 있다.
n≈1248에서는 두 분산이 거의 같아 차이 폭은 작다.
이 모듈은 Blackwelder 가정에서 VALIDATED이다. FM을 주장하지는 않는다.

---

## 5. 생물학적동등성 / 2×2

**판정: PARTIALLY VALIDATED**

확인한 가정:

- log scale: θ=ln(limit), μ=ln(GMR)
- CV → σ_w² = ln(1+CV²)
- TOST, α=0.05 → 90% CI
- se = σ_w √(2/n), df = n−2
- 짝수 n (TR/RT 균형)
- 반복 탐색

QC 전 문제:

- Φ-only TOST power가 Owen's Q보다 검정력을 과대평가했다.
- GMR 0.95, CV 20%, 90%에서 구현 24 vs Diletti/PowerTOST **26**.

수정:

- Φ-TOST와 Julious tα+tβ binding-bound를 모두 만족하는 최소 짝수 n을 사용.
- 80% Diletti 칸과 90% PowerTOST 26이 맞는다.
- 정확한 Owen's Q 엔진은 아직 아니다.

20명 재검산:

- Diletti 1991, 80–125%, α=0.05, 80%, CV 20%, GMR 0.95: **n=19**
- 2×2는 짝수로 올림 → **20**
- 구현: Required Completers **20** (10/10)
- 탈락 10%: evenCeil(20/0.9)=24

이 20명은 Diletti 짝수 올림과 일치한다. 19를 그대로 쓰는 표와는 1명 차이가 나며, 이는 sequence balance 규칙이다.

---

## Validation scenarios

Expected N은 구현이 아니라 위 독립 계산 또는 Diletti/PowerTOST 표이다.
Calculated N은 현재 엔진이다. 분석 N(군당 또는 completers) 기준.

| ID | Design | Input | Expected N | Calculated N | Diff | PASS/Reference | Result |
|---|---|---|---|---|---|---|---|
| C1 | 우월성 연속형 | δ=2, σ=4, 양측 0.05, 80%, 1:1 | 63 (z) | 63 | 0 | Chow z; PASS t=64 | PASS for z / FAIL vs PASS t |
| C2 | 우월성 연속형 | 위 + 90% | 85 (z) | 85 | 0 | 독립 z 재계산 | PASS |
| C3 | 우월성 연속형 | 위 + 배정 2:1 | C=48, T=95 | 48 / 95 | 0 | 독립 z 재계산 | PASS |
| B1 | 우월성 이분형 | 50% vs 30%, 양측 0.05, 80% | 91 (unpooled) | 91 | 0 | Chow unpooled; Fleiss=93 | PASS for unpooled / FAIL vs Fleiss |
| B2 | 우월성 이분형 | 위 + 90% | 121 | 121 | 0 | 독립 재계산 | PASS |
| B3 | 우월성 이분형 | 60% vs 40%, 80% | 95 | 95 | 0 | 같은 δ, 다른 분산 | PASS |
| N1 | 비열등성 연속형 | 등평균, Δ=2, σ=4, 단측 0.025, 80% | 63 (z) | 63 | 0 | 우월성 C1과 동일 z | PASS for z / FAIL vs PASS t |
| N2 | 비열등성 연속형 | μT=11, μC=10, Δ=2, σ=4 | 28 | 28 | 0 | effect=3 | PASS |
| N3 | 비열등성 연속형 | lower, μT=8, μC=10, Δ=3, σ=5 | 16 | 16 | 0 | effect=5 | PASS |
| P1 | 비열등성 이분형 | 70% vs 75%, 10 %p, 단측 0.025, 80% | 1248 | 1248 | 0 | Blackwelder 독립 재계산 | PASS |
| P2 | 비열등성 이분형 | 위 + 15 %p | 312 | 312 | 0 | 독립 재계산 | PASS |
| P3 | 비열등성 이분형 | 85% vs 85%, 10 %p | 201 | 201 | 0 | 공개 calculator 예 | PASS |
| E1 | BE 2×2 | GMR 0.95, CV 20%, 80% | 20 (Diletti 19 even) | 20 | 0 | Diletti 1991 | PASS |
| E2 | BE 2×2 | GMR 1.00, CV 20%, 80% | 16 | 16 | 0 | Diletti 1991 | PASS |
| E3 | BE 2×2 | GMR 0.95, CV 15%, 80% | 12 | 12 | 0 | Diletti 1991 | PASS |
| E4 | BE 2×2 | GMR 0.95, CV 10%, 80% | 8 (Diletti 7 even) | 8 | 0 | Diletti 1991 | PASS |
| E5 | BE 2×2 | GMR 0.95, CV 30%, 80% | 40 (Diletti 39 even) | 40 | 0 | Diletti 1991 | PASS |
| E6 | BE 2×2 | GMR 0.95, CV 20%, 90% | 26 | 26 | 0 | Diletti / PowerTOST | PASS |
| E7 | BE 2×2 | GMR 0.95, CV 40%, 80% | 66 | 66 | 0 | PowerTOST 표 | PASS |
| D1 | Dropout | C1 + 탈락 10% | 등록 70 | 70 | 0 | ceil(63/0.9) | PASS |

C1/B1/N1의 PASS t 또는 Fleiss 칸은 가정이 다를 뿐이며, 구현 공식 오류로 기록하지 않는다.

---

## 수정한 공식

BE만 수정했다. Φ-only 탐색은 90%에서 24명을 반환했다.
지금은 Φ-TOST와 Julious tα+tβ를 모두 통과하는 최소 짝수 n을 쓴다.
우월성·비열등성 공식은 바꾸지 않았다.

---

## 남은 statistical limitation

1. 연속형 평균 비교는 z-근사이다. PASS/G*Power t-검정은 군당 +1명이 될 수 있다.
2. 이분형 우월성은 unpooled Chow이다. Fleiss/pooled는 +2명 정도 다를 수 있다.
3. 비열등성 이분형은 Blackwelder이다. PASS 기본 FM score와는 작은 n에서 갈릴 수 있다.
4. BE는 Owen's Q가 아니다. 위 표의 칸은 맞지만 모든 GMR×CV 조합을 보증하지는 않는다.
5. 연속성 보정, 정확 이항, 비등분산 t는 구현하지 않았다.

이 결과는 입력 가정에 대한 검토용이다. 최종 표본수는 통계 담당자가 확정해야 한다.
