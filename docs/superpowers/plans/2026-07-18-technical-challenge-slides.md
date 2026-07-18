# SketchCatch 기술 챌린지 슬라이드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 Google Slides의 11쪽 뒤에 코드 근거가 있는 대표 기술 챌린지 세 장을 추가하고, 기존 자기평가와 멘토링 보고서를 보존한 16쪽 자료로 완성한다.

**Architecture:** 현재 검증된 6~11쪽 로컬 PPTX는 레이아웃·스타일 frame만 상속하고 본문은 새로 작성한다. 세 장을 외부 scratch workspace에서 `@oai/artifact-tool`로 생성·렌더링·검증한 뒤 Chrome의 Google Slides UI에서 11쪽 뒤에 가져온다. 최종 검증은 실제 Google Slides 화면, 전체 페이지 수, 저장 상태를 기준으로 한다.

**Tech Stack:** Google Slides, Chrome extension control, JavaScript ESM, `@oai/artifact-tool`, LibreOffice slide rendering, presentation template-following scripts

## Global Constraints

- 검증 기준은 `dev` commit `1b1efeb1`과 `feature_list.json`의 2026-07-15~17 검증 기록이다.
- 기존 6~11쪽, 자기평가, 주차별 멘토링 표의 내용은 변경하지 않는다.
- 신규 3장은 기존 `04 프로젝트 수행 경과 (도출과정)` header, 흑백·회색 팔레트, 글꼴, 여백, 페이지 번호 톤을 유지한다.
- 예전 제품 화면이나 설명되지 않는 UI 캡처를 사용하지 않는다.
- 새 기능, 수치, 성과를 추정하지 않는다.
- 실제 AWS Apply/Destroy, build, GitHub PR, cloud mutation을 실행하지 않는다.
- 외부 scratch 파일은 repository에 추가하지 않는다.

---

### Task 1: Template Frame과 근거 원장 준비

**Files:**
- Read: `C:/Users/siwon/AppData/Local/Temp/codex-presentations/019f704a-0e47-78d0-856f-995f51776898/sketchcatch-current-slides/tmp/history-ledger-audit/final/sketchcatch-history-ledger-6-11.pptx`
- Create: `C:/Users/siwon/AppData/Local/Temp/codex-presentations/019f704a-0e47-78d0-856f-995f51776898/sketchcatch-technical-challenges/tmp/source-notes.txt`
- Create: `C:/Users/siwon/AppData/Local/Temp/codex-presentations/019f704a-0e47-78d0-856f-995f51776898/sketchcatch-technical-challenges/tmp/template-frame-map.json`
- Create: `C:/Users/siwon/AppData/Local/Temp/codex-presentations/019f704a-0e47-78d0-856f-995f51776898/sketchcatch-technical-challenges/tmp/deviation-log.txt`

**Interfaces:**
- Consumes: verified 6-slide template deck and `docs/superpowers/specs/2026-07-18-technical-challenge-slides-design.md`.
- Produces: one validated inherited frame for each new slide and a traceable source ledger.

- [ ] **Step 1: Initialize the external presentation workspace**

Run:

```powershell
node "C:\Users\siwon\.codex\plugins\cache\openai-primary-runtime\presentations\26.715.12143\skills\presentations\container_tools\setup_artifact_tool_workspace.mjs" --workspace "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-technical-challenges\tmp"
```

Expected: the scratch workspace resolves the bundled `@oai/artifact-tool` package without modifying `pnpm-lock.yaml`.

- [ ] **Step 2: Inspect the verified template deck**

Run:

```powershell
node "C:\Users\siwon\.codex\plugins\cache\openai-primary-runtime\presentations\26.715.12143\skills\presentations\template_following_scripts\inspect_template_deck.mjs" --workspace "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-technical-challenges\tmp" --pptx "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-current-slides\tmp\history-ledger-audit\final\sketchcatch-history-ledger-6-11.pptx"
```

Expected: the inspection output identifies the header, gray section chrome, footer page number, and editable body objects for all six source slides.

- [ ] **Step 3: Write the evidence ledger**

Create `source-notes.txt` with these exact evidence lines:

```text
Slide 12: docs/deployment.md Direct Deployment 사용자 단계; deployment-approval-service.ts; deployment-plan-service.ts; deployment-apply-service.ts; feature DIRECT-DEPLOYMENT-THREE-STAGE-001 17/17; DEPLOYMENT-OPTIMIZATION-CONTRACT-434 83/83 and approval/destroy 22/22.
Slide 13: docs/architecture.md Deployment 최적화 경계; docs/data-models.md ApplicationArtifact and Runtime Convergence Adapter; APPLICATION-ARTIFACT-REGISTRY-433 59/59; RUNTIME-CONVERGENCE-435 79/79; seven artifact kinds; ten runtime adapters.
Slide 14: docs/data-models.md ProjectDraft; project-draft-save-service.ts; project-draft-persistence.ts; PROJECT-DRAFT-CONCURRENCY-458 API 32/32, Workspace 37/37, entrypoint 2/2, verified Chromium three-tab flow.
Baseline: branch dev, commit 1b1efeb1. Source deck content is not reused; only inherited template chrome is retained.
```

- [ ] **Step 4: Validate the three-frame template map**

Map all three outputs to a low-density inherited `04 프로젝트 수행 경과 (도출과정)` frame. Mark only title, body, and page marker as editable; preserve header chrome. Run:

```powershell
node "C:\Users\siwon\.codex\plugins\cache\openai-primary-runtime\presentations\26.715.12143\skills\presentations\template_following_scripts\validate_template_plan.mjs" --workspace "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-technical-challenges\tmp" --map "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-technical-challenges\tmp\template-frame-map.json"
```

Expected: `issueCount: 0`.

### Task 2: Three Technical-Challenge Slides Authoring

**Files:**
- Create: `C:/Users/siwon/AppData/Local/Temp/codex-presentations/019f704a-0e47-78d0-856f-995f51776898/sketchcatch-technical-challenges/tmp/technical-challenge-slides.mjs`
- Create: `C:/Users/siwon/AppData/Local/Temp/codex-presentations/019f704a-0e47-78d0-856f-995f51776898/sketchcatch-technical-challenges/final/sketchcatch-technical-challenges-12-14.pptx`

**Interfaces:**
- Consumes: validated template starter deck, source ledger, and exact copy below.
- Produces: a three-slide PPTX whose slide order is 12, 13, 14.

- [ ] **Step 1: Build the template starter deck**

Run:

```powershell
node "C:\Users\siwon\.codex\plugins\cache\openai-primary-runtime\presentations\26.715.12143\skills\presentations\template_following_scripts\prepare_template_starter_deck.mjs" --workspace "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-technical-challenges\tmp" --pptx "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-current-slides\tmp\history-ledger-audit\final\sketchcatch-history-ledger-6-11.pptx" --map "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-technical-challenges\tmp\template-frame-map.json" --out "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-technical-challenges\tmp\template-starter.pptx" --preview-dir "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-technical-challenges\tmp\template-starter-preview" --layout-dir "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-technical-challenges\tmp\template-starter-layout" --contact-sheet "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-technical-challenges\tmp\template-starter-contact-sheet.png"
```

Expected: a three-slide starter deck with intact template chrome and no inherited body content used as evidence.

- [ ] **Step 2: Author slide 12**

Use this audience-facing copy:

```text
Title: 기술적 챌린지 ① 승인한 상태와 실행 상태의 불일치 차단
Problem: Plan 확인 이후 설계·Terraform·AWS 대상이 바뀌면 사용자가 검토하지 않은 변경이 실행될 수 있다.
Flow: ① Board·Terraform revision 저장 → ② tfplan과 artifact hash 고정 → ③ account·region 포함 승인 snapshot → ④ Apply 직전 전체 재검증 → ⑤ 불일치 시 실행 중단
Result: 사용자에게는 검증 → 승인 → 배포의 세 단계만 노출하고, 서버는 승인 근거를 실행 직전까지 고정한다.
Evidence: Direct 17/17 · Plan/route 83/83 · 승인·Destroy 22/22 · dev 1b1efeb1
```

The central flow uses five equal steps. The bottom row contains a two-line implementation result on the left and the evidence counts on the right.

- [ ] **Step 3: Author slide 13**

Use this audience-facing copy:

```text
Title: 기술적 챌린지 ② 캐시를 믿지 않고 중복 빌드·배포만 제거
Problem: 같은 commit의 반복 실행은 낭비지만, DB 기록만 믿고 생략하면 삭제·변조된 artifact나 unhealthy runtime을 정상으로 오판할 수 있다.
Flow: ① canonical fingerprint → ② project claim·lease → ③ provider digest·account·region·ownership 검증 → ④ runtime target·health 검증 → ⑤ 일치하면 already_active, 아니면 안전한 rollout
Result: Direct와 Git/CI/CD는 같은 Registry를 사용하지만 실제 provider 상태를 확인한 경우에만 재사용한다.
Evidence: artifact kind 7종 · runtime adapter 10종 · Artifact 59/59 · Convergence 79/79
```

Highlight the rule `cache hit ≠ 재사용 허용` as the only emphasized callout.

- [ ] **Step 4: Author slide 14**

Use this audience-facing copy:

```text
Title: 기술적 챌린지 ③ 여러 탭에서도 설계 이력을 덮어쓰지 않기
Problem: 오래된 탭의 자동 저장이 최신 Architecture Board와 Terraform working draft를 덮어쓸 수 있다.
Flow: ① expectedRevision 전송 → ② projectId+revision 조건부 저장 → ③ 불일치 시 409, 서버 상태 유지 → ④ 탭별 IndexedDB·Web Lock → ⑤ 서버 최신본 또는 로컬 복구본 선택
Result: 실시간 공동 편집 없이도 stale write와 탭별 복구본 유실을 막는 편집 경계를 확보했다.
Evidence: API 32/32 · Workspace 37/37 · 진입 계약 2/2 · 실제 Chromium 3-tab 검증
```

Do not describe this as real-time collaboration.

- [ ] **Step 5: Export the three-slide PPTX**

Run:

```powershell
node "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-technical-challenges\tmp\technical-challenge-slides.mjs"
```

Expected: `sketchcatch-technical-challenges-12-14.pptx` exists and contains exactly three slides.

### Task 3: Local Rendering and Template QA

**Files:**
- Read: `C:/Users/siwon/AppData/Local/Temp/codex-presentations/019f704a-0e47-78d0-856f-995f51776898/sketchcatch-technical-challenges/final/sketchcatch-technical-challenges-12-14.pptx`
- Create: `C:/Users/siwon/AppData/Local/Temp/codex-presentations/019f704a-0e47-78d0-856f-995f51776898/sketchcatch-technical-challenges/tmp/qa/*`

**Interfaces:**
- Consumes: authored three-slide PPTX.
- Produces: rendered evidence with no overflow or template deviation.

- [ ] **Step 1: Render every slide**

Run:

```powershell
python "C:\Users\siwon\.codex\plugins\cache\openai-primary-runtime\presentations\26.715.12143\skills\presentations\container_tools\render_slides.py" "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-technical-challenges\final\sketchcatch-technical-challenges-12-14.pptx"
```

Expected: three PNG renders.

- [ ] **Step 2: Run overflow detection**

Run:

```powershell
python "C:\Users\siwon\.codex\plugins\cache\openai-primary-runtime\presentations\26.715.12143\skills\presentations\container_tools\slides_test.py" "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-technical-challenges\final\sketchcatch-technical-challenges-12-14.pptx"
```

Expected: `Test passed. No overflow detected.`

- [ ] **Step 3: Check template fidelity**

Run:

```powershell
node "C:\Users\siwon\.codex\plugins\cache\openai-primary-runtime\presentations\26.715.12143\skills\presentations\template_following_scripts\check_template_fidelity.mjs" --workspace "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-technical-challenges\tmp" --pptx "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-technical-challenges\final\sketchcatch-technical-challenges-12-14.pptx" --map "C:\Users\siwon\AppData\Local\Temp\codex-presentations\019f704a-0e47-78d0-856f-995f51776898\sketchcatch-technical-challenges\tmp\template-frame-map.json"
```

Expected: `issueCount: 0`.

- [ ] **Step 4: Inspect each render at full size**

Confirm:

```text
- all three titles remain on one line
- five flow steps have equal spacing and no clipped arrows or labels
- footer numbers are 12, 13, 14
- evidence counts are readable and not presented as business outcomes
- no source-slide body text remains
```

### Task 4: Google Slides Import and Ordering

**Files:**
- Modify in place: `https://docs.google.com/presentation/d/1mH2kyNvXFIuR1HqgeUxYanzY97Io3SGo/edit`

**Interfaces:**
- Consumes: locally verified three-slide PPTX.
- Produces: the existing deck with new slides 12–14 and original slides shifted to 15–16.

- [ ] **Step 1: Open the existing deck with Chrome control**

Expected: the filmstrip shows the current 13 slides and slide 11 is the last `04 프로젝트 수행 경과` slide before self-evaluation.

- [ ] **Step 2: Import all three verified slides after slide 11**

Use Google Slides `슬라이드 가져오기` with the local PPTX. Import all three in source order and preserve their formatting.

Expected ordering:

```text
11 누적 구현 결과와 다음 멘토링 안건
12 승인 상태와 실행 상태 불일치 차단
13 provider 검증 기반 빌드·배포 재사용
14 ProjectDraft 편집 충돌 방지
15 자기평가
16 Appendix. 주차별 멘토링 보고서
```

- [ ] **Step 3: Confirm original slides are untouched**

Visually compare slides 6–11, 15, and 16 with their pre-import state. Do not edit their body copy.

### Task 5: Final Browser QA and Repository Clean State

**Files:**
- Read: Google Slides final deck
- Read: repository working tree

**Interfaces:**
- Consumes: imported 16-slide deck.
- Produces: saved, visually verified presentation and a clean repository.

- [ ] **Step 1: Verify all 16 slide thumbnails and order**

Expected: filmstrip reports 16 slides and slides 12–14 appear between the accumulated result and self-evaluation.

- [ ] **Step 2: Inspect slides 12–14 at full size**

Check title wrapping, text clipping, unexpected overlap, footer numbering, and visual consistency. If an issue exists, fix the local source, regenerate, re-import only the affected slide, and delete the invalid copy.

- [ ] **Step 3: Verify Google Drive save state**

Expected visible status: `문서 상태: 드라이브에 저장됨`.

- [ ] **Step 4: Run final repository checks**

Run:

```powershell
pnpm harness:check
git status --short
```

Expected: harness passes and the only repository commits are the approved design and plan documents; no scratch files are untracked.

- [ ] **Step 5: Finalize the deliverable browser tab**

Keep the edited Google Slides tab as the deliverable and close temporary import tabs only after the save status is confirmed.
