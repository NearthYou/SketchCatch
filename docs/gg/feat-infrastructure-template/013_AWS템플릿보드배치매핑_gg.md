# AWS Template Board 배치 매핑

## 목적

여섯 Template의 배포 의미는 그대로 두고, 실제 Architecture Board의 `position`, `parent/group`, `viewport`, edge handle/routing만 PNG 패턴에 맞게 다시 정리한다.

## 비교 기준

첨부 파일의 번호와 이미지 제목 순서가 섞여 있었다. 아래처럼 **이미지 제목**을 기준으로 대응시킨다.

| Template | 실제 PNG 파일 | 배치 기준 |
| --- | --- | --- |
| Static Web Hosting | `image-3.png` | CloudFront → S3 수평 요청 경로, 하단 보조 설정 |
| Minimal Serverless API | `image-4.png` | API Gateway compact group → Lambda → DynamoDB, 상·하단 support |
| Full Serverless Web App | `image-6.png` | Frontend / Identity / API / Compute / Data-Ops 기능 열 |
| 3-Tier Web App | `image-2.png` | 2개 A/B 열, Public / App / DB 3개 행, 좌측 route rail |
| ECS Fargate Container App | `image-1.png` | VPC 안 network + cluster workload, 오른쪽 Definition / Ops rail |
| EKS Container App | `image-5.png` | VPC 안 EKS Cluster → Namespace workload, 오른쪽 Support rail |

원본: [AWS Template Patterns](./007_AWS템플릿패턴_gg.md)

## 공통 불변조건

- Resource ID, Resource 종류, Resource 수, label, parameter 값, Terraform reference, relationship ID/방향/label은 바꾸지 않는다.
- 새 디자인 노드, 가짜 AWS 노드, raw Terraform logical name 노드를 만들지 않는다.
- 모든 가시 노드는 기존 왼쪽 Resource catalog의 실제 resource type을 materialize한 아이콘/표현을 사용한다.
- `contains`, `hosts` 관계는 기존처럼 group containment로 보이며, 별도 실행 의미 edge를 추가하지 않는다.
- support rail에는 이미 존재하는 IAM, Policy, Permission, Logs, repository/definition 노드만 배치한다.
- PNG에만 있고 현재 Template에 없는 Client, Route 53, ACM, AZ node, Private Subnet, Ingress, Pod, Container, ECR, CloudWatch node는 추가하지 않는다.

### AZ 제약

3-Tier / ECS / EKS의 현재 정의에는 `aws_availability_zone` node가 0개다. 왼쪽 panel에는 AZ resource가 이미 있지만, 이를 추가하면 node 수 불변조건을 깨뜨린다. 따라서 이번 변경에서는 기존 `A` / `B` subnet을 **두 개의 AZ 세로 열을 나타내는 실제 resource container**로 정렬하고, AZ frame 자체는 새 node로 만들지 않는다.

## 현재 실제 구성 기준

| Template | Nodes | Relationships |
| --- | ---: | ---: |
| Static Web Hosting | 6 | 6 |
| Minimal Serverless API | 12 | 6 |
| Full Serverless Web App | 16 | 5 |
| 3-Tier Web App | 30 | 10 |
| ECS Fargate Container App | 20 | 7 |
| EKS Container App | 19 | 8 |

## 배치 계약

좌표는 40px grid 기준이다. `root`는 Board 최상단, `VPC`, `API Gateway`, `ECS Cluster`, `EKS Cluster`, `Kubernetes Namespace`, `Auto Scaling Group`은 기존 실제 resource를 visual container로 쓰는 것을 뜻한다.

### 01. Static Web Hosting

요청 경로는 CloudFront → S3 Bucket 수평 행이고, OAC / bucket 설정은 아래 support rail에 둔다.

| ID | Resource | 목표 좌표 | Parent | 역할 |
| --- | --- | --- | --- | --- |
| `distribution` | CloudFront Distribution | 480, 280 | root | main flow 시작 |
| `bucket` | S3 Bucket | 920, 280 | root | main flow 도착 |
| `oac` | CloudFront OAC | 640, 480 | root | CloudFront/S3 사이 보조 설정 |
| `index-object` | S3 Object | 1,120, 360 | root | S3 우측 asset 설정 |
| `public-access` | S3 Public Access Block | 920, 520 | root | S3 하단 보안 설정 |
| `bucket-policy` | S3 Bucket Policy | 1,480, 560 | root | S3 우측 하단 정책 |

`viewport = { x: 0, y: 0, zoom: 0.75 }`. `distribution → bucket`은 right→left, `bucket-policy → bucket`은 right-side rail을 돌아 Public Access Block과 Index Object를 가로지르지 않게 smoothstep handle을 사용한다.

### 02. Minimal Serverless API

API Gateway는 실제 `aws_api_gateway_rest_api` node를 compact container로 쓰고, route/method/integration/deployment/stage를 그 안에 세로로 둔다. main flow는 API group → Lambda → DynamoDB다.

| ID | Resource | 목표 좌표 | Parent | 역할 |
| --- | --- | --- | --- | --- |
| `api` | API Gateway | 320, 240 | root | compact API container |
| `route` | API Route | 440, 380 | `api` | API 내부 1행 |
| `method` | API Method | 440, 520 | `api` | API 내부 2행 |
| `integration` | API Integration | 440, 660 | `api` | API 내부 3행 |
| `deployment` | API Deployment | 440, 800 | `api` | API 내부 support |
| `stage` | API Stage | 440, 940 | `api` | API 내부 support |
| `permission` | Lambda Permission | 880, 320 | root | Lambda 상단 support |
| `handler` | Lambda Function | 880, 560 | root | main flow |
| `table` | DynamoDB Table | 1,200, 560 | root | main flow |
| `log-group` | CloudWatch Log Group | 1,480, 560 | root | 오른쪽 Ops |
| `role` | IAM Role | 880, 840 | root | 하단 support |
| `role-policy` | IAM Role Policy | 1,160, 840 | root | 하단 support |

`viewport = { x: 0, y: 0, zoom: 0.64 }`. runtime은 right→left, permission은 bottom→top, IAM은 Lambda bottom→top으로 routing한다.

### 03. Full Serverless Web App

새 lane node를 만들지 않는다. 실제 resource를 Source/Frontend, Identity, API, Compute, Data/Ops의 가로 열에 배치한다. API Gateway는 내부 API resource의 compact container다.

| ID | Resource | 목표 좌표 | Parent | 역할 |
| --- | --- | --- | --- | --- |
| `frontend` | Amplify App | 200, 560 | root | Frontend 열 |
| `user-client` | Cognito User Pool Client | 560, 400 | root | Identity 상단 |
| `user-pool` | Cognito User Pool | 560, 640 | root | Identity 하단 |
| `api` | API Gateway | 920, 260 | root | API compact container |
| `authorizer` | API Authorizer | 1,040, 420 | `api` | API 내부 auth |
| `route` | API Route | 1,040, 580 | `api` | API 내부 request |
| `method` | API Method | 1,040, 720 | `api` | API 내부 request |
| `integration` | API Integration | 1,040, 860 | `api` | API 내부 request |
| `deployment` | API Deployment | 1,040, 1,000 | `api` | API 내부 support |
| `stage` | API Stage | 1,040, 1,140 | `api` | API 내부 support |
| `permission` | Lambda Permission | 1,520, 400 | root | Compute 상단 support |
| `handler` | Lambda Function | 1,520, 560 | root | Compute main flow |
| `table` | DynamoDB Table | 1,840, 560 | root | Data main flow |
| `log-group` | CloudWatch Log Group | 2,080, 720 | root | Data/Ops support |
| `role` | IAM Role | 1,520, 840 | root | Compute support |
| `role-policy` | IAM Role Policy | 1,760, 840 | root | Compute support |

`viewport = { x: 0, y: 0, zoom: 0.48 }`. main runtime edge는 Frontend → API → Lambda → DynamoDB, Identity와 IAM edge는 상·하단 support 방향을 쓴다.

### 04. 3-Tier Web App

VPC 안에서 `A`와 `B` subnet을 두 vertical column, Public/App/DB를 세 horizontal row로 유지한다. 각 tier route table은 왼쪽 rail이다. 새로운 AZ node는 만들지 않는다.

| ID | Resource | 목표 좌표 | Parent | 역할 |
| --- | --- | --- | --- | --- |
| `vpc` | VPC | 160, 160 (2,400 × 1,840) | root | outer container |
| `internet-gateway` | Internet Gateway | 320, 280 | `vpc` | ingress support |
| `nat-eip` | Elastic IP | 960, 280 | `vpc` | NAT support |
| `nat-gateway` | NAT Gateway | 1,120, 280 | `vpc` | Public/App bridge |
| `public-route-table` | Public Route Table | 320, 560 | `vpc` | Public row rail |
| `public-route-a` / `public-route-b` | Route Associations | 520, 560 / 520, 680 | `vpc` | Public rail helper |
| `public-subnet-a` / `public-subnet-b` | Public Subnets | 680, 440 / 1,440, 440 | `vpc` | A/B public row containers |
| `load-balancer` | Load Balancer | 820, 560 | `public-subnet-a` | Public runtime |
| `listener` | ALB Listener | 1,040, 560 | `public-subnet-a` | ALB 근접 support |
| `target-group` | Target Group | 1,520, 1,000 | `app-subnet-b` | ASG 진입점 |
| `alb-security-group` | Security Group | 820, 680 | `public-subnet-a` | ALB 근접 security |
| `app-route-table` | App Route Table | 320, 1,040 | `vpc` | App row rail |
| `app-route-a` / `app-route-b` | Route Associations | 520, 1,040 / 520, 1,160 | `vpc` | App rail helper |
| `app-subnet-a` / `app-subnet-b` | App Subnets | 680, 920 / 1,440, 920 (560 × 440) | `vpc` | A/B app row containers |
| `application-group` | Auto Scaling Group | 760, 980 (400 × 220) | `app-subnet-a` | App runtime container |
| `launch-template` | Launch Template | 900, 1,080 | `application-group` | ASG 내부 helper |
| `latest-ami` | AMI data | 1,120, 1,240 | `app-subnet-a` | 하단 support |
| `app-security-group` | Security Group | 1,760, 1,120 | `app-subnet-b` | App security |
| `db-route-table` | DB Route Table | 320, 1,520 | `vpc` | DB row rail |
| `db-route-a` / `db-route-b` | Route Associations | 520, 1,520 / 520, 1,640 | `vpc` | DB rail helper |
| `db-subnet-a` / `db-subnet-b` | DB Subnets | 680, 1,400 / 1,440, 1,400 | `vpc` | A/B DB row containers |
| `db-subnet-group` | DB Subnet Group | 860, 1,480 | `db-subnet-a` | DB support |
| `database` | RDS Instance | 1,660, 1,460 | `db-subnet-b` | DB runtime |
| `db-security-group` | Security Group | 1,820, 1,560 | `db-subnet-b` | DB security |

`viewport = { x: 0, y: 0, zoom: 0.38 }`. VPC → subnet `contains` stays grouping-only. `load-balancer → application-group → database` remains the only left-to-right runtime relation.

### 05. ECS Fargate Container App

VPC 안에는 network와 ECS Cluster workload를 두고, ECR / Task Definition / IAM / Logs는 VPC 밖 오른쪽 rail에 분리한다. 현재 graph에는 private subnet과 Fargate task instance가 없으므로 만들지 않는다.

| ID | Resource | 목표 좌표 | Parent | 역할 |
| --- | --- | --- | --- | --- |
| `vpc` | VPC | 160, 160 (1,800 × 1,440) | root | outer container |
| `alb-security-group` | Security Group | 480, 620 | `subnet-a` | ALB 근접 security |
| `subnet-a` / `subnet-b` | Public Subnets | 400, 360 / 1,120, 360 | `vpc` | A/B network containers |
| `load-balancer` | Load Balancer | 600, 440 | `subnet-a` | ingress main flow |
| `listener` | ALB Listener | 800, 560 | `subnet-a` | ALB 근접 |
| `target-group` | Target Group | 1,200, 480 | `subnet-b` | service 진입점 |
| `cluster` | ECS Cluster | 440, 760 | `vpc` | workload container |
| `service` | ECS Service | 800, 980 | `cluster` | workload main flow |
| `task-security-group` | Security Group | 600, 1,160 | `cluster` | service 근접 security |
| `internet-gateway` | Internet Gateway | 320, 1,360 | `vpc` | footer support |
| `route-table` | Route Table | 520, 1,360 | `vpc` | footer support |
| `route-a` / `route-b` | Route Associations | 720, 1,360 / 880, 1,360 | `vpc` | footer helper |
| `repository` | ECR Repository | 2,200, 360 | root | Definition/Ops rail |
| `task` | ECS Task Definition | 2,200, 560 | root | Definition/Ops rail |
| `execution-role` | IAM Role | 2,200, 760 | root | Definition/Ops rail |
| `execution-policy` | IAM Role Policy Attachment | 2,440, 760 | root | Definition/Ops rail |
| `task-role` | IAM Role | 2,200, 960 | root | Definition/Ops rail |
| `log-group` | CloudWatch Log Group | 2,600, 560 | root | Task 우측 Ops rail |

`viewport = { x: 0, y: 0, zoom: 0.40 }`. `cluster → service`은 container 내부, `service → task`는 VPC에서 rail로, repository → task와 task → execution role은 위→아래로, task → log는 role을 가로지르지 않도록 오른쪽으로 routing한다.

### 06. EKS Container App

VPC는 AWS infrastructure outer layer, EKS Cluster는 inner layer, Namespace는 workload inner layer다. 기존 `deployment → service` edge 방향을 우선해 Deployment를 Service 왼쪽에 둔다.

| ID | Resource | 목표 좌표 | Parent | 역할 |
| --- | --- | --- | --- | --- |
| `vpc` | VPC | 160, 160 | root | outer AWS infrastructure |
| `subnet-a` / `subnet-b` | EKS Subnets | 400, 360 / 1,120, 360 | `vpc` | A/B network containers |
| `internet-gateway` | Internet Gateway | 320, 1,240 | `vpc` | footer support |
| `route-table` | Route Table | 520, 1,240 | `vpc` | footer support |
| `route-a` / `route-b` | Route Associations | 720, 1,240 / 880, 1,240 | `vpc` | footer helper |
| `cluster` | EKS Cluster | 400, 640 | `vpc` | inner AWS container |
| `node-group` | EKS Managed Node Group | 600, 800 | `cluster` | cluster compute row |
| `namespace` | Kubernetes Namespace | 920, 760 | `cluster` | inner workload container |
| `deployment` | Kubernetes Deployment | 1,040, 900 | `namespace` | workload main flow |
| `service` | Kubernetes Service | 1,280, 900 | `namespace` | workload main flow |
| `cluster-security-group` | Security Group | 2,160, 360 | root | Support rail |
| `cluster-role` | IAM Role | 2,160, 560 | root | Support rail |
| `cluster-policy` | IAM Role Policy Attachment | 2,400, 560 | root | Support rail |
| `node-role` | IAM Role | 2,160, 760 | root | Support rail |
| `node-policy` | IAM Role Policy Attachment | 2,400, 760 | root | Support rail |
| `node-cni-policy` | IAM Role Policy Attachment | 2,160, 960 | root | Support rail |
| `node-ecr-policy` | IAM Role Policy Attachment | 2,400, 960 | root | Support rail |

`viewport = { x: 0, y: 0, zoom: 0.42 }`. `cluster → namespace`와 `namespace → deployment`는 containment, `deployment → service`는 left→right main workload edge, IAM authorization은 right support rail → cluster로 routing한다.

## 구현 방식

1. 현재 자동 topology pass가 authored position을 덮어쓰므로, 여섯 deployable Template에만 authored presentation layout을 보존한다. legacy fixture는 기존 compact topology pass를 유지한다.
2. `TemplateDefinition`에 visual-only size, viewport, edge handle/routing metadata만 추가한다. Terraform identity/values 및 relationship 방향/label에는 접근하지 않는다.
3. API Gateway, ECS Cluster, EKS Cluster, Kubernetes Namespace는 이 여섯 Template의 visual-only metadata에서만 container로 인식한다. 기존 Board의 같은 catalog Resource 동작은 바꾸지 않으며, 새 node도 만들지 않는다.
4. 각 parent area가 자식의 visual footprint를 포함하는지, sibling caption이 겹치지 않는지, relationships의 ID/source/target/label과 Resource identity/value가 기준 snapshot과 같은지 테스트로 고정한다.
