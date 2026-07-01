# 서비스 실행 경로와 Provider 경계 결정

SketchCatch는 단순한 데모용 다이어그램 도구가 아니라 multi-cloud-ready IaC 운영 서비스로 간다. 제품은 자연어/음성 요구사항, Source Repository, 기존 클라우드 상태를 입력으로 받아 Practice Architecture를 만들고, IaC Preview와 안전 검사를 거쳐 실행 또는 운영 handoff까지 연결한다.

**결정**

- 배포 경로는 `Direct Deployment Path`와 `Git/CI/CD Deployment Path`로 분리한다.
- `Direct Deployment Path`는 빠른 검증, sandbox, practice 실행을 위해 SketchCatch가 Plan, 승인, Apply, 로그, Outputs, Auto Cleanup을 직접 관리한다.
- `Git/CI/CD Deployment Path`는 팀 리뷰와 운영 배포를 위해 IaC Preview를 Source Repository PR과 외부 pipeline으로 넘기고, SketchCatch는 handoff와 상태를 추적한다.
- 두 경로 모두 Plan, Pre-Deployment Check, 사용자 승인, secret masking, cleanup 경계를 우회할 수 없다.
- `Reverse Engineering`은 AWS 전용 조회가 아니라 Provider Adapter 기반 기능이다. MVP는 AWS adapter부터 구현하지만, Resource와 InfrastructureGraph는 provider-neutral 모델을 유지한다.
- Redis는 사용자 Practice Architecture Resource가 아니라 SketchCatch 내부 `Runtime Cache`다. 우선순위는 Deployment, Reverse Engineering, Git/CI/CD Integration의 long-running workflow 상태와 로그/폴링 보조다.
- AI, Bedrock, Amazon Q Assistance, Voice Requirement Input은 제안과 설명 계층이며, 상태 변경은 항상 `User-Accepted Change`로 처리한다.

**고려한 대안**

- Direct Deployment Path만 제공: 빠른 검증은 단순하지만 팀 운영 배포와 PR 리뷰 흐름을 담기 어렵다.
- Git/CI/CD Deployment Path만 제공: 운영에는 안전하지만 사용자가 설계를 빠르게 검증하기 어렵다.
- AWS 전용 모델로 빠르게 구현: 단기 구현은 쉽지만 multi-cloud-ready 포지셔닝과 Reverse Engineering 확장성이 약해진다.
- Redis를 사용자 Resource로 제공: 캐시 아키텍처 데모에는 좋아 보이지만 현재 제품 결정은 SketchCatch 내부 실행 안정성이 우선이다.

**결과**

서비스 계획과 문서는 데모 스크립트가 아니라 핵심 사용자 여정 중심으로 작성한다. 발표나 리허설은 `Representative Use Journey`로 실제 서비스 흐름을 증명할 뿐, 별도 데모 전용 기능을 만들지 않는다.
