# AWS Template 구현 마일스톤

기준 설계: [`008_AWS템플릿구현설계_gg.md`](./008_AWS템플릿구현설계_gg.md)

구현 계획: [`009_AWS템플릿구현계획_gg.md`](./009_AWS템플릿구현계획_gg.md)

## 완료 기준

여섯 AWS Template이 같은 `TemplateDefinition`에서 생성되고, 사용자가 보드에서 선택한 뒤 Terraform Preview, Pre-Deployment Check, 승인된 Direct Deployment, destroy cleanup까지 진행할 수 있어야 한다. Chrome에서 실제 배포 버튼을 눌러 성공 또는 실패를 관찰하고, 패턴별 소요 시간을 기록해야 한다.

## 마일스톤

| 단계 | 결과물 | 검증 | 커밋 기준 | 상태 |
| --- | --- | --- | --- | --- |
| M0 | 설계·구현 계획 문서 | 문서 placeholder scan, `git diff --check` | `Docs: AWS Template 구현 설계 및 계획 문서 추가` | 완료 |
| M1 | shared `TemplateDefinition` 계약과 여섯 Template registry | shared type test, deterministic DiagramJson test, types typecheck | `Feat: AWS Template 공통 정의 추가` | 완료 |
| M2 | 누락 ResourceDefinition과 Terraform provider/nested block 지원 | resource coverage, preview, sync, artifact safety tests | `Feat: AWS Template 리소스 및 Terraform 지원 추가` | 완료 |
| M3 | Template 카탈로그와 Workspace 적용 흐름 | web template/workspace tests, lint, typecheck | `Feat: AWS Template 카탈로그 연결` | 완료 |
| M4 | 여섯 Template Terraform Preview와 배포 시간 표시 | template preview tests, deployment duration tests, build | `Feat: AWS Template 배포 흐름 연결` | 완료 |
| M5 | Chrome 실제 apply/destroy와 검증 기록 | 여섯 패턴 live QA, console check, cleanup 확인 | `Test: AWS Template 실제 배포 검증 기록` | 진행 전 |
| M6 | PR 제출 | full checks, review-work, PR body and linked issue | `gh-create-pr` workflow | 진행 전 |

## 커밋 규칙

- 각 마일스톤은 독립적으로 빌드·테스트 가능한 상태에서 커밋한다.
- 커밋 제목은 저장소의 기존 형식인 `Type: 한국어 제목`을 사용한다.
- 다른 에이전트의 변경, `.omo/evidence`, 실행 스크립트, `docs/adr` 미커밋 파일은 해당 마일스톤에 직접 필요하지 않으면 staging하지 않는다.
- 테스트가 실패한 상태를 성공 커밋으로 남기지 않는다.

## 진행 기록

### M0

- 완료: `c1f3df6b Docs: AWS Template 구현 설계 및 계획 문서 추가`
- 설계, 범위, 공통 정의 방식, 리소스 추가 규칙, Chrome QA 조건을 기록했다.

### M1

- 완료: `c627b7ed Feat: AWS Template 공통 정의 추가`
- `TemplateDefinition`, 여섯 Template registry, deterministic `DiagramJson` builder를 추가했다.
- `@sketchcatch/types` typecheck/build/lint와 shared registry 테스트를 통과했다.

### M2

- 완료 커밋: `380f042f Feat: AWS Template 리소스 및 Terraform 지원 추가`
- `aws_amplify_app`과 Kubernetes `namespace/deployment/service`를 shared `ResourceDefinition`에 추가했다.
- 웹 리소스 카탈로그와 parameter fallback을 연결하고, 신규 `ResourceType` 라벨을 추가했다.
- Kubernetes workload 중첩 블록과 `aws/kubernetes` Terraform reference를 Preview/Sync 경로에서 처리하도록 했다.
- resource coverage, Terraform Preview, Terraform Sync, API/Web typecheck와 lint를 통과했다.

### M3

- 완료 커밋: `Feat: AWS Template 카탈로그 연결`
- 기존 수동 3개 fixture를 제거하고 여섯 `TemplateDefinition`을 Template library의 단일 원천으로 연결했다.
- 템플릿 페이지에서 선택한 `templateId`를 Workspace 시작 URL로 전달하고, project slug 기반 이름으로 DiagramJson을 생성한다.
- 기존 덮어쓰기 백업 경계와 Workspace 템플릿 모달 흐름은 유지했다.
- template library, templates page, web typecheck를 통과했다.

### M4

- 완료 커밋: `Feat: AWS Template 배포 흐름 연결`
- 여섯 TemplateDefinition을 모두 Terraform Preview로 생성하는 coverage를 추가했다.
- VPC/subnet을 Preview에서 누락시키던 design kind를 deployable resource kind로 정리했다.
- hyphen이 포함된 deterministic Terraform resource name reference가 문자열로 감싸지지 않도록 보강했다.
- DeploymentPanel에 성공·실패·진행 중 상태의 `분 초` 소요 시간 표시와 실시간 갱신을 추가했다.
- template preview coverage, deployment duration tests, API/Web typecheck와 lint를 통과했다.

### M5

- 시작 전

### M6

- 시작 전
