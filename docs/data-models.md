# 데이터 모델

이 문서는 SketchCatch에서 DB 테이블, API DTO, 프론트 상태 객체, AI 결과, Terraform/Deployment 흐름이 같은 의미로 쓰이도록 맞춘 공통 데이터 모델 기준이다.

## 원칙

- TypeScript, API DTO, 프론트 상태 객체는 `camelCase`를 사용한다.
- PostgreSQL 컬럼은 `snake_case`를 사용한다.
- 날짜는 API와 프론트에서 `IsoDateTimeString`으로 다룬다.
- 공유 타입에는 `passwordHash`, raw access key, secret key, private token, DB password를 넣지 않는다.
- 새 필드, enum, status, DTO는 먼저 이 문서와 `packages/types/src/index.ts`에 맞춘다.
- API 요청/응답은 shared type을 기준으로 하고, API route에서는 Zod schema로 같은 계약을 검증한다.
- `Resource`, `Practice Architecture`, `InfrastructureGraph`, `Reverse Engineering`은 provider-neutral 개념으로 다룬다. AWS-first 구현은 가능하지만 공통 모델에 AWS-only 가정을 섞지 않는다.
- AI, Bedrock, Amazon Q, 음성 입력은 제안과 설명 계층이다. Practice Architecture, IaC Preview, Git 변경, Deployment 실행 같은 상태 변경은 `User-Accepted Change`여야 한다.

## 핵심 계약

| 모델                     | 책임                                                                           |
| ------------------------ | ------------------------------------------------------------------------------ |
| `ArchitectureJson`       | 저장된 Practice Architecture의 도메인 그래프                                   |
| `InfrastructureGraph`    | `DiagramJson`과 Terraform 사이의 양방향 동기화 중간 그래프                     |
| `DiagramJson`            | Architecture Board 편집 상태와 Terraform 변환 입력                             |
| `ProjectDraft`           | 프로젝트별 최신 편집 draft                                                     |
| `TerraformArtifact`      | S3에 저장된 Terraform 파일 메타데이터                                          |
| `AwsConnection`          | 사용자가 한 번 연결해 여러 프로젝트에서 재사용하는 AWS Role 연결 metadata      |
| `Deployment`             | 승인된 Terraform 실행 단위                                                     |
| `DeploymentPlanArtifact` | S3에 저장된 `tfplan` 파일의 Deployment별 metadata                              |
| `DeploymentLog`          | Deployment 단계별 실행 로그                                                    |
| `DeployedResource`       | Apply 성공 후 Terraform state에서 추출한 실제 생성 리소스                      |
| `TerraformOutput`        | Apply 성공 후 `terraform output -json`에서 추출한 output                       |
| `CheckFinding`           | Pre-Deployment Check의 단일 경고/검증 결과                                     |
| `RequirementInput`       | 텍스트 또는 음성에서 들어온 요구사항 입력                                      |
| `ProviderAdapter`        | provider별 Resource 조회, import, IaC 세부를 공통 모델로 변환하는 경계         |
| `GitCicdHandoff`         | IaC Preview를 Source Repository PR과 외부 pipeline으로 넘기는 handoff metadata |
| `ReverseEngineeringScan` | 기존 cloud Resource 스캔 작업과 복원 결과 metadata                             |

## Requirement Input과 User-Accepted Change

`RequirementInput`은 사용자가 Practice Architecture를 만들거나 바꾸기 위해 제공하는 자연어 입력이다. 입력 채널은 텍스트 또는 음성일 수 있다. 음성 입력은 Amazon Transcribe 같은 전사 단계를 거쳐 텍스트로 확인된 뒤 `RequirementPrompt`로 확정된다.

```ts
type RequirementInputMode = "text" | "voice";

type RequirementInput = {
  mode: RequirementInputMode;
  text: string;
  transcriptSource?: "amazon_transcribe";
  confirmedByUser: boolean;
};
```

AI가 만든 `ArchitectureDraft`, `ArchitectureSuggestion`, Git 변경, Deployment 실행은 자동으로 프로젝트 상태를 바꾸지 않는다. 상태 변경 API는 사용자의 명시적 수락/승인 시점과 대상을 추적할 수 있어야 한다.

```ts
type UserAcceptedChangeTarget =
  | "architecture_draft"
  | "architecture_suggestion"
  | "iac_handoff"
  | "git_change"
  | "deployment_action";

type UserAcceptedChange = {
  target: UserAcceptedChangeTarget;
  acceptedByUserId: string;
  acceptedAt: IsoDateTimeString;
};
```

## ArchitectureJson

`ArchitectureJson`은 프로젝트 저장, AI 분석, 비용/위험 분석이 바라보는 도메인 그래프다.

```ts
type ArchitectureJson = {
  nodes: ResourceNode[];
  edges: ResourceEdge[];
};
```

`ResourceNode`:

```ts
type ResourceNode = {
  id: string;
  type: ResourceType;
  label?: string;
  positionX: number;
  positionY: number;
  config: Record<string, unknown>;
};
```

`ResourceEdge`:

```ts
type ResourceEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
};
```

`sourceId`와 `targetId`는 같은 `ArchitectureJson.nodes[].id`를 가리켜야 한다.

## InfrastructureGraph

`InfrastructureGraph`는 `DiagramJson`과 Terraform을 양방향 동기화할 때 사용하는 정규화된 중간 모델이다. Architecture Board 전용 그래프를 새로 만드는 것이 아니라, 보드 편집 상태와 Terraform HCL subset이 같은 Resource identity와 IaC identity를 공유하도록 맞추는 동기화 계약이다.

```ts
type InfrastructureGraph = {
  nodes: InfrastructureGraphNode[];
  edges: InfrastructureGraphEdge[];
};
```

`InfrastructureGraphNode`:

```ts
type InfrastructureGraphNode = {
  id: string;
  label?: string;
  iac: {
    provider: CloudProvider;
    terraformBlockType: TerraformBlockType;
    resourceType: string;
    resourceName: string;
    fileName?: string;
  };
  config: Record<string, unknown>;
};
```

`InfrastructureGraphEdge`:

```ts
type InfrastructureGraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
};
```

`id`는 `DiagramJson.nodes[].id`와 안정적으로 대응해야 한다. Terraform Preview 경로의 리소스 identity는 내부 `ResourceType` 변환값이 아니라 `iac.provider + iac.terraformBlockType + iac.resourceType + iac.resourceName`이다. Terraform sync v1은 Terraform HCL 안의 `(terraformBlockType, resourceType, resourceName)`으로 기존 node를 찾고, provider는 shared `ResourceDefinition`에서 해석한다. 매칭할 수 없는 block, 알 수 없는 block, 복잡한 expression처럼 안전하게 해석할 수 없는 입력은 기존 그래프나 `DiagramJson`을 변경하지 않고 diagnostic으로 반환한다.

## DiagramJson

`DiagramJson`은 Architecture Board 편집 상태와 Terraform 변환 입력이다. React Flow 스타일의 위치, 크기, viewport, node style, Terraform parameters를 포함할 수 있다.

```ts
type DiagramJson = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  viewport: DiagramViewport;
};
```

`DiagramEdge.style.lineStyle`은 보드에서 연결선의 의미를 보존하기 위한 표현 계약이다. 기본 런타임 트래픽은
`solid`, 비동기/이벤트/큐 흐름과 Terraform plan/apply 또는 CI/CD 같은 운영 흐름은 `dashed`를 사용한다.
`contains`, `hosts`처럼 포함 관계를 나타내는 edge는 렌더링 선으로 남기지 않고 `node.metadata.parentAreaNodeId`
containment로 변환한다.

### 자동 다이어그램 배치 정책

AI가 `ArchitectureJson`만 반환하거나 새 리소스를 제안한 경우 프론트 어댑터는 고정 서비스 좌표표가 아니라
결정론적 자동 배치 pipeline으로 `DiagramJson`을 만든다. pipeline은 provider-neutral semantic role과 방향성
graph를 기준으로 다음 순서를 지킨다.

1. `contains`/`hosts`와 Terraform 참조에서 parent-child containment를 확정한다.
2. 가장 깊은 영역의 자식부터 배치하고 실제 자식 경계로 Region, VPC, AZ, Subnet, Group 크기를 계산한다.
3. 사용자/진입점에서 compute/data로 이어지는 주 흐름을 우선 한 축으로 정렬한다.
4. IAM, 보안, 관측, 배포 같은 지원 리소스는 주 흐름의 상단·하단 lane으로 분리하고 연결 대상 가까이에 둔다.
5. 반복 AZ/Subnet/resource 묶음은 같은 순서와 크기로 정렬한다.
6. IaC dependency edge는 보존하되, 밀도가 높은 Board에서는 구현 세부 관계를 `detail`로 분류하고
   Listener/Target Group 같은 중간 리소스 체인을 사람이 읽는 `summary` 관계로 축약한다.
7. support lane 배치가 다른 복수 후보를 만들고 node/area 겹침, parent 경계 위반, 역방향 edge,
   edge-resource 및 Area 제목 교차, edge 교차, 반복 정렬 오차, canvas 면적·공백률·세로 비율을 점수화해
   최저 점수를 선택한다.
8. 최종 node와 영역 위치가 정해진 뒤 edge handle과 장애물 회피 경로를 계산한다.

AWS resource type은 MVP Provider Adapter의 첫 분류 입력이지만 배치 모델의 role, graph, containment, 반복 패턴,
품질 점수는 AWS 전용 좌표를 전제하지 않는다. `docs/diagram-layout-reference`의 이미지와 설명은 설계·회귀 근거이며
production runtime 입력이 아니다.

정확한 `draft.diagramJson` fixture와 `templateResourceId`가 있는 명시적 Template 좌표는 작성된 위치를 그대로
우선한다. 기존 Board를 대상으로 한 AI patch에서는 같은 node id의 `position`, `size`, `locked`를 보존하고 새
node만 자동 배치한다. 단, 저장된 Area에 새 자식이 추가되면 Area 위치와 기존 최소 크기는 유지하면서 경계 위반을
막는 데 필요한 방향으로만 크기를 확장할 수 있다. 자동 배치는 resource type, Terraform parameters, containment
identity, edge identity를 수정하지 않으며 사용자가 patch를 승인하기 전에는 현재 Board를 변경하지 않는다.

Repository Analysis에서 `ecs-fargate-container-app`을 선택하고 `include_frontend` 질문에 `true`로 답해
CloudFront/S3 frontend와 Fargate backend가 함께 생성되는 strict evidence 흐름은 승인된 Repository ECS 기준
배치를 사용한다. 이 배치는 선택 Template의 작성 좌표와 크기를 보존하고, private app subnet, NAT, private route,
CloudFront/S3, ECR, CloudWatch, GitHub Actions, Fargate runtime을 기준 좌표에 결정론적으로 배치한다. 해당 전체
Resource 시그니처가 없으면 일반 Repository/Template 자동 배치 정책을 유지한다. 이 흐름의 Presentation
node 중 `Global IAM`과 `Definition / Ops`만 실제 `design_group` 컨테이너로 만들고, 나머지는 각자의 Design
표현 타입을 유지한다.

### Architecture Board Compilation 제안 계약

기존 자동 배치와 별도로 Architecture Board Compiler는 Resource, 관계, Terraform parameter, containment,
presentation node, geometry, z-index, edge routing을 모두 변경한 제안을 만들 수 있다. 명시된 요구사항, 기존
Deployment 상태, Provider·Terraform 유효성과 충돌해도 후보에서 자동 탈락시키지 않고 diagnostic과 품질 비용으로
표현한다.

```ts
type ArchitectureBoardCompilationProposal = {
  architecture: ArchitectureJson;
  diagram: DiagramJson;
  changes: ArchitectureBoardCompilationChange[];
  diagnostics: ArchitectureBoardCompilationDiagnostic[];
  quality: {
    before: ArchitectureBoardCompilationQuality;
    after: ArchitectureBoardCompilationQuality;
    compilationDistance: number;
  };
  provenance: {
    compilerVersion: string;
    candidateId: string;
    candidateIds?: string[];
    layoutProfileIds?: string[];
    referenceTemplateIds: string[];
  };
};
```

`ArchitectureBoardCompilationInput.semanticContext`는 상위 Adapter가 명시적으로 허용한
`resource-*`, `relationship-*`, `configuration-*`, `containment-set`, `presentation-*` operation과
requirement/deployment/provider/terraform signal을 전달하는 선택 입력이다. Compiler는 이를 제안과
diagnostic에 반영하지만, 호출만으로 Board·DB·IaC를 변경하지 않는다. `provenance.candidateIds`에는
원본 baseline을 포함한 모든 후보를, `layoutProfileIds`에는 실제 geometry 후보군에 추가한 사례 기반
spacing profile을 남긴다.

semantic operation이 있을 때도 `original`은 요청 전 source graph를 가리킨다. 요청된 graph는 별도
`requested-original` 후보에서 시작하며, 명시 operation이 있는 호출은 source original을 조용히 선택해
요청을 취소하지 않는다. Board 자동 정리는 현재 Diagram을 authored source로 취급하며 `presentation`,
`geometry`, `edge-routing` 변경만 허용한다. Resource·관계·설정·containment 변경 후보는 자동 정리 결과로
제공하거나 적용하지 않는다. Template 검토도 현재 Diagram을 authored source로 취급하고,
AI Draft·Reverse Engineering은 같은 node ID/type이라도 config·관계 label이 달라질 수 있으므로 요청 graph를
다시 materialize한다. Reverse Engineering은 scan finding, analysis exclusion, provider scan error를
`deployment`/`provider` signal로 전달해 proposal diagnostic과 승인 화면에 유지한다.

`Compilation Distance`는 입력과 제안 사이의 변경 비용이다. 기본 순서는 위치, 크기, 시각적 소속, 관계, 설정,
Resource 추가, Resource 삭제 순으로 커진다. 이 비용은 파괴적 변경을 금지하지 않지만 빈 Board처럼 시각 점수만
좋은 후보가 자동 선택되는 것을 막는다. Compiler는 제안만 반환하며 현재 `ProjectDraft`, `DiagramJson`, IaC Preview를
직접 변경하지 않는다. 실제 적용은 하나의 `User-Accepted Change`로 처리하고 Deployment 검증 계약은 그대로 유지한다.

Compiler의 `quality.score`에는 시각·구조·diagnostic·Compilation Distance와 함께, checked-in 된 versioned Template
knowledge artifact의 사례 기반 비용도 포함된다. Compiler는 현재 graph와 가장 가까운 사례를 찾아 containment depth,
형제 간격, viewport 비율, edge 길이, 흐름·support·공백 비율의 차이를 비용으로 반영한다. 가장 가까운 사례의 sibling
gap과 vertical gap은 제한된 spacing profile로도 변환되어 기존 여섯 geometry 후보군을 확장한다. 이 profile은 baseline보다
node/Area 겹침, 경계 이탈, edge 관통·교차, 역방향 edge, support lane 침범을 하나라도 늘리면 선택되지 않는다. 이 artifact는
29개 사용 가능 Template과 1개 unavailable evidence를 별도 생성 명령으로 검증하며, 원본 `source-exact` fixture 자체는
변경하지 않는다.

Template 검토는 source fingerprint를 가진 별도 session으로 진행한다. gallery/start 경로가 소비할 수 있는 승인 variant는
`presentation`, `geometry`, `edge-routing`만 포함해야 하며, Resource·관계·설정·containment 변경이 있으면 `hold`로
남긴다. template ID·source fingerprint·승인 범위가 하나라도 맞지 않으면 authored source로 안전하게 되돌아간다.

파라미터가 다른 Terraform resource를 참조할 때 보드가 만든 자동 연결선은 `DiagramEdge.metadata`로 구분한다.

```ts
type DiagramEdgeMetadata = {
  managedBy?: "parameter-reference";
  parameterPath?: string;
  presentationRole?: "primary" | "detail" | "summary";
};
```

`presentationRole: "detail"`은 Terraform과 Architecture 관계에는 남지만 기본 Board에서 렌더링하지 않는 구현
의존성이다. `presentationRole: "summary"`는 여러 구현 의존성을 하나의 의미 흐름으로 축약한 화면 전용 edge이며
`InfrastructureGraph`와 `ArchitectureJson` 역변환에서 제외한다. `primary`와 metadata가 없는 수동 edge는 기본
Board에 렌더링한다.

`managedBy: "parameter-reference"` edge는 `parameters.values`의 Terraform reference와 현재 node identity를
대조해 다시 계산한다. 지원 경로는 listener의 `loadBalancerArn`과 `defaultAction[n].targetGroupArn`, ASG의
`targetGroupArns[n]`, CloudWatch alarm의 `alarmActions[n]`, Auto Scaling policy의 `autoscalingGroupName`이다.
참조 대상 identity가 없거나 이름이 바뀌면 해당 자동 edge를 제거하며, `metadata`가 없는 수동 edge는 같은
source/target 조합이어도 보존한다. 이 metadata는 보드 표시/동기화용이며 Terraform HCL 출력에는 사용하지 않는다.

`DiagramNode.style.borderStyle`은 영역 노드 경계선의 표현 계약이며, 연결선의 `lineStyle`과 의미를 섞지 않는다.
AWS Architecture Icons 그룹 관례에 맞춰 `aws_region`, `aws_availability_zone`, `aws_autoscaling_group`,
`design_group` 계열은 기본 `dashed`로, `aws_vpc`, `aws_subnet`, `aws_security_group`은 기본 `solid`로 렌더링한다.
저장된 `borderStyle`이 있으면 기본값보다 우선하며, `dotted`는 명시 스타일로만 사용한다.

보드 전용 node metadata는 `node.metadata`에 둔다. `metadata`는 화면 편집 상태를 복구하기 위한 값이며,
Terraform resource/data block 생성에는 사용하지 않는다.

```ts
type AwsRegionCode =
  | "ap-northeast-2"
  | "ap-northeast-1"
  | "ap-southeast-1"
  | "us-east-1"
  | "us-west-2"
  | "eu-west-1"
  | "eu-central-1";

type DiagramNodeMetadata = {
  parentAreaNodeId?: string;
  areaAutoSizeBaseline?: {
    position: { x: number; y: number };
    size: { width: number; height: number };
  };
  liveObservationRole?:
    | "traffic-source"
    | "traffic-hop"
    | "capacity-controller"
    | "capacity-unit"
    | "support";
};
```

새 기준에서 `node.metadata`에는 보드 편집/복구에 필요한 containment 정보와 관측 화면의 경로 분석 힌트를 저장할 수 있다.
Region/AZ 선택값처럼 Terraform 동기화와 의미를 공유해야 하는 값은 `node.parameters.values`에 둔다.

`liveObservationRole`은 저장된 edge를 대체하는 고정 토폴로지가 아니다. Live Observation은 먼저 `DiagramJson.edges`로 방향성 그래프를 구성하고, role이 있으면 source, hop, controller, capacity, support 의미를 명확히 하는 경로 선택 힌트로 사용한다. role이 없으면 resource definition과 그래프 연결성으로 메인 경로를 추론한다. 이 metadata는 관측 화면 전용이며 Terraform resource/data block 생성에는 사용하지 않는다.

Live Observation의 기본 발표 화면은 이 그래프에서 선택한 메인 트래픽 경로만 왼쪽에서 오른쪽으로 표시한다. 공개 요청 수가 증가하거나 새 AWS Provider snapshot의 ALB 요청 수가 0보다 크면 최대 5개의 입자와 overflow 수로 요청 흐름을 재생한다. ECS capacity는 provider snapshot의 `running`, `desired`, `max`를 각각 `RUNNING`, `STARTING`, 사용 가능한 Task slot에 매핑한다. 전체 immutable Architecture 지도는 보조 disclosure에서만 제공하며 세션·Output URL·AWS 검증 경계를 바꾸지 않는다.

영역 노드 안에 명시적으로 배치된 node는 `node.metadata.parentAreaNodeId`에 부모 영역 node id를 저장한다.
이 값은 영역 이동 시 자식 node를 함께 이동시키기 위한 보드 편집 metadata이며, Terraform resource/data block 생성에는 사용하지 않는다.

`node.metadata.areaAutoSizeBaseline`은 영역에 첫 직접 자식이 들어오기 직전의 사용자 geometry를 저장한다.
자식 변경이 확정되면 영역은 이 baseline과 남은 직접 자식 bounding box를 함께 감싸도록 재조정하며,
마지막 직접 자식이 제거되면 baseline의 `position`과 `size`를 복원하고 metadata를 제거한다.
좌표는 finite number, 크기는 finite positive number여야 하며 Terraform resource/data block 생성에는 사용하지 않는다.

Region과 AZ는 `design_region`, `design_az`가 아니라 보드 영역 리소스인 `aws_region`,
`aws_availability_zone` resource node로 표현한다. 이 두 node는 Architecture Board containment와
Terraform Sync proposal 정렬을 위한 SketchCatch 영역 리소스이며, Terraform HCL `resource`, `data`,
또는 `provider "aws"` block으로 직접 렌더링하지 않는다.

`aws_autoscaling_group`은 Terraform HCL `resource "aws_autoscaling_group"` identity를 유지하면서,
보드에서는 child node를 담을 수 있는 visual area node로도 동작한다. 따라서 ASG의 Terraform 의미값은
`node.parameters`에 두고, ASG 안에 배치된 child와의 포함 관계만 child `node.metadata.parentAreaNodeId`에 둔다.

Region 선택값은 `node.parameters.values.awsRegion`에 region code로 저장한다. 예: `ap-northeast-2`.
AZ 선택값은 `node.parameters.values.awsAvailabilityZone`에 AZ code로 저장한다. 예: `ap-northeast-2a`.
화면 label은 프론트엔드 option catalog에서 code와 매핑한다.

Terraform 변환에 필요한 값은 아래 4개다.

- `node.parameters.terraformBlockType`
- `node.parameters.resourceType`
- `node.parameters.resourceName`
- `node.parameters.values`

`resourceType`과 `resourceName`은 Terraform block label로 직접 렌더링되므로 Terraform identifier 형식(`^[a-zA-Z_][a-zA-Z0-9_-]*$`)만 허용한다. `parameters.values`의 top-level key와 nested block key도 `camelCase`에서 `snake_case`로 정규화한 뒤 같은 identifier 형식을 만족해야 하며, 형식이 맞지 않으면 Terraform 생성 API는 HCL을 만들기 전에 `bad_request`로 거부한다.

사용자가 보드에서 리소스 아이콘을 직접 추가할 때는 Terraform identity metadata인 `terraformBlockType`, `resourceType`, `resourceName`, `fileName`을 자동 생성하고, 새 node의 `parameters.values`에만 catalog 안전 기본값을 넣을 수 있다. 현재 기본값은 VPC(`enableDnsSupport: true`, `instanceTenancy: "default"`), Subnet(`mapPublicIpOnLaunch: false`), EC2(`associatePublicIpAddress: false`), S3 bucket(`forceDestroy: false`), S3 public access block(네 차단값 모두 `true`), RDS instance(`publiclyAccessible: false`, `storageEncrypted: true`, `storageType: "gp3"`), EBS(`encrypted: true`, `type: "gp3"`), ACM certificate(`validationMethod: "DNS"`), EFS(`encrypted: true`)다. 이 정책은 기존 node를 backfill하거나 기존 `parameters.values`를 덮어쓰지 않는다. ASG에는 `desiredCapacity` 기본값을 넣지 않는다.

같은 `resourceType`의 아이콘을 반복 추가하면 `resourceName`은 `ec2_instance`, `ec2_instance_2`, `ec2_instance_3`처럼 숫자 suffix를 붙여 Terraform address 중복을 피한다. EC2 `instanceType`, VPC `cidrBlock`, `tags.Name` 같은 실제 Terraform parameter 값은 사용자 입력, AI draft config, Terraform editor sync처럼 명시 입력이 있을 때만 채운다.

신규 일반 리소스 아이콘 node의 기본 `size`는 `56x56`이다. VPC, Subnet, Security Group, Region, AZ, Group, Auto Scaling Group처럼 포함 관계를 표현하는 영역 node는 catalog의 별도 영역 크기를 사용하며, 일반 아이콘 축소 때문에 자동으로 절반 축소하지 않는다.

DB에는 refresh token 원문을 저장하지 않고 hash만 저장한다. API 응답 DTO와 프론트 상태에는 refresh token 원문을 넣지 않고, 서버가 `HttpOnly`, `SameSite=Lax` 쿠키로 내려보낸다. access token은 짧은 만료 시간을 가진 표준 JWT로 다루며, 프론트는 access token을 `localStorage`나 `sessionStorage`에 저장하지 않고 런타임 메모리에만 보관한다. 새로고침처럼 메모리가 비면 `/api/auth/refresh`가 refresh cookie로 새 access token을 복구한다. refresh/logout 같은 cookie 기반 인증 요청은 CSRF 방지를 위해 별도 CSRF cookie 값과 `X-CSRF-Token` header 값이 일치해야 한다.

```ts
type AuthSession = {
  accessToken: string;
  expiresInSeconds: number;
};
```

소셜 로그인 provider 계정은 `oauth_accounts`에 저장한다. `oauth_accounts.provider + provider_user_id`는 외부 provider 계정의 고유 연결 키이며, 실제 provider access token은 저장하지 않는다. 소셜 전용 사용자는 `users.password_hash`가 `null`일 수 있고, 일반 비밀번호 로그인에서는 password hash가 없는 사용자를 로그인 실패로 처리한다.

AWS-first Direct Deployment Path에서는 `DiagramJson -> InfrastructureGraph -> Terraform` 흐름을 우선 사용한다. Terraform 편집 내용을 다시 반영할 때는 `Terraform -> InfrastructureGraph patch -> DiagramJson` 흐름으로 같은 node의 `parameters.values`를 갱신한다. AI 분석이나 비용/위험 분석이 `ArchitectureJson`을 요구하면 `DiagramJson -> ArchitectureJson` 어댑터를 둔다.

`ArchitectureJson`, `InfrastructureGraph`, `DiagramJson`은 서로 대체 관계가 아니다.

- `ArchitectureJson`: 도메인 저장/분석 계약
- `InfrastructureGraph`: Terraform/DiagramJson 동기화 계약
- `DiagramJson`: 보드 편집/화면 복구/Terraform 변환 계약

## ResourceType

`ResourceType`은 provider-neutral `Resource` 개념을 코드에서 분류하기 위한 값이다. 현재 shared type은 AWS-first MVP 리소스를 먼저 담고 있지만, `Resource` 자체를 AWS 전용 개념으로 해석하지 않는다. Azure/GCP 등 provider별 타입은 Provider Adapter와 shared type 확장 작업에서 추가한다.

MVP에서 공통으로 사용할 `ResourceType` 값은 아래로 고정한다.

```ts
type ResourceType =
  | "VPC"
  | "SUBNET"
  | "INTERNET_GATEWAY"
  | "ROUTE_TABLE"
  | "ROUTE_TABLE_ASSOCIATION"
  | "NETWORK_ACL"
  | "NETWORK_ACL_RULE"
  | "VPC_PEERING_CONNECTION"
  | "NAT_GATEWAY"
  | "EC2"
  | "AUTO_SCALING_GROUP"
  | "LAUNCH_TEMPLATE"
  | "KEY_PAIR"
  | "ELASTIC_IP"
  | "EBS_VOLUME"
  | "VOLUME_ATTACHMENT"
  | "EFS_FILE_SYSTEM"
  | "EFS_MOUNT_TARGET"
  | "EFS_ACCESS_POINT"
  | "RDS"
  | "RDS_READ_REPLICA"
  | "RDS_CLUSTER"
  | "RDS_CLUSTER_INSTANCE"
  | "S3"
  | "DYNAMODB_TABLE"
  | "ELASTICACHE_REDIS"
  | "ELASTICACHE_SUBNET_GROUP"
  | "ELASTICACHE_PARAMETER_GROUP"
  | "SECURITY_GROUP"
  | "CLOUDFRONT"
  | "LOAD_BALANCER_TARGET_GROUP"
  | "LOAD_BALANCER_TARGET_GROUP_ATTACHMENT"
  | "ROUTE53_RECORD"
  | "ROUTE53_ZONE"
  | "WAF_WEB_ACL"
  | "WAF_WEB_ACL_ASSOCIATION"
  | "LOAD_BALANCER"
  | "LOAD_BALANCER_LISTENER"
  | "LAMBDA"
  | "LAMBDA_ALIAS"
  | "LAMBDA_EVENT_SOURCE_MAPPING"
  | "AMI"
  | "IAM_ROLE"
  | "IAM_POLICY"
  | "IAM_INSTANCE_PROFILE"
  | "KMS_KEY"
  | "KMS_ALIAS"
  | "ACM_CERTIFICATE"
  | "ACM_CERTIFICATE_VALIDATION"
  | "COGNITO_USER_POOL"
  | "COGNITO_USER_POOL_CLIENT"
  | "DB_SUBNET_GROUP"
  | "SECRETS_MANAGER_SECRET"
  | "VPC_ENDPOINT"
  | "CLOUDWATCH_LOG_GROUP"
  | "CLOUDWATCH_LOG_STREAM"
  | "CLOUDWATCH_METRIC_ALARM"
  | "CLOUDWATCH_DASHBOARD"
  | "CLOUDWATCH_LOG_RESOURCE_POLICY"
  | "CLOUDTRAIL"
  | "XRAY_GROUP"
  | "XRAY_SAMPLING_RULE"
  | "API_GATEWAY_REST_API"
  | "API_GATEWAY_WEBSOCKET_API"
  | "API_GATEWAY_RESOURCE"
  | "API_GATEWAY_METHOD"
  | "API_GATEWAY_INTEGRATION"
  | "API_GATEWAY_DEPLOYMENT"
  | "API_GATEWAY_STAGE"
  | "API_GATEWAY_V2_ROUTE"
  | "API_GATEWAY_V2_INTEGRATION"
  | "API_GATEWAY_V2_STAGE"
  | "LAMBDA_PERMISSION"
  | "SNS_TOPIC"
  | "SNS_TOPIC_SUBSCRIPTION"
  | "SQS_QUEUE"
  | "EVENTBRIDGE_RULE"
  | "EVENTBRIDGE_TARGET"
  | "EVENTBRIDGE_PERMISSION"
  | "SCHEDULER_SCHEDULE"
  | "STEP_FUNCTIONS_STATE_MACHINE"
  | "ECR_REPOSITORY"
  | "ECR_LIFECYCLE_POLICY"
  | "ECS_CLUSTER"
  | "ECS_SERVICE"
  | "ECS_TASK_DEFINITION"
  | "ECS_CAPACITY_PROVIDER"
  | "EKS_CLUSTER"
  | "EKS_NODE_GROUP"
  | "EKS_ADDON"
  | "CONFIG_CONFIGURATION_RECORDER"
  | "CONFIG_DELIVERY_CHANNEL"
  | "CONFIG_RULE"
  | "SHIELD_PROTECTION"
  | "GUARDDUTY_DETECTOR"
  | "UNKNOWN";
```

팀원은 `Security Group`, `security-group`, `cloudfront` 같은 새 문자열을 임의로 만들지 않는다. 새 Resource나 provider가 필요하면 `docs/data-models.md`, `packages/types`, API Zod schema, 프론트 소비처를 같은 PR에서 맞춘다.

## ResourceDefinition과 Terraform Capability

런타임을 직접 구성하는 deployable definition은 `optimization.runtimeNoOp: "provider_verified"`,
`artifactReuse: "verified"`, `healthVerification: "provider"`와 적용 가능한
`runtimeAdapters`를 명시한다. `aws_ecs_service`, `aws_instance`, `aws_autoscaling_group`,
`aws_eks_node_group`, `aws_eks_fargate_profile`, `kubernetes_deployment`, `aws_lambda_alias`,
`aws_s3_bucket`, `aws_cloudfront_distribution`의 합집합은 지원 adapter 10종을 모두 덮는다.
그 밖의 deployable definition은 `runtimeNoOp: "none"`으로 남아 있어 Terraform no-change와
runtime no-op을 혼동하지 않는다.

Terraform IaC 리소스의 지원 여부는 `packages/types/src/resource-definitions.ts`의 `ResourceDefinition`을 단일 출처로 삼는다. 여기에는 `provider`, domain `resourceType`, Terraform block identity, capability만 둔다. 여기서 domain `resourceType`은 AI/Architecture 분석용 분류값이며 Terraform Preview identity 기준이 아니다. `aws_region`, `aws_availability_zone`, `design_group`처럼 보드 포함 관계를 위한 area node는 Terraform HCL block으로 직접 렌더링되는 IaC 리소스가 아니므로 공통 definition에 넣지 않고 web catalog에만 둔다. 단, `aws_autoscaling_group`은 실제 Terraform resource이므로 공통 definition에 남기고, Web catalog와 diagram editor에서만 visual area behavior를 추가한다.

```ts
type ResourceCapability = {
  terraformPreview: boolean;
  terraformSync: boolean;
  parameterPanel: boolean;
  deployment: ResourceDeploymentCapability;
};

type ResourceDeploymentCapability =
  | {
      status: "supported";
      provisioner: "terraform";
      executionRole: "managed_resource";
      optimization: {
        desiredStateReuse: "verified";
        artifactReuse: "none";
        runtimeNoOp: "none";
        healthVerification: "terraform_plan";
      };
    }
  | {
      status: "excluded";
      provisioner: "terraform";
      executionRole: "managed_resource" | "data_source" | "catalog_resource";
      reason: "terraform_data_source" | "unmodeled_resource" | "catalog_only";
      optimization: {
        desiredStateReuse: "none";
        artifactReuse: "none";
        runtimeNoOp: "none";
        healthVerification: "none";
      };
    };

type ResourceDefinition = {
  id: string;
  provider: CloudProvider;
  resourceType: ResourceType;
  terraform: {
    blockType: TerraformBlockType;
    resourceType: string;
  };
  capabilities: ResourceCapability;
};
```

capability의 의미는 아래와 같다.

- `terraformPreview`: `DiagramJson -> InfrastructureGraph -> Terraform` preview 생성 대상인지 나타낸다.
- `terraformSync`: Terraform editor에서 발견한 block을 Diagram 변경 후보로 받아들일 수 있는지 나타낸다.
- `parameterPanel`: web parameter catalog에 사용자 입력 UI가 있는지 나타낸다.
- `deployment`: provider와 무관하게 실제 배포 가능한 managed resource인지, 아니면 data source, `UNKNOWN`, catalog-only resource라서 제외되는지 나타낸다. `desiredStateReuse`, `artifactReuse`, `runtimeNoOp`은 서로 다른 최적화 계층이며 한 계층의 지원이 다른 계층의 지원을 뜻하지 않는다.

`createResourceDefinition`은 `terraformPreview`, Terraform block type, domain `resourceType`에서 deployment capability를 자동으로 계산하고 잘못된 조합을 거부한다. 따라서 AWS와 Kubernetes definition은 같은 계약을 사용하며, 새 managed resource는 별도 중앙 switch 없이 검증된 desired-state 재사용 정책을 상속한다. `data` block, `UNKNOWN`, `terraformPreview: false`인 catalog-only definition은 명시적인 제외 사유와 모든 최적화 `none`을 가진다.

새 Terraform 리소스를 추가할 때는 아래 순서를 따른다.

1. `packages/types/src/resource-definitions.ts`에 shared `ResourceDefinition`을 추가하거나 capability를 수정한다. deployment capability는 factory가 자동 계산하며 임의 override하지 않는다.
2. `apps/web/features/resource-settings/catalog.ts`에는 icon URL, category, label, size 같은 화면 표현만 추가한다.
3. parameter 입력 UI가 필요하면 web parameter catalog를 추가하고 `parameterPanel` capability를 맞춘다.
4. API는 web catalog를 import하지 않는다. API는 shared `ResourceDefinition`만 보고 preview/sync 지원 여부를 판단한다.

현재 `ResourceType` union에 없는 세부 AWS Terraform type은 v1에서 `UNKNOWN`으로 둔다. domain type 확장이 필요하면 `ResourceType`과 shared definition, API/Web 소비처, 문서를 같은 변경에서 맞춘다.

## Project

```ts
type Project = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

DB 기준: `projects`

`userId`는 인증된 사용자 소유자 키다. 프로젝트 접근은 `Authorization: Bearer <accessToken>`에서 확인한 사용자와 `projects.user_id`를 비교한다.

### Project Delete Preview

프로젝트 삭제 전에는 `GET /api/projects/:id/delete-preview`로 현재 삭제 방식을 판정한다.

```ts
type ProjectDeletePreviewMode =
  | "plain"
  | "planned"
  | "deployment_history"
  | "active_resources"
  | "blocked_running_deployment"
  | "blocked_multiple_active_deployments";

type ProjectDeleteAction = "delete_project" | "delete_project_only" | "destroy_then_delete";

type ProjectDeletePreview = {
  projectId: string;
  mode: ProjectDeletePreviewMode;
  hasDeploymentHistory: boolean;
  hasPlanHistory: boolean;
  activeDeploymentId: string | null;
  activeDeploymentCount: number;
  activeResourceCount: number;
  latestDeploymentStatus: DeploymentStatus | null;
  message: string;
  availableActions: ProjectDeleteAction[];
};
```

`RUNNING` Deployment가 있으면 삭제를 막는다. 현재 AWS 리소스가 남아 있는 Deployment가 정확히 하나면 `destroy_then_delete`와 `delete_project_only`를 제공한다. 여러 개면 자동 destroy 대상을 특정하지 않고 `delete_project_only`만 제공한다.

`destroy_then_delete`는 `DELETE /api/projects/:id`의 직접 action이 아니다. 화면은 기존 Destroy Plan 생성, 승인, Destroy 실행을 완료한 뒤 `delete_project`로 프로젝트 기록을 삭제한다.

```ts
type DeleteProjectRequest = {
  action: "delete_project" | "delete_project_only";
};

type DeleteProjectResponse = {
  deleted: true;
  cleanup: {
    s3Status: "success" | "partial_failed" | "failed";
    failedObjectCount: number;
    message: string | null;
  };
};
```

프로젝트 삭제 시 `projects/{projectId}/`와 연결된 모든 `deployments/{deploymentId}/` prefix의 현재 object,
이전 version, delete marker와 프로젝트 전용 CodeBuild·IAM Role 정리를 먼저 시도한다. 이 외부 정리는
best-effort이므로 S3 또는 AWS 권한/API 오류가 발생해도 RDS의 프로젝트·배포 기록 삭제를 막거나
`managed_cleanup_failed`를 반환하지 않는다. S3 정리 실패는 응답의 `cleanup`에 남기고, CodeBuild·IAM 정리
실패는 비밀값 없이 서버 경고 로그에 남긴다. 진행 중인 Deployment, worker job 또는 project execution lease는
별도 동시성 보호이므로 계속 삭제를 차단한다.

## ArchitectureSnapshot

```ts
type ArchitectureSnapshot = {
  id: string;
  projectId: string;
  version: number;
  source: "manual" | "prompt" | "template" | "imported" | string;
  architectureJson: ArchitectureJson;
  createdAt: IsoDateTimeString;
};
```

DB 기준: `architectures`

저장된 버전은 `ArchitectureSnapshot`이다. 화면에서 다이어그램, 보드, 설계라고 부르더라도 API/DB 계약에서는 이 이름을 따른다.

## ProjectDraft

```ts
type ProjectDraft = {
  id: string;
  projectId: string;
  diagramJson: DiagramJson;
  terraformFiles?: TerraformSyncFileInput[];
  revision: number;
  serverSavedAt: IsoDateTimeString;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

DB 기준: `project_drafts`

프로젝트당 최신 draft 1개를 유지한다. `diagramJson`과 편집 중인 선택적 `terraformFiles`는 같은 revision의 화면 복구 상태로 JSONB에 저장한다. `terraformFiles`는 SketchCatch 동기화 subset이 해석하지 못하는 유효 HCL을 재접속 후에도 원문 그대로 유지하기 위한 working draft이며, 승인된 배포/릴리스 산출물의 영구 저장 기준은 계속 S3 `TerraformArtifact`다.

Project draft 저장은 클라이언트가 마지막으로 읽은 서버 revision을 명시하는 낙관적 동시성 계약을 사용한다.

```ts
type SaveProjectDraftRequest = {
  diagramJson: DiagramJson;
  terraformFiles?: TerraformSyncFileInput[];
  expectedRevision: number | null;
};

type ProjectDraftConflictResponse = ApiErrorResponse & {
  error: "conflict";
  currentRevision: number;
  currentServerSavedAt: IsoDateTimeString;
};
```

- 서버 draft를 읽은 편집은 그 `revision`을 `expectedRevision`으로 보낸다.
- 서버 draft가 없는 새 프로젝트의 최초 저장만 `expectedRevision: null`을 보낸다.
- `PUT /api/projects/:projectId/draft`는 `projectId`와 `expectedRevision`이 모두 일치하는 row만 갱신한다. 최초 생성 경쟁은 `INSERT ... ON CONFLICT DO NOTHING`으로 한 요청만 성공시킨다.
- 현재 서버 revision이 다르면 API는 `409 Conflict`와 현재 revision·저장 시각을 반환하며 DiagramJson을 변경하지 않는다.
- `GET /api/projects/:projectId/draft`는 `private, no-store`로 응답한다. Workspace는 서버 조회가 성공하고 서버 draft가 있으면 해당 값을 기준으로 열고, IndexedDB의 로컬 draft도 같은 서버 revision으로 교체한다. 서버 draft가 없는 경우에만 로컬 draft를 사용한다. 서버 조회 실패는 오래된 로컬 draft로 숨기지 않는다.
- IndexedDB의 `LocalProjectDraft.baseServerRevision`은 로컬 편집이 시작된 서버 revision이다. 로컬 저장 횟수와 함께 증가하지 않고, 서버 저장 성공 또는 최신 상태 재로드 후 반환된 revision으로 교체된다.
- 일반 Project Workspace는 탭 인스턴스마다 별도의 IndexedDB `workspaceId`를 생성하고 `sessionStorage`에 보관해 같은 탭의 새로고침에서 재사용한다. 시작 시 해당 ID를 `Web Locks`로 배타 점유하므로 탭 복제로 `sessionStorage`가 복사되어도 lock을 얻지 못한 새 탭은 새 ID를 발급한다. 따라서 같은 프로젝트를 연 다른 탭의 recovery draft가 충돌 탭의 로컬 복구본을 덮어쓰지 않으면서 새로고침 후에도 해당 탭의 복구본을 찾는다. 기존 `project:{projectId}` key의 recovery draft는 처음 읽을 때 탭 전용 key로 복사한다. URL 또는 호출자가 `localCacheWorkspaceId`/`workspaceId`를 명시한 특수 복구 흐름만 해당 scope를 재사용한다.

## ProjectAsset와 TerraformArtifact

파일성 산출물은 S3에 저장하고, RDS에는 metadata와 `objectKey`만 저장한다.

```ts
type ProjectAsset = {
  id: string;
  projectId: string;
  architectureId: string | null;
  assetType: "diagram_png" | "diagram_svg" | "terraform_file" | "project_export_zip" | "thumbnail";
  objectKey: string;
  fileName: string;
  contentType: string;
  byteSize: number | null;
  createdAt: IsoDateTimeString;
};

type TerraformArtifact = ProjectAsset & {
  assetType: "terraform_file";
  architectureId: string;
};
```

승인된 Terraform 산출물 원문은 RDS의 독립 `content` 컬럼에 저장하지 않는다. 다만 최신 편집 복구를 위한 `ProjectDraft.terraformFiles`는 DiagramJson과 함께 RDS JSONB에 임시 working state로 저장한다. Terraform, export, cleanup manifest처럼 SketchCatch가 생성한 파일성 산출물의 영구 저장 기준은 SketchCatch S3 object다. 사용자 application artifact의 실제 byte는 사용자 계정의 ECR/S3 또는 provider storage에 그대로 두고 SketchCatch production ECR/S3로 복사하지 않는다.

## Terraform 생성과 Editor 검증 DTO

Terraform 생성 API는 `DiagramJson`을 입력으로 받지만 내부 pipeline은 `DiagramJson -> InfrastructureGraph -> Terraform` 순서로 나뉜다. API용 preview orchestration은 `terraform-preview.ts`가 담당하고, `diagram-to-terraform.ts`는 이미 정규화된 `InfrastructureGraph`를 Terraform HCL 문자열로 렌더링하는 책임만 가진다.

Terraform Preview의 `InfrastructureGraphNode.config`는 preview 가능한 resource node의 `parameters.values`를 입력으로 사용한다. `node.metadata`와 parameter-reference edge metadata는 HCL에 렌더링하지 않는다. `aws_autoscaling_group`의 `desiredCapacity`/`desired_capacity`는 값이 비어 있거나 number가 아니면 Preview에서 생략하며, number인 `0`은 유효한 값으로 출력한다.

```ts
type TerraformGenerateRequest = {
  diagramJson: DiagramJson;
};

type TerraformGenerateResponse = {
  terraformCode: string;
  architectureDiagnostics: ArchitectureDiagnostic[];
};
```

`POST /api/terraform/generate`는 `preview` mode Architecture Dependency Diagnostics를 함께 반환한다. 이 diagnostics는 Terraform HCL 생성 결과와 구분된 구조 경고이며, `warning`만으로는 HTTP 성공 응답이나 Terraform Preview 생성을 바꾸지 않는다.

Terraform 역동기화는 사용자가 편집 중인 Terraform 문자열을 기존 `DiagramJson`에 반영한다. 명백한 문법·구조 오류는 `error`로 저장을 차단한다. 유효하지만 SketchCatch subset 밖인 top-level block, expression, nested block은 `warning`으로 반환하고 원문 전용으로 보존한다. 미지원 구문이 포함된 resource/data block은 부분 값으로 Diagram을 변경하지 않는다.

```ts
type TerraformSyncToDiagramRequest = {
  diagramJson: DiagramJson;
  terraformCode: string;
  terraformFiles?: TerraformSyncFileInput[];
};

type TerraformSyncFileInput = {
  fileName: string;
  terraformCode: string;
};

type TerraformSyncToDiagramResponse = {
  diagramJson: DiagramJson;
  diagnostics: TerraformDiagnostic[];
  preservedResourceAddresses?: string[];
  proposals?: TerraformDiagramChangeProposal[];
};
```

`terraformCode`는 기존 단일 파일 호환용 입력이다. Workspace가 여러 Terraform 파일을 들고 있으면 `terraformFiles`를 함께 보내며, API는 `fileName + block identity`를 기준으로 source file metadata를 유지한다.

동일한 `(terraformBlockType, resourceType, resourceName)`을 가진 Terraform block과 Diagram node는 같은 리소스로 보고 `parameters.values`만 갱신할 수 있다. Terraform에만 있거나 Diagram에만 있는 구조 변경, 이름 변경 후보는 API 응답에서 `proposals`로 표시할 수 있다.

```ts
type TerraformBlockIdentity = {
  terraformBlockType: "resource" | "data";
  resourceType: string;
  resourceName: string;
};

type TerraformDiagramChangeProposal =
  | {
      kind: "create_candidate";
      identity: TerraformBlockIdentity;
      nodeId?: string;
      sourceFileName?: string;
      line?: number;
      metadata?: DiagramNodeMetadata;
      position?: DiagramNode["position"];
      parameters: DiagramNodeParameters;
    }
  | {
      kind: "delete_candidate";
      identity: TerraformBlockIdentity;
      nodeId: string;
      resourceAddress: string;
    }
  | {
      kind: "rename_candidate";
      from: TerraformBlockIdentity;
      to: TerraformBlockIdentity;
      sourceFileName?: string;
      line?: number;
      nodeId: string;
      resourceAddress: string;
    };
```

`proposals`는 Terraform editor 저장 또는 배포 준비처럼 사용자가 명시적으로 실행한 Terraform sync action 안에서 반영된다. 프론트엔드는 별도 변경 제안 확인 UI를 띄우지 않고, 해당 명시 action을 사용자 승인 경계로 삼아 create/delete/rename 후보를 `DiagramJson`에 자동 반영할 수 있다.

Terraform editor 저장 sync action에서 `terraformCode`와 모든 `terraformFiles[].terraformCode`가 공백이면 사용자가 Terraform 리소스를 모두 삭제하려는 명시 의도로 본다. 이때 API는 `terraformSync` capability가 `true`인 Diagram-only resource를 `delete_candidate`로 반환하고, Diagram도 이미 비어 있으면 diagnostics 없이 성공한다.

Terraform Sync에서 `provider "aws"` block은 Diagram resource가 아니므로 create/delete/rename proposal 대상이 아니다.
입력 Terraform이 `provider "aws"` block만 포함하면 기존 Diagram resource 삭제 의도가 아니므로 `diagnostics: []`,
`proposals: []`인 no-op으로 처리한다. Region 영역 리소스는 `provider "aws"` block으로 생성하지 않고,
`aws_region` node의 `parameters.values.awsRegion`으로만 저장한다.

Terraform editor에서 새로 발견한 구조 변경 proposal의 v1 범위는 shared `ResourceDefinition`의 `terraformSync` capability가 `true`인 Terraform block이다. Terraform Preview 렌더링 대상은 `terraformPreview` capability로 따로 판단한다. 따라서 `aws_cloudfront_distribution`처럼 sync는 가능하지만 preview는 아직 제외되는 리소스가 있을 수 있다. 이미 같은 identity로 매칭된 block은 parser가 안전하게 해석할 수 있는 경우 `parameters.values` 갱신 대상이 될 수 있다.

Parameter panel의 `Advanced Parameters` UI는 내부 노출 정책이 정해질 때까지 숨긴다. 이는 UI 노출 정책이며 저장 정책이 아니다. 기존 `parameters.values`에 남아 있는 optional 또는 catalog 밖 값은 사용자가 명시적으로 삭제하지 않는 한 보존하고, Terraform Preview renderer가 이해할 수 있으면 계속 렌더링 입력으로 사용한다.

Terraform editor 검증은 static-only 선행 검사다. API는 Terraform CLI를 실행하지 않고 문자열만 분석해 빠른 diagnostics를 반환한다. 검사 범위는 빈 코드, 괄호/대괄호/소괄호 짝, 닫히지 않은 문자열, `resource`/`data` block header, 중복 block address, 잘못된 attribute 라인, nested block을 attribute처럼 쓴 경우, 따옴표로 감싼 Terraform reference, 선언되지 않은 local resource reference, shared `ResourceDefinition`에 없는 AWS Terraform block이다.

구조 토큰 검사에서 error가 나오면 같은 파일의 body/reference 검사는 중단한다. 닫히지 않은 문자열이나 `{}` 때문에 depth 계산이 깨진 상태에서 뒤쪽 `resource` header를 이전 block body 오류처럼 표시하지 않기 위해서다. 이 경우 사용자는 먼저 가장 앞쪽 구조 오류를 고친 뒤 다시 검증한다.

Workspace가 여러 Terraform 파일을 들고 있으면 `terraformFiles`를 함께 보내고, API는 파일별 문자열을 독립적으로 검사해 `sourceFileName`을 diagnostics에 붙인다. `terraformCode`는 단일 파일 호환용 입력이자 빈 코드 저장 의도 판별용 입력이다. Editor validation은 provider schema 전체를 재현하지 않으며, 실제 `terraform init`, `terraform validate`, `plan`, `apply`, `destroy`, backend/state mutation은 Deployment 실행 경계에서만 다룬다.

```ts
type TerraformDiagnosticSeverity = "info" | "warning" | "error";

type TerraformDiagnostic = {
  severity: TerraformDiagnosticSeverity;
  message: string;
  code?: string;
  line?: number;
  sourceFileName?: string;
  resourceAddress?: string;
  nodeId?: string;
};

type TerraformValidateRequest = {
  terraformCode: string;
  terraformFiles?: TerraformSyncFileInput[];
};

type TerraformValidateResponse = {
  diagnostics: TerraformDiagnostic[];
};
```

## Architecture Dependency Diagnostics

Architecture Dependency Diagnostics는 `DiagramJson`의 영역 포함 관계와 `parameters.values` 참조를 평가한 현재 Board 파생 상태다. Terraform source-code diagnostic과 같은 Issues 화면에 표시할 수 있지만, Terraform 파일 줄 번호나 localStorage 검증 이력으로 취급하지 않는다. Board 저장 데이터, RDS, S3, Redis에 별도 기록하지 않는다.

```ts
type ArchitectureValidationMode = "contextual" | "preview" | "pre_deployment";
type ArchitectureDiagnosticSeverity = "info" | "warning" | "error";

type ArchitectureDiagnosticRemediation = {
  label: string;
  action: "focus-resource" | "open-parameter" | "open-guidance";
  parameterPath?: string;
};

type ArchitectureDiagnostic = {
  source: "architecture-rule";
  code: string;
  severity: ArchitectureDiagnosticSeverity;
  ruleId: string;
  resourceNodeId: string;
  relatedNodeIds: string[];
  summary: string;
  message: string;
  remediation: ArchitectureDiagnosticRemediation[];
};
```

`contextual`은 확정된 영역 배치 또는 파라미터 변경 뒤에만 관련 리소스를 점검하고, 새 아이콘 생성·drag 중에는 표시하지 않는다. `preview`와 `pre_deployment`는 지원 리소스를 전체 점검한다. 이 진단의 `warning`은 Terraform code 생성이나 Deployment 실행을 단독으로 차단하지 않으며, 차단 정책은 Pre-Deployment Check와 Deployment Safety Gate가 별도로 결정한다.

Editor validation diagnostics는 Deployment의 `init`, `validate`, `plan`, `apply` stage와 섞지 않는다. Deployment 실행은 승인된 Terraform artifact와 AWS 연결을 기준으로 별도 안전 게이트를 가진다. Editor validation은 사용자 편집 코드가 저장 가능한지 확인하는 선행 검사일 뿐, 실제 cloud mutation을 의미하지 않는다.

## AwsConnection

`AwsConnection`은 프로젝트별 설정이 아니라 사용자 계정 단위의 AWS Role 연결이다. 사용자는 환경설정에서 AWS 계정을 한 번 연결하고, 각 프로젝트의 Deployment 흐름에서는 검증된 연결을 선택해 재사용한다.

같은 사용자가 같은 AWS `accountId`를 `verified` 상태로 중복 연결할 수 없도록 `userId + accountId` partial unique index를 둔다. `pending` 연결은 아직 accountId를 모르기 때문에 생성될 수 있지만, verify 시점에 이미 연결된 AWS account면 실패 처리한다.

새 AWS 연결을 만들면 사용자별 오래된 미검증 연결을 정리한다. 기본 정책은 `pending`/`failed` 연결 중 최신 5개를 남기고 나머지를 삭제하는 것이다. `verified` 연결과 `Deployment`가 참조 중인 연결은 자동 정리 대상에서 제외한다.

DB 기준: `aws_connections`

저장하는 값은 연결 metadata뿐이다. Access Key ID, Secret Access Key, Session Token, `AssumeRole` 결과 credential은 저장하지 않는다.

```ts
type AwsConnection = {
  id: string;
  userId: string;
  accountId: string | null;
  roleArn: string | null;
  externalId: string;
  region: "ap-northeast-2";
  status: "pending" | "verified" | "failed";
  lastVerifiedAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

type AwsConnectionCleanupRetry = {
  awsConnection: AwsConnection;
};

type AwsConnectionListResponse = {
  awsConnections: AwsConnection[];
  cleanupRetries: AwsConnectionCleanupRetry[];
};
```

`GET /api/aws/connections`의 `awsConnections`에는 현재 사용할 수 있는 `verified` 연결만 포함한다.
삭제 중 오류가 발생한 이전 연결은 배포나 GitHub 빌드 선택지에 다시 섞이지 않도록
`cleanupRetries`에 별도로 반환한다. 내부 `deletionErrorSummary`는 이 응답으로 노출하지 않고,
설정 화면은 안전한 안내 문구와 기존 삭제 미리보기·확인 절차를 통해 정리 재시도를 제공한다.

같은 AWS account의 이전 `verified` 연결이 정리 실패 상태로 남아 있으면 새 연결 검증은
`409 conflict`로 중단하고 이전 연결 정리를 먼저 재시도하도록 안내한다. 동시에 발생한 검증 요청이
`aws_connections_user_verified_account_unique` 제약에서 충돌해도 DB query와 params를 노출하지 않고
같은 도메인 충돌 응답으로 변환한다.

API 경로:

- `GET /api/aws/connections`
- `POST /api/aws/connections`
- `POST /api/aws/connections/:connectionId/test`
- `POST /api/aws/connections/:connectionId/verify`
- `POST /api/aws/connections/:connectionId/verify-created-role`
- `GET /api/aws/connections/:connectionId/deletion-preview`
- `DELETE /api/aws/connections/:connectionId`
- `GET /api/aws/connections/:connectionId/cloudformation-template`

2026-07-07 기준 새 AWS 연결의 CloudFormation Role 이름은
`SketchCatchTerraformExecutionRole-<connection-prefix>`입니다. `verify-created-role`은 Account ID와
connection ID로 이 ARN을 계산해 저장합니다. 기존에 저장됐거나 사용자가 직접 검증한
`SketchCatchTerraformExecutionRole` 고정 이름 Role ARN은 하위 호환을 위해 계속 허용합니다.

`GET /api/aws/connections/:connectionId/deletion-preview`는 AWS를 변경하지 않고 RDS에 기록된 정리 대상을
보여준다. 응답에는 SketchCatch가 만든 CodeBuild project, 그 전용 Service Role, CodeBuild log group,
그리고 이 exact CodeBuild resource 집합에 묶인 `confirmationToken`이 포함된다. 일반 AWS 연결 삭제는
GitHub CodeConnection을 정리 대상으로 포함하지 않는다. 연결 삭제 후에도 보존할 Reverse Engineering 스캔
수는 `preservedRecords.reverseEngineeringScans`로 함께 반환한다.

`DELETE /api/aws/connections/:connectionId`는 `confirmedManagedCleanup: true`와 방금 확인한
`confirmationToken`을 필수로 받는다. 둘 중 하나가 없거나 대상 집합이 바뀌면 AWS API를 호출하지 않는다.
확인이 유효할 때만 `ManagedBy=SketchCatch` ownership tag와 DB 좌표가 모두 일치하는 CodeBuild project,
그 전용 Service Role과 log group을 정리한 뒤 연결 metadata를 삭제한다. GitHub CodeConnection의 AWS 원격
리소스는 이 경로에서 삭제하지 않으며, 명시적인 GitHub 빌드 연결 해제 경로에서만 별도로 정리한다. 사용자가
AWS 연결을 위해 만든 CloudFormation Stack과 Terraform Execution Role은 자동으로 삭제하지 않는다. `Deployment`가 참조
중인 연결은 삭제할 수 없고 `409 conflict`를 반환한다. cleanup 실패 claim과 오류 요약은 남겨 같은 미리보기와
명시 확인 절차로 안전하게 재시도한다. 정리할 CodeBuild project가 없다면 이미
삭제된 Terraform Execution Role을 다시 AssumeRole하지 않고 연결 metadata 정리를 계속한다. 연결을 참조하던
Reverse Engineering 스캔은 삭제하지 않고 `awsConnectionId = null`로 분리해 과거 결과를 계속 열람할 수 있게 한다.

`Deployment`는 이 연결을 `awsConnectionId`로 참조한다.

기존 `verified` 연결에 Reverse Engineering용 읽기 권한이 부족하면 새 `AwsConnection` row를 만들지 않는다.
화면의 `가져오기 권한 추가`는 같은 연결이 사용하는 AWS Role의 갱신 절차를 시작한다. 사용자가 AWS에서 변경을
승인한 뒤 서버가 같은 Role과 connection ID를 다시 검증하며, 승인 전에는 SketchCatch가 AWS 권한을 임의로
바꾸거나 연결 상태를 성공으로 간주하지 않는다.

## ProjectDeploymentTarget

`0046_runtime_convergence.sql`부터 기존 `runtimeTargetKind`/`runtimeConfig`는 호환 입력으로
계속 읽되, 저장 시 provider-neutral `runtimeTarget`과 `deploymentTargetFingerprint`를 함께
기록한다. fingerprint 입력은 contract version, project, provider, account, region과 아래
canonical target만 포함하며 `artifactFingerprint`는 포함하지 않는다.

canonical target은 `orchestrator`, `compute`, `capacity`, `rollout`, `health`를 분리하고 다음
adapter를 discriminator로 사용한다.

- `ecs_service_fargate`, `ecs_service_ec2_capacity_provider`
- `ec2_instance`, `ec2_auto_scaling_group`
- `eks_managed_node_group`, `eks_self_managed_node`, `eks_fargate_profile`
- `kubernetes_deployment`
- `lambda_alias`
- `static_s3_cloudfront`

EKS와 일반 Kubernetes는 ECS의 변형이 아니라 별도 adapter다. 기존 `ecs_fargate`, `lambda`,
`ec2_asg`, `static_site` DTO는 canonical target으로 정규화해 읽으며, 명시적으로 함께 보낸
canonical target이 legacy config와 동일한 provider resource 및 rollout/health 구성을 나타내지 않으면
PUT을 거부한다. verified connection의 account나 region이 바뀌면 동일한 runtime 좌표라도 deployment
target fingerprint가 달라진다.

`ProjectDeploymentTarget`은 프로젝트가 실제 application을 배포할 단일 타깃이다. 프로젝트 ID가
`project_deployment_targets`의 PK이므로 프로젝트마다 row는 하나만 존재한다. MVP는 AWS Provider Adapter를
먼저 사용하지만, UI와 application release 계약은 provider-neutral 용어를 유지한다. 새 설정은 소유자가 가진
`verified` connection과 그 connection의 region만 선택할 수 있다.

```ts
type RuntimeTargetKind = "ecs_fargate" | "lambda" | "ec2_asg" | "static_site";

type ProjectDeploymentTarget = {
  projectId: string;
  provider: "aws";
  connectionId: string | null;
  region: string;
  runtimeTargetKind: RuntimeTargetKind;
  confirmedBuildConfig: ConfirmedBuildConfig | null;
  runtimeConfig: ProjectDeploymentRuntimeConfig | null;
  rolloutStrategy: "all_at_once";
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

type EcsFargateRuntimeConfig = {
  runtimeTargetKind: "ecs_fargate";
  codeBuildProjectName: string;
  buildEnvironmentId: string | null;
  ecrRepositoryName: string;
  ecrRepositoryArn: string | null;
  clusterName: string;
  serviceName: string;
  containerName: string;
  containerPort: number;
  taskDefinitionFamily: string | null;
  targetGroupArn: string | null;
  apiOriginUrl: string | null;
  frontendBucketName: string | null;
  cloudFrontDistributionId: string | null;
  cloudFrontDomainName: string | null;
  outputUrl: string | null;
};

type LambdaRuntimeConfig = {
  runtimeTargetKind: "lambda";
  codeBuildProjectName: string;
  functionLogicalId: string;
  functionName: string;
  aliasName: string;
  codeDeployApplicationName: string;
  codeDeployDeploymentGroupName: string;
  outputUrl: string;
};

type Ec2AsgRuntimeConfig = {
  runtimeTargetKind: "ec2_asg";
  codeBuildProjectName: string;
  codeDeployApplicationName: string;
  codeDeployDeploymentGroupName: string;
  autoScalingGroupName: string;
  outputUrl: string;
};

type StaticSiteRuntimeConfig = {
  runtimeTargetKind: "static_site";
  codeBuildProjectName: string;
  hostingBucketName: string;
  cloudFrontDistributionId: string;
  cloudFrontOriginId: string;
  outputUrl: string;
};
```

Static target은 저장소 분석에서 정확히 하나로 확인한 Vite `dist`, Create React App `build`, 또는
Next.js static export `out` 경로를 `static_output` evidence로 확정한다. lockfile에서 선택한 허용 install
preset, versioning이 활성화된 S3 hosting bucket, CloudFront distribution/origin, HTTPS Output URL을
비민감 `runtimeConfig`로 저장한다. `0040_static_gitops_runtime.sql`은 기존 세 runtime discriminator를
보존하면서 `static_site`를 추가한다.

EC2/ASG target은 저장소 분석에서 정확히 하나로 확인한 `appspec.yml|yaml`을 `appspec` build evidence로
확정하고 CodeDeploy application/deployment group, Auto Scaling group, HTTPS Output URL을 비밀이 아닌
`runtimeConfig` 좌표로 저장한다. `0039_ec2_asg_gitops_runtime.sql`은 기존 ECS와 Lambda discriminator를
보존하면서 `ec2_asg`를 확장한다. 새 PUT은 안전한 resource name, runtime discriminator 일치, credential·query·
fragment가 없는 HTTPS URL을 요구한다.

EC2/ASG GitOps release evidence는 현재 bundle의 SHA-256, S3 URI와 VersionId, 이전 검증 bundle URI와
VersionId, 원본·활성 CodeDeploy deployment ID, 전체/성공 instance 수와 `codedeploy_failure | instance_failure |
health_check_failure | null` 실패 원인을 가진다. API는 verified connection으로
CodeDeploy deployment/group, S3 checksum, ASG healthy InService instance, CodeDeploy instance status를 다시
조회한 뒤 모두 일치할 때만 공통 `ApplicationRelease` 원장에 기록한다.

Lambda target은 저장소 분석에서 단 하나로 확인된 `template.yaml|yml`을 `sam_template` build evidence로
확정하고, SAM logical ID, Lambda function/alias, CodeDeploy application/deployment group, HTTPS Output
URL을 비민감 `runtimeConfig`로 저장한다. `0038_lambda_gitops_runtime.sql`은 기존 ECS JSON 계약을
유지하면서 Lambda discriminator를 추가한다. API는 runtime kind와 JSON discriminator가 다르거나
`$LATEST`, 숫자 전용 alias, unsafe resource name, credential/query/fragment가 포함된 URL을 거부한다.

`ConfirmedBuildConfig`는 임의 shell command를 저장하지 않는다. repository-relative `sourceRoot`, evidence 종류와
경로, 허용된 install/build preset, runtime별 artifact/entrypoint/health path, exact SemVer tag 또는 manifest
version, 확인한 commit SHA와 시각만 저장한다. 웹 포함 ECS target의 `ecsWeb`은 API의 source root,
Dockerfile, container port, health path와 frontend의 source/output, package manifest, lockfile, package manager
version, install/build preset을 분리해 저장한다. 이 값 전체를 candidate config fingerprint에 포함한다. 기존
runtime 필드는 Lambda·EC2·정적 사이트와 legacy ECS row를 읽기 위해 유지하지만, 새 웹 포함 ECS PUT은 완전한
`ecsWeb.api`와 `ecsWeb.frontend`가 필수다.

`runtimeConfig`는 provider adapter가 실제 런타임을 재조회하는 데 필요한 비밀이 아닌 좌표다. ECS/Fargate,
Lambda, EC2/ASG, Static target은 각 adapter의 완전한 좌표가 필수다. `0037_ecs_gitops_runtime.sql`은 기존
row를 유지하기 위해 nullable JSONB로 추가했고, `0038_lambda_gitops_runtime.sql`,
`0039_ec2_asg_gitops_runtime.sql`, `0040_static_gitops_runtime.sql`이 discriminator를 순차 확장한다.
새 PUT은 service validation에서 선택한 runtime과 일치하는 완전한 값을 요구한다.

ECS Fargate target은 Board 생성 전에 실제 entry URL이 아직 없을 수 있으므로 `outputUrl: null`을 저장할 수 있다. 이때도 CodeBuild, ECR, cluster, service, container 좌표와 확정된 Dockerfile/commit SHA는 필수다. `application` scope의 Direct release 준비와 GitOps workflow/settings 생성은 안전한 HTTPS `outputUrl`이 없으면 `DEPLOYMENT_OUTPUT_URL_REQUIRED`로 중단하며 빈 환경 변수를 배포 입력으로 넘기지 않는다. `full_stack` ECS는 URL이 없는 상태에서도 immutable artifact를 준비할 수 있다. 승인된 Terraform Apply 뒤 비민감 `api_base_url` HTTPS output과 준비 시점의 runtime 좌표 fingerprint가 모두 유효할 때만 같은 target row에 URL을 저장하고 runtime release를 시작한다.

API는 `GET|PUT /api/projects/:projectId/deployment-target`을 사용한다. Direct와 GitOps는 같은 target row를
읽으며 환경별 복제, EKS, 임의 rollout 전략은 이 계약에 포함하지 않는다.

### Direct application release 실행 계약

웹 포함 ECS target은 SketchCatch가 관리하는 격리된 `ProjectBuildEnvironment`를 가진다. CodeBuild project는
확인된 commit만 checkout하고 API OCI archive, frontend archive, 파일별 SHA-256 manifest를 만든 뒤 SketchCatch
내부 Artifact S3의 `ReleaseCandidate` prefix에 업로드한다. CodeBuild는 사용자 배포용 ECR, ECS, 서비스 S3, CloudFront를
변경하지 않는다. Docker layer cache는 사용자 AWS 계정의 프로젝트 전용 build-cache ECR Repository에만 읽고 쓴다. 실제 release activation은 SketchCatch trusted worker가 수행한다. Lambda, EC2/ASG, Static의
기존 runtime adapter는 이 ECS 전용 전환과 별도로 호환한다. 사용자 임의 shell 문자열은 저장하거나 실행하지 않는다.
Direct build를 시작하기 전에 active GitHub Source Repository의 owner/name과 CodeBuild project의 `GITHUB` source
URL을 비교하고, source auth가 `CODECONNECTIONS`인지 확인한다. 다른 저장소, OAuth source, inactive installation은
build 시작 전에 차단한다.

scope별 실행 의미는 다음과 같다.

- `infrastructure`: Terraform Plan 승인 후 Terraform Apply/Destroy를 실행한다.
- `application`: immutable artifact와 artifact approval manifest를 준비한 후 runtime release만 실행한다. Terraform init/plan/apply는 실행하지 않는다.
- `full_stack`: immutable artifact를 먼저 준비하고 Terraform Plan을 승인한다. 실행 시 Terraform Apply와 output/state/resource inventory를 먼저 저장하고, 안전한 `api_base_url`을 ECS target에 연결한 뒤 준비된 artifact를 runtime에 release한다. output 누락·민감값·HTTP URL·준비한 ECR/cluster/service/container/port 좌표 불일치는 release 전에 실패로 기록하며 이미 저장한 Terraform 결과는 보존한다. 같은 승인 실행과 Terraform state inventory가 증명하는 Task Definition, IAM role, ALB/Target Group, S3, CloudFront와 파생 URL 전이는 정상적인 Terraform 관리 좌표 갱신으로 받아들이고, trusted worker가 실제 AWS 상태를 다시 검증한다.

Direct runtime 성공은 build 결과만 신뢰하지 않는다. ECS, Lambda, CodeDeploy/S3/ASG, S3/CloudFront adapter가
AWS 상태를 다시 조회해 commit, digest, provider revision, HTTPS Output URL과 health가 모두 일치할 때만 성공을
기록한다. provider metadata에는 CodeBuild build revision과 이전 정상 runtime revision을 함께 남겨 rollback과
cleanup 기준을 고정한다.

`application` scope cleanup은 Terraform state를 요구하지 않는다. 성공한 `ApplicationRelease`의 현재 revision과
provider metadata의 이전 정상 revision을 `application_release_cleanup_plan` JSON artifact로 고정하고, 사용자가
그 artifact hash와 AWS account/region snapshot을 승인한 뒤에만 CodeBuild `cleanup` phase를 실행한다. 실행 직전
현재 release와 승인 manifest가 다르면 중단하며, runtime adapter가 이전 revision 복구를 AWS에서 재조회해 확인한
경우에만 release를 `rolled_back`, Deployment를 `DESTROYED`로 기록한다. `infrastructure`와 `full_stack` cleanup은
기존 Terraform state 기반 Destroy 계약을 유지한다.

## ApplicationArtifact

`ApplicationArtifact`는 Direct Deployment와 Git/CI/CD가 공유하는 provider-neutral application build 원장이다.
실제 image, zip, bundle, manifest, chart, machine image byte는 사용자 계정의 ECR/S3 또는 해당 provider storage에
남기고, RDS `application_artifacts`에는 identity, provider location metadata, digest, 검증 상태만 저장한다.
Redis Runtime Cache와 RDS row 어느 쪽도 provider 존재 여부의 source of truth가 아니다.

```ts
type ApplicationArtifactKind =
  | "container_image"
  | "lambda_zip"
  | "codedeploy_bundle"
  | "static_bundle"
  | "kubernetes_manifest"
  | "helm_chart"
  | "machine_image";

type ApplicationArtifactProviderLocation = {
  provider: CloudProvider;
  accountId: string;
  region: string;
  storageNamespace: string;
  artifactReference: string;
  ownershipScope: string;
};

type ApplicationArtifact = {
  id: string;
  projectId: string;
  sourceRepositoryId: string | null;
  kind: ApplicationArtifactKind;
  artifactFingerprint: string;
  repositoryIdentity: string;
  commitSha: string;
  buildConfigSha256: string;
  buildContractVersion: string;
  targetOs: string;
  targetArchitecture: string;
  buildInputIdentitySha256: string;
  digestAlgorithm: "sha256";
  digest: string;
  location: ApplicationArtifactProviderLocation;
  status: "available";
  verifiedAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

canonical `artifactFingerprint`는 repository provider/owner/name identity, exact commit SHA, 정규화한
`ConfirmedBuildConfig`, build contract/buildspec version, target OS/architecture, 비밀값을 포함하지 않는 build
input identity를 결합해 계산한다. 파일 key와 JSON key 순서는 canonical 정렬을 사용한다. runner 종류, worker 수,
queue, retry, timeout처럼 artifact byte를 바꾸지 않는 orchestrator/capacity 값은 포함하지 않는다. secret 형태의
build input key는 fingerprint 입력 단계에서 거부하며 secret value를 hash하거나 저장하는 방식으로 우회하지 않는다.
RDS row의 내부 상태는 `building | available | invalid | failed`이며 API는 완전한 digest/location을 가진
`available` artifact만 반환한다.

재사용 직전 provider adapter는 artifact 존재, exact SHA-256 digest, account, region, 승인된 storage namespace/reference,
project ownership scope를 read-only로 다시 검증한다. ECR은 repository와 image digest를, S3는 expected bucket owner와
provider가 계산한 object checksum을 검증하며 checksum이 없으면 object stream의 SHA-256을 계산한다. 사용자가 쓸 수
있는 custom object metadata는 digest 증거로 신뢰하지 않는다. 검증 실패는 row를
`invalid`로 만들고 cache miss로 처리해 정상 build로 fallback한다. 실제 credential이나 live mutation 없이 순수
adapter 계약과 test double로 검증하며, raw provider 오류와 credential은 DB나 로그에 남기지 않는다.

같은 project와 fingerprint의 `building | available` row는 하나만 허용한다. build claim은 SHA-256 token과 만료 lease로
소유권을 고정하며, build 동안 heartbeat가 lease를 갱신한다. 만료되지 않은 claim은 두 번째 build를 시작하지 않는다.
만료된 lease만 새 claim으로 인수할 수 있고 renew/complete/fail/invalidate 갱신은 project, claim, status가 모두
일치해야 한다. `ApplicationRelease`의 복합 FK
`(artifactId, projectId)`와 project-scoped 조회가 cross-project reuse를 차단한다. Source Repository가 삭제되면
`sourceRepositoryId`만 `null`이 되며 검증된 artifact identity와 release 연결은 보존한다.

`GET /api/projects/:projectId/artifacts`는 인증된 project의 `available` artifact만 반환한다. GitOps release evidence
v1은 기존 필드를 그대로 허용하고 registry가 canonical identity를 계산한다. v2는 `artifact` extension에 kind,
fingerprint, build contract version, SHA-256 digest, provider location을 함께 전달하며 strict Zod validation과 canonical
fingerprint 일치를 모두 통과해야 한다. v1 producer는 계속 호환되고 malformed v2를 v1로 downgrade하지 않는다.
이 저장 경계는 migration `0045_application_artifact_registry.sql`에서 추가한다.

## ApplicationRelease

`ApplicationRelease`는 nullable `runtimeAdapterKind`, `deploymentTargetFingerprint`,
`convergenceOutcome`을 추가한다. legacy row와 GitOps evidence v1/v2는 세 값을 `null`로 읽고,
provider 검증을 통과한 새 release만 `already_active | rolled_out`을 기록한다. 이 필드는
`artifactId`/`artifactFingerprint`와 독립이며 release 이력, rollback evidence, retention 기준을
대체하지 않는다.

GitOps release evidence v3는 기존 v2 `artifact`에 `convergence`를 추가한다. parser는 adapter,
artifact fingerprint/digest, deployment target fingerprint, provider 검증 시각과 fallback reason을
상호 검증한다. reconciler는 RDS에 저장된 target fingerprint를 사용하고, legacy null row는 verified
account와 canonicalized legacy runtime config로 같은 값을 재구성한다. 이 fingerprint와 AWS에서 다시
읽은 revision marker가 모두 일치할 때만 convergence 결과를 release에 반영한다.

### Runtime Convergence Adapter 계약

모든 adapter는 current state 조회, desired target 비교, artifact fingerprint와 digest/reference
검증, rollout, health 확인, rollback evidence, `already_active` 판정을 같은 순서로 제공한다.
no-op은 provider가 반환한 target marker, 동일 ApplicationArtifact fingerprint, exact digest/reference,
healthy 상태가 모두 확인된 경우에만 가능하다. provider 조회 실패, marker/digest/config 불일치,
unhealthy 또는 검증 불가능한 health는 기존 rollout으로 fallback한다. RDS row나 Redis Runtime
Cache만으로 성공 처리하지 않는다.

`ApplicationRelease`는 application 배포 결과의 공통 원장이다. Direct release는 `deploymentId`, GitOps
release는 `pipelineRunId`를 하나만 가지며 둘 다 `GET /api/projects/:projectId/releases`에서 조회한다.

```ts
type ApplicationRelease = {
  id: string;
  projectId: string;
  artifactId: string | null;
  deploymentId: string | null;
  pipelineRunId: string | null;
  source: "direct" | "gitops";
  runtimeTargetKind: RuntimeTargetKind;
  version: string;
  commitSha: string;
  artifactDigestAlgorithm: "sha256";
  artifactDigest: string;
  releaseCandidateId: string | null;
  compositeDigest: CompositeReleaseDigest | null;
  providerRevision: ApplicationReleaseProviderRevision | null;
  frontendEvidence: FrontendReleaseEvidence | null;
  failureStage: ApplicationReleaseFailureStage | null;
  baselineReleaseId: string | null;
  outputUrl: string | null;
  status:
    | "pending"
    | "building"
    | "deploying"
    | "partially_failed"
    | "partially_cancelled"
    | "succeeded"
    | "failed"
    | "rolled_back"
    | "cancelled";
  healthEvidence: JsonValue | null;
  rollbackEvidence: JsonValue | null;
  startedAt: IsoDateTimeString | null;
  completedAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

release version은 exact SemVer tag, manifest version, `sha-<commit 앞 12자리>` 순으로 결정한다. artifact는
SHA-256 digest로 식별한다. 웹 포함 ECS artifact는 API OCI SHA-256과 frontend 파일 manifest SHA-256을 묶은
canonical composite SHA-256으로 함께 식별한다. `artifactId`는 provider에서 검증한 `ApplicationArtifact`와
release를 연결하며 legacy release와 provider 검증에 실패해 안전하게 재사용하지 않은 v1 GitOps release는
`null`을 유지한다. frontend evidence에는 manifest URI/VersionId, `index.html` VersionId, CloudFront
invalidation ID와 commit marker를 저장한다. `providerRevision`은 provider, resource type, revision ID,
artifact reference, 비민감 metadata를 담고 canonical fingerprint 비교로 실제 provider revision drift를
판정한다. preflight의 immutable `ReleaseCandidate`와 release evidence는 SketchCatch 내부 S3에 보관하고,
배포된 사용자 artifact는 사용자 ECR/S3 또는 provider storage에 둔다. RDS에는 식별자, 상태, 검증 결과만
저장한다.

ECS `full_stack` pending release의 `providerRevision.metadata`는 준비 시점
`ecsRuntimeCoordinatesFingerprint`와 `ecsPreparedOutputUrl`을 함께 저장한다. `ecsPreparedOutputUrl`은 최초
배포의 `null`도 명시적으로 기록하며, Apply 결과가 target에 먼저 저장되고 release 갱신만 중단된 경우
준비 시점 deployment target identity를 다시 계산하는 데 사용한다. 기존 pending row에 이 metadata가
없으면 다음 준비 단계에서 immutable build artifact를 재사용한 채 현재 준비 URL snapshot만 보강한다.
`baselineReleaseId`는 같은 project와 runtime kind만으로 고르지 않고 현재
`deploymentTargetFingerprint`까지 같은 성공 release만 가리켜야 한다. Direct activation, GitOps 준비,
재시작 복구, 수동 rollback은 이 fingerprint 경계를 다시 검증한다.

## AwsCodeConnection, ProjectBuildEnvironment, ReleaseCandidate, ProjectExecutionLease

`AwsCodeConnection`은 verified AWS connection 안에 생성한 GitHub CodeConnections 연결 metadata다. GitHub
Repository를 고르는 별도 사용자 입력을 받지 않고 active `SourceRepository`와 연결한다. AWS가 `AVAILABLE`로
확인한 connection만 build environment에서 사용할 수 있다.

환경설정의 GitHub 빌드 연결 해제는 사용자가 확인한 뒤
`DELETE /api/aws/connections/:connectionId/codeconnection`에 `confirmedManagedCleanup: true`를 보내면 실행한다.
기존 managed cleanup이 SketchCatch 관리 CodeBuild project, 전용 Role, log group, build cache ECR,
CodeConnection 정리를 먼저 시도한 뒤 metadata와 프로젝트 build environment 연결을 제거한다. AWS 원격 정리는
best-effort이므로 권한 또는 AWS API 오류로 일부 리소스 정리에 실패해도 SketchCatch의 연결 해제를 막거나
`CODECONNECTION_DELETE_FAILED`로 되돌리지 않는다. 이 경우 남은 AWS 리소스는 사용자가 AWS에서 직접 정리할 수
있다. AWS 계정 연결과 이미 배포된 애플리케이션·인프라는 유지하며, 앱 빌드나 배포가 진행 중이면 해제를
차단한다. `DELETING` 상태는 상태 새로고침과 새 Direct/GitOps 실행의 영속 fence이며, 중단된 로컬 해제 claim은
1시간 뒤 재시도할 수 있다. 기존 `ERROR` row의 `cleanupRetryRequired`는 이전 실패 상태를 읽기 위한 하위 호환
필드이며, 다시 해제하면 같은 best-effort 정책으로 로컬 연결을 제거한다.

생성은 AWS API보다 먼저 RDS에 `CREATING` row를 예약한다. 같은 AWS connection의 동시 요청은 이 row를 보고
AWS Resource를 하나만 만들며, API가 AWS 생성 뒤 중단되면 결정적 이름과 `ManagedBy=SketchCatch`,
`SketchCatchAwsConnection=<id>` tag가 모두 맞는 connection만 다시 채택한다. `connectionArn`은 이 예약 단계에서
`null`일 수 있고, 상태는 `CREATING | PENDING | AVAILABLE | ERROR | DELETING` 중 하나다. 외부에서 만든
CodeConnections나 이름만 같은 Resource는 채택하지 않는다.

`ProjectBuildEnvironment`는 Repository가 제공된 프로젝트에만 lazy create하는 CodeBuild project와 build-only
service role이다. service role에는 permissions boundary를 붙이고 Repository checkout, CloudWatch Logs,
SketchCatch가 발급한 presigned multipart upload 외에는 cloud mutation 권한을 주지 않는다. project, role,
source URL, CodeConnection, build image와 compute 설정의 canonical fingerprint를 RDS에 저장한다.

CodeConnections `AVAILABLE`은 GitHub OAuth handshake 완료 상태이며 Repository 접근 완료를 뜻하지 않는다.
Web은 이를 `AWS OAuth 연결됨`으로 표시하고 Marketplace 주문 화면이 아닌 AWS Connector for GitHub의 직접
설치·Repository 권한 설정 경로를 함께 제공한다.
CodeBuild project 생성 또는 Repository checkout이 `OAuthProviderException`으로 실패하면 API는 원래 provider
token 문구를 노출하지 않고
`CODECONNECTION_REPOSITORY_ACCESS_REQUIRED` 409를 반환하며, 대상 Repository와 App 설치·권한 복구 방법을
`repositoryVerificationStatus = failed` 및 안전한 `repositoryVerificationStatusReason`으로 저장한다.

CodeConnections `AVAILABLE`과 Repository 접근 검증은 별도 상태다. 기존 build environment와 새로 준비한 environment는
`repositoryVerificationStatus = not_checked`에서 시작한다. 사용자가 Plan을 요청하면 확정된
`confirmedCommitSha`를 `sourceVersion`으로 지정해 server-generated no-op CodeBuild를 실행한다. 성공한 build의
`resolvedSourceVersion`이 요청 SHA와 정확히 같을 때만 `verified`로 바꾸며, 요청 SHA, resolved SHA, build ARN,
검증 시각을 함께 저장한다. checkout 실패나 SHA 불일치는 `failed`와 안전한 오류 요약을 저장한다. 이 검증은
SketchCatch GitHub token을 AWS에 전달하거나 재사용하지 않는다. AWS API는 CodeConnections 승인에 사용한 GitHub
계정명을 반환하지 않으므로 `AwsCodeConnection`에 추정 계정명을 저장하지 않으며, account-name 일치를 검증했다고
표시하지 않는다. 강제 가능한 경계는 활성 GitHub App installation 하나와 exact Repository checkout 성공이다.

`ReleaseCandidate`는 preflight에서 한 번 만든 API OCI archive와 frontend archive의 immutable 묶음이다. 대용량
파일은 SketchCatch 내부 Artifact S3의 `deployments/<deployment-or-run-id>/release-candidates/<candidateId>/` 아래에 두고 RDS에는 object
key, byte size, SHA-256, composite digest, 상태와 retention 시간만 저장한다. 승인 전 candidate는 생성 시점부터
24시간 보존한다. frontend 부분 실패는 frontend archive retention을 실패 시점부터 24시간 연장한다. release
성공 뒤 대용량 archive는 삭제할 수 있지만 manifest, digest와 release evidence는 유지한다.

`ProjectExecutionLease`는 Direct, GitOps App release-run, GitOps Infra workflow 중 하나만 프로젝트의 cloud mutation을 실행하게 하는 DB lock이다. acquire할
때마다 증가하는 `fencingVersion`, holder, source, active CodeBuild ID, active worker task ARN, heartbeat와 만료
시각을 저장한다. 충돌한 실행은 queue에 넣지 않고 고정된 사용자 문구로 즉시 실패한다. Infra workflow는 OIDC run identity를 다시 확인한 heartbeat로 TTL을 연장한다. 모든 AWS mutation과 결과 저장은 현재 holder/fencing version을 다시 확인한다. lease 상실 시
API는 CodeBuild `StopBuild` 또는 worker `StopTask`를 요청하고 terminal 상태를 확인한다. application mutation이
시작된 실행은 API process에서 직접 복구하지 않고 `recover_application_release` worker를 dispatch해 durable step과
AWS 상태를 재검증하며, 복구 terminal 기록이 완료된 뒤에만 lease를 해제한다. release가 끝나도 row는
`released`로 남겨 다음 acquire가 기존 generation에서 증가하도록 한다.

프로젝트와 AWS connection에는 각각 nullable `deletionStartedAt` claim이 있다. 삭제 transaction이 project 또는
connection row를 잠그고 claim을 기록한 뒤에만 외부 managed Resource cleanup을 시작한다. AWS connection 삭제는
AWS를 변경하지 않는 deletion preview와 exact resource fingerprint 확인을 먼저 통과해야 한다. 새 Deployment,
build-environment prepare, Direct/GitOps lease acquire는 claim이 있는 대상을 거부한다. cleanup 실패 시 claim을
오류 요약과 함께 보존해 재시도할 수 있고, 성공 시 마지막 transaction에서 blocker를 다시 확인한 뒤 metadata를
삭제한다.

GitOps frontend 부분 실패 재시도는
`POST /api/git-cicd/release-runs/:runId/frontend/retry`를 사용한다. project owner만 호출할 수 있고,
`ApplicationRelease.status=partially_failed`, frontend failure stage, 만료되지 않은 동일 `ReleaseCandidate`를
transaction에서 확인한 뒤 pipeline run을 다시 `queued`로 만든다. 재시도 worker는 API image build, ECR publish,
Task Definition 등록, ECS update를 실행하지 않고 frontend archive checksum 검증과 S3/CloudFront 단계만 수행한다.
API 재시작으로 queued retry가 복구될 때도 worker mode는 `retry_frontend`로 유지한다.

## Deployment

`Deployment`는 사용자가 승인한 IaC Preview를 실제 클라우드 리소스에 반영하는 실행 단위다.

```ts
type Deployment = {
  id: string;
  projectId: string;
  architectureId: string;
  terraformArtifactId: string;
  awsConnectionId: string | null;
  awsAccountIdSnapshot: string | null;
  awsRegionSnapshot: string | null;
  awsConnectionNameSnapshot: string | null;
  liveProfile: "demo_web_service" | "demo_web_service_with_rds";
  scope: "infrastructure" | "application" | "full_stack";
  targetKind: RuntimeTargetKind | null;
  source: "direct" | "gitops";
  releaseId: string | null;
  releaseCandidateId: string | null;
  rollbackOfDeploymentId: string | null;
  rollbackTargetDeploymentId: string | null;
  consolePhase: "validation" | "approval" | "deployment";
  preparedDraftRevision: number | null;
  preparedSnapshotHash: string | null;
  approvedPreparedSnapshotHash: string | null;
  currentPlanArtifactId: string | null;
  currentPlanOperation: "apply" | "destroy" | null;
  stateObjectKey: string | null;
  resultWarningSummary: string | null;
  status:
    | "PENDING"
    | "RUNNING"
    | "SUCCESS"
    | "PARTIALLY_FAILED"
    | "PARTIALLY_CANCELED"
    | "FAILED"
    | "CANCELLED"
    | "DESTROYED";
  activeStage:
    | "init"
    | "preflight"
    | "validate"
    | "plan"
    | "apply"
    | "application_release"
    | "rollback"
    | "destroy"
    | null;
  planSummary: DeploymentPlanSummary | null;
  isBlocked: boolean;
  blockedBy: "risk_analysis" | "cost_analysis" | "missing_approval" | null;
  blockedReason: string | null;
  failureStage:
    | "init"
    | "build_environment"
    | "preflight"
    | "validate"
    | "plan"
    | "approval"
    | "aws_connection"
    | "mock_run"
    | "apply"
    | "application_release"
    | "rollback"
    | "destroy"
    | null;
  errorSummary: string | null;
  approvedAt: IsoDateTimeString | null;
  approvedByUserId: string | null;
  approvedTerraformArtifactId: string | null;
  approvedPlanArtifactId: string | null;
  approvedTerraformArtifactHash: string | null;
  approvedTfplanHash: string | null;
  approvedAwsAccountId: string | null;
  approvedAwsRegion: string | null;
  startedAt: IsoDateTimeString | null;
  completedAt: IsoDateTimeString | null;
  failedAt: IsoDateTimeString | null;
  cancelRequestedAt: IsoDateTimeString | null;
  cancelledAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

`DeploymentLiveProfile`은 `demo_web_service`와 `demo_web_service_with_rds`만 사용한다.
`demo_web_service`가 신규 Deployment의 기본값이며, `0054_remove_practice_live_profile.sql`은
기존 `practice` 값을 `demo_web_service`로 변환한 뒤 PostgreSQL enum에서 제거한다.

Direct Deployment의 외부 상태는 `validation`, `approval`, `deployment` 세 단계만 사용한다. 저장,
Pre-Deployment Check, `terraform init`, `terraform plan`은 `validation` 내부 작업이며 실제 실행과
정리는 `deployment`에서 처리한다. 내부 Terraform stage와 로그는 기존 실행 증거로 그대로 보존한다.

`POST /api/projects/:projectId/deployments/prepare`는 사용자가 저장한 `ProjectDraft.revision`을 정확히
받아야 한다. 서버는 같은 revision의 `diagramJson`과 `terraformFiles`를 canonical SHA-256으로 묶어
`preparedSnapshotHash`에 저장하고, 생성 transaction에서 revision을 다시 잠금 검증한다. 저장 실패나
stale revision이면 Deployment를 만들지 않는다. 승인 시 `approvedPreparedSnapshotHash`를 고정하며
Apply/Destroy 직전 승인 snapshot과 준비 snapshot이 다르면 실행하지 않는다. 기존 Deployment는 세 필드가
모두 `null`인 legacy record로 호환한다.

같은 저장 snapshot, revision, AWS connection, scope, `deploymentTargetFingerprint`로 `prepare` 요청이
겹치면 서버는
내부 `deployments.preparation_key` SHA-256과 active partial unique index를 기준으로 하나의 미승인
`PENDING`/`RUNNING` Deployment를 재사용한다. 이 키는 중복 클릭과 탭·네트워크 재시도를 흡수하기 위한 DB
내부 idempotency 값이며 API `Deployment` DTO에는 노출하지 않는다. 승인되거나 terminal 상태가 된 실행은
재사용 대상이 아니므로 이후 명시적 배포 준비는 새 Deployment를 만든다.

`Deployment`는 제품/문서/화면/코드에서 실제 실행 단위로 통일한다.

승인 시점에는 사용자가 확인한 Plan을 이후 Apply 대상과 비교할 수 있도록
`approvedTerraformArtifactId`, `approvedPlanArtifactId`, `approvedTerraformArtifactHash`,
`approvedTfplanHash`, `approvedAwsAccountId`, `approvedAwsRegion`을 함께 고정한다. 이후
Apply 단계는 이 snapshot과 현재 artifact, `tfplan`, AWS account/region이 다르면 실행하지 않는다.

### Deployment Optimization Contract v1

IaC desired-state, application artifact, runtime release는 각각 별도 fingerprint와 검증 책임을 가진다. Terraform managed resource의 IaC desired-state 계층과 Direct/GitOps 공통 `ApplicationArtifact` Registry v1을 구현했다. runtime no-op은 `ResourceDefinition.capabilities.deployment.optimization`이 허용하는 resource adapter에서 별도 확장하며, 코드 fingerprint 하나나 DB row만으로 실제 cloud가 동일하다고 판단하지 않는다.

```ts
type DeploymentOptimizationDecision =
  | {
      outcome: "execute";
      reason:
        | "initial_plan"
        | "cache_miss"
        | "desired_state_changed"
        | "provider_lock_changed"
        | "target_changed"
        | "state_changed"
        | "drift_ttl_expired";
    }
  | { outcome: "reuse"; reason: "verified_pending_plan" | "concurrent_plan_joined" }
  | { outcome: "no_change"; reason: "terraform_plan_no_changes" }
  | { outcome: "fallback_execute"; reason: "cache_validation_failed" }
  | { outcome: "unsupported"; reason: "resource_not_deployable" };

type TerraformDesiredStateIdentity = {
  fingerprint: string;
  terraformBundleSha256: string;
  providerLockSha256: string;
  providerIdentitySha256: string;
  variableIdentitySha256: string;
  backendIdentitySha256: string;
  targetIdentitySha256: string;
  stateIdentitySha256: string;
  stateLineageSha256: string | null;
  stateSerial: number | null;
};
```

canonical Terraform bundle, provider lock와 provider identity, 비밀값을 제외한 변수 이름, backend label, project/provider/account/region target, state lineage/serial을 묶어 identity를 만든다. 파일 순서, JSON key 순서, CRLF/LF 차이는 fingerprint를 바꾸지 않는다. account, region, lock, state lineage/serial, Terraform content가 바뀌면 재계획한다.

동일 Deployment의 동시 Plan 요청은 single-flight로 합치고, 이미 존재하는 pending apply Plan은 실제 `tfplan` hash와 versioned optimization evidence, Plan summary hash, Pre-Deployment result hash, target/state identity, drift TTL이 모두 유효할 때만 재사용한다. 기본 drift TTL은 5분이다. 검증 실패나 evidence 손상은 `fallback_execute`로 기록하고 정상 Plan을 실행한다. Terraform Plan이 실제 변경 없음으로 확인된 경우에만 승인 후 Apply를 생략하며, 승인 hash/account/region gate와 evidence/TTL 검증은 그대로 통과해야 한다.

Apply가 성공하면 `terraform output -json`, `terraform show -json`, `terraform.tfstate` S3 업로드를 순서대로 시도한다.
실제 AWS Apply가 성공했다면 이 단계 중 일부가 실패해도 Deployment는 `SUCCESS`로 유지하고 apply stage 로그에 경고를 남긴다.

`stateObjectKey`에는 S3에 업로드한 `terraform.tfstate` object key를 저장한다. state 업로드에 실패하면 `null`일 수 있다.
state 업로드가 성공하면 resource/output transaction보다 먼저 project execution lease fence를 확인하며 `stateObjectKey` checkpoint를 저장한다. 이후 resource/output 저장이 실패해도 checkpoint를 유지하고 `resultWarningSummary`를 남긴 뒤 Terraform 성공을 `FAILED`로 뒤집지 않는다.
`terraform show -json` 기반 resource inventory는 현재 `SUCCESS` 저장 전에 `TerraformOutput`과 함께 저장한다.

`terraform apply tfplan`이 시작된 뒤 실패하거나 취소되면 로컬 `terraform.tfstate`를 best-effort로 S3에 저장하고,
성공하면 `stateObjectKey`를 남긴다. 이 상태의 Deployment는 `FAILED`와 `failureStage: "apply"`를 유지하며,
사용자가 명시적으로 cleanup을 실행할 때 `terraform plan -destroy` → 승인 → destroy apply 순서로 정리한다.
Destroy가 성공하면 Deployment는 `DESTROYED`가 되고, `stateObjectKey`, 현재 Plan pointer, 배포 리소스, output을 정리한다.

실행 중인 Deployment는 `activeStage`와 `startedAt`을 가진다. 실행이 끝나면 `activeStage`는
`null`로 돌아가고 `completedAt`을 저장한다. 실패는 `failedAt`, 사용자가 취소를 요청한 시점은
`cancelRequestedAt`, 실제 취소 완료 시점은 `cancelledAt`에 저장한다.

`DeploymentProgressSnapshot`은 저장 모델이 아니라 기존 `Deployment`와 `DeploymentLog`로 계산하는
읽기 전용 DTO다. 이 DTO를 조회해도 Deployment, DeploymentJob, Runtime Cache, Terraform artifact,
cloud Resource는 변경되지 않는다.

```ts
type DeploymentProgressMeasurement =
  | { kind: "indeterminate" }
  | {
      kind: "resource_count";
      completedUnits: number;
      totalUnits: number;
      percent: number;
    }
  | { kind: "complete"; percent: 100 };

type DeploymentProgressSnapshot = {
  deploymentId: string;
  status: Deployment["status"];
  activeStage: Deployment["activeStage"];
  failureStage: Deployment["failureStage"];
  measurement: DeploymentProgressMeasurement;
  updatedAt: IsoDateTimeString;
};
```

`SUCCESS`와 `DESTROYED`만 `complete` 100%다. 실행 중인 Apply/Destroy는 `planSummary`의 전체 변경
Resource 수와 현재 stage의 고유 Terraform Resource 완료 로그를 함께 확인할 수 있을 때만
`resource_count`를 사용하고 99% 이하로 제한한다. 완료 수에는 현재 실행의 `startedAt` 이후에 기록된
로그만 포함하므로 같은 Deployment의 이전 시도 결과가 섞이지 않는다. 작업량을 측정할 수 없는 단계와
실패·취소 상태는 `indeterminate`이며, 경과 시간이나 heartbeat 로그 개수로 퍼센트를 만들지 않는다.

Web은 이 서버 측 `indeterminate`를 실제 측정값으로 오해하지 않도록 `약` 표시가 붙은 stage 기반
추정 퍼센트로 표현할 수 있다. 실행 요청 5%, Init 15%, Preflight 30%, Validate 45%, Plan 75%,
Application Release 95%처럼 현재 `activeStage`가 바뀔 때만 전진하며, 경과 시간이나 로그 양으로
증가시키지 않는다. `resource_count`가 있으면 추정값 대신 서버 퍼센트를 사용한다.

한 프로젝트에는 동시에 하나의 `RUNNING` Deployment만 허용한다. 이 제약은 애플리케이션 체크와
`deployments_project_running_unique` partial unique index를 함께 사용해 보장한다.

Deployment 생성 후에는 프로젝트 단위 retention을 실행한다. 기본 정책은 최신 Deployment 기록 20개,
사용 중이지 않은 최신 TerraformArtifact 5개, 사용 중이지 않은 최신 ArchitectureSnapshot 5개를
남긴다. 다만 `RUNNING`, `SUCCESS`, `stateObjectKey`가 남은 `FAILED`, `failureStage: "destroy"`인
`FAILED` Deployment는 실제 리소스 확인이나 cleanup 재시도에 필요할 수 있으므로 개수 제한을 넘어도
삭제하지 않는다. 삭제되는 Deployment의 `DeploymentPlanArtifact`, `DeploymentLog`,
`DeployedResource`, `TerraformOutput`은 DB cascade로 함께 정리하고, S3 object는 best-effort로 삭제한다.

## DeploymentJob

`DeploymentJob`은 Terraform 실행 요청을 배포 레코드와 별도로 추적하는 내부 작업 단위다. Phase 4에서는 기존
API 응답 shape을 바꾸지 않고 RDS에 실행 job 모델만 추가한다. 실제 실행은 기존 in-process background 실행을
유지하며, Phase 5 이후 ECS RunTask dispatch가 켜지면 같은 job row에 ECS task ARN을 기록한다.

DB 기준: `deployment_jobs`

```ts
type DeploymentJob = {
  id: string;
  deploymentId: string;
  operation: "init" | "plan" | "apply" | "destroy_plan" | "destroy";
  status: "QUEUED" | "DISPATCHING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  requestedByUserId: string;
  accessContext: {
    kind: "user";
    userId: string;
  };
  startedFromStatus: Deployment["status"];
  startedFromFailureStage: Deployment["failureStage"];
  ecsTaskArn: string | null;
  errorSummary: string | null;
  startedAt: IsoDateTimeString | null;
  completedAt: IsoDateTimeString | null;
  failedAt: IsoDateTimeString | null;
  cancelledAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

`deployment_jobs.deployment_id`는 `deployments.id`를 FK로 참조하고, Deployment 삭제 시 함께 삭제된다.
`requestedByUserId`와 `accessContext`는 사용자가 요청한 배포 실행임을 감사 가능하게 남기기 위한 값이다.
`startedFromStatus`와 `startedFromFailureStage`는 job 생성 시점의 Deployment 상태를 저장해 재시도/cleanup
시나리오를 나중에 설명할 수 있게 한다. `ecsTaskArn`은 Phase 5의 ECS RunTask 연동을 위한 nullable placeholder다.

같은 Deployment에는 `QUEUED`, `DISPATCHING`, `RUNNING` job이 동시에 하나만 존재할 수 있다.
이 제약은 `deployment_jobs_deployment_active_unique` partial unique index로 보장한다. 실패 원문은
`errorSummary` 저장 전에 secret masking을 거쳐야 하며, public Deployment API 응답에 아직 노출하지 않는다.

## DeploymentPlanArtifact

`DeploymentPlanArtifact`는 사용자가 승인할 수 있는 특정 Terraform Plan 파일의 metadata다. `tfplan` 바이너리는 S3에 저장하고, RDS에는 object key와 hash, Plan 생성 시점의 Terraform artifact hash, 실행 계정/region, Plan에 사용한 state baseline identity를 저장한다. Terraform plan/show의 raw JSON 전체나 state 원문은 저장하지 않는다.

apply Plan은 같은 S3 prefix에 `{planId}.optimization.json` version 1 sidecar를 둘 수 있다. sidecar는 project/deployment/plan scope, 실제 `tfplan` hash, `TerraformDesiredStateIdentity`, drift 검증 시각, Plan summary와 Pre-Deployment result의 hash, 정규화된 resource address별 bounded change action만 저장한다. raw Terraform JSON, 변수 값, credential, token, 자유 형식 metadata는 저장하지 않는다. sidecar가 없거나 schema/hash/scope/TTL 검증에 실패하면 안전한 cache miss로 처리하며 Plan artifact 삭제 시 함께 삭제한다. 이 sidecar는 최적화 evidence일 뿐 Apply 안전성에 필수인 state baseline identity의 durable 저장소로 사용하지 않는다.

DB 기준: `deployment_plan_artifacts`

```ts
type DeploymentPlanArtifact = {
  id: string;
  deploymentId: string;
  terraformArtifactId: string;
  terraformArtifactSha256: string | null;
  operation: "apply" | "destroy";
  objectKey: string;
  sha256: string;
  accountId: string;
  region: string;
  stateBaselineDeploymentId: string | null;
  stateObjectKey: string | null;
  stateLineageSha256: string | null;
  stateSerial: number | null;
  createdAt: IsoDateTimeString;
};
```

Terraform apply Plan을 만들 때 프로젝트·AWS connection·Terraform scope가 같은 최신 state 소유 Deployment를 한 번 선택하고 state를 workspace에 복원한다. 선택한 Deployment ID와 S3 object key, state lineage hash, serial을 Plan artifact에 고정한다. Apply는 AWS credential을 준비하기 전에 현재 baseline을 다시 선택하고 네 값을 비교하며, 하나라도 다르면 기존 `tfplan`을 실행하지 않고 새 Plan과 승인을 요구한다. state가 없는 최초 Plan은 네 값이 모두 `null`이다.

`terraformArtifactSha256`은 Plan 생성 시점에 복원한 Terraform artifact 내용을 기준으로 계산한다. 컬럼은 기존 row 마이그레이션을 위해 nullable이지만, 새 Plan은 반드시 값을 저장해야 하며 hash가 없는 Plan artifact는 승인할 수 없다. Approval 단계는 현재 S3 Terraform artifact hash와 이 값을 비교해 Plan 생성 이후 원본 Terraform artifact가 바뀐 경우 승인을 막는다.

`operation`은 해당 `tfplan`이 일반 apply용인지 cleanup destroy용인지 구분한다. Apply 실행은 `operation: "apply"` Plan만,
destroy 실행은 `operation: "destroy"` Plan만 사용할 수 있다.

`deployment_plan_artifacts.deployment_id`는 `deployments.id`를 FK로 참조한다. `deployments.current_plan_artifact_id`는 현재 승인 대상 Plan을 가리키는 nullable pointer이며, 같은 Deployment의 artifact인지 여부는 Deployment service에서 검증한다.

API 응답의 `Deployment.currentPlanOperation`은 `current_plan_artifact_id`가 가리키는 Plan artifact의 `operation`을 펼쳐서 내려주는 읽기용 필드다. 프론트엔드는 이 값으로 apply plan과 destroy plan을 구분해 Apply 버튼과 Destroy 버튼을 분리한다.

## DeploymentPlanSummary

```ts
type TerraformSourceLocation = {
  fileName: string;
  line: number;
  column?: number;
  resourceAddress?: string;
  terraformBlockType?: string;
  terraformBlockName?: string;
};

type DeploymentPlanWarning = {
  id: string;
  level: "low" | "medium" | "high";
  source: "pre_deployment_check" | "terraform_plan" | "cost_risk" | "approval_snapshot";
  code:
    | "PUBLIC_RDS"
    | "PUBLIC_SSH"
    | "PUBLIC_S3"
    | "IAM_WILDCARD"
    | "DESTRUCTIVE_CHANGE"
    | "UNSUPPORTED_RESOURCE"
    | "TRIVY_MISCONFIGURATION"
    | "UNKNOWN_TERRAFORM_ACTION"
    | "MISSING_APPROVAL";
  message: string;
  relatedFindingId?: string;
  relatedResourceId?: string;
  sourceLocation?: TerraformSourceLocation;
  requiresAcknowledgement: boolean;
  blocksApproval: boolean;
};

type DeploymentPlanSummary = {
  createCount: number;
  updateCount: number;
  deleteCount: number;
  replaceCount: number;
  blocked: boolean;
  warnings: DeploymentPlanWarning[];
};
```

`DeploymentPlanWarning.sourceLocation`은 Safety Gate warning이 Terraform 코드의 어느 파일/라인/리소스 블록에서 나왔는지 가리키는 선택 필드다. `line`과 `column`은 에디터 이동을 위해 1-based 값으로 저장한다. DB 컬럼을 새로 만들지 않고 기존 `DeploymentPlanSummary.warnings` JSON 안에 보존한다.

`DeploymentPlanWarning.blocksApproval`은 저장된 warning 및 다른 삭제/정리 계약과의 호환을 위해 유지한다. Direct Deployment의 Terraform Plan 승인에서는 이 필드를 차단 조건으로 사용하지 않으며, 신규 Pre-Deployment warning은 severity와 관계없이 `false`로 저장한다.

Plan summary는 사용자 승인 화면에 필요한 최소 요약이다. 현재 기본 흐름에서는 `terraform plan -out=tfplan` 이후 `terraform show -json tfplan` 결과의 `resource_changes`를 파싱해 생성한다.

Plan 단계의 Safety Gate는 최종 실행 전 점검 결과를 `warnings`에 보존한다. Plan 저장 자체는 high finding이 있어도 `deployments.isBlocked`를 세우지 않는다. High를 포함한 Pre-Deployment finding은 승인 차단 조건으로 사용하지 않고 검토 정보로 남기며, Plan이 존재하고 artifact/hash 안전 조건이 맞으면 사용자는 항상 승인할 수 있다. 사용자가 승인한 plan과 apply 대상 plan은 같은 artifact/hash 기준이어야 한다.

Pre-Deployment Check의 보안 finding은 Terraform 파일이 제공되면 Trivy `config` misconfiguration scan 결과를 우선 사용한다. Trivy rule이 기존 `PUBLIC_SSH`, `PUBLIC_RDS`, `PUBLIC_S3`, `IAM_WILDCARD` 코드로 안전하게 분류되지 않으면 `TRIVY_MISCONFIGURATION`으로 보존한다. Trivy 기반 high finding은 Plan 생성 결과에 warning으로 보존하되 승인을 차단하지 않는다. Trivy 실패는 Safety Gate를 대체하지 않고 해당 scan 결과만 생략하며, deterministic cost/config/product policy finding은 계속 반환한다.

MVP Direct Deployment Path live apply는 아래 Terraform resource type을 우선 지원 범위로 둔다.
이외 resource type이 변경 대상에 포함되면 warning metadata로 남겨 승인 화면과 수정 안내에서 high-risk로 표시하지만, 승인/배포 자체는 차단하지 않는다.

- `aws_vpc`
- `aws_subnet`
- `aws_internet_gateway`
- `aws_route_table`
- `aws_route_table_association`
- `aws_security_group`
- `aws_security_group_rule`
- `aws_instance`
- `aws_s3_bucket`

## DeployedResource와 TerraformOutput

`DeployedResource`는 Apply 성공 후 `terraform show -json`으로 현재 state를 읽어 RDS에 저장한
리소스 목록이다. 사용자 화면에서 실제로 어떤 Terraform address와 AWS resource id가 남았는지
확인하는 데 쓴다.

이 목록은 Apply 완료 저장 시 `TerraformOutput`과 함께 같은 Deployment 범위로 교체 저장한다.
다만 `terraform show -json`이 실패하거나 취소되면 실제 AWS Apply는 성공으로 유지되고, 리소스 목록은 빈 값으로 저장될 수 있다.

DB 기준: `deployed_resources`

```ts
type DeployedResource = {
  id: string;
  deploymentId: string;
  terraformAddress: string;
  terraformType: string;
  providerName: string | null;
  resourceId: string | null;
  region: string;
  createdAt: IsoDateTimeString;
};
```

`TerraformOutput`은 Apply 성공 후 `terraform output -json` 결과를 RDS에 저장한 값이다.
Terraform이 sensitive로 표시한 output은 저장과 응답 모두에서 `value: null`로 다룬다.

DB 기준: `terraform_outputs`

```ts
type TerraformOutput = {
  id: string;
  deploymentId: string;
  name: string;
  value: unknown | null;
  sensitive: boolean;
  createdAt: IsoDateTimeString;
};
```

조회 API:

- `GET /api/deployments/:deploymentId/resources`
- `GET /api/deployments/:deploymentId/outputs`

## DeploymentLog

```ts
type DeploymentLog = {
  id: string;
  deploymentId: string;
  sequence: number;
  stage: "init" | "validate" | "plan" | "apply" | "destroy";
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  relatedResourceId: string | null;
  createdAt: IsoDateTimeString;
};
```

로그는 sequence 순서를 보장한다. message에는 credential, token, password, DB URL, sensitive output이 남지 않아야 한다.

## DeploymentFailureExplanation

`DeploymentFailureExplanation`은 실패한 Direct Deployment를 사용자가 바로 읽을 수 있는 원인 후보와 다음 행동으로 낮춘 계산 DTO다. DB row를 새로 만들지 않고 `deployments.error_summary`, `deployments.failure_stage`, `deployment_logs`를 읽어 API 응답 시점에 생성한다.

```ts
type DeploymentFailureExplanation = {
  deploymentId: string;
  stage: DeploymentFailureStage | null;
  severity: RiskLevel;
  summary: string;
  likelyCause: string;
  nextActions: string[];
  firstErrorLog: string | null;
  cleanupRequired: boolean;
  llmExplanation?: LlmExplanation;
};
```

조회 API:

- `GET /api/deployments/:deploymentId/failure-explanation`

응답은 `DeploymentFailureExplanationResponse = { explanation: DeploymentFailureExplanation }`이다.
이 endpoint는 `FAILED` deployment에만 허용된다. `firstErrorLog`와 `summary`에 포함되는 로그 원문은 `maskDeploymentMessage`를 다시 통과해야 하며, OpenAI API key가 없거나 provider 호출이 실패하면 `llmExplanation.fallbackUsed: true`와 fallback reason을 내려준다. Rule 기반 fallback 요약은 실패 stage, 첫 오류 로그, cleanup 필요 여부를 포함해야 한다.

## DeploymentNotification

`DeploymentNotification`은 Direct Deployment와 GitOps Pipeline Run의 terminal 상태를 사용자별 Inbox로
보존하는 공통 완료 알림이다. Direct는 `source: "direct_deployment"`, GitOps는
`source: "gitops_pipeline"`을 사용하며, `source + sourceId + status` idempotency key마다 알림과 outbox가
각각 하나만 존재한다. `gitops` source의 `Deployment`는 Pipeline Run 알림과 중복되지 않도록 직접 알림을
만들지 않는다.

```ts
type DeploymentNotification = {
  id: string;
  projectId: string;
  source: "direct_deployment" | "gitops_pipeline";
  sourceId: string;
  status: "succeeded" | "failed" | "cancelled";
  title: string;
  body: string;
  actionUrl: string;
  readAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
};
```

DB 기준은 `notifications`, `notification_outbox`, `web_push_subscriptions`다. terminal 상태와 Inbox/outbox
생성은 같은 PostgreSQL transaction에서 처리한다. Inbox 읽음 상태는 RDS가 source of truth이며 알림은
생성 시각부터 90일 보관한다. Web Push subscription endpoint와 `auth`/`p256dh` key는 AES-256-GCM으로
암호화하고 endpoint SHA-256 hash만 별도 검색 키로 저장한다. 원문 subscription과 VAPID private key는
API 응답, 로그, 브라우저 저장소에 남기지 않는다.
`notification_outbox.provider_status_code`는 Web Push provider가 성공 응답으로 반환한 HTTP 상태 코드만 저장하며, 응답 본문이나 subscription 정보는 저장하지 않는다.

조회와 전달 API:

- `GET /api/notifications`
- `PATCH /api/notifications/:notificationId/read`
- `POST /api/notifications/read-all`
- `GET /api/notifications/stream`
- `GET /api/notifications/push-config`
- `PUT|DELETE /api/notifications/push-subscription`

SSE는 인증된 사용자의 Inbox event만 보내며, Service Worker Web Push도 같은 `notificationId`와 프로젝트
상대 경로를 사용한다. Web Push 권한은 사용자가 명시적으로 요청한 경우에만 얻는다. 영구 실패 또는 만료된
subscription은 비활성화하고, 일시 실패는 30초, 2분, 10분, 30분 간격으로 최대 5회까지만 시도한다.

## Git/CI/CD Handoff

`GitCicdHandoff`는 `IaC Preview`를 Source Repository와 외부 pipeline으로 넘기는 팀 운영 배포 경로의 metadata다. Direct Deployment Path를 대체하는 것이 아니라 운영 배포용 별도 경로다.

### Git/CI/CD readiness

`GitCicdReadinessSnapshot`은 배포나 설정 변경을 실행하지 않는다. 프로젝트의 현재 증거를 읽어 승인된 Apply Plan, Source Repository, monitoring 설정, 배포 타깃이 Git/CI/CD 경로를 시작할 준비가 되었는지 반환한다.

```ts
type GitCicdReadinessStatus = "ready" | "action_required";

type GitCicdReadinessItemKey =
  | "approved_apply_plan"
  | "initial_application_release"
  | "source_repository"
  | "monitoring_config"
  | "deployment_target";

type GitCicdDeploymentTargetReadinessKey =
  | "aws_connection"
  | "build_config"
  | "runtime_config"
  | "output_url";

type GitCicdReadinessAction =
  | "approve_apply_plan"
  | "deploy_initial_application"
  | "select_repository"
  | "confirm_monitoring_config"
  | "select_aws_connection"
  | "confirm_build_config"
  | "inspect_runtime_outputs"
  | "inspect_output_url";

type GitCicdReadinessItem = {
  key: GitCicdReadinessItemKey;
  label: string;
  status: GitCicdReadinessStatus;
  completedCount?: number | undefined;
  totalCount?: number | undefined;
  missingKeys: GitCicdDeploymentTargetReadinessKey[];
  action: GitCicdReadinessAction | null;
  recommendedDeploymentScope?: "application" | "full_stack" | undefined;
};

type GitCicdReadinessSnapshot = {
  projectId: string;
  checkedAt: IsoDateTimeString;
  ready: boolean;
  requiredActionCount: number;
  sourceDeploymentId: string | null;
  approvedApplyPlanArtifactId: string | null;
  initialApplicationReleaseId: string | null;
  items: GitCicdReadinessItem[];
};

type GitCicdReadinessResponse = {
  readiness: GitCicdReadinessSnapshot;
};
```

`items`는 다섯 상위 항목을 유지하고, `deployment_target`은 `aws_connection`, `build_config`, `runtime_config`, `output_url` 네 세부 key의 완료 수와 누락 목록을 함께 제공한다. 모든 상위 항목이 `ready`일 때만 snapshot의 `ready`가 `true`이며, `requiredActionCount`는 `action_required`인 상위 항목 수다. `refreshing`과 `error`는 서버 저장 상태나 readiness 응답 status가 아니라 Web request state로 관리한다.

`approved_apply_plan`은 `DeploymentPlanArtifact.operation: "apply"`인 승인 Plan만 준비 완료로 인정한다. `sourceDeploymentId`는 그 Plan의 원본 Deployment를, `approvedApplyPlanArtifactId`는 승인된 Apply Plan artifact를 가리킨다. `operation: "destroy"` Plan은 cleanup 승인과 실행에만 사용하며 readiness를 충족하거나 `approvedApplyPlanArtifactId`에 들어가지 않는다. 이 조회 DTO 자체는 Apply, Destroy, Git 변경, handoff를 승인하거나 실행하지 않는다.

`sourceDeploymentId`는 `scope in (infrastructure, full_stack)`인 최신 성공 Direct Infrastructure Apply Evidence의 Deployment ID다. `initialApplicationReleaseId`는 current target의 fingerprint, confirmed commit SHA, 안전한 HTTPS Output URL과 일치하고 ReleaseCandidate·composite digest·healthy ECS·frontend VersionId/invalidation/commit marker 증거를 모두 가진 성공 Direct `ApplicationRelease` ID다. 같은 full_stack Deployment의 릴리즈이거나, 기존 bootstrap-only 환경을 복구한 별도 application-scope Deployment의 릴리즈만 인정한다. 인프라 증거가 있고 앱 증거만 없으면 `recommendedDeploymentScope`는 `application`, 인프라 증거도 없으면 `full_stack`이다.

2026-07-07 추가 계약:

- `POST /api/git-cicd-handoffs/:handoffId/repository-settings/apply`는 handoff의 `repositorySettingsPreview`를 기준으로 GitHub App installation token으로 GitHub Environment와 Actions variables를 적용한다.
- 응답 DTO는 `GitCicdRepositorySettingsApplyResponse`이며 적용 여부, environment 이름, 적용된 variable 이름과 workflow file 목록을 반환한다.
- GitHub App 권한이 부족하면 `github_app_permission_required`로 중단하고 GitHub App 설정에서 Administration과 Variables의 Read and write 승인을 안내한다. 로그인용 GitHub OAuth token은 Repository 변경에 사용하지 않는다.
- `POST /api/git-cicd-handoffs/:handoffId/aws-role-diff/apply`는 승인된 `awsRoleDiff`를 기준으로 IAM trust policy를 적용하고 검증한다.
- 응답 DTO는 `GitCicdAwsRoleDiffApplyResponse`이며 role ARN, repository, environment, `appliedAt`, `verified`를 반환한다.
- `GitCicdAwsRoleDiff` JSON에는 적용 후 `applied`, `appliedAt`, `verified`를 기록할 수 있다.

```ts
type SourceRepositoryProvider = "internal" | "github";

type SourceRepository = {
  id: string;
  projectId: string;
  provider: SourceRepositoryProvider;
  owner: string;
  name: string;
  defaultBranch: string;
  repositoryUrl: string | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

type GitCicdHandoffStatus =
  | "draft"
  | "pr_created"
  | "pipeline_running"
  | "pipeline_success"
  | "pipeline_failed"
  | "cancelled";

type GitCicdHandoff = {
  id: string;
  projectId: string;
  architectureId: string;
  terraformArtifactId: string;
  sourceRepositoryId: string;
  repositoryProvider: SourceRepositoryProvider;
  repositoryOwner: string;
  repositoryName: string;
  targetBranch: string;
  sourceBranch: string | null;
  commitMessage: string | null;
  pullRequestTitle: string | null;
  pullRequestUrl: string | null;
  pipelineRunUrl: string | null;
  status: GitCicdHandoffStatus;
  statusMessage: string | null;
  userAcceptedChangeId: string;
  createdByUserId: string;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

Git/CI/CD handoff도 `UserAcceptedChange` 이후에만 생성한다. v0 API는 `internal` provider boundary만 사용하며 실제 GitHub PR 생성은 별도 provider 구현에서 담당한다. 저장소 토큰, private key, deploy key, CI secret 원문은 shared type, DB, 응답, 로그에 저장하지 않는다.

`github` provider slice에서는 Terraform artifact metadata를 provider boundary로 넘겨 Source Repository PR 생성 요청 payload를 만든다.
이 payload에는 PR title/body 초안, IaC Preview artifact 경로, plan summary, Pre-Deployment Check 확인 문구,
리뷰 체크리스트 초안이 포함된다. provider 결과로 `pullRequestUrl`이 돌아오면 handoff record는 `status: "pr_created"`와
PR URL을 저장한다. 실제 GitHub token, deploy key, CI secret 원문은 DB, shared type, 응답, 로그에 저장하지 않는다.
pipeline polling/cache 연동은 별도 slice에서 다룬다.

### Git/CI/CD pipeline status cache

#136 slice부터 pipeline status 조회는 `GitCicdHandoffPipelineStatus` DTO로 분리한다. 이 DTO는 handoff record의
`status`, `pullRequestUrl`, `pipelineRunUrl`, `statusMessage`, `updatedAt`만 노출하고, `source: "runtime_cache" | "rds"`로
Runtime Cache hit 여부를 알려준다. `GET /api/git-cicd-handoffs/:handoffId/pipeline-status`는 Runtime Cache를 먼저 읽고,
cache miss 또는 invalid snapshot이면 RDS handoff record를 읽어 같은 응답 모양으로 반환한다. `PATCH /api/git-cicd-handoffs/:handoffId/status`는
RDS record를 갱신한 뒤 best-effort로 Runtime Cache snapshot을 갱신한다.

## Git/CI/CD Monitoring and Pipeline Runs

`GitCicdMonitoringConfig`는 하나의 active `SourceRepository`에 속한다. `GitCicdHandoff`는 승인된 Git/PR handoff로 계속 유지한다. `GitCicdPipelineRun`은 하나의 GitHub workflow run ID·attempt에 속하며 `app` 또는 `infra` 실행 하나를 표현한다. 같은 source commit의 App·Infra run도 서로 다른 record이며 handoff 또는 Direct Deployment record를 대체하지 않는다.

```ts
type GitCicdMonitoringValidationStatus = "required" | "valid" | "invalid";

type GitCicdMonitoredPath = {
  mode: "repository_root" | "subdirectory";
  path: string;
};

type GitCicdMonitoringConfig = {
  sourceRepositoryId: string;
  enabled: boolean;
  monitorBranch: string;
  appPath: GitCicdMonitoredPath;
  infraPath: GitCicdMonitoredPath;
  validationStatus: GitCicdMonitoringValidationStatus;
  validationMessage: string | null;
  validatedAt: IsoDateTimeString | null;
  updatedAt: IsoDateTimeString;
};

type GitCicdPipelineRunStatus =
  | "detected"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

type GitCicdPipelineChangeScope = "app" | "infra" | "app_and_infra";

type GitCicdPipelineExecutionKind = "app" | "infra";

type GitCicdPipelineStageKind =
  | "detect"
  | "app_build"
  | "artifact_publish"
  | "infra_plan"
  | "infra_apply"
  | "app_deploy"
  | "verify";

type GitCicdPipelineStageStatus =
  | "not_started"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "cancelled";

type GitCicdPipelineStage = {
  id: string;
  pipelineRunId: string;
  kind: GitCicdPipelineStageKind;
  status: GitCicdPipelineStageStatus;
  runUrl: string | null;
  startedAt: IsoDateTimeString | null;
  finishedAt: IsoDateTimeString | null;
};

type GitCicdPipelineRun = {
  id: string;
  projectId: string;
  sourceRepositoryId: string;
  handoffId: string | null;
  executionKind: GitCicdPipelineExecutionKind;
  githubWorkflowRunId: string | null;
  githubWorkflowRunAttempt: number | null;
  commitSha: string;
  commitMessage: string;
  branch: string;
  changeScope: GitCicdPipelineChangeScope;
  status: GitCicdPipelineRunStatus;
  statusMessage: string | null;
  upstreamOrderingToken: string;
  logRevision: string;
  pipelineRunUrl: string | null;
  appUrl: string | null;
  apiUrl: string | null;
  startedAt: IsoDateTimeString | null;
  finishedAt: IsoDateTimeString | null;
  lastRefreshedAt: IsoDateTimeString;
  createdAt: IsoDateTimeString;
  stages: GitCicdPipelineStage[];
  release?: ApplicationRelease | null;
};

type GitCicdPipelineLog = {
  id: string;
  pipelineRunId: string;
  stageId: string | null;
  sequence: number;
  level: "info" | "warning" | "error";
  message: string;
  createdAt: IsoDateTimeString;
};

type UpdateGitCicdMonitoringConfigRequest = {
  enabled: boolean;
  monitorBranch: string;
  appPath: GitCicdMonitoredPath;
  infraPath: GitCicdMonitoredPath;
  userAcceptedChangeId: string;
};

type GitCicdMonitoringConfigResponse = { config: GitCicdMonitoringConfig };

type GitCicdPipelineRunListResponse = {
  runs: GitCicdPipelineRun[];
  nextCursor: string | null;
};

type GitCicdPipelineRunResponse = { run: GitCicdPipelineRun };

type GitCicdPipelineRunRefreshResponse = {
  run: GitCicdPipelineRun;
  stale: boolean;
  errorMessage: string | null;
};

type GitCicdInfrastructureRunStage = "configuration" | "infra_plan" | "infra_apply";

type CreateGitCicdInfrastructureRunRequest = {
  repository: string;
  repositoryId: string;
  commitSha: string;
  ref: string;
  workflow: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  workflowRunUrl: string;
};

type CompleteGitCicdInfrastructureRunRequest = {
  conclusion: "succeeded" | "failed" | "cancelled";
  stage: GitCicdInfrastructureRunStage;
};

type GitCicdInfrastructureRunResponse = { run: GitCicdPipelineRun };

type GitCicdPipelineRefreshTargetResult = {
  sourceRepositoryId: string;
  stale: boolean;
  errorMessage: string | null;
};

type GitCicdPipelineProjectRefreshResponse = {
  runs: GitCicdPipelineRun[];
  targets: GitCicdPipelineRefreshTargetResult[];
  stale: boolean;
};

type GitCicdPipelineLogListResponse = {
  logs: GitCicdPipelineLog[];
  nextSequence: number;
};
```

`POST /api/git-cicd-pipeline-runs/:pipelineRunId/refresh`는 `GitCicdPipelineRunRefreshResponse`를 반환한다. GitHub Actions 읽기가 실패하면 마지막 RDS 상태와 함께 `stale: true` 및 비밀이나 provider 원문을 포함하지 않는 고정 `errorMessage`를 반환한다. 성공 시 `stale: false`, `errorMessage: null`이다.

`POST /api/projects/:projectId/git-cicd-pipeline-runs/refresh`는 project 소유권을 확인한 뒤 해당 project의 enabled, valid monitoring target을 모두 read-only로 발견·갱신한다. 개별 target 실패는 그 target의 마지막 RDS 상태를 보존하고 `targets[].stale`로 표시하며, 응답의 `stale`은 하나 이상의 target이 stale일 때 `true`다. Workspace observer는 콘솔이 닫혀 있어도 이 endpoint를 먼저 호출한 다음 RDS 목록을 읽는다.

GitHub Actions 발견은 target branch별 최대 2 page, 최근 최대 10 workflow run으로 제한한다. 각 snapshot은 workflow run ID·attempt·execution kind를 그대로 유지하며 commit SHA로 App·Infra job과 log를 합치지 않는다. 특정 run refresh는 workflow run ID와 attempt를 사용해 같은 commit의 다른 run을 함께 갱신하지 않는다. `upstreamOrderingToken`은 provider의 갱신 시각과 workflow run identity로 만든다. RDS upsert는 이전 token 또는 같은 revision의 terminal-to-non-terminal 역행을 원자적으로 거부한다. 거부된 snapshot은 stage/log를 갱신하지 않는다. workflow run identity/attempt 기반 `logRevision`이 바뀌면 Web은 증분 log sequence와 표시 log를 0/빈 목록으로 초기화해 rerun log를 이전 attempt와 섞지 않는다.

API 경로:

- `GET/PUT /projects/:projectId/source-repositories/:sourceRepositoryId/cicd-monitoring`
- `GET /projects/:projectId/git-cicd-pipeline-runs`
- `POST /projects/:projectId/git-cicd-pipeline-runs/refresh`
- `GET /git-cicd-pipeline-runs/:pipelineRunId`
- `GET /git-cicd-pipeline-runs/:pipelineRunId/logs?sinceSequence=`
- `POST /api/git-cicd/projects/:projectId/infrastructure-runs`
- `POST /api/git-cicd/infrastructure-runs/:runId/heartbeat`
- `POST /api/git-cicd/infrastructure-runs/:runId/complete`
- `POST /git-cicd-pipeline-runs/:pipelineRunId/refresh`

## Reverse Engineering Scan

`ReverseEngineeringScan`은 사용자가 기존 AWS 상태를 읽어오라고 눌렀을 때 생기는 작업 기록이다.

쉽게 말하면 “언제, 어떤 AWS 연결로, 어떤 리전에서, 어떤 리소스를 읽었는지”를 저장한다. 이 기록에는
Access Key, Secret Key, Session Token 같은 민감한 값은 절대 저장하지 않는다. AWS 연결을 삭제해도 스캔
결과는 보존하며, 이때 `awsConnectionId`는 `null`이 되고 화면에는 `연결 삭제됨`으로 표시한다.

```ts
type ReverseEngineeringScanStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

type ReverseEngineeringScan = {
  id: string;
  projectId: string;
  awsConnectionId: string | null;
  provider: CloudProvider;
  region: string;
  resourceTypes: ResourceType[];
  status: ReverseEngineeringScanStatus;
  errorSummary: string | null;
  startedAt: IsoDateTimeString | null;
  completedAt: IsoDateTimeString | null;
  cancelRequestedAt: IsoDateTimeString | null;
  deletedAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

스캔 결과는 `ReverseEngineeringScanResult`에 담는다.

```ts
type ReverseEngineeringScanResult = {
  scan: ReverseEngineeringScan;
  discoveredResources: DiscoveredResource[];
  architectureJson: ArchitectureJson;
  findings: CheckFinding[];
  analysisExclusions: ReverseEngineeringAnalysisExclusion[];
  importSuggestions: ReverseEngineeringImportSuggestion[];
  scanErrors: ReverseEngineeringScanError[];
};
```

각 필드 뜻은 이렇다.

- `discoveredResources`: AWS에서 실제로 발견한 리소스 목록
- `architectureJson`: 보드에서 열 수 있게 바꾼 설계도
- `findings`: 비용, 보안, 설정 문제
- `analysisExclusions`: 아직 분석하지 못하는 리소스와 그 이유
- `importSuggestions`: Terraform import로 넘길 수 있는 제안
- `scanErrors`: 일부 리소스를 읽지 못했을 때의 이유

Reverse Engineering의 `원본`은 `architectureJson`에 담긴 Resource, 관계, 설정을 그대로 유지한다. Cloud provider에는
Architecture Board 좌표가 없으므로 화면에 처음 보여주기 위한 결정론적 기본 위치만 계산한다. 이때 Resource 의미를
추가·삭제·변경하지 않으며, Board Auto Arrange나 의미 변경을 허용한 Compiler 제안과 구분한다.

화면의 `supported`/`review_only` 표시는 저장하는 상태가 아니라 읽기 시점의 presentation 값이다.
`DiscoveredResource.resourceType`, `analysisExcluded`, 관계 유무를 바탕으로 계산하므로, 과거
`ReverseEngineeringScanResult` JSONB의 pre-draft 저장 형태도 이 표시 계산에 필요한 기존 필드를 그대로 제공한다.
따라서 파생 presentation 계층에는 새 표시 필드나 DB migration이 필요 없으며, 이는 과거 JSONB와의 표시 계산
호환성 근거다. 이 범위는 별도 API 응답 또는 저장 결과 읽기 경로 전반을 보장한다는 뜻은 아니다. 원본
`providerResourceId`는 기술 원본 정보로 보존하고, 기본 화면 이름은 읽기 시점에 짧고 사람이 읽을 수 있는 이름으로
유도한다.

`AwsConnection`의 readiness 표시는 UI가 계산하지만, 스캔 권한은 API가 연결을 `verified` 상태로 확인한 경우에만 부여한다.

ALB, CloudFront, ECS의 `supported` 표시는 provider type, 안정적인 import ID, Terraform fixture 검증 계약을 만족한 reader/adapter에만 부여한다. 이 계약을 만족하지 않는 다른 AWS Resource는 `review_only`다.

스캔 중에 보여줄 진행 상황은 `ReverseEngineeringScanLogLine`으로 저장한다.

```ts
type ReverseEngineeringScanLogLine = {
  id: string;
  scanId: string;
  sequence: number;
  stage: ReverseEngineeringScanStage;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  createdAt: IsoDateTimeString;
};
```

로그는 사용자에게 보여줄 수 있게 마스킹된 문장만 저장한다. 원본 오류나 민감한 값이 섞인 `rawMessage`는 저장하지 않는다.

스캔 결과가 만든 Practice Architecture와 import suggestion은 사용자가 확인하기 전까지 기존 프로젝트 상태를 덮어쓰지 않는다.

일부 서비스 조회가 실패해도 `discoveredResources`와 `architectureJson`에 성공적으로 읽은 결과가 있으면 스캔 결과는
사용자가 볼 수 있다. `scanErrors`가 있다는 이유만으로 전체 결과를 실패 처리하거나 보드를 숨기지 않는다. 사용자 화면은
내부 오류 대신 일부 항목이 빠졌다는 짧은 안내와 기존 연결의 가져오기 권한을 갱신하는 행동을 제공한다. 사용자가
`가져온 항목만 사용`을 누르면 성공적으로 읽은 결과만 적용할 수 있으며, 이 클릭을 명시적 승인으로 본다. 추가 확인창은
두지 않지만 일반 적용 버튼과 다른 문구로 불완전한 결과임을 숨기지 않는다.

## Runtime Cache

Redis 기반 Runtime Cache는 Deployment, Reverse Engineering, Git/CI/CD Integration 같은 long-running workflow의 status/cache/log streaming 보조에 사용한다. Runtime Cache 데이터는 원천 기록이 아니며, 최종 기록은 RDS/S3에 저장한다.

Runtime Cache는 사용자 Practice Architecture Resource가 아니므로 `ResourceType`에 Redis를 추가하지 않는다. AI 결과 캐싱은 2순위이며, 캐시된 결과가 deterministic validation이나 Deployment Safety Gate를 대체할 수 없다.

Terraform 기반 Pre-Deployment Check는 정규화한 파일 이름·내용, Trivy version, checks bundle digest, SketchCatch 제외 rule 목록으로 SHA-256 cache key를 만든다. Trivy finding 결과는 process-local LRU와 Runtime Cache에 5분 동안 저장하며, 같은 API process에서 동일 key 검사가 동시에 요청되면 하나의 in-flight scan을 공유한다. Cache miss 또는 cache 장애 시 실제 Trivy 검사를 실행한다. Cached finding은 검사 재사용 결과일 뿐 severity나 Safety Gate 정책을 변경하지 않는다.

버튼 Pre-Deployment Check와 Direct Deployment Plan은 같은 기본 analyzer와 Trivy snapshot cache를 사용한다. Plan이 materialize한 Terraform artifact의 내용 SHA가 버튼 검사 때의 내용과 같으면 Trivy finding snapshot을 재사용하고, 아키텍처 기반 deterministic policy는 현재 `ArchitectureJson`으로 다시 계산한다. Terraform 내용이나 Trivy 정책 identity가 바뀐 경우에만 Trivy를 다시 실행한다.

API runtime은 `REDIS_URL`이 있고 `NODE_ENV !== "test"`일 때 Redis adapter를 사용한다. `REDIS_URL`이 없거나 테스트 환경이면 in-memory fallback을 사용한다. Redis 연결이나 명령이 실패해도 API workflow의 원천 기록은 RDS/S3 기준으로 유지되어야 하며, Runtime Cache adapter는 같은 process 안에서 가능한 fallback cache를 사용해 요청을 실패시키지 않는다.

단, Production Live Observation의 원자 집계는 여러 API process가 공유하는 Redis가 진실의 원천이므로 예외다. `LIVE_OBSERVATION_ENABLED=true`인 Production에서 Redis readiness가 실패하면 세션 생성을 `503 LIVE_OBSERVATION_CACHE_UNAVAILABLE`로 차단한다.

## Live Observation Session

`LiveObservationSession` v1은 성공한 `demo_web_service` Deployment의 실제 요청과 AWS 상태를 최대 15분 동안 관측하는 Runtime Cache 기반 세션이다. v1 runtime session은 계속 Redis에만 저장하며, session 자체의 RDS row나 migration은 만들지 않는다.

### Deployment Live Observation Manifest v2

v2는 Deployment가 실제로 만든 관측 대상을 서버가 검증한 뒤 `DeploymentLiveObservationManifestRecord`로 RDS에 저장한다. 이 record는 `Deployment`와 `deploymentId` 기준 one-to-one이고, 해당 Deployment의 Terraform artifact와 검증 시점에 고정되는 immutable verified record다. v1 session cache를 대체하지 않으며, 이후 candidate/readiness 검사가 신뢰할 수 있는 원천 계약을 제공한다.

```ts
type DeploymentLiveObservationManifestRecord = {
  deploymentId: string;
  schemaVersion: 2;
  status: "valid" | "manifest_invalid";
  manifest: DeploymentLiveObservationManifestV2 | null;
  invalidReason: string | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};

type DeploymentLiveObservationManifestV2 = {
  schemaVersion: 2;
  provider: "aws";
  provenance: {
    deploymentId: string;
    terraformArtifactSha256: string;
    awsConnectionId: string;
    region: string;
    verifiedAt: IsoDateTimeString;
  };
  endpoints: {
    audienceBaseUrl: string;
    trafficUrl: string;
  };
  pressure: {
    metric: "requests_per_target_per_minute";
    target: 60;
    windowSeconds: 60;
  };
  adapter:
    | {
        kind: "aws-live-observation";
        version: 1;
        payload: AwsLiveObservationAdapterPayloadV1;
      }
    | {
        kind: "aws-live-observation";
        version: 2;
        payload: AwsLiveObservationAdapterPayloadV2;
      }
    | {
        kind: "aws-live-observation";
        version: 3;
        payload: AwsLiveObservationAdapterPayloadV3;
      }
    | {
        kind: "aws-live-observation";
        version: 4;
        payload: AwsLiveObservationAdapterPayloadV4;
      };
};

type AwsLiveObservationAdapterPayloadV1 = {
  cloudFrontDistributionId: string;
  loadBalancerArn: string;
  targetGroupArn: string;
  autoScalingGroupName: string;
};

type AwsLiveObservationAdapterPayloadV2 = {
  trafficHostname: string;
  loadBalancerDnsName: string;
  loadBalancerArn: string;
  targetGroupArn: string;
  logGroupNames?: string[];
  capacityTarget:
    | { kind: "asg"; autoScalingGroupName: string }
    | {
        kind: "ecs_fargate";
        clusterName: string;
        serviceName: string;
        maxCapacity: number;
      };
};

type AwsLiveObservationAdapterPayloadV3 = {
  cloudFrontDistributionId: string;
  cloudFrontDomainName: string;
  frontendBucketName: string;
  defaultOriginId: string;
  originAccessControlId: string;
  apiOriginId: string;
  apiPathPattern: "/api/*";
  healthPathPattern: "/health";
  frontendBucketPublicAccessBlocked: true;
  bucketPolicyAllowsCloudFrontRead: true;
  topologyVerifiedAt: IsoDateTimeString;
  frontendState: "current" | "may_be_previous";
  loadBalancerDnsName: string;
  loadBalancerArn: string;
  targetGroupArn: string;
  logGroupNames?: string[];
  capacityTarget: {
    kind: "ecs_fargate";
    clusterName: string;
    serviceName: string;
    maxCapacity: number;
  };
};

type AwsLiveObservationAdapterPayloadV4 = Omit<
  AwsLiveObservationAdapterPayloadV3,
  "capacityTarget"
> & {
  capacityTarget: {
    kind: "ecs_fargate";
    clusterName: string;
    serviceName: string;
    scaling:
      | { mode: "fixed" }
      | {
          mode: "service_auto_scaling";
          minCapacity: number;
          maxCapacity: number;
          metric: string | null;
          targetValue: number | null;
        };
  };
};

type DeploymentLiveObservationArchitectureResponse = {
  deploymentId: string;
  architectureId: string;
  terraformArtifactSha256: string;
  architecture: ArchitectureJson;
};

type DeploymentResourceObservationState = "observed" | "delayed" | "unavailable" | "not_supported";
```

`provenance`는 Deployment, Terraform artifact SHA-256, 연결, region, 서버 검증 시점을 증명한다. `deploymentId`는 UUID여야 하고, `awsConnectionId`는 AWS connection repository가 `randomUUID()`로 생성하는 canonical lowercase UUIDv4만 허용한다. Role ARN, External ID, credential 값은 이 provenance identifier에 저장하지 않으며 AWS connection record의 보호된 필드에서만 다룬다. `endpoints`는 credential, query, fragment가 없는 absolute HTTPS URL만 허용하고, `pressure`는 분당 target당 60 requests를 60초 window로 해석하는 고정 계약이다. core envelope는 provider-neutral하게 유지하며, MVP의 의도적인 `provider: "aws"` 값과 `adapter`만 Provider Adapter 경계를 나타낸다. core consumer는 adapter의 `kind`와 `version`만 분기하고 AWS payload 해석은 AWS Provider Adapter 경계에 둔다. shared contract는 v1-v4 discriminated union으로 안전한 payload shape만 제한한다.

`kind: "aws-live-observation"`, `version: 1`의 runtime validator는 `payload`를 위 `AwsLiveObservationAdapterPayloadV1`의 정확한 네 string key만 가진 strict object로 제한한다. `resourceSuffix`는 `deploymentId`에서 hyphen을 제거한 뒤 앞 12개 hex 문자를 lowercase로 변환한 서버 소유 결정값이다. `loadBalancerArn`의 resource name은 정확히 `loadbalancer/app/sc-lo-alb-${resourceSuffix}`, `targetGroupArn`은 정확히 `targetgroup/sc-lo-api-${resourceSuffix}`, `autoScalingGroupName`은 정확히 `sc-lo-asg-${resourceSuffix}`여야 한다. ALB/TG ARN은 같은 AWS partition, region, 12자리 account ID를 사용해야 하고 그 region은 `provenance.region`과 같아야 한다. `cloudFrontDistributionId`는 `E`로 시작하는 bounded uppercase distribution ID이며 Stage 2 materializer가 AWS relationship read로 실제 연관성을 검증한다. array, nested object, extra key, number, boolean, 임의 string leaf는 허용하지 않는다.

`version: 2`는 기존 v1 row를 계속 읽으면서 운영 Deployment의 ASG 또는 ECS/Fargate capacity target을 명시한다. `trafficHostname`은 ACM certificate의 `domainName`과 정확히 같은 public custom hostname이며 `trafficUrl` host와 일치해야 한다. `loadBalancerDnsName`은 approved region/partition의 public AWS ALB DNS만 허용하고 ALB ARN name에 결합한다. IP literal, localhost, `internal-*`, AWS ALB 기본 도메인을 custom hostname으로 사용하는 값, credential, query, fragment, custom HTTPS port는 거부한다. ALB/TG ARN의 partition, account, region 일치와 bounded AWS name을 검증하고, ECS/Fargate는 `clusterName`, `serviceName`, positive integer `maxCapacity`를 모두 요구한다. `logGroupNames`는 비민감 Terraform output에서 검증한 최대 10개의 CloudWatch Logs group 이름만 담는다. manifest materializer는 `SUCCESS` Deployment의 승인된 Terraform artifact SHA-256/account/region, 현재 verified AWS connection, 비민감 Terraform output, `SKETCHCATCH_PUBLIC_BASE_URL`만 사용하며 불완전한 증거는 generic `manifest_invalid` row로 저장한다.

`version: 3`은 CloudFront distribution/domain, S3 frontend bucket과 OAC, API/health behavior, ALB/TG, ECS Service를 하나의 검증된 topology payload로 고정한다. `version: 4`는 같은 topology를 유지하면서 ECS capacity 의미를 `scaling` discriminated union으로 분리한다. 고정 Fargate Service는 `{ mode: "fixed" }`만 저장하므로 `maxCapacity`, scale-out metric, threshold가 없어도 valid하다. Service Auto Scaling이 실제 Terraform resource와 output으로 확인된 경우에만 `{ mode: "service_auto_scaling", minCapacity, maxCapacity, metric, targetValue }`를 저장한다. `metric`과 `targetValue`는 관측 설명에 필요한 근거가 없을 때 `null`일 수 있지만, capacity 범위는 검증된 정수여야 한다. 새 materialization은 v4를 만들고 v2/v3 record는 호환 경로에서 계속 읽는다.

내장 `ecs-fargate-container-app` Template은 관측 가능한 bounded scale-out을 위해 ECS Service에 Application Auto Scaling Target과 Target Tracking Policy를 연결한다. 기본값은 `minCapacity: 1`, `maxCapacity: 3`, `ALBRequestCountPerTarget`의 `targetValue: 10`, scale-out cooldown 30초, scale-in cooldown 60초다. 이 값은 새 Architecture/Plan의 Terraform 입력일 뿐 기존 Deployment나 AWS Resource를 자동 변경하지 않는다.

`GET /api/deployments/:deploymentId/live-observation-architecture`는 사용자가 선택한 Deployment가 참조하는 저장된 `architectureId`의 `ArchitectureJson`과 승인된 `terraformArtifactSha256`를 함께 반환한다. 이 API는 mutable project draft나 현재 Workspace 편집 상태를 읽지 않으며 Architecture를 변경하지 않는다. 따라서 Live Observation 지도는 세션 생성 전부터 배포 시점에 고정된 전체 Resource와 edge를 표시할 수 있다. 응답이 없거나 조회가 실패해도 Architecture 표시만 실패하며, 기존 Output URL 검증과 관측 세션 생성 안전 검증은 별도로 유지한다.

지도는 세션 시작 전 지원 Resource를 `configured` UI 상태로 표시한다. 세션 snapshot이 있으면 provider aggregate state를 `observed`, `delayed`, `unavailable` 중 하나로 매핑하고, 현재 Provider Adapter가 관측하지 않는 Resource도 숨기지 않고 `not_supported`(`관측 데이터 없음`)로 표시한다. `configured`는 프론트 표시 상태이며 persisted `DeploymentResourceObservationState` union에는 포함하지 않는다.

v4 union, immutable Architecture 조회 응답, Resource observation state는 기존 Deployment/Architecture/manifest 데이터를 읽는 API·shared contract 변경이다. 새 DB table이나 column을 추가하지 않으므로 DB migration은 없다.

`status: "valid"`이면 검증을 통과한 `manifest`가 반드시 존재하고 `invalidReason`은 `null`이다. `status: "manifest_invalid"`이면 `manifest`는 `null`이고 서버가 정한 non-empty generic `invalidReason`이 반드시 존재한다. 호출자가 제공한 실패 사유나 raw diagnostic은 보존하지 않는다. raw Terraform, credential, Role ARN, External ID, private token, password, access key, secret key, private key 등 secret material은 manifest record 어디에도 저장하지 않는다.

manifest materialization 실패는 이미 성공한 Deployment의 `SUCCESS`를 변경하지 않는다. 대신 같은 one-to-one row에 `manifest_invalid`를 기록한다. 기존 adapter v1 row는 repository/parser 호환을 위해 그대로 읽지만 새 v2 session 생성과 immutable reuse에는 사용할 수 없다. row가 없는 Deployment는 인증된 session 생성 요청에서 verified evidence를 한 번 materialize한다. repository는 insert-once이고 conflict에서 동일한 row만 재사용한다. 이후 row는 immutable source of truth로 사용하고, session 생성 때마다 Deployment 접근권한과 approved artifact/account/region, verified AWS connection, 지원되는 non-legacy adapter(v2/v3/v4), adapter ARN identity, 현재 `SKETCHCATCH_PUBLIC_BASE_URL`과 manifest `audienceBaseUrl` 일치를 다시 확인한다.

### Live Observation capability v2

v2 public collector capability는 JWT나 claims payload가 아니라 `<kid>.<token>` 형식의 bearer credential이다. `token`은 아래 결과 32-byte를 unpadded base64url로 인코딩한 43자 값이다.

```text
HMAC-SHA256(
  secret,
  "sketchcatch:live-observation:v2\0"
  + observationId + "\0"
  + tokenVersion + "\0"
  + expiresAt
)
```

`createdAt`은 고정 HMAC 입력에 넣지 않는다. 대신 신뢰된 Store metadata로 `createdAt <= evaluatedAt < expiresAt`과 `expiresAt - createdAt <= 15분`을 검사한다. 검증 시 route path와 v2 Store record가 제공한 `observationId`, `tokenVersion`, `createdAt`, `expiresAt`, `kid`를 신뢰된 expected claims로 사용한다. credential의 `kid`는 Store-bound `kid`와 정확히 같아야 하고, 검증기는 그 `kid`에 해당하는 configured key 하나만 선택한 뒤 32-byte MAC을 constant-time 비교한다. 이 경계는 previous key가 current key로 만들어진 session의 credential을 mint하지 못하게 한다.

capability는 non-secret `currentKid`만 먼저 노출한다. v2 Store는 이 값을 session의 `kid`로 원자 저장하면서 Store/Redis clock으로 `createdAt`과 `expiresAt`을 결정한다. Store create/read 결과는 trusted claims, stored `kid`와 함께 같은 operation의 canonical UTC ISO `evaluatedAt`을 반드시 포함한다. production Redis adapter는 이 값들을 동일한 `Redis TIME`에서 만들고 in-memory Store는 동일한 injected Store clock 값을 사용한다. `issue(claims, evaluatedAt)`, `regenerate(expected, evaluatedAt)`, `verify(credential, expected, evaluatedAt)`는 lifetime과 rotation 판단에 이 명시적 Store time만 사용하며 API process clock, client 입력, 별도 시점에 다시 읽은 clock으로 대체하지 않는다. `regenerate`는 해당 current 또는 아직 유효한 previous key로 같은 credential을 결정론적으로 다시 만든다. claims가 invalid/expired이거나 stored `kid`에 해당하는 key가 없거나 rotation window 밖이면 `null`을 반환하며, 성공시키기 위해 stored `kid`를 current 값으로 바꾸지 않는다.

v2 Store에는 non-secret인 `kid`, `tokenVersion`, `createdAt`, `expiresAt`만 저장한다. capability credential/token, token의 SHA-256, 둘 중 하나를 key로 한 index, token-bearing URL은 RDS, S3, Runtime Cache, 로그, `localStorage`, `sessionStorage`에 저장하지 않는다. audience URL은 `${SKETCHCATCH_PUBLIC_BASE_URL}/observe/:observationId`이고 capability를 포함하지 않는다. audience page는 exact Origin 검증을 통과한 `bootstrap` 응답에서 session-bound transient credential을 받아 page lifetime 동안 메모리에만 보유하며 응답은 `Cache-Control: no-store`를 사용한다. 여러 audience client의 반복 bootstrap은 허용한다.

rotation 중 previous key는 absolute `stoppedIssuingAt`을 기준으로 `createdAt <= stoppedIssuingAt`이고 `evaluatedAt < stoppedIssuingAt + 15분`일 때만 검증하거나 재생성한다. stop 이후 생성된 session은 overlap 안이어도 previous key를 사용할 수 없다. 정확한 경계 시각부터 거부하며 credential 자체의 `expiresAt`이 더 이르면 그 시각에 먼저 끝난다. `stoppedIssuingAt`은 모든 old process가 실제 issuance를 멈춘 뒤 기록하며, process restart가 overlap을 다시 시작하거나 연장해서는 안 된다.

### Live Observation Store v2

v2 Store는 lifecycle, receipt 집계, fenced provider observation을 위한 전용 provider-neutral seam이다. 외부 Interface는 session 네 연산과 observer lease/commit, presenter lease 연산만 노출한다. caller가 TTL, rate policy, clock을 변경하거나 내부 Map/Redis key를 검사·초기화하는 메서드는 제공하지 않는다. in-memory Adapter의 주입 now 함수는 테스트와 로컬 실행을 위한 내부 구성이고 production Redis Adapter는 같은 계약을 Redis TIME과 원자 Lua로 구현한다.

```ts
type LiveObservationStore = {
  createSession(input: LiveObservationStoreCreateInput): Promise<LiveObservationStoreCreateResult>;
  readSession(input: { observationId: string }): Promise<LiveObservationStoreReadResult>;
  collectEvent(input: {
    observationId: string;
    eventId: string;
  }): Promise<LiveObservationStoreCollectResult>;
  stopSession(input: {
    observationId: string;
    deploymentId: string;
  }): Promise<LiveObservationStoreStopResult>;
  claimObserverLease(input: {
    observationId: string;
    observerId: string;
  }): Promise<LiveObservationStoreObserverLeaseClaimResult>;
  commitObservation(input: {
    observationId: string;
    observerId: string;
    fencingToken: number;
    observation: LiveObservationStoreObservation;
  }): Promise<LiveObservationStoreObservationCommitResult>;
};
```

create input은 canonical lowercase observation UUID, 검증된 DeploymentLiveObservationManifestV2, non-secret capability metadata인 kid와 positive safe integer tokenVersion만 받는다. Store는 manifest를 parseDeploymentLiveObservationManifestV2로 다시 파싱하며 TypeScript annotation을 신뢰하지 않는다. manifest의 provider와 adapter는 opaque 관측 대상이고 provenance.deploymentId만 active Deployment claim key로 사용한다.

모든 non-throwing result는 kind discriminant와 evaluatedAt을 가진다. evaluatedAt, createdAt, expiresAt, bucket, expiry/stop 경계는 한 operation에서 정확히 한 번 읽은 Store clock 값으로 계산한다. create는 created, active_exists, observation_id_conflict를 반환하고 read는 active, terminal, not_found를 반환한다. collect는 accepted, duplicate, rate_limited, event_limit_reached, gone, not_found를 반환하며 accepted 계열에는 live, gone에는 terminal session을 사용한다. stop은 stopped, already_terminal, not_found를 반환한다. malformed caller input은 LiveObservationStoreInputError, 잘못된 in-memory clock은 LiveObservationStoreClockError이고, future Redis 장애를 위한 LiveObservationStoreUnavailableError는 고정된 generic message만 사용한다.

active read shape는 observationId, deploymentId, status, 안전하게 재파싱한 manifest, kid/tokenVersion, createdAt/expiresAt, live, latestObservation을 포함한다. `latestObservation.payload`는 아래 provider-neutral 공통 snapshot schema로 다시 파싱한 값만 허용하고 임의 JSON이나 provider credential을 받지 않는다. observer lease와 fencing token을 얻은 service만 새 snapshot을 commit한다. live는 acceptedEventCount, 10초 rollingRequestsPerSecond, projectedRequestsPerMinute, manifest pressure target 기준 pressurePercent, pressureLevel, observedAt을 반환하고 계산값은 소수 셋째 자리까지 반올림한다. pressureLevel 경계는 normal 40 미만, warning 40 이상 70 미만, high 70 이상 100 미만, critical 100 이상이다.

```ts
type LiveObservationProviderState = "available" | "delayed" | "unavailable";

type LiveObservationProviderSnapshot = {
  requests: number | null;
  errorRate: number | null;
  p95LatencyMs: number | null;
  availability: number | null;
  capacity: {
    desired: number | null;
    running: number | null;
    healthy: number | null;
    max: number | null;
  };
  logs: Array<{ timestamp: IsoDateTimeString; message: string }>;
  observedAt: IsoDateTimeString | null;
  state: LiveObservationProviderState;
};
```

`available`만 완전한 정량값을 가진다. `requests`는 immutable manifest가 가리키는 동일 Target Group, 동일 완료 period의 2xx/3xx/4xx/5xx response class 합계이고 `errorRate`의 분자는 그중 5xx다. p95가 선택한 period는 각 response class의 전체 finite point에서 정확히 찾고, 모든 query result가 유일한 `StatusCode=Complete`일 때만 사용한다. 같은 period에 하나 이상의 response class가 있을 때만 누락 class를 sparse zero로 보며, latency만 있거나 status가 누락·non-Complete이거나 stale·다른 period의 class만 있으면 request evidence는 unavailable이다. `delayed`와 `unavailable`은 requests, errorRate, p95LatencyMs, availability, capacity 수치를 모두 `null`로 저장하고 이전 수치를 보존하거나 sample 값으로 대체하지 않는다. ASG `running`은 `InService` instance만 세고 ECS `running`은 service task count를 사용하며, 두 target의 `healthy`는 immutable manifest의 정확한 target group ARN으로 조회한 ELB target health를 사용하고 항상 `running` 이하다. Manifest materializer는 ASG와 ECS capacity evidence가 동시에 존재하는 output을 모호한 target으로 거부한다. 로그는 최근 5분, 최대 50건, 메시지당 4,096자이며 Authorization/JWT/GitHub token/PEM을 포함한 credential-shaped 값이 중앙 masker로 제거된 fresh evidence만 허용한다.

Store 고정 policy는 session lifetime 15분, terminal tombstone retention 60초, rolling/rate window 10초, weighted burst 초당 20, rolling window accepted event 120, session accepted event 10,000이다. duplicate는 burst/rate/cap을 소비하지 않으며 cap 검사는 dedupe 뒤, rate 계산 앞에서 수행한다. weighted burst는 candidateCurrentSecond + previousSecond \* (1 - currentSecondProgress)이고, rejected eventId는 dedupe set에 넣지 않아 이후 재시도할 수 있다.

create와 Deployment active claim 설정은 await 없는 하나의 원자 구간이다. 같은 Deployment의 concurrent create는 하나만 created이고 나머지는 모두 같은 session의 active_exists다. expiry와 stop은 claim이 여전히 같은 observationId를 가리킬 때만 compare-delete한다. active claim이 있으면 새 observationId 충돌보다 active_exists를 우선한다.

정확한 expiresAt부터 active session은 expired terminal tombstone으로 보인다. 자연 만료 finalLive는 뒤늦은 read 시각이 아니라 정확한 expiresAt에 고정되며, explicit stop은 해당 operation의 evaluatedAt에 고정된다. terminal tombstone은 observationId, deploymentId, status, createdAt, expiresAt, terminalAt, finalLive, finalObservation만 유지한다. manifest, adapter payload, awsConnectionId, capability metadata, eventId, dedupe/rate bucket, lease 상태는 보존하지 않는다. terminalAt + 60초 경계부터 tombstone은 not_found다. expiry/stop 직후 기존 tombstone이 남아 있어도 Deployment claim은 새 observationId가 사용할 수 있다.

Store에는 capability credential/MAC, token-derived SHA/hash/index, Authorization 값, Role ARN, External ID, credential-bearing URL, raw Terraform을 입력하거나 저장하지 않는다. manifest의 정상 provenance인 terraformArtifactSha256는 이 금지 대상이 아니며 active session에서 그대로 유지된다. 모든 input, active/terminal result, nested manifest/payload/live 값은 깊게 분리된 fresh copy다.

in-memory Adapter와 future Redis Adapter는 같은 reusable contract suite를 통과해야 한다. Redis 구현은 active-only state를 expiresAt에 종료하면서도 expiresAt + 60초까지 최소 expiry shadow와 precomputed finalLive를 유지해야 하며, Redis SCAN, keyspace notification, 정확한 만료 시각의 request 도착, process-local timer에 correctness를 의존하지 않는다. Task 3A는 observer fencing과 presenter boost lease를 포함하지 않고, Task 3B가 같은 Store seam을 확장한다.

### Runtime session v1 (legacy)

아래 session, SHA-256 lookup key, query/path token 계약은 현재 v1 runtime에만 해당한다. production에서는 비활성 상태로 유지하며 v2 capability, Store, collector 구현에 재사용하지 않는다.

```ts
type LiveObservationStatus = "active" | "stopped" | "expired";

type LiveObservationPressureLevel = "normal" | "warning" | "high" | "critical";

type LiveObservationAwsState = "available" | "delayed" | "unavailable";

type LiveObservationSession = {
  id: string;
  deploymentId: string;
  status: LiveObservationStatus;
  audienceUrl: string;
  trafficApiUrl: string;
  createdAt: IsoDateTimeString;
  expiresAt: IsoDateTimeString;
};
```

public token은 256-bit base64url로 만들고 SHA-256 lookup key만 Runtime Cache key에 사용한다. token 원문은 독립 response 필드, RDS, 로그, `localStorage`에 저장하지 않고 `audienceUrl` query 안에서만 전달한다.

`LiveObservationSnapshot`은 즉시 수집한 `live`, 지연된 CloudWatch 실측 `cloudWatch`, ASG/EC2 또는
ECS/Fargate 실제 상태 `capacity`를 분리한다.

```ts
type LiveObservationSnapshot = {
  observationId: string;
  status: LiveObservationStatus;
  live: {
    acceptedEventCount: number;
    rollingRequestsPerSecond: number;
    projectedRequestsPerMinute: number;
    pressurePercent: number;
    pressureLevel: LiveObservationPressureLevel;
    observedAt: IsoDateTimeString;
  };
  cloudWatch: {
    state: LiveObservationAwsState;
    requestCountPerTarget: number | null;
    periodSeconds: 60;
    observedAt: IsoDateTimeString | null;
    delayedBySeconds: number | null;
    errorCode: string | null;
  };
  capacity: {
    state: LiveObservationAwsState;
    desiredCapacity: number | null;
    currentInstanceCount: number | null;
    inServiceInstanceCount: number | null;
    maxCapacity: number | null;
    instances: Array<{
      instanceId: string;
      lifecycleState: string;
      healthStatus: string;
    }>;
    latestActivity: {
      statusCode: string;
      description: string;
      startedAt: IsoDateTimeString;
      endedAt: IsoDateTimeString | null;
    } | null;
    observedAt: IsoDateTimeString | null;
    errorCode: string | null;
  };
};
```

API 계약:

- `POST /api/deployments/:deploymentId/live-observations`: active 세션 생성 또는 재사용
- `GET /api/deployments/:deploymentId/live-observations/:observationId`: 최신 snapshot
- `GET /api/deployments/:deploymentId/live-observations/:observationId/stream`: snapshot SSE
- `POST /api/deployments/:deploymentId/live-observations/:observationId/stop`: 관측 세션만 종료
- `POST /api/live-observations/public/:observationId/bootstrap`: active session-bound transient credential 재생성
- `POST /api/live-observations/public/:observationId/requests`: 서버가 검증된 ALB target의 2xx를 확인한 뒤 receipt 수집

`LIVE_OBSERVATION_ENABLED=false`이면 인증 세션 관리 경로는 service나 Store를 호출하지 않고
`503 LIVE_OBSERVATION_DISABLED`를 반환한다. API는 모든 응답의 `x-request-id`에 Fastify request ID를
반환한다. Web은 API 오류에 HTTP method, query/fragment를 제거한 path, HTTP status 또는 응답 없음,
error code, 선택적인 request ID를 표시하며 credential-bearing query와 fragment는 화면에 복제하지 않는다.

public request body는 `{ eventId: string }`만 받는다. count나 target URL을 받지 않는다. direct `/events` endpoint는 제공하지 않는다. 서버가 global per-IP limiter와 public ALB target 검증을 통과한 요청에서 2xx를 받은 뒤에만 receipt를 기록한다. 최초 수락은 `202`, 중복은 `200`과 `accepted: false`, 만료·중지는 `410`, rate limit은 `429`를 사용한다.

SSE는 연결 직후 전체 snapshot을 보내고 live count는 최대 1초, AWS 상태는 최대 10초 간격으로 갱신한다. 15초 heartbeat를 보내며 재연결 시 최신 전체 snapshot을 다시 보낸다. 인증된 GET snapshot은 SSE fallback이다.

## AI 결과 DTO

AI는 원천 진실이 아니라 설명과 제안 계층이다. 배포 가능한 artifact는 deterministic graph, generator, validation, Terraform CLI 결과를 거쳐야 한다.

AI provider 응답에는 호출 출처와 비용 추적을 위한 metadata를 함께 둔다. Bedrock, Amazon Q Business, Amazon Transcribe는 `AI_BILLING_MODE=aws_credit_only`와 provider별 credit confirmation flag가 모두 충족될 때만 실제 호출한다. 오류 분석과 에이전트 리뷰는 Amazon Q, Bedrock, deterministic rule fallback 순서로 전환하며, 조건이 맞지 않는 provider는 호출하지 않고 안전한 시도 결과만 metadata에 남긴다.

Architecture Draft의 clarification 질문과 option은 provider availability보다 먼저 결정론적으로 계산한다. 이 응답은 Amazon Q를 호출하지 않으며 `providerMetadata.provider`도 `fallback`으로 기록한다. 실제 Amazon Q provenance는 요구사항이 완성되고 credit gate를 통과한 뒤 Q Business 응답을 사용한 결과에만 부여한다.

Architecture Draft는 사용자 최초 질의와 질문 답변을 `ArchitectureIntentPlan`으로 정규화한다. OpenAI normalizer는 이 단계에서만 선택적으로 사용하며 `patternIds`, 필수 리소스, 수량, 금지 capability, runtime topology, 리전과 가용성을 반환한다. OpenAI 결과는 deterministic normalizer 결과와 병합되고, `no EC2`, Fargate, 파일 업로드 없음과 같은 명시적 금지 조건이 우선한다.

Amazon Q Business는 Anonymous application의 `RETRIEVAL_MODE`만 사용한다. API는 선택된 각 `patternId`를 `pattern_id` equals filter로 따로 검색하고, 기대한 인덱스 문서의 `documentId`가 citation에 포함된 경우에만 해당 패턴을 승인한다. 여러 패턴을 하나의 OR 검색으로 가져오지 않으며 Creator mode나 Q 사용자 구독을 Architecture Draft 경로에 사용하지 않는다.

Q의 자유 형식 `requiredResources`, 좌표, edge, Terraform 값은 원천 진실로 사용하지 않는다. citation으로 승인된 패턴은 backend canonical pattern registry가 결정론적 `ArchitectureIntentPlan`과 `ArchitectureJson`으로 조립한다. canonical materializer는 필수 리소스와 수량을 보충하고, 패턴별 연결 순서, EC2 private subnet 분산, 금지 리소스 제거, 중복 singleton 제한, orphan edge 검증을 적용한다. 검증 실패 시 Q 재검색은 최대 한 번만 수행하며 재검증도 실패하면 provider 결과를 폐기하고 안전한 fallback 또는 생성 거부로 처리한다.

실시간 방식, HTTPS, 이벤트성 급증, 가용성, 음성 전사는 `ArchitectureOperationalRequirements`로 별도 해석한다. 운영 정책은 Q preview와 canonical plan 모두에 적용하며, WebSocket/SSE/polling edge, ECS/EC2 scaling 리소스, HTTPS listener/ACM, 다중 실행 계층과 RDS Multi-AZ, 음성 전용 private S3와 Transcribe IAM 권한 및 audio flow를 실제 topology에서 검증한다. 검증 결과는 예외 문자열이 아니라 `{ ok: true } | { ok: false; issues: string[] }` typed result로 반환한다.

Architecture Draft 오류는 원인별 HTTP 계약을 사용한다. 사용자 요구사항을 재생성 후에도 충족하지 못하면 `422 unprocessable_entity`, Q 응답 형식이 유효하지 않으면 `502 bad_gateway`, Q 호출 자체가 불가능하면 `503 service_unavailable`, 백엔드 내부 조립 결함은 `500 internal_server_error`다. NDJSON stream은 header 전송 뒤 HTTP 상태를 바꿀 수 없으므로 terminal error event의 `statusCode`로 같은 분류를 전달한다.

```ts
type AiProvider = "bedrock" | "amazon_q" | "amazon_transcribe" | "openai" | "fallback";

type AiProviderAttempt = {
  provider: AiProvider;
  service: AiProviderMetadata["service"];
  status: "succeeded" | "fallback" | "skipped" | "failed";
  fallbackReason?: LlmExplanation["fallbackReason"];
};

type AiProviderMetadata = {
  provider: AiProvider;
  service:
    | "bedrock_runtime"
    | "amazon_q_business"
    | "amazon_transcribe"
    | "openai_responses"
    | "rule_fallback";
  model?: string;
  routeTarget: string;
  cacheHit: boolean;
  cacheKey: string;
  estimatedUsage: {
    inputCharacters: number;
    inputTokensEstimate: number;
    outputCharacters?: number;
    outputTokensEstimate?: number;
  };
  billingMode: "aws_credit_only" | "standard" | "disabled";
  attempts?: AiProviderAttempt[];
  generatedAt: IsoDateTimeString;
};
```

```ts
type AiArchitectureDraftResult = {
  architectureJson: ArchitectureJson;
  title: string;
  metadata: AiResultMetadata;
  llmExplanation?: LlmExplanation;
};
```

Natural Language Diagramming의 `ArchitectureDraft`는 LLM 자유 생성이 아니라 규칙 기반 요구사항 fact 조립으로 만든다. 같은 Requirement Prompt는 같은 `ArchitectureJson`을 반환해야 한다. `LlmExplanation` 문구는 보조 설명이므로 결정성 기준에 포함하지 않는다.

```ts
type ArchitectureDraftCandidateExclusion = {
  candidateId: string;
  resourceType: ResourceType;
  label: string;
};

type ArchitectureDraftClarificationAnswer = {
  questionId: string;
  answer: string;
};

type CreateArchitectureDraftRequest = {
  prompt: string;
  clarificationAnswers?: ArchitectureDraftClarificationAnswer[];
  candidateExclusions?: ArchitectureDraftCandidateExclusion[];
};

type ArchitectureDraftClarification = {
  status: "needs_clarification";
  questionId: string;
  question: string;
  suggestions: string[];
  validationMessage?: string;
  providerMetadata: AiProviderMetadata;
};

type CreateArchitectureDraftResponse = AiArchitectureDraftResult | ArchitectureDraftClarification;

type ArchitectureDraftProgressSnapshot = {
  sequence: number;
  provisionalArchitectureJson: ArchitectureJson;
  excludableCandidateIds: string[];
};

type ArchitectureDraftStreamEvent =
  | {
      type: "progress";
      snapshot: ArchitectureDraftProgressSnapshot;
    }
  | { type: "result"; result: CreateArchitectureDraftResponse }
  | { type: "error"; error: ApiErrorResponse & { statusCode: number } };

type ArchitectureRequirementFact =
  | "web_frontend"
  | "static_delivery"
  | "server_runtime"
  | "database"
  | "object_storage"
  | "file_upload"
  | "auth_or_user_data"
  | "serverless_runtime"
  | "network_boundary"
  | "iam_permissions"
  | "observability"
  | "encryption";

type ArchitectureDraftPattern =
  | "static_site"
  | "api_server"
  | "backend_with_db"
  | "server_storage"
  | "serverless_function";

type ArchitectureServicePurpose =
  | "landing_page"
  | "file_upload_service"
  | "auth_web_service"
  | "reservation_service"
  | "content_board"
  | "api_backend"
  | "data_storage"
  | "unknown";

type ArchitectureCapability =
  | "static_delivery"
  | "file_upload"
  | "authentication"
  | "relational_data"
  | "admin_workflow"
  | "public_api"
  | "private_user_data"
  | "media_storage";

type ArchitectureIntent = {
  servicePurpose: ArchitectureServicePurpose;
  capabilities: ArchitectureCapability[];
  constraints: {
    budget?: "low" | "normal";
    traffic?: "small" | "growth";
    security?: "basic" | "sensitive";
    computePreference?: "ec2" | "serverless" | "unspecified";
  };
  confidence: number;
  missingQuestions: string[];
};
```

`clarificationAnswers`는 현재 AI 대화에서 사용자가 직접 입력하거나 선택지로 고른 추가 질문 답변을 `questionId`와 분리해 전달하는 요청 계약이다. 서버는 질문 문장 전체가 아니라 해당 `answer`만 질문별 규칙으로 해석한다. 답변이 질문 문맥에 맞지 않으면 `validationMessage`와 같은 `questionId`를 반환해 같은 질문을 다시 하고, 다음 질문이나 Draft 생성으로 넘어가지 않는다.

검증된 답변만 원래 Requirement Prompt 뒤의 구조화된 `Accepted architecture clarification answers` 문맥과 Amazon Q payload에 포함한다. 질문 문장 자체는 Requirement Prompt에 답변처럼 합치지 않으며, 선택지 클릭과 직접 자연어 입력은 같은 계약을 사용한다.

`POST /api/ai/architecture-draft/stream`은 새 프로젝트의 첫 AI Draft 전용 newline-delimited JSON 경계다. Repository 권한을 필요로 하는 `repositoryAnalysis`와 `repositoryEvidence`는 이 경계에서 hijack 전 400으로 거부하고, 기존 JSON endpoint의 active-user·persisted Repository Analysis 해석 경로만 사용한다. `progress` event는 화면 단계나 질문 요약을 전달하지 않고, 후보 제외에 필요한 서버 발급 `provisionalArchitectureJson`과 `excludableCandidateIds`만 증가하는 `sequence`와 함께 전달한다. 해당 snapshot은 현재 요청의 이전 후보 snapshot을 완전히 대체하며, 최종 `CreateArchitectureDraftResponse`는 별도 terminal event로 전달한다. 클라이언트는 대화 원문이나 장식용 AWS icon에서 Resource 후보를 추측하지 않는다.

`candidateExclusions`는 최대 32개이며 `candidateId`, `label`, 지원 `ResourceType`을 포함한다. 서버는 결정론적 후보 graph가 발급한 id·type·trimmed label tuple이 정확히 일치하고, 명시적 safe adjunct allowlist에 속하며, 그 type을 제거해도 남은 edge·nested config·Terraform reference가 유효한 후보만 `excludableCandidateIds`로 발급한다. forged·stale·구조적 후보 제외은 무시한다. 승인된 제외은 Amazon Q prompt·payload·repair validation의 binding constraint로 전달하고, 계획에 명시된 계약대로 해당 `resourceType`의 node와 incident edge를 잠정 graph와 최종 graph에서 제거한다. 제외 결과가 빈 graph, 중복 id, dangling edge/reference를 만들면 안전한 미적용 graph를 유지하고 metadata에 근거를 남긴다. 후보 snapshot 생성, 후보 제외, progress callback은 관찰 경로이므로 실패하더라도 최종 Architecture Draft 생성을 중단하지 않는다. 스트림이 시작된 뒤 발생한 오류는 `error` event의 표준 `ApiErrorResponse`와 `statusCode`로 전달한다. 기존 `POST /api/ai/architecture-draft` JSON 계약과 Repository Analysis 권한 경로는 유지한다.

`ArchitectureIntent`는 자유 형식 Requirement Prompt를 표준 설계 의도로 해석한 중간 결과다. 자동 생성 흐름은 `prompt -> interpretRequirement(prompt) -> ArchitectureIntent -> planPracticeArchitecture(intent/resolution) -> ArchitectureJson` 순서로 다룬다. LLM이나 rule fallback은 intent 추출과 설명 보조에 사용할 수 있지만, 실제 보드 리소스 조립은 지원 가능한 `ResourceType`만 사용하는 deterministic planner가 담당한다.

`servicePurpose`와 `capabilities`는 같은 `backend_with_db` 조합 안에서도 로그인 서비스, 예약 신청 관리, 게시판처럼 서로 다른 업무 목적을 구분하는 AI 결과 metadata다. 이 값은 사용자 프롬프트 형식을 강제하기 위한 필드가 아니라 Workspace AI가 자유 문장에서 목적 단서를 해석한 결과이며, 자동 생성 node의 label/config가 목적별로 달라지는 기준이 된다.

`selectedDraftPattern`은 UI와 LLM 설명을 위한 대표 패턴 라벨이다. 생성 기준은 패턴 점수가 아니라 `requirementFacts` 조합이며, 같은 fact 조합은 같은 리소스 조립 순서와 같은 node/edge id를 사용한다.

`ArchitectureDraft`가 자동 생성하는 node type은 `ResourceType` 중 `UNKNOWN`을 제외한 지원 목록으로 제한한다. 현재 지원 목록은 `VPC`, `SUBNET`, `INTERNET_GATEWAY`, `ROUTE_TABLE`, `ROUTE_TABLE_ASSOCIATION`, `EC2`, `RDS`, `S3`, `SECURITY_GROUP`, `CLOUDFRONT`, `LAMBDA`, `AMI`, `IAM_ROLE`, `IAM_POLICY`, `IAM_INSTANCE_PROFILE`, `KMS_KEY`, `CLOUDWATCH_LOG_GROUP`, `CLOUDWATCH_METRIC_ALARM`, `API_GATEWAY_REST_API`, `LAMBDA_PERMISSION`이다.

Requirement Prompt에서 지원 가능한 아키텍처 단서나 대체 가능한 요구사항을 찾지 못하면 `ArchitectureDraft`를 생성하지 않고 `400 bad_request`로 되돌린다. 보조 선택값은 `CreateArchitectureDraftRequest` 계약에서 제거되었으며, 명확한 자연어 단서 없이 기본 초안을 강제로 만들지 않는다.

`웹사이트 하나 배포하고 싶어`처럼 대상은 아키텍처와 관련 있지만 화면만 필요한지, 방문자 입력/파일 업로드가 필요한지, 로그인/데이터 저장이 필요한지 알 수 없는 요구사항은 곧바로 `static_site`로 단정하지 않는다. Workspace AI는 전문 용어 대신 쉬운 질문과 추천 답안을 차례로 보여주고, 답변을 모아 구현 리스트를 확인받은 뒤 사용자가 진행을 승인할 때만 자연어 `prompt`를 다시 구성해 `ArchitectureDraft`를 요청한다. 질문에서는 `S3`, `EC2`, `RDS`, `IAM` 같은 내부 리소스 이름을 먼저 묻지 않고, 비용 영향과 보호 범위를 사용자 언어로 설명한다.

예산, 방문자 규모, 보호 수준은 별도 보조 선택값이 아니라 자연어 단서에서 `operatingProfile`로 계산된다. `operatingProfile`은 호환용 `budgetLevel`, `trafficLevel`, `securityPriority`와 함께 세분화된 `budgetProfile`, `trafficProfile`, `databaseProfile`, `managementProfile`, `availabilityProfile`, `uploadProfile`, `realtimeProfile`을 보관한다. 이 값은 EC2/RDS 크기와 저장 용량, CloudFront price class, Auto Scaling 용량, RDS Multi-AZ·백업·자동 업데이트, S3 업로드 용도, Lambda 메모리·timeout, 로그 보존 기간, public access block, deletion protection 같은 실제 config 차이로 반영된다. Provider가 동일한 기본값을 반복해서 반환하더라도 서버가 최종 Preview에 이 정책을 다시 적용한다.

`metadata.guardrailWarnings`는 AI 초안 카드 하단에 표시할 경고 계약이다.

```ts
type ArchitectureGuardrailWarningCode =
  | "unsupported_resource_omitted"
  | "unsupported_requirement_substituted"
  | "partial_generation"
  | "guardrail_adjusted_config"
  | "board_replacement_required"
  | "low_budget_rds_cost";
```

`LlmExplanation`은 rule 기반 결과를 덮어쓰지 않고, 사용자가 읽기 쉬운 요약과 다음 행동을 붙이는 공통 설명 계약이다. Bedrock, Amazon Q Business, OpenAI legacy/fallback provider 호출이 실패하거나 일부 필드가 rule 기반 기본값으로 대체되면 `fallbackUsed`를 `true`로 둔다.

```ts
type LlmExplanation = {
  target:
    | "architecture_draft"
    | "design_simulation"
    | "pre_deployment_check"
    | "terraform_error_explanation"
    | "terraform_preview_explanation"
    | "architecture_patch_preview";
  summary: string;
  highlights: string[];
  nextActions: string[];
  fallbackUsed: boolean;
  fallbackReason?:
    | "missing_api_key"
    | "timeout"
    | "rate_limited"
    | "invalid_request"
    | "auth_error"
    | "provider_error"
    | "invalid_response"
    | "provider_not_configured"
    | "credit_not_confirmed"
    | "daily_limit_exceeded";
  providerMetadata?: AiProviderMetadata;
};
```

`AiArchitectureDraftResult`, `AiPreDeploymentAnalysisResult`, `DesignSimulationResult`, `AiTerraformErrorExplanationResult`는 필요할 때 `llmExplanation?: LlmExplanation`를 포함할 수 있다.

Pre-Deployment Check 요청은 현재 Practice Architecture와 선택적으로 현재 Terraform editor 파일 목록을 함께 보낸다. Terraform syntax/schema diagnostics에 `error`가 있으면 프론트는 이 요청을 보내지 않고 diagnostics-only 결과를 즉시 표시한다.

```ts
type AiPreDeploymentCheckRequest = {
  architectureJson: ArchitectureJson;
  terraformFiles?: TerraformSyncFileInput[];
};
```

Terraform 오류 설명은 Issues 탭에서 해결 전까지 유지되는 진단을 사용자가 이해하고 승인 기반으로 고치기 위한 설명 DTO다. 오류 해결 화면은 Well-Architected 리뷰를 다루지 않고 `진단 -> 코드 위치 -> 수정 방법 -> 적용 가능 여부`만 보여준다. 오류 위치와 수정 후보는 진단의 `sourceFileName`에 해당하는 단일 파일 문맥에서 deterministic rule로 계산하며, 동기 요청 경로에서 외부 AI provider를 기다리지 않는다. 실제 Terraform 코드 변경은 사용자가 `적용`을 누른 뒤에만 가능하다.

```ts
type AiTerraformSafeFix = {
  applicable: boolean;
  code: string;
  label: string;
  description: string;
};

type WellArchitectedPillar =
  | "operational_excellence"
  | "security"
  | "reliability"
  | "performance_efficiency"
  | "cost_optimization"
  | "sustainability";

type AiWellArchitectedGuidance = {
  pillar: WellArchitectedPillar;
  title: string;
  observation: string;
  recommendation: string;
};

type AiTerraformCodeFrameLine = {
  lineNumber: number;
  text: string;
  isErrorLine: boolean;
};

type AiTerraformCodeSuggestion = {
  currentCode: string;
  // 빈 문자열이면 currentCode 조각 삭제를 의미한다.
  suggestedCode: string;
  rationale: string;
  source: "rule" | "amazon_q";
};

type AiTerraformDiagnosticExplanation = {
  errorType: string;
  plainExplanation: string;
  fixExplanation: string;
  codeFrame: AiTerraformCodeFrameLine[];
  canApply: boolean;
  codeSuggestion?: AiTerraformCodeSuggestion;
  line?: number;
  sourceFileName?: string;
};

type AiTerraformErrorExplanationResult = {
  stage: AiTerraformStage;
  category: AiTerraformErrorCategory;
  severity: RiskLevel;
  rawMessage: string;
  summary: string;
  likelyCause: string;
  nextActions: string[];
  diagnosticExplanation?: AiTerraformDiagnosticExplanation;
  // Legacy compatibility field. Terraform code-error responses return [].
  wellArchitectedGuidance: AiWellArchitectedGuidance[];
  consensusRecommendation: string;
  safeFix?: AiTerraformSafeFix;
  relatedResourceId?: string;
  llmExplanation?: LlmExplanation;
};
```

Terraform Preview 설명은 Terraform 코드를 실제 실행하지 않고, 감지한 resource block과 deterministic finding을 근거로 현재 다이어그램/IaC Preview를 평가하는 설명 DTO다. 에이전트 리뷰 성공 응답은 Amazon Q Business를 반드시 호출해 정상 결과를 받은 경우에만 반환하며, provider fallback을 정상 리뷰처럼 표시하지 않는다. AI 채팅의 에이전트 리뷰 탭 하단 버튼은 최신 Terraform 전체 파일 snapshot을 요청하며, 화면은 응답을 기다리는 동안 `Terraform 코드 구조 분석 -> 리소스 및 위험 점검 -> Amazon Q Well-Architected 검토 -> 검토 결과 정리` 단계를 보여준다. Amazon Q에는 3문장, 200~380자의 결론과 정해진 순서의 Well-Architected 6개 기준을 요청하되, 충분한 근거를 가진 더 긴 결론을 문장 수만으로 실패시키지 않는다. 완료된 응답은 줄바꿈과 `잘한 점`/`문제점` 표제를 제거해 정규화하며, 화면의 검토 요약은 가장 명확한 강점과 우선순위가 높은 문제를 기준별 결과에서 뽑아 표시한다. 각 기준은 위험도에 따라 `문제 / 필요한 조치` 또는 `잘된 점 / 확인된 설정`으로 보여주며, Terraform 속성은 의미를 풀어 쓴 한국어 문장으로 우선 표시한다. 근거가 없는 설정은 없다고 단정하지 않고 확인할 수 없다고 표현한다. `detectedResources`는 legacy/LLM 근거 호환을 위해 유지하지만 사용자 화면의 주요 정보가 아니다.

```ts
type AiTerraformPreviewExplanationResult = {
  summary: string;
  detectedResources: AiTerraformDetectedResource[];
  findings: CheckFinding[];
  checklist: ChecklistItem[];
  wellArchitectedGuidance: AiWellArchitectedGuidance[];
  consensusRecommendation: string;
  llmExplanation?: LlmExplanation;
};
```

v1에서 rule-first 자동 적용 후보가 될 수 있는 진단은 `terraform.trailing_comma`, `terraform.quoted_reference`, 그리고 닫는 중괄호 뒤에 불필요한 토큰이 붙은 `terraform.unexpected_token`이다. 마지막 경우에는 닫는 중괄호를 보존하고 뒤의 토큰만 제거할 수 있을 때만 적용 후보로 만든다. 독립된 알 수 없는 코드 줄처럼 의도를 단정할 수 없는 `terraform.unexpected_token`은 자동 삭제하지 않고 `safeFix.applicable: false` 또는 `diagnosticExplanation.canApply: false`로 내려간다. Amazon Q가 `codeSuggestion`을 반환하더라도 현재 진단 파일의 코드와 정확히 매칭되는 경우에만 적용 버튼을 활성화하며, provider 응답이 제안을 생략했을 때 삭제 제안을 임의로 합성하지 않는다.

자연어 Architecture 수정 요청은 `ArchitecturePatchPreview`로만 반환한다. 이 preview는 `proposedArchitectureJson`과 diff 성격의 `changes`를 보여줄 뿐이며, `requiresUserAcceptance: true`와 `userAcceptedChange: null` 상태로 내려간다. 실제 Architecture Board 반영은 별도 적용 버튼에서 `UserAcceptedChange`를 기록한 뒤에만 가능하다.

채팅 라우팅은 리소스명과 자연스러운 명령형(`붙여`, `달아`, `연결`, `넣어`, `지워`)이 함께 있으면 기존 보드의 patch 요청으로 우선 해석한다. 반대로 `서비스 하나`, `구조 짜줘`, `웹앱 해보자`처럼 새 서비스 의도가 드러나면 기존 보드가 있어도 새 draft 요청으로 해석한다. 리소스명만 있는 입력은 여전히 clarification 대상이다. NAT Gateway 추가 patch는 빈 노드가 아니라 public subnet과 Elastic IP를 찾아 `subnetId`, `allocationId`, 연결 edge가 포함된 deployable bundle을 제안한다.

외부 트래픽 표시는 `User / Client -> Internet -> public entry` 순서를 사용한다. ALB, ECS Service, RDS처럼 여러 subnet을 참조하는 단일 Terraform 리소스는 subnet마다 별도 리소스를 복제하지 않고 `ALB node A/B`, `Fargate task placement A/B`, `RDS primary/standby (Multi-AZ)` 배치 마커로 Availability Zone 위치를 표시한다. 배치 마커는 Terraform 리소스가 아니다.

Architecture Intent Plan의 `region`에는 실제 AWS region code만 허용한다. `global`, `multi-region-global` 같은 설명용 값은 Terraform의 Availability Zone 또는 runtime 설정으로 전달하지 않는다. 현재 Terraform Preview와 Direct Deployment는 단일 AWS provider region만 지원하므로 multi-region API/RDS 요청은 단일 region 지원 범위 또는 별도 multi-region 설계 작업을 먼저 확인해야 한다.

```ts
type ArchitecturePatchIntent = {
  instruction: string;
  requestedAction: "add_resource" | "remove_resource" | "modify_resource" | "manual_review";
  targetResourceId?: string;
  resourceType?: ResourceType;
  connectionTargetResourceId?: string;
  skipConnection?: boolean;
};

type ArchitecturePatchPlan = {
  status: "planned" | "needs_clarification" | "unsupported";
  action: "modify_resource" | "remove_resource" | "add_resource" | null;
  target: {
    resourceType: ResourceType | null;
    resourceId: string | null;
    label: string | null;
  };
  candidateResourceIds: string[];
  operations: {
    op: "set_value" | "increase_one_step" | "decrease_one_step" | "enable" | "disable" | "rename";
    path: string;
    value: string | number | boolean | null;
  }[];
  preserve: string[];
  clarificationQuestion: string | null;
  confidence: number;
};

type ArchitecturePatchClarification = {
  status: "needs_clarification";
  intent: ArchitecturePatchIntent;
  question: string;
  candidates: {
    resourceId: string;
    resourceType: ResourceType;
    label: string;
  }[];
  suggestions?: string[];
  patchPlan?: ArchitecturePatchPlan;
  providerMetadata: AiProviderMetadata;
};

type ArchitecturePatchPreview = {
  status: "preview";
  intent: ArchitecturePatchIntent;
  baseArchitectureJson: ArchitectureJson;
  proposedArchitectureJson: ArchitectureJson;
  changes: ArchitecturePatchPreviewChange[];
  requiresUserAcceptance: true;
  userAcceptedChange: UserAcceptedChange | null;
  llmExplanation?: LlmExplanation;
  patchPlan?: ArchitecturePatchPlan;
  providerMetadata: AiProviderMetadata;
};

type ArchitecturePatchPreviewResponse = ArchitecturePatchPreview | ArchitecturePatchClarification;
```

Cost Estimate는 실제 청구 데이터를 읽지 않고, `ArchitectureJson`과 사용자가 입력한 추정 조건을 기준으로 계산한다. AWS Pricing API 연동은 `apps/api`의 서버 서비스 안에만 두며, UI 컴포넌트나 `apps/web`은 AWS SDK를 직접 호출하지 않는다. 조회 단가를 쓰지 못한 리소스는 `pricingSource: "fallback"`으로 표시하고, 계산 자체는 계속 성공해야 한다.

비용 산정은 `ResourceType`보다 `terraformResourceType`을 우선한다. 같은 보드 노드가 `ResourceType.RDS`처럼 넓은 분류를 갖더라도 `terraformResourceType: "aws_db_snapshot"`이면 실행 중인 DB instance가 아니라 snapshot storage 비용으로 계산해야 한다. billable 리소스는 먼저 AWS Pricing API 단가 조회를 시도하고, 조회 단가를 쓰지 못하면 추정 단가를 사용한다. `supportLevel`은 화면에서 산정 상태를 설명하기 위한 필드다.

- `aws_pricing_api`: 해당 리소스의 단가가 AWS Pricing API에서 조회되어 계산됨.
- `fallback_estimate`: 조회 단가 대신 추정 단가로 계산됨.
- `no_direct_cost`: 리소스 자체의 직접 비용은 없고 연결된 하위 리소스가 비용을 만든다고 판단됨. 예: `aws_autoscaling_group`, public `aws_acm_certificate`, `aws_sns_topic_subscription`.
- `not_estimated`: 현재 산정 로직이 직접 계산하지 못하는 리소스. 새 Terraform resource를 추가할 때 이 상태가 사용자에게 보이면 `apps/api/src/services/cost-analysis.ts`와 `awsPricingRateProvider.ts`를 함께 확장해야 한다.

현재 산정 대상은 AWS MVP resource catalog의 주요 Terraform resource를 기준으로 한다. Networking은 NAT Gateway, VPC Endpoint, VPC Peering, EIP, Load Balancer를 계산한다. Compute는 EC2, Auto Scaling Group의 직접 비용 없음, EBS를 계산한다. Storage/Database는 S3, EFS, RDS instance/snapshot/cluster/cluster instance, DynamoDB, ElastiCache를 계산한다. Serverless/App, Messaging/Events, Edge/CDN, Observability, Containers, CI/CD, Governance/Config, WAF/Protection 계열은 AWS Pricing API 조회를 우선하고 조회 단가를 쓰지 못하면 추정 단가를 둔다.

```ts
type CostEstimatePeriod = "day" | "week" | "month";

type CostPricingSource = "aws_pricing_api" | "fallback";

type CostEstimateSupportLevel =
  | "aws_pricing_api"
  | "fallback_estimate"
  | "no_direct_cost"
  | "not_estimated";

type CostEstimateRequest = {
  architectureJson: ArchitectureJson;
  period: CostEstimatePeriod;
  expectedUserCount: number;
  region: AwsRegionCode | string;
};

type ResourceCostEstimate = {
  resourceId: string;
  resourceType: ResourceType;
  terraformResourceType?: string;
  name: string;
  monthlyEstimate: MoneyEstimate;
  periodEstimate: MoneyEstimate;
  supportLevel: CostEstimateSupportLevel;
  supportReason: string;
  costDrivers: string[];
  explanation: string;
  pricingSource?: CostPricingSource;
  usageAssumptions?: { label: string; value: string }[];
  recommendation?: string;
};

type CostEstimateResult = {
  totalEstimate: MoneyEstimate;
  totalMonthlyEstimate: MoneyEstimate;
  period: CostEstimatePeriod;
  expectedUserCount: number;
  region: AwsRegionCode | string;
  pricingSource: CostPricingSource;
  fallbackUsed: boolean;
  assumptions: string[];
  resources: ResourceCostEstimate[];
  reviewMessages: string[];
  pricingAssumption: string;
};
```

`totalMonthlyEstimate`와 `ResourceCostEstimate.monthlyEstimate`는 항상 월 환산 기준이다. `totalEstimate`와 `ResourceCostEstimate.periodEstimate`는 요청한 `period` 기준 금액이며, `day = month / 30`, `week = month / 4.345`, `month = month`로 계산한다.

`expectedUserCount`는 실제 사용량 집계값이 아니라 예상 사용자 수 가정치다. 비용 산정기는 기본 1,000명을 기준으로 `expectedUserCount / 1000` 용량 배율을 만들고, EC2/RDS/EBS/RDS snapshot/ElastiCache/ECS/NAT Gateway/VPC Endpoint/ALB처럼 용량을 늘려 잡을 수 있는 리소스에 이 배율을 반영한다. S3/EFS/DynamoDB/Lambda/API Gateway/SQS/SNS/EventBridge/CloudFront/CloudWatch Logs/CloudTrail/X-Ray/Config/WAF/GuardDuty처럼 요청량, 저장량, 전송량 기반 리소스는 예상 사용자 수에서 파생한 요청 수, GB, 이벤트 수로 계산한다.

`DesignSimulationResult.costEstimate`는 같은 비용 산정 결과를 담는다. 기존 `costPressure: string[]`는 유지하되, 이제 `costEstimate.reviewMessages`와 같은 금액 기반 문장을 포함해야 한다. 예를 들어 월 기준 결과는 `현재 상황에서의 총 예상 비용은 $47.30 / month입니다.`처럼 사용자가 바로 읽을 수 있는 문장으로 내려간다.

홈 화면의 비용관리 페이지는 `GET /api/costs/projects?period=month&expectedUserCount=1000` 응답을 사용한다. 이 응답은 현재 사용자의 모든 프로젝트를 내려주고, 프로젝트별 최신 `architectures.architectureJson`이 있으면 `CostEstimateResult`를 계산한다. 아직 아키텍처 스냅샷이 없는 프로젝트는 `costEstimate: null`로 내려주며, 전체 합계는 비용 산정이 가능한 프로젝트만 더한다.

```ts
type CostProjectEstimate = {
  project: Project;
  costEstimate: CostEstimateResult | null;
  deploymentState: "deployed" | "not_deployed";
};

type CostProjectEstimateListResponse = {
  period: CostEstimatePeriod;
  expectedUserCount: number;
  region: AwsRegionCode | string;
  totalEstimate: MoneyEstimate;
  totalMonthlyEstimate: MoneyEstimate;
  projects: CostProjectEstimate[];
};
```

`deploymentState`는 Direct Deployment의 최신 `SUCCESS`/`DESTROYED` lifecycle 상태와 Git/CI/CD handoff의 `pipeline_success`/destroy pipeline 상태를 함께 확인한다. 활성 Direct Deployment가 있거나 destroy되지 않은 성공 Git/CI/CD handoff가 있으면 `deployed`, 그렇지 않으면 `not_deployed`다. 비용관리 화면의 `예상 비용` 탭은 `not_deployed` 프로젝트만 보여주고, `실제 사용량` 탭은 `deployed` 프로젝트만 사용한다.

비용관리 페이지의 실제 사용량 분석 탭은 `GET /api/costs/usage?range=30d&awsConnectionId=...` 응답을 사용한다. 화면은 `GET /api/aws/connections`에서 `verified` AWS 연결만 선택지로 보여주고, 사용자가 선택한 연결의 `awsConnectionId`를 사용량 분석 요청에 전달한다. `awsConnectionId`가 있으면 해당 사용자의 `verified` AWS 연결만 사용하고, 없으면 최신 `verified` 연결을 사용한다. 연결이 없거나 Cost Explorer/CloudWatch 조회가 실패하면 API는 오류를 화면에 노출하지 않고 deterministic sample 응답으로 같은 DTO를 반환한다. 실제 사용량의 프로젝트 배분 대상은 현재 `SUCCESS` Deployment가 있는 프로젝트로 제한해 미배포 프로젝트에 실제 청구액이 표시되지 않게 한다.

사용량 분석 탭에서 새 AWS 연결을 시작할 때도 브라우저는 장기 AWS credential을 받지 않는다. 화면은 기존 AWS 연결 API를 호출해 CloudFormation Quick Create URL과 External ID를 받고, 사용자가 AWS 콘솔에서 Stack을 만든 뒤 Account ID를 입력하면 `POST /api/aws/connections/:connectionId/verify-created-role`로 backend 검증을 요청한다. 검증된 연결만 Cost Explorer/CloudWatch 실제 조회 대상으로 사용할 수 있다.

실제 비용 데이터 출처는 AWS Cost Explorer와 CloudWatch다. Cost Explorer는 `UnblendedCost` 기준으로 일별 비용, 서비스별 비용, `SketchCatchProjectId` tag 기반 프로젝트별 비용을 조회한다. 사용량 분석의 프로젝트 목록은 사용자가 실제로 생성한 프로젝트 레코드를 기준으로 한다. 프로젝트 tag 비용이 있으면 이 값을 우선한다. tag 비용이 없거나 프로젝트와 tag가 맞지 않으면 최신 성공 `deployments`와 `deployed_resources`를 기준으로 프로젝트별 비용을 근사 배분한다. 샘플 fallback도 프로젝트 행을 임의 생성하지 않고 실제 프로젝트 이름을 사용한다. 리소스별 비용은 현재 v1에서 배포 리소스 기준 균등 배분이며, 실제 리소스 단위 Cost Explorer 청구 원장 대체물이 아니다. `/api/costs/usage`는 선택적으로 `projectId` query를 받아 전체 계정 비용 배분을 먼저 계산한 뒤 응답을 해당 프로젝트의 비용, 서비스, 리소스, 그래프로 좁힌다.

월별 비교는 현재 월을 포함한 최근 6개월의 `UnblendedCost`를 반환한다. 현재 월은 `isPartial=true`로 표시하고, 현재까지의 일평균을 해당 월의 전체 일수로 환산해 월말 예상 비용과 전월 대비 금액·비율을 계산한다. `SketchCatchProjectId` tag가 있는 프로젝트는 월별 tag 실측을 우선 사용한다. 각 월의 계정 비용에서 tag 실측 합계를 먼저 차감한 뒤, 남은 금액을 tag가 없거나 해당 월 tag가 누락된 프로젝트의 선택 기간 비용 비율로 배분하고 `isEstimated=true`로 표시한다.

CloudWatch 기반 낭비 탐지는 v1에서 EC2, RDS, ALB, NAT Gateway를 우선 지원한다. 기준은 EC2/RDS 평균 CPU 5% 미만, RDS 평균 connection 1 미만, ALB 요청량 매우 낮음, NAT Gateway 처리량 낮음이다. 이 결과는 비용 절감 추천으로 표시되지만, 리소스를 자동 중지하거나 삭제하지 않는다.

```ts
type CostUsageAnalysisRange = "7d" | "30d" | "month_to_date";

type CostUsageDataSource = "aws_cost_explorer" | "sample";

type CostProjectUsageSource = "cost_explorer_tag" | "deployed_resource_estimate" | "sample";

type CostUsageTrendPoint = {
  date: string;
  amount: number;
};

type CostUsageMonthlyPoint = {
  month: string;
  amount: number;
  isPartial: boolean;
  isEstimated: boolean;
};

type CostUsageMonthlyComparison = {
  previousMonthActual: MoneyEstimate;
  currentMonthToDate: MoneyEstimate;
  currentMonthForecast: MoneyEstimate;
  forecastChangeAmount: MoneyEstimate;
  forecastChangePercentage: number | null;
};

type CostServiceUsage = {
  service: string;
  amount: number;
  percentage: number;
};

type CostProjectUsage = {
  projectId: string | null;
  projectName: string;
  amount: number;
  percentage: number;
  source: CostProjectUsageSource;
  resourceCount: number;
  monthlyTrend: CostUsageMonthlyPoint[];
};

type CostResourceUsageSource = "cost_explorer_resource" | "deployed_resource_estimate" | "sample";

type CostResourceUsage = {
  id: string;
  projectId?: string;
  projectName?: string;
  resourceId: string | null;
  resourceName: string;
  resourceType: string;
  service: string;
  terraformAddress: string;
  amount: number;
  percentage: number;
  source: CostResourceUsageSource;
};

type CostWasteResourceInsight = {
  id: string;
  resourceId: string | null;
  resourceName: string;
  resourceType: string;
  service: string;
  projectId?: string;
  projectName?: string;
  metricName: string;
  averageValue: number;
  unit: string;
  finding: string;
  estimatedMonthlyWaste: MoneyEstimate;
};

type CostOptimizationRecommendation = {
  id: string;
  targetType: "resource" | "project" | "service";
  severity: RiskLevel;
  title: string;
  estimatedMonthlySavings: MoneyEstimate;
  reason: string;
  actionLabel: string;
  resourceId?: string;
  projectId?: string;
  service?: string;
};

type CostMetricSeries = {
  id: string;
  label: string;
  unit: string;
  points: {
    timestamp: IsoDateTimeString;
    value: number;
  }[];
};

type CostUsageAnalysisResponse = {
  range: CostUsageAnalysisRange;
  generatedAt: IsoDateTimeString;
  startDate: string;
  endDate: string;
  currency: "USD";
  dataSource: CostUsageDataSource;
  fallbackUsed: boolean;
  totalCost: MoneyEstimate;
  forecastMonthEndCost: MoneyEstimate;
  dailyTrend: CostUsageTrendPoint[];
  monthlyTrend: CostUsageMonthlyPoint[];
  monthlyComparison: CostUsageMonthlyComparison;
  serviceCosts: CostServiceUsage[];
  projectCosts: CostProjectUsage[];
  resourceCosts: CostResourceUsage[];
  wasteResources: CostWasteResourceInsight[];
  recommendations: CostOptimizationRecommendation[];
  metricSeries: CostMetricSeries[];
};
```

Voice Requirement Input은 Amazon Transcribe 작업 결과가 나온 뒤에도 곧바로 `RequirementPrompt`가 되지 않는다. 전사 결과는 `TranscribeConfirmation`으로 내려가고, 사용자가 확인/수정/확정한 뒤에만 `RequirementPrompt`가 생성된다.

```ts
type VoiceRequirementInput = {
  mediaUri: string;
  mediaFormat: "mp3" | "mp4" | "wav" | "flac" | "ogg" | "amr" | "webm";
  languageCode?: string;
};

type TranscribeConfirmation = {
  transcriptionJobName: string | null;
  voiceRequirementInput: VoiceRequirementInput | null;
  transcriptText: string | null;
  confirmedText: string | null;
  confirmedByUser: boolean;
  confirmedByUserId?: string;
  status: "transcribing" | "awaiting_user_confirmation" | "confirmed" | "failed";
  failureReason?: string;
  providerMetadata: AiProviderMetadata;
};
```

```ts
type AiSafetyExplanation = {
  riskSummary: string;
  whyDangerous: string;
  recommendedFix: string;
  terraformHint?: string;
  verificationSteps: string[];
  fallbackUsed: boolean;
  fallbackReason?:
    | "missing_api_key"
    | "timeout"
    | "rate_limited"
    | "invalid_request"
    | "auth_error"
    | "provider_error"
    | "invalid_response"
    | "provider_not_configured"
    | "credit_not_confirmed"
    | "daily_limit_exceeded";
  providerMetadata?: AiProviderMetadata;
};

type CheckFinding = {
  id: string;
  category:
    | "cost"
    | "security"
    | "configuration"
    | "permission"
    | "network"
    | "performance"
    | "availability";
  severity: "low" | "medium" | "high";
  resourceId?: string;
  sourceLocation?: TerraformSourceLocation;
  riskFamily?: string;
  trivyRuleIds?: string[];
  aiSafetyExplanation?: AiSafetyExplanation;
  title: string;
  description: string;
  recommendation: string;
};
```

`CheckFinding.resourceId`가 있으면 같은 `ArchitectureJson.nodes[].id` 또는 변환된 보드 node id를 가리켜야 한다.

`CheckFinding.sourceLocation`이 있으면 사용자가 finding 카드의 `수정` 버튼을 눌렀을 때 Terraform editor가 해당 파일/라인/리소스 블록으로 이동할 수 있다. 이 필드는 security/cost/configuration finding의 설명 근거로만 사용하며, AI나 UI가 이 값만으로 배포 차단 여부를 바꾸면 안 된다.

`CheckFinding.riskFamily`은 같은 Resource에서 발생한 scanner rule을 사용자 의미 단위로 그룹화하는 안정적인 키다. `trivyRuleIds`는 그룹에 포함된 원본 Trivy rule ID를 보존하며 UI는 이를 하위 근거로 표시한다. 그룹 severity는 포함 rule 중 가장 높은 값을 사용한다.

`CheckFinding.aiSafetyExplanation`은 finding별 사용자 설명 계층이다. Pre-Deployment Check 응답은 deterministic finding을 먼저 반환하며 AI 설명을 기다리지 않는다. 사용자가 finding 카드를 펼치면 `/ai/safety-finding-explanation`으로 한 건을 지연 조회한다. AI는 `riskSummary`, `whyDangerous`, `recommendedFix`, `terraformHint`, `verificationSteps`만 생성할 수 있고, `severity`, `blocked`, `blocksApproval`, `requiresAcknowledgement` 같은 Safety Gate 판정은 변경할 수 없다. OpenAI GPT 호출이 실패하거나 API key가 없으면 `fallbackUsed: true`인 rule fallback 설명을 사용한다.

Terraform 파일이 있는 `POST /api/ai/pre-deployment-check`는 Public S3, 공개 SSH, Public RDS, IAM wildcard를 in-process deterministic gate로 먼저 검사하고 `deepScan.status: "running"`과 `scanId`를 즉시 반환한다. Trivy는 백그라운드에서 실행하며 `GET /api/ai/pre-deployment-check/:scanId`가 `running | complete | failed` 상태와 완료된 병합 결과를 반환한다. UI는 핵심 안전검사 완료, Trivy 심층검사 진행 중, 결과 병합 완료를 구분한다. High finding과 심층검사 진행 상태는 Plan 생성이나 승인을 막지 않으며, finding은 승인 전 검토 정보로 계속 표시한다.

## 팀 작업 규칙

- 정현: Architecture Board는 `DiagramJson` 계약을 따른다.
- 시원: Terraform 변환은 `DiagramNode.parameters`를 입력으로 삼는다.
- 채강: Deployment는 `TerraformArtifact`, `Deployment`, `DeploymentLog` 계약을 따른다.
- 경근: AI 분석은 `ArchitectureJson`, `CheckFinding`, 비용 DTO를 따른다.
- 윤서: 플랫폼 화면은 `User`, `Project`, 인증 DTO, 프로젝트 DTO를 따른다.
- 팀장: DB schema, API 응답, shared type 충돌을 최종 조정한다.

새 계약이 필요하면 담당자 문서에만 쓰지 말고, 이 문서와 `packages/types/src/index.ts`에 먼저 반영한다.

## Source Repository 연결 모델

`source_repositories`는 SketchCatch 프로젝트가 실제 Git provider repository와 연결된 이력을 저장합니다. MVP에서는 같은 `project_id + provider=github` 조합에 대해 active 연결을 하나만 허용합니다.

주요 필드:

| 필드                     | 설명                                    |
| ------------------------ | --------------------------------------- |
| `id`                     | Source Repository 식별자                |
| `project_id`             | 연결된 SketchCatch project              |
| `created_by_user_id`     | 연결을 만든 사용자                      |
| `provider`               | `internal` 또는 `github`                |
| `status`                 | `active` 또는 `inactive`                |
| `github_installation_id` | GitHub App installation id              |
| `github_repository_id`   | GitHub repository id                    |
| `owner`                  | repository owner/login                  |
| `name`                   | repository name                         |
| `default_branch`         | repository default branch               |
| `repository_url`         | repository web URL                      |
| `visibility`             | `public`, `private`, `internal` 중 하나 |
| `archived`               | archived repository 여부                |
| `analysis_result`        | 마지막 구조화된 `AI Handoff` 요약       |
| `analysis_revision`      | 분석한 Git commit SHA                   |
| `analyzed_at`            | 마지막 분석 완료 시각                   |
| `disconnected_at`        | soft deactivate 시각                    |

GitHub App installation repository 목록은 DB에 저장하지 않습니다. Repository Analysis에서 시작한 project callback은 서명 state와 현재 `RepositoryAnalysisRecord`의 target owner/name에 정확히 일치하는 repository만 자동 연결합니다. 연결 성공 시 같은 transaction에서 analysis record의 `source_repository_id`를 attach합니다. 같은 project, installation, GitHub repository ID의 active row가 이미 있으면 그 row를 반환해 callback 새로고침으로 연결 이력이 중복되지 않습니다. 다른 repository로 바꾸는 별도 연결 흐름은 이번 범위에서 지원하지 않습니다.

### Repository Analysis Record

`repository_analysis_records`는 현재 Board가 어떤 Repository 분석으로 만들어졌는지 프로젝트당 한 건만 저장합니다. 새 Board가 저장되면 이전 record를 교체하고 exact owner/name의 active Source Repository가 있을 때만 `source_repository_id`를 함께 연결하며, 없으면 `null`로 둡니다. URL, owner/name, branch, `repository_revision`, 분석 결과, 선택 Template과 분석 시각을 저장하며 원본 파일, credential과 GitHub installation token은 저장하지 않습니다.

```ts
type RepositoryAnalysisRecord = {
  id: string;
  projectId: string;
  provider: "github";
  repositoryUrl: string;
  owner: string;
  name: string;
  branch: string;
  repositoryRevision: string;
  analysisResult: SourceRepositoryAnalysisResult;
  selectedTemplateId: RepositoryAnalysisTemplateId | null;
  sourceRepositoryId: string | null;
  analyzedAt: IsoDateTimeString;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
};
```

- `GET /api/projects/:projectId/repository-analysis-record`는 현재 Board 출처 또는 `null`을 반환합니다.
- `PUT /api/projects/:projectId/repository-analysis-record`는 저장된 project draft와 함께 호출되며 현재 record를 교체합니다.
- Source Repository 연결은 record의 exact owner/name과 다르면 `409`로 거부합니다.

Git/CI/CD handoff 생성 요청은 `sourceRepositoryId`만 받습니다. repository owner/name/provider/default branch는 DB의 active source repository에서 읽습니다. 이 원칙은 클라이언트가 임의 GitHub repository identity를 body로 보내는 위험을 막기 위한 서비스 계약입니다.

### GitHub 계정 연결과 프로젝트 repository 선택 경계

SketchCatch 로그인 계정과 GitHub App installation 연결은 별도 인증 경계입니다. 비밀번호, Naver, Kakao, GitHub 중 어떤 방식으로 로그인했는지와 무관하게 현재 SketchCatch `user_id`가 GitHub App 설치 흐름을 시작하고 callback을 완료하면 `github_installation_connections`에 installation 소유 관계를 저장합니다. GitHub OAuth 로그인 이력인 `oauth_accounts`는 GitHub App installation 소유권 판정에 사용하지 않습니다.

`github_installation_connections`는 사용자 계정 단위 외부 연결만 저장하며 프로젝트 repository 선택 결과는 저장하지 않습니다.

| 필드                     | 설명                                               |
| ------------------------ | -------------------------------------------------- |
| `id`                     | GitHub installation 연결 식별자                    |
| `user_id`                | 연결을 시작한 SketchCatch 사용자                   |
| `github_installation_id` | GitHub App installation id, 전체 사용자에서 unique |
| `account_id`             | GitHub user 또는 organization id                   |
| `account_login`          | GitHub account login                               |
| `account_type`           | GitHub account type                                |
| `repository_selection`   | `all`, `selected`, 또는 `null`                     |
| `html_url`               | GitHub installation 관리 URL                       |
| `status`                 | `active` 또는 `disconnected`                       |
| `connected_at`           | 최초 연결 시각                                     |
| `last_verified_at`       | GitHub App API로 마지막 확인한 시각                |
| `disconnected_at`        | installation 접근이 사라진 시각                    |

GitHub setup URL의 `installation_id`는 소유권 증거로 신뢰하지 않습니다. callback 뒤 GitHub App user authorization(PKCE)을 수행하고, 일시적인 user access token으로 `/user/installations`를 조회해 현재 GitHub 사용자가 해당 installation에 접근할 수 있을 때만 연결 row를 생성합니다. user access token, refresh token, code verifier는 RDS에 저장하지 않습니다.

GitHub App user authorization 시작 API DTO는 `CreateGitHubInstallationUserAuthorizationRequest`와 `GitHubInstallationUserAuthorizationUrlResponse`입니다. 요청은 서명된 setup `state`와 `installationId`를 받고, 응답은 `authorizationUrl`과 `expiresAt: IsoDateTimeString`을 반환합니다.

provider callback은 브라우저 redirect이므로 SketchCatch access token header에 의존하지 않고, 서명된 authorization state와 `HttpOnly` PKCE cookie에서 시작 사용자를 복원합니다. 이후 GitHub `/user/installations` 검증까지 통과해야 installation 연결을 저장합니다.

GitHub installation access token과 GitHub App private key는 이 테이블에 저장하지 않습니다. repository 목록과 repository 개수도 요청 시 GitHub API에서 조회하며 RDS에 저장하지 않습니다.

Dashboard 전역 설정은 계정 단위 GitHub App installation만 관리합니다. 연결이 없으면 `GitHub 연결하기`, 하나가 연결되어 있으면 `권한 추가`를 표시합니다. MVP의 AWS CodeBuild 대상은 활성 installation 하나만 사용하며, 과거 데이터에 여러 활성 row가 있으면 `GitHub 연결 정리 필요`를 표시하고 CodeBuild 승인을 막습니다. `권한 추가`는 기존 installation의 Repository 접근 범위를 관리하며 임의의 두 번째 활성 installation을 선택하지 않습니다.

공개 Repository Analysis와 Board 생성에는 GitHub 연결이 필요하지 않습니다. 공개 조회 실패 뒤 exact Repository 접근이 필요할 때만 전역 installation 연결 또는 권한 추가를 안내합니다. Web은 분석 UI 상태를 schema version 1, 30분 TTL의 일회성 `sessionStorage` record로 보존하고, API는 target repository와 resume key를 project scope JWT state에 서명합니다. callback은 exact target을 연결한 뒤 배포 타깃이나 GitOps 감시 설정을 자동 저장하지 않고 원래 분석으로 돌아갑니다. browser record에는 token, GitHub state, 원본 파일 내용 또는 credential을 넣지 않습니다.

```ts
type GitHubRepositorySelection = "all" | "selected";
type GitHubInstallationConnectionStatus = "active" | "disconnected";

type GitHubInstallationConnection = {
  installationId: string;
  accountLogin: string;
  accountType: string | null;
  repositorySelection: GitHubRepositorySelection | null;
  repositoryCount: number;
  htmlUrl: string | null;
};

type GitHubAppCapabilityAvailability = "ready" | "not_configured";

type ListGitHubInstallationsResponse = {
  availability: {
    installationRead: GitHubAppCapabilityAvailability;
    connectionSetup: GitHubAppCapabilityAvailability;
  };
  installations: GitHubInstallationConnection[];
};
```

- `GitHubInstallationConnection`은 installation ID, 계정 표시 정보, repository 권한 범위와 개수, GitHub 관리 URL만 반환합니다. installation access token과 GitHub App private key는 반환하거나 저장하지 않습니다.
- `installationRead`는 기존 installation을 조회할 수 있는지, `connectionSetup`은 새 GitHub user authorization을 시작할 수 있는지를 별도로 나타냅니다. user authorization 설정만 빠진 경우 기존 installation은 그대로 반환하며 새 연결 시작만 차단합니다.
- account scope callback은 서명된 state의 SketchCatch 사용자와 provider가 user access token으로 확인한 installation을 연결하지만 `SourceRepository`를 생성하거나 변경하지 않습니다.
- project scope callback은 provider가 확인한 installation 소유권과 서명된 target repository를 함께 검증한 뒤 프로젝트별 `SourceRepository`로 생성하거나 기존 동일 active 연결을 재사용합니다.
- account scope와 project scope의 서명 state는 구분되며 서로 바꿔 사용할 수 없습니다.
- 다른 SketchCatch 사용자에게 이미 연결된 installation은 현재 사용자가 사용할 수 없습니다.

### Repository Analysis와 AI Handoff

Repository Analysis는 active GitHub Source Repository의 최신 default branch를 요청 시점에 정적으로 읽는다. repository tree, `package.json`, lockfile, `Dockerfile`, framework config, `README`만 evidence로 사용하며 Repository 코드를 실행하지 않는다. 새로고침 뒤에도 사용자가 마지막 결과를 확인할 수 있도록 구조화된 `AI Handoff`, 분석 revision, 분석 시각만 `source_repositories`에 저장한다. 원본 파일 내용과 GitHub App installation repository 목록은 RDS/S3에 저장하지 않는다.

Public Repository URL 분석은 첫 요청에서 사용자가 branch를 직접 입력받지 않는다. GitHub repository metadata의 `default_branch`를 기본 선택으로 사용하고, 응답의 `availableBranches`에 조회 가능한 branch 이름을 함께 반환한다. `repositoryRevision`에는 선택 branch의 실제 `commit.sha`만 저장하며 branch 이름을 revision으로 대체하지 않는다. 이후 사용자가 branch dropdown에서 다른 branch를 선택해 재분석하면 해당 branch의 head SHA와 evidence를 다시 읽는다.

공개 URL 입력 오류, 공개 접근 불가, branch 없음, rate limit과 provider 오류는 서로 다른 안정적인 오류 코드로 반환합니다. 공개 접근 불가 응답만으로 private 여부를 단정하지 않습니다. GitHub 연결 상태와 exact Repository 후보를 별도로 조회해 `GitHub 연결하기`, `Repository 권한 추가`, exact Repository 연결 또는 재시도 중 하나를 선택합니다. 여러 installation이 있으면 하나를 임의 선택하지 않습니다.

### Project Delivery Profile

`ProjectDeliveryProfile`은 이미 저장된 Delivery 관련 record를 Workspace가 한 번에 읽기 위한 조회 전용 composition DTO입니다. 하위 mutation API의 소유권은 바꾸지 않으며 이 조회로 GitHub, PR, Pipeline, cloud Resource 또는 배포 타깃을 변경하지 않습니다.

```ts
type ProjectDeliveryProfile = {
  githubInstallations: Array<Omit<GitHubInstallationConnection, "repositoryCount">>;
  repositoryAnalysisTarget: RepositoryAnalysisRecord | null;
  sourceRepository: SourceRepository | null;
  monitoringConfig: GitCicdMonitoringConfig | null;
  deploymentTarget: ProjectDeploymentTarget | null;
  environmentName: string | null;
  readiness: GitCicdReadinessSnapshot;
};
```

`GET /api/projects/:projectId/delivery-profile`은 없는 하위 설정을 `null`로 반환하고 readiness action을 유지합니다. 현재 Board record가 있으면 그 record의 `sourceRepositoryId`와 일치하는 active Repository만 반환하며, 연결되지 않은 record에 과거 active Repository를 대신 표시하지 않습니다. GitHub repository 개수는 이 조회에서 `0`으로 만들지 않고 필드 자체를 제외하며, 개수가 필요한 전역 설정 조회만 GitHub API에서 계산합니다. GitHub secret과 AWS credential은 응답에 포함하지 않습니다. `GitCicdReadinessService.inspect`는 현재 증거를 읽기만 하며 `refresh`와 달리 누락된 배포 타깃을 자동 reconcile하거나 저장하지 않습니다.

```ts
type RepositoryEvidenceKind =
  | "repository_tree"
  | "package_json"
  | "lockfile"
  | "dockerfile"
  | "framework_config"
  | "readme";

type RepositoryApplicationUnit = {
  id: string;
  rootPath: string;
  kind: "frontend" | "backend" | "fullstack" | "unknown";
  frameworks: string[];
  evidencePaths: string[];
};

type RepositoryAnalysisEvidence = {
  kind: RepositoryEvidenceKind;
  path: string;
  applicationUnitId: string | null;
  signals: string[];
};

type RepositoryArchitectureFact = {
  kind:
    | "frontend_delivery"
    | "backend_runtime"
    | "container_registry"
    | "traffic_entry"
    | "observability"
    | "ci_cd"
    | "health_check"
    | "transport_security"
    | "runtime_scale"
    | "runtime_secret"
    | "excluded_capability"
    | "infrastructure_definition";
  value: string;
  sourcePath: string;
};

type RepositoryDeploymentType = "ec2_vm" | "container" | "serverless";

type RepositoryAnalysisQuestion = {
  id: string;
  prompt: string;
  answerType: "single_select" | "boolean" | "free_text";
  options?: { value: string; label: string }[];
  required: boolean;
  reason: string;
};

type RepositoryAnalysisAnswer = {
  questionId: string;
  value: string | boolean;
};

type RepositoryTemplateRecommendationCandidate = {
  templateId: TemplateId;
  displayTitle: string;
  confidence: number;
  reasons: string[];
  tradeoffs: string[];
};

type RepositoryTemplateRecommendationResult = {
  deploymentType: RepositoryDeploymentType;
  usesCiCd: boolean;
  candidates: RepositoryTemplateRecommendationCandidate[];
};

type RepositoryAnalysisAiHandoff =
  | {
      status: "template_selected";
      templateId: TemplateId;
      applicationUnits: RepositoryApplicationUnit[];
      evidence: RepositoryAnalysisEvidence[];
      architectureFacts?: RepositoryArchitectureFact[];
      missingEvidence: RepositoryEvidenceKind[];
      deploymentTypeDefault?: RepositoryDeploymentType | null;
      usesCiCdDefault?: boolean | null;
      questions?: RepositoryAnalysisQuestion[];
      recommendation?: RepositoryTemplateRecommendationResult;
      selectionReasons: string[];
    }
  | {
      status: "template_selection_failed";
      templateId: null;
      applicationUnits: RepositoryApplicationUnit[];
      evidence: RepositoryAnalysisEvidence[];
      architectureFacts?: RepositoryArchitectureFact[];
      missingEvidence: RepositoryEvidenceKind[];
      deploymentTypeDefault?: RepositoryDeploymentType | null;
      usesCiCdDefault?: boolean | null;
      questions?: RepositoryAnalysisQuestion[];
      recommendation?: RepositoryTemplateRecommendationResult;
      mismatchReasons: string[];
    };

type AnalyzeSourceRepositoryResponse = {
  sourceRepositoryId: string;
  repositoryRevision: string;
  analyzedAt: string;
  aiHandoff: RepositoryAnalysisAiHandoff;
};

type SourceRepositoryAnalysis = Omit<AnalyzeSourceRepositoryResponse, "sourceRepositoryId">;
```

`runtime_secret` fact는 저장소 문서에서 확인한 환경 변수 이름만 담으며 값은 담지 않습니다. 웹 포함 ECS의
`ConfirmedBuildConfig.ecsWeb.api.requiredRuntimeSecrets`도 검증된 대문자 환경 변수 이름 목록만 저장합니다.
CodeBuild preflight는 실제 배포 Secret을 조회하지 않고 격리된 검사 전용 placeholder를 컨테이너에 주입합니다.
Repository Fixed Template은 같은 `runtime_secret` fact를 입력받아 `random_password`, Secrets Manager Secret과
Secret Version, 최소 읽기 IAM policy, ECS Task Definition의 `secrets.valueFrom`을 Project Draft에 함께 생성합니다.
`full_stack` 배포 준비는 확정된 `requiredRuntimeSecrets`와 실제 Terraform 연결을 비교하며, 하나라도 빠지거나 서로
다른 Secret을 참조하면 Plan 생성 전에 요청을 거절합니다. 승인된 Terraform Apply는
`CHECK_IN_SIGNING_SECRET`을 새로 생성하여 Secrets Manager에 저장하고 모든 Task에 동일하게 주입합니다. 생성 값은
분석 결과, API 응답, build log에 포함하지 않으며 Terraform state는 승인된 암호화 backend 경계에서만 관리합니다.
Task Definition은 고정 `INSTANCE_ID`를 만들지 않으므로 애플리케이션이 hostname fallback으로 Task별 `servedBy`를
구분할 수 있습니다.

`GET /api/projects/:projectId/source-repositories`는 각 Source Repository의 마지막 `analysis`를 함께 반환한다. 세 분석 컬럼 중 하나라도 없는 기존 row는 `analysis: null`로 취급한다. 사용자가 다시 분석하면 최신 revision 기준 결과로 세 값을 한 번에 덮어쓴다.

monorepo는 하나의 Repository Analysis 안에 여러 Application Unit을 둔다. Template Selection은 저장소 전체에 대해 한 번만 수행한다. 성공 응답은 선택한 Template 하나와 근거를 포함하고, 지원 패턴과 맞지 않으면 `templateId: null`과 mismatch 이유를 반환한다. 후보 목록과 confidence 점수는 계약에 포함하지 않는다.

성공한 `templateId`만 `CreateArchitectureDraftRequest.templateId`로 AI 파트에 전달한다. AI 파트는 이 값을 기본 결정으로 유지하고 다른 Template으로 교체하지 않으며, 사용자 요구 중 선택 Template에 부족한 내용만 보완한다. Repository evidence 원문이나 분석 원본 파일은 AI 요청에 다시 싣지 않는다.

공개 Repository에서 보드를 생성할 때는 선택 Template, 구조화된 Repository Analysis 요약, 사용자가 확정한 추가 질문 답변을 하나의 `CreateArchitectureDraftRequest`로 Amazon Q에 전달한다. 최종 `ArchitectureJson`은 선택 Template의 core resource/relationship을 먼저 고정하고 Amazon Q가 제안한 호환 supporting resource와 edge만 병합한다. 답변이 Template의 compute model과 충돌하면 Template을 유지하고 해당 답변은 assumption으로 남긴다. `metadata.source`가 `amazon_q`가 아닌 fallback 결과는 공개 Repository 보드로 저장하지 않는다.

고정 Template을 `ArchitectureJson`에 병합할 때 `TemplateDefinition.resources[].values`는 `config` 최상위 Terraform parameter로 펼치고 `@ref:<resource>.<attribute>`와 `@address:<resource>`는 병합된 resource의 실제 Terraform address로 변환한다. Board 변환 단계는 resource identity, Terraform type, parameter value, edge identity를 유지하면서 root resource와 Area 내부 resource의 표시 좌표만 topology lane으로 재배치한다.

### Git/CI/CD 자동 배포 handoff 확장

`GitCicdHandoff`는 하나의 record로 유지하되, merge 후 자동 배포를 위해 infra/app/destroy workflow 상태를 분리해 저장합니다. 기존 단일 `pipelineRunUrl`은 summary 링크로 유지하고, 새 UI와 polling은 아래 상세 필드를 함께 사용합니다.

주요 필드:

| 필드                                             | 설명                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `sourceDeploymentId`                             | Direct Deployment record에서 Git/CI/CD handoff를 만든 경우의 원본 deployment id        |
| `deploymentMode`                                 | `terraform_iac`, `static_site`, `infra_and_app` 중 하나                                |
| `requiresEnvironmentApproval`                    | GitHub Environment approval gate 필요 여부                                             |
| `pullRequestNumber`                              | merge 상태 polling 기준 PR 번호                                                        |
| `mergeCommitSha`                                 | merge 후 target branch workflow run 조회 기준 commit SHA                               |
| `environmentName`                                | 기본 `sketchcatch-production`                                                          |
| `infraPipelineRunUrl`, `infraPipelineStatus`     | Terraform plan/apply workflow 상태                                                     |
| `appPipelineRunUrl`, `appPipelineStatus`         | S3 release와 ASG Instance Refresh workflow 상태                                        |
| `destroyPipelineRunUrl`, `destroyPipelineStatus` | cleanup destroy workflow 상태                                                          |
| `repositorySettingsPreview`                      | 생성/갱신해야 하는 GitHub environment, variables, workflow files preview               |
| `awsRoleDiff`                                    | GitHub Actions OIDC trust 조건 diff preview와 승인 metadata                            |

`GitCicdPipelineDetailStatus`는 `not_started`, `waiting_for_merge`, `waiting_for_approval`, `running`, `success`, `failed`, `cancelled` 중 하나입니다. Summary `status`는 infra 또는 app 실패 시 `pipeline_failed`, 둘 다 성공 시 `pipeline_success`, approval 대기/실행 중이면 `pipeline_running`으로 집계합니다.

## Repository Analysis 기반 Template 추천

Repository Analysis는 저장소 evidence로 배포 방식을 추론한다. Container, Serverless, EC2/VM처럼 배포 방식이 명확한 evidence가 있으면 Template 후보 선택과 중복되는 배포 방식 입력을 숨기고, 사용자가 최종 선택한 Template에서 유효 배포 방식을 계산한다. 공개 URL 분석도 전체 repository tree와 선택된 evidence 파일을 백엔드 Repository Analysis에 전달하고, 응답의 `aiHandoff.recommendation.candidates`를 표시한다. 프론트엔드는 후보 수를 맞추기 위한 Template을 합성하지 않으며, 구형 응답에만 signal 기반 fallback을 사용한다. 배포 evidence가 없거나 모호할 때만 같은 화면에서 `ec2_vm`, `container`, `serverless` 중 하나를 선택하게 하며, UI 표기는 `EC2/VM 기반`, `컨테이너 기반`, `서버리스 기반`으로 한다. 공개 Board 생성의 `usesCiCd`는 `false`이며 Source Repository 연결을 생성 조건으로 사용하지 않습니다. 사용자가 Board를 만든 뒤 필요할 때 Workspace Delivery에서 exact Source Repository와 Git/CI/CD를 연결합니다. 추가 질문은 선택한 Template과 저장소 signal을 함께 기준으로 다시 계산하며, 해당 Template의 생성 결과에 실제 영향을 주는 질문만 최대 5개 표시합니다. 질문, 선택지, 선택 이유는 한국어로 표시하며, 알려진 구형 영문 응답도 프론트엔드에서 한국어 문구로 정규화합니다. boolean과 single-select 답변은 dropdown 대신 선택한 박스 전체가 강조되는 직접 선택 버튼으로 표시합니다. 미답변 상태에서도 생성 버튼은 활성화하지만, 클릭하면 모든 질문에 답하라는 안내를 표시하고 보드 생성과 이동을 중단합니다. Template을 바꾸면 이전 답변을 초기화합니다. Repository Analysis로 확인할 수 없는 파일 업로드, 실시간 기능, 인증서 같은 조건은 임의의 필수 capability로 추론하지 않고, 질문 답변이나 명시적 evidence가 있을 때만 Architecture Draft requirement로 승격합니다.

`questions`는 선택한 Template의 Diagram 생성에 영향을 주는 항목만 최대 5개까지 제공한다. 질문 ID와 정규화한 문장은 한 후보 안에서 중복될 수 없고, `primary_runtime`은 API/runtime, `include_frontend`는 frontend/React/web, `include_database`는 data/DB/storage 의미를 포함해야 한다. 의미 검증에 실패하면 AI 순위와 설명은 유지하고 질문만 deterministic 값으로 교체한다. 사용자가 답변을 제출하면 `POST /api/projects/:projectId/source-repositories/:sourceRepositoryId/template-recommendation`가 `deploymentType`, `usesCiCd`, `answers`를 받아 `RepositoryTemplateRecommendationResult`를 반환한다. 추천은 deterministic supported candidate set과 Template별 허용 질문 집합을 먼저 만들며, 모든 배포 유형에서 중복 없는 비교 후보를 최소 2개, 최대 3개 유지한다. 각 후보는 저장소 evidence와 Template 특성을 연결한 한국어 추천 이유와 고려할 점을 각각 최소 2개 제공합니다. deterministic 1순위의 confidence가 0.85 이상이고 2순위와 0.20 이상 차이가 나면 저장소 evidence가 명확한 것으로 간주하며, AI는 설명과 confidence를 보강할 수 있지만 해당 1순위를 뒤집을 수 없습니다. `OPENAI_API_KEY`가 설정되어 있으면 별도 provider flag 없이 항상 OpenAI Responses Structured Outputs를 먼저 호출해 허용 후보의 순위, confidence, 한국어 reasons/tradeoffs, 질문 문구를 생성한다. deterministic fallback도 동일한 한국어 상세도 계약을 지킵니다. 추천 전용 모델은 `OPENAI_REPOSITORY_TEMPLATE_MODEL`로 바꿀 수 있고 기본값은 저지연 `gpt-5-nano`다. 요청은 최대 10개 evidence 파일의 앞 600자와 100개 tree path만 사용하고 reasoning effort를 `minimal`로 제한한다. 공개 URL의 같은 repository URL과 branch 분석 결과는 Runtime Cache에 5분간 저장해 GitHub와 OpenAI 호출을 반복하지 않으며, 추천 계약 변경 시 cache namespace를 올려 이전 순위 결과를 재사용하지 않습니다. `rankingSource`는 `ai` 또는 `deterministic`을 표시하고, fallback이면 `fallbackReason`이 원인을 제공한다. API key 미설정, timeout, provider 오류, 후보 누락·중복·허용되지 않은 ID가 있을 때만 전체 deterministic 결과로 fallback한다.

Container 추천의 supported candidate set은 고정 ECS/EKS 점수를 사용하지 않는다. Application Unit 수와 종류, 감지된 framework, 관계형 데이터베이스와 로컬 영속성, Kubernetes 및 VM 운영 근거를 repository profile로 계산한다. 단일 backend container와 frontend/backend/database가 분리된 multi-service repository는 서로 다른 후보 집합, confidence, reasons를 가져야 한다. NestJS package와 FastAPI 또는 uvicorn Docker 실행 근거는 backend Application Unit으로 분류한다. OpenAI 요청에는 deterministic confidence를 전달하지 않고 repository profile과 허용 Template 설명을 전달해 저장소별 근거로 confidence를 독립 산정한다.

```ts
type RepositoryDeploymentType = "ec2_vm" | "container" | "serverless";

type RepositoryAnalysisQuestion = {
  id: string;
  prompt: string;
  answerType: "single_select" | "boolean" | "free_text";
  options?: { value: string; label: string }[];
  required: boolean;
  reason: string;
};

type RepositoryAnalysisAnswer = {
  questionId: string;
  value: string | boolean;
};

type RepositoryTemplateRecommendationCandidate = {
  templateId: TemplateId;
  displayTitle: string;
  confidence: number;
  reasons: string[];
  tradeoffs: string[];
  questions?: RepositoryAnalysisQuestion[];
};

type RepositoryTemplateRecommendationResult = {
  deploymentType: RepositoryDeploymentType;
  usesCiCd: boolean;
  candidates: RepositoryTemplateRecommendationCandidate[];
};
```

추천 결과의 `templateId`는 반드시 `TemplateId`로 검증되어야 한다. Workspace handoff는 저장된 `aiHandoff.templateId` 또는 추천 후보의 `templateId`만 허용하며, URL에서 임의로 바꾼 Template은 `REPOSITORY_ANALYSIS_TEMPLATE_MISMATCH`로 거부한다.
