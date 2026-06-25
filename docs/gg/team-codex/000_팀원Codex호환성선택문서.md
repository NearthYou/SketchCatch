# 팀원 Codex 호환성 선택 문서

> 상태: 담당자 선택 결과를 받기 위한 검토용 문서다. 각 문서의 추천안은 gg AI 파트와의 호환성을 기준으로 한 제안이며, 담당자 Codex의 응답을 받은 뒤 확정한다.

이 폴더는 팀원별 Codex가 구현 전에 호환성 선택지를 고르고, 그 결과를 gg AI 파트로 되돌려주기 위한 문서 묶음이다.

## 사용 방법

1. 각 팀원은 자기 담당 문서를 담당 Codex에게 읽힌다.
2. Codex는 문서의 선택지에서 하나를 고른다.
3. Codex는 문서 하단의 "응답 형식"대로 답한다.
4. gg는 받은 답을 기준으로 AI API, DTO, mock, rule engine 구현 계획을 구체화한다.

## 담당 문서

| 담당 | 문서 | 목적 |
| --- | --- | --- |
| jh | [Architecture Board 선택지](./001_아키텍처보드선택지_jh.md) | `ArchitectureJson`, `ResourceType`, 보드 경고 표시 호환성 확인 |
| sw | [Terraform 변환 선택지](./002_테라폼변환선택지_sw.md) | Terraform 생성 입력, `ResourceNode.config`, IaC Preview 호환성 확인 |
| ck | [Plan/Apply 선택지](./003_배포실행선택지_ck.md) | Plan/Apply output, 오류 설명 입력, Deployment History 연결 확인 |
| ys | [플랫폼 선택지](./004_플랫폼선택지_ys.md) | 프로젝트 목록, 최근 작업, 알림에서 AI 요약 소비 방식 확인 |
| 팀장 | [공통 계약 선택지](./005_공통계약선택지.md) | 공통 API 응답 wrapper, shared DTO, 저장 정책 확인 |

## 선택 결과

| 담당 | 선택 결과 | gg 반영 기준 |
| --- | --- | --- |
| jh | A / A / A / A | 공통 `ResourceType`, `architectureJson` 단독 입력, `CheckFinding.resourceId` 연결, 보드의 공통 config 표시 기준을 따른다. |
| sw | A / A / A / A | `ArchitectureJson`을 Terraform 생성 원천 입력으로 두고, sw가 `ResourceType`별 required config matrix를 정의한다. Terraform 생성 결과는 `resourceId` 또는 node id mapping을 제공하고, 코드 ↔ 다이어그램 동기화는 sw가 소유한다. |
| ck | A / A / A / A | 오류 설명 입력은 `stage`, `rawMessage`, 선택 `relatedResourceId`로 받고, AI 설명은 stateless 응답으로 유지한다. |
| ys | A / B / A / C | 프로젝트 목록은 가볍게 유지하고, 중요한 AI 이벤트만 Activity로 남기며, 알림은 화면 warning/Toast 중심으로 시작한다. 익명 workspace와 로그인 user를 모두 고려한다. |
| 팀장 | C / A / B / C / A | 공통 wrapper는 전체 route 정리 이후 적용하고, AI DTO는 `packages/types`에 둔다. Pre-Deployment Analysis만 저장 대상으로 보고, AI source는 metadata로 통합하며, 확장 `ResourceType`은 승인한다. |

## 공통 기준

- 공통 타입 기준은 [데이터 모델](../data-models.md)이다.
- gg AI 범위 기준은 [AI 1차 제공 범위](../001_AI파트1차제공범위초안_gg.md)이다.
- Codex 작업 절차 기준은 [개발 가이드](../development.md)의 `Codex 협업 호환 절차`다.
- 실제 AWS apply, Terraform 실행, AWS 권한 변경은 이 문서 묶음에서 결정하지 않는다.
