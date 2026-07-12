# Workspace 오른쪽 패널 현재 디자인과 선택 롤백 기준

> 기록 기준 브랜치: `fix/gg/qa-followup`
>
> 비교 기준: `dev` (`8d03684a`)
>
> 기록일: 2026-07-12
>
> 이 문서는 현재 오른쪽 패널의 디자인을 보존하고, 나중에 기능은 살린 채 디자인만 다시 수정하기 위한 참고 자료다.

## 1. 문서 목적

현재 Workspace 오른쪽 패널은 디자인 문제가 크지만, 그 안에는 이후에 추가된 기능도 함께 들어 있다.
따라서 과거 커밋이나 파일 전체를 그대로 되돌리면 다음과 같은 정상 기능까지 사라질 수 있다.

- 필수 파라미터와 추가 설정 분리
- 추가 설정 검색, 추가, 삭제
- 필수 파라미터 입력 수와 오류 수 집계
- Region과 Availability Zone 입력
- Terraform argument와 설명 표시
- 패널 너비 조절과 열기·닫기
- 최신 Board Shell과 캔버스 상태

롤백의 목표는 **오른쪽 패널의 시각 디자인만 이전 상태로 되돌리고, 현재 기능과 다른 Workspace 작업은 유지하는 것**이다.

## 2. 현재 오른쪽 패널의 구성

오른쪽 패널은 하나의 파일이 아니라 바깥 셸과 내부 Inspector로 나뉜다.

```text
DiagramEditor
└─ rightRail
   ├─ rightRailResizeHandle
   └─ ParameterInputPanel
      ├─ Resource header
      ├─ Metadata
      ├─ 필수 파라미터
      └─ 추가 설정
```

| 층 | 현재 책임 | 주요 파일 |
| --- | --- | --- |
| 바깥 셸 | 패널 위치, 너비, 캔버스와의 배치, 접힘, 크기 조절 | `apps/web/features/diagram-editor/DiagramEditor.tsx` |
| 바깥 셸 스타일 | 고정형 또는 붙박이형 배치, 경계선, overflow, z-index | `apps/web/features/diagram-editor/diagram-editor.module.css` |
| 내부 Inspector | 선택 리소스 정보와 파라미터 기능 | `apps/web/features/parameter-input/ParameterInputPanel.tsx` |
| 내부 Inspector 스타일 | 배경, section 카드, 입력 필드, badge, summary, 추가 설정 picker | `apps/web/features/parameter-input/ParameterInputPanel.module.css` |
| 디자인 계약 테스트 | 현재 마크업과 CSS 모양을 소스 수준에서 고정 | `apps/web/features/parameter-input/parameter-panel-source.test.ts` |

기본 Workspace에서는 `DiagramEditor`의 `rightPanel` slot이 별도로 전달되지 않으면 `ParameterInputPanel`이 렌더링된다.

## 3. 현재 보이는 디자인

### 3.1 바깥 셸

현재 오른쪽 패널은 캔버스 위에 떠 있는 창이 아니라 Board Shell의 세 번째 열에 붙어 있다.

- 배경: `--workspace-surface`
- 왼쪽 경계선: `1px solid --workspace-line`
- 위치: CSS Grid의 3열, 2행
- 높이: Board 본문 높이에 맞는 `auto`
- 너비: `--right-panel-width` 상태로 관리
- 내용 넘침: 바깥 셸에서 `hidden`, 내부 패널에서 스크롤
- 접힘: 열 너비를 0으로 만들고 `display: none`
- 크기 조절: 패널 왼쪽의 14px 투명 drag 영역
- 시각적인 resize 선: 현재 hover와 focus에서도 표시하지 않음

현재 셸은 border radius와 큰 그림자를 사용하지 않는다. 즉, 캔버스 위의 floating card가 아니라 화면 오른쪽에 붙은 rail이다.

### 3.2 내부 Inspector 기본 표면

`ParameterInputPanel`은 세로 스크롤 패널이다.

- 최소 너비: 320px
- 패딩: 16px
- 기본 간격: 15px
- 기본 배경 위에 `DESIGN.md parameter input pass`가 다시 적용됨
- 최종 배경: `--workspace-surface-muted`
- 최종 글꼴: `--workspace-font`
- 왼쪽 border는 내부 패널에서 제거되고 바깥 `rightRail`이 담당

이 파일은 과거 기본 스타일과 나중의 디자인 덮어쓰기가 한 파일 안에 함께 있는 구조다. 같은 selector가 여러 번 선언되며, 파일 뒤쪽 선언이 앞쪽 선언을 덮어쓴다.

### 3.3 Resource header

선택된 리소스의 아이콘과 이름을 위쪽에 표시한다.

- 아이콘 영역: 44 × 44px
- 아이콘 배경: `--workspace-surface-strong`
- 제목: 약 1rem
- 선택 없음, Region, Availability Zone, 일반 리소스에 따라 다른 내용 표시

### 3.4 Metadata와 section 카드

현재 Metadata, 필수 파라미터, 추가 설정은 각각 독립된 흰 카드처럼 보인다.

- 카드 배경: `--workspace-surface`
- border: `1px solid --workspace-line`
- radius: 8px
- padding: 14px
- 약한 box shadow
- section header 아래 별도 divider
- Metadata는 가능한 너비에서 2열 이상으로 늘어나는 auto-fit grid

이 카드 중첩이 패널 전체의 회색 배경과 겹치면서, 오른쪽 패널이 하나의 Inspector라기보다 여러 작은 설정 카드의 묶음처럼 보이게 한다.

### 3.5 필수 파라미터

필수 파라미터 section은 다음 순서로 구성된다.

1. `필수`, `입력됨`, `문제` 3칸 summary
2. 파라미터 행 목록
3. 각 행의 이름과 설명
4. Terraform argument token
5. `Required`, `Core`, `Optional`, `Sensitive` badge
6. 실제 입력 control과 오류 메시지

넓은 패널에서는 container query를 사용해 설명과 입력 control을 좌우 2열로 배치한다.

```css
@container (min-width: 560px) {
  .parameterField {
    grid-template-columns: minmax(0, 0.86fr) minmax(220px, 1.14fr);
  }
}
```

좁은 패널에서는 한 열로 쌓인다.

### 3.6 추가 설정

추가 설정은 접을 수 있는 단순 목록이 아니라 패널 안에 picker를 여는 구조다.

- `파라미터 추가` 버튼
- 이름 또는 Terraform argument 검색
- 추가 가능한 선택 파라미터 목록
- 추가한 파라미터 수 표시
- 각 추가 파라미터 삭제
- 미입력 값은 Terraform AWS Provider 기본 동작을 따른다는 안내

이 기능은 디자인 롤백과 관계없이 유지해야 한다.

## 4. 현재 디자인의 문제

### 4.1 구조 문제

현재 오른쪽 rail은 Resource 정보만 담고 Terraform은 별도의 작업 패널에 있다.
합의한 Architecture 레벨은 Resource 정보와 Terraform을 같은 상위 맥락으로 묶어야 하므로, 현재 오른쪽 패널은 기능적으로도 완성된 Architecture 패널이 아니다.

이 문제는 색이나 radius만 바꿔서는 해결되지 않는다.
향후 오른쪽 패널 상위에 `Resource`와 `Terraform` 보기를 두어야 한다.

### 4.2 시각 문제

- 회색 패널 안에 흰 section 카드가 반복되어 정보가 지나치게 조각나 보인다.
- 바깥 rail과 내부 panel이 각각 표면 책임을 가져 배경과 경계선의 주인이 불분명하다.
- 하나의 리소스를 편집하는 흐름보다 카드 여러 개를 순회하는 느낌이 강하다.
- summary, token, badge, 설명, control이 한 행에 많이 들어가 밀도가 높다.
- 560px 이상에서 2열이 되지만 실제 오른쪽 rail 너비에서는 설명 열이 좁아져 줄바꿈이 많아질 수 있다.
- resize handle이 동작하지만 시각 피드백이 없어 사용자가 너비 조절 가능 여부를 알기 어렵다.
- 기본 스타일과 뒤쪽 디자인 덮어쓰기가 공존해, 작은 수정도 예상하지 못한 cascade 결과를 만들 수 있다.

### 4.3 레벨 충돌 문제

오른쪽 Inspector와 별도 floating 작업 패널이 동시에 열릴 수 있다.
그 결과 Resource 편집, Terraform, 검사, 배포가 같은 레벨의 창처럼 보이고 Board가 남는 공간으로 밀린다.

향후 기준은 다음과 같다.

```text
Architecture Board 레벨
→ 오른쪽 Architecture 패널에서 Resource와 Terraform을 다룬다.

Deployment 레벨
→ 오른쪽 Inspector를 닫고, 고정된 Baseline으로 위자드를 진행한다.
```

## 5. 디자인이 만들어진 Git 경계

현재 디자인은 한 커밋에서 만들어진 것이 아니다. 최소 세 층을 구분해야 한다.

### 5.1 내부 Inspector 디자인 덮어쓰기

```text
8f1c1d7a  Fix: 워크스페이스 컨텍스트 칩 링크 정리
```

이 커밋에서 `ParameterInputPanel.module.css` 뒤쪽에 약 311줄의 `DESIGN.md parameter input pass`가 추가됐다.
현재의 회색 패널 배경, 흰 section 카드, summary grid, parameter row, token, badge, 560px container query의 시작점이다.

다만 같은 커밋에 카탈로그, 검증, Workspace, API 관련 변경이 매우 많이 포함되어 있다.
**이 커밋 전체를 revert하면 안 된다.**

내부 Inspector 디자인만 과거와 비교할 때의 기준점은 다음이다.

```text
8f1c1d7a^
```

### 5.2 Board Shell과 오른쪽 rail 배치 변경

```text
a2fbf8b4  UI: Workspace Board Shell 재구축
```

이 커밋 전 오른쪽 패널은 화면 오른쪽 12px, 위쪽 12px에 떠 있는 fixed card였다.

- border: 1px
- radius: 8px
- 큰 shadow
- 높이: `calc(100dvh - 24px)`
- 위치: `position: fixed`

이 커밋 뒤 오른쪽 패널은 Board Shell의 3열에 붙은 rail이 됐다.

- 왼쪽 border만 표시
- radius와 shadow 제거
- Grid 3열에 배치
- Board 본문 높이에 맞춤

따라서 “오른쪽 패널이 떠 있던 디자인으로 돌아간다”는 요구라면 비교 기준은 `a2fbf8b4^`다.
하지만 이 커밋은 Board Shell, viewport 저장, 영역 이동, 저장 상태 등 많은 기능을 함께 바꿨다.
**파일 전체 복원이나 커밋 전체 revert는 다른 작업을 잃게 만든다.**

### 5.3 옛 스타일 제거

```text
72595d44  Refactor: Workspace 옛 UI 스타일 제거
```

이 커밋은 `ParameterInputPanel.module.css`뿐 아니라 `workspace.module.css`, Diagram Editor, SelectMenu와 관련 테스트를 함께 정리했다.
옛 스타일을 대량 삭제한 경계이므로 과거 모습을 찾을 때 참고할 수 있지만, 전체 revert 대상은 아니다.

### 5.4 이후 기능과 보정

```text
a685022f  Feat: Live Observation 실시간 트래픽 이중 레일 애니메이션 구현
```

이후 현재의 필수 파라미터와 추가 설정 section 관련 스타일 일부가 다시 보강됐다.
따라서 `8f1c1d7a^`의 CSS 파일을 통째로 가져오면 현재 TSX가 사용하는 새 class가 사라져 화면이 깨진다.

## 6. 나중에 롤백할 때 지켜야 할 보존선

### 반드시 유지할 것

- 현재 `ParameterInputPanel.tsx`의 기능 로직
- `advanced-parameters.ts`의 추가 설정 계산
- 필수 파라미터 오류 집계
- Region과 Availability Zone control
- 현재 DiagramEditor의 노드 선택, 저장, viewport, resize 상태
- 현재 Board Shell의 다른 영역과 캔버스 기능
- 배포 Baseline과 이후 Deployment Wizard 작업
- 인증, 템플릿, AI Dock 등 오른쪽 패널과 무관한 작업

### 통째로 되돌리면 안 되는 것

- `8f1c1d7a` 전체 커밋
- `a2fbf8b4` 전체 커밋
- `72595d44` 전체 커밋
- `DiagramEditor.tsx` 전체 파일
- `diagram-editor.module.css` 전체 파일
- `ParameterInputPanel.tsx` 전체 파일
- `ParameterInputPanel.module.css` 전체 파일

### 디자인 변경 때 함께 확인할 테스트

`parameter-panel-source.test.ts`는 현재 카드형 DESIGN pass를 계약으로 고정하고 있다.
디자인을 바꾸면 기능 테스트가 아니라 다음 시각 계약 assertion만 새 디자인에 맞게 바꿔야 한다.

- `DESIGN.md parameter input pass` 존재 여부
- section의 흰 배경, border, radius, padding
- section header divider
- Metadata auto-fit grid
- summary 3열 grid
- parameter row 2열 container query
- legacy Blueprint token 부재

기능을 보존하는 assertion은 계속 유지한다.

- 필수와 선택 파라미터 분리
- 추가 설정 picker
- 필수 오류만 집계
- Resource identity가 친숙한 Diagram label을 덮어쓰지 않음
- Region과 Availability Zone label 처리

## 7. 권장 선택 롤백 방식

아직 실제 롤백은 수행하지 않는다.
나중에 실행할 때는 아래 순서가 가장 안전하다.

1. `dev`에서 `8f1c1d7a^`, `a2fbf8b4^`, 현재 상태를 각각 시각 비교한다.
2. 되돌릴 대상을 `내부 Inspector 스킨`, `바깥 rail 배치`, 또는 둘 다로 먼저 확정한다.
3. 현재 TSX와 기능 코드는 유지한다.
4. CSS 파일을 과거 버전으로 통째로 복원하지 않고 관련 selector만 새로 정리한다.
5. 과거 디자인에서 필요한 값은 현재 `workspace` token 체계로 옮긴다.
6. `parameter-panel-source.test.ts`의 디자인 assertion만 새 계약으로 갱신한다.
7. 다른 Workspace, 배포, 인증, 템플릿 변경이 diff에 섞이지 않았는지 확인한다.

선택지는 다음처럼 나뉜다.

| 선택 | 되돌리는 범위 | 유지되는 것 |
| --- | --- | --- |
| A. 내부만 | 회색 배경, section 카드, summary와 parameter row의 시각 밀도 | 현재 붙박이 rail, Board Shell, 모든 기능 |
| B. 바깥만 | 붙박이 rail을 과거 floating card 감각으로 조정 | 현재 내부 카드와 모든 기능 |
| C. 둘 다 | 바깥 배치와 내부 스킨을 함께 재설계 | 현재 기능과 데이터 흐름 |

현재 문제 진단상 A만으로는 Architecture와 Deployment의 레벨 충돌이 해결되지 않는다.
최종 UI는 C에 가깝게 다시 설계하되, 과거 파일 복원이 아니라 현재 기능 위에 새 시각 구조를 적용하는 편이 안전하다.

## 8. 향후 UI 수정 기준

오른쪽 패널을 다시 만들 때는 다음 문장이 화면에서 바로 읽혀야 한다.

```text
지금은 Architecture를 편집하고 있다.
선택한 Resource 정보와 그 Architecture의 Terraform을 이 패널에서 확인한다.
배포는 이 패널의 또 다른 탭이 아니라 별도의 순서형 위자드로 시작한다.
```

권장 상위 구조:

```text
Architecture Panel
├─ Resource
│  ├─ Metadata
│  ├─ Required parameters
│  └─ Additional settings
└─ Terraform
   ├─ Generate / current 상태
   ├─ Validate
   ├─ Code edit
   ├─ Board sync proposal
   └─ 배포 시작
```

시각적으로는 카드 중첩을 줄이고, 하나의 Inspector 안에서 section divider와 명확한 제목 계층을 사용하는 방향이 적합하다.
Terraform 보기와 Resource 보기는 같은 panel shell, 같은 여백, 같은 heading 체계를 공유해야 한다.

## 9. 현재 결론

- 사용자가 말한 “오른쪽 패널 디자인 작업 전으로 돌아가되 나머지 작업은 살린다”는 요구는 가능하다.
- 단일 커밋 revert나 파일 전체 restore로 처리하면 안 된다.
- 내부 디자인 기준점은 `8f1c1d7a^`, 바깥 rail 배치 기준점은 `a2fbf8b4^`다.
- `72595d44`는 옛 스타일 제거 내역을 확인하는 참고점이지 전체 롤백 대상이 아니다.
- 실제 롤백 전까지 현재 코드에는 손대지 않는다.

