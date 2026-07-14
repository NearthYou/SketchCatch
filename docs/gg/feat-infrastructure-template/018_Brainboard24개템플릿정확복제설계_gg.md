# Brainboard 24개 AWS Template 정확 복제 설계

## 한 줄 결론

Brainboard의 `Amazon Web Services` 필터 결과 중 작성자가 `Chafik Belhaoues`인 24개 Template을 다운로드 수 내림차순으로 조사하고, 기존 여섯 Template을 변경하지 않은 채 `brainboard-*` 신규 Template으로 추가한다. 원본 좌표계와 Terraform 의미를 각각 보존하는 source fixture를 SSOT로 두고, SketchCatch의 기존 Resource catalog와 Template materialization 경로를 재사용한다.

## 1. 완료 기준

- 기존 내장 Template 여섯 개의 ID, semantic hash, layout, thumbnail을 변경하지 않는다.
- Brainboard 원본 24개를 별도 신규 ID로 등록한다.
- 내장 Template gallery는 30개가 된다.
- 각 신규 Template은 원본의 resource type, Terraform logical name, 값, 참조, nested block을 재현한다.
- 각 신규 Template은 원본의 node DOM 순서, 좌표, 크기, containment, z-order, viewport, edge path와 연결 방향을 source fixture에 보존한다.
- 원본에 없는 자동 배치 결과를 최종 layout으로 사용하지 않는다.
- Brainboard에서 `Plan`과 `Deploy`를 실행하지 않는다.
- 하나의 원본을 읽거나 변환하는 데 실패해도 다음 Template을 계속 처리하고, 마지막에 완료·실패 목록과 이유를 남긴다.

현재 코드에서 내장 Template은 여섯 개다. 이번 완료 기준은 기존 여섯 개와 신규 24개를 합친 Template gallery 30개이며, 별도 `빈 보드로 시작` action은 범위와 합계에서 제외한다.

## 2. 원본 범위와 처리 순서

2026-07-14에 Brainboard Template 화면에서 AWS provider filter를 적용하고, 전체 결과를 끝까지 스크롤한 뒤 작성자 이름을 대조했다. 처리 순서는 화면에 표시된 download 수 내림차순이다.

| 순서 | Download | Brainboard Template | Source ID |
| ---: | ---: | --- | --- |
| 1 | 19,855 | `[Training] AWS onboarding` | `d71155af-5339-44f1-ae11-2bcd29411c2d` |
| 2 | 1,414 | `AWS Kubernetes cluster with native CNIs` | `43b2ae45-cae5-4a06-83d3-2c5007e0c49b` |
| 3 | 1,055 | `AWS VPC with subnet and security groups on 2 AZs` | `a9b3f02c-a950-4153-92d2-47905dd8ffd3` |
| 4 | 812 | `AWS serverless architecture with CDN` | `45191152-00cd-443d-a7f5-9a7295120e48` |
| 5 | 684 | `AWS EC2 instance inside VPC & Subnet` | `9009bff8-8177-4022-ad39-6035ad4acd05` |
| 6 | 655 | `AWS ASG and LB with VPC & subnets` | `f161f840-d697-4651-aa8d-6ec05b981a79` |
| 7 | 637 | `AWS Jenkins architecture on EC2` | `c884d82a-6fab-454f-a984-619d65ad6044` |
| 8 | 631 | `AWS REST API for DocumentDB` | `9447b484-b256-42b3-b933-ced015820d0b` |
| 9 | 537 | `AWS network landing zone` | `32450f82-e196-4602-853c-c55c0cb9718e` |
| 10 | 489 | `AWS 3-tier web app with a database` | `fb2334bf-3291-40db-a779-1e4e56df27dd` |
| 11 | 485 | `AWS Bastion` | `130f8091-21a4-4e8b-8b39-2373cb720d72` |
| 12 | 460 | `AWS instance and DB with multiple networks` | `09fd3420-d8f0-409c-a1cc-694dba97443f` |
| 13 | 300 | `AWS load balancer with target group` | `85dda071-ea16-4cbc-9d77-7cebe6ebaadd` |
| 14 | 299 | `AWS S3 API Gateway integration` | `73327761-bb6a-4516-92e5-f06007e372ec` |
| 15 | 292 | `AWS costs monitoring` | `6e651e34-318d-41e2-b229-86d30aa0520f` |
| 16 | 280 | `AWS ECS with Fargate` | `18b7b40a-8493-4ebb-ad21-0eb85f6ae257` |
| 17 | 220 | `AWS multi-account management` | `a432a178-bbcb-4353-a6e4-fd6a557941e6` |
| 18 | 216 | `AWS Elastic Beanstalk` | `eb84baae-e3a7-4d39-b80d-a22466e5ea16` |
| 19 | 203 | `AWS RDS` | `f588fabc-5991-44de-b9cc-5afd1d74e710` |
| 20 | 68 | `AWS FSX architecture` | `a1a4b134-bc00-4f97-82b8-46346da8ecde` |
| 21 | 68 | `Cross account AWS S3` | `6e3d35f1-eeb7-4015-9814-c3959928a3ac` |
| 22 | 56 | `AWS IAM users creation` | `46009873-0596-40b3-bcf4-b466428c54b4` |
| 23 | 38 | `AWS Dashcam Video Processing Pipeline` | `4e26a41a-78e5-43df-8c32-e6f1e47e40cb` |
| 24 | 0 | `AWS secure S3 bucket` | `83a63920-3c99-4e86-9f42-a46de416e124` |

`AWS secure S3 bucket`은 카드에 download 숫자가 표시되지 않아 정렬값을 0으로 기록한다. 동일 download 수 68인 두 항목은 Brainboard 목록의 표시 순서를 유지한다.

## 3. 검토한 구현 접근

### 접근 A: source fixture와 기존 TemplateDefinition adapter 결합

원본 capture를 provider-neutral source fixture에 기록하고, adapter가 기존 `TemplateDefinition`과 `DiagramJson`으로 변환한다. Resource catalog identity와 Terraform renderer를 재사용하되, `geometryPolicy: "source-exact"`인 신규 Template만 원본 좌표와 size, z-order, edge waypoint를 그대로 통과시킨다.

- 장점: 원본 증거와 SketchCatch runtime model이 분리되고, 24개를 같은 방식으로 검증할 수 있다.
- 장점: 기존 여섯 Template의 compact 40px-grid 계약을 그대로 유지할 수 있다.
- 장점: 새 AWS resource type은 catalog에 한 번만 등록하고 여러 Template에서 재사용한다.
- 단점: geometry와 edge 계약을 확장해야 한다.

### 접근 B: 원본을 기존 compact layout으로 정규화

Brainboard 좌표를 40px grid와 현재 catalog size로 변환하고, edge는 현재 obstacle router에 맡긴다.

- 장점: 현재 model 변경이 적다.
- 단점: 원본 container 크기, 비율, 간격, port와 path를 보존하지 못하므로 이번 요구사항을 충족하지 않는다.

### 접근 C: 원본 DiagramJson을 Template마다 직접 저장

24개 완성 DiagramJson을 Web fixture로 직접 넣고 Terraform text도 별도 golden file로 보관한다.

- 장점: 첫 화면을 빠르게 만들 수 있다.
- 단점: shared Resource identity, parameter panel, Terraform sync를 우회하고 중복 정의가 크게 늘어난다.
- 단점: source와 materialized 결과의 차이를 설명하거나 재생성하기 어렵다.

선택은 접근 A다. 정확도와 재사용을 동시에 만족하는 유일한 구조다.

## 4. source fixture 계약

각 Brainboard Template은 하나의 독립 fixture로 보관한다. fixture의 최소 필드는 다음과 같다.

```ts
type BrainboardTemplateSource = {
  readonly id: `brainboard-${string}`;
  readonly origin: {
    readonly platform: "brainboard";
    readonly author: "Chafik Belhaoues";
    readonly sourceTemplateId: string;
    readonly sourceUrl: string;
    readonly downloads: number;
    readonly capturedAt: string;
  };
  readonly title: string;
  readonly description: string;
  readonly provider: "aws";
  readonly viewport: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly nodes: readonly BrainboardSourceNode[];
  readonly edges: readonly BrainboardSourceEdge[];
  readonly terraform: {
    readonly files: Readonly<Record<string, string>>;
    readonly resourceAddresses: readonly string[];
  };
};
```

`BrainboardSourceNode`는 원본 DOM 순서, source node ID, resource type, Terraform address, label, absolute position, width, height, parent source ID, presentation 여부를 가진다. `BrainboardSourceEdge`는 원본 DOM 순서, source/target source ID, 시작·끝 port, SVG path, waypoint, arrow 방향을 가진다.

Brainboard clone board의 `terraform.tfvars`에 들어가는 clone architecture UUID는 Template 의미가 아니므로 신규 board마다 고정값으로 복사하지 않는다. 반대로 원본 Template의 default variable, resource tag, Terraform logical name에 포함된 값은 source 의미이므로 fixture와 생성 결과에서 보존한다.

## 5. materialization과 rendering

### 기존 Template

- `geometryPolicy` 기본값은 `catalog-normalized`다.
- 현재 palette size, compact layout, area-depth z-index, obstacle routing을 그대로 사용한다.
- 기존 여섯 Template의 semantic/layout hash를 바꾸지 않는다.

### Brainboard Template

- `geometryPolicy`는 `source-exact`다.
- node의 absolute coordinate와 explicit width/height를 catalog size로 덮어쓰지 않는다.
- node array 순서와 explicit `zIndex`를 보존한다.
- Region, Availability Zone, Internet처럼 Terraform resource가 아닌 항목은 presentation node로 materialize한다.
- VPC와 Subnet은 semantic resource이면서 containment area로 materialize한다.
- Security Group의 원본 container box는 semantic Security Group resource와 연결된 presentation area로 표현하고, Terraform parent로 오해하지 않는다.
- edge의 source/target relation은 Terraform reference와 별개로 유지한다. Terraform reference는 resource values에서 생성한다.
- 원본 SVG path를 source evidence로 보존하고, runtime은 대응 가능한 waypoint와 port를 사용한다. 현재 renderer가 표현할 수 없는 arbitrary port offset은 source fixture와 QA report에 남기고 가장 가까운 정확한 side handle로 표시한다.
- source viewport를 저장하고 Template 적용 직후 해당 bounds가 fit되도록 초기 viewport를 사용한다.

원본 좌표를 임의 scale로 재작성하지 않는다. Canvas가 큰 Template은 zoom-to-fit으로 보여주며 node 간 상대 거리와 container 크기를 그대로 유지한다.

## 6. Terraform 재현 규칙

- Brainboard code pane에서 보이는 모든 `.tf`와 `terraform.tfvars`를 source evidence로 수집한다.
- runtime Terraform은 SketchCatch의 기존 renderer에서 생성한다.
- resource type, logical name, attribute, nested block, reference expression은 원본과 일치해야 한다.
- Brainboard managed backend 주석은 source evidence에는 남기되 SketchCatch backend 구성으로 생성하지 않는다.
- provider version은 원본 capture에 기록하고, SketchCatch 전체 provider policy와 충돌하면 generated artifact의 차이를 명시적으로 테스트한다.
- source에 있는 AWS-managed IAM policy ARN은 literal ARN으로 보존한다.
- 새 resource type이 catalog에 없으면 fallback tile을 만들지 않고 shared ResourceDefinition, catalog item, parameter contract, Terraform mapping을 한 번 추가한다.
- UI에서 edge를 그었다는 이유만으로 Terraform reference를 추론하지 않는다. reference는 source Terraform과 resource values 양쪽에서 확인한다.

## 7. 실패 격리

각 Template은 다음 상태 중 하나를 가진다.

- `captured`: detail, clone board, nodes, edges, Terraform files 수집 완료
- `materialized`: source fixture가 SketchCatch DiagramJson으로 변환됨
- `verified`: Terraform semantic contract와 visual contract 통과
- `failed`: 실패 단계와 이유, 마지막 확보 증거 기록

한 Template의 unsupported resource나 malformed source가 다른 Template 등록을 막지 않도록 fixture와 test를 개별 파일·개별 case로 분리한다. Gallery에는 `verified` Template만 기본 노출하고, 전체 24개 완료 전에는 registry count test를 완료로 바꾸지 않는다.

## 8. 검증 설계

### 기존 여섯 Template 회귀

- 기존 ID/title/layout/semantic hash fixture를 그대로 유지한다.
- 기존 thumbnail hash와 1280×720 WebP 계약을 유지한다.
- repository recommendation이 사용하는 기존 여섯 ID 집합을 별도로 유지한다.

### 신규 24개 source contract

- sourceTemplateId, 신규 Template ID, resource ID, edge ID가 모두 유일해야 한다.
- download 순서와 24개 수를 fixture manifest에서 검증한다.
- ordered node/edge snapshot으로 좌표, 크기, parent, z-index, port, waypoint, viewport를 검증한다.
- source Terraform file hash와 resource address 목록을 검증한다.
- materialized DiagramJson이 source-exact geometry를 바꾸지 않았는지 검증한다.
- generated Terraform이 원본의 resource type, logical name, 핵심 값, reference를 포함하는지 검증한다.

### 사용자 가시 결과

- `listBoardTemplates()`는 기존 6개와 신규 24개를 합쳐 30개를 반환한다.
- Workspace 시작 화면의 Template picker는 30개 Template card를 제공한다.
- 각 Template card에서 실제 board를 생성하고 Design 화면을 열 수 있다.
- 원본 Brainboard와 SketchCatch를 같은 viewport 기준으로 capture해 container bounds, node centers, edge endpoints를 비교한다.

## 9. 현재 source capture 상태

- `[Training] AWS onboarding`: clone board 생성, 22 nodes, 15 edges, viewport, `main.tf` 167 lines, variables/provider/tfvars와 보조 파일 수집 완료.
- `AWS Kubernetes cluster with native CNIs`: clone board 생성, 22 nodes, 14 edges, viewport, `main.tf`, `cluster.tf`, `iam.tf`, variables/provider/tfvars와 보조 파일 수집 완료.
- 나머지 22개: download 순서대로 capture 예정.

두 clone board 모두 source inspection 용도이며 Brainboard의 `Plan`과 `Deploy`는 실행하지 않았다.

## 10. 최종 증거

완료 보고에는 다음을 포함한다.

- 24개 manifest와 source URL
- Template별 capture/materialized/verified/failed 상태
- 실패한 Template의 단계와 원인
- 기존 6개 회귀 테스트 결과
- 신규 24개 geometry와 Terraform contract 결과
- Template gallery 30개 화면 증거
- `pnpm harness:check`, `pnpm catalog:check`, focused tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `git diff --check` 결과

Brainboard나 SketchCatch에서 실제 `Plan`, `Apply`, `Deploy`는 이번 작업의 완료 증거가 아니며 실행하지 않는다.
