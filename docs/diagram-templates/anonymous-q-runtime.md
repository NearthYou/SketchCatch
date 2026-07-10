# Anonymous Q Architecture Runtime

## 역할 분리

Architecture Draft runtime은 다음 책임을 분리한다.

1. OpenAI normalizer 또는 deterministic normalizer가 프로젝트 질의와 질문 답변을 `ArchitectureIntentPlan`으로 변환한다.
2. backend가 정규화 결과에서 하나 이상의 검증된 `patternId`를 선택한다.
3. Anonymous Q Business가 각 패턴을 `pattern_id` equals filter로 별도 검색한다.
4. backend는 기대한 `documentId` citation이 있는 패턴만 승인한다.
5. backend canonical registry가 승인된 패턴과 검증된 수량·토폴로지를 조합해 `ArchitectureJson`을 만든다.

Q 응답의 자유 형식 리소스 배열, 좌표, edge, Terraform 값은 materialization 입력으로 사용하지 않는다. Q가 올바른 citation을 반환하지 않거나 backend validation을 통과하지 못하면 해당 결과를 폐기한다.

## 지원 패턴

- `alb-asg-ec2`
- `serverless-api`
- `spa-cloudfront-s3`
- `ecs-fargate`
- `github-cicd-codedeploy`
- `multi-az-rds`

복합 프로젝트는 패턴별로 검색한 뒤 shared network, IAM, storage, monitoring 리소스를 backend에서 중복 제거해 조합한다. 한 번의 OR filter 검색으로 여러 패턴을 동시에 가져오지 않는다.

여섯 패턴은 완성 다이어그램 종류를 제한하는 목록이 아니라 검증된 backbone이다. 현재 프로젝트 생성 페이지의 전체 선택지 답변을 runtime, frontend, data, traffic, availability, security, cost 신호로 해석하고, 자연어에서 명시한 지원 패널 리소스(EKS, SQS, DynamoDB, EventBridge, WAF 등)는 가장 가까운 backbone에 supplemental resource로 결합한다. 명시적으로 제외한 EC2나 ALB는 패턴 기본값보다 우선한다.

## 보안·비용 기준

1. 명시적 보안, 가용성, 리소스 요구사항은 비용 절감보다 우선한다.
2. public entry에서 SSL 필수이면 ACM certificate와 validation을 포함한다.
3. runtime에는 최소 권한 IAM role/policy와 bounded-retention CloudWatch logging을 포함한다.
4. RDS에는 Secrets Manager와 monitoring을 포함하고, storage는 암호화 가능한 deployment config를 사용한다.
5. customer-managed KMS와 자동 WAF는 enterprise budget 또는 명시 요구처럼 반복 비용을 정당화하는 신호가 있을 때만 추가한다.
6. low/normal budget에서는 명시되지 않은 고가 보안·중복 리소스를 자동 추가하지 않지만, 요구된 SSL·비공개 배치·비밀 관리는 제거하지 않는다.
7. cost와 99.99% availability가 충돌하면 구조를 조용히 약화하지 않고 비용 위험을 assumption으로 남긴다.

## 검증 기준

- 프로젝트 답변의 명시적 금지 조건이 추천 조건보다 우선한다.
- 선택된 모든 패턴은 기대한 Q citation을 가져야 한다.
- canonical 필수 리소스와 요청 수량이 모두 존재해야 한다.
- Serverless와 Fargate에는 EC2/AMI/EC2 capacity 리소스가 남지 않아야 한다.
- ALB/ASG/EC2는 EC2 수량과 private subnet 분산을 만족해야 한다.
- CI/CD는 source, pipeline, build, artifact, deploy 순서를 연결해야 한다.
- Multi-AZ RDS는 private subnet group, secret, alarm을 연결해야 한다.
- orphan node와 존재하지 않는 node를 참조하는 edge가 없어야 한다.

## 2026-07-10 검증 증거

- 실제 프로젝트 질문 형식 42개: 기대한 단일/복합 패턴 선택 42/42
- 대표 프로젝트 12개를 각각 두 번 materialization: canonical signature 일치 12/12
- 여섯 기본 패턴 family: 서로 다른 signature 6/6
- 실제 Anonymous Q 검증: 6개 프로젝트 profile, 패턴별 10 ChatSync, 전체 통과
- 실제 Q 결과: 기대 패턴/citation, 필수·금지 리소스, EC2 수량, orphan node 검증 전체 통과
- 페이지 실제 선택지 15개와 자연어를 함께 사용한 비정형 프로젝트 10개: 10/10 통과
- 비정형 프로젝트 실제 Anonymous Q 검증: 패턴별 18 ChatSync, Q-backed 10/10, 서로 다른 signature 10/10, orphan node 0
- 비정형 검증 범위: NLB EC2, event-driven Lambda/SQS/DynamoDB, ingress 없는 Fargate batch, Next.js SSR, Aurora, ECS CI/CD, EKS, 일반 쇼핑몰, 모바일 채팅, WAF 정적 사이트

실제 Q 검증은 비용 통제 하에 최소 호출로 수행한다. 새 application, index, connector 또는 사용자 구독을 자동 생성하지 않는다.
