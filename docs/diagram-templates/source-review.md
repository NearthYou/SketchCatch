# 패턴 지식 소스 검토 기록

## 검토 범위

| 소스 | 확인 범위 | 패턴 반영 방식 |
| --- | --- | --- |
| [AWS Terraform Best Practices](https://github.com/aws-samples/aws-terraform-best-practices) | 저장소 README 전체 지침 | 모듈 구조, provider/backend 경계, 버전 고정, naming, `for_each`, state 보호, fmt/validate/test 기준 |
| [Terraform AWS Provider Best Practices](https://docs.aws.amazon.com/ko_kr/prescriptive-guidance/latest/terraform-aws-provider-best-practices/terraform-aws-provider-best-practices.pdf) | 90쪽 문서의 보안, 원격 상태, 모듈, CI/CD, 테스트, 버전 관리 | S3 remote state, 환경 격리, OIDC, TFLint/Checkov, provider pinning, 배포 전 검증 |
| [aws-samples Terraform/HCL 검색](https://github.com/aws-samples?q=terraform&type=all&language=hcl&sort=) | GitHub Search API 결과 154개 전수 메타데이터 검토 | 패턴 후보 분류 후 대표 저장소의 README와 `.tf` 리소스/연결을 상세 검토 |
| [AWS Solutions Library](https://aws.amazon.com/ko/solutions/) | 솔루션 카탈로그와 여섯 패턴에 대응하는 공식 Guidance/서비스 문서 | 운영 조건, 가용성, 보안 경계, 서비스 연결의 공식 근거 보강 |

전체 GitHub 검색 결과의 이름, archive 여부, 갱신일은 [source-inventory.md](./source-inventory.md)에 고정했다. 검색 결과는 시간에 따라 바뀔 수 있으므로 `manifest.json`의 `reviewedAt` 이후 재수집 시 차이를 검토해야 한다.

## 소스 완전성 확인

- Prescriptive Guidance PDF는 총 90쪽이며, 2026-07-10에 전 페이지 text extraction(95,520자)을 확인했다. `TFLint`, `Checkov`, OIDC, S3 관련 지침이 추출 본문에 존재했다.
- GitHub Search API의 `total_count`와 수집 목록이 모두 154개로 일치했고, 각 저장소의 이름, URL, archive 여부, 갱신일을 인벤토리에 기록했다.
- AWS Solutions 한국어 landing page는 HTTP 200, 전체 link 117개를 확인했다. 당시 노출된 AWS Solutions 문서 카드 6개는 아래와 같으며, 여섯 기본 인프라 패턴에 직접 대응하지 않는 항목은 억지로 근거에 포함하지 않았다.

| AWS Solutions landing 노출 문서 | 패턴 직접 채택 여부 |
| --- | --- |
| [Accelerated Intelligent Document Processing on AWS](https://docs.aws.amazon.com/solutions/accelerated-intelligent-document-processing-on-aws/) | 미채택: 문서 처리 특화 solution |
| [Advanced Cloud Observability with Cloud Intelligence Dashboards on AWS](https://docs.aws.amazon.com/solutions/advanced-cloud-observability-with-cloud-intelligence-dashboards-on-aws/) | 미채택: 관측성 solution |
| [DeepRacer on AWS](https://docs.aws.amazon.com/solutions/deepracer-on-aws/) | 미채택: DeepRacer 특화 solution |
| [Distributed Load Testing on AWS](https://docs.aws.amazon.com/solutions/distributed-load-testing-on-aws/) | 보조 검증 후보: 부하 시험에 사용 가능하나 기본 topology 근거는 아님 |
| [Generative AI Deployments using Amazon SageMaker JumpStart](https://docs.aws.amazon.com/solutions/generative-ai-deployments-using-amazon-sagemaker-jumpstart/) | 미채택: 생성형 AI 배포 특화 solution |
| [Innovation Sandbox on AWS](https://docs.aws.amazon.com/solutions/innovation-sandbox-on-aws/) | 미채택: sandbox 계정 운영 solution |

landing page 카드만으로 부족한 ALB/ASG, serverless, static site, ECS, CI/CD, RDS 연결은 같은 AWS 공식 문서 체계의 Guidance와 서비스 문서로 교차 검증했다.

## 상세 검토한 대표 구현

| 패턴 | 대표 AWS Samples | 확인한 구현 요소 |
| --- | --- | --- |
| ALB + ASG + EC2 | [amazon-autoscaling-mac1metal-ec2-with-terraform](https://github.com/aws-samples/amazon-autoscaling-mac1metal-ec2-with-terraform) | Launch Template, Auto Scaling Group, scaling policy, IAM instance profile, security group |
| Serverless API | [building-serverless-applications-with-terraform](https://github.com/aws-samples/building-serverless-applications-with-terraform) | API Gateway resource/method/integration/deployment, Lambda, permission, IAM, SQS/S3 |
| SPA + CloudFront + S3 | [amazon-cloudfront-secure-static-site](https://github.com/aws-samples/amazon-cloudfront-secure-static-site) | private S3 origin, CloudFront, OAC, HTTPS, Route 53, security headers |
| ECS Fargate | [amazon-ecs-fullstack-app-terraform](https://github.com/aws-samples/amazon-ecs-fullstack-app-terraform) | public ALB, private subnets, ECS service/task, ECR, IAM, logs, CodePipeline/CodeDeploy |
| GitHub CI/CD + CodeDeploy | [aws-codepipeline-terraform-cicd-samples](https://github.com/aws-samples/aws-codepipeline-terraform-cicd-samples), [use-github-and-terraform-to-deploy-web-applications](https://github.com/aws-samples/use-github-and-terraform-to-deploy-web-applications) | artifact bucket, CodeBuild, CodePipeline, OIDC, 역할 분리, 배포 단계 |
| Multi-AZ RDS | [rds-proxy-iac-terraform](https://github.com/aws-samples/rds-proxy-iac-terraform), [amazon-rds-db2-terraform](https://github.com/aws-samples/amazon-rds-db2-terraform) | DB subnet 선택, security group, Secrets Manager, proxy/target 연결, 엔진 구성 |

Archive된 저장소는 서비스 연결 방식의 보조 증거로만 사용했고, 현재 운영 권고의 단독 근거로 사용하지 않았다.

## 공통 Terraform 기준

- root module에서 provider와 backend를 구성하고 재사용 child module에는 provider 설정을 넣지 않는다.
- provider와 module 버전을 허용 범위 안에서 고정하고, 업그레이드는 비운영 환경에서 검증한다.
- state는 암호화, 접근 제어, 버전 관리가 적용된 원격 backend에 환경별로 분리한다.
- 장기 AWS access key 대신 GitHub Actions OIDC 또는 AWS 서비스 역할의 임시 자격 증명을 사용한다.
- `terraform fmt -check`, `terraform validate`, `tflint`, 보안 스캔, `terraform plan`을 apply 전에 수행한다.
- 운영의 stateful resource에는 삭제 보호, 백업, 복구 검증을 적용한다.
- AWS Samples는 교육용 예시이므로 실제 배포 전에 가용성, 보안, 비용, quota를 별도로 검증한다.

## 공식 운영 근거

- [ALB를 Auto Scaling Group에 연결](https://docs.aws.amazon.com/autoscaling/ec2/userguide/autoscaling-load-balancer.html): ASG가 생성/종료한 인스턴스를 target group에 자동 등록/해제하고 ELB health check를 사용할 수 있다.
- [안전한 정적 웹사이트](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/getting-started-secure-static-website-cloudformation-template.html): S3를 private origin으로 두고 CloudFront OAC와 HTTPS를 사용한다.
- [API Gateway 시작하기](https://docs.aws.amazon.com/apigateway/latest/developerguide/getting-started.html): API Gateway가 Lambda 기반 serverless API의 진입점이 된다.
- [Containerized and Scalable Web Application Guidance](https://aws.amazon.com/solutions/guidance/building-a-containerized-and-scalable-web-application-on-aws/): ALB와 ECS Fargate를 여러 가용 영역에 배치한다.
- [CodeDeploy action reference](https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodeDeploy.html): CodePipeline의 배포 입력 artifact와 CodeDeploy application/deployment group 연결을 정의한다.
- [RDS Multi-AZ DB instance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html): 서로 다른 AZ의 동기식 standby와 자동 failover를 제공하며 read scaling 용도가 아니다.
