# Reverse Engineering 결과 이해 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 AWS를 읽어온 뒤에도 사용자가 무엇을 찾았고, 무엇이 보드에 보이며, 무엇이 아직 자동 분석·Terraform·배포 대상이 아닌지를 짧고 분명하게 이해하게 만든다. AWS Role 연결이 없거나 검증에 실패한 경우에는 Reverse Engineering 화면에서 다음 복구 행동까지 안내하고, ALB·CloudFront·ECS는 검토 전용 목록에 머물지 않고 실제 수집·변환·Terraform import 제안 경로까지 지원한다.

**Architecture:** AWS 원본 식별자와 화면용 이름을 분리한다. Reverse Engineering 결과는 `보드에 표시할 Resource`, `검토 전용 Resource`, `읽지 못한 서비스`를 서로 다른 상태로 표현하되, Terraform·import·배포 가능 여부와 혼동하지 않는다. 기존 `DiscoveredResource`와 저장된 scan 결과의 원본 값은 유지하고, 화면용 상태와 짧은 이름은 읽는 시점에 계산한다. AWS 연결 준비 상태도 기존 `AwsConnection`의 상태만으로 계산해 검증된 Role이 아니면 서버의 스캔 경계를 우회하지 않고 복구 경로만 보여준다. ALB·CloudFront·ECS는 AWS reader가 낸 원본 record를 알려진 `ResourceType`과 Terraform type으로 명시적으로 매핑하고, 근거가 있는 관계만 Board에 연결한다. 그 밖의 아직 미지원 Resource는 기존처럼 `review_only`로 남긴다.

**Tech Stack:** TypeScript, Next.js, Fastify, `@sketchcatch/types`, Node `tsx --test`, 기존 Architecture Board Compiler

## Global Constraints

- AWS SDK 호출은 API 안에서만 수행하고, 이번 작업의 테스트·QA에서 실제 AWS 스캔을 실행하지 않는다.
- AWS Resource 생성·수정·삭제, Terraform import 실행, Terraform apply, 배포 승인 흐름은 변경하지 않는다.
- Reverse Engineering 화면은 검증되지 않은 AWS Role로 스캔 요청을 보내거나 서버의 verified-only 검사를 우회하지 않는다. 연결 복구·재검증은 사용자가 명시적으로 누른 기존 연결 설정/검증 API만 사용한다.
- `providerResourceId`, `providerResourceType`, `region`, account 정보와 저장된 원본 config는 화면 이름을 짧게 만들기 위해 수정하거나 버리지 않는다.
- 이번 확장에서 정식 지원하지 않은 Resource는 Terraform 생성·import 제안·배포·확정 비용/보안 판단에서 계속 제외한다. ALB·CloudFront·ECS는 Task 7–8의 계약을 모두 통과한 경우에만 이 예외에서 벗어난다.
- `UNKNOWN`이라는 내부 타입 하나로 보드 표시 여부, 분석 가능 여부, import 가능 여부, 배포 가능 여부를 함께 결정하지 않는다.
- 기존 scan JSONB와 API endpoint를 깨지 않으며 DB migration을 만들지 않는다.
- 사용자가 적용하기 전 Board를 저장하지 않는 기존 승인 경계를 유지한다.
- 구현은 깨끗한 전용 worktree에서 시작한다. 이미 있던 작업트리 변경은 수정·stage·commit하지 않는다.
- 구현과 필요한 검증에만 시간을 사용한다. 중간 현황 보고나 별도 진행 문서는 만들지 않는다.

---

## 1. QA에서 확인한 문제와 결정

| 문제 | 현재 원인 | 이번 작업의 결정 |
| --- | --- | --- |
| 지원하지 않는 Resource가 사라져 보임 | 발견 목록에는 남지만 API layout과 Web apply 경로가 `UNKNOWN` 노드를 각각 한 번씩 제거함 | 발견된 Resource는 보드 또는 검토 전용 목록에서 반드시 찾을 수 있게 함. 관계가 있는 구조 Resource는 흐린 `확인 필요` 카드로 보드에도 표시함. |
| `전체`와 개별 선택의 범위가 다름 | 화면에는 8개 정식 Resource만 보이지만 `ALL`은 Resource Explorer와 보조 AWS API로 Lambda, ALB, IAM 등을 추가 조회함 | 선택 화면에서 두 범위의 차이를 명시하고, 결과 요약에서 지원·검토 전용·읽기 실패 수를 분리함. |
| AWS Role 연결이 없거나 검증에 실패해도 이유가 불명확함 | options hook이 verified 연결만 남기고 Form은 연결 0개일 때의 일반 안내만 보여줌 | 모든 연결 상태를 보존해 `연결하기`/`설정 계속`/`연결 다시 확인`을 구분해 안내하고, verified가 아니면 스캔을 시작하지 않음. |
| ALB·CloudFront·ECS가 AWS에 있어도 자동 처리되지 않음 | ALB·CloudFront는 reader가 있어도 `UNKNOWN` record이고 ECS reader·provider/Terraform mapping이 없음 | 세 서비스는 실제 reader, known ResourceType, 근거 있는 관계, Terraform handoff·CLI fixture 검증까지 정식 지원으로 올림. 다른 미지원 서비스는 review_only를 유지함. |
| Resource 이름이 ARN 또는 내부 ID처럼 김 | AWS reader가 이름이 없을 때 ARN·provider ID를 `displayName`으로 사용하고, 패널이 `resource-...` ID도 노출함 | 화면의 기본 이름은 `Name 태그 → AWS 고유 이름 → 서비스명 + 짧은 식별자` 순서로 만듦. 원본 ARN·ID는 고급 정보에만 둠. |
| 정보가 이해하기 어려운 나열식임 | 결과 화면, 오른쪽 Inspector, 파라미터 목록이 raw enum·provider ID·전체 JSON을 기본 정보처럼 노출함 | 기본 화면은 요약·상태·다음 행동만 보여주고, 원본 ID·내부 enum·JSON은 선택한 Resource의 접힌 `AWS 원본 정보`에만 둠. |

### 고정할 사용자 흐름

```text
AWS 가져오기
→ 찾은 Resource / 보드에 표시할 Resource / 검토 전용 Resource / 못 읽은 서비스 요약
→ 보드에서 구조 Resource 확인
→ 검토 전용 목록에서 지원 전 Resource와 제외 이유 확인
→ Resource 선택 시 쉬운 설명과 핵심 값 확인
→ 필요할 때만 AWS 원본 정보 펼치기
→ 사용자가 보드 적용
```

### 상태를 이렇게 나눈다

| 화면 상태 | 뜻 | Board | Terraform·import·배포 | 비용·보안 finding |
| --- | --- | --- | --- | --- |
| `supported` | Reverse Engineering 변환과 자동 처리 범위가 확정된 Resource | 일반 카드 | 기존 동작 유지 | 기존 동작 유지 |
| `review_only` | AWS에서 발견했지만 Reverse Engineering 자동 처리 범위가 확정되지 않은 Resource | 관계가 있으면 흐린 `확인 필요` 카드, 관계가 없으면 검토 전용 목록 | 제외 | 제외 |
| `unreadable` | 권한·리전·AWS API 문제로 읽지 못한 서비스 | Resource 카드 없음 | 해당 없음 | 전체 결과가 불완전하다고 안내 |

`review_only`는 “AWS에 없다”거나 “제품 전체에서 영원히 미지원”이라는 뜻이 아니다. 현재 Reverse Engineering 변환 경로에서 자동으로 다룰 수 없다는 뜻이다.

## 2. 범위와 보류 항목

### 이번 작업에 포함

- 지원/검토 전용/읽기 실패 상태의 일관된 표현
- 구조적으로 의미 있는 `UNKNOWN` Resource의 보드 표시와 관계선 보존
- 짧은 화면 이름 생성과 모든 결과 패널의 공통 사용
- 결과 요약, 미지원 목록, Inspector, 고급 정보 계층 재구성
- `전체` 선택과 개별 선택의 실제 조회 범위 설명
- 이전 scan 결과를 포함한 단위 테스트와 화면 QA
- AWS 연결 없음·검증 대기·검증 실패 상태를 Reverse Engineering 안에서 구분하고, 기존 AWS 연결 설정 화면으로 복구할 수 있는 흐름
- ALB, CloudFront, ECS Cluster/Service/Task Definition의 실제 AWS 수집, known `ResourceType` 변환, 관계 보존, Terraform type·import 제안 계약

### 이번 작업에서 하지 않음

- 이번 확장에서 정식 지원하지 않는 Lambda, IAM, KMS 등 Resource의 Terraform 매핑을 새로 확정하거나 import 명령을 생성하는 작업
- Task 7–8에서 다루는 ALB·CloudFront·ECS 외 보조 AWS 서비스의 실제 조회 API 범위 확대
- AWS Role 권한 정책 자체나 AWS Resource Explorer 설정을 바꾸는 작업. Task 6은 기존 연결 생성·검증 API와 설정 화면으로 사용자를 복구시키는 작업이며 권한을 자동으로 바꾸지 않는다.
- 비용·보안 분석 규칙이나 Deployment Wizard의 승인·실행 로직 변경
- DB migration, 저장 schema 변경, 기존 scan 재저장
- 모든 보조 AWS Resource를 보드 중앙에 강제로 올려 Board를 복잡하게 만드는 작업

## 3. 변경 파일 구조

| 파일 | 책임 |
| --- | --- |
| Create `apps/api/src/reverse-engineering/aws-resource-display-name.ts` | AWS 원본 이름·ARN·provider ID로 짧고 충돌을 피하는 화면 이름 생성 |
| Create `apps/api/src/reverse-engineering/aws-resource-display-name.test.ts` | 짧은 이름 규칙과 원본 ID 보존 회귀 방지 |
| Modify `apps/api/src/reverse-engineering/aws-provider-adapter.ts` | 모든 discovered record에 공통 화면 이름 적용, 현재 분석·import 제외 규칙 유지 |
| Modify `apps/api/src/reverse-engineering/aws-provider-architecture-layout.ts` | 구조적으로 의미 있는 검토 전용 Resource를 보드와 관계선에 남김 |
| Create `apps/api/src/reverse-engineering/aws-provider-architecture-layout.test.ts` | supported/review-only Resource의 보드·목록 분리와 관계선 보존 검증 |
| Create `apps/web/features/workspace/reverse-engineering-presentation.ts` | 결과 화면이 공통으로 쓰는 상태, 이름, 짧은 보조 문구, 수량 요약 계산 |
| Create `apps/web/features/workspace/reverse-engineering-presentation.test.ts` | 화면용 상태와 한국어 문구, raw ID 비노출 규칙 검증 |
| Modify `apps/web/features/workspace/reverse-engineering-board-application.ts` | API layout에서 남긴 검토 전용 노드를 다시 제거하지 않고, 흐린 스타일·보호 metadata를 유지 |
| Modify `apps/web/features/workspace/reverse-engineering-board-application.test.ts` | Board 적용 후보에도 구조적 검토 전용 노드가 남고 자동 실행 대상이 아닌지 검증 |
| Modify `apps/web/features/workspace/ReverseEngineeringResultPanel.tsx` | 결과 요약과 검토 전용 목록을 쉬운 말 중심으로 재구성 |
| Modify `apps/web/features/workspace/ReverseEngineeringFindingsPanel.tsx` | finding과 분석 제외를 사람 이름·한국어 상태로 표시 |
| Delete `apps/web/features/workspace/ReverseEngineeringResourceParametersPanel.tsx` | 결과 화면의 전체 Resource raw JSON 목록 제거 |
| Modify `apps/web/app/workspace/reverse/reverse-workspace-client.tsx` | 오른쪽 Inspector를 핵심 정보와 접힌 AWS 원본 정보로 분리 |
| Modify `apps/web/features/workspace/ReverseEngineeringScanCriteriaForm.tsx` | `전체`/개별 선택의 실제 범위와 Resource 이름을 설명 |
| Modify `apps/web/features/workspace/useReverseEngineeringOptions.ts` | 모든 AWS 연결과 선택 상태를 보존하고, 화면이 계산할 연결 준비 상태를 제공 |
| Create `apps/web/features/workspace/reverse-engineering-aws-connection-readiness.ts` | 연결 없음/설정 필요/검증 필요/재시도 필요/스캔 가능 상태와 복구 문구를 순수하게 계산 |
| Create `apps/web/features/workspace/reverse-engineering-aws-connection-readiness.test.ts` | AWS API 호출 없이 연결 복구 상태·버튼·스캔 차단을 검증 |
| Modify `apps/web/features/workspace/ReverseEngineeringPanel.tsx` | 검증되지 않은 연결을 숨기지 않고, readiness를 Criteria Form에 전달 |
| Modify `apps/api/src/reverse-engineering/aws-reverse-engineering-gateway.ts` | ALB/CloudFront의 unknown reader를 정식 reader로 승격하고 ECS reader 추가 |
| Modify `apps/api/src/reverse-engineering/aws-provider-adapter.ts` | ALB·CloudFront·ECS AWS provider type과 Terraform type의 명시적 변환 계약 추가 |
| Modify `apps/api/src/reverse-engineering/aws-provider-architecture-layout.ts` | ALB·CloudFront·ECS의 근거 있는 관계와 Board 배치를 정식 Resource로 처리 |
| Create `apps/api/src/reverse-engineering/aws-reverse-engineering-gateway.test.ts` | AWS SDK fixture로 ALB·CloudFront·ECS reader와 관계 원본을 검증 |
| Modify `apps/api/src/reverse-engineering/aws-provider-adapter.test.ts` | ALB·CloudFront·ECS의 ResourceType, import 제안, 미지원 Resource의 제외 계약 검증 |
| Modify `apps/web/features/workspace/reverse-engineering.module.css` | 상태 배지, 검토 전용 카드, 고급 정보, 긴 원본 ID 줄바꿈 스타일 |
| Modify `docs/data-models.md` | `review_only` 화면 상태가 저장 계약이 아닌 읽기 시 계산값임을 기록 |

## 4. 구현 마일스톤

### Task 1: 발견·표시·자동 처리 상태를 분리

**Files:**

- Create: `apps/web/features/workspace/reverse-engineering-presentation.ts`
- Create: `apps/web/features/workspace/reverse-engineering-presentation.test.ts`
- Modify: `apps/web/features/workspace/reverse-engineering-resource-types.ts`
- Modify: `apps/web/features/workspace/reverse-engineering-resource-types.test.ts`

**Consumes:** 기존 `DiscoveredResource`, `ReverseEngineeringScanResult`, `ReverseEngineeringScanError` shared type

**Produces:** 모든 결과 패널이 사용할 `presentReverseEngineeringResource()`와 `summarizeReverseEngineeringScan()`

- [ ] **Step 1: 화면 상태를 계산하는 순수 helper와 실패 테스트 작성**

  아래 타입과 함수로 시작한다. 이 타입은 API payload나 DB에 저장하지 않는다.

  ```ts
  export type ReverseEngineeringDisplayState = "supported" | "review_only";

  export type ReverseEngineeringResourcePresentation = {
    readonly displayState: ReverseEngineeringDisplayState;
    readonly displayName: string;
    readonly serviceLabel: string;
    readonly statusLabel: string;
    readonly statusDescription: string;
    readonly regionLabel: string;
    readonly technicalIdentity: string;
  };

  export type ReverseEngineeringScanSummary = {
    readonly discoveredCount: number;
    readonly boardCount: number;
    readonly reviewOnlyCount: number;
    readonly unreadableServiceCount: number;
  };

  export function presentReverseEngineeringResource(
    resource: DiscoveredResource
  ): ReverseEngineeringResourcePresentation;

  export function summarizeReverseEngineeringScan(
    result: ReverseEngineeringScanResult
  ): ReverseEngineeringScanSummary;
  ```

  테스트 fixture는 다음 네 가지를 반드시 포함한다.

  ```text
  1. VPC → supported, "지원됨"
  2. Lambda UNKNOWN + 관계 있음 → review_only, "확인 필요", 사람 이름
  3. IAM Role UNKNOWN + 관계 없음 → review_only, "검토 전용", 사람 이름
  4. ARN만 있는 UNKNOWN → 기본 이름에 전체 "arn:aws:"가 나오지 않음
  ```

- [ ] **Step 2: 실패를 확인**

  Run:

  ```bash
  pnpm --filter @sketchcatch/web exec tsx --test features/workspace/reverse-engineering-presentation.test.ts
  ```

  Expected: `ERR_MODULE_NOT_FOUND` 또는 새 helper export 누락으로 실패

- [ ] **Step 3: 최소 helper 구현**

  상태 판단은 다음처럼 고정한다.

  ```ts
  const displayState = resource.resourceType === "UNKNOWN" || resource.analysisExcluded
    ? "review_only"
    : "supported";
  ```

  `technicalIdentity`는 `providerResourceId`를 그대로 보존하되 기본 UI에는 렌더하지 않는다. `serviceLabel`은 `AWS::ElasticLoadBalancingV2::LoadBalancer` 같은 provider type을 `로드 밸런서`, `AWS::Lambda::Function`을 `Lambda 함수`처럼 바꾸고, 알 수 없는 type은 `AWS Resource`로만 표시한다.

  `REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION`의 설명 helper도 추가한다.

  ```ts
  export function getReverseEngineeringSelectionHelp(
    selection: ReverseEngineeringResourceSelection
  ): string {
    return selection === "ALL"
      ? "현재 지원 Resource와 확인 전용 AWS Resource를 함께 읽습니다."
      : "선택한 정식 지원 Resource만 읽습니다.";
  }
  ```

- [ ] **Step 4: helper 테스트 통과 확인**

  Run:

  ```bash
  pnpm --filter @sketchcatch/web exec tsx --test features/workspace/reverse-engineering-presentation.test.ts features/workspace/reverse-engineering-resource-types.test.ts
  ```

  Expected: 모든 test pass

- [ ] **Step 5: 커밋**

  ```bash
  git add apps/web/features/workspace/reverse-engineering-presentation.ts apps/web/features/workspace/reverse-engineering-presentation.test.ts apps/web/features/workspace/reverse-engineering-resource-types.ts apps/web/features/workspace/reverse-engineering-resource-types.test.ts
  git commit -m "Refactor: Reverse Engineering 결과 상태 분리"
  ```

### Task 2: AWS 원본 ID와 짧은 화면 이름을 분리

**Files:**

- Create: `apps/api/src/reverse-engineering/aws-resource-display-name.ts`
- Create: `apps/api/src/reverse-engineering/aws-resource-display-name.test.ts`
- Modify: `apps/api/src/reverse-engineering/aws-provider-adapter.ts`

**Consumes:** `AwsDiscoveredResourceRecord`의 `providerResourceType`, `providerResourceId`, `displayName`

**Produces:** `createAwsResourceDisplayName()`과 `createAwsResourceDisplayNameMap()`; `DiscoveredResource.displayName`에는 사용자용 짧은 이름, `providerResourceId`에는 변하지 않은 AWS 원본 ID

- [ ] **Step 1: 이름 규칙 테스트를 먼저 작성**

  다음 예제를 정확히 고정한다.

  | 입력 | 기대 기본 이름 | 원본 ID |
  | --- | --- | --- |
  | `Name=orders-alb` ALB | `orders-alb` | 전체 ALB ARN 유지 |
  | Lambda `FunctionName=checkout` | `checkout` | Lambda ARN 유지 |
  | `arn:aws:iam::123:role/service-role/very-long-production-role-name` | `very-long-production-role-name` 또는 안전하게 줄인 이름 | 전체 ARN 유지 |
  | 이름 없는 ARN | `AWS Resource · <짧은 끝 식별자>` | 전체 ARN 유지 |
  | 같은 기본 이름 2개 | 두 이름은 짧은 식별자 꼬리표로 구분 가능 | 두 원본 ID 유지 |

  화면 이름의 최대 길이는 42자로 하고, 잘라야 하면 앞 34자와 `…` 뒤의 7자 식별자를 남긴다. 전체 문자열을 자르기 전에 ARN의 resource name 부분을 먼저 사용한다.

- [ ] **Step 2: 실패를 확인**

  Run:

  ```bash
  pnpm --filter @sketchcatch/api exec tsx --test src/reverse-engineering/aws-resource-display-name.test.ts
  ```

  Expected: 새 module을 찾지 못해 실패

- [ ] **Step 3: 순수 이름 helper 구현**

  public interface를 아래처럼 유지한다. 같은 기본 이름이 둘 이상일 때만 Map 단계에서 짧은 원본 ID 꼬리표를 붙인다.

  ```ts
  export type AwsResourceDisplayNameInput = {
    readonly displayName: string;
    readonly providerResourceId: string;
    readonly providerResourceType: string;
  };

  export function createAwsResourceDisplayName(
    input: AwsResourceDisplayNameInput
  ): string;

  export function createAwsResourceDisplayNameMap(
    records: readonly AwsResourceDisplayNameInput[]
  ): ReadonlyMap<string, string>;
  ```

  구현 순서:

  1. 비어 있지 않고 ARN이 아닌 `displayName`을 우선 사용
  2. ARN 또는 provider ID이면 ARN resource segment의 마지막 의미 있는 이름을 사용
  3. 이름이 전혀 없으면 사람이 읽을 수 있는 provider type + 짧은 ID를 사용
  4. 같은 기본 이름이 둘 이상이면 각 이름 끝에 ` · <원본 ID 마지막 7자>`를 붙임
  5. 42자보다 길면 동일한 축약 함수로 줄임
  6. `providerResourceId` 자체와 `config.providerParameters`를 수정하지 않음

  `aws-provider-adapter.ts`에서 record 전체로 `displayNameMap`을 먼저 만든 뒤 `toDiscoveredResource()`에 해당 이름을 넘긴다. 각 AWS reader가 가진 원본 이름·tag 수집 로직은 그대로 둔다.

- [ ] **Step 4: backend 단위 테스트 통과 확인**

  Run:

  ```bash
  pnpm --filter @sketchcatch/api exec tsx --test src/reverse-engineering/aws-resource-display-name.test.ts
  pnpm --filter @sketchcatch/api typecheck
  ```

  Expected: pass

- [ ] **Step 5: 커밋**

  ```bash
  git add apps/api/src/reverse-engineering/aws-resource-display-name.ts apps/api/src/reverse-engineering/aws-resource-display-name.test.ts apps/api/src/reverse-engineering/aws-provider-adapter.ts
  git commit -m "Fix: Reverse Engineering Resource 이름 간소화"
  ```

### Task 3: 검토 전용 Resource를 한 번만 분류하고 구조는 보존

**Files:**

- Modify: `apps/api/src/reverse-engineering/aws-provider-architecture-layout.ts`
- Create: `apps/api/src/reverse-engineering/aws-provider-architecture-layout.test.ts`
- Modify: `apps/web/features/workspace/reverse-engineering-board-application.ts`
- Modify: `apps/web/features/workspace/reverse-engineering-board-application.test.ts`

**Consumes:** `analysisExcluded`, `resourceType`, `relationships`, 기존 `UNKNOWN` Resource catalog의 deployment exclusion

**Produces:** 지원 여부와 별개로, 구조적 의미가 있는 검토 전용 Resource가 흐린 Board card와 관계선으로 남는 Preview/Application diagram

- [ ] **Step 1: 보드 표시 정책의 실패 테스트 작성**

  아래 fixture를 API layout 테스트와 Web board application 테스트에 각각 넣는다.

  ```text
  VPC (supported)
  └─ Lambda (UNKNOWN, connects_to 또는 contains 관계 있음)

  IAM Role (UNKNOWN, 관계 없음)
  ```

  기대값:

  ```text
  - VPC와 Lambda는 architectureJson.nodes에 있음
  - VPC ↔ Lambda edge가 남음
  - IAM Role은 architectureJson.nodes에 없음
  - IAM Role은 discoveredResources와 검토 전용 목록 계산에는 남음
  - Web application 결과에는 Lambda가 "확인 필요 · <짧은 이름>"으로 남음
  - Lambda node metadata에 aws_scan source와 보호 키가 남음
  - Lambda는 Terraform import 제안의 ready 상태가 되지 않음
  ```

- [ ] **Step 2: 실패를 확인**

  Run:

  ```bash
  pnpm --filter @sketchcatch/api exec tsx --test src/reverse-engineering/aws-provider-architecture-layout.test.ts
  pnpm --filter @sketchcatch/web exec tsx --test features/workspace/reverse-engineering-board-application.test.ts
  ```

  Expected: 현재 코드는 `UNKNOWN` 노드를 API layout과 Web application에서 제거하므로 실패

- [ ] **Step 3: API layout에서 구조 Resource만 남기기**

  `aws-provider-architecture-layout.ts`에 하나의 정책 helper를 둔다.

  ```ts
  function shouldAppearOnReverseEngineeringBoard(
    resource: DiscoveredResource
  ): boolean {
    if (resource.resourceType !== "UNKNOWN" && !resource.analysisExcluded) {
      return true;
    }

    return (resource.relationships?.length ?? 0) > 0;
  }
  ```

  이 helper만 `boardResources`를 만들 때 사용한다. 이 Resource에 연결된 edge는 양쪽 노드가 board에 남았을 때만 그린다. 관계가 없는 IAM, Log Group, Alarm 같은 대량 보조 Resource는 Board 중앙을 채우지 않고 결과의 검토 전용 목록에만 둔다.

  기존 `createAnalysisExclusions()`와 `createImportSuggestions()`는 바꾸지 않는다. `UNKNOWN`을 보드에 보인다고 Terraform 처리 가능으로 바꾸면 안 된다.

- [ ] **Step 4: Web application의 두 번째 제거를 없애기**

  `reverse-engineering-board-application.ts`의 `removeUnsupportedNodes()` 호출을 제거하고 `result.architectureJson` 전체를 Compiler 입력으로 사용한다. 함수 자체도 삭제한다.

  이미 있는 `markReverseEngineeringDiagram()`의 `UNKNOWN_RESOURCE_STYLE`, `확인 필요` 접두어, `reverseEngineering` metadata를 그대로 활용한다. 이 결과로 검토 전용 노드는 주황색/흐린 시각 상태가 되지만, 공통 Resource Catalog의 `deployment.status === "excluded"` 정책은 건드리지 않는다.

- [ ] **Step 5: 회귀 테스트 통과 확인**

  Run:

  ```bash
  pnpm --filter @sketchcatch/api exec tsx --test src/reverse-engineering/aws-provider-architecture-layout.test.ts src/reverse-engineering/aws-resource-display-name.test.ts
  pnpm --filter @sketchcatch/web exec tsx --test features/workspace/reverse-engineering-board-application.test.ts features/workspace/reverse-engineering-presentation.test.ts
  pnpm --filter @sketchcatch/types exec tsx --test src/resource-definitions.test.ts
  ```

  Expected: pass. 특히 `UNKNOWN`의 deployment exclusion test는 계속 통과해야 함.

- [ ] **Step 6: 커밋**

  ```bash
  git add apps/api/src/reverse-engineering/aws-provider-architecture-layout.ts apps/api/src/reverse-engineering/aws-provider-architecture-layout.test.ts apps/web/features/workspace/reverse-engineering-board-application.ts apps/web/features/workspace/reverse-engineering-board-application.test.ts
  git commit -m "Fix: Reverse Engineering 검토 Resource 보드 표시"
  ```

### Task 4: 결과 화면을 요약 → 선택한 Resource → 고급 정보로 재구성

**Files:**

- Modify: `apps/web/features/workspace/ReverseEngineeringResultPanel.tsx`
- Modify: `apps/web/features/workspace/ReverseEngineeringFindingsPanel.tsx`
- Delete: `apps/web/features/workspace/ReverseEngineeringResourceParametersPanel.tsx`
- Modify: `apps/web/app/workspace/reverse/reverse-workspace-client.tsx`
- Modify: `apps/web/features/workspace/ReverseEngineeringScanCriteriaForm.tsx`
- Modify: `apps/web/features/workspace/reverse-engineering.module.css`

**Consumes:** Task 1 presentation helper, Task 2 short `displayName`, Task 3 Board policy

**Produces:** 사용자 화면에는 쉬운 이름과 상태만 기본 표시, raw AWS 정보는 선택한 Resource의 접힌 영역에서만 표시

- [ ] **Step 1: 결과 상단 요약을 네 개의 같은 단위로 교체**

  `ReverseEngineeringResultPanel` 상단을 아래 네 수량으로 만든다.

  ```text
  찾은 Resource       discoveredCount
  보드에 표시          boardCount
  확인 필요            reviewOnlyCount
  못 읽은 서비스       unreadableServiceCount
  ```

  `확인 필요`가 1개 이상이면 오류 스타일이 아닌 경고 스타일로 아래 문구를 보인다.

  ```text
  일부 Resource는 AWS에서 찾았지만 아직 자동 분석과 Terraform 처리 범위가 아닙니다.
  보드 또는 확인 필요 목록에서 위치와 원본 정보를 확인할 수 있습니다.
  ```

  `못 읽은 서비스`가 1개 이상이면 별도로 아래 문구를 보인다.

  ```text
  일부 AWS 서비스를 읽지 못했습니다. 이 결과는 전체 AWS 환경을 완전히 보여주지 않을 수 있습니다.
  ```

  이 두 상태를 하나의 빨간 오류 문구로 합치지 않는다.

- [ ] **Step 2: 기본 결과 목록에서 raw ID·JSON 제거**

  `발견한 Resource` 기본 목록에는 아래만 보인다.

  ```text
  짧은 Resource 이름
  사람이 읽는 AWS 서비스명
  리전
  지원됨 / 확인 필요 배지
  ```

  `ReverseEngineeringResourceParametersPanel` import와 `리소스 파라미터` detail group을 제거하고 파일도 삭제한다. 결과 화면에서 전체 Resource의 `JSON.stringify()`를 렌더하지 않는다.

  `미지원 Resource` detail group은 이름, 서비스명, 리전, 연결된 Resource 수, 아래 고정 설명만 보여준다.

  ```text
  이 Resource는 AWS에서 발견됐지만 현재 Reverse Engineering 자동 처리 범위가 아닙니다.
  Terraform 생성·import 제안·배포·확정 비용/보안 판단에는 포함하지 않습니다.
  ```

- [ ] **Step 3: finding·scan error를 사람 이름으로 교체**

  `ReverseEngineeringFindingsPanel`에 `resources: readonly DiscoveredResource[]` prop을 추가한다. `finding.resourceId`, `analysisExclusion.resourceId`를 화면에 그대로 출력하지 말고 `presentReverseEngineeringResource()`가 만든 이름을 출력한다.

  아래 enum은 기본 UI에서 직접 보이지 않게 바꾼다.

  ```text
  high / medium / low                 → 높음 / 주의 / 참고
  security / cost                     → 보안 / 비용
  unsupported_resource_type           → 자동 분석 범위 밖
  stage / reason / retryable          → 원인 설명 + 다시 시도 가능 여부
  ```

  원본 enum은 `진단 정보`라는 접힌 `<details>` 안에서만 확인 가능하게 한다.

- [ ] **Step 4: 오른쪽 Inspector를 두 계층으로 변경**

  `ReverseResourceInspector`의 기본 영역에는 아래 필드만 둔다.

  ```text
  이름
  AWS 서비스
  리전
  상태
  이 Resource가 하는 일 또는 확인 필요 이유
  Resource 종류별 핵심 값 최대 4개
  ```

  핵심 값은 `VPC ID`, `Subnet ID`, `Availability Zone`, `CIDR`, `Bucket name`, `DB identifier`처럼 의미가 분명한 값만 resource type별 allowlist로 뽑는다. `providerResourceId`, `providerResourceType`, 내부 node ID와 전체 parameter JSON은 기본 영역에 두지 않는다.

  그 아래에 접힌 두 영역만 둔다.

  ```text
  AWS 원본 식별자
  고급 원본 값
  ```

  `AWS 원본 식별자`에서는 `providerResourceId`를 줄바꿈 가능한 monospace 텍스트와 복사 버튼으로 보이고, `고급 원본 값`에서만 기존 sanitize된 JSON을 `pre`로 보인다.

- [ ] **Step 5: 스캔 선택 화면의 범위를 설명**

  `ReverseEngineeringScanCriteriaForm`에서 `전체` 바로 아래에 다음 도움말을 렌더한다.

  ```text
  전체: 현재 지원 Resource와 확인 전용 AWS Resource를 함께 읽습니다.
  개별 선택: 선택한 정식 지원 Resource만 읽습니다.
  ```

  화면 label도 raw enum 대신 다음처럼 표시한다.

  ```text
  VPC → 네트워크(VPC)
  SUBNET → 서브넷
  INTERNET_GATEWAY → 인터넷 게이트웨이
  ROUTE_TABLE → 라우팅 테이블
  SECURITY_GROUP → 보안 그룹
  EC2 → 가상 서버(EC2)
  RDS → 데이터베이스(RDS)
  S3 → 파일 저장소(S3)
  ```

  checkbox 값과 API 요청 값은 바꾸지 않는다.

- [ ] **Step 6: CSS와 키보드/모바일 상태 정리**

  `reverse-engineering.module.css`에 아래를 구현한다.

  ```text
  - supported/review-only/error 배지의 서로 다른 대비색
  - 긴 원본 ID의 overflow-wrap:anywhere
  - summary 카드가 좁은 화면에서 2열 → 1열로 바뀌는 grid
  - details/summary focus-visible outline
  - raw JSON이 기본 화면 너비를 밀어내지 않는 overflow:auto
  ```

  색만으로 상태를 구분하지 말고 텍스트 배지를 함께 둔다.

- [ ] **Step 7: Web test와 typecheck 통과 확인**

  Run:

  ```bash
  pnpm --filter @sketchcatch/web exec tsx --test features/workspace/reverse-engineering-presentation.test.ts features/workspace/reverse-engineering-resource-types.test.ts features/workspace/reverse-engineering-board-application.test.ts features/workspace/reverse-engineering-compilation-review.test.ts
  pnpm --filter @sketchcatch/web typecheck
  ```

  Expected: pass

- [ ] **Step 8: 커밋**

  ```bash
  git add apps/web/features/workspace/ReverseEngineeringResultPanel.tsx apps/web/features/workspace/ReverseEngineeringFindingsPanel.tsx apps/web/app/workspace/reverse/reverse-workspace-client.tsx apps/web/features/workspace/ReverseEngineeringScanCriteriaForm.tsx apps/web/features/workspace/reverse-engineering.module.css apps/web/features/workspace/reverse-engineering-presentation.ts apps/web/features/workspace/reverse-engineering-presentation.test.ts apps/web/features/workspace/reverse-engineering-resource-types.ts apps/web/features/workspace/reverse-engineering-resource-types.test.ts
  git rm apps/web/features/workspace/ReverseEngineeringResourceParametersPanel.tsx
  git commit -m "Fix: Reverse Engineering 결과 정보 계층 정리"
  ```

### Task 5: 저장된 결과 호환성과 최종 QA를 잠금

**Files:**

- Modify: `docs/data-models.md`
- Modify: 필요한 Task 1–4 test files

**Consumes:** 기존 `ReverseEngineeringScanResult` JSONB와 Task 1의 읽기 시 계산 helper

**Produces:** 이전 scan 결과를 재저장 없이 같은 화면에서 열 수 있다는 계약과 재현 가능한 QA 증거

- [ ] **Step 1: 이전 결과 fixture 추가**

  `displayName`에 긴 ARN이 있고 `analysisExcluded: true`만 있는 과거 형식 fixture를 Task 1 test에 넣는다. `presentReverseEngineeringResource()`는 raw ARN 또는 42자 초과 `displayName`이면 `providerResourceId`로 한 번 더 안전하게 짧은 화면 이름을 계산한다. 새 필드가 없어도 아래가 성립해야 한다.

  ```text
  - 오류 없이 렌더 가능
  - 짧은 기본 이름 생성
  - 지원/검토 전용 상태 계산
  - 원본 providerResourceId 보존
  ```

- [ ] **Step 2: 데이터 모델 문서 갱신**

  `docs/data-models.md`의 Reverse Engineering Scan 절에 다음 원칙을 추가한다.

  ```text
  화면의 supported/review_only 표시는 저장 상태가 아니라
  DiscoveredResource의 resourceType, analysisExcluded, 관계를 바탕으로 계산한다.
  따라서 과거 scan 결과를 migration 없이 읽을 수 있다.
  ```

- [ ] **Step 3: 기능 QA 순서 실행**

  실제 AWS 계정은 호출하지 않고 fixture 또는 기존 preview response로 확인한다.

  ```text
  1. supported VPC + review-only Lambda + review-only IAM Role + scan error fixture 준비
  2. 요약 숫자가 3 / 2 / 2 / 1처럼 각 상태를 구분하는지 확인
  3. Lambda가 흐린 확인 필요 카드와 관계선으로 보이는지 확인
  4. IAM Role은 Board를 복잡하게 하지 않고 검토 전용 목록에서 보이는지 확인
  5. 기본 목록, finding, Inspector에 ARN과 resource- 내부 ID가 보이지 않는지 확인
  6. 고급 원본 정보에는 원본 ARN과 JSON이 남아 있는지 확인
  7. 보드 적용 후에도 Lambda는 보이지만 Terraform/import/deploy 가능 상태가 되지 않는지 확인
  8. 모바일 폭에서 요약 카드·긴 원본 ID·details가 화면을 넘치지 않는지 확인
  ```

- [ ] **Step 4: 관련 검증 실행**

  Run:

  ```bash
  pnpm harness:check
  pnpm --filter @sketchcatch/api exec tsx --test src/reverse-engineering/aws-resource-display-name.test.ts src/reverse-engineering/aws-provider-architecture-layout.test.ts
  pnpm --filter @sketchcatch/api typecheck
  pnpm --filter @sketchcatch/web exec tsx --test features/workspace/reverse-engineering-presentation.test.ts features/workspace/reverse-engineering-resource-types.test.ts features/workspace/reverse-engineering-board-application.test.ts features/workspace/reverse-engineering-compilation-review.test.ts
  pnpm --filter @sketchcatch/web typecheck
  pnpm lint
  ```

  `pnpm build`는 현재 작업트리의 관련 없는 실패가 없다면 마지막에 실행한다. 실패하면 Reverse Engineering 변경이 원인인지와 기존 실패인지 분리해 기록한다.

- [ ] **Step 5: 커밋**

  ```bash
  git add docs/data-models.md apps/web/features/workspace/reverse-engineering-presentation.test.ts
  git diff --cached --check
  git diff --cached --name-only
  git commit -m "Docs: Reverse Engineering 결과 표시 계약 정리"
  ```

### Task 6: AWS Role 연결 실패를 Reverse Engineering 안에서 복구 가능하게 만들기

**Files:**

- Create: `apps/web/features/workspace/reverse-engineering-aws-connection-readiness.ts`
- Create: `apps/web/features/workspace/reverse-engineering-aws-connection-readiness.test.ts`
- Modify: `apps/web/features/workspace/useReverseEngineeringOptions.ts`
- Modify: `apps/web/features/workspace/ReverseEngineeringPanel.tsx`
- Modify: `apps/web/features/workspace/ReverseEngineeringScanCriteriaForm.tsx`
- Modify: `apps/web/features/workspace/reverse-engineering.module.css`
- Modify: `apps/web/features/workspace/ReverseEngineeringScanCriteriaForm.test.tsx` 또는 현재 이 Form을 렌더하는 동등한 화면 test

**Consumes:** `listAwsConnections()`의 기존 `AwsConnection.status`, AWS 연결 설정 화면의 `/dashboard/settings?tab=aws&next=reverse`, 기존 `/aws/connections/:connectionId/verify`, `/verify-created-role`, `/test` API

**Produces:** 연결이 없거나 검증이 끝나지 않은 사용자도 왜 스캔할 수 없는지와 다음 한 행동을 Reverse Engineering 화면에서 이해할 수 있는 복구 흐름. 서버의 verified-only 스캔 경계는 그대로 유지.

- [ ] **Step 1: 연결 준비 상태의 실패 테스트를 먼저 작성**

  새 순수 helper의 공개 계약을 아래처럼 고정한다. API 호출이나 `window` 접근을 하지 않는다.

  ```ts
  export type ReverseEngineeringAwsConnectionReadiness =
    | "ready"
    | "setup_required"
    | "verification_required"
    | "retry_required";

  export type ReverseEngineeringAwsConnectionRecovery = {
    readonly readiness: ReverseEngineeringAwsConnectionReadiness;
    readonly canStartScan: boolean;
    readonly title: string;
    readonly description: string;
    readonly actionLabel: string;
    readonly settingsHref: "/dashboard/settings?tab=aws&next=reverse";
    readonly selectedConnectionId: string | null;
  };

  export function getReverseEngineeringAwsConnectionRecovery(input: {
    readonly connections: readonly AwsConnection[];
    readonly selectedConnectionId: string;
  }): ReverseEngineeringAwsConnectionRecovery;
  ```

  fixture는 다음을 모두 포함한다.

  ```text
  1. 연결 0개 → setup_required, "AWS Role 연결하기", 스캔 불가
  2. pending/Role ARN 또는 account ID가 비어 있는 연결만 있음 → verification_required,
     "설정 계속", 스캔 불가
  3. 이전 검증 실패 또는 error 상태 연결 → retry_required,
     "연결 다시 확인", 스캔 불가
  4. verified 연결 → ready, 스캔 가능
  5. verified 연결과 pending 연결이 함께 있을 때 → 사용자가 pending을 고르면
     verification_required, verified를 고르면 ready
  6. 목록 새로고침 후 선택한 연결이 사라짐 → 남아 있는 verified 연결로만 자동 이동하고,
     없으면 빈 선택 + setup_required/verification_required
  ```

  `AwsConnection.status`의 실제 union을 먼저 확인한다. 위 화면 상태에 없는 status가 있으면 임의로 ready로 취급하지 말고 `retry_required`로 안전하게 묶고 test를 추가한다.

- [ ] **Step 2: 모든 연결을 보존하고 선택값을 안전하게 갱신**

  `useReverseEngineeringOptions.ts`가 현재처럼 verified 연결만 caller에 넘기지 않도록 한다. 아래를 동시에 반환한다.

  ```ts
  awsConnections;          // pending/failed/verified 전체, UI 설명용
  verifiedAwsConnections;  // 스캔 API로 넘길 수 있는 부분집합, 기존 호환용
  selectedAwsConnectionId;
  ```

  새로고침 중에도 사용자가 골랐던 pending/failed 연결 ID를 지우지 않는다. 단, 연결이 실제로 삭제된 경우에만 선택을 비운다. 첫 선택 기본값은 verified가 있으면 verified 첫 항목, 없으면 가장 최근 연결을 선택해 사용자가 복구 대상이 무엇인지 볼 수 있게 한다. `listAwsConnections()` 실패는 기존 error 처리로 전달하고, 그 실패를 `verified`로 오인하지 않는다.

- [ ] **Step 3: Criteria Form에 복구 카드와 정확한 차단 이유를 구현**

  `ReverseEngineeringScanCriteriaForm`은 전체 연결을 select에 표시하고 `formatAwsConnectionLabel()`에 `검증됨`, `확인 필요`, `재확인 필요` 상태를 붙인다. primary scan button 바로 아래에 readiness가 `ready`가 아닐 때만 다음을 렌더한다.

  ```text
  제목: AWS Role이 아직 준비되지 않았습니다.
  설명: 현재 연결 상태에 맞는 짧은 원인
  행동: AWS Role 연결하기 / 설정 계속 / 연결 다시 확인
  링크: /dashboard/settings?tab=aws&next=reverse
  ```

  버튼은 `canStartScan && readiness === "ready"`일 때만 활성화한다. disabled 상태만 남기지 말고 연결을 새로고침할 수 있는 버튼과 복구 링크를 제공한다. `status` 원문, Role ARN, 전체 account ID는 기본 카드에 노출하지 않는다.

  연결 다시 확인은 화면에서 자동 실행하지 않는다. 이번 단계에서는 설정 화면으로 이동해 기존 `설정 계속`, `Role 연결 확인`, `연결 테스트`를 사용한다. Reverse Engineering에 동일한 AWS 검증 API를 복제하거나 비밀 값·External ID를 URL에 넣지 않는다.

- [ ] **Step 4: 설정 화면 왕복 후 복구 확인**

  `next=reverse`를 실제로 사용해 설정 화면에서 작업한 뒤 브라우저 뒤로 가기 또는 Reverse Engineering 재진입 시 `onRefresh`가 연결 목록을 다시 읽게 한다. verified가 된 같은 연결은 선택을 유지하고 primary action이 활성화되는지 확인한다. 설정이 완료되지 않은 경우에는 pending/failed 상태와 복구 카드를 유지한다.

  이 단계는 새 API endpoint, 자동 AssumeRole, AWS 권한 확대를 만들지 않는다. `verifyAwsConnection`, `verifyAwsConnectionCreatedRole`, `testAwsConnection`의 rate limit과 오류 표시는 설정 화면의 기존 계약을 그대로 사용한다.

- [ ] **Step 5: 화면 test와 typecheck 통과 확인**

  Run:

  ```bash
  pnpm --filter @sketchcatch/web exec tsx --test features/workspace/reverse-engineering-aws-connection-readiness.test.ts features/workspace/ReverseEngineeringScanCriteriaForm.test.tsx
  pnpm --filter @sketchcatch/web typecheck
  ```

  Expected: 실제 AWS 호출 없이 네 readiness fixture와 상태별 CTA가 모두 pass

- [ ] **Step 6: 커밋**

  ```bash
  git add apps/web/features/workspace/reverse-engineering-aws-connection-readiness.ts apps/web/features/workspace/reverse-engineering-aws-connection-readiness.test.ts apps/web/features/workspace/useReverseEngineeringOptions.ts apps/web/features/workspace/ReverseEngineeringPanel.tsx apps/web/features/workspace/ReverseEngineeringScanCriteriaForm.tsx apps/web/features/workspace/ReverseEngineeringScanCriteriaForm.test.tsx apps/web/features/workspace/reverse-engineering.module.css
  git commit -m "Fix: Reverse Engineering AWS 연결 복구 안내"
  ```

### Task 7: ALB와 CloudFront를 정식 Reverse Engineering 변환으로 승격

**Files:**

- Modify: `apps/api/src/reverse-engineering/aws-reverse-engineering-gateway.ts`
- Modify: `apps/api/src/reverse-engineering/aws-provider-adapter.ts`
- Modify: `apps/api/src/reverse-engineering/aws-provider-architecture-layout.ts`
- Modify: `apps/api/src/services/terraform/diagram-to-terraform.ts`
- Create or Modify: `apps/api/src/reverse-engineering/aws-reverse-engineering-gateway.test.ts`
- Modify: `apps/api/src/reverse-engineering/aws-provider-adapter.test.ts`
- Create or Modify: `apps/api/src/services/terraform/diagram-to-terraform.test.ts`

**Consumes:** 이미 설치된 `@aws-sdk/client-elastic-load-balancing-v2`, `@aws-sdk/client-cloudfront`, 기존 `LOAD_BALANCER`/`CLOUDFRONT` Resource definition, 기존 Board Terraform compiler

**Produces:** ALB는 `aws_lb`, CloudFront distribution은 `aws_cloudfront_distribution`으로 알려진 ResourceType·Terraform address·초기 Terraform block을 갖는다. 단, import/apply 자체를 실행하지 않으며 생성한 block이 CLI 검증을 통과하는지와 import 식별자가 안정적인지만 증명한다.

- [ ] **Step 1: provider type·Terraform type의 실패 테스트를 먼저 추가**

  `aws-provider-adapter.test.ts`에 다음 record fixture와 기대값을 추가한다.

  | AWS provider type | 기대 ResourceType | Terraform type | import ID |
  | --- | --- | --- | --- |
  | `AWS::ElasticLoadBalancingV2::LoadBalancer` | `LOAD_BALANCER` | `aws_lb` | ALB ARN |
  | `AWS::CloudFront::Distribution` | `CLOUDFRONT` | `aws_cloudfront_distribution` | distribution ID |

  각 fixture는 다음을 반드시 검사한다.

  ```text
  - resourceType이 UNKNOWN이 아님
  - analysisExcluded가 false
  - review_only가 아닌 supported presentation
  - import suggestion이 terraformAddress, terraformBlockDraft, 안정적인 import ID를 가짐
  - 같은 이름 두 개도 Terraform resource name이 충돌하지 않음
  - 다른 UNKNOWN(Lambda/IAM)은 계속 analysisExcluded + import 불가
  ```

- [ ] **Step 2: AWS reader를 unknown 경로에서 분리**

  `aws-reverse-engineering-gateway.ts`에서 `listApplicationLoadBalancersAsUnknown`, `toUnknownLoadBalancerRecord`, `listCloudFrontDistributionsAsUnknown`, `toUnknownCloudFrontDistributionRecord`를 정식 reader/record 이름으로 바꾼다. `ALL`에서는 정식 reader로 한 번만 호출하고, `UNKNOWN` 보조 목록에는 중복으로 넣지 않는다.

  선택 범위도 아래처럼 명확히 고친다.

  ```text
  ALL                  → ALB와 CloudFront를 지원 Resource로 읽음
  LOAD_BALANCER        → ALB만 직접 읽음
  CLOUDFRONT           → CloudFront만 직접 읽음
  UNKNOWN              → ALB/CloudFront를 다시 UNKNOWN으로 읽지 않음
  ```

  ALB record에는 ARN, name, type, scheme, DNS name, VPC ID, security group IDs, subnet/AZ 정보만 정규화해 저장한다. `VpcId`와 security group ID가 실제 response에 있을 때만 `depends_on`/`attached_to` 관계를 만든다. target group·listener는 이번 reader가 실제로 조회해 안정적인 ARN 관계를 얻기 전에는 관계를 추측해 만들지 않는다.

  CloudFront record에는 distribution ID를 별도 `config.id`로 반드시 보존한다. Terraform import command에는 ARN이 아닌 provider가 요구하는 distribution ID를 사용한다. region은 `global`로 저장하되 scan이 시작된 AWS account/연결 context를 잃지 않는다. origin이 S3·ALB를 가리킨다는 것을 AWS response의 명시적인 origin domain/ARN으로 동일 discovered record에 해석할 수 있을 때만 관계선을 만들고, 그 외에는 VPC·서브넷에 억지로 연결하지 않는다.

- [ ] **Step 3: adapter와 Board layout의 정식 지원 계약 구현**

  `awsResourceTypeMap`과 `terraformResourceTypeMap`에 아래를 명시적으로 추가한다.

  ```ts
  ["AWS::ElasticLoadBalancingV2::LoadBalancer", "LOAD_BALANCER"]
  ["AWS::CloudFront::Distribution", "CLOUDFRONT"]

  ["LOAD_BALANCER", "aws_lb"]
  ["CLOUDFRONT", "aws_cloudfront_distribution"]
  ```

  import suggestion builder는 CloudFront의 `providerResourceId`(ARN)를 그대로 command 마지막 인자로 쓰지 않게 `config.id`를 사용한다. ALB는 ARN을 쓴다. `config.id` 또는 ARN 같은 안정적인 import ID가 없으면 `handoffReady: false`와 사람이 읽는 제외 이유를 반환하며, supported Resource라고 해서 빈 import command를 만들지 않는다.

  `aws-provider-architecture-layout.ts`은 두 Resource를 review-only 투명 카드가 아닌 정식 카드로 배치한다. ALB의 실제 VPC/security group 관계는 유지하고, CloudFront는 global edge 영역에 독립적으로 배치한다. 이전 Task 3의 UNKNOWN 보존 규칙은 Lambda/IAM 등 아직 미지원 Resource에 계속 적용한다.

- [ ] **Step 4: Board → Terraform 변환을 실제 입력값으로 검증**

  `diagram-to-terraform.ts`에 ALB와 CloudFront의 필요한 최소 값을 명시적으로 정규화하는 변환을 추가한다. raw AWS SDK snapshot 전체를 Terraform field로 통째로 흘려보내지 않는다.

  ```text
  ALB: name, internal/scheme, load_balancer_type, security_groups, subnets 또는 subnet_mapping
  CloudFront: enabled, comment, origin, default_cache_behavior, viewer_certificate 등
  ```

  AWS response에 Terraform 필수 입력이 부족한 경우에는:

  ```text
  - 보드에는 supported Resource와 읽어온 핵심 정보가 남음
  - import 제안은 해당 provider import ID가 있으면 표시 가능
  - "새로 생성 가능한 Terraform" 또는 배포 가능이라고 표시하지 않음
  - 누락 필드를 명시한 validation finding을 결과에 추가
  ```

  fixture 기반 compiler test는 최소 한 개의 ALB와 CloudFront Board를 Terraform text로 만든 뒤 `terraform fmt -check`와 provider plugin을 사용할 수 있는 CI 환경의 `terraform init -backend=false` + `terraform validate`를 실행한다. 자격 증명·AWS API 호출·`terraform import`·`terraform apply`는 실행하지 않는다. CLI가 없는 개발 환경에서는 테스트를 성공으로 건너뛰지 말고, 스크립트가 필요한 binary/provider cache를 명확히 실패 이유로 보고하도록 만든다.

- [ ] **Step 5: reader/adapter/layout/compiler 회귀를 통과 확인**

  Run:

  ```bash
  pnpm --filter @sketchcatch/api exec tsx --test src/reverse-engineering/aws-reverse-engineering-gateway.test.ts src/reverse-engineering/aws-provider-adapter.test.ts src/reverse-engineering/aws-provider-architecture-layout.test.ts src/services/terraform/diagram-to-terraform.test.ts
  pnpm --filter @sketchcatch/api typecheck
  pnpm --filter @sketchcatch/api test:terraform-validate -- --fixture reverse-engineering-alb-cloudfront
  ```

  `test:terraform-validate`가 아직 없다면 package script와 fixture runner를 이 Task에서 추가한다. 이름만 만든 빈 script로 끝내지 말고 CLI 실패 시 non-zero를 반환해야 한다.

- [ ] **Step 6: 커밋**

  ```bash
  git add apps/api/src/reverse-engineering/aws-reverse-engineering-gateway.ts apps/api/src/reverse-engineering/aws-reverse-engineering-gateway.test.ts apps/api/src/reverse-engineering/aws-provider-adapter.ts apps/api/src/reverse-engineering/aws-provider-adapter.test.ts apps/api/src/reverse-engineering/aws-provider-architecture-layout.ts apps/api/src/reverse-engineering/aws-provider-architecture-layout.test.ts apps/api/src/services/terraform/diagram-to-terraform.ts apps/api/src/services/terraform/diagram-to-terraform.test.ts apps/api/package.json
  git commit -m "Feat: Reverse Engineering ALB CloudFront 지원"
  ```

### Task 8: ECS Cluster·Service·Task Definition을 실제 수집·변환 경로에 추가

**Files:**

- Modify: `apps/api/src/reverse-engineering/aws-reverse-engineering-gateway.ts`
- Modify: `apps/api/src/reverse-engineering/aws-provider-adapter.ts`
- Modify: `apps/api/src/reverse-engineering/aws-provider-architecture-layout.ts`
- Modify: `apps/api/src/services/terraform/diagram-to-terraform.ts`
- Modify: `apps/api/src/reverse-engineering/aws-reverse-engineering-gateway.test.ts`
- Modify: `apps/api/src/reverse-engineering/aws-provider-adapter.test.ts`
- Modify: `apps/api/src/services/terraform/diagram-to-terraform.test.ts`

**Consumes:** 이미 설치된 `@aws-sdk/client-ecs`, 기존 `ECS_CLUSTER`/`ECS_SERVICE`/`ECS_TASK_DEFINITION` Resource definition과 Terraform types (`aws_ecs_cluster`, `aws_ecs_service`, `aws_ecs_task_definition`)

**Produces:** `ALL`과 ECS 개별 선택 모두에서 ECS Cluster, Service, Service가 참조한 Task Definition을 읽어 Board와 Terraform handoff 후보로 만든다. ECS resource를 AWS ARN 문자열 하나로만 표시하거나 관계를 추측하지 않는다.

- [ ] **Step 1: ECS reader contract의 실패 테스트 작성**

  SDK client factory를 주입한 fixture로 다음 호출과 record를 고정한다.

  ```text
  ListClusters → DescribeClusters
  cluster마다 ListServices → DescribeServices
  Service.taskDefinition ARN을 dedupe → DescribeTaskDefinition
  ```

  fixture에는 같은 Task Definition을 공유하는 두 Service, 서비스 없는 Cluster, Fargate Service 하나를 포함한다. 기대값은 아래와 같다.

  ```text
  - AWS::ECS::Cluster / Service / TaskDefinition 각각 하나 이상의 record
  - providerResourceId는 cluster/service/task definition ARN 그대로 보존
  - Service → Cluster, Service → Task Definition 관계가 실제 ARN을 target으로 가짐
  - 동일 Task Definition은 한 번만 record가 됨
  - paging token이 있는 ListClusters/ListServices 결과를 모두 읽음
  - 한 Cluster의 read 실패는 ECS 전체 scan을 취소하지 않고 ECS scanError로만 기록
  ```

- [ ] **Step 2: ECS SDK reader와 scan selection을 구현**

  `ECSClient`, `ListClustersCommand`, `DescribeClustersCommand`, `ListServicesCommand`, `DescribeServicesCommand`, `DescribeTaskDefinitionCommand`을 import하고 기존 factory 패턴과 같은 `AwsEcsReadClient`/factory를 추가한다. `ALL`, `ECS_CLUSTER`, `ECS_SERVICE`, `ECS_TASK_DEFINITION` 중 하나가 선택되면 ECS reader를 한 번만 실행한다. `UNKNOWN` 보조 reader에는 ECS를 넣지 않는다.

  record별 config는 최소한 아래 값을 정규화한다.

  | Resource | 필수 보존 값 |
  | --- | --- |
  | Cluster | ARN, cluster name, status, configuration, capacity providers |
  | Service | ARN, name, cluster ARN, task definition ARN, desired count, launch type/capacity provider, network configuration, load balancer references |
  | Task Definition | ARN, family, revision, network mode, requires compatibilities, cpu/memory, container definitions, execution/task role ARN |

  secret value, container environment의 민감 값, 전체 raw SDK metadata는 `providerParameters`에 무차별 복사하지 않는다. 현재 sanitization 규칙을 재사용하거나 ECS 전용 allowlist를 만든다. AWS API가 AccessDenied/Throttling을 반환하면 `ECS_CLUSTER` 또는 정확한 하위 group의 `scanError`로 보여주고 다른 supported group 결과는 유지한다.

- [ ] **Step 3: known ResourceType·import proposal·Board 관계를 구현**

  adapter map에 아래를 추가한다.

  ```ts
  ["AWS::ECS::Cluster", "ECS_CLUSTER"]
  ["AWS::ECS::Service", "ECS_SERVICE"]
  ["AWS::ECS::TaskDefinition", "ECS_TASK_DEFINITION"]

  ["ECS_CLUSTER", "aws_ecs_cluster"]
  ["ECS_SERVICE", "aws_ecs_service"]
  ["ECS_TASK_DEFINITION", "aws_ecs_task_definition"]
  ```

  Terraform import ID는 provider 문서의 stable identity를 fixture로 고정한다. Cluster와 Task Definition은 ARN, Service는 `cluster-name/service-name` 형식처럼 provider가 요구하는 import ID를 만든다. import ID에 필요한 name을 ARN에서 안전하게 파싱할 수 없거나 response에 없다면 `handoffReady: false`로 두고 왜 수동 확인이 필요한지 표시한다.

  Board layout은 Cluster를 컨테이너/서비스 묶음의 중심으로 두고, Service와 Task Definition 사이에는 발견한 ARN 관계만 연결한다. Service의 `loadBalancers`가 target group ARN을 갖더라도 해당 target group record가 이번 scan에 없으면 dangling edge를 만들지 않는다. VPC/subnet/security group 관계도 `awsvpcConfiguration`이 실제로 있고 같은 scan에서 target record가 있을 때만 만든다.

- [ ] **Step 4: ECS Board → Terraform 변환과 CLI 계약을 구현**

  compiler가 raw `containerDefinitions` 또는 AWS SDK enum을 그대로 Terraform에 쓰지 않게 타입별 normalizer를 만든다. 최소 필요 필드가 있어야 다음처럼 Terraform을 만든다.

  ```text
  aws_ecs_cluster: name + 설정이 있을 때만 configuration/capacity_providers
  aws_ecs_task_definition: family, container_definitions(jsonencode), network_mode,
                           requires_compatibilities, cpu/memory, 역할 ARN
  aws_ecs_service: name, cluster, task_definition, desired_count,
                   launch_type 또는 capacity_provider_strategy, network_configuration
  ```

  Task Definition의 secret·plaintext 환경 변수는 export하지 않는다. 해당 값이 없으면 secure reference 또는 수동 입력 요구 finding을 만들고, 예제 값으로 대체하지 않는다. ECS fixture Board를 Terraform text로 만든 뒤 Task 7에서 만든 CLI runner로 `fmt`, `init -backend=false`, `validate`를 실행한다. apply/import/AWS API 호출은 실행하지 않는다.

- [ ] **Step 5: ECS 단위·통합 test와 typecheck 통과 확인**

  Run:

  ```bash
  pnpm --filter @sketchcatch/api exec tsx --test src/reverse-engineering/aws-reverse-engineering-gateway.test.ts src/reverse-engineering/aws-provider-adapter.test.ts src/reverse-engineering/aws-provider-architecture-layout.test.ts src/services/terraform/diagram-to-terraform.test.ts
  pnpm --filter @sketchcatch/api typecheck
  pnpm --filter @sketchcatch/api test:terraform-validate -- --fixture reverse-engineering-ecs
  ```

  Expected: 실제 AWS 계정 없이 paging, 관계, sensitive-value exclusion, import readiness, Terraform CLI fixture가 모두 pass

- [ ] **Step 6: 커밋**

  ```bash
  git add apps/api/src/reverse-engineering/aws-reverse-engineering-gateway.ts apps/api/src/reverse-engineering/aws-reverse-engineering-gateway.test.ts apps/api/src/reverse-engineering/aws-provider-adapter.ts apps/api/src/reverse-engineering/aws-provider-adapter.test.ts apps/api/src/reverse-engineering/aws-provider-architecture-layout.ts apps/api/src/reverse-engineering/aws-provider-architecture-layout.test.ts apps/api/src/services/terraform/diagram-to-terraform.ts apps/api/src/services/terraform/diagram-to-terraform.test.ts
  git commit -m "Feat: Reverse Engineering ECS 지원"
  ```

### Task 9: 기존 검토 전용 정책과 새 정식 지원 범위를 함께 QA

**Files:**

- Modify: Task 1–8에서 만든 모든 reverse-engineering fixture/test
- Modify: `docs/data-models.md`

**Consumes:** 과거 scan JSONB fixture, 연결 readiness fixture, ALB/CloudFront/ECS gateway fixture, Terraform CLI fixture

**Produces:** 새 지원 Resource와 아직 검토 전용인 Resource가 한 화면·한 보드·한 import handoff에서 섞여도 상태를 잘못 바꾸지 않는 최종 회귀 증거

- [ ] **Step 1: 한 개의 혼합 fixture를 구성**

  다음을 한 scan 결과에 넣는다.

  ```text
  verified AWS 연결 + VPC/Subnet/Security Group + ALB + CloudFront + ECS Cluster/Service/Task Definition
  + Lambda/IAM Role review_only + ECS 또는 CloudFront 읽기 실패 scanError 하나
  ```

  화면에서 VPC·ALB·CloudFront·ECS는 `supported`, Lambda/IAM은 `review_only`, 실패한 service는 `unreadable`로 동시에 보이는지 검증한다. ALB/CloudFront/ECS를 UNKNOWN 또는 review_only로 되돌리는 기존 filter가 없는지 Board application까지 확인한다.

- [ ] **Step 2: 배포·import 경계를 재검증**

  ```text
  - ALB/CloudFront/ECS: 안정적인 import ID와 CLI 검증 fixture를 통과한 경우에만 handoffReady
  - 필요한 Terraform 입력이 누락된 ALB/CloudFront/ECS: 원인을 보여주고 deploy-ready로 과장하지 않음
  - Lambda/IAM 등 review_only: Board에 보일 수 있어도 import suggestion, Terraform 생성, deploy 대상이 아님
  - 검증되지 않은 AWS 연결: 어떤 resource selection에서도 스캔 endpoint를 호출하지 않음
  - verified 연결: 기존 read-only scan과 preview/apply 승인 경계가 유지됨
  ```

- [ ] **Step 3: 데이터 모델 문서를 추가 갱신**

  `docs/data-models.md`에 다음 두 계약을 Task 5의 기존 설명 뒤에 추가한다.

  ```text
  AwsConnection의 readiness 표시는 UI 계산값이며, 스캔 권한 판정은 API의 verified 연결 검사로만 한다.
  ALB, CloudFront, ECS의 supported 표시는 provider type, 안정적인 import ID, Terraform fixture 검증 계약을
  만족한 reader/adapter에만 부여한다. 이 계약을 만족하지 않는 다른 AWS Resource는 review_only다.
  ```

- [ ] **Step 4: 전체 검증 실행**

  Run:

  ```bash
  pnpm harness:check
  pnpm --filter @sketchcatch/api exec tsx --test src/reverse-engineering/aws-resource-display-name.test.ts src/reverse-engineering/aws-reverse-engineering-gateway.test.ts src/reverse-engineering/aws-provider-adapter.test.ts src/reverse-engineering/aws-provider-architecture-layout.test.ts src/services/terraform/diagram-to-terraform.test.ts
  pnpm --filter @sketchcatch/api test:terraform-validate -- --fixture reverse-engineering-alb-cloudfront reverse-engineering-ecs
  pnpm --filter @sketchcatch/api typecheck
  pnpm --filter @sketchcatch/web exec tsx --test features/workspace/reverse-engineering-presentation.test.ts features/workspace/reverse-engineering-resource-types.test.ts features/workspace/reverse-engineering-aws-connection-readiness.test.ts features/workspace/ReverseEngineeringScanCriteriaForm.test.tsx features/workspace/reverse-engineering-board-application.test.ts features/workspace/reverse-engineering-compilation-review.test.ts
  pnpm --filter @sketchcatch/web typecheck
  pnpm lint
  ```

  `pnpm build`는 관련 없는 기존 실패가 없다면 마지막에 실행한다. 실패하면 반드시 Reverse Engineering 변경과 기존 실패를 분리해 기록한다. 실제 AWS 계정, `terraform import`, `terraform plan`, `terraform apply`는 이 QA에서 실행하지 않는다.

- [ ] **Step 5: 커밋**

  ```bash
  git add docs/data-models.md apps/api/src/reverse-engineering apps/api/src/services/terraform apps/web/features/workspace
  git diff --cached --check
  git diff --cached --name-only
  git commit -m "Test: Reverse Engineering 지원 범위 회귀 검증"
  ```

## 5. 완료 조건

- [ ] 스캔에서 발견된 모든 Resource는 Board, 검토 전용 목록, 또는 읽기 실패 안내 중 적어도 하나에서 설명된다.
- [ ] 관계가 있는 검토 전용 Resource는 흐린 `확인 필요` 카드와 가능한 관계선으로 보인다.
- [ ] 관계가 없는 대량 보조 Resource는 Board를 어지럽히지 않고 검토 전용 목록에서 찾을 수 있다.
- [ ] 발견 수, Board 수, 검토 전용 수, 읽기 실패 수가 적용 버튼 전에 동시에 보인다.
- [ ] `전체`과 개별 선택이 실제로 무엇을 조회하는지 화면에서 이해할 수 있다.
- [ ] 기본 화면의 이름·finding·Inspector에 전체 ARN, `resource-...` 내부 ID, raw enum, 전체 JSON이 노출되지 않는다.
- [ ] 원본 ARN과 JSON은 선택한 Resource의 고급 정보에서만 확인 가능하다.
- [ ] `providerResourceId`와 원본 config는 어떤 경우에도 변경되지 않는다.
- [ ] AWS 연결이 없으면 `AWS Role 연결하기`, 설정 중이면 `설정 계속`, 검증 실패면 `연결 다시 확인`이라는 정확한 다음 행동이 보이고, 검증되지 않은 연결에서는 스캔 요청을 시작할 수 없다.
- [ ] 설정 화면에서 기존 검증을 마치고 돌아오면 같은 연결을 새로 읽어 verified 상태에서만 스캔을 시작할 수 있다. 이 흐름은 API의 verified-only 검사를 우회하지 않는다.
- [ ] ALB는 `LOAD_BALANCER`/`aws_lb`, CloudFront distribution은 `CLOUDFRONT`/`aws_cloudfront_distribution`, ECS Cluster·Service·Task Definition은 각 ECS ResourceType/Terraform type으로 변환되며 UNKNOWN 또는 review_only로 되돌아가지 않는다.
- [ ] ALB·CloudFront·ECS는 원본 AWS response에 근거가 있는 관계만 Board에 보이며, 없는 관계·민감 값·추측한 Terraform 값은 만들지 않는다.
- [ ] ALB·CloudFront·ECS import suggestion은 provider가 요구하는 안정적인 ID가 있을 때만 handoffReady가 되고, 생성한 Terraform fixture가 `fmt`·`init -backend=false`·`validate`를 통과한다. 이 검증은 AWS API, import, plan, apply를 실행하지 않는다.
- [ ] Lambda·IAM 등 검토 전용 Resource는 Board에 보이더라도 Terraform 생성, import 제안, 배포, 확정 비용/보안 판단 대상이 되지 않는다.
- [ ] 이전에 저장된 scan 결과가 migration 없이 열린다.
- [ ] API와 Web 관련 typecheck, 새 단위 테스트, lint가 통과한다.

## 6. Goal에 넣을 실행 지시

```text
docs/gg/feat-gg-162-reverse-engineering/005_ReverseEngineering결과이해개선구현계획_gg.md를 처음부터 끝까지 읽고 그대로 구현한다.

 Reverse Engineering에서 발견된 지원 전 Resource가 보드 적용 과정에서 조용히 사라지지 않게 하고, 구조적으로 의미 있는 것은 흐린 확인 필요 카드로 보드에 남긴다. 관계 없는 보조 Resource는 검토 전용 목록에 남긴다. Lambda/IAM 등 이번 확장에서 여전히 지원 전인 Resource는 Terraform/import/deploy/확정 분석에서 계속 제외한다.

 AWS 원본 ID와 화면 이름을 분리한다. 기본 화면에는 짧고 이해되는 이름, 서비스명, 리전, 상태만 보이고 ARN·내부 ID·raw JSON은 고급 정보에서만 보이게 한다. 전체 선택과 개별 선택의 실제 조회 범위도 설명한다.

 기존 Task 1–5를 생략하거나 약화하지 말고, Task 6–9까지 모두 구현한다. AWS 연결 없음·설정 중·검증 실패가 Reverse Engineering 화면에서 정확한 복구 행동으로 이어지게 하되, verified-only API 검사를 우회하지 않는다. ALB, CloudFront, ECS Cluster/Service/Task Definition은 실제 AWS reader, known ResourceType, Board 관계, Terraform handoff와 CLI fixture 검증까지 추가한다. 관계·Terraform 입력·import ID가 AWS 원본에서 확인되지 않으면 추측하지 말고 필요한 수동 확인 이유를 보여준다.

 기존 API, DB schema, 승인 경계, AWS read-only 경계, Terraform import 실행·plan·apply·배포 동작은 변경하지 않는다. 실제 AWS를 호출하지 않는 fixture/test와 Terraform CLI validation fixture로 검증한다. 중간 보고 문서는 만들지 말고 구현·필요한 테스트·의미 있는 단위 커밋에만 집중한다.
```
