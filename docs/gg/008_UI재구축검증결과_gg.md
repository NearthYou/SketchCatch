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
| 12. E2E Visual QA | 완료 | 375px, 768px, 1280px 실제 브라우저 확인 |

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
→ 배포 panel 열기
→ Terraform 재생성부터 시작하는 5단계 확인
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

확인 결과:

- 가로 넘침 없음
- Board가 비어 보이지 않음
- AI panel은 모바일에서 전체 화면으로 열림
- AI panel을 닫아도 대화 유지
- 배포 panel과 AI panel이 동시에 Board를 가리지 않음
- 긴 AI 설명이 panel 안에서 줄바꿈됨
- browser console의 새 error와 warning 없음

## 자동 검증

통과:

```text
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
web test 전체
PR CI
```

관련 집중 테스트:

- Architecture 진단과 Safety Gate: 6개 통과
- 배포 5단계와 명시적 승인: 10개 통과
- GitHub callback 화면 계약: 1개 통과
- Terraform route: 19개 통과

로컬 전체 `pnpm test`에서는 UI와 관계없는 API 테스트가 남아 있다. 현재 로컬 Node 26에서 Windows 경로 구분자, Terraform 참조 문자열, AI 테스트 환경값 차이로 실패한다. 같은 커밋의 GitHub PR CI는 통과했다.

## 실제 AWS에서만 남는 확인

다음은 UI 미구현이 아니라 외부 실행 조건이 필요한 항목이다.

- 검증된 AWS Role로 실제 Plan 생성
- 사용자가 Plan을 승인한 뒤 실제 Apply
- 실제 실패 log의 AI 설명
- 실제 배포 Resource Cleanup
- GitHub App이 설치된 계정의 실제 callback 성공

이 동작의 버튼, API 연결, 상태 화면은 구현돼 있다. 실제 계정 변경은 사용자 승인 없이 실행하지 않는다.
