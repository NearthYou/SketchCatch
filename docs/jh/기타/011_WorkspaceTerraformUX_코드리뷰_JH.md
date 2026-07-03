# Workspace Terraform UX 코드리뷰

## 문서 목적

이번 브랜치의 frontend 변경은 Terraform Preview를 단순 코드 출력 화면이 아니라, 다이어그램과 계속 동기화되는 편집 경험으로 정리하는 것이다.

이 문서는 Workspace 화면에서 사용자가 직접 체감하는 변경을 코드리뷰 관점으로 설명한다.

주요 파일:

- `apps/web/features/workspace/TerraformCodePanel.tsx`
- `apps/web/features/workspace/WorkspaceRightPanel.tsx`
- `apps/web/features/workspace/TerraformLeaveDialog.tsx`
- `apps/web/features/workspace/terraform-code-highlighting.ts`
- `apps/web/features/workspace/terraform-leave-save-state.ts`
- `apps/web/features/workspace/workspace.module.css`
- `apps/web/features/diagram-editor/diagram-utils.ts`
- `apps/web/features/parameter-input/ParameterInputPanel.tsx`

## 1. Terraform editor syntax color

### 바뀐 동작

Terraform editor가 단색 textarea에서 syntax color가 있는 편집면으로 바뀌었다.

구현 방식:

- 실제 입력은 기존 `textarea`가 계속 담당한다.
- 보이는 코드는 read-only highlight layer가 담당한다.
- `textarea` 글자는 `color: transparent`로 숨기고 caret만 보이게 한다.
- scroll top/left를 highlight layer에 반영해 textarea와 시각 레이어를 맞춘다.

주요 파일:

- `terraform-code-highlighting.ts`
- `TerraformCodePanel.tsx`
- `workspace.module.css`

### 리뷰 포인트

`terraform-code-highlighting.ts`는 HCL parser가 아니다. editor coloring을 위한 가벼운 tokenizer다.

토큰 종류:

- `keyword`
- `identifier`
- `reference`
- `string`
- `brace`
- `operator`
- `number`
- `comment`
- `plain`

리뷰 중 확인할 질문:

- 문자열 escape가 중간에 끊기지 않는가?
- `#`, `//` comment가 한 token으로 유지되는가?
- `aws_route_table.rt.id`, `data.aws_ami.ubuntu.id`, `var.region` 같은 reference가 reference 색을 받는가?
- tokenizer가 실패해도 editor 입력 자체가 막히지 않는가?

### 의도적으로 하지 않은 것

- Monaco Editor를 도입하지 않았다.
- HCL 전체 문법을 직접 구현하지 않았다.
- syntax color를 저장 데이터로 만들지 않았다.

이 선택은 변경 범위를 줄이기 위한 것이다. 현재 단계에서는 “보는 경험”을 개선하는 것이 목적이고, Terraform CLI 수준의 분석은 backend validation 경계에 둔다.

## 2. 빨간 물결 밑줄 diagnostics

### 바뀐 동작

기존에는 오류 줄에 직선 marker를 그렸다. 이제 코드 에디터에서 익숙한 빨간 물결 밑줄로 표시한다.

구현 방식:

- 기존 `createTerraformDiagnosticLineHighlights`는 오류 line set을 만드는 데 계속 사용한다.
- highlight line에 `terraformHighlightedLineError` class를 붙인다.
- CSS에서 `text-decoration-style: wavy`를 사용한다.
- line number의 error 색상은 유지한다.

리뷰 포인트:

- diagnostic source file filtering은 유지되어야 한다.
- resource code 부분보기에서는 원본 파일 line을 부분보기 line으로 보정해야 한다.
- multi-file Terraform에서 현재 파일이 아닌 오류가 현재 editor에 표시되면 안 된다.

주의할 점:

- highlight layer는 `aria-hidden`이다. 실제 접근 가능한 입력은 textarea다.
- textarea 글자는 투명하지만 caret은 보여야 한다.
- overlay가 pointer event를 가져가면 편집이 막히므로 `pointer-events: none`이어야 한다.

## 3. 저장하고 나가기 UX

### 문제였던 UX

사용자가 Terraform 변경사항을 저장하고 나가려 할 때 저장이 실패하면, 메시지는 “패널의 오류를 확인해 주세요”라고 하는데 모달이 패널을 가리고 있었다.

이 흐름은 맞지 않다. 사용자는 오류를 보려면 모달을 닫아야 하는데, 모달은 계속 남아 있었다.

### 최종 동작

저장 실패 원인이 Terraform error diagnostics로 설명되는 경우:

- leave dialog를 닫는다.
- pending navigation/close action을 취소한다.
- 오른쪽 패널을 연다.
- Terraform 탭을 보여준다.
- 사용자가 빨간 물결 밑줄과 line number error 표시를 바로 볼 수 있게 한다.

diagnostics가 없는 저장 실패의 경우:

- 기존처럼 모달 안에 실패 메시지를 남긴다.
- 예를 들어 네트워크 오류나 API 오류처럼 패널에서 바로 확인할 수 없는 실패는 모달 피드백이 필요하다.

주요 파일:

- `WorkspaceRightPanel.tsx`
- `terraform-leave-save-state.ts`
- `terraform-leave-save-state.test.ts`

### 리뷰 포인트

- `latestTerraformDiagnosticsRef`는 React state 반영 타이밍 문제를 피하기 위한 ref다.
- external save 완료 callback이 호출될 때 방금 editor가 올린 diagnostics를 즉시 확인할 수 있어야 한다.
- diagnostics 때문에 저장이 막힌 경우 `hasUnsavedTerraformChanges`는 false로 바꾸지 않는다.
- 저장이 된 것이 아니므로 dirty 상태는 유지되어야 한다.

## 4. Issues 탭 접근성

### 문제였던 UX

Terraform diagnostics가 떠 있는데도 Issues 탭을 클릭하면 leave guard가 먼저 개입했다. 사용자는 오류를 확인하려고 누른 것인데 저장 확인 모달이 뜨는 상태였다.

### 최종 동작

diagnostics가 1개 이상 있으면:

- 오른쪽 toolbar의 Issues 탭을 바로 열 수 있다.
- collapsed right panel의 Issues shortcut도 바로 열 수 있다.
- 이 동작은 Terraform dirty 상태여도 허용된다.

구현 방식:

- `canOpenTerraformIssuesDuringEdit = terraformDiagnostics.length > 0`
- Issues 버튼에 `data-terraform-issues-navigation` marker를 붙인다.
- document-level leave guard가 이 marker를 예외로 둔다.
- `requestView("issues")`와 `openCollapsedView("issues")`도 같은 정책을 따른다.

리뷰 포인트:

- Issues 탭 이동은 architecture 변경이 아니므로 User-Accepted Change 경계를 침범하지 않는다.
- Resource/AI/Deploy 탭 이동은 여전히 leave guard 대상이다.
- diagnostics가 없을 때 Issues 탭으로 이동하는 정책은 기존 leave guard 흐름을 따른다.

## 5. 저장 중 메시지 제거

### 문제였던 UX

`저장하고 나가기`를 누르면 `Terraform 변경사항을 저장하는 중입니다.` 문구가 아주 짧게 떴다가 모달이 닫혔다.

사용자 입장에서는 읽을 수도 없고, 오히려 시선만 흔드는 문구다.

### 최종 동작

- 저장 시작 feedback의 `message`는 빈 문자열이다.
- 버튼 label은 `저장 중`으로 바뀐다.
- 버튼은 disabled 된다.
- 성공 또는 diagnostics reveal 흐름에서는 불필요한 status 문구가 렌더링되지 않는다.

리뷰 포인트:

- 진행 중 상태 자체는 `saveState === "saving"`으로 남아 있다.
- 중복 클릭 방지는 유지된다.
- 모달 안에서 필요한 메시지는 저장 실패처럼 사용자가 다음 행동을 알아야 할 때만 보인다.

## 6. 리소스 아이콘과 Terraform identity 동기화

### 자동 parameter 채움 제거

사용자가 보드에 리소스 아이콘을 직접 추가할 때 `instanceType`, `cidrBlock`, `tags.Name` 같은 값이 자동으로 채워지지 않게 했다.

이유:

- 현재 파라미터 정책이 완성되지 않았다.
- 잘못된 기본값은 유효한 리소스를 만든다는 착각을 줄 수 있다.
- 명시 입력은 사용자, AI draft config, Terraform editor sync에서 온 값만 유지한다.

리뷰 포인트:

- `parameters.values`는 `{}`로 시작한다.
- Terraform identity metadata는 유지한다.
- AI draft가 명시한 config는 보존한다.

### 중복 resource name suffix

같은 리소스 아이콘을 반복 추가하면 Terraform resource name이 중복되지 않게 숫자 suffix를 붙인다.

예시:

```txt
aws_instance.ec2_instance
aws_instance.ec2_instance_2
aws_instance.ec2_instance_3
```

리뷰 포인트:

- 같은 `resourceType` 안에서 중복을 피한다.
- label만이 아니라 Terraform identity가 실제로 바뀌어야 한다.
- paste/duplicate 경로와 manual drop 경로가 서로 다르게 동작하지 않아야 한다.

### 기본 icon size 축소

일반 resource icon node의 기본 크기를 `56x56`으로 줄였다.

리뷰 포인트:

- VPC/Subnet/Security Group/Region/AZ/Group 같은 area node는 기존 크기를 유지한다.
- compact resource node가 generic `.nodeShell`의 `min-height: 72px`를 물려받아 다시 커지면 안 된다.
- unknown resource fallback도 같은 compact size를 써야 한다.

## 7. Diagram 삭제와 Terraform editor 동기화

### 바뀐 동작

다이어그램에서 리소스 아이콘을 삭제하면 Terraform Preview에서도 해당 block이 제거된다.

특히 중요한 케이스:

- 마지막 아이콘 삭제
- Terraform editor에 local edits가 남아 있는 상태에서 diagram 삭제
- Terraform 코드가 완전히 빈 상태가 되는 경우

리뷰 포인트:

- `context.nodes.length === 0`일 때도 Preview refresh가 막히지 않아야 한다.
- local edits가 있을 때는 전체 코드를 덮어쓰지 않고 삭제된 resource address block만 제거한다.
- Terraform 코드가 완전히 비면 dirty 상태가 이상하게 남지 않아야 한다.
- 빈 Terraform 저장은 전체 삭제 의도로 sync API까지 가야 한다.

## 8. 리뷰어 체크리스트

- syntax highlight layer가 textarea 입력을 방해하지 않는가?
- horizontal/vertical scroll이 textarea와 highlight layer에서 같이 움직이는가?
- 빨간 물결 밑줄이 현재 파일의 diagnostic에만 표시되는가?
- 저장 실패 diagnostics가 있으면 모달이 닫히고 Terraform 탭이 보이는가?
- diagnostics가 있을 때 Issues 탭이 모달 없이 열리는가?
- 저장 중 순간 메시지가 없어졌는가?
- resource icon 생성 시 parameter values가 자동으로 채워지지 않는가?
- 중복 아이콘의 Terraform resource name이 유니크한가?
- 마지막 icon 삭제 후 Terraform Preview가 빈 코드로 갱신되는가?

