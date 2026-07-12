---
version: alpha
name: Expo-design-analysis
description: A React Native developer-platform whose marketing site reads like a quietly-confident infrastructure brand. The base canvas is pure white with a soft sky-blue gradient atmospheric wash behind the hero; near-black ink (`#171717`) carries body and display alike. The single brand voltage is **pure black** (`#000000`) for primary CTAs — minimal and editorial-feeling, paired with a small blue text-link accent (`#0d74ce`) reserved for inline body links. Type uses Pretendard as the Korean-first primary family, with Noto Sans KR, Inter, and Geist only as clean fallback choices. Keep a maximum two font families active on any one screen. The brand's strongest visual signature is the **device-mockup hero** — a centered MacBook + iPhone composite showing real Expo dev surfaces — over the gradient sky wash.

colors:
  primary: "#000000"
  primary-active: "#1a1a1a"
  text-link: "#0d74ce"
  text-link-secondary: "#476cff"
  ink: "#171717"
  body: "#60646c"
  body-strong: "#171717"
  muted: "#999999"
  muted-soft: "#cccccc"
  hairline: "#f0f0f3"
  hairline-soft: "#f5f5f7"
  hairline-strong: "#dcdee0"
  canvas: "#ffffff"
  canvas-soft: "#fafafa"
  surface-card: "#ffffff"
  surface-strong: "#f0f0f3"
  surface-dark: "#171717"
  surface-dark-elevated: "#1a1a1a"
  on-primary: "#ffffff"
  on-dark: "#ffffff"
  on-dark-soft: "#b0b4ba"
  gradient-sky-light: "#cfe7ff"
  gradient-sky-mid: "#a8c8e8"
  accent-warning: "#ab6400"
  accent-preview: "#8145b5"
  accent-link-bright: "#47c2ff"
  semantic-error: "#eb8e90"
  semantic-success: "#16a34a"

typography:
  display-mega:
    fontFamily: "'Pretendard', 'Noto Sans KR', 'Inter', 'Geist', sans-serif"
    fontSize: 64px
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: 0
  display-xl:
    fontFamily: "'Pretendard', 'Noto Sans KR', 'Inter', 'Geist', sans-serif"
    fontSize: 48px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: 0
  display-lg:
    fontFamily: "'Pretendard', 'Noto Sans KR', 'Inter', 'Geist', sans-serif"
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: 0
  display-md:
    fontFamily: "'Pretendard', 'Noto Sans KR', 'Inter', 'Geist', sans-serif"
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0
  display-sm:
    fontFamily: "'Pretendard', 'Noto Sans KR', 'Inter', 'Geist', sans-serif"
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: 0
  title-md:
    fontFamily: "'Pretendard', 'Noto Sans KR', 'Inter', 'Geist', sans-serif"
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0
  title-sm:
    fontFamily: "'Pretendard', 'Noto Sans KR', 'Inter', 'Geist', sans-serif"
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0
  body-md:
    fontFamily: "'Pretendard', 'Noto Sans KR', 'Inter', 'Geist', sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: "'Pretendard', 'Noto Sans KR', 'Inter', 'Geist', sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  caption:
    fontFamily: "'Pretendard', 'Noto Sans KR', 'Inter', 'Geist', sans-serif"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  caption-uppercase:
    fontFamily: "'Pretendard', 'Noto Sans KR', 'Inter', 'Geist', sans-serif"
    fontSize: 11px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0.04em
    textTransform: uppercase
  code:
    fontFamily: "'Inter', 'Geist', sans-serif"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0
  button:
    fontFamily: "'Pretendard', 'Noto Sans KR', 'Inter', 'Geist', sans-serif"
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: 0
  nav-link:
    fontFamily: "'Pretendard', 'Noto Sans KR', 'Inter', 'Geist', sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0

rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 24px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  base: 16px
  md: 20px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 96px

shadows:
  ring: "0 0 0 1px rgba(0, 0, 0, 0.08)"
  card: "0 0 0 1px rgba(0, 0, 0, 0.08), 0 2px 2px rgba(0, 0, 0, 0.04), 0 16px 40px -24px rgba(23, 23, 23, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.84)"
  product-frame: "0 0 0 1px rgba(0, 0, 0, 0.10), 0 32px 80px -32px rgba(23, 23, 23, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.92)"

components:
  product-frame:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    shadow: "{shadows.product-frame}"
  app-shell-surface:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    shadow: "{shadows.card}"
  top-nav:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.nav-link}"
    height: 64px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 10px 18px
    height: 40px
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 9px 17px
    height: 40px
  button-tertiary-text:
    backgroundColor: transparent
    textColor: "{colors.text-link}"
    typography: "{typography.button}"
  hero-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-mega}"
    padding: 96px
  device-mockup-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: 0
  feature-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.title-md}"
    rounded: "{rounded.lg}"
    padding: 24px
  feature-card-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.title-md}"
    rounded: "{rounded.lg}"
    padding: 24px
  workflow-step-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.body}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 20px
  workflow-step-icon:
    backgroundColor: "{colors.surface-strong}"
    rounded: "{rounded.md}"
    size: 32px
  code-block:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.code}"
    rounded: "{rounded.lg}"
    padding: 20px
  ide-mockup-card:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.lg}"
    padding: 0
  pricing-tier-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 32px
  pricing-tier-featured:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 32px
  text-input:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px 16px
    height: 44px
  badge-pill:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.ink}"
    typography: "{typography.caption-uppercase}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  ecosystem-tile:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.md}"
    size: 64px
  cta-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    padding: 96px
  testimonial-card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.body}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 24px
  footer-light:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    padding: 64px 48px
  footer-link:
    backgroundColor: transparent
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
---

## 0. SketchCatch Reference Contract

이번 UI 재구축의 직접적인 시각 기준은 저장소 루트의 `landing-preview.html`입니다. Landing은 이 파일을 요약해서 참고하는 것이 아니라, 섹션 순서와 제품 미리보기 구성을 React 화면으로 그대로 옮깁니다.

- 흰색 화면 위에 텍스트만 두지 않습니다. 실제 Architecture Board, IaC Preview, Check Finding처럼 제품이 하는 일을 첫 화면에서 바로 보여줍니다.
- 옅은 하늘빛과 흐려지는 48px 그리드는 Landing Hero 안에서만 사용합니다. 인증 화면과 Dashboard의 바깥 배경은 흰색 또는 `#fafafa`이며, 화면 전체에 격자를 깔지 않습니다. 24px 그리드는 Architecture Board의 실제 canvas 안에서만 사용합니다.
- 공식 브랜드 심볼은 `apps/web/public/sketchcatch-logo.png`만 사용합니다. 검은 기하학 심볼을 `SketchCatch` 글자 앞에 배치하고, 이전 파란 SVG 로고나 별도 변형은 사용하지 않습니다.
- 상단 바, Dashboard sidebar, 설정 panel, 제품 미리보기는 흰색 표면과 `{shadows.card}` 또는 `{shadows.product-frame}`로 바닥에서 분리합니다.
- 가장 바깥 제품 프레임은 16px, 일반 card는 12px, button과 input은 8px를 사용합니다. 글자가 들어간 CTA를 pill로 만들지 않습니다.
- Hover는 실제로 누르거나 선택할 수 있는 요소에만 적용합니다. 이동은 2~4px 이내로 제한하고 `transform`, `opacity`만 움직입니다.
- Dark surface는 Terraform, log, code, Check 결과의 집중 영역에만 사용합니다. Dashboard 전체와 일반 card를 검게 만들지 않습니다.
- Landing의 제품 미리보기에서 보이는 기능은 실제 제품 route와 같은 용어를 사용합니다. 없는 API나 배포 결과를 실제 상태처럼 표시하지 않습니다.

### Signature Composition

1. 떠 있는 흰색 navigation 또는 application frame
2. Landing Hero 안에서만 보이는 하늘빛과 흐려지는 기술 그리드
3. 다층 그림자로 분리된 실제 제품 surface
4. 검정 primary CTA 한 개
5. Architecture Resource icon과 실제 상태를 이용한 시각적 초점

이 다섯 가지가 빠져 흰 바탕과 hairline만 남으면 `landing-preview.html`의 스타일을 따른 것으로 보지 않습니다.

## Overview

Expo's marketing site reads like a quietly-confident React-Native developer platform. The base canvas is **pure white** (`{colors.canvas}` — #ffffff) with a soft **sky-blue gradient atmospheric wash** behind the hero band. Near-black ink `{colors.ink}` (#171717) carries body and display alike. The single brand voltage is **pure black** (`{colors.primary}` — #000000) for primary CTAs — minimal and editorial-feeling. A small blue text-link accent (`{colors.text-link}` — #0d74ce) is reserved for inline body links, never as a CTA.

Type runs **Pretendard** as the Korean-first primary family, with Noto Sans KR, Inter, and Geist only as clean fallback choices. A screen may use a **maximum two font families** total; the landing page should usually stay on one sans family, with Inter/Geist reserved only for compact technical samples when a second family is truly needed.

The brand's strongest visual signature is the **device-mockup hero** — a centered MacBook + iPhone composite showing real Expo dev surfaces (Expo Studio, EAS Build dashboard, the Expo Go simulator) — over a sky-blue gradient atmospheric wash. The composite is the page's chrome instead of an illustration.

**Key Characteristics:**
- Pure white canvas with sky-blue gradient atmospheric backdrop in hero only.
- Single primary CTA: pure black pill at `{rounded.md}` (8px) — compact developer-tool dialect.
- Text-link blue (`{colors.text-link}`) for inline links only — never on a CTA.
- Pretendard-first sans type system for Korean service readability.
- Maximum two font families on any one screen.
- Inter or Geist may support English/technical snippets, but only as the second family.
- Device-mockup hero with real Expo product surfaces is the brand chrome.
- Hairline + soft drop depth; no atmospheric brand decoration outside the hero.
- Floating product frames use the multi-layer `{shadows.card}` and `{shadows.product-frame}` recipes from `landing-preview.html`.
- Dashboard and Workspace use a plain white or `#fafafa` outer canvas. The 24px technical grid is reserved for the Architecture Board canvas itself.
- 96px section rhythm.

## Colors

### Brand & Accent
- **Black** (`{colors.primary}` — #000000): Primary CTA fill. Used scarcely.
- **Black Active** (`{colors.primary-active}` — #1a1a1a): Press state.
- **Text Link Blue** (`{colors.text-link}` — #0d74ce): Inline body links inside long-form copy. Scoped narrowly — never on CTAs.
- **Legal Link Blue** (`{colors.text-link-secondary}` — #476cff): Inline links inside legal copy footer.
- **Bright Cyan** (`{colors.accent-link-bright}` — #47c2ff): Used very sparingly inside docs widget links.

### Surface
- **Canvas** (`{colors.canvas}` — #ffffff): Pure white page floor.
- **Canvas Soft** (`{colors.canvas-soft}` — #fafafa): Subtle alternating band.
- **Surface Card** (`{colors.surface-card}` — #ffffff): Pure white card.
- **Surface Strong** (`{colors.surface-strong}` — #f0f0f3): Badges, ecosystem tiles, secondary buttons.
- **Surface Dark** (`{colors.surface-dark}` — #171717): Dark feature cards, code blocks, IDE mockups, featured pricing.
- **Surface Dark Elevated** (`{colors.surface-dark-elevated}` — #1a1a1a): One step lighter inside dark cards.

### Atmospheric Backdrop
- **Sky Light** (`{colors.gradient-sky-light}` — #cfe7ff) + **Sky Mid** (`{colors.gradient-sky-mid}` — #a8c8e8): The soft sky-blue gradient wash behind the homepage hero only. Not a brand action color.

### Hairlines
- **Hairline** (`{colors.hairline}` — #f0f0f3): Default 1px divider.
- **Hairline Soft** (`{colors.hairline-soft}` — #f5f5f7): Lighter divider.
- **Hairline Strong** (`{colors.hairline-strong}` — #dcdee0): Stronger panel outline.

### Text
- **Ink** (`{colors.ink}` — #171717): Display, body emphasis.
- **Body** (`{colors.body}` — #60646c): Default running-text — slightly cool gray.
- **Body Strong** (`{colors.body-strong}` — #171717): Same as ink.
- **Muted** (`{colors.muted}` — #999999): Sub-titles.
- **Muted Soft** (`{colors.muted-soft}` — #cccccc): Disabled text.
- **On Primary** (`{colors.on-primary}` — #ffffff): White text on black CTA.
- **On Dark** (`{colors.on-dark}` — #ffffff): White text on dark cards.
- **On Dark Soft** (`{colors.on-dark-soft}` — #b0b4ba): Muted off-white on dark.

### Semantic
- **Warning** (`{colors.accent-warning}` — #ab6400): Warning text inside docs callouts.
- **Preview** (`{colors.accent-preview}` — #8145b5): "Preview" tag color.
- **Success** (`{colors.semantic-success}` — #16a34a): Confirmation.
- **Error** (`{colors.semantic-error}` — #eb8e90): Validation errors.

## Typography

### Font Family
**Pretendard** is the primary sans family across Korean UI, body, headings, buttons, and captions. Fallback stack: `Pretendard`, `Noto Sans KR`, `Inter`, `Geist`, `sans-serif`. Inter or Geist may be used for English-heavy or technical snippets, but only as the second active family. Keep a **maximum two font families** on any one screen.

Allowed family pool: Pretendard, Noto Sans KR, S-Core, Hanlim Myeongjo, Inter, and Geist. For Korean service screens, default to Pretendard or Noto Sans KR. Avoid decorative brand fonts such as Lotteria, PyeongChang Peace, Binggrae, or similar promotional typefaces because they harm readability and make the product feel less professional.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-mega}` | 64px | 700 | 1.05 | 0 | Homepage hero h1 |
| `{typography.display-xl}` | 48px | 700 | 1.1 | 0 | Subsidiary heroes |
| `{typography.display-lg}` | 36px | 700 | 1.15 | 0 | Section heads |
| `{typography.display-md}` | 28px | 700 | 1.2 | 0 | Sub-section heads |
| `{typography.display-sm}` | 22px | 700 | 1.25 | 0 | Card group titles |
| `{typography.title-md}` | 18px | 700 | 1.4 | 0 | Component titles |
| `{typography.title-sm}` | 16px | 700 | 1.4 | 0 | List labels |
| `{typography.body-md}` | 16px | 400 | 1.5 | 0 | Default body |
| `{typography.body-sm}` | 14px | 400 | 1.5 | 0 | Footer body |
| `{typography.caption}` | 13px | 500 | 1.4 | 0 | Photo captions |
| `{typography.caption-uppercase}` | 11px | 700 | 1.4 | 0.04em | Section labels, badges |
| `{typography.code}` | 13px | 500 | 1.5 | 0 | Compact technical samples — Inter/Geist only when needed |
| `{typography.button}` | 14px | 700 | 1.0 | 0 | CTA labels |
| `{typography.nav-link}` | 14px | 600 | 1.4 | 0 | Top-nav menu |

### Principles
- **Title, body, button, and caption sizes stay fixed once chosen.** Avoid mixing many nearby sizes on the same screen.
- **Display weight stays at 700 in Pretendard** — strong enough for Korean headings without feeling decorative.
- **Body weight stays at 400** with 1.5 line-height for readable Korean paragraphs.
- **Buttons stay at 14px / 700** so action labels feel deliberate.
- **Captions stay at 13px / 500**; uppercase labels use 11px / 700 with modest 0.04em spacing.
- **Letter spacing stays at 0 for Korean text** unless the label is very short uppercase English.
- **Code and technical snippets may use Inter/Geist** as the second family, but do not introduce a third family.

### 줄바꿈 원칙
- UI 텍스트는 단순히 컨테이너 안에 들어가는지가 아니라, 사람이 자연스럽게 읽을 수 있는 의미 단위로 줄바꿈되어야 합니다.
- 한국어 문장은 어절, 조사, 수식어, 핵심 명사구, 숫자와 단위, 제품명과 설명이 어색하게 분리되지 않도록 합니다.
- 제목, 버튼, 카드, 탭, 배지의 텍스트가 부자연스럽게 끊기면 `max-width`, `line-height`, `font-size`, `padding`, 레이아웃을 먼저 조정합니다.
- 일반 UI 문장에는 무분별한 `word-break: break-all`을 사용하지 않습니다. 한국어 문장에는 가능한 한 `word-break: keep-all`을 우선 검토합니다.
- URL, 코드 식별자, 파일 경로, 토큰 값처럼 긴 기술 문자열은 예외입니다. 이 경우 `overflow-wrap`, horizontal scroll, truncation tooltip 중 화면 성격에 맞는 방식을 선택합니다.
- `<br>` 또는 수동 줄바꿈은 제목의 리듬을 의도적으로 제어할 때만 사용합니다. 반응형 화면에서 의미가 깨지면 수동 줄바꿈을 제거하고 레이아웃으로 해결합니다.

### Note on Font Substitutes
Use Pretendard first. Noto Sans KR is the safest Korean fallback; Inter and Geist are clean English-support fallbacks. S-Core and Hanlim Myeongjo can be evaluated for a different Korean brand voice, but do not mix them into the same screen unless one replaces Pretendard. Avoid decorative brand fonts.

## Layout

### Spacing System
- **Base unit:** 4px.
- **Tokens:** `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.base}` 16px · `{spacing.md}` 20px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 96px.
- **Section padding:** 96px.

### Grid & Container
- Max content width: ~1200px.
- Editorial body: 12-column grid.
- Feature card grids: 2-up at desktop for hero splits, 3-up for benefit grids.
- Ecosystem tile grid: 8-up at desktop.
- Footer: 5-column at desktop.

### Whitespace Philosophy
Generous editorial pacing. The white canvas does not compete with the hero's gradient sky wash; cards inside dense workflow sections sit close (16-24px gap).

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Flat (canvas) | `{colors.canvas}` (#ffffff) | Body bands, footer |
| Card | `{colors.surface-card}` (#ffffff) | Content cards |
| Hairline border | 1px `{colors.hairline}` | Card outlines |
| Ring | `{shadows.ring}` | Compact control and selected tab |
| Card | `{shadows.card}` | Navigation, Dashboard panel, resource node |
| Product frame | `{shadows.product-frame}` | Landing preview and major application frame |
| Atmospheric gradient | Sky-blue radial wash | Hero backdrop only |
| Dark inversion | `{colors.surface-dark}` (#171717) | Dark feature cards, code blocks, featured pricing |

### Decorative Depth
- **Sky-blue gradient backdrop** in the hero only — atmospheric depth without claiming to be a brand color.
- **Device mockup composite** as page chrome — MacBook + iPhone showing real Expo dev surfaces.
- **SketchCatch product frame** replaces generic device chrome when the page explains this product: show the actual Board, IaC Preview, or Check surface inside the elevated frame.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Reserved |
| `{rounded.xs}` | 4px | Inline tags |
| `{rounded.sm}` | 6px | Compact rows |
| `{rounded.md}` | 8px | CTA buttons, form inputs, ecosystem tiles |
| `{rounded.lg}` | 12px | Feature cards, code blocks, pricing tiers |
| `{rounded.xl}` | 16px | Device mockup cards |
| `{rounded.xxl}` | 24px | Larger atmospheric cards (rare) |
| `{rounded.pill}` | 9999px | Badges only |
| `{rounded.full}` | 9999px | Avatar plates (rare) |

Compact developer-ergonomic radii — 8px CTAs, 12px cards. Pill geometry is reserved for badges, never CTAs.

## Components

### Top Navigation

**`top-nav`** — Background `{colors.canvas}`, text `{colors.ink}`, height 64px. Layout: Expo wordmark left, primary horizontal menu (Tools / Workflows / EAS / Pricing / Docs / Showcase), Sign In + Get started CTA right.

### Buttons

**`button-primary`** — Pure black pill. Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.button}` (14px / 500), padding 10px × 18px, height 40px, rounded `{rounded.md}` (8px).

**`button-primary-active`** — Press state. Background `{colors.primary-active}`.

**`button-secondary`** — White card with 1px hairline-strong border. Background `{colors.surface-card}`, text `{colors.ink}`, 1px `{colors.hairline-strong}` border.

**`button-tertiary-text`** — Inline blue text link. Background transparent, text `{colors.text-link}`.

### Hero & Device Mockup

**`hero-band`** — Background `{colors.canvas}` with a soft sky-blue gradient wash behind the centered headline. Display headline in `{typography.display-mega}` (64px / 600 / -1.92px), subhead in `{typography.body-md}`, single primary CTA, then below — the device mockup composite.

**`device-mockup-card`** — A layered MacBook + iPhone composite showing real Expo dev surfaces. Background `{colors.surface-card}`, rounded `{rounded.xl}`. The MacBook holds the EAS dashboard or Expo Studio screenshot; the iPhone overlay shows the running app in Expo Go. This is the page chrome.

### Cards

**`feature-card`** — Background `{colors.surface-card}`, text `{colors.ink}`, type `{typography.title-md}`, rounded `{rounded.lg}`, padding 24px, 1px `{colors.hairline-strong}` border.

**`feature-card-dark`** — Dark variant. Background `{colors.surface-dark}`, text `{colors.on-dark}`. Same shape, dark inversion.

**`workflow-step-card`** — Step in the "Get your app on every device" workflow row. Background `{colors.surface-card}`, text `{colors.body}`, rounded `{rounded.lg}`, padding 20px. Layout: 32px square `{component.workflow-step-icon}` + step number + label + body.

**`workflow-step-icon`** — Square plate. Background `{colors.surface-strong}`, rounded `{rounded.md}`, 32px size.

**`testimonial-card`** — Quote card. Background `{colors.surface-card}`, text `{colors.body}`, rounded `{rounded.lg}`, padding 24px.

### Code & IDE

**`code-block`** — Inline code block. Background `{colors.surface-dark}`, text `{colors.on-dark}` in `{typography.code}` (Inter/Geist 13px), rounded `{rounded.lg}`, padding 20px. White text on dark.

**`ide-mockup-card`** — Stylized IDE mockup. Background `{colors.surface-dark}`, rounded `{rounded.lg}`. Multi-pane editor + terminal preview.

### Pricing

**`pricing-tier-card`** — Standard pricing tier. Background `{colors.surface-card}`, rounded `{rounded.lg}`, padding 32px, 1px `{colors.hairline-strong}` border.

**`pricing-tier-featured`** — Featured tier. Background `{colors.surface-dark}`, text `{colors.on-dark}`. Same shape, dark inversion.

### Ecosystem

**`ecosystem-tile`** — Square logo plate for ecosystem partner logos (TypeScript, React, Sentry, etc.). Background `{colors.surface-card}`, rounded `{rounded.md}`, 64px size, 1px `{colors.hairline}` border.

### Forms & Tags

**`text-input`** — Background `{colors.surface-card}`, text `{colors.ink}`, rounded `{rounded.md}` (8px), padding 12px × 16px, height 44px, 1px `{colors.hairline-strong}` border. Focus thickens border to 2px ink.

**`badge-pill`** — Small uppercase pill. Background `{colors.surface-strong}`, text `{colors.ink}`, type `{typography.caption-uppercase}`, rounded `{rounded.pill}`, padding 4px × 10px.

### CTA / Footer

**`cta-band`** — Pre-footer band. Background `{colors.canvas}`, centered display headline in `{typography.display-lg}`, single black pill CTA. 96px padding.

**`footer-light`** — Closing white footer. Background `{colors.canvas}`, text `{colors.body}`. 5-column link list. 64×48px padding.

**`footer-link`** — Background transparent, text `{colors.body}`, type `{typography.body-sm}`.

## Do's and Don'ts

### Do
- Reserve `{colors.primary}` (black) for primary CTAs.
- Use `{colors.text-link}` (blue) for inline body links only — never on CTAs or buttons.
- Set every CTA at `{rounded.md}` (8px) — developer dialect.
- Use Pretendard at 700 for display and 400 for body.
- Use no more than two active font families on a screen.
- Use Inter or Geist only for English-heavy or technical snippets when the second family is needed.
- Avoid decorative brand fonts and promotional typefaces.
- Pair the hero with the device-mockup composite — it's the page chrome.

### Don't
- Don't introduce a saturated brand action color. Black is the only CTA fill.
- Don't use blue (`{colors.text-link}`) on a CTA. Inline links only.
- Don't drop display below weight 600 or above 700.
- Don't use full pills on CTAs — pills are for badges only.
- Don't replicate the sky-blue gradient backdrop outside the hero.
- Don't extract a CTA color from a third-party widget (cookie consent, OneTrust). The brand's CTA is what appears on actual page CTAs.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 640px | Hero h1 64→32px; device mockup → single iPhone screen; feature grid 1-up; nav hamburger. |
| Tablet | 640–1024px | Hero h1 48px; device mockup compresses; feature grid 2-up. |
| Desktop | 1024–1280px | Full hero h1 64px; full MacBook + iPhone composite; feature grid 3-up. |
| Wide | > 1280px | Content caps at 1200px. |

### Touch Targets
- Primary CTA at 40px height — at WCAG AA, padded for AAA.
- Search input 44px — at AAA.

### Collapsing Strategy
- Top nav switches to hamburger below 768px.
- Device mockup MacBook + iPhone collapses to a single iPhone preview on mobile.
- Feature grid: 3-up → 2-up → 1-up.
- Ecosystem tile grid: 8-up → 4-up → 3-up → 2-up.

## Iteration Guide

1. Focus on a single component at a time.
2. CTAs default to `{rounded.md}` (8px). Cards use `{rounded.lg}` (12px).
3. Variants live as separate entries.
4. Use `{token.refs}` everywhere — never inline hex.
5. Hover state never documented.
6. Pretendard 700 for display, Pretendard 400 for body. Inter or Geist may support technical snippets as the second family only.
7. Black stays the only CTA color; text-link blue stays inline-only.

## Known Gaps

- Pretendard, Noto Sans KR, Inter, and Geist are clean baseline choices; confirm licensing before bundling any additional Korean family.
- Animation timings (device mockup parallax, hero entrance) out of scope.
- In-app surfaces (EAS dashboard interactive, Expo Go simulator) only partially captured via marketing mockups.
- Form validation states beyond focus not visible on captured surfaces.
