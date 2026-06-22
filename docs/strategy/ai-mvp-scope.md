# 경근 AI 파트 MVP 범위

## 결론

경근 파트는 아래 5개를 모두 맡되, AI를 최종 판단 주체로 두지 않는다. MVP의 기준은 "AI가 초안을 만들고 설명한다"이지, "AI가 검증되지 않은 AWS 배포 코드를 마음대로 만든다"가 아니다.

핵심 흐름은 다음과 같다.

```text
자연어 또는 Source Repository
→ Architecture Draft
→ Architecture Board에서 사용자 수정
→ IaC Preview
→ Pre-Deployment Check
→ Plan / Apply
→ Deployment History
```

## 1. 자연어 → Architecture Draft

사용자가 "간단한 쇼핑몰 서버 만들어줘"처럼 입력하면 Practice Architecture 초안을 만든다.

MVP 깊이:

- 3-5개의 대표 의도를 지원한다.
- 생성 결과는 자유 텍스트가 아니라 Architecture Draft JSON이다.
- VPC, Subnet, EC2, RDS, S3, Security Group 정도의 제한된 Resource만 생성한다.
- 알 수 없는 요청은 무리해서 생성하지 않고 Template 선택을 유도한다.

완료 기준:

- 같은 입력에 대해 재현 가능한 초안을 만든다.
- Architecture Board에서 바로 열 수 있다.
- 생성된 Resource마다 초보자용 설명을 붙인다.

MVP에서 하지 않는 것:

- 모든 AWS 서비스를 자연어로 지원하지 않는다.
- AI가 임의로 IAM 권한이나 공개 네트워크를 강하게 열지 않는다.
- 생성 직후 바로 Apply하지 않는다.

## 2. Source Repository → Architecture Draft

사용자가 GitHub 링크를 넣으면 기존 애플리케이션의 단서를 읽고 Practice Architecture 초안을 만든다.

MVP 깊이:

- public repository만 대상으로 한다.
- README, package metadata, Dockerfile, compose file, framework 흔적 정도만 본다.
- private repository, 대형 monorepo, 복잡한 마이크로서비스 추론은 제외한다.
- 실패하면 "링크 기반 추론 불가"를 명확히 보여주고 자연어 입력으로 대체한다.

완료 기준:

- Next.js 단일 앱, Node API, DB가 필요한 앱 정도를 구분한다.
- 앱 유형에 맞는 최소 Architecture Draft를 만든다.
- 추론 근거를 사용자에게 설명한다.

MVP에서 하지 않는 것:

- 전체 코드를 정밀 분석하지 않는다.
- Terraform을 repository 구조에서 자동 완성하지 않는다.
- secret, environment value, 실제 AWS 계정 정보를 읽지 않는다.

## 3. IaC Preview / Terraform 코드 생성 보조

Terraform 생성 자체는 Practice Architecture에서 결정론적으로 만든다. AI는 그 결과를 설명하고, 누락된 설정이나 위험한 설정을 지적하는 보조 역할을 한다.

MVP 깊이:

- IaC Preview는 생성기 또는 템플릿이 만든다.
- AI는 "이 코드가 어떤 Resource를 만들며 왜 필요한지"를 설명한다.
- AI는 위험한 변경 제안, 누락된 변수, 초보자가 이해하기 어려운 부분을 설명한다.

완료 기준:

- IaC Preview와 Architecture Board의 Resource가 서로 대응된다.
- AI 설명은 Resource 단위로 볼 수 있다.
- AI가 만든 설명이 틀려도 실제 생성 코드는 흔들리지 않는다.

MVP에서 하지 않는 것:

- AI가 자유롭게 Terraform 최종본을 작성하지 않는다.
- AI가 생성한 코드를 바로 Apply하지 않는다.
- 코드 ↔ 다이어그램 동기화의 원천 진실을 AI 응답으로 두지 않는다.

## 4. 비용 / 보안 / 배포 전 위험 분석과 설명

Pre-Deployment Check에서 Check Finding을 만들고, AI가 초보자에게 이해 가능한 말로 설명한다.

MVP 깊이:

- Cost Risk, Security Risk, missing configuration, permission concern을 구분한다.
- 위험도는 `low`, `medium`, `high`로 제한한다.
- 룰 엔진이 먼저 finding을 만들고, AI는 finding을 설명한다.

예시 finding:

- Security Group이 `0.0.0.0/0` SSH를 허용하면 high Security Risk
- RDS, NAT Gateway, ALB는 Cost Risk
- Practice Session 종료 후 삭제 계획이 없으면 Cost Risk
- 필수 region, instance type, subnet 연결이 없으면 missing configuration

완료 기준:

- 각 finding에 이유, 영향, 수정 가이드가 있다.
- Apply 전 화면에서 사용자가 위험을 보고 멈출 수 있다.
- 비용 숫자가 정확하지 않아도 비용이 생기는 근거는 설명한다.

## 5. 오류 설명 / 체크리스트 생성

Plan 또는 Apply에서 나온 오류와 배포 전 확인 항목을 초보자 언어로 바꾼다.

MVP 깊이:

- Plan 전 체크리스트를 생성한다.
- Terraform/AWS 오류 메시지를 카테고리화한다.
- 사용자가 다음에 해야 할 행동을 1-3개로 줄여 보여준다.

완료 기준:

- 권한 부족, region 문제, quota 문제, 잘못된 Resource 연결을 구분한다.
- 오류 원문을 숨기지 않고, 쉬운 설명을 함께 보여준다.
- 실패한 Apply 결과가 Deployment History에 남는다.

## 팀 의존성

| 대상 | 경근 파트가 필요한 것 | 경근 파트가 제공하는 것 |
| --- | --- | --- |
| 윤서 | 로그인 사용자, AWS 연결 상태, 비용 계산 기준 | 비용 위험 설명, 예산 초과 이유 |
| 정현 | Practice Architecture JSON, Architecture Board 상태 | Architecture Draft, Resource 설명 |
| 시원 | IaC Preview 생성 규칙, 코드 동기화 기준 | IaC 설명, 위험한 코드 지점 설명 |
| 채강 | Plan/Apply 상태, 배포 로그, 오류 원문 | 배포 전 체크리스트, 오류 설명 |

## 5주 구현 순서

1. Week 1: Practice Architecture JSON과 Architecture Draft JSON 계약 확정
2. Week 2: 자연어 입력에서 Template 기반 Architecture Draft 생성
3. Week 3: Cost Risk / Security Risk rule engine과 AI 설명 연결
4. Week 4: IaC Preview 설명과 Source Repository 기반 초안 생성 최소 구현
5. Week 5: Plan/Apply 오류 설명, 체크리스트, 발표 시나리오 고정

## 발표 시나리오

1. 사용자가 자연어로 "간단한 쇼핑몰 서버 만들어줘"를 입력한다.
2. AI가 Architecture Draft를 만든다.
3. 사용자가 Architecture Board에서 Resource를 확인하고 일부 수정한다.
4. IaC Preview가 생성된다.
5. Pre-Deployment Check가 비용과 보안 위험을 설명한다.
6. Plan 결과와 체크리스트를 확인한다.
7. Apply 결과 또는 실패 오류를 AI가 초보자 언어로 설명한다.

## 아직 결정해야 할 질문

- 자연어 생성에서 지원할 대표 의도 3-5개는 무엇인가?
- Source Repository 분석은 GitHub API를 쓸 것인가, URL 입력 후 서버 fetch만 할 것인가?
- AI provider 없이 mock으로 갈 수 있는 범위와 실제 LLM을 붙일 범위는 어디까지인가?
- 비용 설명은 윤서 파트의 숫자 결과를 받아 설명할 것인가, 경근 파트가 자체 위험 등급만 만들 것인가?
