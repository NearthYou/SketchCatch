# AWS Template Design 시각 레이어 설계

## 목적

여섯 AWS/Kubernetes Template의 기존 배포 리소스 103개와 Terraform 의미를 그대로 보존하면서, 실제 왼쪽 Resource Panel의 Design 항목으로 사용자·인터넷·Region·AZ·Group 같은 시각 맥락을 보강한다.

이번 변경은 Architecture의 배포 의미를 늘리는 작업이 아니다. Design 노드와 Design edge는 보드를 읽기 쉽게 만드는 presentation 전용 정보이며 Terraform graph, Architecture semantic graph, AI resource relationship에 들어가지 않는다.

## 기존 계약과의 관계

- `007_AWS템플릿패턴_gg.md`의 실제 Catalog 항목만 사용한다는 원칙을 유지한다.
- `013_AWS템플릿보드배치매핑_gg.md`와 `014_AWS템플릿Board실화면QA_gg.md`는 Design 레이어가 없던 103개 배포 노드의 기준선이다.
- `013`의 “새 Design 노드를 만들지 않는다”는 당시 구현 범위는 이번 문서에서 presentation 전용 구조로 확장한다.
- 기존 `resources`, `relationships`, parameter, Terraform reference는 기준선 그대로 유지한다.

## 절대 보존 계약

| Template | 배포 Resource 수 |
| --- | ---: |
| Static Web Hosting | 6 |
| Minimal Serverless API | 12 |
| Full Serverless Web App | 16 |
| 3-Tier Web App | 30 |
| ECS Fargate Container App | 20 |
| EKS Container App | 19 |
| **합계** | **103** |

다음 값은 presentation 작업 전후가 완전히 같아야 한다.

- 기존 Resource ID, type, provider, kind
- Terraform block type, resource name 생성 규칙, values, reference
- 기존 relationship ID, source, target, label
- Template parameter와 기본값
- API 호출, 저장, 승인, Preview/Plan/Apply 흐름

## 데이터 경계

`TemplateDefinition`은 배포 의미와 시각 설명을 분리한다.

```ts
type TemplateDefinition = {
  resources: readonly TemplateResourceDefinition[];
  relationships: readonly TemplateRelationship[];
  presentationNodes: readonly TemplatePresentationNodeDefinition[];
  presentationEdges: readonly TemplatePresentationEdgeDefinition[];
};
```

### presentation node

- `catalogItemId`로 실제 `resourceCatalog` 항목을 지정한다.
- materialize 결과는 항상 `kind: "design"`이다.
- Terraform `parameters`와 Terraform identity를 갖지 않는다.
- Catalog의 icon, 기본 label, 기본 size를 사용하고 Template은 역할 label과 확대된 area size만 덮어쓸 수 있다.
- `parentAreaNodeId`는 presentation node 또는 기존 배포 area node를 가리킬 수 있다.
- Region, AZ, Group은 presentation 전용 시각 컨테이너다.
- 배포 node가 presentation container의 자식이 되어도 Terraform 의미는 바뀌지 않는다.

### presentation edge

- endpoint는 기존 배포 node 또는 presentation node를 가리킬 수 있다.
- 적어도 한 endpoint는 presentation node여야 한다.
- `DiagramJson.edges`에는 보이지만 `TemplateDefinition.relationships`에는 들어가지 않는다.
- 관계 label은 사용자 흐름을 설명하는 시각 정보만 사용한다.
- Terraform 생성과 Architecture semantic 분석은 기존 `relationships`만 사용한다.

## Resource Catalog 계약

기존 실제 항목을 우선 사용한다.

| Catalog ID | 표시 이름 | 역할 |
| --- | --- | --- |
| `design-user-client` | User / Client | 외부 사용자 또는 클라이언트 |
| `design-internet` | Internet | 외부 인터넷 진입 |
| `aws-region` | Region | presentation 전용 Region container |
| `aws-availability-zone` | AZ | presentation 전용 AZ container |
| `design-group` | Group | 기능 lane/support rail |

`Source Repository`는 기존 패널에 없으므로 정식 Design 항목으로 추가한다.

- Catalog ID: `design-source-repository`
- type: `sketchcatch_source_repository`
- icon: `Res_Git-Repository_48_Light.svg`
- 검색과 drag 지원
- Template 전용 가짜 항목 금지

Region/AZ의 기존 수동 drag 동작은 호환성을 위해 바꾸지 않는다. Template presentation materializer가 해당 실제 Catalog item의 icon·label·size만 재사용하고, 결과 node를 비배포 Design container로 만드는 안전한 경계를 둔다.

## Template별 시각 구조

### 01. Static Web Hosting

- 추가 Design: `User / Client`, `Region`
- 시각 flow: `User / Client → CloudFront Distribution`
- Region 밖: User, CloudFront Distribution, Origin Access Control
- Region 안: S3 Bucket, S3 Object, Public Access Block, Bucket Policy
- 불필요한 Group은 만들지 않는다.

### 02. Minimal Serverless API

- 추가 Design: `User / Client`, `Region`
- 시각 flow: `User / Client → API Gateway`
- Region 밖: User, IAM Role, IAM Policy
- Region 안: API Gateway와 내부 API 단계, Lambda, Lambda Permission, DynamoDB, Logs
- 기존 API Gateway area를 유지하며 별도 API Group은 만들지 않는다.

### 03. Full Serverless Web App

- 추가 Design flow node: `Source Repository`, `User / Client`
- 추가 container: `Region`
- 추가 Group: `Source / User`, `Frontend`, `Identity`, `API`, `Compute`, `Data / Ops`, `Global IAM`
- Region 밖: Source / User, Global IAM
- Region 안: Frontend, Identity, API, Compute, Data / Ops
- API Gateway area는 API Group의 자식이며 기존 API 내부 node는 API Gateway 안에 유지한다.
- 시각 flow:
  - `Source Repository → Amplify App`
  - `User / Client → Amplify App`
  - `User / Client → Cognito User Pool`
- 실제 Lambda Function 하나만 유지하고 CRUD Lambda를 꾸며내지 않는다.

### 04. 3-Tier Web App

- 추가 Design flow node: `Internet`
- 추가 container: `Region`, `AZ A`, `AZ B`
- 계층: `Region → VPC → AZ → Subnet`
- 시각 flow: `Internet → Internet Gateway`
- Public/App/DB Subnet은 AZ A/B의 자식이며 기존 가로 행 중심선을 유지한다.
- Route Table은 각 tier 왼쪽 rail, NAT/EIP는 Public tier 상단에 둔다.
- tier Group은 추가하지 않아 한 node가 두 부모를 갖지 않게 한다.

### 05. ECS Fargate Container App

- 추가 Design flow node: `User / Client`
- 추가 container: `Region`, `AZ A`, `AZ B`
- 추가 Group: `Definition / Ops`, `Global IAM`
- 시각 flow: `User / Client → Application Load Balancer`
- 계층: `Region → VPC → AZ → Subnet`
- ECS Cluster는 두 AZ에 걸치는 VPC 직속 container다.
- Definition / Ops는 Region 안, VPC 밖 오른쪽 rail이다.
- Global IAM은 Region 밖 support rail이다.
- Fargate Task A/B나 Container instance는 만들지 않는다.

### 06. EKS Container App

- 추가 container: `Region`, `AZ A`, `AZ B`
- 추가 Group: `Global IAM`
- 계층: `Region → VPC → AZ → Subnet`
- EKS Cluster와 Managed Node Group은 두 AZ를 가로지르는 VPC 영역이다.
- Namespace는 Cluster 안, Deployment와 Service는 Namespace 안이다.
- Security Group은 VPC 쪽에 둔다.
- 외부 Load Balancer/Ingress가 없고 Service가 `ClusterIP`이므로 User/Client와 공개 진입 edge를 추가하지 않는다.
- Pod, Container, Worker, Ingress, Load Balancer, ECR/Image를 꾸며내지 않는다.

## compact layout 계약

- 모든 좌표와 area size는 40px grid를 사용한다.
- main-flow node 중심 간격은 160~200px을 목표로 한다.
- support node 간격은 80~120px을 목표로 한다.
- container 내부 좌우 padding은 최소 80px이다.
- 같은 역할은 같은 행 또는 열 중심선에 맞춘다.
- 이유 없는 240px 초과 빈 공간을 만들지 않는다.
- 전체 콘텐츠 바깥 viewport 여백은 약 80px이다.
- 48px icon뿐 아니라 화면 caption footprint까지 충돌 계산에 포함한다.
- child의 전체 시각 footprint는 parent 안에 들어가야 한다.
- non-containment edge는 다른 node와 caption을 가로지르지 않아야 한다.

## 호환성과 안전성

- 저장된 기존 Board hydration은 기존 Catalog materialization 경로를 유지한다.
- 수동 drag한 Region/AZ는 기존 type과 동작을 유지한다.
- presentation 구조는 Template을 새로 build할 때만 합성한다.
- Terraform과 Architecture semantic 소비자는 `kind: resource`와 기존 semantic relationship만 사용한다.
- presentation node에는 parameters가 없으므로 Terraform 주소가 만들어질 수 없다.
- presentation edge ID는 semantic relationship ID와 구분되는 접두사를 쓴다.

## 검증 계약

1. Design Catalog item과 icon 파일 존재
2. 실제 Catalog 기반 materialization
3. 모든 presentation node가 `kind: design`, parameters 없음
4. Region/AZ/Group parent 계층 정확성
5. presentation edge endpoint 중 하나 이상이 Design node
6. presentation edge가 semantic relationship과 Terraform graph에 미포함
7. 기존 103개 Resource semantic hash 불변
8. 기존 Resource values와 relationship 의미 불변
9. sibling node/caption 충돌 0건
10. child footprint parent containment
11. visible edge node/caption crossing 0건
12. compact viewport와 행·열 정렬

