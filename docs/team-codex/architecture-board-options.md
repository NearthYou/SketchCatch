# 정현 Codex용 Architecture Board 선택지

> 상태: 경근 AI 파트와의 호환성 확인을 위한 검토용 선택지다. 추천안은 확정이 아니라 제안이다.

너는 SketchCatch 정현 파트 Codex다. 구현 전에 경근 AI 파트와 Architecture Board가 같은 계약으로 연결될 수 있는지 확인하고 선택지를 골라라.

## 먼저 읽을 문서

- [데이터 모델](../data-models.md)
- [AI MVP 범위](../strategy/ai-mvp-scope.md)
- `packages/types/src/index.ts`
- `apps/api/src/routes/projects.ts`

## 선택할 것

### 1. `ResourceType` 호환 방식

**A. 공통 `ResourceType`을 그대로 받는다. (추천)**

- 값: `VPC`, `SUBNET`, `EC2`, `RDS`, `S3`, `SECURITY_GROUP`, `CLOUDFRONT`, `LAMBDA`, `UNKNOWN`
- 장점: AI, 보드, Terraform 생성기, API validation이 같은 문자열을 쓴다.
- 경근 AI 파트 영향: AI Architecture Draft가 이 값만 생성하면 된다.

**B. 보드 내부에서 별도 label/type alias를 둔다.**

- 예: `SECURITY_GROUP`을 화면에서는 `Security Group`으로 표시한다.
- 장점: UI 표시는 자연스러울 수 있다.
- 위험: 저장/전송 type과 표시 label을 섞으면 Codex들이 다른 문자열을 만들 수 있다.

**C. 보드가 모르는 타입은 전부 `UNKNOWN`으로 받는다.**

- 장점: 보드가 덜 깨진다.
- 위험: AI가 만든 초안의 의미가 사라지고 Terraform 생성과 비용 분석 연결이 약해진다.

### 2. Architecture Draft 입력 방식

**A. 보드는 `AiArchitectureDraftResult.architectureJson`만 필수 입력으로 받는다. (추천)**

- AI metadata인 `title`, `source`, `confidence`, `assumptions`, `explanations`는 보조 표시용이다.
- 장점: 보드는 AI 의존 없이 `ArchitectureJson`만으로 열릴 수 있다.

**B. 보드가 AI metadata까지 필수로 받는다.**

- 장점: AI 설명 UI를 한 번에 만들 수 있다.
- 위험: 수동 저장/불러오기, 템플릿, Terraform 생성기와 보드 입력 계약이 달라진다.

**C. 보드 전용 graph model로 변환한다.**

- 장점: 보드 내부 구현 자유도가 높다.
- 위험: `ArchitectureJson`과 보드 상태가 분리되어 동기화 버그가 생긴다.

### 3. 노드별 경고 표시 연결

**A. `CheckFinding.resourceId === ArchitectureJson.nodes[].id`로 연결한다. (추천)**

- 장점: AI 분석, 보드 경고, Plan 전 화면이 같은 id를 쓴다.
- 경근 AI 파트 영향: finding 생성 시 가능하면 `resourceId`를 넣는다.

**B. node뿐 아니라 edge 경고도 필요하다.**

- 장점: 연결선 문제를 직접 표시할 수 있다.
- 경근 AI 파트 영향: 별도 `edgeId` 또는 `targetType`이 필요할 수 있다.

**C. 경고는 보드 전체 summary로만 표시한다.**

- 장점: 구현이 빠르다.
- 위험: 초보자가 어떤 리소스를 고쳐야 하는지 찾기 어렵다.

### 4. `ResourceNode.config` 편집 책임

**A. 보드는 공통 key를 표시하고, 리소스별 상세 검증은 담당 파트가 문서로 맞춘다. (추천)**

- 장점: 보드가 모든 AWS 설정을 알 필요가 없다.
- 경근 AI 파트 영향: AI template이 쓰는 key를 테스트 fixture에 고정한다.

**B. 보드가 리소스별 필수 config를 모두 검증한다.**

- 장점: 사용자가 보드에서 바로 오류를 본다.
- 위험: 정현 파트가 시원/경근/채강의 검증 책임까지 떠안을 수 있다.

**C. `config`는 자유 JSON으로 두고 검증하지 않는다.**

- 장점: 빠르다.
- 위험: Terraform 생성과 비용/위험 분석에서 필드 누락이 늦게 발견된다.

## 응답 형식

```text
정현 Codex 선택 결과

1. ResourceType 호환 방식: A/B/C
   이유:

2. Architecture Draft 입력 방식: A/B/C
   이유:

3. 노드별 경고 표시 연결: A/B/C
   이유:

4. ResourceNode.config 편집 책임: A/B/C
   이유:

경근 AI 파트가 맞춰야 할 것:
-

정현 파트가 맞출 것:
-

수정이 필요한 파일/타입:
-
```
