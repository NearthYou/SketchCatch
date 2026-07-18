# Deployment History Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 중복 실행 결과 카드를 제거하고 승인된 C안의 큰 배포 이력 테이블과 상세 패널을 구현한다.

**Architecture:** 기존 `DirectDeploymentScreen`의 데이터 조회와 선택 상태는 유지한다. 표시 구조와 순수 포맷 helper만 교체하고 Terraform·배포 API 동작은 변경하지 않는다.

**Tech Stack:** React, TypeScript, CSS Modules, Node test runner

## Global Constraints

- 롤백, Plan, Apply, Destroy 실행 로직을 변경하지 않는다.
- 본문은 최소 16px, 테이블 행은 최소 80px로 표시한다.
- Commit, digest, Build artifact는 기본 화면에서 접는다.
- 현재 worktree의 다른 staged/unstaged 변경을 보존한다.

---

### Task 1: 표시 계약을 테스트로 고정

**Files:**
- Modify: `apps/web/features/workspace/deployment-three-stage-flow.test.ts`

**Interfaces:**
- Consumes: `DirectDeploymentScreen.tsx`, `workspace.module.css`
- Produces: 중복 카드 부재, table/detail 구조, 큰 typography를 검증하는 source contract

- [ ] 기존 `deploymentRecentResultCard` 존재 assertion을 제거 계약으로 변경한다.
- [ ] 배포 이력이 table과 선택 상세 패널을 사용하고 전용 SelectMenu를 사용하지 않는지 검증한다.
- [ ] 테스트를 실행해 현재 구현에서 실패하는 것을 확인한다.

### Task 2: 배포 이력 UI 교체

**Files:**
- Modify: `apps/web/features/workspace/DirectDeploymentScreen.tsx`
- Modify: `apps/web/features/workspace/workspace.module.css`

**Interfaces:**
- Consumes: `deploymentHistoryEntries`, `selectedHistoryDeploymentId`, `deploymentHistoryDetails`
- Produces: 큰 table row와 선택된 Deployment 상세 패널

- [ ] `최근 실행 결과` aside와 사용되지 않는 파생 값을 제거한다.
- [ ] `renderDeploymentHistory`를 상태·시각·변경·범위 테이블과 선택 상세로 교체한다.
- [ ] 변경 요약과 결과 문장을 만드는 순수 helper를 추가한다.
- [ ] 긴 기술 정보는 native `details` 안으로 이동한다.
- [ ] 데스크톱·모바일 CSS를 승인된 크기와 구조로 교체한다.
- [ ] 집중 테스트를 실행해 통과를 확인한다.

### Task 3: 검증과 정리

**Files:**
- Modify: `agent-progress.md`

**Interfaces:**
- Consumes: 변경된 Web 소스와 테스트 결과
- Produces: 검증 증거와 후속 작업 기록

- [ ] Web lint와 typecheck를 실행한다.
- [ ] Web production build와 harness check를 실행한다.
- [ ] `git diff --check`와 변경 범위를 확인한다.
- [ ] 다른 작업의 변경을 포함하지 않고 결과를 보고한다.
