---
pattern_id: alb-asg-ec2
provider: aws
workload: dynamic-web-application
runtime: ec2
availability: multi-az
terraform_ready: true
reviewed_at: 2026-07-10
---

# ALB + Auto Scaling Group + EC2 패턴

인터넷 요청을 Application Load Balancer(ALB)가 받고, private subnet의 Auto Scaling Group(ASG)이 관리하는 EC2 fleet으로 전달하는 운영형 동적 웹 애플리케이션 패턴이다.

## 적용 조건

- 사용자가 EC2, 직접 서버 운영, AMI, agent 기반 배포 또는 OS 수준 제어를 요구한다.
- HTTP/HTTPS 트래픽을 여러 인스턴스로 분산해야 한다.
- 트래픽 변화에 따라 EC2 수량을 자동 조절해야 한다.
- 99.9% 이상의 가용성을 위해 최소 두 Availability Zone(AZ)을 사용한다.
- 사용자가 `EC2 3대`처럼 수량을 명시하면 이를 ASG `desired_capacity`로 해석한다.

서버리스, ECS Fargate 또는 EKS를 명시한 요구에는 이 패턴을 적용하지 않는다.

## 필수 리소스

| SketchCatch ResourceType | Terraform resource | 역할 |
| --- | --- | --- |
| `VPC` | `aws_vpc` | 네트워크 경계 |
| `SUBNET` | `aws_subnet` | 2개 이상의 public ALB subnet과 2개 이상의 private app subnet |
| `INTERNET_GATEWAY` | `aws_internet_gateway` | internet-facing ALB 경로 |
| `ROUTE_TABLE`, `ROUTE_TABLE_ASSOCIATION` | `aws_route_table`, `aws_route_table_association` | public/private route 분리 |
| `SECURITY_GROUP` | `aws_security_group` | ALB와 EC2 ingress를 역할별로 제한 |
| `LOAD_BALANCER` | `aws_lb` | HTTP/HTTPS 진입점 |
| `LOAD_BALANCER_LISTENER` | `aws_lb_listener` | TLS 종료 및 target group 전달 |
| `LOAD_BALANCER_TARGET_GROUP` | `aws_lb_target_group` | EC2 health check와 routing 대상 |
| `LAUNCH_TEMPLATE` | `aws_launch_template` | AMI, instance type, IAM profile, user data 정의 |
| `AUTO_SCALING_GROUP` | `aws_autoscaling_group` | EC2 생성, 교체, 수량 유지 및 target group 등록 |
| `EC2` | ASG가 생성하는 EC2의 논리 표현 | 다이어그램에서 사용자 요구 수량과 AZ 분산을 가시화 |

운영 권장 리소스는 `IAM_ROLE`, `IAM_INSTANCE_PROFILE`, `CLOUDWATCH_LOG_GROUP`, `CLOUDWATCH_METRIC_ALARM`, `ACM_CERTIFICATE`, `NAT_GATEWAY` 또는 필요한 `VPC_ENDPOINT`다.

## 금지 조건

- 운영 구조인데 app subnet 또는 EC2가 한 AZ에만 존재한다.
- EC2에 public IP를 부여하거나 EC2 security group이 인터넷의 애플리케이션 포트를 직접 허용한다.
- ALB, listener, target group, ASG가 각각 존재하지만 연결되지 않는다.
- ASG fleet과 별도의 `aws_instance`를 같은 서버 수량으로 중복 생성한다.
- ASG를 사용하면서 개별 `aws_lb_target_group_attachment`로 ephemeral instance ID를 고정한다.
- health check 경로가 애플리케이션에서 2xx/3xx를 반환하지 않는다.
- 사용자가 파일 업로드 없음이라고 했는데 upload S3 bucket을 자동 추가한다.

## 리소스 연결 순서

```text
Internet
  -> internet-facing ALB (public subnet A/B)
  -> HTTPS listener
  -> target group
  -> Auto Scaling Group
  -> Launch Template
  -> EC2 fleet (private app subnet A/B)
  -> application dependencies
```

ASG의 `target_group_arns`에 target group ARN을 연결한다. 다이어그램의 EC2 노드는 fleet의 논리적 인스턴스이며, Terraform에서는 ASG와 Launch Template이 실제 인스턴스를 관리한다.

## 권장 수량

| 항목 | 기본값 | 사용자 수량 명시 시 |
| --- | --- | --- |
| AZ | 2 | 2 이상 유지 |
| public ALB subnet | AZ당 1개 | AZ 수와 동일 |
| private app subnet | AZ당 1개 | AZ 수와 동일 |
| ALB | 1개 | 일반적으로 1개 |
| ASG | 동일 runtime tier당 1개 | tier가 분리될 때만 추가 |
| EC2 desired | 2개 | 명시 수량 사용, 예: 3 |
| EC2 min/max | 2/4 | `min <= desired <= max`, 예: 2/3/6 |
| NAT Gateway | AZ당 1개 권장 | 비용 우선이면 1개와 AZ 장애 위험을 명시 |

EC2 3대를 private subnet 2개에 배치할 때 한 subnet에 2대, 다른 subnet에 1대가 될 수 있다. ASG의 `vpc_zone_identifier`에 두 subnet을 모두 넣고 AZ 재조정을 허용한다.

## 프라이빗/퍼블릭 서브넷 배치

| 배치 | 리소스 |
| --- | --- |
| public subnet A/B | internet-facing ALB, NAT Gateway |
| private app subnet A/B | ASG가 생성하는 EC2 |
| VPC 외부 regional/global | Route 53, ACM, CloudWatch, S3 artifact |

ALB security group은 HTTPS(443)를 허용하고, EC2 security group은 **ALB security group을 source로 한 애플리케이션 포트만** 허용한다. SSH 22번 public ingress 대신 SSM Session Manager를 사용한다.

## Terraform 필수 파라미터

| 리소스 | 필수 파라미터/검증 |
| --- | --- |
| `aws_lb` | `load_balancer_type = "application"`, 서로 다른 AZ의 `subnets`, `security_groups`, 운영이면 `enable_deletion_protection` 검토 |
| `aws_lb_listener` | HTTPS면 `port = 443`, `protocol = "HTTPS"`, `certificate_arn`, target group forward action |
| `aws_lb_target_group` | `vpc_id`, application `port/protocol`, 유효한 `health_check.path`, matcher |
| `aws_launch_template` | `image_id`, `instance_type`, `vpc_security_group_ids`, IAM instance profile, IMDSv2 `http_tokens = "required"`, 암호화 EBS, `user_data` |
| `aws_autoscaling_group` | 두 private subnet의 `vpc_zone_identifier`, `min_size`, `desired_capacity`, `max_size`, `target_group_arns`, `health_check_type = "ELB"`, grace period, Launch Template version |
| scaling policy | CPU 또는 `ALBRequestCountPerTarget` target tracking, cooldown/warmup |

provider/backend는 root module에 두고, AWS provider와 module 버전을 고정한다. state는 환경별 remote backend에 저장한다.

## 배포 전 검증 조건

- `terraform fmt -check`, `terraform validate`, `tflint`, 보안 스캔, `terraform plan`이 성공한다.
- ALB와 ASG가 동일한 두 AZ/subnet 범위를 사용한다.
- target group ARN이 ASG에 연결되고, listener default action이 같은 target group을 가리킨다.
- `min_size <= desired_capacity <= max_size`이며 사용자가 요구한 EC2 수량과 일치한다.
- Terraform plan에 독립 `aws_instance`가 ASG 수량만큼 중복 생성되지 않는다.
- EC2 public IP가 비활성화되고, EC2 ingress source가 ALB security group이다.
- health check 성공 후에만 인스턴스가 traffic을 받는다.
- 한 AZ의 target을 제거하는 장애 시나리오에서 다른 AZ target이 traffic을 처리한다.
- TLS 요구 시 ACM 인증서 검증과 HTTP→HTTPS redirect가 구성된다.
- 로그, alarm, backup/AMI, rollback 또는 CodeDeploy 전략이 운영 요구와 맞는다.

## 잘못된 구조 예시

```text
ALB      ASG(empty)
 |          (no target group relation)
EC2-1, EC2-2, EC2-3 (all in one public subnet)
```

이 구조는 ASG가 EC2를 관리하지 않고 ALB도 fleet과 연결되지 않는다. 올바른 구조는 `ALB -> Listener -> Target Group -> ASG -> Launch Template -> private EC2 fleet`이다.

## 근거

- [AWS: Load balancer를 Auto Scaling Group과 사용](https://docs.aws.amazon.com/autoscaling/ec2/userguide/autoscaling-load-balancer.html)
- [AWS: scaled and load-balanced application tutorial](https://docs.aws.amazon.com/autoscaling/ec2/userguide/tutorial-ec2-auto-scaling-load-balancer.html)
- [AWS Samples: Auto Scaling EC2 with Terraform](https://github.com/aws-samples/amazon-autoscaling-mac1metal-ec2-with-terraform)
