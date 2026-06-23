# SketchCatch Design System

## 1. Atmosphere & Identity

SketchCatch feels like a quiet infrastructure workbench: practical, legible, and careful about risk. The signature is a split command surface where draft input, architecture evidence, risk findings, and code explanations stay close together without turning into a marketing page.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|------|-------|-------|------|-------|
| Surface/primary | --surface-primary | #f7f9fc | #111827 | App background |
| Surface/secondary | --surface-secondary | #ffffff | #1f2937 | Panels and form areas |
| Surface/elevated | --surface-elevated | #eef4fb | #273449 | Selected summaries |
| Text/primary | --text-primary | #1d2433 | #f9fafb | Main copy |
| Text/secondary | --text-secondary | #5a667a | #cbd5e1 | Supporting copy |
| Text/tertiary | --text-tertiary | #7b8798 | #94a3b8 | Captions and metadata |
| Border/default | --border-default | #d8e0ea | #334155 | Panel borders |
| Border/subtle | --border-subtle | #e8edf4 | #273449 | Soft separators |
| Accent/primary | --accent-primary | #1f6feb | #60a5fa | Primary actions and focus |
| Accent/hover | --accent-hover | #1858c9 | #93c5fd | Action hover |
| Status/success | --status-success | #16803c | #4ade80 | Passing checks |
| Status/warning | --status-warning | #b26a00 | #fbbf24 | Risk warnings |
| Status/error | --status-error | #c2412d | #f87171 | Failed checks |
| Status/info | --status-info | #2c6fbb | #60a5fa | Informational metadata |

### Rules

- Accent is reserved for actions, links, focus rings, and selected states.
- Status colors appear only on analysis output or validation states.
- New colors must be added here before they appear in code.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| Display | 48px / 3rem | 700 | 1.1 | 0 | Main page title |
| H1 | 36px / 2.25rem | 700 | 1.2 | 0 | Section title |
| H2 | 24px / 1.5rem | 700 | 1.3 | 0 | Workspace group title |
| H3 | 18px / 1.125rem | 700 | 1.4 | 0 | Panel title |
| Body/lg | 18px / 1.125rem | 400 | 1.6 | 0 | Lead paragraph |
| Body | 16px / 1rem | 400 | 1.6 | 0 | Default text |
| Body/sm | 14px / 0.875rem | 400 | 1.5 | 0 | Secondary text |
| Caption | 12px / 0.75rem | 600 | 1.4 | 0 | Labels and badges |

### Font Stack

- Primary: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif.
- Mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace.

### Rules

- Body text stays at 14px or larger.
- Letter spacing remains 0 unless the token table says otherwise.

## 4. Spacing & Layout

### Base Unit

All spacing derives from a base of 4px.

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Tight inline separation |
| --space-2 | 8px | Compact groups |
| --space-3 | 12px | Form field padding |
| --space-4 | 16px | Standard inner spacing |
| --space-5 | 20px | Panel content spacing |
| --space-6 | 24px | Comfortable panel spacing |
| --space-8 | 32px | Groups inside workspace |
| --space-10 | 40px | Page section spacing |
| --space-12 | 48px | Page shell padding |

### Grid

- Max content width: 1440px.
- Column system: responsive CSS grid with 16px to 24px gutters.
- Breakpoints: sm 640px, md 768px, lg 1024px, xl 1280px.

### Rules

- Workspace tools use full-width bands or direct panels, not nested cards.
- Fixed tool areas use stable dimensions so loading text and results do not resize the layout unexpectedly.

## 5. Components

### Workspace Panel

- **Structure**: section with a compact heading, optional helper text, and one primary content area.
- **Variants**: input panel, result panel, findings panel.
- **Spacing**: --space-5 or --space-6 inner padding, --space-4 internal gaps.
- **States**: default, loading, error, empty.
- **Accessibility**: headings are semantic, form controls have visible labels, focus is tokenized.

### Button

- **Structure**: native button with text label.
- **Variants**: primary, secondary.
- **Spacing**: --space-3 vertical, --space-4 horizontal.
- **States**: default, hover, active, focus, disabled, loading.
- **Accessibility**: disabled state uses real `disabled`, focus ring uses --accent-primary.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 120ms | ease-out | Button and input state |
| Standard | 200ms | ease-in-out | Result panel updates |

### Rules

- Animate only color, opacity, and transform.
- Every interactive element has hover and focus-visible states.
- Loading states use text and disabled controls instead of layout-shifting spinners.

## 7. Depth & Surface

### Strategy

Use borders-only with subtle tonal fills.

| Type | Value | Usage |
|------|-------|-------|
| Default | 1px solid var(--border-default) | Panels and form controls |
| Subtle | 1px solid var(--border-subtle) | Dividers and low-emphasis groups |

Shadows are not part of the current system.
