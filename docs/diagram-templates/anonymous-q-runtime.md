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

실제 Q 검증은 비용 통제 하에 최소 호출로 수행한다. 새 application, index, connector 또는 사용자 구독을 자동 생성하지 않는다.
