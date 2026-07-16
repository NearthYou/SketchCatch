---
pattern_id: github-cicd-codedeploy
provider: aws
workload: deployment-pipeline
source: github
deployment: codedeploy
terraform_ready: true
reviewed_at: 2026-07-10
---

# GitHub + CodePipeline + CodeBuild + CodeDeploy 패턴

GitHub branch 변경을 AWS CodeConnections(CodeStar Connection)으로 받아 CodePipeline이 source, build, deploy 단계를 조정하고 CodeDeploy가 EC2 또는 ECS 대상에 배포하는 패턴이다.

## 적용 조건

- 사용자가 GitHub branch에서 AWS runtime으로 자동 배포하기를 원한다.
- CodeStar Connection, CodePipeline, CodeBuild Project, CodeDeploy App, CodeDeploy Deployment Group을 명시했다.
- build artifact와 배포 revision을 추적하고 단계별 role/승인을 관리해야 한다.
- EC2/ASG 또는 ECS blue/green처럼 CodeDeploy가 지원하는 runtime이 존재한다.

정적 SPA만 S3에 동기화하는 단순 pipeline이나 Lambda deploy에는 CodeDeploy가 항상 필요한 것은 아니다. 사용자가 명시하지 않았고 deployment target이 없다면 더 단순한 패턴을 선택한다.

## 필수 리소스

| SketchCatch ResourceType | Terraform resource | 역할 |
| --- | --- | --- |
| `CODESTAR_CONNECTION` | `aws_codestarconnections_connection` | GitHub repository 연결 |
| `CODEPIPELINE` | `aws_codepipeline` | source/build/deploy stage orchestration |
| `CODEBUILD_PROJECT` | `aws_codebuild_project` | build, test, artifact 생성 |
| `CODEDEPLOY_APP` | `aws_codedeploy_app` | deployment application 경계 |
| `CODEDEPLOY_DEPLOYMENT_GROUP` | `aws_codedeploy_deployment_group` | 대상 fleet, strategy, rollback 정의 |
| `S3` | `aws_s3_bucket` | encrypted artifact store |
| `IAM_ROLE` | `aws_iam_role` | pipeline/build/deploy service role 분리 |

EC2 target에는 `IAM_INSTANCE_PROFILE`과 CodeDeploy agent가 필요하다. ECS blue/green에는 ECS service, 두 target group, production/test listener가 필요하다. alarm/notification에는 `CLOUDWATCH_METRIC_ALARM`, `SNS_TOPIC`을 추가한다.

## 금지 조건

- GitHub personal access token 또는 장기 AWS access key를 repository secret에 저장해 source 연결을 대체한다.
- CodeStar Connection이 `PENDING`인데 pipeline을 완료로 처리한다.
- pipeline에 CodeBuild/CodeDeploy 리소스가 존재하지만 stage action으로 연결되지 않는다.
- artifact bucket이 public이거나 encryption/versioning이 없다.
- pipeline, build, deploy가 하나의 관리자 role을 공유한다.
- EC2 deployment group에 ASG/tag target, service role, `appspec.yml`, CodeDeploy agent가 없다.
- 운영 deploy가 승인, alarm, rollback 없이 즉시 진행된다.
- source branch가 사용자 요구와 다르다.

## 리소스 연결 순서

```text
GitHub owner/repository/branch
  -> CodeStar Connection
  -> CodePipeline Source action
  -> encrypted S3 source artifact
  -> CodeBuild Project
  -> encrypted S3 build artifact
  -> CodeDeploy action
  -> CodeDeploy App
  -> CodeDeploy Deployment Group
  -> EC2/ASG or ECS deployment target
```

CodePipeline source action의 `ConnectionArn`, `FullRepositoryId`, `BranchName`을 connection 및 사용자 요구와 일치시킨다. Deploy action의 application/deployment group 이름은 실제 CodeDeploy 리소스를 참조한다.

## 권장 수량

| 항목 | 기본값 |
| --- | --- |
| Connection | GitHub account/region 공유 가능, 최소 권한 단위 고려 |
| Pipeline | application + environment 배포 경계당 1개 |
| CodeBuild project | build/test 책임별 1개 이상 |
| Artifact bucket | region/pipeline 집합별 공유 가능, prefix와 KMS 권한 분리 |
| CodeDeploy app | deployment compute platform/app당 1개 |
| Deployment group | environment/strategy당 1개 |
| IAM role | Pipeline, Build, CodeDeploy 각각 분리 |

## 프라이빗/퍼블릭 서브넷 배치

CodeConnections, CodePipeline, CodeDeploy, S3는 subnet에 배치하지 않는 regional service다. CodeBuild는 기본적으로 VPC 밖에서 실행하며 private dependency 접근이 필요할 때만 VPC config를 사용한다. 실제 EC2/ECS deployment target은 해당 runtime 패턴의 private subnet 원칙을 따른다.

## Terraform 필수 파라미터

| 리소스 | 필수 파라미터/검증 |
| --- | --- |
| connection | provider type `GitHub`, connection status 수동 승인 절차 |
| pipeline artifact store | S3 location, KMS encryption key, pipeline role permissions |
| source action | category `Source`, provider `CodeStarSourceConnection`, connection ARN, repository, branch, output artifact |
| build action/project | source/artifact type `CODEPIPELINE`, pinned image, non-privileged 기본, buildspec, logs, timeout, scoped role |
| deploy action | provider `CodeDeploy` 또는 ECS blue/green provider, input artifact, application/deployment group references |
| CodeDeploy app | EC2/On-Premises 또는 ECS compute platform 정확히 지정 |
| deployment group | service role, target ASG/tag 또는 ECS service, deployment config, auto rollback, alarm, load balancer info |
| artifact S3 | Block Public Access, versioning, SSE-KMS/SSE-S3, lifecycle, access logging 정책 |

Terraform 인프라 배포 pipeline이라면 `plan` artifact와 명시적 approval 없이 `apply`하지 않는다. 애플리케이션 배포에서도 production stage에 필요한 승인 정책을 적용한다.

## 배포 전 검증 조건

- Connection 상태가 `AVAILABLE`이고 정확한 GitHub repository/branch 이벤트를 수신한다.
- 모든 CodePipeline action의 input/output artifact 이름이 연결된다.
- CodeBuild가 test/build를 수행하고 실패 시 deploy stage가 실행되지 않는다.
- artifact bucket의 public access 차단, encryption, versioning, lifecycle이 확인된다.
- role trust principal과 policy가 각 서비스/리소스 범위로 제한된다.
- EC2 배포에는 agent, instance profile, ASG/tag target, `appspec.yml`과 lifecycle script가 있다.
- ECS blue/green 배포에는 두 target group과 listener traffic routing이 있다.
- production deploy의 alarm/rollback/approval이 운영 정책에 맞는다.
- 실패 revision에서 이전 정상 revision으로 rollback하는 테스트가 통과한다.
- source branch와 사용자가 명시한 `main`, `dev` 등의 branch가 일치한다.

## 잘못된 구조 예시

```text
CodeStar Connection    CodePipeline    CodeBuild    CodeDeploy App
     (four disconnected icons; no artifacts or actions)

Deployment Group(empty) -> no EC2/ASG/ECS target
```

CI/CD 리소스는 단순히 나열하면 동작하지 않는다. source/build/deploy action, artifact, application, deployment group, runtime target이 하나의 흐름으로 연결되어야 한다.

## 근거

- [AWS CodePipeline: CodeDeploy action reference](https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodeDeploy.html)
- [AWS Samples: CodePipeline Terraform CI/CD](https://github.com/aws-samples/aws-codepipeline-terraform-cicd-samples)
- [AWS Samples: GitHub and Terraform Web Application Deployment](https://github.com/aws-samples/use-github-and-terraform-to-deploy-web-applications)
- [AWS Prescriptive Guidance: Terraform AWS Provider Best Practices](https://docs.aws.amazon.com/prescriptive-guidance/latest/terraform-aws-provider-best-practices/introduction.html)
