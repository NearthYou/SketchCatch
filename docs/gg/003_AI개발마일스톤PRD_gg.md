# AI 개발 마일스톤 PRD

이 문서는 gg AI 파트를 어떤 순서로 만들지 정리한 문서다.

현재 이슈 #21은 **Milestone 2**에 해당한다.

## 1. 문제

사용자는 AWS 리소스를 하나하나 고르기 어렵다.

예를 들어 사용자는 이렇게 말한다.

```text
DB가 포함된 백엔드 API 서버를 만들고 싶어요.
```

그러면 우리 서비스는 이것을 설계 초안으로 바꿔줘야 한다.

결과는 보드가 바로 열 수 있는 `ArchitectureJson`이어야 한다.

쉽게 말하면:

```text
사용자 말
→ 설계 초안
→ 보드에서 확인
→ 비용/보안 점검
→ Terraform Preview 설명
```

## 2. 큰 방향

gg AI는 실제 AWS 배포를 하지 않는다.

gg AI는 아래 역할을 한다.

1. 설계 초안 만들기
2. 설계 위험 찾기
3. 오류 쉽게 설명하기
4. 비용/보안/성능 관점 설명하기
5. 수정하면 좋은 점 제안하기

외부 LLM이 없어도 fallback으로 동작해야 한다.

## 3. Milestone 1: AI API 뼈대

목표:

- AI route 만들기
- 요청 검증하기
- 공통 타입 만들기
- 외부 LLM 없이 기본 응답 반환하기

API 후보:

- `POST /api/ai/architecture-draft`
- `POST /api/ai/pre-deployment-check`
- `POST /api/ai/terraform-error-explanation`
- `POST /api/ai/terraform-preview-explanation`

완료 기준:

- 잘못된 JSON은 거절
- 응답 타입은 `packages/types`와 일치
- route는 얇게 유지
- 실제 분석 로직은 service 파일로 분리

## 4. Milestone 2: 자연어 설계 초안

현재 이슈 #21 범위다.

목표:

- 자연어와 선택값을 받기
- 시나리오를 고르기
- `ArchitectureJson` 반환하기
- 선택 이유와 warning을 metadata에 넣기
- `/workspace`에서 직접 테스트 가능하게 하기

입력:

```ts
type CreateArchitectureDraftRequest = {
  prompt: string;
  scenarioHint: "auto" | "static_site" | "api_server" | "backend_with_db";
  budgetLevel: "low" | "normal";
  trafficLevel: "small" | "normal";
  securityPriority: "basic" | "high";
};
```

지원 시나리오:

| 시나리오 | 결과 |
| --- | --- |
| `static_site` | S3 + CloudFront |
| `api_server` | VPC + Subnet + EC2 + Security Group |
| `backend_with_db` | VPC + Subnet + EC2 + RDS + Security Group |

완료 기준:

- `auto`는 점수로 시나리오 선택
- 직접 고른 시나리오는 자연어보다 우선
- 지원 밖 요구사항은 fallback + warning
- 리소스 id는 `ec2-api`, `rds-primary`처럼 사람이 읽기 쉬운 값
- metadata에 선택 이유 포함
- API 테스트와 typecheck 통과

## 5. Milestone 3: 배포 전 점검

목표:

- 설계 초안을 보고 위험 찾기
- 비용, 보안, 설정 누락을 알려주기
- checklist 만들기

초기 규칙:

| 상황 | 위험 |
| --- | --- |
| SSH가 `0.0.0.0/0` | 보안 위험 높음 |
| RDS 포함 | 비용 주의 |
| 필수 설정 누락 | 설정 확인 필요 |
| 정리 계획 없음 | 비용 남을 수 있음 |
| 작은 EC2 + 보통 트래픽 | 병목 가능성 |

완료 기준:

- finding이 특정 리소스 id를 가리킬 수 있음
- checklist 상태는 `pass`, `warning`, `fail`
- 실제 비용 보장이 아니라 추정이라고 설명

## 6. Milestone 4: 수정 제안과 기본 시뮬레이션

목표:

- 위험을 보고 고칠 방향 제안
- 예상 비용/성능/보안 변화 설명
- 간단한 트래픽 가정으로 병목 후보 보여주기

예:

```text
SSH 전체 공개
→ 접근 IP를 제한하세요

RDS 비용 위험
→ 비용을 확인하고 정리 계획을 세우세요
```

중요한 점:

- AI 수정안은 자동 적용하지 않음
- 사용자가 확인해야 적용
- 적용 후 다시 점검

## 7. Milestone 5: Terraform 오류 설명

목표:

- Terraform 오류 원문을 쉬운 말로 바꾸기
- 다음 행동을 1-3개로 알려주기

입력:

```ts
{
  stage: "validate" | "export" | "plan" | "apply";
  rawMessage: string;
  relatedResourceId?: string;
}
```

예:

```text
AccessDenied
→ 현재 권한으로 이 작업을 할 수 없습니다.
```

1차에서는 `validate`, `export` 중심으로 시작한다.

Plan/Apply는 ck 배포 파트와 연결될 때 확장한다.

## 8. Milestone 6: LLM 연결

목표:

- OpenAI 같은 외부 provider를 붙일 수 있게 만들기
- provider가 실패해도 fallback 동작 유지

원칙:

- 프론트는 LLM을 직접 호출하지 않음
- API key는 서버 환경변수로만 관리
- LLM 결과는 검증 후 사용
- 테스트는 실제 LLM 호출 금지

## 9. Milestone 7: 팀원 연동

각 파트와 맞출 것:

| 파트 | 맞출 것 |
| --- | --- |
| jh | `architectureJson`, `findings.resourceId` |
| sw | `ArchitectureJson`, `ResourceNode.config` |
| ck | `stage`, `rawMessage`, `relatedResourceId` |
| ys | AI 요약은 optional |
| 팀장 | shared type, API 응답 규칙 |

## 10. 사용자 입장에서 필요한 기능

사용자는 아래를 원한다.

- 말로 요구사항을 적으면 설계 초안을 받기
- 왜 이 리소스가 들어갔는지 보기
- 비용 위험 보기
- 보안 위험 보기
- 설정 누락 보기
- Terraform 오류를 쉬운 말로 보기
- 보드에서 바로 열리는 결과 받기

## 11. 구현 원칙

- 원천 데이터는 `ArchitectureJson`
- AI 전용 그래프 구조를 새로 만들지 않음
- 요청 검증은 Zod 사용
- AI 결과 타입은 `packages/types`에 둠
- 실제 배포 가능 여부는 AI가 결정하지 않음
- 비용은 추정일 뿐 실제 청구액 보장이 아님
- Terraform 최종 실행은 gg 책임이 아님

## 12. 테스트 원칙

테스트는 API 중심으로 한다.

확인할 것:

- 잘못된 요청 거절
- 올바른 요청 응답
- auto 점수 계산
- fallback warning
- `ArchitectureJson` 모양
- Terraform 오류 설명

실제 LLM은 테스트에서 호출하지 않는다.

## 13. 범위 밖

이번 단계에서 하지 않는 것:

- 실제 AWS Apply
- Terraform CLI 실행
- 장기 AWS credential 저장
- private GitHub repo 연동
- GitHub 코드만 보고 정답 인프라 추천
- 모든 AWS Resource 지원
- 실제 청구액 수준의 비용 정확도
- 실제 부하 테스트
- 사용자 승인 없는 AI 자동 수정
- 챗봇 UI

## 14. 한 줄 요약

작은 순서로 만들자. 먼저 안정적인 JSON 응답, 그다음 분석, 그다음 LLM, 마지막에 실제 배포 흐름과 연결한다.
