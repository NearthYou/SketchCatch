---
pattern_id: ecs-fargate
provider: aws
workload: containerized-web-application
runtime: ecs-fargate
availability: multi-az
terraform_ready: true
reviewed_at: 2026-07-10
---

# ALB + ECS Fargate 패턴

internet-facing ALB가 private subnet에서 실행되는 ECS Fargate service로 트래픽을 전달하는 컨테이너 웹 애플리케이션 패턴이다. EC2 host나 Auto Scaling Group을 직접 운영하지 않는다.

## 적용 조건

- 사용자가 컨테이너, ECS 또는 Fargate를 요구한다.
- 서버 host 운영 부담을 줄이면서 task CPU/memory를 명시적으로 제어해야 한다.
- HTTP/HTTPS service를 여러 AZ의 task에 분산해야 한다.
- immutable container image와 rolling 또는 blue/green deployment를 사용할 수 있다.

OS/host agent, privileged workload, 특수 accelerator 또는 EC2 host 제어가 필수면 ECS on EC2/EKS/EC2 패턴을 검토한다.

## 필수 리소스

| SketchCatch ResourceType | Terraform resource | 역할 |
| --- | --- | --- |
| `VPC`, `SUBNET` | `aws_vpc`, `aws_subnet` | public ALB subnet과 private task subnet |
| `INTERNET_GATEWAY`, route resources | IGW/route table/association | ALB ingress와 private egress 경로 |
| `SECURITY_GROUP` | `aws_security_group` | ALB와 task traffic 분리 |
| `LOAD_BALANCER` | `aws_lb` | public HTTP/HTTPS entry |
| `LOAD_BALANCER_LISTENER` | `aws_lb_listener` | TLS 종료와 routing |
| `LOAD_BALANCER_TARGET_GROUP` | `aws_lb_target_group` | `target_type = "ip"`인 Fargate target |
| `ECR_REPOSITORY` | `aws_ecr_repository` | container image 저장소 |
| `ECS_CLUSTER` | `aws_ecs_cluster` | service 실행 경계 |
| `ECS_TASK_DEFINITION` | `aws_ecs_task_definition` | image, port, CPU/memory, role, logs |
| `ECS_SERVICE` | `aws_ecs_service` | task 수량 유지, subnet 분산, target group 등록 |
| `IAM_ROLE` | `aws_iam_role` | task execution role과 application task role |
| `CLOUDWATCH_LOG_GROUP` | `aws_cloudwatch_log_group` | container log와 retention |

private task의 outbound에는 AZ별 `NAT_GATEWAY` 또는 ECR API/DKR, S3, CloudWatch Logs, Secrets Manager용 `VPC_ENDPOINT` 조합이 필요하다. HTTPS에는 `ACM_CERTIFICATE`를 사용한다.

## 금지 조건

- Fargate 요구에 EC2, Launch Template, ASG를 runtime으로 추가한다.
- Fargate task에 public IP를 부여하고 인터넷에서 container port를 직접 연다.
- target group이 `instance` target type이거나 ECS service load balancer block과 연결되지 않는다.
- task definition이 `awsvpc`가 아니거나 Fargate 호환 CPU/memory 조합이 아니다.
- `latest` 같은 mutable tag만 사용해 배포 revision을 추적할 수 없다.
- execution role과 application task role을 하나의 과도한 권한 role로 합친다.
- desired count 1을 운영 고가용성 구조로 표현한다.
- ECS scaling을 EC2 전용 `aws_autoscaling_policy`로 잘못 생성한다.

## 리소스 연결 순서

```text
Internet
  -> ALB (public subnet A/B)
  -> HTTPS Listener
  -> Target Group (target_type=ip)
  -> ECS Service
  -> ECS Task Definition
  -> Fargate tasks (private subnet A/B)
  -> application dependencies

ECR -> Task Definition image
Execution Role -> image pull/log/secret bootstrap
Task Role -> application AWS API permissions
```

ECS service의 `load_balancer.target_group_arn`, `container_name`, `container_port`는 task definition의 container definition과 일치해야 한다.

## 권장 수량

| 항목 | 운영 기본값 |
| --- | --- |
| AZ | 2 이상 |
| public ALB subnet | AZ당 1개 |
| private task subnet | AZ당 1개 |
| ECS cluster | 환경/운영 경계당 1개 |
| ECS service | 독립 배포 가능한 service당 1개 |
| desired task | 2 이상, 사용자 요구가 있으면 해당 수량 |
| target group | service/port별 1개, blue/green이면 2개 |
| execution role/task role | 역할별 각각 1개 |

## 프라이빗/퍼블릭 서브넷 배치

| 배치 | 리소스 |
| --- | --- |
| public subnet A/B | internet-facing ALB, NAT Gateway |
| private app subnet A/B | ECS Fargate task ENI |
| VPC 외부 regional | ECS control plane, ECR, CloudWatch, Secrets Manager |

task security group은 ALB security group에서 오는 container port만 ingress로 허용한다. `assign_public_ip = false`를 기본으로 한다.

## Terraform 필수 파라미터

| 리소스 | 필수 파라미터/검증 |
| --- | --- |
| target group | `target_type = "ip"`, application port/protocol, VPC, valid health check |
| task definition | `requires_compatibilities = ["FARGATE"]`, `network_mode = "awsvpc"`, valid `cpu`/`memory`, execution/task role ARN, immutable image digest/tag, port mapping, awslogs |
| ECS service | `launch_type = "FARGATE"` 또는 Fargate capacity provider, `desired_count >= 2`, private subnet IDs, task SG, `assign_public_ip = false`, load balancer block |
| deployment | circuit breaker/rollback 또는 CodeDeploy blue/green, health check grace period, minimum/maximum healthy percent |
| ECR | scan on push, immutable tags 권장, lifecycle policy |
| logs | region, log group, stream prefix, retention, 필요 시 KMS |

ECS service auto scaling을 요구하면 `aws_appautoscaling_target`과 `aws_appautoscaling_policy` 지원 여부를 Terraform generator에서 확인한다. SketchCatch가 이를 생성하지 못하는 상태에서는 EC2용 `AUTO_SCALING_POLICY`로 대체하지 말고 배포 불가 finding을 반환한다.

## 배포 전 검증 조건

- Terraform 검사와 plan이 성공한다.
- ALB와 task subnet이 최소 두 AZ에 걸쳐 있다.
- target group type이 `ip`이고 ECS service load balancer 설정과 연결된다.
- task definition container name/port와 ECS service 값이 정확히 일치한다.
- task가 private subnet에서 ECR image, logs, secret에 접근할 egress 경로가 있다.
- image scan이 critical 취약점을 허용하지 않고 image digest/revision을 추적할 수 있다.
- desired task 2개 이상이 서로 다른 AZ에서 healthy 상태가 된다.
- deployment 실패 시 circuit breaker 또는 CodeDeploy rollback이 동작한다.
- execution role과 task role이 최소 권한이며 secret 평문이 task definition에 없다.
- ALB health endpoint와 graceful shutdown/deregistration delay가 애플리케이션 동작과 맞는다.

## 잘못된 구조 예시

```text
ALB -> target group(target_type=instance)

ECS Service(public subnet, public IP=true)    ECS Task Definition(disconnected)
EC2 + ASG added as Fargate hosts
```

Fargate task는 EC2 host가 필요 없고 target group에 IP target으로 등록되어야 한다. 올바른 구조는 `ALB -> target group(ip) -> ECS service -> Fargate task definition`이다.

## 근거

- [AWS Guidance: Containerized and Scalable Web Application](https://aws.amazon.com/solutions/guidance/building-a-containerized-and-scalable-web-application-on-aws/)
- [AWS Samples: Amazon ECS Fullstack App Terraform](https://github.com/aws-samples/amazon-ecs-fullstack-app-terraform)
- [AWS Fargate shared responsibility](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-fargate.html)
