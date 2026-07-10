---
pattern_id: multi-az-rds
provider: aws
workload: relational-database
runtime: rds
availability: multi-az
terraform_ready: true
reviewed_at: 2026-07-10
---

# Private Multi-AZ RDS 패턴

관계형 데이터베이스를 두 개 이상의 AZ에 걸친 private DB subnet group에 배치하고 RDS Multi-AZ failover, 암호화, backup, secret 관리, monitoring을 적용하는 운영 패턴이다.

## 적용 조건

- 사용자, 주문, 게시글 등 관계형 데이터와 transaction/SQL query가 필요하다.
- AZ 장애 또는 계획된 maintenance 시 자동 failover가 필요하다.
- database를 인터넷에 공개하지 않고 application tier에서만 접근해야 한다.
- RPO/RTO, backup retention, maintenance window를 정의할 수 있다.

database 필요 없음 요구에는 적용하지 않는다. 단순 key-value/event workload는 DynamoDB가 더 적합할 수 있다. Multi-AZ standby를 read scaling 용도로 사용하지 않는다.

## 필수 리소스

| SketchCatch ResourceType | Terraform resource | 역할 |
| --- | --- | --- |
| `VPC` | `aws_vpc` | database network boundary |
| `SUBNET` | `aws_subnet` | 서로 다른 AZ의 private DB subnet |
| `DB_SUBNET_GROUP` | `aws_db_subnet_group` | RDS가 사용할 multi-AZ subnet 집합 |
| `SECURITY_GROUP` | `aws_security_group` | application SG에서 DB port만 허용 |
| `RDS` | `aws_db_instance` | Multi-AZ relational database |
| `SECRETS_MANAGER_SECRET` | `aws_secretsmanager_secret` | credential lifecycle/rotation 경계 |
| `CLOUDWATCH_METRIC_ALARM` | `aws_cloudwatch_metric_alarm` | storage, CPU, connections, failover 이상 감지 |

운영 권장은 `KMS_KEY`, `CLOUDWATCH_LOG_GROUP`, `RDS_READ_REPLICA`(read scaling 별도 목적), RDS Proxy(현재 SketchCatch ResourceType 미지원 시 config/finding 처리)다.

## 금지 조건

- `publicly_accessible = true`이거나 public subnet에 DB subnet group을 구성한다.
- 운영/99.9% 요구인데 `multi_az = false` 또는 DB subnet이 한 AZ뿐이다.
- database password를 Terraform 코드, variable default, output, diagram label에 평문으로 넣는다.
- DB security group이 `0.0.0.0/0`에서 database port를 허용한다.
- deletion protection, backup retention, storage encryption 없이 운영 DB를 생성한다.
- Multi-AZ standby를 read replica로 그리거나 application read traffic을 직접 연결한다.
- 사용자 database 없음 선택을 이전 대화의 database 요구보다 우선 적용하지 못해 RDS를 남긴다.

## 리소스 연결 순서

```text
Application Security Group
  -> DB Security Group ingress
  -> RDS endpoint
  -> Multi-AZ primary/standby managed by RDS

Private DB subnet A + Private DB subnet B
  -> DB Subnet Group
  -> RDS

Secrets Manager -> application credential retrieval
CloudWatch -> RDS metrics/logs/alarms
```

standby는 독립 `RDS` 노드나 `RDS_READ_REPLICA`로 만들지 않는다. `aws_db_instance.multi_az = true` 내부의 관리형 standby로 표현한다.

## 권장 수량

| 항목 | 기본값 |
| --- | --- |
| AZ | 2 이상 |
| private DB subnet | AZ당 1개 이상 |
| DB subnet group | database network 경계당 1개 |
| Multi-AZ DB instance | writer endpoint 1개 + AWS 관리 standby 1개 |
| Secrets Manager secret | credential set당 1개 |
| Read replica | read scaling 요구가 있을 때 별도 1개 이상 |
| alarms | CPU, free storage, connections, replica lag/availability 요구별 |

MySQL/PostgreSQL의 세 AZ writer + 두 readable standby가 필요하면 `RDS_CLUSTER`/`RDS_CLUSTER_INSTANCE` 기반 Multi-AZ DB cluster 또는 Aurora 패턴을 별도로 선택한다.

## 프라이빗/퍼블릭 서브넷 배치

RDS와 DB subnet group은 route가 인터넷 gateway로 직접 향하지 않는 private DB subnet에 둔다. application subnet과 DB subnet은 분리할 수 있으며, DB security group ingress는 application security group을 source로 database port만 허용한다. NAT Gateway는 RDS inbound를 위해 필요하지 않다.

## Terraform 필수 파라미터

| 리소스 | 필수 파라미터/검증 |
| --- | --- |
| DB subnet group | 서로 다른 AZ의 private subnet ID 2개 이상 |
| RDS engine | engine/version, instance class, parameter/option group 호환성 |
| availability | `multi_az = true`, `availability_zone` 고정과 충돌하지 않음 |
| network | DB subnet group, DB SG, `publicly_accessible = false`, port |
| storage | `storage_encrypted = true`, KMS key, allocated/max storage, storage type/IOPS |
| credentials | managed master user password 또는 secret 참조, sensitive output 금지 |
| protection | `deletion_protection = true`, `skip_final_snapshot = false`, unique final snapshot identifier |
| backup/maintenance | retention, backup window, maintenance window, copy tags to snapshot, auto minor upgrade 정책 |
| observability | performance insights, enhanced monitoring role/interval, log exports, alarms |

## 배포 전 검증 조건

- Terraform 검사와 plan이 성공한다.
- DB subnet group에 서로 다른 AZ의 private subnet이 최소 2개 있다.
- RDS가 `multi_az = true`, `publicly_accessible = false`, storage encryption 상태다.
- DB SG ingress는 application SG와 정확한 DB port로 제한된다.
- password/connection string이 plan, state 외부 로그, output에 평문 노출되지 않는다.
- backup retention, final snapshot, deletion protection이 환경 정책과 맞는다.
- engine version과 parameter/option group이 호환된다.
- free storage, CPU, connections, failover event alarm이 구성된다.
- 강제 reboot with failover 테스트에서 application이 같은 DNS endpoint로 재연결한다.
- RTO가 일반적인 failover 시간과 application DNS/connection retry 설정을 고려한다.
- read scaling 요구는 Multi-AZ standby가 아닌 read replica/cluster endpoint로 별도 처리한다.

## 잘못된 구조 예시

```text
Public subnet -> RDS(publicly_accessible=true)
DB security group: 0.0.0.0/0:5432

RDS primary -> RDS_READ_REPLICA labelled "Multi-AZ standby"
```

Multi-AZ standby는 RDS가 관리하며 read endpoint가 아니다. 올바른 구조는 private DB subnet group과 `multi_az = true`인 하나의 RDS resource, 제한된 application SG 연결이다.

## 근거

- [AWS: Multi-AZ DB instance deployments](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html)
- [AWS: RDS Multi-AZ failover](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.Failover.html)
- [AWS Prescriptive Guidance: RDS DR strategies](https://docs.aws.amazon.com/prescriptive-guidance/latest/dr-standard-edition-amazon-rds/sites-strategies.html)
- [AWS Samples: RDS Proxy IaC Terraform](https://github.com/aws-samples/rds-proxy-iac-terraform)
