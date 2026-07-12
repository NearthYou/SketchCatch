---
pattern_id: spa-cloudfront-s3
provider: aws
workload: single-page-application
runtime: static
availability: global-edge
terraform_ready: true
reviewed_at: 2026-07-10
---

# SPA + CloudFront + private S3 패턴

빌드된 HTML, CSS, JavaScript와 정적 asset을 private S3 bucket에 저장하고 CloudFront가 HTTPS로 배포하는 SPA 패턴이다. 이 문서는 backend API가 아닌 frontend delivery만 정의한다.

## 적용 조건

- React, Vue, Angular 등의 client-side SPA 또는 정적 웹사이트를 배포한다.
- 서버 측 rendering이나 장시간 실행 backend가 필요하지 않다.
- 전 세계 또는 원거리 사용자의 정적 asset latency를 낮춰야 한다.
- S3 원본을 public 공개하지 않고 CloudFront를 통해서만 접근해야 한다.

Next.js SSR, server action, 동적 server rendering이 필수면 이 패턴만으로 충족되지 않는다. 정적 export가 가능한 경우에만 적용한다.

## 필수 리소스

| SketchCatch ResourceType | Terraform resource/config | 역할 |
| --- | --- | --- |
| `S3` | `aws_s3_bucket` 및 bucket policy/access block | private SPA origin |
| `CLOUDFRONT` | `aws_cloudfront_distribution` + origin access control | HTTPS CDN과 S3 접근 주체 |

custom domain에는 `ACM_CERTIFICATE`, `ACM_CERTIFICATE_VALIDATION`, `ROUTE53_ZONE`, `ROUTE53_RECORD`를 추가한다. 보안 요구에는 `WAF_WEB_ACL`, logging bucket, response headers policy를 추가할 수 있다.

## 금지 조건

- S3 Block Public Access를 끄거나 `Principal = "*"` public read policy를 사용한다.
- OAC를 사용하면서 S3 website endpoint를 origin으로 설정한다. OAC는 S3 REST endpoint를 사용한다.
- HTTPS가 필요한데 CloudFront default certificate/custom certificate 설정이 없다.
- SPA인데 deep link의 403/404를 `index.html`로 처리하지 않아 새로고침이 실패한다.
- backend가 필요 없음인데 Lambda, EC2, RDS를 임의로 추가한다.
- file upload 없음 요구를 frontend asset bucket과 혼동해 별도 upload bucket을 추가한다.

## 리소스 연결 순서

```text
User
  -> Route 53 alias (optional)
  -> CloudFront HTTPS distribution
  -> Origin Access Control
  -> private S3 origin
```

CloudFront distribution ARN만 S3 bucket object read를 허용하도록 bucket policy의 `AWS:SourceArn`을 제한한다. 배포 pipeline은 build 결과를 S3에 업로드한 후 필요한 경로만 invalidation한다.

## 권장 수량

| 항목 | 기본값 |
| --- | --- |
| content S3 bucket | 환경당 1개 |
| CloudFront distribution | domain/배포 경계당 1개 |
| OAC | distribution origin당 1개 |
| ACM certificate | custom domain certificate 1개, SAN 활용 가능 |
| Route 53 alias | apex/subdomain 요구에 맞게 1개 이상 |
| log bucket | 조직 logging 정책에 따라 공유 또는 환경별 |

## 프라이빗/퍼블릭 서브넷 배치

S3와 CloudFront는 subnet에 배치하지 않는다. 이 패턴만으로 VPC, public subnet, private subnet, NAT Gateway가 필요하지 않다. VPC가 추가되었다면 backend 또는 보안 appliance 같은 별도 요구가 있는지 확인한다.

## Terraform 필수 파라미터

| 리소스 | 필수 파라미터/검증 |
| --- | --- |
| S3 bucket | Block Public Access 4개 `true`, ownership controls, versioning 권장, server-side encryption, lifecycle |
| OAC | `origin_access_control_origin_type = "s3"`, SigV4 signing |
| CloudFront origin | S3 regional REST domain, OAC id, unique origin id |
| default cache behavior | `viewer_protocol_policy = "redirect-to-https"`, 허용 method 최소화, compression, cache policy |
| distribution | `enabled`, `default_root_object = "index.html"`, price class, IPv6 요구, logging |
| SPA error response | 403/404를 `/index.html`과 적절한 response code/cache TTL로 매핑 |
| certificate | custom domain이면 **us-east-1** ACM certificate ARN, TLS 최소 버전, alias |
| bucket policy | CloudFront service principal + 해당 distribution `AWS:SourceArn`만 `s3:GetObject` 허용 |

## 배포 전 검증 조건

- Terraform 검사와 plan이 성공한다.
- S3 public access analyzer와 bucket policy 검사에서 public access가 없다.
- S3 객체 URL 직접 접근은 거부되고 CloudFront URL 접근은 성공한다.
- HTTP 요청이 HTTPS로 redirect된다.
- `/`, 정적 asset, 존재하지 않는 deep link 새로고침이 기대한 SPA 화면을 반환한다.
- custom domain certificate가 us-east-1에 있고 DNS validation이 완료된다.
- cache-control header가 hash asset과 `index.html`의 변경 특성에 맞는다.
- 배포 후 invalidation 또는 versioned asset 전략이 정의되어 있다.
- backend/API 요구가 있으면 별도 패턴과 명시적으로 연결하고 이 문서가 이를 암묵적으로 생성하지 않는다.

## 잘못된 구조 예시

```text
Internet -> public S3 website endpoint (HTTP)
CloudFront exists separately with no S3 origin/OAC
```

CloudFront가 존재하더라도 origin과 bucket policy가 연결되지 않으면 안전한 CDN 배포가 아니다. 올바른 구조는 `CloudFront -> OAC -> private S3 REST origin`이다.

## 근거

- [AWS: Get started with a secure static website](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/getting-started-secure-static-website-cloudformation-template.html)
- [AWS: S3 static website와 CloudFront OAC 권고](https://docs.aws.amazon.com/AmazonS3/latest/userguide/HostingWebsiteOnS3Setup.html)
- [AWS Samples: Amazon CloudFront Secure Static Site](https://github.com/aws-samples/amazon-cloudfront-secure-static-site)
