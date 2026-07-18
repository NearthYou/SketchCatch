# 이슈 #474 사용성 개선 설계

## 범위

이슈 #474를 세 작업으로 병렬 구현한다.

1. 기존 AWS 가져오기
2. AI 초안 만들기
3. Board 자동 정리

공통 기준은 `docs/gg/fix-gg-474-reverse-ai/000_그릴링결정_gg.md`다. 사용자가 알 필요 없는 내부 오류, 식별자, 점수, 버전, 권한 문자열은 사용자 화면에 표시하지 않는다. 사용자 승인 전에는 Project나 Board를 변경하지 않는다.

## 기존 AWS 가져오기

가져온 Resource·관계·설정을 유지하고 좌표만 기본 배치한 원본을 먼저 보여준다. 일부 서비스 조회가 실패해도 성공한 결과는 표시하며, 안내는 `일부 항목을 가져오지 못했어요`와 `가져오기 권한 추가` 중심으로 단순화한다. 기존 연결의 권한을 갱신하고 새 연결은 만들지 않는다. 불완전한 결과는 `가져온 항목만 사용`을 누른 경우에만 적용한다.

## AI 초안 만들기

대화 중 데스크톱은 전체 Canvas와 큰 채팅 Dock을 사용한다. Orbit 중심은 가운데보다 오른쪽이며 채팅 뒤로 일부 가려질 수 있다. AWS icon은 계속 공전하고 대화 event에 짧게 반응한다. 답변 누적에 따라 궤도가 사라지고 icon이 모이지만 percentage로 설명하지 않는다. Draft compilation 동안 한 점으로 수렴하고 Compiler 성공 뒤에만 실제 Preview를 보여준다.

최종 상태는 왼쪽 채팅 rail과 넓은 Preview로 전환한다. 미리보기 기본 설명은 쉬운 한 문장, Resource·연결 수, 확인할 점 최대 3개다. 추가 안전 정보는 `모두 보기`에 남긴다. 모바일은 채팅 전체 화면을 유지하며 준비 후 `미리보기 보기`로 전체 화면 Preview에 진입하고 다시 대화로 돌아올 수 있다.

## Board 자동 정리

자동 정리는 Resource·관계·설정을 변경하지 않고 위치·영역 배치·연결선만 바꾼다. 같은 Board에서 `원본`과 `정리 결과`를 전환해 비교한다. `원본 유지`는 변경 없이 닫고, `이 정리 사용`이 단일 최종 승인이다. 점수, 거리, 후보 ID, Compiler version, Template ID와 내부 진단은 사용자 화면에서 제거한다.

## 병렬 작업 경계

- AWS 담당은 Reverse Engineering과 AWS 연결 권한 범위만 수정한다.
- AI 담당은 `apps/web/app/workspace/ai/**`를 주 소유 범위로 삼는다.
- Board 담당은 Diagram Editor의 자동 정리 흐름과 Compiler presentation adapter를 주 소유 범위로 삼는다.
- 공유 문서와 shared Compiler type 변경은 먼저 다른 담당의 진행 상황을 확인한다.
- 각 담당은 다른 두 agent가 같은 branch와 working tree에서 병렬 작업 중임을 전제로 unrelated 변경을 되돌리지 않는다.
