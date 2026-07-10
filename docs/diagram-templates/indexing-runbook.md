# Amazon Q Business 인덱싱 실행서

## 현재 확인 상태

2026-07-10 읽기 전용 확인 결과:

- Amazon Q Business application: `ACTIVE`
- index: `ACTIVE`
- index region: `ap-southeast-2`
- S3 data source: 없음
- 기존 SketchCatch S3 bucket region: `ap-northeast-2`
- 패턴 문서 Q Business 인덱싱: 미완료

Q Business S3 connector용 bucket은 index와 호환되는 region에 있어야 한다. 기존 서울 리전 bucket을 임의로 재사용하지 않고, 승인된 Deployment 작업에서 시드니 리전 전용 knowledge bucket과 crawler role/data source를 구성한다.

## 업로드 대상

S3에 업로드할 문서는 다음 여섯 파일뿐이다.

```text
documents/architecture-patterns/alb-asg-ec2.md
documents/architecture-patterns/serverless-api.md
documents/architecture-patterns/spa-cloudfront-s3.md
documents/architecture-patterns/ecs-fargate.md
documents/architecture-patterns/github-cicd-codedeploy.md
documents/architecture-patterns/multi-az-rds.md
```

`source-inventory.md`, `source-review.md`, `verify.mjs`는 검토 증거이며 기본 Q Business crawl 대상이 아니다.

## 사전 조건

- S3 bucket과 Q Business index가 호환되는 region에 있다.
- bucket은 Block Public Access, default encryption, versioning을 사용한다.
- Q Business data source role trust policy가 `qbusiness.amazonaws.com`을 허용한다.
- role은 대상 bucket/prefix의 `s3:ListBucket`, `s3:GetObject`와 필요한 KMS decrypt 권한만 가진다.
- S3 data source include prefix가 `documents/`로 제한된다.
- metadata sidecar를 사용할 경우 connector가 custom metadata를 지원하고 `metadataFilesPrefix`가 `metadata/`로 설정된다.
- 새 S3 connector를 사용하면 custom metadata가 지원되지 않으므로 Markdown 본문만 crawl한다.

## 승인 후 실행 순서

1. `node docs/diagram-templates/verify.mjs`를 실행한다.
2. AWS 변경 plan에서 bucket, bucket policy, crawler role, Q Business data source를 검토한다.
3. 승인된 배포 경로로 infrastructure를 적용한다.
4. `documents/`를 지정된 S3 prefix에 업로드한다.
5. metadata 지원 connector일 때만 `metadata/`를 평행 경로로 업로드한다.
6. Q Business data source sync job을 시작한다.
7. sync job이 `SUCCEEDED`인지 확인한다.
8. 아래 대표 질의로 검색 결과와 citation을 검증한다.

## 대표 검색 검증

| 질의 | 기대 패턴/핵심 결과 |
| --- | --- |
| `EC2 3대를 private subnet 2개에 배치하고 ALB와 ASG로 운영하고 싶어` | `alb-asg-ec2`, desired=3, ALB→TG→ASG, public EC2 금지 |
| `EC2 없이 API Gateway와 Lambda로 API를 만들어줘` | `serverless-api`, API method/integration/permission/stage |
| `React SPA를 private S3와 CloudFront로 배포해줘` | `spa-cloudfront-s3`, OAC, public S3 금지, HTTPS |
| `Fargate task 2개를 ALB 뒤 private subnet에 배치해줘` | `ecs-fargate`, target type ip, public task 금지 |
| `GitHub main에서 CodePipeline, CodeBuild, CodeDeploy로 EC2에 배포해줘` | `github-cicd-codedeploy`, 연결된 source/build/deploy와 artifact |
| `운영 DB를 private Multi-AZ RDS로 구성해줘` | `multi-az-rds`, DB subnet 2 AZ, public DB 금지, backup/encryption |

## 완료 판정 명령 예시

아래 명령은 실제 ID를 환경 변수로 주입하고 읽기 전용 확인에 사용한다.

```powershell
aws s3api list-objects-v2 `
  --bucket $env:Q_KNOWLEDGE_BUCKET `
  --prefix $env:Q_KNOWLEDGE_PREFIX/documents/architecture-patterns/ `
  --profile sketchcatch-dev `
  --region ap-southeast-2

aws qbusiness list-data-sources `
  --application-id $env:AMAZON_Q_APPLICATION_ID `
  --index-id $env:AMAZON_Q_INDEX_ID `
  --profile sketchcatch-dev `
  --region ap-southeast-2

aws qbusiness list-data-source-sync-jobs `
  --application-id $env:AMAZON_Q_APPLICATION_ID `
  --index-id $env:AMAZON_Q_INDEX_ID `
  --data-source-id $env:AMAZON_Q_DATA_SOURCE_ID `
  --profile sketchcatch-dev `
  --region ap-southeast-2
```

S3 객체 6개, `ACTIVE` data source, 최신 `SUCCEEDED` sync job, 대표 질의 6개의 기대 citation을 모두 확인해야 완료다.
