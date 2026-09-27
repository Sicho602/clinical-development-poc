# Clinical Development Explorer — PoC Architecture

## 1. 목표와 설계 원칙

이 PoC는 검색 서비스가 아니라 Assessment 단위의 임상개발 검토 workflow를
표준화한다. 설계 우선순위는 다음과 같다.

1. **Traceability**: 구조화 값에는 상태, 근거 설명, source reference를 함께 저장한다.
2. **Human review**: AI 초안과 검토·승인 상태를 분리하고 주요 섹션은 수정 가능하다.
3. **No fabrication**: API에서 확인하지 못한 PMID/NCT/수치에는 결측 상태를 사용한다.
4. **Replaceable dependencies**: 외부 API, 저장소, AI, 통계, 비용 시스템을 interface
   뒤에 둔다.
5. **Reusable domain data**: 외부 API payload와 내부 도메인 모델을 분리한다.

## 2. 권장 기술 구성

- Next.js App Router, React, TypeScript strict mode
- Tailwind CSS
- Next.js Route Handlers (외부 API server-side 호출)
- Zod (입력 및 외부 응답 경계 검증)
- PoC 저장소: local JSON repository
- 운영 전환: 동일 repository contract의 PostgreSQL 구현
- Vitest + Testing Library

SQLite는 단일 프로세스 PoC에는 적합하지만 배포 환경과 native driver 제약이 있다.
따라서 첫 실행 가능한 버전은 atomic-write local JSON으로 만들고, 데이터 접근은
repository contract로 제한한다. STEP 11에서 SQLite를 선택할 경우 구현체만 교체한다.

## 3. 계층과 데이터 흐름

```text
Page / Feature UI
  -> use case
    -> repository interface / connector interface
      -> Route Handler or local repository implementation
        -> mapper + boundary validation
          -> external API / local data
```

- UI는 ClinicalTrials.gov 또는 PubMed 원문 shape를 직접 참조하지 않는다.
- connector는 HTTP, timeout, rate-limit, retry-after를 처리한다.
- mapper는 외부 응답을 `ClinicalTrial` 또는 `Publication`으로 변환한다.
- 원문 payload는 `rawSource`에 보존하되 화면에는 정규화 모델만 전달한다.
- 검색 실행 성공·실패·0건은 모두 `SearchLog`에 별도 상태로 기록한다.

## 4. Directory Structure

```text
src/
  app/
    (workspace)/
      dashboard/
      assessments/
        new/
        [assessmentId]/
          search-strategy/
          evidence/
          trial-landscape/
          development-strategy/
          feasibility/
          report/
    api/
      assessments/
      clinical-trials/
      pubmed/
    layout.tsx
    page.tsx
    globals.css
  components/
    layout/
    ui/
    feedback/
  domain/
    models.ts
    contracts.ts
  features/
    assessments/
    search-strategy/
    clinical-trials/
    publications/
    evidence/
    development-strategy/
    feasibility/
    reports/
  services/
    connectors/
      clinical-trials/
      pubmed/
    ai/
    statistical/
    cost/
  repositories/
    local/
    sqlite/
  lib/
    env.ts
    http.ts
    identifiers.ts
    validation.ts
docs/
  ARCHITECTURE.md
```

## 5. 핵심 모델

`src/domain/models.ts`가 canonical model이다.

- `Assessment`, `Candidate`, `ResearchQuestion`
- `SearchStrategy`, `SearchLog`
- `ClinicalTrial`, `Publication`
- `ExtractedEvidence`, `ReferenceTrial`, `SelectedPublication`
- `DevelopmentStrategy`, `StatisticalDesign`
- `TimelineEstimate`, `CostEstimate`, `ComplexityAssessment`
- `Risk`, `DecisionPoint`, `SourceReference`
- `AssessmentVersion`, `Review`

중요 값은 가능한 경우 `SourcedValue<T>`로 저장한다.

```text
value + evidence state + missing reason + basis + source references
```

이 구조로 `Not Reported`, `Requires Statistical Review`, `User-entered` 등을 값과
혼합하지 않고 표현한다.

## 6. ClinicalTrials.gov integration

공식 API v2 base URL:

```text
https://clinicaltrials.gov/api/v2
```

사용 endpoint:

- `GET /studies`: `query.term`, `pageSize`, `pageToken`, `countTotal`, `format=json`
- `GET /studies/{nctId}`: 단일 trial 상세

PoC 검색은 free-text `query.term`부터 시작하고, UI filter는 정규화된 결과에 즉시
적용한다. 데이터 양이 커질 경우 공식 query/filter parameter로 server-side filtering을
추가한다. parser는 protocol section의 identification, status, sponsor/collaborator,
design, arms/interventions, outcomes, eligibility, contacts/locations 모듈을 각각
안전하게 읽는다.

NCT source URL:

```text
https://clinicaltrials.gov/study/{NCT_ID}
```

안전장치:

- AbortSignal 기반 timeout
- 429를 `rate_limited`, 0건을 `no_results`로 구분
- upstream status와 request ID를 내부 오류 객체에 보존
- next page token으로 pagination
- unknown/missing module은 빈 배열 또는 undefined로 유지

## 7. PubMed integration

NCBI E-utilities base URL:

```text
https://eutils.ncbi.nlm.nih.gov/entrez/eutils
```

호출 순서:

1. `GET /esearch.fcgi?db=pubmed&term=...&retmode=json`
2. 반환 PMID를 batch로 `GET /efetch.fcgi?db=pubmed&id=...&retmode=xml`
3. XML을 정규화하여 `Publication[]` 생성

ESummary만으로 abstract와 MeSH를 안정적으로 얻을 수 없으므로 EFetch XML을
canonical detail source로 사용한다. `tool`, `email`, 선택적 `api_key`를 server-side
환경변수로 전송하고 브라우저에 노출하지 않는다.

PubMed source URL:

```text
https://pubmed.ncbi.nlm.nih.gov/{PMID}/
```

안전장치:

- PMID는 ESearch 응답에 존재하는 값만 사용
- batch 크기 제한 및 rate-limit queue
- XML 필드 결측 시 `Not extracted`/`Not Reported`
- API key 없는 경우 낮은 요청률 유지
- abstract에 없는 population/treatment/endpoint를 mapper가 추정하지 않음

## 8. 화면별 component 구조

### App shell

- `SidebarNavigation`
- `WorkspaceHeader`
- `ApiStatusIndicator`
- `AssessmentContextHeader`

### Dashboard

- `AssessmentKpiStrip`
- `AssessmentFilterBar`
- `AssessmentTable`
- `NewAssessmentButton`

### New Assessment

- `BasicInformationSection`
- `RequestInformationSection`
- `ResearchQuestionSection`
- `AssessmentFormActions`

### Search Strategy

- `ClinicalTrialsQueryEditor`
- `PubMedConceptBuilder`
- `PubMedQueryEditor`
- `SearchReadinessPanel`
- `SearchHistory`

### Trial Landscape

- `TrialKpiStrip`
- `TrialFilterPanel`
- `TrialResultsTable`
- `TrialDetailDrawer`
- `PhaseDistribution`
- `StatusDistribution`
- `StartYearTrend`
- `CountryDistribution`
- `ReferenceTrialComparison`

### Evidence

- `LiteratureResultsTable`
- `PublicationDetailDrawer`
- `EvidenceExtractionPanel`
- `EvidenceComparisonTable`
- `SourceBadge`

### Development Strategy

- `ProposedStudyDesignEditor`
- `BasisAndSources`
- `StatisticalDesignCard`
- `ReviewStateControl`

### Feasibility

- `TimelineAssumptionsEditor`
- `CostConnectorStatus`
- `ComplexityDimensionList`

### Assessment Report

- `AssessmentSummaryHeader`
- `EvidenceSummary`
- `ProposedStudySummary`
- `FeasibilitySummary`
- `KeyEvidenceList`
- `RiskEditor`
- `DecisionPointEditor`
- `MissingEvidencePanel`
- `VersionHistory`

## 9. Phase 1 범위

### 구현

- Assessment 등록, 목록, 상태와 버전 기본 구조
- 수정 가능한 ClinicalTrials.gov/PubMed 검색 전략
- 양 API 실제 server-side 검색과 오류 상태
- trial/literature 정규화 table 및 원문 링크
- client-side filter, trial detail drawer, 기본 landscape 집계
- reference trial 및 핵심 문헌 수동 선택
- evidence/reference 비교
- 선택된 실제 근거에 기반한 규칙형 development strategy 초안
- source/basis 표시, review 상태와 사용자 수정
- 비용·통계·timeline의 명시적 미연결 상태
- 통합 report, search log, local persistence

### 보류

- 인증, 역할 기반 권한, 전자서명, 완전한 audit trail
- 실제 LLM provider와 자동 abstract extraction
- AI relevance scoring과 자동 의학적 결론
- 통계 계산 엔진, CRO 비용 DB, 내부 benchmark DB
- regulatory timeline 자동 산정
- PDF/Word export, BearDoc/CTMS 연동
- vector search와 semantic Knowledge Base
- GO/NO-GO 자동 판정

## 10. 구현 순서와 완료 조건

1. **Project/domain**: strict TypeScript 구조와 contract 작성, 타입검사 통과
2. **Dashboard/New Assessment**: form validation과 in-memory workflow 확인
3. **ClinicalTrials connector**: 실제 API fixture/parser test, 검색 성공/실패 확인
4. **Trial UX/Landscape**: table/filter/drawer/집계 검증
5. **PubMed connector**: ESearch→EFetch 실제 호출과 rate-limit 처리
6. **Literature UX**: table/detail/결측 표시 검증
7. **Selection**: reference trial/publication 추가·제거와 출처 유지
8. **Evidence comparison**: 선택 항목만 비교하고 결측을 추정하지 않음
9. **Strategy**: 근거 집계 규칙과 사용자 수정/review 상태
10. **Report**: 전 섹션 통합, key risks/decision points는 자동 결정 금지
11. **Persistence**: atomic local 저장, repository contract test
12. **Hardening**: API 오류·빈 결과·rate-limit·접근성·responsive UI 및 E2E

각 단계는 typecheck, lint, 관련 test를 통과한 후 다음 단계로 진행한다.
