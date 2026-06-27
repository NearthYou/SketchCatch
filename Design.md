# SketchCatch Design System

## 1. Atmosphere & Identity

SketchCatch feels like a quiet infrastructure workbench: practical, inspectable, and calm under risk. The signature is resource-first clarity, where white panels, compact labels, and status colors help users compare cost, security, simulation, and Terraform feedback without feeling like the UI is making deployment decisions for them.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
| --- | --- | --- | --- | --- |
| Surface/primary | `--surface-primary` | `#f7f9fc` | `#07080d` | Workspace background |
| Surface/secondary | `--surface-secondary` | `#ffffff` | `#10131c` | Panels, forms, cards |
| Surface/elevated | `--surface-elevated` | `#eef4fb` | `#161a25` | Soft emphasis surfaces |
| Text/primary | `--text-primary` | `#1d2433` | `#f7f8fb` | Main text |
| Text/secondary | `--text-secondary` | `#5a667a` | `#aeb8c7` | Help text, labels |
| Text/tertiary | `--text-tertiary` | `#7b8798` | `#7f8a9c` | Muted metadata |
| Border/default | `--border-default` | `#d8e0ea` | `#303849` | Panel outlines |
| Border/subtle | `--border-subtle` | `#e8edf4` | `#222938` | Inner dividers |
| Accent/primary | `--accent-primary` | `#1f6feb` | `#58a6ff` | Main actions, links, focus |
| Accent/hover | `--accent-hover` | `#1858c9` | `#79b8ff` | Hovered main actions |
| Status/success | `--status-success` | `#16803c` | `#3fb950` | Passing checks |
| Status/warning | `--status-warning` | `#b26a00` | `#d29922` | Cost/risk warnings |
| Status/error | `--status-error` | `#c2412d` | `#f85149` | Errors and blockers |
| Status/info | `--status-info` | `#2c6fbb` | `#58a6ff` | Informational labels |

### Rules

- Use status colors only for state, not decoration.
- Keep the workspace light, dense, and scan-friendly.
- Do not add raw colors in new workspace UI. Extend this table first.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- |
| Display | `3rem` | 800 | 1.1 | 0 | Landing and major page titles |
| H2 | `1rem` | 800 | 1.3 | 0 | Workspace panel titles |
| Body | `1rem` | 400 | 1.6 | 0 | Default reading text |
| Body/sm | `0.9rem` | 400 | 1.5 | 0 | Panel descriptions |
| Caption | `0.75rem` | 700 | 1.4 | 0 | Labels and metadata |

### Font Stack

- Primary: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Mono: system monospace when code blocks need it.

### Rules

- Workspace panel headings stay compact.
- Body text never drops below `0.875rem`.
- Use tabular or mono styling only for code, Terraform, and numeric-heavy rows.

## 4. Spacing & Layout

### Base Unit

All spacing derives from a base of `4px`.

| Token | Value | Usage |
| --- | --- | --- |
| `--space-1` | `4px` | Tight icon or label spacing |
| `--space-2` | `8px` | Compact inline groups |
| `--space-3` | `12px` | Form and list gaps |
| `--space-4` | `16px` | Standard panel rhythm |
| `--space-5` | `20px` | Panel padding |
| `--space-6` | `24px` | Section groups |
| `--space-8` | `32px` | Larger groups |
| `--space-10` | `40px` | Page sections |
| `--space-12` | `48px` | Shell padding |

### Grid

- Max workspace width: `1440px`.
- Workspace panels use responsive CSS Grid with `minmax()` to prevent overflow.
- Mobile switches to a single-column grid below `980px`.

### Rules

- Keep operational UI dense but not cramped.
- Avoid nested cards; use panels for major workflows and lists for repeated results.

## 5. Components

### Workspace Panel

- **Structure**: `section.workspacePanel` with a compact `h2`, form controls, actions, or result lists.
- **Variants**: `toolPanel`, `resultPanel`.
- **Spacing**: `--space-3` gaps, `--space-5` padding.
- **States**: loading and error appear as banners outside the panel grid.
- **Accessibility**: labels use `htmlFor` for inputs.
- **Motion**: simple hover transitions only.

### Workspace Buttons

- **Structure**: `button.primaryButton` or `button.secondaryButton`.
- **Variants**: primary for main request, secondary for helper request.
- **Spacing**: minimum height `40px`, horizontal padding from the existing CSS.
- **States**: hover, focus-visible, disabled.
- **Accessibility**: disabled state must match actual unavailable action.
- **Motion**: transform and color transitions only.

### Result List

- **Structure**: summary text plus `ul.resultList`.
- **Variants**: findings, Terraform resources, simulation results.
- **Spacing**: `--space-3` stack gap.
- **States**: empty results use `emptyState`.
- **Accessibility**: preserve list semantics.
- **Motion**: none.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
| --- | --- | --- | --- |
| Micro | `160ms` | `ease` | Button hover, focus ring |
| Standard | `200ms` | `ease-in-out` | Panel state changes |

### Rules

- Animate only `transform`, `opacity`, `color`, `border-color`, and `box-shadow`.
- Every clickable control needs hover, focus-visible, and disabled states.
- Do not add scroll-driven or decorative motion to workspace tools.

## 7. Depth & Surface

### Strategy

Use borders-only for workspace tools. The product should feel reviewable and stable, not decorative.

| Type | Value | Usage |
| --- | --- | --- |
| Default | `1px solid var(--border-default)` | Workspace panels |
| Subtle | `1px solid var(--border-subtle)` | Inner result rows |
| Dashed | `1px dashed var(--border-default)` | Empty states |

### Rules

- Cards may use `8px` radius at most in workspace flows.
- Do not add decorative orbs or gradient blobs to operational screens.
