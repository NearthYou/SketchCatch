# Terraform 오류 Issues 고정 및 AI 해결 구현 정리

이 문서는 현재 브랜치에서 구현한 `Terraform 오류 -> Issues 탭 -> AI 해결 가이드 -> 사용자 승인 적용` 흐름을 처음 보는 사람이 코드 기준으로 따라갈 수 있게 정리한 문서다.

목표는 세 가지다.

1. Terraform 오류가 어디에서 만들어지고, 어떻게 Issues 탭에 유지되는지 설명한다.
2. AI 해결 버튼이 어떤 경로로 chat dock을 열고 Well-Architected guidance를 보여주는지 설명한다.
3. 자동 적용 가능한 Terraform 수정이 왜 제한되어 있고, 어떤 순서로 검증/저장/동기화되는지 설명한다.

## 1. 이번 작업의 핵심 변화

이번 작업은 Terraform 검증 오류를 코드 패널 하단에서 직접 보여주던 흐름을 Issues 중심 흐름으로 바꿨다.

```text
Terraform validation error
-> Terraform Code Panel 상단 Issues 안내 배너
-> Issues 탭 이동
-> Issues 탭에서 오류 유지
-> 각 이슈의 AI 해결 버튼
-> Workspace AI chat dock에서 원인과 해결 가이드 표시
-> 사용자가 적용을 누른 경우에만 제한된 safe fix 실행
-> 재검증
-> 통과하면 저장 및 다이어그램 동기화
```

중요한 원칙은 AI가 Terraform 코드를 자동으로 바꾸지 않는다는 점이다. AI는 원인, 영향, 해결 방향을 설명하고, 실제 코드는 사용자가 `적용`을 누른 경우에만 바뀐다.

| 영역 | 변경 요약 |
| --- | --- |
| Terraform 코드 패널 | 하단 오류 상세 패널을 제거하고 상단 Issues 안내 배너를 표시한다. |
| Issues 탭 | Terraform 진단을 프로젝트별 `localStorage`에 유지하고 코드 편집 중에도 사라지지 않게 한다. |
| AI 해결 | Issues 탭의 `AI 해결` 버튼이 Workspace AI chat dock을 열고 Terraform issue 전용 메시지를 만든다. |
| Well-Architected guidance | 운영 우수성, 보안, 신뢰성, 성능 효율성, 비용 최적화, 지속 가능성 관점으로 설명한다. |
| 안전 적용 | `terraform.trailing_comma`, `terraform.quoted_reference`만 deterministic safe fix로 자동 적용 가능하다. |

## 2. 사용자 기준 흐름

사용자가 보는 흐름은 아래와 같다.

```text
Terraform 코드 편집 또는 검증
-> 오류 발생
-> 코드 패널 상단에 "Terraform 오류가 있습니다. 자세한 내용은 Issues 탭에서 확인하세요." 표시
-> "Issues 탭으로 이동" 클릭
-> Issues 탭에서 오류 목록 확인
-> 특정 오류의 "AI 해결" 클릭
-> AI chat dock이 열림
-> 원인, 영향, Well-Architected 6개 관점, 최종 권고 확인
-> 적용 가능한 오류라면 "적용" 클릭
-> 코드 수정, 재검증, 저장, 다이어그램 동기화
```

코드를 편집하는 중에도 기존 오류는 바로 사라지지 않는다. 대신 `재검증 필요` 상태가 붙는다. 실제 검증 결과에서 해당 진단이 사라져야 Issues 탭에서도 제거된다.

## 3. 전체 구조

이번 흐름은 세 층으로 나뉜다.

| 층 | 위치 | 책임 |
| --- | --- | --- |
| Shared type/API | [packages/types/src/index.ts](../../../packages/types/src/index.ts), [apps/api/src/services/aiTerraformErrorExplanation.ts](../../../apps/api/src/services/aiTerraformErrorExplanation.ts) | AI Terraform explanation payload와 safe fix metadata 정의 |
| Workspace state | [apps/web/features/workspace/WorkspaceRightPanel.tsx](../../../apps/web/features/workspace/WorkspaceRightPanel.tsx), [terraform-issues-state.ts](../../../apps/web/features/workspace/terraform-issues-state.ts) | Terraform diagnostics를 Issues state로 유지하고 탭에 전달 |
| UI/action | [TerraformCodePanel.tsx](../../../apps/web/features/workspace/TerraformCodePanel.tsx), [TerraformIssuesPanel.tsx](../../../apps/web/features/workspace/TerraformIssuesPanel.tsx), [WorkspaceAiChatDock.tsx](../../../apps/web/features/workspace/WorkspaceAiChatDock.tsx) | 배너, 이슈 목록, AI 해결, 적용 버튼, safe fix 실행 |

## 4. Terraform 코드 패널 흐름

관련 파일:

- [TerraformCodePanel.tsx](../../../apps/web/features/workspace/TerraformCodePanel.tsx)
- [workspace.module.css](../../../apps/web/features/workspace/workspace.module.css)

이전에는 Terraform 오류가 발생하면 코드 패널 하단에서 상세 오류와 AI 설명을 직접 보여줬다. 지금은 하단 상세 오류 영역을 제거하고, 오류가 있으면 상단에 안내 배너만 표시한다.

```text
diagnostics 중 severity === "error" 존재
-> terraformIssueBanner 렌더링
-> "Issues 탭으로 이동" 버튼 클릭
-> onOpenIssues callback 호출
```

코드 편집 시 중요한 변경은 진단을 즉시 비우지 않는 것이다.

```text
handleCodeChange
-> file content 갱신
-> dirty 상태 설정
-> 기존 diagnostics clear 하지 않음
-> 상위 WorkspaceRightPanel이 stale 상태로 표시
```

이렇게 해야 사용자가 오류를 고치기 전까지 Issues 탭에서 맥락을 잃지 않는다.

## 5. Issues 상태 유지

관련 파일:

- [terraform-issues-state.ts](../../../apps/web/features/workspace/terraform-issues-state.ts)
- [WorkspaceRightPanel.tsx](../../../apps/web/features/workspace/WorkspaceRightPanel.tsx)

Terraform 이슈는 `TerraformDiagnostic`을 그대로 화면에 뿌리는 것이 아니라 `TerraformIssueRecord`로 감싼다.

핵심 필드:

| 필드 | 의미 |
| --- | --- |
| `key` | diagnostic code, source file, line, message 기반 stable key |
| `diagnostic` | 실제 Terraform 진단 |
| `isStale` | 코드 편집 후 아직 재검증하지 않은 상태 |
| `lastValidatedAt` | 마지막 검증 시각 |

저장 key는 프로젝트 단위로 나뉜다.

```text
sketchcatch:terraform-issues:${projectId}
```

상태 갱신 규칙:

| 상황 | 처리 |
| --- | --- |
| 새 validation result 도착 | 같은 key는 갱신, 새 key는 추가, 결과에 없는 key는 해결된 것으로 보고 제거 |
| 코드 편집 | 기존 이슈를 제거하지 않고 `isStale: true`로 표시 |
| 새로고침 | `localStorage`에서 프로젝트별 이슈 복원 |
| 저장 payload 손상 | 빈 이슈 목록으로 복구 |

## 6. Issues 탭 UI

관련 파일:

- [TerraformIssuesPanel.tsx](../../../apps/web/features/workspace/TerraformIssuesPanel.tsx)

Issues 탭은 persisted issue state를 기준으로 렌더링한다.

각 이슈는 아래 정보를 보여준다.

| UI | 의미 |
| --- | --- |
| severity | `error`, `warning` 등 진단 심각도 |
| source file/line | 어느 Terraform 파일의 어느 줄인지 |
| stale badge | 코드 편집 후 재검증이 필요한지 |
| 적용 가능 상태 | safe fix 대상인지 아닌지 |
| `AI 해결` 버튼 | AI chat dock 해결 흐름 시작 |

빈 상태 문구는 현재 의미에 맞게 `표시할 Terraform 이슈가 없습니다.`로 정리했다.

## 7. AI 해결 버튼 흐름

관련 파일:

- [workspace-terraform-ai.ts](../../../apps/web/features/workspace/workspace-terraform-ai.ts)
- [ProjectWorkspaceDraftManager.tsx](../../../apps/web/features/workspace/ProjectWorkspaceDraftManager.tsx)
- [WorkspaceDraftManager.tsx](../../../apps/web/features/workspace/WorkspaceDraftManager.tsx)
- [WorkspaceAiChatDock.tsx](../../../apps/web/features/workspace/WorkspaceAiChatDock.tsx)

Issues 탭에서 `AI 해결`을 누르면 `WorkspaceRightPanel`이 상위 workspace manager로 요청을 올린다.

```text
TerraformIssuesPanel "AI 해결" 클릭
-> WorkspaceRightPanel.handleTerraformIssueAiClick
-> onTerraformIssueAiRequest
-> ProjectWorkspaceDraftManager 또는 WorkspaceDraftManager state 갱신
-> WorkspaceAiChatDock terraformIssueRequest prop 전달
```

AI chat dock은 새 Terraform issue request를 받으면 자동으로 열린다.

```text
terraformIssueRequest 변경
-> dock open
-> draft tab 활성화
-> "Terraform 이슈를 분석합니다..." 메시지 추가
-> runAiTerraformErrorExplanation 호출
-> explanation 수신
-> Terraform issue card 렌더링
```

이 흐름은 기존 AI 채팅 dock을 재사용한다. 새 Amazon Q 인증, 환경변수, 인프라 연결은 만들지 않았다.

## 8. AI 설명 payload

관련 파일:

- [packages/types/src/index.ts](../../../packages/types/src/index.ts)
- [apps/api/src/services/aiTerraformErrorExplanation.ts](../../../apps/api/src/services/aiTerraformErrorExplanation.ts)
- [docs/data-models.md](../../data-models.md)

`AiTerraformErrorExplanationResult`는 기존 원인/해결 설명에 아래 필드를 추가로 가진다.

```ts
type AiTerraformErrorExplanationResult = {
  summary: string;
  likelyCause: string;
  impact: string;
  nextActions: string[];
  wellArchitectedGuidance: AiWellArchitectedGuidance[];
  consensusRecommendation: string;
  safeFix?: AiTerraformSafeFix;
};
```

Well-Architected guidance는 6개 관점을 모두 포함한다.

| pillar | 화면 의미 |
| --- | --- |
| `operational_excellence` | 운영 우수성 |
| `security` | 보안 |
| `reliability` | 신뢰성 |
| `performance_efficiency` | 성능 효율성 |
| `cost_optimization` | 비용 최적화 |
| `sustainability` | 지속 가능성 |

API 설명은 LLM 또는 Amazon Q 흐름이 실패하더라도 deterministic fallback shape를 유지해야 한다. 그래서 UI는 항상 같은 필드 구조를 기대할 수 있다.

## 9. Safe fix 제한

관련 파일:

- [terraform-safe-fixes.ts](../../../apps/web/features/workspace/terraform-safe-fixes.ts)
- [TerraformCodePanel.tsx](../../../apps/web/features/workspace/TerraformCodePanel.tsx)
- [WorkspaceAiChatDock.tsx](../../../apps/web/features/workspace/WorkspaceAiChatDock.tsx)

자동 적용 가능한 진단은 두 개뿐이다.

| 진단 code | 처리 |
| --- | --- |
| `terraform.trailing_comma` | diagnostic line의 마지막 comma만 제거 |
| `terraform.quoted_reference` | diagnostic line의 단순 quoted reference만 unquote |

그 외 진단은 AI 설명과 수동 수정 가이드만 제공한다.

제한 이유는 Terraform 코드를 잘못 자동 수정하면 더 큰 인프라 변경이나 의미 변경으로 이어질 수 있기 때문이다. 따라서 v1에서는 문법적으로 좁고 deterministic하게 고칠 수 있는 오류만 적용 대상으로 둔다.

## 10. 적용 버튼 흐름

사용자가 AI dock의 `적용` 버튼을 누르면 아래 순서로 움직인다.

```text
WorkspaceAiChatDock "적용" 클릭
-> onApplyTerraformIssueFix(diagnostic)
-> ProjectWorkspaceDraftManager / WorkspaceDraftManager
-> terraformSafeFixApplyRequest 생성
-> WorkspaceRightPanel이 request 감지
-> TerraformCodePanel.applyTerraformSafeFix 호출
-> terraform-safe-fixes helper로 코드 변경
-> validation 재실행
-> 같은 blocking diagnostic이 남아 있으면 실패 메시지 반환
-> 통과하면 Terraform sync proposals 적용
-> diagram json 반영
-> saveDiagramNow 호출
-> AI dock에 적용 결과 메시지 표시
```

이 흐름에서 실제 AWS apply, destroy, cloud mutation은 호출하지 않는다. 변경되는 것은 workspace의 Terraform 코드와 다이어그램 동기화 상태다.

## 11. 주요 파일별 변경 내용

| 파일 | 변경 내용 |
| --- | --- |
| [packages/types/src/index.ts](../../../packages/types/src/index.ts) | Well-Architected guidance, safe fix metadata 타입 추가 |
| [apps/api/src/services/aiTerraformErrorExplanation.ts](../../../apps/api/src/services/aiTerraformErrorExplanation.ts) | Terraform error explanation에 6개 pillar, 최종 권고, safe fix metadata 추가 |
| [terraform-issues-state.ts](../../../apps/web/features/workspace/terraform-issues-state.ts) | Issues state key 생성, merge, stale 전환, localStorage 저장/복원 |
| [terraform-safe-fixes.ts](../../../apps/web/features/workspace/terraform-safe-fixes.ts) | trailing comma, quoted reference deterministic fixer |
| [workspace-terraform-ai.ts](../../../apps/web/features/workspace/workspace-terraform-ai.ts) | Terraform issue AI request와 safe fix apply bridge 타입 |
| [TerraformCodePanel.tsx](../../../apps/web/features/workspace/TerraformCodePanel.tsx) | 상단 Issues 배너, diagnostics 유지, safe fix 적용 handle |
| [TerraformIssuesPanel.tsx](../../../apps/web/features/workspace/TerraformIssuesPanel.tsx) | persisted issue 목록, stale badge, AI 해결 버튼 |
| [WorkspaceRightPanel.tsx](../../../apps/web/features/workspace/WorkspaceRightPanel.tsx) | Terraform diagnostics를 issue state로 승격하고 project storage와 연결 |
| [WorkspaceAiChatDock.tsx](../../../apps/web/features/workspace/WorkspaceAiChatDock.tsx) | Terraform issue 전용 AI 메시지, Well-Architected card, 적용 버튼 |
| [ProjectWorkspaceDraftManager.tsx](../../../apps/web/features/workspace/ProjectWorkspaceDraftManager.tsx) | 프로젝트 workspace에서 AI issue request와 apply request bridge |
| [WorkspaceDraftManager.tsx](../../../apps/web/features/workspace/WorkspaceDraftManager.tsx) | 로컬 workspace에서 같은 bridge |
| [workspace.module.css](../../../apps/web/features/workspace/workspace.module.css) | Issues banner, issue badge, AI guidance card 스타일 |
| [docs/data-models.md](../../data-models.md) | AI Terraform explanation result 계약 문서화 |

## 12. 검증된 테스트

이번 흐름을 지키는 주요 테스트는 아래와 같다.

| 테스트 파일 | 확인 내용 |
| --- | --- |
| [aiTerraformErrorExplanation.test.ts](../../../apps/api/src/services/aiTerraformErrorExplanation.test.ts) | Well-Architected 6개 관점과 safe fix metadata |
| [aiProviderRouter.test.ts](../../../apps/api/src/services/aiProviderRouter.test.ts) | Amazon Q 우선 설명 흐름과 fallback shape |
| [terraform-issues-state.test.ts](../../../apps/web/features/workspace/terraform-issues-state.test.ts) | 이슈 merge, stale 전환, project-scoped localStorage 복원 |
| [terraform-safe-fixes.test.ts](../../../apps/web/features/workspace/terraform-safe-fixes.test.ts) | trailing comma, quoted reference safe fix 제한 |
| [workspace-right-panel-layout.test.ts](../../../apps/web/features/workspace/workspace-right-panel-layout.test.ts) | Issues 배너, navigation, stale 유지, AI dock 연결 |
| [terraform-error-explanation-panel.test.ts](../../../apps/web/features/workspace/terraform-error-explanation-panel.test.ts) | 확장된 explanation payload fixture 호환성 |

최종 확인한 명령:

```bash
pnpm harness:check
pnpm lint
pnpm typecheck
pnpm build
```

targeted test는 sandbox의 Node test runner spawn 제한 때문에 승인 모드에서 실행했다.

```bash
apps/api/.\\node_modules\\.bin\\tsx.cmd --test src/routes/ai.test.ts src/services/aiTerraformErrorExplanation.test.ts src/services/aiProviderRouter.test.ts
apps/web/.\\node_modules\\.bin\\tsx.cmd --test features/workspace/terraform-safe-fixes.test.ts features/workspace/terraform-issues-state.test.ts features/workspace/workspace-right-panel-layout.test.ts features/workspace/workspace-ai-chat-routing.test.ts features/workspace/workspace-ai-clarification.test.ts
```

## 13. 코드를 읽는 순서

처음 읽을 때는 아래 순서가 가장 이해하기 쉽다.

1. [TerraformCodePanel.tsx](../../../apps/web/features/workspace/TerraformCodePanel.tsx)
   - `terraformIssueBanner`
   - `handleCodeChange`
   - `applyTerraformSafeFix`

2. [terraform-issues-state.ts](../../../apps/web/features/workspace/terraform-issues-state.ts)
   - `createTerraformDiagnosticKey`
   - `mergeTerraformValidationDiagnostics`
   - `markTerraformIssuesStale`
   - `readStoredTerraformIssues`
   - `storeTerraformIssues`

3. [WorkspaceRightPanel.tsx](../../../apps/web/features/workspace/WorkspaceRightPanel.tsx)
   - `terraformIssues`
   - `handleTerraformDiagnosticsChange`
   - `handleTerraformIssueAiClick`
   - `terraformSafeFixApplyRequest` effect

4. [TerraformIssuesPanel.tsx](../../../apps/web/features/workspace/TerraformIssuesPanel.tsx)
   - issue list rendering
   - `AI 해결` button

5. [workspace-terraform-ai.ts](../../../apps/web/features/workspace/workspace-terraform-ai.ts)
   - request/result bridge type

6. [WorkspaceAiChatDock.tsx](../../../apps/web/features/workspace/WorkspaceAiChatDock.tsx)
   - `terraformIssueRequest` effect
   - `TerraformIssueExplanationCard`
   - `onApplyTerraformIssueFix`

7. [aiTerraformErrorExplanation.ts](../../../apps/api/src/services/aiTerraformErrorExplanation.ts)
   - `createWellArchitectedGuidance`
   - `createConsensusRecommendation`
   - `createTerraformSafeFix`

8. [packages/types/src/index.ts](../../../packages/types/src/index.ts)
   - `AiWellArchitectedGuidance`
   - `AiTerraformSafeFix`
   - `AiTerraformErrorExplanationResult`

## 14. 남은 주의점

이번 구현은 Terraform 오류 설명과 제한된 safe fix 적용 흐름을 만든 것이다. 아래 범위는 일부러 포함하지 않았다.

| 제외 범위 | 이유 |
| --- | --- |
| 새 Amazon Q 인증/환경변수/인프라 연결 | 기존 AI provider 흐름을 깨지 않는 범위에서 구현하기로 했다. |
| 모든 Terraform 오류 자동 수정 | 의미 변경 위험이 커서 deterministic safe fix 두 개로 제한했다. |
| 실제 AWS apply/destroy | Issues 해결은 코드 수정 흐름이며 cloud mutation이 아니다. |
| RDS 기반 issue persistence | v1은 프로젝트별 `localStorage` 유지로 충분하다. source of truth처럼 취급하지 않는다. |

## 15. 진짜 핵심 요약

```text
Terraform 오류 발생
-> 코드 패널은 "Issues 탭에서 확인"만 안내
-> Issues 탭은 오류를 해결 전까지 유지
-> AI 해결은 chat dock에서 구조화된 설명 제공
-> Well-Architected 6개 관점으로 원인과 해결 방향 정리
-> 자동 적용은 안전한 두 문법 오류에만 허용
-> 사용자가 적용을 눌러야 코드가 바뀜
-> 재검증 통과 후 저장과 다이어그램 동기화
```

이번 작업의 핵심 가치는 Terraform 오류를 일시적인 하단 메시지가 아니라 사용자가 추적하고 해결할 수 있는 `Issue`로 승격했다는 점이다. AI는 자동 실행기가 아니라 검토 가능한 해결 가이드와 제한된 사용자 승인 변경 흐름으로 동작한다.
