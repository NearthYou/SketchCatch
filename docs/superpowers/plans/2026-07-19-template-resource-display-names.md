# Template Resource 표시 이름 단순화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 적용 가능한 AWS Template 29개의 Resource와 사용자에게 보이는 Area 이름을 짧고 직관적인 한 줄 이름으로 정리하고, Board·Resource 패널·미리보기·설명에서 같은 이름을 사용한다.

**Architecture:** 새 이름 계층이나 생성기를 추가하지 않고 기존 `DiagramNode.label`을 단일 진실 공급원으로 사용한다. Terraform block/type/local name, provider-side name, 설정, 관계와 배치는 보존한다. Brainboard source fixture에서 이름과 주소를 분리할 때는 기존 `reviewed-override` 증거를 사용한다. Board의 기존 대문자 렌더링은 유지한다.

**Tech Stack:** TypeScript, Node test runner, Next.js, pnpm, Terraform CLI, WebP Board capture assets.

## Global Constraints

- 승인된 설계는 `docs/superpowers/specs/2026-07-19-template-resource-display-names-design.md`다.
- 직접 제작 6개와 성공한 Brainboard 23개만 대상이다. 실패 기록 1개는 수정하지 않는다.
- Resource ID, `resourceName`, `resourceType`, `terraformBlockType`, Terraform source, values, edge, geometry, parent, provider-side name/tag는 바꾸지 않는다.
- 새 `displayName` 필드, 전역 이름 생성기, 이름 규칙 validator 또는 이름 규칙 전용 테스트를 만들지 않는다.
- Resource 이름은 Template 안에서 고유하고 한 줄이어야 한다. Area 제목의 기존 중복은 허용한다.
- AWS 공식 유형/약어와 `Public`, `Private`, `NAT`, `AZ`, `Worker Node`는 필요한 곳에서 영어를 유지하고 역할만 짧은 한국어로 쓴다.
- `apps/web/features/diagram-editor/resource-node-display-label.ts`의 대문자 변환은 수정하지 않는다.
- 원본 캡처 JSON과 실패 증거는 수정하지 않는다.
- 공유 작업 트리의 다른 변경은 stage하거나 되돌리지 않는다. 각 커밋은 이 계획의 파일만 pathspec으로 선별한다.

---

## Task 1: Resource 패널이 Template label을 기본 이름으로 사용

**Files:**

- Modify: `apps/web/features/workspace/resource-list-summary.test.ts`
- Modify: `apps/web/features/workspace/resource-list-summary.ts`

- [ ] `resource-list-summary.test.ts`에 `label: "EKS Cluster IAM Role"`, `resourceName: "iam-cluster"`인 Resource를 만들고 `displayName === "EKS Cluster IAM Role"`, `terraformAddress === "aws_iam_role.iam-cluster"`를 함께 검증하는 회귀 테스트를 추가한다.
- [ ] 아래 우선순위로 구현해 테스트를 통과시킨다.

```ts
function getTerraformResourceDisplayName(node: DiagramNode, resourceType: string): string {
  return node.label.trim() || node.parameters?.resourceName?.trim() || resourceType;
}
```

- [ ] Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/resource-list-summary.test.ts`
  Expected: 새 회귀 테스트를 포함해 0 failures.
- [ ] Commit only the two files: `Fix: Resource 목록에 사용자 표시 이름 우선 적용`

## Task 2: 승인된 AWS onboarding 파일럿 적용

**Files:**

- Modify: `packages/types/src/brainboard-templates/sources/training-aws-onboarding.ts`

- [ ] Resource 18개와 presentation 4개의 `label`을 설계 문서의 승인표대로 바꾼다.
- [ ] 이름이 달라진 모든 `exact-title`을 `reviewed-override`로 바꾼다. 같은 Terraform type의 다른 Resource가 `single-residual`이면 그 전제가 깨지는 항목도 `reviewed-override`로 바꾼다. 주소와 `resourceName`은 그대로 둔다.
- [ ] 이름 수정 전에 29개 materialized Diagram에서 `label`만 제외한 projection과 23개 Brainboard source에서 `label`, `addressMapping`만 제외한 projection을 SHA-256으로 저장한다. 이 projection에는 node ID/type/config/geometry/parent, edge/route, Terraform file code/hash와 raw capture hash가 모두 포함되어야 한다.
- [ ] Run: `pnpm --filter @sketchcatch/types exec tsx --test src/brainboard-templates/workspace-terraform-normalization.test.ts`
  Expected: registry import 시 23개 source의 address mapping/full source validation이 실행되고 0 failures.
- [ ] Run: `pnpm --filter @sketchcatch/web exec tsx --test features/architecture-board-compiler/architecture-board-integrations.test.ts`
  Expected: 성공한 Brainboard 23개가 materialize되고 usable Template 29개 검토가 통과.
- [ ] Run: `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/palette-backed-template-resources.test.ts`
  Expected: 29 available Templates, no binding/materialization failure.
- [ ] 실제 Board에서 `EKS VPC`, `Public Subnet A/B`, `EKS Cluster IAM Role`, `ECR 읽기 권한 연결`을 확인한다. Board 영문 대문자 표시는 기존 동작이며 오류가 아니다.
- [ ] Commit only the source file: `Fix: AWS onboarding Resource 이름 정리`

## Task 3: 나머지 Brainboard 22개 이름 적용

**Files:**

- Modify: `packages/types/src/brainboard-templates/sources/aws-asg-load-balancer-vpc.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-bastion.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-cost-monitoring.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-dashcam-video-processing.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-ec2-vpc-subnet.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-ecs-fargate.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-elastic-beanstalk.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-fsx.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-iam-users.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-jenkins-ec2.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-kubernetes-native-cnis.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-load-balancer-target-group.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-multi-account-management.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-network-landing-zone.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-rds.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-rest-api-documentdb.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-s3-api-gateway.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-secure-s3-bucket.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-serverless-cdn.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-three-tier-database.ts`
- Modify: `packages/types/src/brainboard-templates/sources/aws-vpc-subnets-security-groups-2az.ts`
- Modify: `packages/types/src/brainboard-templates/sources/cross-account-aws-s3.ts`
- Modify: `apps/web/features/resource-settings/palette-backed-template-resources.test.ts`

- [ ] 아래 Appendix A의 파일별 확정 이름을 `nodes[].label`에 적용한다. 중복 label은 Appendix의 address, node ID 또는 설명으로 구분한다.
- [ ] 이름이 달라진 `exact-title`은 모두 `reviewed-override`로 바꾼다. 각 파일에서 같은 `terraformResourceType`이 둘 이상이면 해당 type의 `single-residual`도 `reviewed-override`로 바꾼다. 기존 `reviewed-override`는 유지한다.
- [ ] 각 Template과 `terraformResourceType`별로 mapping을 다시 집계한다. `exact-title`은 새 label과 local name이 실제로 같은 경우에만 남고, `single-residual`은 해당 type의 유일한 non-exact mapping일 때만 남아야 한다.
- [ ] `cross-account-aws-s3`의 기존 테스트 기대값을 `Prod AWS Account`, `Test AWS Account`, `계정 간 공유 S3 Bucket`, `prod.txt S3 Object`, `test.txt S3 Object`로 갱신한다.
- [ ] 각 Template의 Resource label에 빈 값, 줄바꿈, 중복이 없는지 임시 점검 스크립트로 확인한다. 이 스크립트는 repository에 추가하지 않는다.
- [ ] Run: `pnpm --filter @sketchcatch/types exec tsx --test src/brainboard-templates/workspace-terraform-normalization.test.ts`
  Expected: 0 failures; exact-title/single-residual premise 오류 없음.
- [ ] Run: `pnpm --filter @sketchcatch/web exec tsx --test features/architecture-board-compiler/architecture-board-integrations.test.ts`
  Expected: 29 usable Template materialization/review 통과.
- [ ] Run: `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/palette-backed-template-resources.test.ts features/resource-settings/template-library.test.ts`
  Expected: 0 failures.
- [ ] 세 묶음으로 커밋한다.
  - network/compute: `Fix: Brainboard 네트워크·컴퓨팅 Resource 이름 정리`
  - data/security: `Fix: Brainboard 데이터·보안 Resource 이름 정리`
  - application/account: `Fix: Brainboard 애플리케이션·계정 Resource 이름 정리`

## Task 4: 직접 제작 6개 Template 이름 적용

**Files:**

- Modify: `packages/types/src/template-definitions.ts`
- Modify: `packages/types/src/template-definitions.test.ts`
- Modify: `packages/types/src/template-layout-contract.test.ts`

- [ ] Appendix B의 6개 mapping을 `resource()`와 `presentationNode()`의 label 인자에 적용한다.
- [ ] ID, Terraform local name, values, edge와 geometry가 diff에 포함되지 않았는지 확인한다.
- [ ] `template-definitions.test.ts`의 `ALB Security Group` 기대값을 `ALB SG`로 바꾼다.
- [ ] 먼저 기존 semantic hash 테스트를 실행해 이름 변경으로만 실패하는 6개 hash를 확인한 뒤 실제 결과로 갱신한다. ECS support-group child label 기대값도 Appendix B와 일치시킨다.
- [ ] Run: `pnpm --filter @sketchcatch/api exec tsx --test ../../packages/types/src/template-definitions.test.ts ../../packages/types/src/template-layout-contract.test.ts ../../packages/types/src/template-presentation-contract.test.ts`
  Expected: 0 failures.
- [ ] Commit: `Fix: 직접 제작 Template Resource 이름 정리`

## Task 5: Terraform sync와 Compiler 설명도 사용자 label을 유지

**Files:**

- Create: `apps/web/features/workspace/terraform-sync-proposals.test.ts`
- Modify: `apps/web/features/workspace/terraform-sync-proposals.ts`
- Modify: `apps/web/features/architecture-board-compiler/architecture-board-compiler.test.ts`
- Modify: `apps/web/features/architecture-board-compiler/architecture-board-compiler.ts`

- [ ] Terraform rename proposal 적용 후 `resourceName`과 address만 바뀌고 기존 `node.label`은 유지되는 실패 테스트를 먼저 추가한다.
- [ ] Terraform create proposal은 local name 대신 `catalogResource.nodeDefaults.label`을 새 node label로 쓰며, catalog가 없을 때만 `resourceName`을 fallback으로 쓰는 실패 테스트를 추가한다.
- [ ] `applyRenameProposal`에서 label 덮어쓰기를 제거하고 `applyCreateProposal`의 label 우선순위를 구현한다.
- [ ] Compiler change/diagnostic 테스트에 ID가 `eks-cluster-role`, label이 `EKS Cluster IAM Role`인 node를 넣고 사용자-facing summary가 label을 primary로 쓰는 실패 테스트를 추가한다.
- [ ] `architecture-board-compiler.ts`에 source/candidate Architecture node의 `label`을 우선하는 중앙 resolver를 두고 Resource·containment·relationship·diagnostic summary가 이를 사용하게 한다. 내부 ID는 모호성 해소가 필요한 기술 suffix로만 남긴다.
- [ ] Terraform import/deployment 기록처럼 주소 자체가 작업 대상인 화면은 바꾸지 않는다. Board, Resource 패널, Template preview와 AI Chat은 이미 `node.label`을 사용하므로 별도 이름 복제 계층을 추가하지 않는다.
- [ ] Run: `pnpm --filter @sketchcatch/web exec tsx --test features/workspace/terraform-sync-proposals.test.ts features/architecture-board-compiler/architecture-board-compiler.test.ts features/architecture-board-compiler/architecture-board-compilation-summary.test.tsx`
  Expected: 0 failures and user-facing summaries use friendly labels.
- [ ] Commit: `Fix: Terraform sync와 Compiler에서 사용자 표시 이름 유지`

## Task 6: 생성 artifact와 Diagram hash 동기화

**Files:**

- Modify generated outputs reported by the commands below only after reviewing their diffs.
- Modify: `apps/web/features/resource-settings/template-thumbnail-manifest.ts`
- Modify: `apps/web/features/resource-settings/brainboard-template-thumbnail-manifest.ts`

- [ ] Run: `pnpm architecture-board-knowledge:generate`
- [ ] Run: `pnpm architecture-board-evidence:generate`
- [ ] Run only if the evidence review check requests it: `pnpm architecture-board-evidence-review:generate`
- [ ] Generated diffs must be limited to Template label/caption, source fingerprint, Diagram hash and directly derived statistics. Unrelated baseline changes are reverted file-by-file with an inverse patch, never with destructive git commands.
- [ ] 현재 `listBoardTemplates()`의 materialized Diagram JSON을 `sha256(JSON.stringify(template.diagramJson))` hex로 계산해 direct 6개와 Brainboard 23개의 manifest `diagramHash`를 모두 갱신한다. `sha256:` prefix를 붙이지 않는다.
- [ ] Run: `pnpm architecture-board-knowledge:check && pnpm architecture-board-evidence:check && pnpm architecture-board-evidence-review:check`
  Expected: all checks pass, or a pre-existing unrelated blocker is recorded without silently rewriting its baseline.
- [ ] Run: `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/palette-backed-template-resources.test.ts`
  Expected: manifest hash assertion passes.
- [ ] Commit generated artifact and manifest changes: `Chore: Template 표시 이름 artifact 동기화`

## Task 7: 29개 Board thumbnail 재캡처

**Files:**

- Modify: `apps/web/public/template-thumbnails/v1/*.webp` (6 files)
- Modify: `apps/web/public/template-thumbnails/brainboard/v1/*.webp` (23 files)
- Modify only if its count is stale: `apps/web/public/template-thumbnails/README.md`

- [ ] `apps/web/public/template-thumbnails/README.md`의 실제 Board 캡처 계약을 읽고 dev server를 실행한다.
- [ ] source, generated artifact와 최종 manifest hash가 모두 확정된 다음에만 캡처를 시작한다.
- [ ] 각 Template을 `/workspace/new?mode=template&templateId=<id>`로 열어 실제 Board를 `1280 × 720` WebP로 캡처한다. static SVG/topology 대체물을 만들지 않는다.
- [ ] 이름이 잘리거나 두 줄이 되면 label을 길게 늘리지 말고 더 짧게 다듬은 뒤 해당 Template의 source, hash와 캡처를 다시 맞춘다.
- [ ] 29개 asset의 크기, 형식, 파일 경로를 검사한다. 일부만 성공한 상태에서는 manifest/asset pair를 커밋하지 않는다.
- [ ] Dashboard Template 카드와 `/dashboard/templates` 큰 미리보기에서 새 캡처를 확인한다.
- [ ] Commit: `Chore: Template Board 미리보기 갱신`

## Task 8: 전체 회귀와 수동 QA

- [ ] Task 2에서 저장한 projection을 다시 계산해 29개 Diagram과 23개 Brainboard source가 byte-for-byte 동일한지 비교한다. 허용되는 제외 키는 `label`, `addressMapping` 둘뿐이다.
- [ ] raw capture index의 `captureSha256`, source의 `terraform.files[].sha256`/workspace seed hash와 Terraform address 목록을 적용 전후 비교한다. `resourceName`, Terraform source 및 raw capture JSON에는 diff가 없어야 한다.
- [ ] 29개 Template을 하나씩 실제 Board로 열어 Resource가 모두 보이고, 한 줄 label이며, 연결·Area containment·배치가 바뀌지 않았는지 확인한다.
- [ ] Resource 목록과 상세의 primary name은 authored label이고 Terraform address는 secondary 정보인지 확인한다.
- [ ] Template 카드, 큰 미리보기, Board, 사용자-facing AI/Compiler 설명이 같은 materialized label을 쓰는지 전체 목록으로 확인한다. Compiler summary에 raw node/edge ID가 primary text로 남지 않았는지도 확인한다.
- [ ] Run: `pnpm templates:validate`
  Expected: 성공한 Template Terraform validation 전부 통과.
- [ ] Run: `pnpm harness:check`
  Expected: pass.
- [ ] Run: `pnpm lint`
  Expected: pass or only documented pre-existing unrelated failure.
- [ ] Run: `pnpm typecheck`
  Expected: pass or only documented pre-existing unrelated failure.
- [ ] Run: `pnpm test`
  Expected: pass or only documented pre-existing unrelated failure.
- [ ] Run: `pnpm build`
  Expected: pass or only documented pre-existing unrelated failure.
- [ ] Run: `git diff --check`
  Expected: no whitespace errors.
- [ ] Review `git status --short` and confirm every staged path belongs to this plan before the final commit.

---

## Appendix A: Brainboard 22개 확정 이름

형식은 `현재 label 또는 address → 새 label`이다. 유지라고 적힌 presentation label과 빈 text node는 그대로 둔다.

### `aws-asg-load-balancer-vpc`

`vpc→웹 VPC`; `snet→Public Subnet A`; `snet2→Public Subnet B`; `aws_security_group.default→웹 공용 SG`; `aws_security_group.ec2→EC2 SG`; `aws_launch_configuration.default→웹 Launch Configuration`; `web→웹 ASG`; `internet_gw→Internet Gateway`; `rt→Public Route Table`; `clb_9→웹 Classic Load Balancer`; `rt_association→Public Route 연결 A`; `rt_association2→Public Route 연결 B`; `CPU alarm UP→CPU Scale Out Alarm`; `CPU alarm down→CPU Scale In Alarm`; `ASG policy UP→ASG Scale Out Policy`; `ASG policy DOWN→ASG Scale In Policy`. 두 AZ area는 실제 값대로 모두 `AZ us-east-1a`.

### `aws-bastion`

`default_vpc→Bastion VPC`; `default_subnet→Bastion Subnet`; `default_security_group→Bastion SG`; `Internet gateway→Internet Gateway`; `Route table→Internet Route Table`; `Route table association→Bastion Route 연결`; `default_network_acl→Bastion Network ACL`; `default_key_pair→Bastion Key Pair`; `SG rule ingress→허용 IP 전체 인바운드`; `SG rule SSH→SG 내부 SSH 허용`; `SG rule egress→전체 아웃바운드 허용`; `SSH bastion→Bastion EC2`; `Private T2 instance→Private EC2`; area `us-east-1a→AZ us-east-1a`, `Authorized users→승인된 사용자`.

### `aws-cost-monitoring`

`Global budget USD→전체 월간 비용 Budget`; `EC2 budget USD→EC2 월간 비용 Budget`; `S3 budget→S3 월간 사용량 Budget`; `Reserved instances budget→RI 사용률 Budget`.

### `aws-dashcam-video-processing`

`video_processing_cluster→영상 처리 ECS Cluster`; `output_bucket→처리 결과 S3 Bucket`; `video_distribution→결과 영상 CloudFront Distribution`; `video_resource→영상 API /videos Resource`; `video_bucket→원본 영상 S3 Bucket`; `lambda_policy→Lambda 기본 실행 권한 연결`; `video_task→영상 처리 ECS Task Definition`; `video_service→영상 처리 ECS Service`; `video_integration→영상 API Lambda 통합`; `video_method→영상 API POST Method`; `video_processor→영상 처리 Lambda`; `video_api→영상 처리 REST API`; `video_queue→영상 처리 SQS Queue`; `lambda_exec→영상 처리 Lambda IAM Role`.

### `aws-ec2-vpc-subnet`

`vpc→EC2 VPC`; `snet→Public Subnet`; `t3a instance→t3a.medium EC2 Instance`; `network interface→Elastic Network Interface`; area `us-east-1a→AZ us-east-1a`.

### `aws-ecs-fargate`

`VPC - default→ECS VPC`; `ecs_security_group→ECS Service SG`; `aws_subnet.default→ECS Subnet`; `ecs_task_definition→Fargate Task Definition`; `ecs_task_role→ECS Task IAM Role`; `ecs_task_role_attachment→ECS Task 실행 권한 연결`; `ecs_cluster→ECS Cluster`; `ecs_vpc_igw→Internet Gateway`; `aws_ecs_service.default→Fargate Service`.

### `aws-elastic-beanstalk`

`aws_vpc.default→Elastic Beanstalk VPC`; `subnet_2a/b→Public Subnet A/B`; `aws_internet_gateway.default→Internet Gateway`; `aws_elastic_beanstalk_environment.default→Elastic Beanstalk Environment`; `default elastic beanstalk app→Elastic Beanstalk Application`; `aws_route_table.default→Public Route Table`; 두 association은 `Public Route 연결 A/B`; area `ap-southeast-2a/b→AZ ap-southeast-2a/b`; ASG alias `Elastic Beanstalk ASG`; EC2 aliases `Elastic Beanstalk EC2 A/B`.

### `aws-fsx`

`aws_vpc.default→FSx VPC`; public/private subnet은 `Public Subnet A/B`, `Private Subnet A/B`; SG `fsx→FSx for Lustre SG`; `IGW→Internet Gateway`; network ACL은 `Public Network ACL A/B`; `eip_a/b→NAT EIP A/B`; NAT gateway는 `NAT Gateway A/B`; `aws_s3_bucket.default→S3 Bucket 1`; `aws_s3_bucket.vpc_logs→VPC Log S3 Bucket`; public access block은 `S3 Bucket 1 공개 차단`, `VPC Log S3 공개 차단`; `flow log→VPC Flow Log`; FSx Resource와 alias는 `FSx for Lustre`; versioning은 `S3 Bucket 1 버전 관리`, `VPC Log S3 버전 관리`; encryption은 `S3 Bucket 1 암호화`, `VPC Log S3 암호화`; area `us-east-2a/b→AZ us-east-2a/b`.

### `aws-iam-users`

`IAM group→사용자 IAM Group`; `mfa→MFA 필수 IAM Policy`; `iam_group_policy_attachment_13_c_c→비밀번호 변경 권한 연결`; `IAM policy change password→비밀번호 변경 Managed Policy`; attachment default `MFA 필수 권한 연결`; `users→IAM User 계정`; membership default `IAM User Group 연결`; login profile default `IAM Console Login Profile`; areas `Global - Not tied to any region→Global`, `Users' accounts based on variables→변수 기반 사용자 계정`.

### `aws-jenkins-ec2`

VPC `Jenkins Master VPC`, `Jenkins Worker VPC`; subnet `Master Subnet 1/2`, `Worker Subnet`; SG `Jenkins ALB SG`, `Jenkins Master SG`, `Jenkins Worker SG`; IGW `Master Internet Gateway`, `Worker Internet Gateway`; peering `Master-Worker VPC Peering`; route table/association `Master Internet Route Table`, `Master Main Route 연결`, `Worker Internet Route Table`, `Worker Main Route 연결`; key/EC2 `Jenkins Master Key Pair`, `Jenkins Worker Key Pair`, `Jenkins Master EC2`, `Jenkins Worker EC2`. SG rule은 address별 역할에 따라 `ALB HTTPS 인바운드 허용`, `ALB HTTP 인바운드 허용`, `Master SSH 인바운드 허용`, `Jenkins 8080 인바운드 허용`, `Worker SSH 인바운드 허용`, `ALB 전체 아웃바운드 허용`, `Master 전체 아웃바운드 허용`, `Worker 전체 아웃바운드 허용`, `Worker Subnet 인바운드 허용`, `Master Subnet 인바운드 허용`. DNS/LB/TLS는 `ACM 검증 Route 53 Record`, `Jenkins DNS Route 53 Record`, `Worker VPC Peering 수락`, `Jenkins ALB`, `Jenkins Target Group`, `HTTP→HTTPS Redirect Listener`, `Jenkins HTTPS Listener`, `Jenkins Master Target 연결`, `Jenkins ACM Certificate`, `Jenkins ACM Certificate 검증`. AZ area는 `AZ us-east-2a`, `AZ us-east-2b`, `AZ us-west-2a`.

### `aws-kubernetes-native-cnis`

`aws_vpc.default→EKS VPC`; `sg→EKS Cluster SG`; `snet-1a/b→Public Subnet A/B`; WN attachment `Worker Node 권한 연결`; `attachment3→EKS Cluster 권한 연결`; `node_group→Worker Node IAM Role`; CNI attachment `CNI 권한 연결`; `eks→EKS Cluster IAM Role`; Registry attachment `ECR 읽기 권한 연결`; `attachment5→VPC Controller 권한 연결`; `Internet gateway→Internet Gateway`; `Route table→Public Route Table`; `EKS node group→EKS Node Group`; `SG rule→Cluster API HTTPS 허용`; `EKS cluster→EKS Cluster`; associations `rt_association2→Public Route 연결 A`, `rt_association→Public Route 연결 B`; AZ area는 `AZ us-east-1a/b`; 공백 Internet icon은 `Internet`.

### `aws-load-balancer-target-group`

`aws_vpc.default→ALB VPC`; `sg→ALB·EC2 SG`; subnet default/2 `ALB Subnet A/B`; `LB listener→ALB HTTP 8080 Listener`; `LB target group→HTTP 8080 Target Group`; `t3a_9→애플리케이션 EC2`; attachment `EC2 Target Group 연결`; `alb→Application Load Balancer`; IGW `Internet Gateway`; AZ area `AZ us-east-2a/b`.

### `aws-multi-account-management`

VPC `Staging/Dev/Prod VPC`; subnet `Staging/Prod/Dev Subnet A/B`; account `Dev/Staging/Prod AWS Account`; EC2 `Staging/Dev/Prod EC2 A/B`; areas `AWS 계정`, `Prod 환경`, `Dev 환경`, `Staging 환경`; 각 `var.az1/2` area는 `AZ us-east-2a/b`.

### `aws-network-landing-zone`

`aws_vpc.default→Landing Zone VPC`; public/private subnet `Public Subnet A/B/C`, `Private Subnet A/B/C`; EIP `NAT EIP A/B/C`; gateway `NAT Gateway A/B/C`; route table `Public Route Table A/B/C`, `Private Route Table A/B/C`; flow log `VPC Flow Log`; IGW `Internet Gateway`; AZ area `AZ us-east-2a/b/c`.

### `aws-rds`

`default vpc→RDS VPC`; `default security group→PostgreSQL SG`; DB subnet group default `PostgreSQL DB Subnet Group`; subnet `DB Subnet A/B`; `db1→PostgreSQL Primary DB`; `postgres read replica→PostgreSQL Read Replica`; `Log DB parameter→PostgreSQL 연결 로그 설정`; AZ area `AZ us-west-2a/b`.

### `aws-rest-api-documentdb`

`restAPI-vpc→DocumentDB API VPC`; `restAPI-subnet→DocumentDB API Subnet`; Lambda `restAPI-lambda→DocumentDB 처리 Lambda`, `restAPI-lambda-ext→외부 연동 Lambda`; API `DocumentDB HTTP API`; secret `DocumentDB 자격 증명`; cluster `DocumentDB Cluster`; Client area `클라이언트`.

### `aws-s3-api-gateway`

`IAM policy→S3 전체 접근 IAM Policy`; `IAM role→API Gateway S3 IAM Role`; attachment `S3 전체 접근 권한 연결`; REST API `S3 REST API`; folder/item resources `폴더 API Resource`, `항목 API Resource`; method `버킷 목록 GET Method`; responses `GET 200/400/500 Method Response`; integration responses는 address의 status에 맞춰 `S3 200/400/500 Integration Response`; deployment `S3 REST API Deployment`; integration `S3 GET Integration`.

### `aws-secure-s3-bucket`

`s3_bucket→보안 S3 Bucket`; notification `로그 객체 생성 SNS 알림`; lifecycle `로그 보관 Lifecycle`; versioning `S3 Versioning`; encryption `S3 KMS 암호화`; public block `S3 Public Access 차단`; ACL `S3 Private ACL`; topic `버킷 알림 SNS Topic`; replication `S3 Replication 설정`; role `S3 Replication IAM Role`; logging `S3 접근 로그 수집`.

### `aws-serverless-cdn`

`apigwv2_api→애플리케이션 HTTP API`; `www→www CloudFront A Record`; zone `웹사이트 Route 53 Hosted Zone`; website bucket `웹사이트 S3 Bucket`; versioning `웹사이트 Versioning`; objects `오류 페이지 S3 Object`, `홈 페이지 S3 Object`; website config `웹사이트 S3 Website 설정`; ACL `웹사이트 Public-read ACL`; distribution `웹사이트 CloudFront Distribution`; OAI `웹사이트 CloudFront OAI`; Cognito `사용자 Cognito User Pool`; IAM role `Lambda 실행 IAM Role`; Lambda 1/2/3은 `사용자 처리 Lambda`, `API 처리 Lambda`, `콘텐츠 처리 Lambda`; public bucket `공개 콘텐츠 S3 Bucket`; DynamoDB `애플리케이션 DynamoDB Global Table`; SES `발신자 SES Email Identity`; users area `사용자`.

### `aws-three-tier-database`

Launch Template `공용 EC2 Launch Template`; VPC `3-Tier VPC`; ASG `웹 Auto Scaling Group`, `애플리케이션 Auto Scaling Group`; subnet `웹 Subnet A/B`, `애플리케이션 Subnet A/B`, `DB Subnet A/B`; DB subnet group `Aurora DB Subnet Group`; DNS `웹 A Record`, `웹 CNAME Record`, `웹 Route 53 Hosted Zone`; WAF `웹 WAF ACL`, `웹 WAF Rule`, `웹 WAF IP Set`; S3 `웹 앱 S3 Bucket`, `웹 앱 Versioning`; IGW `Internet Gateway`; ELB `웹 ELB`, `애플리케이션 ELB`; EIP/NAT `NAT EIP A/B`, `NAT Gateway A/B`; DB `Aurora PostgreSQL Cluster`; aliases `CloudFront Distribution`, `웹 EC2 A/B`, `애플리케이션 EC2 A/B`, `Aurora Reader`; AZ area `AZ us-east-1a/b`.

### `aws-vpc-subnets-security-groups-2az`

`vpc→2-AZ VPC`; subnet `Private Subnet A/B`, `Public Subnet A/B`; SG `VPC SG A/B`; route table `Public Route Table`; IGW `Internet Gateway`; EIP/NAT `NAT EIP A/B`, `NAT Gateway A/B`; associations `Public Subnet A Route 연결`, `Private Subnet A Route 연결`; ACL `Public Subnet A Network ACL`, `Private Subnet A Network ACL`; AZ area `AZ us-east-1a/b`; users area `사용자`.

### `cross-account-aws-s3`

`S3 bucket Prod→계정 간 공유 S3 Bucket`; object key `test.txt→test.txt S3 Object`, `prod.txt→prod.txt S3 Object`; account areas `Prod AWS Account`, `Test AWS Account`.

---

## Appendix B: 직접 제작 6개 확정 이름

### `static-web-hosting`

`S3 Bucket→정적 웹 S3 Bucket`; `Index Document→시작 페이지 S3 Object`; `S3 Public Access Block→S3 공개 접근 차단`; `CloudFront Origin Access Control→CloudFront OAC`; `CloudFront Distribution→정적 웹 CloudFront Distribution`; `S3 Bucket Policy→CloudFront S3 읽기 허용`; presentation `User / Client→웹 사용자`.

### `minimal-serverless-api`

`API Gateway→항목 API Gateway`; `API Route→항목 API Route`; `POST Method→항목 POST Method`; `Lambda Integration→Lambda Proxy 연결`; `API Deployment→API 설정 스냅샷`; `API Stage→운영 API Stage`; `Lambda Function→항목 처리 Lambda`; `Lambda IAM Role→Lambda 실행 IAM Role`; `Lambda DynamoDB Policy→DynamoDB 접근 권한`; `API Lambda Permission→API Gateway Lambda 호출 허용`; `DynamoDB Table→항목 DynamoDB Table`; `Lambda Log Group→Lambda 로그 저장`; presentation `User / Client→API Client`.

### `full-serverless-web-app`

`Amplify App→웹 프론트엔드 Amplify App`; `Cognito User Pool→사용자 Cognito User Pool`; `Cognito User Pool Client→웹 Cognito App Client`; `API Gateway→애플리케이션 API Gateway`; `Cognito Authorizer→Cognito API 인증`; `API Route→항목 API Route`; `Authorized POST Method→항목 인증 POST Method`; `Lambda Integration→Lambda Proxy 연결`; `API Deployment→API 설정 스냅샷`; `API Stage→운영 API Stage`; `Lambda Function→항목 처리 Lambda`; `Lambda IAM Role→Lambda 실행 IAM Role`; `Lambda DynamoDB Policy→DynamoDB 접근 권한`; `API Lambda Permission→API Gateway Lambda 호출 허용`; `DynamoDB Table→항목 DynamoDB Table`; `Lambda Log Group→Lambda 로그 저장`; presentation `User / Client→웹 사용자`.

### `three-tier-web-app`

VPC `3-Tier VPC`; app subnet `애플리케이션 Private Subnet A/B`; DB subnet `데이터베이스 Isolated Subnet A/B`; public/app/DB routes와 tables는 각각 `Public Route 연결 A/B`, `애플리케이션 Private Route Table`, `애플리케이션 Route 연결 A/B`, `데이터베이스 Isolated Route Table`, `데이터베이스 Route 연결 A/B`; `NAT Elastic IP→NAT EIP`; SG `ALB SG`, `애플리케이션 SG`, `데이터베이스 SG`; AMI `최신 Amazon Linux AMI`; Launch Template `애플리케이션 Launch Template`; ALB `Public ALB`; target `애플리케이션 Target Group`; ASG `애플리케이션 ASG`; DB subnet group `RDS Subnet Group`; DB `PostgreSQL RDS`; region/AZ `Asia Pacific (Seoul)`, `AZ ap-northeast-2a/b`. 이미 직관적인 Public Subnet, Internet Gateway, HTTP Listener 등은 유지한다.

### `ecs-fargate-container-app`

`VPC→ECS VPC`; routes `Public Route 연결 A/B`; `ALB Security Group→ALB SG`; `Task Security Group→Fargate Task SG`; `ECS Execution Role→ECS Task Execution IAM Role`; `ECS Execution Policy→ECS Task 실행 권한 연결`; `ECS Task Role→ECS Task IAM Role`; `ECR Repository→애플리케이션 ECR Repository`; `Fargate Log Group→ECS Task 로그 저장`; ALB `Public ALB`; target `애플리케이션 Target Group`; task/service `애플리케이션 ECS Task Definition`, `애플리케이션 ECS Service`; presentation `User / Client→웹 사용자`, region `Asia Pacific (Seoul)`.

### `eks-container-app`

`VPC→EKS VPC`; `EKS Subnet A/B→Public Subnet A/B`; `EKS Route A/B→Public Route 연결 A/B`; `EKS Cluster Security Group→EKS Cluster SG`; roles `EKS Cluster IAM Role`, `Worker Node IAM Role`; policy attachments `EKS Cluster 권한 연결`, `Worker Node 권한 연결`, `CNI 권한 연결`, `ECR 읽기 권한 연결`; `EKS Managed Node Group→EKS Node Group`; namespace `애플리케이션 Kubernetes Namespace`; deployment/service `웹 Kubernetes Deployment`, `웹 Kubernetes Service`; region/AZ `Asia Pacific (Seoul)`, `AZ ap-northeast-2a/b`.
