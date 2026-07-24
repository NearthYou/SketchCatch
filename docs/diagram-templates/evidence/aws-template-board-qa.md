# AWS Template Design 실화면 QA

## 목적

`015_AWS템플릿Design시각레이어설계_gg.md`와 `016_AWS템플릿Design레이어구현계획_gg.md`의 최종 결과를 로그인된 실제 Architecture Board에서 확인한 기록이다.

검증 범위는 다음 세 가지다.

1. 기존 103개 deployable Resource와 Terraform 의미 그래프가 그대로 유지되는가
2. 왼쪽 Resource panel의 실제 Design·Region·Availability Zone·Group 항목이 presentation-only node로 추가되는가
3. 여섯 Template가 40px grid 위에서 촘촘하고 정렬된 상태로 한 화면에 보이는가

## 실행 조건

- 일자: 2026-07-13
- 브라우저: 사용자 로그인이 유지된 로컬 Chrome 세션
- 실제 viewport: `948 × 897`, DPR `2`
- 생성 경로: `http://127.0.0.1:3000/workspace/new?mode=template&templateId={templateId}`
- Board 경로: `http://127.0.0.1:3000/workspace?projectId={projectId}&projectName={projectName}`
- 기준 구현 커밋: `5cac9a72` (`Feat: AWS 템플릿 보드 레이아웃 정렬`)
- 자동 검사: Template layout, Catalog materialization, sibling collision, Area containment, edge obstacle routing

## 보존한 의미 계약

| 구분 | 수 | 결과 |
| --- | ---: | --- |
| deployable Resource | 103 | 기존과 동일, PASS |
| presentation-only Design node | 28 | 실제 Catalog item 사용, PASS |
| 전체 Board node | 131 | `103 + 28`, PASS |
| semantic relationship | 42 | 기존 ID/source/target/label 유지, PASS |
| presentation-only edge | 7 | Terraform graph에서 제외, PASS |
| 전체 저장 edge | 49 | `42 + 7`, PASS |

Region과 Availability Zone은 기존 Resource panel의 `aws-region`, `aws-availability-zone` Catalog item을 사용한다. Template materialization 때만 `kind: "design"`과 parameterless presentation metadata를 적용하므로, 사용자가 panel에서 직접 끌어 놓는 기존 Resource 동작은 바뀌지 않는다.

`Source Repository`는 실제 Catalog item `design-source-repository`와 프로젝트에 이미 있던 `Res_Git-Repository_48_Light.svg`를 사용한다. 임시 emoji, 가짜 AWS node, 복제한 Catalog item은 없다.

## 실제 생성 프로젝트와 수치

| Template | QA 프로젝트 | projectId | Resource | Design | Board node | 저장 edge | 화면 edge | 숨김 containment |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Static Web Hosting | `QA Static Compact` | `c07ec2ae-64a8-4714-982c-ad7da3a1f277` | 6 | 2 | 8 | 7 | 7 | 0 |
| Minimal Serverless API | `QA Minimal Compact` | `c674a054-7fce-4ae1-af66-544e692e8973` | 12 | 2 | 14 | 7 | 6 | 1 |
| Full Serverless Web App | `QA Full Compact` | `ffd3ab24-d3a2-48c4-976b-b3d111dd4090` | 16 | 10 | 26 | 8 | 8 | 0 |
| 3-Tier Web App | `QA Three Tier Compact` | `55738de5-efa4-4951-9a8e-44af3e0faff6` | 30 | 4 | 34 | 11 | 5 | 6 |
| ECS Fargate Container App | `QA ECS Compact` | `5c0b2b25-b26a-44f3-9da6-3cc4e5ac43e5` | 20 | 6 | 26 | 8 | 6 | 2 |
| EKS Container App | `QA EKS Compact` | `a2136cc1-b274-498a-a6a7-b62d563fa1c8` | 19 | 4 | 23 | 8 | 4 | 4 |
| **합계** |  |  | **103** | **28** | **131** | **49** | **36** | **13** |

`contains`와 `hosts`는 Area 계층을 중복 선으로 표시하지 않도록 `toFlowEdges`에서 의도적으로 숨긴다. 따라서 저장 edge 49개 중 containment 13개를 제외한 36개가 실제 화면에 보이는 것이 정상이다.

## Template별 12회 QA 기준

아래 `C1`~`C12`를 여섯 Template에 각각 적용했다. 전체 72개 확인 항목이다.

| ID | 확인 항목 | 확인 방법 |
| --- | --- | --- |
| C1 | 로그인 상태에서 Template 새 프로젝트 생성이 완료된다 | `workspace/new`에서 프로젝트 이름 입력 후 `Template으로 시작` 실행 |
| C2 | Board node 수가 Resource와 Design 합계와 같다 | 실제 `.react-flow__node` 수와 정의 대조 |
| C3 | 103개 deployable Resource가 실제 Catalog key/type/icon/kind를 유지한다 | materialization 계약과 실화면 아이콘 대조 |
| C4 | 28개 Design node가 실제 Catalog item이고 Terraform parameter가 없다 | presentation contract와 저장 schema 대조 |
| C5 | 필요한 User/Client·Internet·Source Repository가 주 흐름 앞에 놓인다 | 실화면 요청선과 PNG 기준 대조 |
| C6 | Region→VPC→AZ→Subnet 계층이 필요한 Template에 정확히 보인다 | Area header와 child footprint 확인 |
| C7 | Frontend·Identity·API·Compute·Data/Ops·Global IAM 같은 Group이 역할별로 분리된다 | Group parent와 실화면 열 배치 확인 |
| C8 | 주 요청/워크로드 흐름과 support rail이 섞이지 않는다 | PNG 방향과 실화면 edge 흐름 대조 |
| C9 | 모든 authored position과 Area size가 40px grid에 정렬된다 | `template-layout-contract.test.ts` 검사 |
| C10 | sibling caption 충돌이 없고 모든 child가 parent Area 안에 들어간다 | collision/containment integration 검사 |
| C11 | 보이는 edge가 다른 Resource caption을 가로지르지 않는다 | obstacle routing integration 검사와 실화면 확인 |
| C12 | 저장 viewport에서 전체 구조와 Workspace 기본 도구가 함께 보인다 | 실제 `948 × 897` 화면에서 fit과 toolbar 확인 |

## 결과

| Template | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | C11 | C12 | 최종 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Static Web Hosting | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Minimal Serverless API | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Full Serverless Web App | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 3-Tier Web App | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| ECS Fargate Container App | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| EKS Container App | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

### 화면별 확인 메모

| Template | Design/Area 계층 | compact 배치에서 확인한 흐름 |
| --- | --- | --- |
| Static Web Hosting | User/Client는 root, S3 계열은 Region 내부 | User → CloudFront → S3를 한 줄로 읽고 OAC·Public Access·Policy가 가까운 support 위치에 정렬됨 |
| Minimal Serverless API | User/Client는 root, API·Lambda·DynamoDB는 Region 내부 | API Gateway 세로 단계 → Lambda → DynamoDB가 짧은 거리로 연결되고 IAM은 Region 밖에 분리됨 |
| Full Serverless Web App | Source/User는 root Group, Region 안에 역할별 5개 Group, Global IAM은 root | Source/User → Frontend → Identity/API → Compute → Data/Ops 순서가 한 화면에서 읽힘 |
| 3-Tier Web App | Region→VPC→AZ A/B→Public/App/DB Subnet | A/B 열과 Public/App/DB 행이 각을 맞추고 왼쪽 route rail이 일정 간격으로 정렬됨 |
| ECS Fargate Container App | Region 안 VPC와 Definition/Ops, VPC 안 AZ A/B와 ECS Cluster, Global IAM은 root | User → ALB와 Cluster workload가 가깝게 모이고 Definition/Ops·IAM support가 오른쪽/상단으로 분리됨 |
| EKS Container App | Region→VPC→AZ A/B와 Cluster→Namespace, Global IAM은 root | Network 상단, EKS workload 하단, IAM 우측의 세 구역이 겹치지 않고 정렬됨 |

## 최종 PASS 전 수정한 문제

- ECS: `y=720..802`의 Internet Gateway·Route Table·Route A/B caption이 `y=800`에서 시작하던 AZ A와 2px 겹쳐 AZ A/B를 `y=840`으로 이동했다.
- ECS: `task → execution-role` edge가 중간 Task Role caption을 통과해 Task Role을 두 번째 IAM 열로 옮기고 `top → bottom` handle을 사용했다.
- EKS: network header caption과 AZ A 경계가 겹쳐 AZ A/B 시작점을 `y=400`으로 맞췄다.
- Full Serverless: Frontend→API와 User→User Pool edge가 Identity/API node를 관통하지 않도록 bottom rail과 top rail handle을 고정했다.

수정은 position, size, parent presentation metadata, viewport, edge handle에 한정했다. Resource value, Terraform type, relationship ID/source/target/label은 바꾸지 않았다.

## 자동 회귀 근거

focused suite 60개가 통과했다.

```bash
/Users/lgg/.nvm/versions/node/v24.18.0/bin/node apps/web/node_modules/tsx/dist/cli.mjs --test \
  packages/types/src/template-definitions.test.ts \
  packages/types/src/template-layout-contract.test.ts \
  packages/types/src/template-presentation-contract.test.ts \
  apps/web/features/resource-settings/catalog.test.ts \
  apps/web/features/resource-settings/template-resource-materializer.test.ts \
  apps/web/features/resource-settings/template-sibling-collision-integration.test.ts \
  apps/web/features/resource-settings/template-sibling-collision-layout.test.ts \
  apps/web/features/diagram-editor/area-nodes.test.ts
```

핵심 결과는 다음과 같다.

- semantic hash 6/6 동일
- deployable Resource 103개 동일
- 실제 Catalog materialization PASS
- sibling collision 0건
- parent Area 이탈 0건
- visible edge caption crossing 0건
- authored Resource/Design position과 Area size 40px grid 정렬 PASS

## 범위 밖 항목

- Terraform plan/apply/destroy와 AWS mutation은 실행하지 않았다.
- 배포 API·승인·상태 전환 로직은 변경하거나 실행하지 않았다.
- QA용 로컬 프로젝트 여섯 개는 위 projectId로 추적할 수 있다.
