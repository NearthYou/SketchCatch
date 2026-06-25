# gg AI 파트 책임자용 설명서

이 문서는 gg가 팀원 질문에 대답하려고 보는 문서다.

목표는 하나다.

> 내가 지금 AI 파트에서 뭘 맡고 있고, 코드에서 어디를 보면 되는지 바로 알기

어렵게 말하지 않고, 실제로 팀원에게 설명할 수 있는 말로 정리한다.

---

## 1. gg AI 파트가 하는 일

gg AI 파트는 직접 배포하지 않는다.

gg AI 파트는 사용자가 만든 설계도나 Terraform 코드를 보고 아래 일을 한다.

```text
1. 자연어 요청을 ArchitectureJson 초안으로 바꾼다.
2. GitHub 링크를 보고 ArchitectureJson 초안을 만든다.
3. ArchitectureJson을 보고 비용/보안/설정 위험을 찾는다.
4. Terraform 오류를 쉬운 말로 설명한다.
5. Terraform 코드가 무엇을 만드는지 설명한다.
```

한 줄로 말하면 이렇다.

```text
gg AI는 설계와 배포를 대신 실행하는 파트가 아니라,
설계 초안과 위험 설명을 만들어주는 파트다.
```

---

## 2. gg AI 파트가 하지 않는 일

이걸 꼭 기억해야 한다.

gg AI는 아래 일을 직접 하지 않는다.

```text
- 프로젝트 저장
- 다이어그램 저장
- Terraform 파일 저장
- Terraform state 저장
- AWS 배포 실행
- 배포 이력 저장
- 배포 로그 저장
- 사용자 알림 저장
- AWS Access Key 저장
```

이유는 간단하다.

```text
AI가 만든 결과는 "추천"이나 "설명"이다.
저장은 그 결과를 실제로 쓰는 파트가 하는 게 자연스럽다.
```

예를 들면:

```text
AI가 ArchitectureJson 초안을 만든다
→ jh 보드가 사용자가 확정한 설계를 저장한다

AI가 배포 전 위험 분석을 만든다
→ ck 배포 파트가 Plan/Apply 흐름에서 필요하면 저장한다

AI가 프로젝트 요약을 만든다
→ ys 플랫폼 파트가 목록/대시보드에서 필요하면 저장한다
```

---

## 3. 제일 먼저 봐야 할 코드

코드를 처음 볼 때는 이 순서로 보면 된다.

### 1번. 공통 타입

```text
packages/types/src/index.ts
```

여기에 팀끼리 같이 쓰는 타입이 있다.

중요한 타입:

```text
ArchitectureJson
ResourceNode
ResourceEdge
CreateArchitectureDraftRequest
AiArchitectureDraftResult
AiPreDeploymentAnalysisResult
CheckFinding
ChecklistItem
AiTerraformErrorExplanationResult
AiTerraformPreviewExplanationResult
```

쉽게 말하면:

```text
여기는 gg, jh, sw, ck, ys가 같이 보는 약속장이다.
```

### 2번. AI API 입구

```text
apps/api/src/routes/ai.ts
```

여기는 프론트나 다른 파트가 AI 기능을 호출하는 입구다.

여기에 있는 API:

```text
POST /api/ai/architecture-draft
POST /api/ai/github-architecture-draft
POST /api/ai/pre-deployment-check
POST /api/ai/terraform-error-explanation
POST /api/ai/terraform-preview-explanation
```

쉽게 말하면:

```text
누가 AI한테 요청을 보내면, 제일 먼저 여기로 온다.
```

### 3번. 자연어/GitHub → 설계 초안

```text
apps/api/src/services/aiArchitectureDrafts.ts
```

여기는 자연어 요청을 `ArchitectureJson`으로 바꾸는 곳이다.

현재는 진짜 외부 AI가 자유롭게 설계하는 게 아니다.

정해진 템플릿 중 하나를 고른다.

```text
정적 웹사이트
→ S3 + CloudFront

API 서버
→ VPC + Subnet + Security Group + EC2

DB 포함 백엔드
→ VPC + Subnet + Security Group + EC2 + RDS
```

운영 조건도 여기로 들어온다.

```text
예산
트래픽
보안 우선순위
```

주의:

```text
현재 운영 조건은 구조를 크게 바꾸는 로직까지는 아직 부족하다.
다음 작업에서 운영 조건에 따라 리소스 목록, 연결선, 설정값이 실제로 바뀌게 해야 한다.
```

### 4번. 배포 전 비용/보안/설정 점검

```text
apps/api/src/services/aiPreDeploymentAnalysis.ts
```

여기는 `ArchitectureJson`을 받아서 위험을 찾는 입구다.

실제 규칙은 아래 파일로 나뉘어 있다.

```text
apps/api/src/services/aiPreDeploymentSecurity.ts
apps/api/src/services/aiPreDeploymentCost.ts
apps/api/src/services/aiPreDeploymentConfiguration.ts
```

쉽게 말하면:

```text
ArchitectureJson 안에 있는 리소스를 하나씩 보면서
"위험한 거 있나?"를 확인한다.
```

현재 잡는 대표 위험:

```text
Security Group에서 SSH 22번이 0.0.0.0/0으로 열림
RDS는 연습 비용이 커질 수 있음
필수 설정값이 비어 있음
```

### 5번. Terraform 오류 설명

```text
apps/api/src/services/aiTerraformErrorExplanation.ts
```

여기는 Terraform 오류 메시지를 쉬운 말로 바꾼다.

예:

```text
AccessDenied
→ AWS 권한이 부족할 가능성이 큽니다.

region 관련 오류
→ 선택한 region에 리소스가 없거나 region 설정이 맞지 않을 수 있습니다.
```

### 6번. Terraform 코드 설명

```text
apps/api/src/services/aiTerraformPreviewExplanation.ts
```

여기는 Terraform 코드 조각을 보고 무엇을 만드는지 설명한다.

예:

```text
aws_instance
→ EC2 인스턴스를 만듭니다.

aws_security_group_rule + 0.0.0.0/0 + 22
→ SSH가 전체 인터넷에 열릴 수 있습니다.
```

### 7번. 임시 테스트 화면

```text
apps/web/app/workspace/AiWorkspaceClient.tsx
```

여기는 팀 발표나 기능 확인용 임시 화면이다.

중요:

```text
최종 보드 UI가 붙으면 이 화면은 대체될 수 있다.
```

하지만 지금은 gg AI API를 직접 눌러보는 가장 쉬운 화면이다.

---

## 4. 지금 화면에서 눌러볼 수 있는 것

브라우저에서 이 주소를 연다.

```text
http://127.0.0.1:3000/workspace
```

### 자연어 초안 생성

사용자가 원하는 구조를 문장으로 적고 버튼을 누른다.

예:

```text
DB가 포함된 백엔드 API 서버를 AWS에 배포하고 싶어.
```

결과:

```text
ArchitectureJson 초안이 만들어진다.
Draft 결과에 리소스 칩이 나온다.
```

### GitHub 초안 생성

GitHub public repository URL을 넣고 버튼을 누른다.

현재는 전체 코드를 분석하지 않는다.

가볍게 보는 파일:

```text
README.md
package.json
Dockerfile
docker-compose.yml
```

### 배포 전 점검

먼저 Architecture Draft를 만든 뒤 누른다.

결과:

```text
비용 finding
보안 finding
설정 finding
checklist
```

### Terraform 코드 설명 생성

Terraform 코드 조각을 넣고 누른다.

결과:

```text
이 코드가 어떤 리소스를 만드는지 설명한다.
위험한 부분이 있으면 같이 알려준다.
```

---

## 5. 팀원별로 내가 대답해야 하는 말

### jh가 물어볼 때

질문:

```text
AI 초안을 보드에서 어떻게 열어?
```

답:

```text
AI 응답 안에 architectureJson이 있어.
보드는 그 안의 리소스 목록과 연결선을 읽으면 돼.
리소스 타입은 packages/types의 ResourceType을 같이 쓰면 돼.
```

중요한 타입:

```text
ArchitectureJson
ResourceNode
ResourceEdge
ResourceType
```

### sw가 물어볼 때

질문:

```text
Terraform 생성은 AI 응답을 보고 해?
```

답:

```text
아니.
Terraform 생성 기준은 ArchitectureJson이야.
AI 설명 정보가 아니라 architectureJson 안의 리소스 목록과 연결선을 기준으로 보면 돼.
```

추가로 말할 것:

```text
ResourceNode.config는 리소스 설정값이야.
예를 들면 EC2의 instanceType, RDS의 engine 같은 값이 들어가.
이 설정값 이름은 sw Terraform 생성기가 필요한 모양에 맞춰야 해.
gg AI는 그 이름을 따라가는 쪽이 맞아.
```

### ck가 물어볼 때

질문:

```text
Plan/Apply 오류를 AI한테 뭘 보내야 해?
```

답:

```text
최소한 stage와 rawMessage를 보내면 돼.
relatedResourceId는 있으면 같이 보내면 좋아.
```

모양:

```text
{
  "stage": "plan",
  "rawMessage": "AccessDenied...",
  "relatedResourceId": "backend-server"
}
```

주의:

```text
secret이나 AWS key는 AI한테 보내면 안 돼.
로그는 ck 쪽에서 먼저 마스킹해야 해.
```

### ys가 물어볼 때

질문:

```text
AI 결과를 프로젝트 목록에 저장해서 보여줘야 해?
```

답:

```text
MVP에서는 꼭 저장하지 않아도 돼.
프로젝트 목록은 가볍게 두고,
AI 분석 결과는 프로젝트 상세나 작업 화면에서 요청할 때 보여줘도 돼.
```

나중에 저장할 후보:

```text
highestSeverity
findingCount
estimatedMonthlyCost
summary
updatedAt
```

---

## 6. DB는 누가 쓰는가

gg AI 파트는 지금 DB를 직접 쓰지 않는다.

gg는 계산해서 응답만 돌려준다.

```text
요청 받음
→ 계산
→ 응답 반환
```

저장은 보통 다른 파트가 한다.

```text
jh
→ ArchitectureJson 저장

sw
→ Terraform 코드, artifact, state 저장

ck
→ plan 결과, apply 로그, 배포 이력 저장

ys
→ 프로젝트, 활동 내역, 알림 저장
```

gg가 나중에 DB에 저장할 수 있는 후보는 있다.

하지만 MVP 필수는 아니다.

후보:

```text
AI 분석 결과 캐시
AI 요청 로그
외부 AI 사용량
토큰 비용
```

한 줄로 말하면:

```text
gg는 저장 담당이 아니라 계산/설명 담당이다.
```

---

## 7. 지금 구현의 한계

이 부분은 솔직히 알고 있어야 한다.

### 1. 아직 진짜 외부 AI 연결이 아니다

현재는 외부 OpenAI API 없이도 돌아가는 기본 응답 구조다.

즉:

```text
진짜 AI가 자유롭게 설계하는 게 아니라,
정해진 템플릿과 규칙으로 응답한다.
```

이렇게 한 이유:

```text
팀 연결을 먼저 안정화하려고
외부 AI가 이상한 Terraform이나 이상한 AWS 구조를 만들지 못하게 하려고
```

### 2. 운영 조건 반영이 아직 부족하다

현재 선택지는 있다.

```text
예산
트래픽
보안 우선순위
```

하지만 다음 단계에서는 이 값들이 실제 구조를 바꿔야 한다.

예:

```text
예산 낮게
→ 작은 인스턴스, 단순 구조

트래픽 보통
→ ALB나 확장 구조 후보

보안 높음
→ private subnet, DB public 접근 차단, security group 더 제한
```

중요:

```text
운영 조건이 설명만 바꾸면 안 된다.
ArchitectureJson 안의 리소스 목록, 연결선, 설정값에 실제 차이가 생겨야 한다.
```

### 3. 비용은 실제 AWS 가격 API가 아니다

현재 비용은 실제 가격이 아니라 연습용 기본값이다.

예:

```text
RDS는 월 15 USD 정도로 보여주는 식
```

정확한 비용 계산은 나중에 고도화가 필요하다.

---

## 8. 팀원이 물으면 이렇게 말하면 된다

### 질문: gg AI는 뭘 책임져?

답:

```text
ArchitectureJson 초안 생성,
비용/보안/설정 위험 분석,
Terraform 오류 설명,
Terraform 코드 설명을 책임져.
저장이나 배포 실행은 다른 파트가 책임져.
```

### 질문: AI 초안 결과는 어떤 모양이야?

답:

```text
AiArchitectureDraftResult로 오고,
그 안에 architectureJson이 있어.
보드나 Terraform 생성기는 architectureJson을 보면 돼.
```

### 질문: 진짜 AI 붙어 있어?

답:

```text
아직은 아니야.
지금은 외부 AI 없이도 돌아가는 정해진 규칙 응답이야.
그래서 같은 입력이면 거의 같은 결과가 나와.
```

### 질문: 운영 조건 바꾸면 뭐가 바뀌어?

답:

```text
바뀌어야 하는 게 맞아.
다음 작업에서 예산/트래픽/보안에 따라 ArchitectureJson 구조와 설정값이 바뀌도록 고쳐야 해.
단순 설명만 바꾸는 건 부족해.
```

### 질문: DB에 저장하는 건 gg가 해?

답:

```text
아니.
gg는 계산해서 응답을 돌려주고,
그 결과를 저장할지는 결과를 쓰는 파트가 결정하는 게 맞아.
```

### 질문: 보안 분석은 어디서 봐?

답:

```text
apps/api/src/services/aiPreDeploymentSecurity.ts
```

### 질문: 비용 분석은 어디서 봐?

답:

```text
apps/api/src/services/aiPreDeploymentCost.ts
```

### 질문: AI API는 어디서 봐?

답:

```text
apps/api/src/routes/ai.ts
```

---

## 9. 내가 코드 볼 때 추천 순서

처음부터 전부 보려고 하면 헷갈린다.

이 순서로 보면 된다.

```text
1. packages/types/src/index.ts
   → 팀끼리 주고받는 데이터 모양 확인

2. apps/api/src/routes/ai.ts
   → AI API 입구 확인

3. apps/api/src/services/aiArchitectureDrafts.ts
   → 자연어/GitHub 초안 생성 확인

4. apps/api/src/services/aiPreDeploymentAnalysis.ts
   → 비용/보안/설정 점검 전체 흐름 확인

5. apps/api/src/services/aiPreDeploymentSecurity.ts
   → 보안 규칙 확인

6. apps/api/src/services/aiPreDeploymentCost.ts
   → 비용 규칙 확인

7. apps/api/src/services/aiTerraformErrorExplanation.ts
   → Terraform 오류 설명 확인

8. apps/api/src/services/aiTerraformPreviewExplanation.ts
   → Terraform 코드 설명 확인

9. apps/web/app/workspace/AiWorkspaceClient.tsx
   → 화면에서 API를 어떻게 눌러보는지 확인
```

---

## 10. 지금 바로 외워야 하는 한 문장

```text
gg AI 파트는 저장/배포 담당이 아니라,
ArchitectureJson 초안과 비용/보안/오류 설명을 만들어서
다른 파트가 쓸 수 있게 넘겨주는 담당이다.
```
