# SketchCatch 디자인 재현 명세

이 문서는 현재 SketchCatch의 `/`, `/login`, `/signup` 화면을 기준으로 같은 분위기의 UI를 다시 만들기 위한 디자인 지시서다. 구현자가 이 문서만 보고 작업해도 비슷한 결과가 나오도록 색상, 레이아웃, 카피, 상태 표현을 구체적으로 적는다.

## 1. 전체 톤

SketchCatch는 Terraform-first AWS 인프라 학습/설계 도구다. 첫인상은 "마케팅 페이지"보다 "어두운 캔버스 위에서 클라우드 아키텍처를 설계하는 제품"에 가까워야 한다.

- 배경은 거의 검정에 가까운 `#07080d`를 기본으로 쓴다.
- 시안, 청록, 주황, 보라 포인트를 조금씩 섞어 클라우드/도구/검토 느낌을 낸다.
- 요소의 모서리는 대부분 `8px`로 통일한다.
- 카드와 패널은 반투명 유리판처럼 보이되, 과한 blur보다 얇은 border와 shadow를 우선한다.
- 브랜드는 크고 단단하게 보여야 한다. 메인 히어로의 가장 큰 텍스트는 반드시 `SketchCatch`다.
- 인증 화면은 같은 어두운 배경 위에 중앙 패널 하나만 둔다.

## 2. 공통 스타일 토큰

아래 값을 우선 사용한다.

```css
:root {
  --dark-bg: #07080d;
  --white: #ffffff;
  --near-white: #f7f8fb;
  --text-muted: rgba(247, 248, 251, 0.68);
  --text-soft: rgba(247, 248, 251, 0.78);
  --cyan: #38bdf8;
  --cyan-soft: #7dd3fc;
  --teal: #14b8a6;
  --orange: #f97316;
  --amber: #f59e0b;
  --purple: #7c5cff;
  --error-bg: rgba(248, 113, 113, 0.14);
  --error-border: rgba(248, 113, 113, 0.32);
  --error-text: #fecaca;
}

body {
  margin: 0;
  min-width: 320px;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: 0;
}

a {
  color: inherit;
  text-decoration: none;
}

button,
input {
  font: inherit;
}
```

## 3. 브랜드 표현

브랜드 텍스트는 `SketchCatch`를 그대로 쓴다. 로고 마크는 3개의 작은 블록으로 만든다.

- 브랜드 영역: `display: inline-flex`, `gap: 10px`, `font-size: 1.28rem`, `font-weight: 800`, `color: #ffffff`
- 마크: 2열 grid, `gap: 3px`, `transform: rotate(-12deg)`
- 마크 조각:
  - 첫 번째: `#7c5cff`, `11px x 11px`, `border-radius: 4px`
  - 두 번째: `#14b8a6`, `11px x 11px`, `border-radius: 4px`
  - 세 번째: `#f59e0b`, `25px x 11px`, 두 열을 모두 차지

인증 페이지의 브랜드는 현재 화면처럼 텍스트만 써도 된다. 메인 화면에서는 가능하면 블록 마크를 함께 쓴다.

## 4. 메인 화면 `/`

### 구조

`/`는 어두운 풀스크린 랜딩이다. 구성 순서는 다음과 같다.

1. 상단 고정 헤더
2. 풀스크린에 가까운 히어로 섹션
3. 배경 캔버스 장식
4. 중앙 브랜드 카피
5. 하단 3개 하이라이트 카드

### 배경

```css
.landingPage {
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at 16% 18%, rgba(20, 184, 166, 0.18), transparent 24rem),
    radial-gradient(circle at 82% 34%, rgba(245, 158, 11, 0.13), transparent 22rem),
    #07080d;
}
```

히어로 내부에는 전체 화면을 덮는 grid plane을 둔다.

- grid 선 색: `rgba(255, 255, 255, 0.055)`
- grid 간격: `72px 72px`
- opacity: `0.4`
- 세로 방향으로 위아래가 사라지는 mask를 적용한다.
- grid 위에는 `rgba(0, 0, 0, 0.44)` 어두운 overlay를 덮는다.

### 헤더

헤더는 화면 상단에 fixed로 둔다.

```css
.siteHeader {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 24px;
  padding: 24px 56px;
}
```

헤더 내용:

- 왼쪽: 브랜드 `SketchCatch`
- 가운데 nav: `Workspace`, `Safety`, `Templates`
- 오른쪽 버튼: `로그인`, `회원가입`

Nav 스타일:

- 색: `rgba(247, 248, 251, 0.7)`
- `font-size: 0.95rem`
- `font-weight: 700`
- 링크 간격 `28px`
- hover 시 `#ffffff`, `translateY(-1px)`

헤더 버튼:

- 공통: `min-height: 44px`, `padding: 0 18px`, `border-radius: 8px`, `font-weight: 800`
- 로그인 버튼: `background: rgba(255,255,255,0.08)`, `border: rgba(255,255,255,0.13)`, 흰 글자
- 회원가입 버튼: 흰 배경 `#ffffff`, 글자 `#0b0d13`
- hover: `translateY(-2px)`, solid 버튼은 `0 18px 40px rgba(255,255,255,0.16)` shadow

### 히어로

```css
.landingHero {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 84vh;
  overflow: hidden;
  padding: 126px 32px 88px;
}
```

중앙 카피:

- eyebrow: `Terraform-first AWS learning workspace`
- H1: `SketchCatch`
- 설명 문장:
  `클라우드 인프라를 캔버스에 그리듯 설계하고, Terraform 구조와 비용/보안 위험을 배포 전에 함께 확인하는 안전한 IaC 학습 플랫폼입니다.`
- CTA: `시작하기`, `/login`으로 이동

타이포:

- eyebrow: `#7dd3fc`, `0.86rem`, `font-weight: 900`, uppercase, 아래 margin `16px`
- H1: 흰색, `font-size: 7rem`, `line-height: 0.92`, margin `0`
- lead: `rgba(247,248,251,0.78)`, `1.28rem`, `line-height: 1.65`, `max-width: 760px`, 위 margin `28px`
- CTA: `min-width: 172px`, `min-height: 44px`, 흰 배경, `border-radius: 8px`, `font-weight: 800`

### 배경 캔버스 장식

히어로 배경에는 실제 제품 캔버스를 암시하는 floating 요소를 배치한다. 이 장식은 클릭되지 않아야 하므로 `pointer-events: none`을 준다.

필수 요소:

- `Terraform / plan reviewed` 노트: 왼쪽 상단, 검은 반투명 카드
- `VPC / 3 resources` 노트: 왼쪽 하단, 살짝 회전
- 선택 프레임: 오른쪽 상단, dashed border, 안에 `EC2`, `RDS`, `S3` 칩
- `AWS` 타일: 오른쪽 하단
- `$24` 비용 타일: 오른쪽 더 아래
- `Yoon | Builder` 말풍선: 왼쪽 하단
- `AI safety check` 말풍선: 오른쪽 상단

주요 수치:

```css
.floatingNote {
  width: 180px;
  padding: 14px 16px;
  border-radius: 8px;
  background: rgba(17, 20, 30, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.35);
}

.selectionFrame {
  width: 380px;
  height: 220px;
  border: 2px dashed rgba(255, 255, 255, 0.58);
  border-radius: 8px;
  right: 14%;
  top: 28%;
}

.providerTile {
  width: 96px;
  height: 96px;
  border-radius: 8px;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.12);
  color: #ffffff;
  font-size: 1.15rem;
  font-weight: 900;
}
```

칩 색:

- `EC2`: `#38bdf8`
- `RDS`: `#f59e0b`
- `S3`: `#34d399`

### 하이라이트 카드

히어로 아래에는 3개 카드가 보인다. 이 카드들이 첫 화면 아래쪽에 걸쳐 보여야 한다.

```css
.landingHighlights {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 32px 48px;
}

.highlightCard {
  min-height: 164px;
  padding: 22px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.075);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
```

카드 카피:

1. `01` / `시각적 설계` / `AWS 리소스 관계를 보드에서 빠르게 잡고 프로젝트로 저장합니다.`
2. `02` / `사전 검토` / `비용 사고와 공개 접근 위험을 배포 전에 확인하는 흐름을 둡니다.`
3. `03` / `재사용 템플릿` / `검토된 실습 구조를 템플릿으로 저장해 반복 학습에 활용합니다.`

## 5. 로그인 화면 `/login`

### 구조

로그인 페이지는 전체 화면 중앙 인증 패널이다.

배경:

```css
.authPage {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background:
    radial-gradient(circle at 20% 16%, rgba(56, 189, 248, 0.16), transparent 24rem),
    radial-gradient(circle at 78% 76%, rgba(249, 115, 22, 0.16), transparent 23rem),
    #07080d;
}
```

패널:

```css
.authPanel {
  width: 100%;
  max-width: 440px;
  padding: 34px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.075);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.3);
}
```

상단 내용:

- 브랜드 링크: `SketchCatch`, `/`로 이동
- eyebrow: `Welcome back`
- H1: `로그인`
- 설명: `저장된 AWS 실습 프로젝트와 Terraform 검토 흐름으로 돌아갑니다.`

폼 필드:

- 아이디: label `아이디`, placeholder `ID`, `autocomplete="username"`
- 비밀번호: label `비밀번호`, placeholder `Password`, `type="password"`, `autocomplete="current-password"`
- 제출 버튼: 기본 `로그인`, 제출 중 `로그인 중`
- 계정 전환 문구: `계정이 없나요? 회원가입`

검증/에러 문구:

- 빈 값: `아이디와 비밀번호를 입력해주세요.`
- API 실패 기본값: `로그인에 실패했습니다.`

로그인 성공 또는 이미 인증된 상태에서는 `/mypage`로 보낸다.

## 6. 회원가입 화면 `/signup`

회원가입 페이지는 로그인과 같은 배경/패널 시스템을 쓴다. 단, 폼이 넓으므로 패널 최대 너비를 `640px`로 키운다.

```css
.authPanelWide {
  max-width: 640px;
}
```

상단 내용:

- 브랜드 링크: `SketchCatch`, `/`로 이동
- eyebrow: `Create account`
- H1: `회원가입`
- 설명: `AWS 인프라 설계 연습을 프로젝트로 저장하고 안전하게 이어갑니다.`

폼 레이아웃:

- 데스크톱에서는 2열 grid
- `.fullField`는 전체 열을 차지
- 모바일에서는 모든 필드를 1열로 쌓아도 된다.

```css
.authForm {
  display: grid;
  gap: 16px;
  margin-top: 28px;
}

.authFormGrid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.fullField {
  grid-column: 1 / -1;
}
```

필드:

- 아이디: label `아이디`, placeholder `아이디를 입력하세요.`, `minLength={3}`, `autocomplete="username"`
- 이름: label `이름`, `autocomplete="nickname"`
- 이메일: label `이메일`, placeholder `user@example.com`, `type="email"`, 전체 열
- 비밀번호: label `비밀번호`, placeholder `Password`, `minLength={8}`, `type="password"`, `autocomplete="new-password"`
- 비밀번호 확인: label `비밀번호 확인`, placeholder `Password`, `minLength={8}`, `type="password"`
- 제출 버튼: 기본 `회원가입`, 제출 중 `가입 중`, 전체 열
- 계정 전환 문구: `이미 계정이 있나요? 로그인`

검증/에러 문구:

- 필수값 누락: `회원가입 정보를 모두 입력해주세요.`
- 비밀번호 불일치: `비밀번호 확인이 일치하지 않습니다.`
- API 실패 기본값: `회원가입에 실패했습니다.`

회원가입 성공 또는 이미 인증된 상태에서는 `/mypage`로 보낸다.

## 7. 인증 폼 세부 스타일

```css
.authBrand {
  margin-bottom: 34px;
  color: #ffffff;
  font-size: 1.28rem;
  font-weight: 800;
}

.authIntro h1 {
  margin: 0;
  color: #ffffff;
  font-size: 2.4rem;
  line-height: 1;
}

.authIntro p:not(.eyebrow) {
  margin: 14px 0 0;
  color: rgba(247, 248, 251, 0.68);
  line-height: 1.6;
}

.authForm label {
  display: grid;
  gap: 8px;
  color: rgba(247, 248, 251, 0.76);
  font-size: 0.9rem;
  font-weight: 800;
}

.authForm input {
  min-height: 46px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  outline: none;
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.authForm input:focus {
  border-color: #38bdf8;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.16);
}

.authForm input::placeholder {
  color: rgba(247, 248, 251, 0.36);
}

.authSubmit {
  width: 100%;
  min-height: 44px;
  margin-top: 6px;
  border: 0;
  border-radius: 8px;
  background: #ffffff;
  color: #0b0d13;
  font-weight: 800;
  cursor: pointer;
}

.authSubmit:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 40px rgba(255, 255, 255, 0.16);
}

.authSubmit:disabled,
.authForm input:disabled {
  cursor: not-allowed;
  opacity: 0.68;
}

.authSubmit:disabled:hover {
  transform: none;
  box-shadow: none;
}

.authMessage {
  margin: 0;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 800;
  line-height: 1.5;
}

.authMessageError {
  background: rgba(248, 113, 113, 0.14);
  border: 1px solid rgba(248, 113, 113, 0.32);
  color: #fecaca;
}

.authSwitch {
  margin: 22px 0 0;
  text-align: center;
  color: rgba(247, 248, 251, 0.66);
}

.authSwitch a {
  color: #7dd3fc;
  font-weight: 900;
}
```

## 8. 반응형 기준

현재 구현은 메인/인증 화면에 복잡한 전용 breakpoint를 많이 두지 않는다. 새로 구현할 때는 아래 정도만 지키면 된다.

- `860px` 이하:
  - 헤더는 좌우 padding을 줄인다.
  - nav가 좁으면 가운데 nav를 숨기고 브랜드와 인증 버튼만 남긴다.
  - 하이라이트 카드는 1열 또는 2열로 줄인다.
- `640px` 이하:
  - 메인 H1은 `4rem` 안팎으로 줄인다.
  - 헤더 버튼이 넘치면 `로그인`/`회원가입`을 작게 유지하거나 세로로 쌓는다.
  - 회원가입 2열 폼은 1열로 변경한다.
  - 인증 패널 padding은 `24px` 안팎으로 줄인다.
- `420px` 이하:
  - 메인 H1은 `3rem` 안팎으로 줄인다.
  - floating canvas 요소는 일부 숨겨도 된다.

## 9. 구현 시 지켜야 할 것

- `/`, `/login`, `/signup` 세 화면은 같은 어두운 브랜드 세계관을 공유해야 한다.
- 로그인/회원가입은 서로 같은 컴포넌트 규칙을 써야 한다.
- 실제 AWS 실행, Terraform apply, 배포 실행 버튼처럼 보이는 요소는 넣지 않는다.
- 메인 CTA는 `/login`으로 보낸다.
- 로그인 성공과 회원가입 성공은 `/mypage`로 보낸다.
- 입력 에러는 붉은 반투명 배너로 표시한다.
- 폼 제출 중에는 input과 button을 disabled 처리하고 버튼 문구를 바꾼다.
- 버튼 hover는 살짝 위로 떠오르는 정도로만 한다.
- radius는 대부분 `8px`, 운영/대시보드 UI처럼 조밀한 영역이 아니라면 큰 장식 radius를 쓰지 않는다.

## 10. 구현 파일 예시

Next.js App Router 기준으로 구현한다면 파일 구조는 다음과 같다.

```text
apps/web/app/page.tsx
apps/web/app/login/page.tsx
apps/web/app/login/login-form.tsx
apps/web/app/signup/page.tsx
apps/web/app/signup/signup-form.tsx
apps/web/app/globals.css
```

다른 프레임워크를 쓰더라도 페이지 구조, 카피, 색상, spacing, 상태 표현은 위 명세를 따른다.
