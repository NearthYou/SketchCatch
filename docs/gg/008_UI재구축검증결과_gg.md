# UI 재구축 검증 결과

## 1. 먼저 알아둘 것

이번 작업은 기존 기능 연결을 살리면서 화면을 새로 만든 작업이다.

실제 API, `DiagramJson`, Architecture Board, Terraform Preview, 배포 흐름은 그대로 연결했다. 화면에만 있는 가짜 성공 결과는 만들지 않았다.

## 2. 마일스톤 결과

| 마일스톤 | 결과 | 확인 내용 |
| --- | --- | --- |
| 0. 현재 구조 분석 | 완료 | route, feature, API 연결 위치를 문서로 정리 |
| 1. Landing / Root | 완료 | Landing, 로그인, 회원가입 화면 재구축 |
| 2. Dashboard Shell | 완료 | Overview, Projects, Cost, Templates, Settings 연결 |
| 3. 새 프로젝트 시작 | 완료 | AI, Reverse Engineering, Template, GitHub Repo, 빈 Board 진입 유지 |
| 4. Workspace / Board Shell | 완료 | Board, 좌우 panel, 저장, Terraform, Deploy 연결 유지 |
| 5. AI 시작 화면 | 일부 완료 | Workspace 안 AI dock은 연결됨. `/workspace/ai`는 오래된 화면이라 건드리지 말라는 지시에 따라 그대로 둠 |
| 6. Reverse Engineering | 완료 | 전용 시작 화면, 후보 선택, 미리보기, Resource 확인 흐름 연결 |
| 7. Right Panel / Deploy Console | 화면과 계약 완료 | Resource Inspector, Terraform Preview, Issues, Deploy Console을 재구축. 실제 AWS Plan/Apply는 검증된 AWS 연결이 있어야 최종 E2E 가능 |
| 8. Template Gallery | 완료 | Dashboard, 새 프로젝트, 현재 Board가 같은 Template 목록과 Gallery 사용 |
| 9. E2E Visual QA | 가능한 범위 완료 | 실제 Chrome에서 로그인, Template 검색, 시작 화면 전달, Terraform, Deploy Console 확인. 실제 AWS 배포 E2E는 미실행 |

## 3. 현재 route 상태

| route | 현재 상태 |
| --- | --- |
| `/` | 새 Landing |
| `/login`, `/signup` | 새 인증 화면과 실제 인증 연결 |
| `/dashboard` | 실제 프로젝트와 배포 상태를 읽는 Overview |
| `/dashboard/projects` | 실제 프로젝트 목록 |
| `/dashboard/costs` | 실제 AWS 비용과 분리된 상태 표시 |
| `/dashboard/templates` | 검색, Tag, 정렬, Architecture 미리보기 제공 |
| `/dashboard/settings` | AWS Role과 GitHub 설정 진입 |
| `/workspace/new` | 다섯 가지 시작 방식과 Template Gallery 제공 |
| `/workspace` | Architecture Board, Resource, Terraform, Issues, Deploy 연결 |
| `/workspace/reverse` | Reverse Engineering 전용 흐름 |
| `/workspace/ai` | 오래된 화면이며 이번 작업에서 수정하지 않음 |

## 4. 이번에 실제로 확인한 흐름

```text
로그인
→ Dashboard Template Gallery
→ CloudFront 검색
→ Template 1개로 필터됨
→ 이 Template으로 시작
→ 새 프로젝트 화면에서 Template 방식과 해당 Template이 선택됨
```

```text
로그인
→ 테스트 프로젝트 생성
→ Workspace 열기
→ Terraform 버튼
→ Terraform Preview와 Issues 영역 표시
→ Deploy 버튼
→ 저장 → 검사 → 배포 단계 표시
```

확인한 화면 크기:

- Desktop: 1440 x 1000
- Tablet: 768 x 1024
- Mobile: 375 x 812

세 크기에서 가로 넘침이 없었다.

## 5. QA 중 고친 문제

### 빈 Terraform Preview

빈 Board인데 VPC 예시 코드가 실제 생성 결과처럼 보였다.

이제 아래 문구가 placeholder로 보인다.

```text
# Board에 Resource를 추가하면 Terraform Preview가 여기에 표시됩니다.
```

실제 textarea 값이 빈 문자열인 것도 확인했다.

### Deploy Console 파란색

현재 배포 단계와 안내 상자에 파란색이 남아 있었다.

현재 단계는 검정, 안내 상자는 중립 회색으로 바꿨다. 완료와 실패의 초록색, 빨간색은 상태를 구분하기 위해 유지했다.

## 6. Template 연결

세 화면이 모두 `listBoardTemplates()`를 사용한다.

- Dashboard Template Gallery
- 새 프로젝트의 Template 선택
- 현재 Board의 Template 큰 모달

지원하는 탐색 기능:

- 이름, 설명, Tag 검색
- Tag 필터
- 추천순, 이름순, Resource 많은 순 정렬
- 실제 `DiagramJson` node와 edge를 이용한 미리보기

현재 Board에 Template을 적용할 때는 기존 Board를 먼저 `localStorage`에 백업한다.

## 7. 아직 실제 기능처럼 보이면 안 되는 부분

- 사용자 Template 저장은 아직 연결되지 않았다.
- GitHub Repo 연결은 있지만 Repository Analysis와 Template Selection은 아직 연결 중이다.
- `/workspace/ai`는 오래된 화면이다.
- AWS 연결이 없는 상태에서는 실제 Plan, Apply, Cleanup 성공까지 검증할 수 없다.
- 전체 웹 테스트 중 다른 담당 문서 `docs/jh/000_AWS리소스목록_JH.md`가 없어서 1개가 실패한다. gg 파일은 수정하지 않았다.

## 8. 검증 결과

통과:

```text
web typecheck
web lint
web build
Terraform / Workspace 관련 test 102개
Template 관련 test 13개
```

전체 web test:

```text
669개 중 668개 통과
1개 실패: docs/jh/000_AWS리소스목록_JH.md 파일 없음
```

이 실패는 이번 UI 변경과 관계없고 다른 담당 문서라 수정하지 않았다.

## 9. 다음 작업에서 먼저 볼 것

1. `/workspace/ai`를 새 AI 시작 화면으로 교체할지 결정
2. Repository Analysis와 Template Selection 실제 API 연결
3. 검증된 AWS Role로 Safety, Plan, Apply, History, Cleanup 전체 E2E
4. 실제 High Risk, Medium, Low finding 상태별 화면 확인
5. 실제 긴 Deployment log와 sensitive output masking 확인
