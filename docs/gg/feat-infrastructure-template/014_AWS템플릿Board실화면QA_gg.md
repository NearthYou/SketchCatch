# AWS Template Board 실화면 QA

> 이 문서는 Design presentation layer 도입 전의 103개 deployable Resource 배치 기준 기록이다. Region·AZ·Group·User/Client·Source Repository를 포함한 현재 최종 QA는 `017_AWS템플릿Design실화면QA_gg.md`를 본다.

## 목적

`../old/feat-infrastructure-template/007_AWS템플릿패턴_gg.md`의 여섯 PNG 패턴과 `013_AWS템플릿보드배치매핑_gg.md`의 배치 계약이 실제 Architecture Board에서도 같은 구조로 보이는지 확인한 기록이다.

검증 대상은 화면 표현뿐이다. Resource ID·종류·수·Terraform value·relationship ID/source/target/label·API·배포 동작은 바꾸지 않는다.

## 실행 조건

- 일자: 2026-07-13
- 브라우저: 로그인된 로컬 Chrome 세션
- 화면: 데스크톱 `1920 × 900`, Resource panel과 Inspector를 기본 상태로 연 Architecture Board
- 진입 주소: `http://127.0.0.1:3000/workspace?templateId={templateId}&projectName=Template%20QA`
- 기준 커밋: `908cd797` (`Feat: AWS 템플릿 보드 배치 반영`)

## PNG와 Template 대응

| Template | `templateId` | 실제 PNG | 화면에서 확인한 핵심 구조 |
| --- | --- | --- | --- |
| Static Web Hosting | `static-web-hosting` | `image-3.png` | CloudFront → S3 수평 요청 경로와 하단/우측 설정 rail |
| Minimal Serverless API | `minimal-serverless-api` | `image-4.png` | API Gateway 내부 세로 단계 → Lambda → DynamoDB |
| Full Serverless Web App | `full-serverless-web-app` | `image-6.png` | Frontend / Identity / API / Compute / Data-Ops 가로 열 |
| 3-Tier Web App | `three-tier-web-app` | `image-2.png` | A/B 두 열과 Public / App / DB 세 행, 좌측 route rail |
| ECS Fargate Container App | `ecs-fargate-container-app` | `image-1.png` | VPC network 상단, ECS Cluster workload 하단, Definition/Ops 우측 rail |
| EKS Container App | `eks-container-app` | `image-5.png` | VPC → EKS Cluster → Namespace 중첩과 우측 IAM support rail |

## 실제 왼쪽 Resource catalog 사용 확인

모든 Template는 `materializeCatalogResourceNode`를 통해 먼저 `source: "resource-settings-panel"` Catalog resource로 node를 만들고, 기존 Template의 역할 label만 표시한다. 역할 label은 Terraform logical name이나 임시 아이콘이 아니다.

| Template | Board node 수 | Catalog key/type/icon/kind 일치 | 가짜 node·아이콘 | 결과 |
| --- | ---: | --- | --- | --- |
| Static Web Hosting | 6 | 6 / 6 | 0 | PASS |
| Minimal Serverless API | 12 | 12 / 12 | 0 | PASS |
| Full Serverless Web App | 16 | 16 / 16 | 0 | PASS |
| 3-Tier Web App | 30 | 30 / 30 | 0 | PASS |
| ECS Fargate Container App | 20 | 20 / 20 | 0 | PASS |
| EKS Container App | 19 | 19 / 19 | 0 | PASS |
| **합계** | **103** | **103 / 103** | **0** | **PASS** |

PNG에만 있는 Viewer, Client, Route 53, ACM, AZ frame, Private Subnet, Ingress, Pod, Container, ECR, CloudWatch 같은 노드는 이번 Template 정의에 없으므로 임시로 만들지 않았다. 필요한 node가 Catalog에 없을 때 먼저 Catalog를 확장한다는 `007`의 규칙은 유지한다.

## Template별 12회 QA 기준

아래 `C1`~`C12`를 각 Template에 독립적으로 적용했다. 따라서 Template 하나당 12개, 전체 72개의 확인 항목이다.

| ID | 확인 항목 | 확인 방법 |
| --- | --- | --- |
| C1 | 로그인된 실제 Board가 templateId로 열린다 | 로컬 Board URL 진입과 렌더 확인 |
| C2 | 정의된 Resource 수가 실제 Board와 같다 | DOM/Board resource count 대조 |
| C3 | 모든 node가 실제 Catalog key/type/icon/kind와 일치한다 | materialization 결과 대조 |
| C4 | raw Terraform logical name·가짜 AWS tile·임시 emoji가 없다 | 화면 label과 node source 확인 |
| C5 | PNG의 주 요청/워크로드 흐름 방향이 보인다 | 실화면 screenshot 비교 |
| C6 | VPC·API·Cluster·Namespace 등 필요한 parent/group 안에 child가 있다 | parent와 visual footprint 확인 |
| C7 | IAM·Policy·Permission·Logs·Definition support가 main flow와 분리돼 있다 | 실화면 screenshot 비교 |
| C8 | 원본의 행·열·layer 순서가 유지된다 | PNG와 Board screenshot 비교 |
| C9 | 같은 parent의 sibling caption과 node가 겹치지 않는다 | Board screenshot 및 collision integration test |
| C10 | child의 visual footprint가 parent area 밖으로 잘리지 않는다 | Board screenshot 및 containment test |
| C11 | non-containment edge가 다른 resource caption을 가로지르지 않는다 | Board screenshot 및 routing integration test |
| C12 | 저장된 viewport에서 전체 구조가 보이고 비정상적인 빈 공간이 없다 | 초기 Board screenshot 비교 |

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

| Template | C5~C8에서 확인한 배치 | C6에서 확인한 container/group |
| --- | --- | --- |
| Static Web Hosting | CloudFront → S3와 OAC·Public Access·Policy support가 main row를 방해하지 않는다 | root layout만 사용 |
| Minimal Serverless API | API 내부 단계가 세로로 이어지고 Lambda → DynamoDB가 오른쪽으로 이어진다 | API Gateway가 route/method/integration/deployment/stage를 포함 |
| Full Serverless Web App | Frontend·Identity·API·Compute·Data/Ops가 왼쪽에서 오른쪽 순으로 읽힌다 | API Gateway가 authorizer와 API 단계들을 포함 |
| 3-Tier Web App | A/B 열과 Public/App/DB 행, 각 tier의 좌측 route rail이 보인다 | VPC 안 subnet, ASG 안 Launch Template, DB subnet 안 DB support를 포함 |
| ECS Fargate Container App | network/ingress와 cluster workload가 VPC 안에서 분리되고 rail이 오른쪽에 놓인다 | VPC 안 subnet과 ECS Cluster, Cluster 안 ECS Service/Task Security Group을 포함 |
| EKS Container App | AWS infra → EKS Cluster → Namespace workload가 중첩되고 IAM rail이 오른쪽에 놓인다 | VPC 안 Cluster, Cluster 안 Namespace, Namespace 안 Deployment/Service를 포함 |

## 최종 전 수정한 시각 문제

최종 PASS 전에는 다음 표현 문제를 발견해 배치 계약 안에서만 고쳤다. Resource 종류·수·값·relationship 의미는 바꾸지 않았다.

- Static: `bucket-policy → bucket` line이 Public Access Block을 가로지르지 않도록 우측 rail routing으로 변경했다.
- Full Serverless: Lambda Permission이 API Gateway area와 겹치지 않도록 Compute 상단 support 위치로 옮겼다.
- 3-Tier: route association caption 간격과 AMI의 parent containment를 보정했다.
- ECS: `task → log-group` line이 IAM role을 가로지르지 않도록 Log Group을 우측 Ops 위치로 옮기고 handle을 조정했다.

## 자동 회귀 근거

다음 focused suite 39개가 통과했다. semantic hash는 visual-only position/group/viewport/edge handle 변경을 제외한 Resource와 relationship 의미가 그대로임을 확인한다.

```bash
/Users/lgg/.nvm/versions/node/v24.18.0/bin/node apps/web/node_modules/tsx/dist/cli.mjs --test \
  packages/types/src/template-definitions.test.ts \
  packages/types/src/template-layout-contract.test.ts \
  apps/web/features/diagram-editor/area-nodes.test.ts \
  apps/web/features/resource-settings/template-resource-materializer.test.ts \
  apps/web/features/resource-settings/template-sibling-collision-integration.test.ts \
  apps/web/features/resource-settings/template-sibling-collision-layout.test.ts
```

핵심 검증은 다음과 같다.

- `template-layout-contract.test.ts`: 여섯 Template의 좌표, parent, size, presentation area, viewport, edge handle/routing, semantic hash 고정
- `template-sibling-collision-integration.test.ts`: 실제 Board render node 기준 sibling collision, parent containment, edge caption crossing 확인
- `template-resource-materializer.test.ts`: authored layout을 덮어쓰지 않고 실제 Catalog resource를 materialize하는지 확인
- `area-nodes.test.ts`: Template의 presentation area가 일반 Board의 동일 Resource 동작을 전역으로 바꾸지 않는지 확인

## 범위 밖 항목

- Terraform plan/apply/destroy, AWS mutation, API 호출, 승인 흐름은 실행하거나 변경하지 않았다.
- 모바일 재배치는 이 Board 배치 계약의 범위가 아니며, 이번 QA는 기준 PNG와 같은 데스크톱 Board 화면을 대상으로 한다.
