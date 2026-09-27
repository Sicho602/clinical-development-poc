# Clinical Development Explorer

신규 임상개발 및 도입품목 검토를 표준화하는 evidence-based workflow PoC입니다.

## Prerequisites

- Node.js 20 이상
- npm 10 이상

## Local setup

```bash
copy .env.example .env.local
npm install
npm run dev
```

개발 서버는 기본적으로 `http://localhost:3000`에서 실행됩니다.

## Quality checks

```bash
npm run typecheck
npm run test
npm run build
```

## Architecture

설계 원칙, 데이터 모델, 외부 API 연동 방식, 화면 구조와 단계별 범위는
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)를 참고하세요.

## Data policy

- ClinicalTrials.gov와 PubMed 식별자는 실제 API 응답만 사용합니다.
- 확인되지 않은 수치나 endpoint는 생성하지 않습니다.
- 통계·비용 엔진 미연결 상태는 UI에서 명시적으로 표시합니다.
- 주요 구조화 결과는 source reference와 review 상태를 함께 저장합니다.
