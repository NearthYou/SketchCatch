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
| jh | [Architecture Board 선택지](./architecture-board-options.md) | `ArchitectureJson`, `ResourceType`, 보드 경고 표시 호환성 확인 |
| sw | [Terraform 변환 선택지](./terraform-options.md) | Terraform 생성 입력, `ResourceNode.config`, IaC Preview 호환성 확인 |
| ck | [Plan/Apply 선택지](./deployment-options.md) | Plan/Apply output, 오류 설명 입력, Deployment History 연결 확인 |
| ys | [플랫폼 선택지](./platform-options.md) | 프로젝트 목록, 최근 작업, 알림에서 AI 요약 소비 방식 확인 |
| 팀장 | [공통 계약 선택지](./common-contract-options.md) | 공통 API 응답 wrapper, shared DTO, 저장 정책 확인 |

## 공통 기준

- 공통 타입 기준은 [데이터 모델](../data-models.md)이다.
- gg AI 범위 기준은 [AI MVP 범위](../strategy/ai-mvp-scope.md)이다.
- Codex 작업 절차 기준은 [개발 가이드](../development.md)의 `Codex 협업 호환 절차`다.
- 실제 AWS apply, Terraform 실행, AWS 권한 변경은 이 문서 묶음에서 결정하지 않는다.
