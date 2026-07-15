# Workspace AI 작업실 QA 매뉴얼

## 한 줄 안내

AI 작업실의 세 mode, desktop 동시 조작, mobile 전체 화면, 명시적 승인 경계를 실제 Workspace에서 확인한다. `Board에 적용`과 `수정 적용`은 버려도 되는 테스트 프로젝트에서만 누른다.

## 1. 준비

1. `http://127.0.0.1:3000`에 로그인한다.
2. Resource와 Terraform Issue가 있는 테스트 프로젝트의 `/workspace`를 연다.
3. 화면 폭 `1280px` 이상에서 시작한다.

정상이라면 오른쪽 아래에 icon과 `AI 작업실` 글자가 함께 있는 launcher가 보인다.

## 2. Launcher와 기본 화면

1. `Tab`으로 `AI 작업실` launcher에 이동한다.
2. focus 표시와 접근 가능한 이름 `AI 작업실 열기`를 확인한다.
3. `Enter` 또는 `Space`로 연다.

정상 기준:

- 제목은 `AI 작업실`이다.
- 왼쪽 mode rail에 `설계 제안`, `오류 분석`, `에이전트 리뷰`가 보인다.
- 선택 mode, 현재 Board 기준, 요청 상태가 구분된다.
- 대화와 결과만 세로로 움직이고 header와 필요한 footer는 고정된다.
- `설계 제안`에는 composer가 있고, `오류 분석`과 `에이전트 리뷰`에는 가짜 composer가 없다.

## 3. 세 Mode의 독립 상태

1. `설계 제안`에 전송하지 않은 문장을 입력한다.
2. `오류 분석`, `에이전트 리뷰`로 차례로 이동한다.
3. 각 mode에서 요청 또는 결과를 만든 뒤 다시 돌아온다.

각 mode의 history, 입력문, 처리 상태, 오류, 결과와 승인 대기 상태가 섞이지 않아야 한다. mode 탭은 마우스와 방향키로 이동할 수 있어야 한다.

일반 launcher를 닫았다 열면 마지막 mode가 복원되어야 한다. Terraform Issue와 Preview의 AI action은 각각 `오류 분석`, `에이전트 리뷰`를 선택해야 한다.

## 4. Desktop 동시 조작

1. AI 작업실을 연 채 Board의 Resource를 선택·이동한다.
2. Inspector의 입력과 버튼을 조작한다.
3. Terraform 패널을 열고 탭 또는 결과를 선택한다.

정상 기준:

- AI 작업실이 닫히지 않는다.
- Board, Inspector, Terraform 패널이 계속 반응한다.
- Inspector 또는 Terraform 패널이 열리면 AI 작업실이 왼쪽으로 이동해 가리지 않는다.
- 오른쪽 패널을 열기 위해 기존 패널이나 AI 작업실을 강제로 닫지 않는다.
- 저장하지 않은 Terraform 변경의 기존 이탈 보호는 그대로 동작한다.

## 5. 닫기와 Focus 복원

1. AI 작업실을 닫았다 다시 열어 입력과 내역이 남는지 확인한다.
2. 작업실 안에서 `Escape`를 누른다.
3. focus가 `AI 작업실` launcher로 돌아오는지 확인한다.
4. desktop에서 작업실 바깥 Board 요소로 `Tab` 또는 `Shift+Tab` 이동이 가능한지 확인한다.

desktop에서 focus가 작업실 안에 갇히면 오류다.

## 6. 설계 제안과 승인 경계

1. `설계 제안`에 `현재 API 앞에 ALB를 추가해줘`를 전송한다.
2. 추가 질문이 나오면 선택지를 고른다.
3. preview와 `적용 대기` 상태를 확인한다.
4. 먼저 `취소`를 누른다.

취소 전까지 실제 Board가 바뀌지 않아야 하며, 취소 뒤 preview만 사라져야 한다.

테스트 프로젝트에서 다시 요청한 뒤 `Board에 적용`을 누르면 그때만 실제 Board와 저장 상태가 바뀌어야 한다. preview 뒤 Board revision 또는 fingerprint를 바꾸면 기존 결과는 `오래된 제안`으로 남고 적용은 막혀야 한다.

## 7. 오류 분석과 수정 적용

1. Terraform Issue에서 오류 분석 action을 실행한다.
2. `오류 분석` mode와 해당 Issue 결과가 선택되는지 확인한다.
3. 원인, 근거, 수정 가능 여부와 기술 세부 내용이 읽히는지 본다.
4. 안전한 수정이 있으면 단일 수정과 전체 수정을 각각 확인한다.

`수정 적용` 전에는 Terraform 파일이 바뀌면 안 된다. 적용 시 현재 파일 코드와 fingerprint가 다르면 막아야 하며, 전체 수정은 일부만 반영되지 않고 모두 성공하거나 모두 취소되어야 한다.

## 8. 에이전트 리뷰

1. Terraform Preview의 리뷰 action을 실행한다.
2. `에이전트 리뷰` mode에 현재 코드 snapshot과 결과가 표시되는지 확인한다.
3. 오류 분석의 history나 승인 action이 섞이지 않는지 확인한다.

분석 API가 없는 후속 입력창이나 존재하지 않는 수정 action을 가장해서 표시하면 오류다.

## 9. 요청 상태와 취소

1. 느린 네트워크에서 설계·분석 요청을 시작한다.
2. `작업 중` 상태와 `요청 중지`를 확인한다.
3. 중지한 뒤 입력 또는 작업 선택 가능 상태로 돌아오는지 본다.
4. 잠시 기다려 취소한 요청의 늦은 결과가 추가되지 않는지 확인한다.

Offline에서는 요청을 막고 연결 상태를 설명해야 한다. 오류는 색상뿐 아니라 상태 이름과 설명으로도 구분해야 한다.

## 10. Mobile과 반응형

`375 x 812`, `768 x 1024`, `1280 x 800`에서 반복한다.

Mobile 정상 기준:

- AI 작업실이 `100dvh` 전체 화면으로 열린다.
- 세 mode는 상단 가로 탭으로 보인다.
- `aria-modal=true`이며 focus가 작업실 안에서 순환한다.
- 닫기, status, 결과, 필요한 composer가 safe area 안에 보인다.
- 화면 키보드를 열어도 composer와 전송 action을 사용할 수 있다.
- 긴 코드, URL, 오류 설명 때문에 가로 스크롤이 생기지 않는다.

Desktop 정상 기준:

- 작업실은 전체 화면 modal이 아니며 `aria-modal`이 없다.
- Board와 오른쪽 패널을 동시에 조작할 수 있다.
- 오른쪽 패널, 상단 bar, 하단 도구와 겹치지 않는다.

## 11. 빠른 최종 체크

- [ ] 글자가 있는 `AI 작업실` launcher와 focus 표시가 보임
- [ ] 세 mode와 각각의 독립 상태가 유지됨
- [ ] 설계 제안에만 실제 composer가 보임
- [ ] desktop에서 AI 작업실을 연 채 Board와 오른쪽 패널을 조작할 수 있음
- [ ] `Escape`로 닫히고 launcher로 focus가 돌아옴
- [ ] 요청 중지 뒤 늦은 응답이 반영되지 않음
- [ ] 사용자 승인 전에는 Board와 Terraform이 바뀌지 않음
- [ ] 오래된 제안과 fingerprint 불일치 수정은 적용할 수 없음
- [ ] mobile은 전체 화면, focus trap, safe area가 동작함
- [ ] `375px`, `768px`, `1280px`에서 가로 overflow와 겹침이 없음

## 12. 2026-07-16 실화면 QA 기록

- `375 x 812`: 전체 화면 modal, 가로 탭, 가로 overflow 없음
- `768 x 900`: dialog 너비 768px, `aria-modal=true`, 가로 overflow 없음
- `1024 x 500`: 긴 오류 결과가 card 안에서 잘리지 않고 transcript로 스크롤됨
- `1920 x 912`: 비모달 작업실을 닫은 뒤 일반 viewport 복원, 가로 overflow 없음
- desktop 바깥에 있던 focus가 mobile 전환 후 `Tab`에서 작업실 안으로 복귀함
- mobile `Tab` 순서에 `기술 정보 보기` native `summary`가 포함됨
- transcript 위쪽을 읽는 중 오류 분석 상태가 갱신되어도 아래쪽으로 강제 이동하지 않음
- Browser console 새 오류 없음

## 13. 오류 기록 형식

```text
화면 크기:
선택한 mode:
누른 순서:
기대한 결과:
실제로 나온 결과:
```

가능하면 문제 화면과 Console 오류도 함께 남긴다.
