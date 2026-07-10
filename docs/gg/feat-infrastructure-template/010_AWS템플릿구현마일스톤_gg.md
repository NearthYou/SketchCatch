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
| M5a | AWS 실행 Role 등록과 verified connection 복구 | Chrome AWS 콘솔 Role 확인, STS AssumeRole, SketchCatch 연결 검증 | `Test: AWS Template 배포 연결 검증` | 완료 |
| M5b | Template Board를 기존 Resource 카탈로그 노드로 전환 | 6개 Template icon/label/style, fallback 0개, Chrome 시각 QA | `Fix: AWS Template 카탈로그 Resource 노드 재사용` | 완료 |
| M5c | Chrome 실제 apply/destroy와 검증 기록 | 여섯 패턴 live QA, console check, cleanup 확인 | `Test: AWS Template 실제 배포 검증 기록` | 진행 전 |
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

### M5a

- 완료: 2026-07-11 KST
- 로그인된 AWS 콘솔에서 기존 Role과 trust policy를 먼저 확인하고 재사용 가능한 Role을 SketchCatch verified connection에 연결한다.
- 기존 Role로 충족할 수 없는 필수 권한만 보강하며, 중복 Role을 임시로 만들지 않는다.
- 기존 `brainboard` Role은 다른 외부 계정을 신뢰하고 `ReadOnlyAccess`만 보유하므로 SketchCatch용으로 재사용하지 않았다.
- 기존 verified connection이 참조하던 `SketchCatchTerraformExecutionRole`을 복구하고, 해당 connection의 External ID를 요구하는 trust policy를 등록했다.
- 로컬 caller에서 실제 `sts:AssumeRole`과 임시 자격 증명의 `sts:GetCallerIdentity`를 실행해 모두 통과했다.
- 이 단계에서는 `AdministratorAccess` 같은 과도한 정책을 붙이지 않았다. 여섯 Template의 실제 apply용 최소권한 정책은 M5b 완료 후 M5c 진입 전에 별도로 검증한다.

### M5b

- 완료: 2026-07-11 KST
- 사용자의 순서에 따라 M5a Role 등록과 STS 검증을 먼저 끝낸 뒤 코드를 수정했다.
- `TemplateDefinition`의 Terraform identity는 유지하면서, Template 공개 경계에서 기존 Resource 카탈로그와 `createDiagramNodeFromPayload` 생성 경로를 재사용하도록 수정했다.
- 여섯 Template의 47개 고유 Terraform resource type은 모두 기존 카탈로그에 존재했으며, 새 fallback이나 임시 Resource를 추가하지 않았다.
- catalog icon, label, size, style, parameter default와 drag/drop 기본 표시 이름을 적용하고 Terraform logical name은 내부 `resourceName`으로 분리했다. Template이 명시한 parameter 값은 catalog default보다 우선한다.
- VPC, Subnet, Security Group, Auto Scaling Group 같은 area Resource도 `diagramLabel`을 우선 표시하도록 보강했다.
- Architecture Board에서 Raw Terraform Detail 노드는 허용하지 않는다. 필요한 세부 resource type이 카탈로그에 없으면 먼저 정식 카탈로그 Resource로 추가한다.
- TDD에서 bare S3 icon과 Workspace 시작 경로가 실패하는 Red, area Resource가 `*_workspace`를 표시하는 Red를 각각 확인한 뒤 Green으로 전환했다.
- 관련 33 tests, Web typecheck, lint, `git diff --check`를 통과했다.
- Chrome에서 양쪽 패널을 접고 여섯 Template을 모두 열어 노드 수와 icon 수가 각각 `6/6`, `12/12`, `16/16`, `30/30`, `18/18`, `19/19`임을 확인했다. 모든 보드에서 일반 `AWS` fallback tile 0개, `*_workspace` 가시 label 0개, 빈 label 0개, viewport 밖으로 잘린 node 0개였다.
- 최종 소스와 여섯 fresh capture를 대상으로 한 독립 설계·기능 리뷰와 시각 정밀 리뷰가 모두 `PASS`했다.

### M5c

- M5a와 M5b가 완료된 뒤 실제 apply/destroy를 시작한다.
- Lambda, API Gateway stage/permission, IAM assume policy, 3-Tier launch template/AMI lookup, ECS task/network defaults, EKS node policies를 기본 정의에 반영했다.
- `demo_web_service_with_rds` live profile에 여섯 Template의 확장 Resource와 Kubernetes workload를 허용하고, Template 보드에는 해당 profile을 자동 추천하도록 연결했다.
- 실제 Dashboard의 시작 템플릿 화면도 같은 registry를 사용해 여섯 개 카드와 Workspace 선택 URL을 노출한다.
- 여섯 Template 모두 실제 Terraform CLI `init`과 `validate`를 통과했다.
- 남은 검증: Chrome live plan/apply/destroy, AWS 연결 상태와 패턴별 배포 시간 기록.

### M6

- 시작 전
