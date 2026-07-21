# Live Observation AI Signal Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the existing Live Observation traffic animation unchanged and add a small, evidence-based lower dashboard that helps a user decide whether to investigate further.

**Architecture:** `LiveObservationModal` remains the owner of session, query, SSE, abort, retry, and focus behavior. A new pure presentation model converts the latest provider-neutral snapshot into status, at most three deterministic signals, evidence groups, and only safe existing actions. Separate React components render that model below `LiveObservationFocusedFlow` with an isolated CSS Module.

**Tech Stack:** React 19, TypeScript, `node:test`, `renderToStaticMarkup`, lucide-react, CSS Modules.

## Global Constraints

- Do not modify `LiveObservationFocusedFlow.tsx`, `live-observation.ts`, `live-observation-diagram.ts`, `live-observation-capacity-projection.ts`, `live-observation-capacity-transitions.ts`, their existing tests, or focused-flow CSS selectors and animation rules.
- Do not add dependencies, polling, AI calls, mock provider data, automatic mutations, raw provider payloads, ARNs, SDK action names, or fake actions.
- Use only current-session snapshot values; keep absent values unknown rather than converting them to zero or normal.
- Keep at most three signals, deterministically ordered by user impact, severity, freshness, evidence quality, then signal key. The aggregate snapshot has no Resource IDs, so it does not infer Architecture relevance.
- Keep Korean user-facing copy short and non-technical. Mark facts, possibilities, and unknowns separately.

---

### Task 1: Define the provider-neutral dashboard model

**Files:**

- Create: `apps/web/features/workspace/live-observation-signal-dashboard.ts`
- Test: `apps/web/features/workspace/live-observation-signal-dashboard.test.ts`

**Interfaces:**

- Consumes: `LiveObservationV2Snapshot | null` and optional current time.
- Produces: `createLiveObservationSignalDashboardModel(input)` with status summary, up to three signals, grouped masked logs, fact/possibility/unknown evidence, and safe action descriptors.

- [x] Write failing tests for stable ordering, maximum-three policy, missing-value preservation, delayed/unavailable distinction, evidence-required possibilities, and no fabricated latency/baseline signal.
- [x] Run the new test and confirm it fails because the model module is absent.
- [x] Implement the smallest pure model to make the tests pass.
- [x] Run the new model test and relevant existing Live Observation pure tests.

### Task 2: Add bounded session-history and log grouping helpers

**Files:**

- Create: `apps/web/features/workspace/live-observation-session-history.ts`
- Create: `apps/web/features/workspace/live-observation-log-groups.ts`
- Test: `apps/web/features/workspace/live-observation-session-history.test.ts`
- Test: `apps/web/features/workspace/live-observation-log-groups.test.ts`

**Interfaces:**

- Produces: a per-session capped history with at most 120 samples inside 15 minutes; an opaque fingerprint for each normalized, already-masked log group. The current Web contract does not expose source or level.

- [x] Write failing tests for session reset, time/count caps, omitted missing values, repeated log grouping, and representative masked log access.
- [x] Run the new helper tests and confirm they fail because the helpers are absent.
- [x] Implement pure bounded helpers without storage, polling, or data invention.
- [x] Run the helper tests and model tests together.

### Task 3: Render the new lower dashboard

**Files:**

- Create: `apps/web/features/workspace/LiveObservationSignalDashboard.tsx`
- Create: `apps/web/features/workspace/live-observation-signal-dashboard.module.css`
- Test: `apps/web/features/workspace/LiveObservationSignalDashboard.test.tsx`
- Modify: `apps/web/features/workspace/LiveObservationModal.tsx`

**Interfaces:**

- `LiveObservationSignalDashboard` receives the selected snapshot and optional Deployment metadata. It does not draw Resource chips until the provider snapshot contains actual Resource IDs.
- `LiveObservationModal` renders it immediately after `LiveObservationFocusedFlow` without changing traffic-flow props or session behavior.

- [x] Write failing markup and interaction tests for clear status-first hierarchy, keyboard-selectable signals, accessible log details, no fake actions, and empty/no-data states.
- [x] Run the tests and confirm they fail because the component is absent.
- [x] Implement focused components and one isolated CSS Module; preserve mobile one-column behavior and reduced-motion safety.
- [x] Run the UI and existing modal/focused-flow tests.

### Task 4: Document the decision and verify it end to end

**Files:**

- Create: `docs/adr/0017-live-observation-ai-signal-dashboard.md`
- Modify: `docs/adr/README.md`
- Modify: `CONTEXT.md`, `docs/product.md`, `docs/architecture.md`, `docs/data-models.md`
- Modify: `docs/superpowers/specs/2026-07-21-live-observation-dashboard-rebuild-baseline.md`
- Modify: `agent-progress.md`, `feature_list.json`

- [x] Record the maximum-three policy, actual/derived/inferred/unknown boundary, log grouping, bounded history, no automatic changes, AWS-only adapter, traffic-flow protection, and external-reference provenance.
- [x] Confirm both desktop and mobile rendering on a local non-conflicting port without starting AWS traffic generation.
- [x] Run the required focused tests, existing Live Observation tests, harness, lint, typecheck, build, available full tests, and `git diff --check`. The focused Dashboard and Live Observation suites pass. The full repository suite was also run; unrelated Template-catalog and existing API/Terraform expectations still fail and are recorded separately rather than changed here.
- [x] Compare protected-file and focused-flow-CSS hashes with the cleanup baseline before staging only task-related files.
- [x] Create the required single commit: `feat: rebuild live observation signal dashboard`.
