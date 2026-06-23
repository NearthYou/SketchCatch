# AI 작업 공유 발표 스크립트

## 목적

이 문서는 gg AI 브랜치에서 현재 만들어진 구현물을 팀원에게 설명하기 위한 공유용 스크립트다.

실제 `/workspace` 화면과 API 흐름을 보면서 설명하는 것을 기준으로 한다.

## 공유 전 준비

로컬 서버를 켜고 아래 화면을 연다.

```bash
npm exec --package=pnpm@11.8.0 -- pnpm --filter @sketchcatch/api dev
npm exec --package=pnpm@11.8.0 -- pnpm --dir apps/web exec next dev --port 3000
```

확인할 주소:

- Web: `http://localhost:3000/workspace`
- API health: `http://127.0.0.1:4000/health`

공유 전에 버튼 세 개를 직접 눌러본다.

1. `자연어 초안 생성`
2. `배포 전 점검`
3. `코드 설명 생성`

## 전체 공유 시나리오

### 1. 오프닝

말할 내용:

이번 브랜치에서 내가 만든 것은 “AI가 모든 걸 알아서 하는 기능”이 아니다.

현재 만든 것은 팀원 기능과 연결할 수 있는 AI 보조 API와 확인용 `/workspace` 화면이다.

핵심 원칙은 하나다.

AI는 실제 배포 판단이나 Terraform 최종 생성을 마음대로 하지 않는다. 코드가 만든 구조와 룰 기반 점검 결과를 초보자가 이해할 수 있게 설명하는 역할을 한다.

### 2. `/workspace` 화면 보여주기

화면에서 보여줄 것:

- 왼쪽 위 `Architecture Draft`
- 오른쪽 위 `Draft 결과`
- 왼쪽 아래 `비용/보안 점검`
- 오른쪽 아래 `Terraform Preview 설명`

말할 내용:

이 화면은 최종 서비스 화면이라기보다, gg AI 파트가 어떤 데이터를 만들고 어떤 응답을 주는지 확인하기 위한 작업대다.

여기서 중요한 것은 UI 디자인이 아니라 데이터 흐름이다.

자연어가 들어오면 Architecture Draft가 나오고, 그 결과를 가지고 배포 전 점검을 실행할 수 있다.

Terraform 코드도 넣으면 어떤 Resource를 만드는지, 위험한 설정이 있는지 설명을 받을 수 있다.

### 3. 자연어 → Architecture Draft 데모

실행:

`자연어 요청`에 아래 문장을 넣고 `자연어 초안 생성`을 누른다.

```text
DB가 포함된 백엔드 API 서버를 AWS에 배포하고 싶어.
```

말할 내용:

이 버튼은 `/api/ai/architecture-draft`를 호출한다.

응답은 긴 설명문이 아니라 `ArchitectureJson` 중심이다.

`ArchitectureJson`은 Architecture Board가 열 수 있는 설계도 JSON이다. 여기에는 `nodes`와 `edges`가 있다.

현재 예시에서는 VPC, Subnet, EC2, RDS, Security Group 같은 Resource 노드가 만들어진다.

여기서 jh 보드 파트가 봐야 할 핵심은 “AI가 만든 결과를 보드에서 열 수 있느냐”다.

### 4. 배포 전 점검 데모

실행:

Draft 결과가 나온 상태에서 `배포 전 점검`을 누른다.

말할 내용:

이 버튼은 `/api/ai/pre-deployment-check`를 호출한다.

입력은 방금 만든 `ArchitectureJson`이다.

응답은 `summary`, `totalMonthlyEstimate`, `resourceCostEstimates`, `findings`, `checklist`로 온다.

여기서 중요한 것은 `findings`다.

예를 들어 RDS가 있으면 월 비용이 생길 수 있고, Security Group에 SSH가 `0.0.0.0/0`으로 열려 있으면 보안 위험으로 잡을 수 있다.

AI가 위험을 마음대로 상상하는 게 아니라, 룰 기반 점검 결과를 만들고 그걸 사람이 이해하기 쉽게 보여주는 흐름이다.

### 5. Terraform Preview 설명 데모

실행:

오른쪽 아래 Terraform 코드 영역에서 `코드 설명 생성`을 누른다.

말할 내용:

이 버튼은 `/api/ai/terraform-preview-explanation`을 호출한다.

여기서 AI는 Terraform 최종본을 생성해서 배포하는 게 아니다.

이미 있는 IaC Preview 또는 Terraform 코드가 무엇을 만들고, 위험한 설정이 있는지를 설명한다.

예를 들어 `aws_instance`가 있으면 EC2 Instance를 만든다고 설명하고, `aws_security_group_rule`에서 SSH가 전체 공개로 열려 있으면 보안 finding을 붙인다.

이 부분은 sw Terraform 변환 파트와 연결된다.

sw가 만든 IaC Preview를 gg AI API에 넘기면, 사용자가 이해할 수 있는 설명을 붙일 수 있다.

### 6. Terraform 오류 설명은 화면에는 아직 없다고 말하기

말할 내용:

현재 `/workspace` 화면에는 Terraform 오류 설명 버튼은 아직 따로 없다.

하지만 API는 만들어져 있다.

endpoint는 `/api/ai/terraform-error-explanation`이다.

ck 배포 파트에서 Plan이나 Apply 실패가 나면 아래처럼 넘기면 된다.

```ts
{
  stage: "plan",
  rawMessage: "AccessDenied: ...",
  relatedResourceId: "backend-server"
}
```

그러면 AI는 권한 문제인지, region 문제인지, quota 문제인지, 문법 문제인지 분류해서 초보자용 설명과 다음 행동을 반환한다.

### 7. GitHub 링크 기반 초안은 어떻게 설명할지

말할 내용:

GitHub 링크 기반 초안도 API와 화면 입력은 준비돼 있다.

endpoint는 `/api/ai/github-architecture-draft`다.

MVP에서는 전체 코드를 분석하지 않는다.

대상은 public Source Repository이고, README, package metadata, Dockerfile, docker-compose file 정도만 evidence로 사용한다.

이유는 속도와 안정성 때문이다.

전체 코드를 LLM에게 다 던지면 비용도 커지고, 틀릴 가능성도 커지고, 민감한 코드 처리 문제가 생긴다.

그래서 지금은 “초안 생성용 힌트” 정도로만 쓴다.

## 파트별 연결 설명은 별도 문서로 공유

팀원별로 어떤 데이터 타입을 봐야 하는지, 어느 API를 연결해야 하는지, 어떤 말을 해주면 되는지는 아래 문서로 분리했다.

- [파트별 AI 연결 시나리오](./006_파트별AI연결시나리오_gg.md)

## 회의에서 그대로 말할 짧은 버전

이번 브랜치에서 gg AI 파트는 실제로 눌러볼 수 있는 API와 `/workspace` 확인 화면을 만들었다.

자연어 또는 Source Repository URL을 넣으면 Architecture Draft가 나오고, 그 결과는 `ArchitectureJson`으로 온다.

이 `ArchitectureJson`은 jh 보드, sw Terraform 변환, gg Pre-Deployment Check가 같이 보는 중심 데이터다.

배포 전 점검은 비용, 보안, 설정 문제를 `CheckFinding`과 `ChecklistItem`으로 반환한다.

Terraform Preview 설명은 sw가 만든 IaC Preview를 사용자가 이해할 수 있게 바꿔준다.

Terraform 오류 설명은 ck가 Plan/Apply 실패 메시지를 넘기면 원인과 다음 행동을 쉬운 말로 반환한다.

ys는 프로젝트 목록에 AI 결과를 다 넣기보다는 프로젝트 상세나 작업 화면에서 AI 요약을 보여주는 방향이 좋다.

중요한 원칙은 AI가 실제 배포 판단을 하지 않는다는 것이다.

AI는 안전한 보조 계층이고, 생성과 검증의 기준은 공통 타입과 deterministic code에 둔다.

## 팀원에게 마지막으로 요청할 것

jh:

`ArchitectureJson.nodes`, `ArchitectureJson.edges`, `CheckFinding.resourceId` 연결이 보드에서 가능한지 확인해달라.

sw:

Terraform 생성 원천을 `ArchitectureJson`으로 두고, 생성된 IaC Preview 문자열을 AI 설명 API에 넘길 수 있는지 확인해달라.

ck:

Plan/Apply 오류 설명 API에 넘길 payload를 `{ stage, rawMessage, relatedResourceId? }`로 맞출 수 있는지 확인해달라.

ys:

AI 요약을 프로젝트 목록이 아니라 프로젝트 상세나 작업 화면에 optional로 붙이는 흐름이 가능한지 확인해달라.
