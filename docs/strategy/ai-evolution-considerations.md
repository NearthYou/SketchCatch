# AI 고도화 고려사항

이 문서는 경근 AI 파트를 그릴링할 때 MVP 결정에서 끝내지 않고, 이후 고도화 경로와 재검토 조건을 함께 남기기 위한 문서다. MVP 문서에는 지금 구현할 범위를 적고, 이 문서에는 나중에 확장할 때 다시 볼 판단 근거를 적는다.

## 기록 원칙

- MVP 결정은 [AI MVP 범위](./ai-mvp-scope.md)에 남긴다.
- 고도화 방향은 이 문서에 남긴다.
- 고도화 항목은 "언젠가 하면 좋음"이 아니라 다시 검토할 조건을 함께 적는다.
- 실제 AWS 비용, 보안, 배포와 연결되는 항목은 안전장치와 실패 fallback을 같이 검토한다.

## 비용 추정

MVP 결정:

- static price table을 우선 사용한다.
- 기본 가정은 `ap-northeast-2`, 월 `730`시간, MVP 기본 instance/storage 값이다.
- 가격표에 없는 Resource나 설정은 금액을 억지로 만들지 않고 Cost Risk 등급으로 fallback한다.

고도화 방향:

- AWS Pricing API를 붙여 실제 가격에 가까운 조회를 제공한다.
- 가격표를 코드 상수가 아니라 버전 관리되는 데이터로 분리한다.
- region, instance type, storage, traffic, request count를 입력받아 더 세밀하게 계산한다.
- 사용자 예산과 연결해 예산 초과 가능성을 사전에 경고한다.

재검토 조건:

- 지원 Resource가 EC2/RDS/S3/CloudFront를 넘어 늘어날 때
- 발표용 추정값이 아니라 사용자 신뢰가 필요한 비용 화면이 될 때
- 리전별 가격 차이를 사용자에게 보여줘야 할 때

## GitHub 링크 기반 초안 생성

MVP 결정:

- public GitHub repository URL에서 후보 파일만 서버가 가져온다.
- README, package metadata, Dockerfile, compose file, framework config 정도만 본다.
- 실패하면 파일 붙여넣기 또는 Template 선택으로 fallback한다.

고도화 방향:

- repository tree를 더 넓게 분석해 frontend/backend/database 경계를 추론한다.
- private repository는 OAuth와 권한 범위를 설계한 뒤 지원한다.
- monorepo와 multi-service repository를 서비스 단위로 나누어 Architecture Draft를 만든다.
- 실제 Docker compose service 관계를 ResourceEdge 후보로 변환한다.

재검토 조건:

- public repo만으로 데모 가치가 부족할 때
- 사용자가 실제 프로젝트 repository를 연결하려 할 때
- multi-service 구조를 지원해야 할 때

## LLM provider와 품질 관리

MVP 결정:

- OpenAI API를 기본 provider로 사용한다.
- 모든 호출은 backend API를 경유한다.
- provider 실패, timeout, 비용 제한, JSON 검증 실패 시 deterministic mock 또는 Template 결과로 fallback한다.

고도화 방향:

- provider interface를 만들어 OpenAI, Gemini, Claude 같은 provider 교체를 쉽게 한다.
- prompt versioning과 평가용 fixture를 둔다.
- Architecture Draft 생성 결과를 golden test로 비교한다.
- 설명 품질, 위험 누락, 과잉 경고를 평가하는 QA checklist를 만든다.

재검토 조건:

- LLM 비용이 팀 예산에 영향을 줄 때
- provider 장애가 반복될 때
- AI 결과 품질을 수치로 비교해야 할 때

## Terraform 코드 작성 보조

MVP 결정:

- AI는 Terraform 최종본을 직접 Apply하지 않는다.
- 시원 파트의 Terraform 생성 결과를 설명하고 위험 지점을 보조한다.
- 코드 작성 보조는 사람 검토와 문법 검증을 전제로 한다.

고도화 방향:

- Terraform plan output을 구조화해서 변경 요약을 만든다.
- HCL parser나 `terraform validate` 결과와 AI 설명을 연결한다.
- 코드 수정 제안을 patch 형식으로 제공하되, 사용자가 명시적으로 적용하게 한다.
- Diagram JSON과 Terraform 코드의 차이를 설명한다.

재검토 조건:

- Terraform 코드 에디터가 실제 사용자 작업 흐름의 중심이 될 때
- 코드 수정 시 다이어그램 반영 기능이 안정화될 때
- Plan 결과를 초보자가 이해하지 못하는 문제가 반복될 때

## 위험도와 보안 검증

MVP 결정:

- Cost Risk, Security Risk, configuration, permission finding을 `low`, `medium`, `high`로 분류한다.
- 룰 엔진이 finding을 만들고 AI는 이유와 수정 가이드를 설명한다.

고도화 방향:

- AWS Well-Architected Framework, CIS Benchmark, IAM least privilege 기준을 일부 반영한다.
- finding에 자동 수정 후보를 붙인다.
- 위험을 ResourceNode와 Terraform line에 동시에 연결한다.
- false positive를 사용자가 무시하거나 해소 처리할 수 있게 한다.

재검토 조건:

- 실제 AWS 배포가 열릴 때
- Security Group, S3 public access, IAM policy 같은 보안 finding이 늘어날 때
- 팀이 보안 기준을 발표 평가 포인트로 삼을 때

## 오류 설명

MVP 결정:

- Terraform/AWS 오류 원문을 숨기지 않고 쉬운 설명과 다음 행동을 함께 보여준다.
- 권한 부족, region 문제, quota 문제, provider 인증 문제, syntax 문제부터 처리한다.

고도화 방향:

- 오류 원문을 fingerprint로 분류해 재발하는 오류 설명을 캐시한다.
- 배포 로그와 Deployment History를 연결해 실패 원인을 시간순으로 보여준다.
- 실패 원인별 해결 가이드 링크를 제공한다.

재검토 조건:

- 실제 Apply 실패 로그가 쌓일 때
- 같은 오류 설명을 여러 화면에서 재사용해야 할 때
- 초보자 사용자 테스트에서 오류 메시지 이해도가 낮을 때
