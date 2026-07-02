# Reverse Engineering 구현 계획

이 문서는 `Feat: Provider Adapter 기반 Reverse Engineering 구현` 작업을 독립 이슈나 PR로 넘길 수 있게 정리한 참고 계획이다. 확정 계약은 `docs/product.md`, `docs/data-models.md`, `docs/architecture.md`, `docs/deployment.md`, `packages/types/src/index.ts`를 우선한다.

## 목표

AWS-first scanner를 만들되 제품 모델은 provider-neutral `ProviderAdapter` 경계로 유지한다. 기존 AWS 리소스를 Practice Architecture 후보로 복원하고, IaC import suggestion, risk/cost finding, Git/CI/CD handoff 준비 흐름으로 연결한다.

완성된 흐름은 아래 기준을 만족해야 한다.

- 기존 AWS resource가 `ReverseEngineeringScan` 결과로 수집된다.
- scan result가 provider-neutral `ArchitectureJson` 후보로 변환된다.
- Terraform import suggestion이 resource별로 표시된다.
- scan result의 risk/cost finding이 Pre-Deployment Check와 같은 `CheckFinding` 체계로 보인다.
- 사용자가 확인하기 전 기존 ProjectDraft나 Practice Architecture를 덮어쓰지 않는다.
- Git/CI/CD 실제 PR 생성은 별도 기능으로 두고, v1에서는 handoff-ready metadata까지만 만든다.

## 현재 구현 기반

현재 코드와 문서에는 Reverse Engineering 방향이 잡혀 있지만 실제 scan 구현은 없다.

- `docs/data-models.md`
  - `ProviderAdapter`
  - `ReverseEngineeringScan`
  - import suggestion은 사용자 확인 전 기존 프로젝트 상태를 덮어쓰지 않는다고 명시한다.
- `docs/architecture.md`
  - Provider Adapter와 Reverse Engineering은 `apps/api` 또는 future worker 책임이다.
  - 프론트엔드는 provider credential이나 raw state를 직접 다루지 않는다.
- `packages/types/src/index.ts`
  - `CloudProvider`는 현재 `"aws"`만 있다.
  - `ArchitectureJson`, `ResourceNode`, `ResourceEdge`, `ResourceType`이 있다.
  - `ArchitectureSource`에 `"imported"`가 있다.
- `apps/api/src/aws-connections/*`
  - AWS Role 연결 metadata와 STS 검증 흐름이 있다.
  - 저장소에 raw AWS credential을 저장하지 않는다.
- `apps/api/src/services/diagram-to-architecture.ts`
  - 보드/terraform resource type을 provider-neutral `ResourceType`으로 바꾸는 매핑이 있다.

현재 부족한 점은 scan status 저장소, provider adapter interface, AWS read-only scanner, import suggestion model, scan result UI가 없다는 것이다.

## 구현 범위

### 1. Shared type 추가

`packages/types/src/index.ts`에 Reverse Engineering result 계약을 추가한다.

예상 타입:

```ts
type ReverseEngineeringScanStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "cancelled";

type ReverseEngineeringScan = {
  id: string;
  projectId: string;
  provider: CloudProvider;
  status: ReverseEngineeringScanStatus;
  architectureId: string | null;
  errorSummary: string | null;
  startedAt: IsoDateTimeString | null;
  completedAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

type DiscoveredResource = {
  id: string;
  provider: CloudProvider;
  providerResourceType: string;
  providerResourceId: string;
  region: string;
  name: string | null;
  resourceType: ResourceType;
  config: Record<string, unknown>;
  relationships: DiscoveredResourceRelationship[];
};

type ImportSuggestion = {
  id: string;
  resourceId: string;
  terraformResourceType: string;
  terraformResourceName: string;
  importId: string;
  importCommand: string;
  riskLevel: RiskLevel;
  notes: string[];
};

type ReverseEngineeringScanResult = {
  scan: ReverseEngineeringScan;
  discoveredResources: DiscoveredResource[];
  architectureJson: ArchitectureJson;
  importSuggestions: ImportSuggestion[];
  findings: CheckFinding[];
  handoffReady: boolean;
  llmExplanation?: LlmExplanation;
};
```

주의:

- raw AWS response 전체를 shared type이나 API response에 노출하지 않는다.
- account-specific secret, credential, token은 type에 넣지 않는다.
- `ResourceType`은 provider-neutral 값을 사용한다. 모르는 resource는 `"UNKNOWN"`으로 둔다.

### 2. DB 저장소 추가

`apps/api/src/db/schema.ts`에 `reverse_engineering_scans`를 추가한다.

저장 기준:

- RDS에는 scan metadata, status, result JSON, architecture pointer를 저장한다.
- S3에는 v1에서 별도 artifact를 만들지 않는다.
- Redis Runtime Cache는 v1 필수 구현에서 제외한다. scan이 길어지는 후속 단계에서 status streaming 보조로 붙인다.

예상 컬럼:

- `id`
- `project_id`
- `provider`
- `aws_connection_id`
- `region`
- `status`
- `result_json`
- `architecture_id`
- `error_summary`
- `started_at`
- `completed_at`
- `created_at`
- `updated_at`

### 3. ProviderAdapter interface 추가

`apps/api/src/reverse-engineering/provider-adapter.ts`를 추가한다.

예상 interface:

```ts
type ProviderAdapterScanInput = {
  projectId: string;
  provider: CloudProvider;
  region: string;
  awsConnectionId: string;
};

type ProviderAdapter = {
  provider: CloudProvider;
  scan(input: ProviderAdapterScanInput): Promise<DiscoveredResource[]>;
};
```

구현 순서:

1. fixture adapter
   - AWS SDK 없이 고정 fixture로 `DiscoveredResource[]`를 반환한다.
   - mapping, finding, import suggestion, UI를 먼저 검증한다.
2. mocked AWS adapter
   - AWS gateway interface를 주입받아 unit test에서 mocked response를 사용한다.
   - EC2/RDS/S3 client 실제 호출은 test에서 하지 않는다.
3. real AWS adapter
   - verified `AwsConnection`을 통해 STS AssumeRole credential을 준비한다.
   - read-only describe/list API만 호출한다.

### 4. AWS-first scan 범위

MVP v1 scan 대상:

- VPC
- Subnet
- Internet Gateway
- Route Table
- Security Group
- EC2
- RDS
- S3

Adapter별 mapping 기준:

| AWS resource | `ResourceType` | 관계 |
| --- | --- | --- |
| VPC | `VPC` | subnet, route table, internet gateway의 parent |
| Subnet | `SUBNET` | VPC에 연결 |
| Internet Gateway | `INTERNET_GATEWAY` | VPC에 연결 |
| Route Table | `ROUTE_TABLE` | VPC 또는 subnet association |
| Security Group | `SECURITY_GROUP` | EC2/RDS에 연결 |
| EC2 Instance | `EC2` | subnet, security group 연결 |
| RDS DB Instance | `RDS` | subnet group, security group 연결 |
| S3 Bucket | `S3` | 독립 resource, public access finding 생성 가능 |

node id 기준:

- `aws:<region>:<providerResourceType>:<providerResourceId>` 형식으로 stable id를 만든다.
- label은 tag `Name`, resource name, provider id 순서로 선택한다.
- position은 deterministic grid layout fallback으로 만든다.

### 5. Practice Architecture 복원

`apps/api/src/reverse-engineering/discovered-to-architecture.ts`를 추가한다.

책임:

- `DiscoveredResource[]`를 `ArchitectureJson`으로 변환한다.
- resource relationships를 `ResourceEdge[]`로 변환한다.
- provider-specific config는 `node.config`에 보존하되 credential/raw response는 넣지 않는다.
- 모르는 resource는 `UNKNOWN` node로 남기고 finding을 만든다.

사용자 확인 정책:

- scan 성공만으로 기존 `ProjectDraft`를 덮어쓰지 않는다.
- scan result에 `architectureJson` 후보를 저장한다.
- 사용자가 "Practice Architecture로 적용"을 누르면 별도 accept API에서 `ArchitectureSnapshot.source = "imported"`로 저장한다.
- ProjectDraft 반영은 Architecture Board 담당 흐름과 맞춰 후속으로 연결한다.

### 6. Import suggestion 생성

`apps/api/src/reverse-engineering/import-suggestions.ts`를 추가한다.

resource별 기본 예:

- VPC: `terraform import aws_vpc.<name> vpc-...`
- Subnet: `terraform import aws_subnet.<name> subnet-...`
- Internet Gateway: `terraform import aws_internet_gateway.<name> igw-...`
- Route Table: `terraform import aws_route_table.<name> rtb-...`
- Security Group: `terraform import aws_security_group.<name> sg-...`
- EC2: `terraform import aws_instance.<name> i-...`
- RDS: `terraform import aws_db_instance.<name> <db-identifier>`
- S3: `terraform import aws_s3_bucket.<name> <bucket-name>`

정책:

- Terraform resource name은 소문자, 숫자, underscore만 남기고 sanitize한다.
- 중복 name은 suffix를 붙인다.
- import suggestion은 자동 실행하지 않는다.
- import suggestion은 Git/CI/CD handoff-ready metadata로 제공할 수 있지만, PR 생성이나 commit은 별도 승인 흐름에서 한다.

### 7. Risk/Cost finding 통합

scan result에서 바로 finding을 만든다.

예상 finding:

- public RDS: `security`, High
- Security Group open SSH: `security`, High
- S3 public access: `security`, High
- RDS/NAT Gateway/큰 EC2: `cost`, Medium/High
- Terraform import 주의: `configuration`, Medium
- unknown resource: `configuration`, Low/Medium

이 finding은 `AiPreDeploymentAnalysisResult.findings`와 같은 `CheckFinding` 형태로 내려준다.

### 8. API route 추가

예상 route:

- `POST /api/projects/:projectId/reverse-engineering/scans`
  - body: `{ provider: "aws", awsConnectionId: string, region: string }`
  - scan 생성 후 실행 시작
- `GET /api/projects/:projectId/reverse-engineering/scans`
  - 프로젝트의 scan 목록 조회
- `GET /api/reverse-engineering/scans/:scanId`
  - 단일 scan과 result 조회
- `POST /api/reverse-engineering/scans/:scanId/accept`
  - scan result의 `architectureJson`을 imported `ArchitectureSnapshot`으로 저장

인증/권한:

- 모든 route는 현재 사용자 소유 project만 접근 가능하다.
- `awsConnectionId`는 현재 사용자 verified connection이어야 한다.
- raw AWS credential은 응답, 로그, DB에 저장하지 않는다.

### 9. UI 연결

`apps/web`에는 Reverse Engineering Panel을 추가한다.

화면 상태:

- AWS connection 선택
- region 선택
- scan 시작
- pending/running/success/failed 표시
- discovered resource 목록
- 복원된 Practice Architecture preview
- import suggestion 목록
- risk/cost finding 목록
- "Practice Architecture로 적용" 버튼
- "Git/CI/CD handoff 준비" 상태 표시

주의:

- 프론트에서 AWS SDK를 호출하지 않는다.
- scan result를 사용자가 확인하기 전 기존 board state를 바꾸지 않는다.
- 실제 Terraform import, Git commit, PR 생성은 자동 실행하지 않는다.

## API/타입 영향

예상 변경 대상:

- `packages/types/src/index.ts`
  - `ReverseEngineeringScanStatus`
  - `ReverseEngineeringScan`
  - `DiscoveredResource`
  - `ImportSuggestion`
  - `ReverseEngineeringScanResult`
- `apps/api/src/db/schema.ts`
  - `reverse_engineering_scans` table
- `apps/api/src/reverse-engineering/*`
  - provider adapter, mapper, import suggestion, repository, service
- `apps/api/src/routes/reverse-engineering.ts`
  - scan/accept route
- `apps/api/src/app.ts`
  - route 등록
- `apps/web/features/workspace/*` 또는 별도 reverse engineering feature
  - panel, API client, tests

Dependency 영향:

- fixture adapter 단계에서는 새 dependency가 필요 없다.
- real AWS adapter 단계에서는 `@aws-sdk/client-ec2`, `@aws-sdk/client-rds`가 필요할 수 있다.
- dependency를 추가하면 `package.json`과 `pnpm-lock.yaml` diff를 함께 검토한다.

## 테스트

Adapter test:

- fixture adapter가 VPC, subnet, EC2, RDS, S3 resource를 반환한다.
- mocked AWS adapter가 describe/list 결과를 `DiscoveredResource[]`로 변환한다.
- AWS error는 scan `failed`와 `errorSummary`로 저장된다.

Mapping test:

- discovered VPC/subnet/EC2/security group 관계가 `ArchitectureJson.edges`로 변환된다.
- unknown resource는 `ResourceType: "UNKNOWN"`으로 유지된다.
- node id가 stable하게 생성된다.

Import suggestion test:

- resource별 import command가 올바르다.
- Terraform resource name sanitize와 중복 suffix가 동작한다.
- import suggestion은 자동 실행되지 않는다.

API route test:

- 인증되지 않은 사용자는 scan API를 호출할 수 없다.
- 다른 사용자 project scan은 404 또는 403으로 막힌다.
- verified AWS connection이 아니면 scan 시작이 실패한다.
- scan success result를 조회할 수 있다.
- accept API가 imported `ArchitectureSnapshot`을 만든다.
- accept 전에는 기존 ProjectDraft가 바뀌지 않는다.

Web test:

- Reverse Engineering Panel의 empty/loading/success/error 상태
- import suggestion 목록 렌더링
- risk/cost finding 렌더링
- accept 전 기존 board state 미변경

문서/전체 검증:

- `pnpm harness:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

## 완료 조건

- AWS-first scan 결과가 provider-neutral `DiscoveredResource`로 정규화된다.
- 기존 AWS 리소스가 Practice Architecture 후보로 복원된다.
- Terraform import suggestion이 resource별로 생성된다.
- scan result의 High risk와 Cost Risk가 `CheckFinding`으로 통합된다.
- scan result는 사용자 확인 전 기존 프로젝트 상태를 덮어쓰지 않는다.
- Git/CI/CD handoff는 실제 PR 생성 전 단계까지 준비된다.
