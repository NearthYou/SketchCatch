# GitHub Repository Analysis와 Template Selection 화면 QA 매뉴얼

## 이 매뉴얼의 범위

이 기능은 Template Gallery에서 사용자가 임의로 Template을 고르는 작업이 아니다.

GitHub Source Repository를 연결한 뒤 Repository Analysis가 정적 evidence만 읽어 Template 하나를 선택하고, 그 결과를 AI Handoff까지 이어 주는 흐름을 확인한다.

gg의 책임은 Repository Analysis, Template Selection, 선택 근거 전달까지다. AI는 전달받은 Template을 바꾸지 않고 부족한 요구사항만 보완한다.

## 시작 전 확인

- Web은 3000이 아닌 포트에서 실행한다.
- QA 대상 계정은 GitHub OAuth가 연결되어 있고 GitHub App이 접근 가능한 Repository가 있어야 한다.
- 실제 Repository 코드를 실행하거나, GitHub에 파일을 쓰거나, AWS Deployment를 실행하지 않는다.
- 성공용 Repository와 실패용 Repository를 각각 준비하면 전체 상태를 확인하기 쉽다.

## 1. Repository 연결

1. 로그인한다.
2. 왼쪽 메뉴에서 `Projects`를 누르고 QA할 프로젝트를 연다.
3. `Project Settings`로 이동한다.
4. `Source Repository 연결` 화면에서 `연결 가능한 repository 보기`를 누른다.
5. 처음 연결하는 계정이면 `GitHub App 설치/권한 추가`를 눌러 GitHub App 권한을 완료한다.
6. 목록에서 Repository를 고르고 `이 repository 연결`을 누른다.

확인할 결과:

- 현재 repository 이름, 기본 branch, `active` 상태가 카드에 보인다.
- 내 GitHub 계정이 접근하지 못하는 설치 계정의 Repository는 목록에 보이지 않는다.
- 연결이 끊겼거나 권한이 부족하면 사용자가 이해할 수 있는 한국어 오류가 보인다.

## 2. 성공하는 Template Selection

1. 연결된 Repository 카드에서 `Repository 분석`을 누른다.
2. 분석 중 `Repository 분석 중` 버튼과 정적 분석 안내를 확인한다.
3. 버튼이 비활성화되어 같은 분석을 두 번 시작할 수 없는지 확인한다.
4. 분석이 끝날 때까지 기다린다.

성공 결과에서 확인할 항목:

- 분석한 Repository 이름과 revision
- `Application Units`의 이름, 경로, 감지 근거
- 선택된 AWS Template 이름과 `Template ID`
- Template Selection 근거
- 감지하지 못한 evidence

예를 들어 Vite frontend evidence가 있는 Repository는 `Static Web Hosting`과 `static-web-hosting`이 표시될 수 있다. 이 값은 예시일 뿐이며, 실제 선택 결과는 Repository evidence에 따라 달라진다.

## 3. Template Selection Failure

1. 지원 Template을 고를 만한 배포 evidence가 부족하거나 서로 맞지 않는 Repository를 연결한다.
2. 같은 방식으로 `Repository 분석`을 누른다.

확인할 결과:

- 선택된 Template 이름이나 ID가 표시되지 않는다.
- `Template Selection Failure` 상태가 보인다.
- 어떤 evidence가 맞지 않았는지와 부족한 evidence가 표시된다.
- 가장 가까운 Template을 임의로 고르거나 AI Handoff 링크를 보여주지 않는다.

## 4. 저장 결과 복원

1. 성공 또는 실패 결과가 보이는 Project Settings 화면을 새로고침한다.
2. 프로젝트 목록으로 갔다가 같은 Project Settings 화면으로 다시 돌아온다.

확인할 결과:

- 마지막 분석의 revision, 분석 시각, Application Units, evidence, 성공 또는 실패 상태가 유지된다.
- 분석 버튼을 다시 누르기 전에도 저장된 결과를 읽을 수 있다.

## 5. 선택된 Template을 AI에 전달

성공한 Template Selection에서만 다음을 진행한다.

1. `선택한 Template을 AI 보완으로 넘기기`를 누른다.
2. Workspace가 열리면 보드에 선택된 TemplateDefinition의 Resource가 생성됐는지 확인한다.
3. `AI 채팅 열기`를 누른다.
4. `AI는 이 Template을 바꾸지 않고 부족한 요구사항만 보완합니다.` 안내와 선택된 Template 이름·ID를 확인한다.
5. AI 입력창에 예를 들어 `HTTPS와 이미지 캐시 정책을 추가해줘`를 입력하고 `보내기`를 누른다.

확인할 결과:

- AI는 선택된 Template을 유지한 채 부족한 요구사항을 질문하거나 보완한다.
- `EC2와 RDS 기반 3계층으로 바꿔줘`처럼 다른 Template으로 교체하라는 요청은 즉시 교체하지 않고 추가 확인이 필요한 상태로 처리한다.

## 6. Template 변조 차단 확인

이 항목은 개발자 QA다. 성공 결과에서 Workspace로 이동한 뒤 URL의 `templateId`를 다른 값으로 바꿔 다시 연다.

확인할 결과:

- URL 값이 아니라 저장된 project/source Repository Analysis의 Template을 기준으로 검증한다.
- 다른 Template ID로 바꾸면 Workspace 진입 전에 한국어 오류가 표시된다.
- 서버 API에서도 `409 REPOSITORY_ANALYSIS_TEMPLATE_MISMATCH`로 거부한다.

## 7. 반응형과 오류 확인

1. 데스크톱 폭과 모바일 폭에서 Project Settings를 각각 연다.
2. Repository 이름, revision, evidence 목록, `Repository 분석` 버튼, AI Handoff 링크를 확인한다.
3. 브라우저 개발자 도구에서 Console과 Network를 확인한다.

확인할 결과:

- 결과 카드가 잘리지 않고 버튼과 링크를 누를 수 있다.
- 분석 중에는 중복 실행이 막힌다.
- 분석 성공·실패·연결 해제·identity 불일치·GitHub 인증 오류가 각기 한국어로 설명된다.
- Console error, 실패한 네트워크 요청, 예상하지 못한 HTTP 4xx/5xx가 없다.

## QA 기록 형식

QA 결과에는 아래만 남긴다. 비밀번호, token, GitHub App private key, AWS 자격 증명은 기록하지 않는다.

| 항목 | 기록 예시 |
| --- | --- |
| 화면 경로 | `/dashboard/projects/{projectId}/settings` |
| Repository | `owner/repository` |
| revision | commit SHA 앞부분 |
| 결과 | Template Selection 성공 또는 Failure |
| 선택 Template | 성공한 경우의 이름과 ID |
| 새로고침 복원 | 통과 또는 실패 |
| AI Handoff | 통과 또는 실패 |
| Console/Network | 오류 없음 또는 오류 요약 |
