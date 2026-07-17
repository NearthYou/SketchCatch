# Module Catalog 실제 Board 캡처 설계

## 문제

현재 Module 카드는 Resource 좌표를 `220 × 90` SVG로 축소하고 Resource 이름의 첫 글자만
표시한다. 이 그림은 실제 Architecture Board의 아이콘, Area, 이름, 연결을 보여주지 못한다.
상세 영역도 Terraform 타입, 내부 지식 버전, 비어 있는 입력·출력처럼 선택에 도움이 되지
않는 정보를 여러 섹션으로 노출한다.

## 결정

각 Module 자체를 실제 `DiagramEditor`로 렌더링한 Board 캡처 10장을 정적 WebP asset으로
제공한다. 대표 Template 전체 캡처를 재사용하지 않는다. 대표 Template에는 선택한 Module에
포함되지 않은 Resource가 있어 잘못된 구성을 보여줄 수 있기 때문이다.

Module 카드는 접었다 펼치는 개발자용 상세 화면 대신 다음 정보를 한 화면에 표시한다.

1. 실제 Module Board의 16:9 캡처
2. 사용자가 용도를 바로 알 수 있는 제목
3. 무엇을 추가하는지 설명하는 한 문장
4. `AWS · Resource 8개 · 연결 3개` 형식의 요약
5. 공용 Catalog 표시명을 사용한 주요 구성 한 줄
6. `보드에 추가` 버튼

익숙한 기술명인 AWS, VPC, RDS, ECS, S3, API, Auto Scaling은 유지한다. 문장만 자연스러운
한국어로 바꾸며 기술 용어를 억지로 번역하지 않는다.

## 사용자용 문구

| Module | 제목 | 한 줄 설명 |
| --- | --- | --- |
| `container-image-delivery` | Container Image 준비 | ECR 저장소와 ECS Task Definition, 실행 권한, 로그 설정을 함께 추가합니다. |
| `container-runtime` | ECS Container 실행 | ECS Cluster, Task Definition, Service를 함께 추가합니다. |
| `identity-access-boundary` | IAM 사용자 권한 | IAM 사용자와 Group을 만들고 사용자를 Group에 연결합니다. |
| `load-balanced-compute` | Auto Scaling 웹 서버 | Classic Load Balancer와 Auto Scaling Group을 함께 추가합니다. |
| `network-foundation` | VPC 기본 네트워크 | VPC에 Public·App·DB Subnet과 Internet/NAT 경로를 구성합니다. |
| `operations-monitoring` | Auto Scaling 모니터링 | CPU 경보가 Auto Scaling 정책을 실행하도록 연결합니다. |
| `relational-data-layer` | RDS 데이터베이스 | RDS와 DB Subnet, Security Group을 함께 추가합니다. |
| `secure-object-storage` | S3 버전 관리 | S3 Bucket과 Versioning 설정을 함께 추가합니다. |
| `serverless-api` | Serverless API | API Gateway 요청을 Lambda 함수로 연결합니다. |
| `static-web-delivery` | Static Web 배포 | S3의 웹 파일을 CloudFront로 제공하고 공개 접근을 제한합니다. |

주요 구성 한 줄은 공용 Resource Catalog의 사용자용 표시명을 사용한다. 최대 세 종류까지
표시하고 나머지는 `외 N개`로 줄인다. 원본 Terraform 타입과 내부 Resource 이름은 노출하지
않는다.

## 구조

### 캡처용 Diagram

빈 Diagram에 기존 `materializeCuratedModulePattern()`을 적용해 실제 `보드에 추가` 결과와 같은
Node, Area, Edge를 만든다. `expandedAt`은 고정값을 사용해 같은 Module에서 항상 같은 Diagram과
hash가 나오게 한다.

### 캡처 경로와 asset

개발 환경 전용 `/dev/module-thumbnail?moduleId={id}` 경로가 캡처용 Diagram을
`DiagramEditor mode="viewer"`로 렌더링한다. 실제 Board root만 기존 Board 캡처 계약에 따라
`1280 × 720`, 배경 `#f8fafc`, WebP로 촬영한다.

파일 위치는 `apps/web/public/module-thumbnails/v1/{moduleId}.webp`로 고정한다. Manifest에는
Module ID, 캡처 계약 version, materialized Diagram의 SHA-256, asset 경로를 기록한다. Module
구성이 바뀌었는데 asset과 hash가 갱신되지 않으면 테스트가 실패해야 한다.

### 카드

기존 `ModuleCatalogTopology` SVG와 좌표 축소 자료구조를 제거한다. Project와 Template에서 쓰는
`BoardThumbnailImage`를 재사용해 동일한 16:9 비율, `contain`, 로딩 실패 fallback을 사용한다.

현재 10개 Module은 모두 AWS이고 입력값과 출력값이 없으며 같은 내부 지식 version을 공유한다.
따라서 Provider·입력값·출력값·버전을 각각 별도 섹션으로 노출하지 않는다. Provider는 요약의
`AWS`로만 표시하고 내부 version은 Manifest 검증에만 사용한다.

## 실패 처리

- asset이 없거나 깨지면 `BoardThumbnailImage`의 공통 실패 상태를 표시한다.
- Manifest에 없는 Module은 빈 캡처 상태를 표시하되 카드와 `보드에 추가` 동작은 유지한다.
- Resource 표시명을 찾지 못하면 Terraform 타입 대신 기존 Node label을 사용한다.
- 캡처 개발 경로는 production에서 `notFound()`로 차단한다.

## 검증

- 캡처용 Diagram과 빈 Board에 Module을 추가한 결과의 Resource·Area·Edge가 동일한지 검증한다.
- Manifest key와 현재 Module 10개의 ID가 정확히 일치하는지 검증한다.
- WebP asset 존재와 `RIFF/WEBP` header, 캡처 계약 version, Diagram hash를 검증한다.
- 카드가 `BoardThumbnailImage`를 사용하고 SVG 첫 글자 도식을 렌더링하지 않는지 검증한다.
- 사용자용 문구가 모든 Module을 포함하고 raw Terraform 타입·내부 version을 노출하지 않는지
  검증한다.
- 10개 캡처를 카드 크기와 큰 화면에서 육안 확인한다.
- 집중 회귀 테스트, lint, typecheck, production build를 실행한다.

## 제외 범위

- Project 또는 Template 캡처 계약 변경
- Module 구조나 Terraform 생성 로직 변경
- Module 입력·출력 모델 신규 도입
- 대표 Template 전체 이미지를 Module 이미지로 재사용
- Module 카드 밖의 Resource Catalog 재설계
