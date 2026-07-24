# 문서 안내

SketchCatch 문서는 **SSOT(Single Source of Truth)** 기준으로 관리한다. 팀원이 AI를 활용해 분업할 때도 아래 문서의 책임 경계를 먼저 확인하고, 같은 이름과 같은 계약을 사용한다.

## 필수 문서

| 문서 | 책임 | 언제 읽는가 |
| --- | --- | --- |
| [제품 방향](./product.md) | 제품 정의, MVP 목표, 핵심 서비스 여정, 기능 우선순위, 3주 로드맵 | 무엇을 만들지, 이번 작업이 MVP에 포함되는지 판단할 때 |
| [상세 기획서](./000_상세기획서.md) | 기획자와 개발자가 함께 읽는 서비스 흐름, 기능 요구사항, 현재 구현 상태, 책임 분배 | 제품 방향을 구현 가능한 업무 단위로 풀어 이해해야 할 때 |
| [데이터 모델](./data-models.md) | DB/API/프론트/AI/배포 공통 타입과 필드명 | DTO, DB schema, Zod schema, 프론트 상태를 바꿀 때 |
| [아키텍처](./architecture.md) | 모노레포 구조, 앱 경계, 저장소 경계, Terraform/AWS 실행 위치 | API, storage, worker, 인프라 실행 경계를 정할 때 |
| [개발 가이드](./development.md) | 로컬 실행, Git flow, 팀 AI 협업 규칙, PR 체크 | 구현 전후 작업 절차와 검증 기준을 확인할 때 |
| [배포 운영 문서](./deployment.md) | 운영 배포, Direct Deployment Path, Git/CI/CD Deployment Path, cleanup 절차 | Terraform Plan/Apply/Destroy, Git/CI/CD handoff, AWS 연결, 운영 배포를 다룰 때 |
| [다이어그램 패턴 지식 저장소](./diagram-templates/README.md) | 검증된 AWS 패턴, Amazon Q Business 인덱싱 문서, S3 패키지와 검증 절차 | Architecture Draft의 패턴 근거를 추가하거나 Q Business 데이터 소스를 동기화할 때 |
| [에이전트 진행 로그](../agent-progress.md) | 현재 검증 상태, 최근 작업, 다음 행동 | Codex/AI 에이전트가 이전 세션을 이어받을 때 |
| [에이전트 진행 아카이브](./agent-history/) | 오래된 세션 기록 보관 | 과거 검증 증거가 명시적으로 필요할 때 |
| [하네스 기능 목록](../feature_list.json) | 에이전트 하네스 작업 상태와 검증 증거 | 작업 범위와 완료 증거를 기계 가독 형태로 확인할 때 |
| [루트 README](../README.md) | 저장소 빠른 시작 | 처음 저장소를 실행할 때 |

## SSOT 우선순위

문서가 서로 충돌하면 아래 순서로 판단한다.

1. 루트 `AGENTS.md`와 가장 가까운 하위 `AGENTS.md`
2. 이 문서에 명시된 canonical 문서
3. 에이전트 하네스 상태 파일(`agent-progress.md`, `feature_list.json`, `session-handoff.md`)과 필요한 경우 `docs/agent-history/`
4. `packages/types/src/index.ts`와 API Zod schema
5. 목적별 공용 참고 자료(`docs/adr`, `docs/diagram-templates`, `docs/diagram-layout-reference`)
6. 오래된 작업 로그와 Git history

## 문서 정리 기준

- 제품 전략, MVP 범위, canonical 로드맵, 리스크는 [제품 방향](./product.md)에 모은다.
- 기획자/개발자 공통 이해를 위한 상세 기획서는 [상세 기획서](./000_상세기획서.md)에 두되, 계약 충돌 시 canonical 문서를 우선한다.
- 공통 타입, API DTO, DB 모델, 프론트 상태 이름은 [데이터 모델](./data-models.md)에 모은다.
- 기술 스택, 저장 기준, 실행 경계, ADR 수준 결정은 [아키텍처](./architecture.md)에 모은다.
- Git 흐름, 팀 AI 작업 순서, PR 체크리스트는 [개발 가이드](./development.md)에 모은다.
- 운영 배포, Direct Deployment Path, Git/CI/CD Deployment Path, cleanup 절차는 [배포 운영 문서](./deployment.md)에 모은다.
- 검증된 Architecture Draft 패턴과 Amazon Q Business 인덱싱 패키지는 [다이어그램 패턴 지식 저장소](./diagram-templates/README.md)에 모은다.
- 에이전트 세션 상태, 완료 증거, handoff는 루트 하네스 파일(`agent-progress.md`, `feature_list.json`, `session-handoff.md`, `clean-state-checklist.md`)에 짧게 남긴다. 오래된 세션 기록은 `docs/agent-history/`로 이동한다.
- 같은 내용을 새 문서로 복제하지 않는다. 먼저 canonical 문서를 갱신한다.
- 오래된 범위 문구는 남겨두지 않는다. MVP 목표가 바뀌면 canonical 문서에서 즉시 갱신한다.

## 보조 자료

| 폴더 | 성격 | 규칙 |
| --- | --- | --- |
| [`docs/adr`](./adr/README.md) | 되돌리기 어렵고 맥락이 필요한 결정 | 결정이 굳어진 경우에만 추가한다. |
| [`docs/diagram-templates`](./diagram-templates/README.md) | Architecture Pattern, Brainboard fixture, Board QA 근거 | 런타임 계약은 canonical 문서와 shared type을 따른다. |
| [`docs/diagram-layout-reference`](./diagram-layout-reference/README.md) | Compiler layout 기준 이미지와 평가 보고서 | 자동 생성 결과와 수동 검토 근거를 구분한다. |
| [`docs/agent-history`](./agent-history/) | 오래된 에이전트 작업·검증 기록 | 현재 상태는 루트 하네스 파일을 우선한다. |

보조 자료는 현재 계약의 source of truth가 아니다. 새 자료는 담당자 이름이 아니라 목적과 데이터 성격이 드러나는 공용 경로에 둔다.
