# UI 재구축 검증 결과

## 한 줄 결론

기존 UI를 걷어낸 뒤, 문서의 마일스톤 0~12에 적힌 화면과 실제 기능 연결을 새 UI로 다시 만들었다.

화면에만 있는 가짜 성공 결과는 넣지 않았다. 실제 AWS Apply처럼 외부 계정 상태가 필요한 검증은 UI 완료와 따로 적는다.

## 마일스톤 결과

| 마일스톤 | 결과 | 실제로 연결된 내용 |
| --- | --- | --- |
| 0. 구조와 계약 | 완료 | route, API, `DiagramJson`, Board, Terraform, Deployment 계약 보존 |
| 1. Landing / Auth | 완료 | Landing, 로그인, 회원가입, 비밀번호 재설정 |
| 2. Dashboard | 완료 | 작업 현황, 프로젝트, 비용, Template, 환경설정 |
| 3. 새 프로젝트 | 완료 | AI, Reverse Engineering, Template, GitHub Repository, 빈 Board |
| 4. Workspace / Board | 완료 | 실제 Board, 저장, local/server 충돌 선택, 좌우 panel |
| 5. AI 시작 | 완료 | 대화, 음성 입력, 초안 생성, PREVIEW, 사용자 적용 |
| 6. Reverse Engineering | 완료 | AWS 스캔, 후보, 미리보기, UNKNOWN, 프로젝트 생성 |
| 7. Terraform Preview | 완료 | 코드 생성, Validate, 설계 진단, Board 변경 제안 |
| 8. Safety / Cost | 완료 | 비용·보안 검사, Architecture 오류 차단, checklist |
| 9. Deployment Console | 완료 | 저장, 검사, Plan, 승인, Apply, 실시간 log |
| 10. History / Cleanup | 완료 | 배포 이력, 결과 Resource, output, 실패 설명, Cleanup 승인 |
| 11. Template / GitHub | 완료 | Template 탐색·적용, Repository 연결·분석·PREVIEW |
| 12. E2E Visual QA | 완료 | 375px부터 1920px까지 실제 브라우저 확인 |

## 이번 최종 점검에서 고친 문제

### Architecture 오류가 배포 검사에 빠져 있던 문제

`dev`에서 설계 진단 기능이 추가됐지만 새 UI가 아직 결과를 받지 않고 있었다.

이제 동작은 다음과 같다.

```text
Board 설계 진단
→ Terraform 화면에 오류와 경고 표시
→ 항목을 누르면 해당 Resource로 이동
→ 오류가 있으면 Safety Gate에서 Apply 차단
→ 경고는 비용·보안 finding과 함께 표시
```

### GitHub callback이 빈 화면이던 문제

GitHub App에서 돌아오는 `/integrations/github/callback`이 아무것도 그리지 않고 있었다.

이제 Repository 목록, 로딩, 오류, 권한 없음, 연결 중 상태를 보여준다. 사용자가 하나를 고른 뒤에만 프로젝트에 연결하고 Repository 분석 화면으로 이동한다.

### 배포 단계가 실제 상태와 다르던 문제

새 배포 화면이 저장, 검사, Plan, 승인, Apply 단계를 자체적으로 단순 계산하고 있었다.

이제 공용 배포 상태 계산기 하나만 사용한다. Terraform이 현재 Board보다 오래됐으면 재생성부터 안내하고, 검사를 하지 않았으면 배포 기준 저장을 막는다. Cleanup은 배포 이력 화면에서만 진행한다.

### AI 수정안이 실제 Terraform을 바로 바꿀 수 있던 문제

이제 AI가 Terraform 수정안을 만들면 바로 적용하지 않는다.

```text
현재 코드와 제안 코드를 함께 표시
→ 사용자가 비교 확인 체크
→ 수정 적용 버튼 활성화
→ 사용자가 적용 버튼 클릭
→ 문제가 있는 파일만 수정
```

실제 브라우저에서 `main.tf`에 잘못 넣은 쉼표를 검사한 뒤 AI 수정안을 열었다. 확인 전에는 적용 버튼이 꺼져 있었고, 취소하면 원래 코드가 유지됐다. 확인 후 적용했을 때는 `main.tf`의 쉼표만 없어졌으며 `providers.tf`는 그대로 남았다.

### Terraform 파일과 검사 결과가 한 덩어리로 보이던 문제

Terraform 결과를 가짜 단일 파일로 표시하지 않고 실제 파일 목록으로 나눈다. 현재 확인한 파일은 `providers.tf`와 `main.tf`다.

- 파일별 편집, 검사, Board 동기화
- 검사 항목을 누르면 해당 파일과 줄로 이동
- Board 동기화 제안을 항목별로 선택
- 저장하지 않은 편집 상태에서 화면을 떠날 때 확인

### 오래된 Safety 검사로 배포할 수 있던 문제

Board 또는 Terraform이 바뀌면 이전 Safety 검사 결과를 더는 최신 결과로 인정하지 않는다. 사용자는 변경된 상태를 다시 검사해야 다음 배포 단계로 갈 수 있다.

### 여러 Terraform 파일이 배포할 때 하나로 합쳐지던 문제

Workspace에는 `providers.tf`, `main.tf`처럼 여러 파일이 보이지만, 예전 저장 방식은 대표 코드 한 덩어리만 artifact로 남길 수 있었다.

이제 여러 파일은 파일명과 코드를 함께 담은 bundle로 저장한다.

```text
Workspace의 여러 .tf 파일
→ Terraform bundle artifact 저장
→ Plan, Apply 작업 폴더에서 원래 .tf 파일로 복원
→ Git handoff PR에서도 같은 파일명으로 복원
```

bundle 안의 파일명은 서버에서 다시 검사한다. 작업 폴더 밖으로 나가는 경로나 중복 파일명은 거절한다.

Plan과 승인 단계는 같은 정규화된 byte를 hash한다. 같은 bundle은 정상 승인되고, bundle 안의 파일 하나라도 바뀌면 `Plan 뒤 artifact 변경`으로 승인을 거절한다.

파일 경계도 승인 값에 포함한다. 예전처럼 주석 문자열로 파일을 이어 붙이지 않고, 파일명과 Terraform 원문을 JSON 구조로 보존한다. 따라서 파일 경계나 앞뒤 공백이 다르면 서로 다른 승인 대상으로 판단한다.

Safety 검사도 bundle을 합친 한 문자열로 보지 않는다. `providers.tf`, `main.tf`처럼 원래 파일명과 내용을 그대로 전달하므로, 검사 결과의 파일명과 줄 번호가 실제 편집 화면과 맞는다.

### 오래된 AI Board 제안이 최신 작업을 덮을 수 있던 문제

AI 요청을 보낸 뒤 사용자가 Board를 직접 바꾸면, 먼저 보낸 요청의 응답은 더 이상 현재 Board를 기준으로 만든 제안이 아니다.

이제 AI 요청을 보낸 순간의 Board와 응답을 받은 순간의 Board를 비교한다. 둘이 다르면 미리보기를 버리고 현재 Board 기준으로 다시 요청하라고 안내한다. 응답을 받은 뒤 적용 버튼을 누르기 전에 Board가 바뀐 경우도 한 번 더 확인하므로, 오래된 제안이 최신 작업을 덮어쓰지 못한다.

비교할 때는 Resource 정보뿐 아니라 잠금, 크기, 위치, 앞뒤 순서와 연결선도 포함한다. 화면을 둘러보기 위한 이동과 확대 값만 제외한다.

### Destroy Plan을 일반 Git handoff에 쓸 수 있던 문제

Cleanup을 위한 `Destroy Plan`은 Resource 삭제 계획이다. 이 계획을 일반 배포 PR의 승인 근거로 사용하면 안 된다.

이제 Git handoff API는 같은 Deployment와 Terraform artifact를 사용한 승인된 `Apply Plan`만 받는다. 승인된 `Destroy Plan` ID를 보내도 일반 Git PR 생성을 거절한다.

승인된 Plan의 Terraform hash는 GitHub PR 생성 단계까지 전달한다. GitHub에 파일을 올리기 직전에 S3에서 읽은 실제 내용을 다시 hash하고, 승인 뒤 파일이 바뀌었다면 GitHub API를 호출하기 전에 중단한다.

### AWS Role 변경을 미리 승인할 수 있던 문제

Git handoff 생성 요청에서 AWS Role 변경 승인 값을 받지 않게 바꿨다. handoff를 만드는 것과 AWS Role을 바꾸는 것은 별도 행동이다.

```text
Git handoff 생성
→ AWS Role 변경안은 미승인 상태로 생성
→ 사용자가 변경 내용을 확인
→ 별도 적용 버튼을 누름
→ 서버가 승인 사용자와 시각을 기록하고 적용
```

### 긴 배포 이력과 Cleanup 실패를 다시 처리하기 어려웠던 문제

배포 이력은 한 화면에 8개씩 보여준다. 검색어나 상태 조건을 바꾸면 첫 페이지로 돌아간다.

Cleanup 도중 실패하면 일부 Resource만 삭제됐을 수 있다고 알려준다. 사용자는 현재 AWS 상태를 확인한 뒤 Cleanup Plan을 다시 만들 수 있다.

### 운영 화면에 필요한 정보가 부족하던 문제

- 비용 화면: Resource별 예상 비용, 무료 Resource, 계산할 수 없는 Resource를 분리
- Plan: 승인자와 승인 시각 표시
- 배포 이력: 검색, 상태 필터, 실행자, 산출물, log 표시
- 배포 이력: 8개 단위 페이지 이동과 Cleanup 부분 실패 재계획
- Cleanup: 삭제할 Resource 범위를 적용 전에 표시
- Live Observation: 요청량, 처리 여유, instance 상태, CloudWatch 상태, Audience와 제한형 시연 요청 표시
- Git/CI/CD: 서버에서 받은 실제 Plan 산출물 ID와 사용자 확인이 모두 있어야 생성 가능하며, API도 승인 Deployment를 다시 확인
- AWS Role 변경: 사용자가 적용 버튼을 누른 시점에 명시적 승인 기록

## 실제 브라우저 E2E

직접 실행한 흐름:

```text
새 프로젝트
→ AI로 시작
→ 자연어 요구사항 입력
→ Architecture Draft PREVIEW 생성
→ 사용자가 Board에 적용
→ 실제 Workspace route 이동
```

```text
Workspace
→ AI 채팅 열기
→ 기존 대화 유지 확인
→ AI 닫기
→ Terraform 생성
→ providers.tf와 main.tf 파일 목록 확인
→ 잘못된 쉼표 입력 후 Validate
→ 오류 줄로 이동
→ AI 수정 전후 비교
→ 취소 시 원본 유지 확인
→ 사용자 확인 후 main.tf만 수정되는지 확인
```

```text
GitHub callback 직접 진입
→ callback 값이 없다는 오류와 다음 행동 표시
→ 빈 화면이 아닌지 확인
```

화면 크기:

- 375 x 812
- 768 x 1024
- 1280 x 720
- 1440 x 900
- 1920 x 1080

확인 결과:

- 가로 넘침 없음
- Board가 비어 보이지 않음
- AI panel은 모바일에서 전체 화면으로 열림
- AI panel을 닫아도 대화 유지
- 배포 panel과 AI panel이 동시에 Board를 가리지 않음
- 긴 AI 설명이 panel 안에서 줄바꿈됨
- desktop AI panel은 397~420px 범위로 열림
- mobile AI panel은 화면 전체 폭으로 열림
- Terraform, Safety, Git/CI/CD, Live Observation, Deployment, History panel 확인
- AI 수정 승인 전에는 Terraform이 바뀌지 않음
- browser console의 새 error와 warning 없음

## 자동 검증

통과:

```text
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
web test 전체
```

최종 로컬 결과:

- Web test: 759개 통과
- Terraform workspace, 배포와 Git/CI/CD API 집중 test: 60개 통과
- Plan, 승인, Apply, Cleanup 배포 lifecycle 집중 test: 36개 통과
- 이번 안전 경계 집중 test: 38개 통과
- `pnpm harness:check`: 통과
- `pnpm lint`: 통과
- `pnpm typecheck`: 통과
- `pnpm build`: 통과

`pnpm lint`에는 기존 Live Observation test helper의 사용하지 않는 인자 경고 1개가 남아 있지만, 오류는 없으며 이번 변경 파일에서 생긴 경고는 아니다.

API 전체 test에는 기존 Deployment Init test의 기대값 1건이 남아 있다. 실제 입력에 이미 포함되는 `contentType`을 다른 담당 test가 기대하지 않는 문제이며, 이번 gg 변경 파일과 관련된 test는 모두 통과했다.

관련 집중 테스트:

- Architecture 진단과 Safety Gate
- 배포 5단계와 명시적 승인
- GitHub callback 화면 계약
- 다중 Terraform 파일과 AI 수정안 비교
- Git/CI/CD 승인 산출물과 AWS Role 명시적 승인
- 다중 Terraform bundle 저장, 작업 폴더 복원, Git PR 파일 복원
- 오래된 AI Board 미리보기 응답·적용 차단
- 실제 Terraform 파일명과 내용을 유지한 Safety 검사
- Destroy Plan의 일반 Git handoff 재사용 차단
- Terraform bundle 파일 경계와 공백 hash 충돌 차단
- 승인 뒤 S3 Terraform 변경 시 GitHub 호출 차단
- AI Board의 잠금, 크기와 앞뒤 순서 변경 감지
- Workspace Live Observation

PR CI는 최신 커밋을 push한 뒤 다시 확인한다.

## 실제 AWS에서만 남는 확인

다음은 UI 미구현이 아니라 외부 실행 조건이 필요한 항목이다.

- 검증된 AWS Role로 실제 Plan 생성
- 사용자가 Plan을 승인한 뒤 실제 Apply
- 실제 실패 log의 AI 설명
- 실제 배포 Resource Cleanup
- GitHub App이 설치된 계정의 실제 callback 성공

이 동작의 버튼, API 연결, 상태 화면은 구현돼 있다. 실제 계정 변경은 사용자 승인 없이 실행하지 않는다.
