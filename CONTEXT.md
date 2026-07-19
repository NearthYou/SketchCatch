# SketchCatch

SketchCatch is a multi-cloud-ready IaC operations service that turns text or voice requirements, Source Repository evidence, and existing cloud state into provider-neutral Practice Architectures, strengthens them with AI, Bedrock, and Amazon Q Assistance, and connects them to Terraform IaC Preview, Git/CI/CD Integration, Direct Deployment, Reverse Engineering, Deployment History, and Auto Cleanup.

## Language

**Practice Architecture**:
A cloud infrastructure design described as connected resources, constraints, and operator-facing explanations. It is the thing the user designs before any deployment exists.
_Avoid_: Infrastructure, diagram, AWS setup

**Architecture Board**:
The visual workspace where a Practice Architecture is shown and edited as resource nodes and relationships.
_Avoid_: Main board, canvas, drawing board

**Resource**:
An infrastructure building block from a cloud provider inside a Practice Architecture, such as AWS VPC, Azure Virtual Network, GCP VPC Network, compute instances, databases, storage, IAM, or edge delivery resources.
_Avoid_: Component, block, service

**Curated Module**:
A reusable, preassembled group of Resources, relationships, configuration, and Board structure offered from the Workspace `Modules` catalog. Expanding one creates editable Resources on the Architecture Board; it is not a Terraform module or an indivisible parent Resource.
_Avoid_: Terraform module, Template, Resource category, AI pattern

**Module Pattern Knowledge**:
Versioned, normalized Resource relationships, containment, relative geometry, layering, and edge routing extracted deterministically from Template Boards. Curated Modules and the Architecture Board Compiler share it instead of inventing separate layouts.
_Avoid_: Hand-authored module coordinates, LLM layout, Template screenshot

**Provider Adapter**:
The cloud-specific connector that translates provider APIs, Resource types, IaC import details, and deployment constraints into SketchCatch's provider-neutral Practice Architecture model.
_Avoid_: Cloud plugin, provider switch, cloud mode

**Runtime Cache**:
SketchCatch's internal runtime support for short-lived coordination, cached results, session-adjacent state, background job status, or streaming-friendly execution metadata. It is not a user Practice Architecture Resource. The first priority is long-running workflow support for Deployment, Reverse Engineering, and Git/CI/CD Integration status; AI result caching is secondary.
_Avoid_: User Redis, cache resource, cloud cache node

**Template**:
A reusable starter Practice Architecture that a user can choose instead of starting from a blank prompt.
_Avoid_: Preset, sample, example

**TemplateDefinition**:
The internal definition of a Template's Resources, relationships, IaC identities, default parameters, and deployment conditions. It is the shared source used to produce the Architecture Board shape and deployable IaC path.
_Avoid_: UI-only template data, diagram preset

**Template Selection**:
The gg-owned decision that chooses exactly one repository-level Template from Repository Analysis, or explicitly returns that no Template was selected when the repository does not match a supported Template. The AI handoff receives the selected Template rather than a list of competing Template candidates.
_Avoid_: Template recommendation list, AI template choice

**AI Handoff**:
The handoff from gg to the AI part containing one selected Template and the Repository Analysis evidence that supports the selection, or a Template Selection Failure with no selected Template and its mismatch details. It does not include competing Template candidates, a fallback Template, or a confidence score.
_Avoid_: Template candidate list, AI-owned Template selection

**Architecture Draft**:
A proposed Practice Architecture that has not yet been accepted, corrected, or saved by the user.
_Avoid_: AI result, generated diagram, draft infrastructure

**Selected Option Trail**:
An ordered, current-conversation record of assistant-provided options that the user explicitly selected. A single-choice question contributes at most one selection. Direct Requirement Input, Voice Requirement Input, and Draft Candidate Exclusion are not part of the trail, and the trail does not express progress, completeness, or approval.
_Avoid_: Progress tracker, requirement checklist, saved preference profile

**Decorative Resource Orbit**:
A presentation-only arrangement of actual AWS Resource icons that responds deterministically to the Selected Option Trail while an Architecture Draft is being explored. Icons keep orbiting, briefly react to conversation events, and visually converge as accepted answers accumulate. This convergence is not a measured completion percentage and does not assert Resource accuracy, recommendation, candidacy, relationships, or quantities. The decoration is discarded when the final compiled result becomes available.
_Avoid_: Architecture Draft, Resource recommendation, Draft Progress View, provisional Architecture Board

**Workspace AI Convergence Transition**:
The presentation-only transition in which decorative orbit rings disappear, AWS icons gather into one point while the Architecture Draft is being compiled, and the point yields to the actual Compiled Architecture Preview only after Compiler success. Decorative icons are never reused as final Resources.
_Avoid_: Draft completion percentage, Resource morph, server progress graph

**Compiled Architecture Preview**:
A read-only view of the Architecture Board Compiler proposal produced from an Architecture Draft and represented with the Resource Catalog's actual icons. It is available only after successful compilation, shows the same Diagram proposed for saving, and cannot change a Project or Architecture Board until the user explicitly applies it. Its default user summary contains one plain-language architecture sentence, Resource and connection counts, and at most three check items; additional safety items remain accessible through `View All`, while Compiler provenance and internal processing metadata stay out of the user surface.
_Avoid_: Decorative Resource Orbit, editable Architecture Board, applied Architecture

**Draft Candidate Exclusion**:
An explicit, reversible user choice tied to an actual server-provided candidate identity and label that constrains subsequent Architecture Draft recommendations during the current conversation. It is independent of the Selected Option Trail and Decorative Resource Orbit, and it never modifies the Architecture Board or accepts the remaining candidates.
_Avoid_: Selected option, decorative Resource removal, Resource deletion, Architecture Draft acceptance

**AI Architecture Recommendation**:
The service capability that interprets a Requirement Prompt, proposes an Architecture Draft, explains the trade-offs, and lets the user accept it onto the Architecture Board.
_Avoid_: Chatbot answer, auto-generated diagram, magic design

**설계 제안**:
The independent Workspace AI conversation for Architecture Drafts and Architecture Suggestions that remain unapplied until the user accepts them.
_Avoid_: 초안 제안, general AI chat

**오류 분석**:
The independent Workspace AI conversation for interpreting a Terraform issue and presenting an explanation or safe remediation proposal without applying it.
_Avoid_: AI 오류, auto fix

**에이전트 리뷰**:
The independent Workspace AI conversation for reviewing an IaC Preview and explaining its expected changes without executing or applying it.
_Avoid_: Preview 설명, Deployment approval

**AI 채팅**:
Architecture Board 안에서 설계 제안, 오류 분석, 에이전트 리뷰를 각각의 독립된 대화로 제공하는 공통 진입점이다. 각 대화의 결과와 사용자 승인 경계는 서로 합쳐지지 않는다.
_Avoid_: AI modal, right-panel AI buttons, single AI result

**User-Accepted Change**:
A state-changing update that only happens after the user explicitly accepts an Architecture Draft, Architecture Suggestion, IaC handoff, Git change, or Deployment action. AI may propose or explain the change, but it does not silently alter the Practice Architecture or execution path.
_Avoid_: Auto apply, silent fix, AI edit

**Source Repository**:
A code repository connected to a SketchCatch project and analyzed as evidence for Template Selection. The same repository may later receive approved IaC changes through Git Integration.
_Avoid_: GitHub link, repo URL, codebase

**Repository Analysis**:
The gg-owned static analysis of one Source Repository used to identify its deployable shape and select one repository-level Template. It can contain multiple Application Units, such as frontend and backend parts, and examines the repository tree, `package.json`, lockfile, `Dockerfile`, framework configuration, and `README` without executing repository code.
_Avoid_: Repository execution, arbitrary deployment, codebase scan

**Application Unit**:
An independently identifiable application part inside a Source Repository, such as a frontend or backend directory, with its own path and runtime evidence.
_Avoid_: Repository, infrastructure Resource, arbitrary service

**Template Selection Failure**:
A valid Repository Analysis result stating that no supported Template represents the repository's Application Units, together with the mismatch reasons and missing evidence.
_Avoid_: Closest Template fallback, partial Template selection, automatic redesign

**Git Integration**:
The service capability that connects a Practice Architecture and its IaC Preview to a Source Repository so infrastructure changes can be reviewed, versioned, and handed off to the team's normal development workflow.
_Avoid_: GitHub feature, repo sync, code push

**CI/CD Integration**:
The service capability that connects approved infrastructure changes to an external delivery pipeline, including pipeline templates, execution status, and deployment handoff, without bypassing SketchCatch's approval and safety boundaries.
_Avoid_: Auto deploy, build script, deployment button

**Direct Deployment Path**:
The SketchCatch-managed execution path used for quick validation, sandbox runs, practice environments, or demos, where the service runs plan, approval, apply, logs, outputs, and cleanup directly.
_Avoid_: Main deployment, instant deploy, bypass deploy

**Git/CI/CD Deployment Path**:
The team-operated execution path where an approved IaC Preview is committed to a Source Repository, reviewed through pull requests, and deployed by an external CI/CD pipeline while SketchCatch tracks handoff and status.
_Avoid_: Alternative deploy, export only, GitHub deploy

**AWS-First MVP**:
The implementation strategy where SketchCatch proves the end-to-end service with AWS and Terraform first, while keeping Resource modeling, Reverse Engineering, and IaC handoff extensible through Provider Adapters for Azure and GCP later.
_Avoid_: AWS-only product, single-cloud scope, cloud lock-in

**Requirement Prompt**:
A natural-language description of desired infrastructure constraints, such as budget, traffic, runtime, database, availability, or security priorities.
_Avoid_: User question, chat input, AI prompt

**Requirement Input**:
The user's natural-language entry point for creating or changing a Practice Architecture, supplied as text or transcribed voice and normalized into a Requirement Prompt.
_Avoid_: Text box, voice command, chat message

**Voice Requirement Input**:
An audio Requirement Input that is transcribed through Amazon Transcribe, shown back to the user for confirmation, and only then normalized into a Requirement Prompt.
_Avoid_: Voice deploy, speech command, direct voice edit

**Infrastructure Graph**:
The normalized graph of Resources and relationships that syncs Architecture Board state and IaC Preview state without treating either surface as the only source of truth. It carries stable resource identity, IaC identity, configuration, and relationships.
_Avoid_: AI JSON, canvas state, diagram data

**Architecture Board Compiler**:
The capability that may infer, add, remove, or change Resources, relationships, configuration, containment, and visual presentation to produce a reorganized Architecture Board proposal. Its proposal may conflict with explicit requirements, accepted deployment state, or provider and IaC validity.
_Avoid_: Auto layout, coordinate cleanup, diagram beautifier

**Board Auto Arrange**:
A user-requested visual cleanup that may change only position, size, decorative Presentation Frames, and edge routing. It never adds, removes, or changes Resources, relationships, configuration, or containment. Up to three distinct semantically safe visual candidates remain available for user comparison even when measured layout findings do not improve; the original is a comparison baseline rather than a competing candidate, and quality findings rank and explain changed candidates but never gate them. Desktop uses a thumbnail gallery above a side-by-side original and selected-candidate comparison. Mobile uses a horizontal thumbnail gallery and a same-viewport Original/Arrangement toggle. Each preview explains up to three concrete changes with Resource display names and useful reasons before any aggregate count, and explicitly states that Resources, relationships, and configuration remain unchanged. Switching candidates never mutates the Board. `Keep Original` closes the preview without mutation, while `Use This Arrangement` is the single explicit approval that applies the selected preview without a second confirmation dialog.
_Avoid_: Architecture improvement, Resource optimization, automatic fix

**Presentation Frame**:
A presentation-only title and background frame that visually surrounds nearby Board elements without recording membership, parenthood, containment, relationships, or provider meaning. It uses the existing Design Group representation. Board Auto Arrange owns a frame only when its Design kind, Design Group type, catalog identity, and `board-auto-frame:` ID prefix all match; only an unlocked frame with this full identity may be automatically merged or removed on a later arrange request. User-authored Design Groups may receive position and size proposals but are never silently claimed, merged, or deleted by Board Auto Arrange. A frame stays where it was placed after ordinary Board edits until the user changes it or requests Board Auto Arrange again.
_Avoid_: Group, container, parent area, architecture layer

**Compilation Distance**:
The relative amount of semantic and visual change between an input Practice Architecture and an Architecture Board Compiler proposal. Resource deletion has greater distance than configuration, relationship, containment, size, or position changes.
_Avoid_: Edit count, visual difference

**Reverse Engineering**:
The service capability that scans existing cloud Resources through provider adapters, reconstructs them as a Practice Architecture, and prepares an IaC handoff path through IaC Preview and import suggestions.
_Avoid_: Resource list, AWS scan, diagram import

**Imported Architecture Original**:
The Reverse Engineering result that preserves the discovered Resources, relationships, and configuration exactly, while applying only a deterministic collision-free initial position because cloud providers do not store Architecture Board coordinates. It is distinct from Board Auto Arrange and any semantic Compiler proposal.
_Avoid_: Raw provider response, automatically improved architecture, Compiler result

**AWS Import Access Update**:
A user-approved permission update owned by AWS connection settings so Reverse Engineering can read supported services. It preserves the existing connection identity, Role, original Stack, deployment policy, and deployment verification. Reverse Engineering may detect missing access and route the user to this flow, but never changes AWS permissions itself. Cleanup removes only the access artifacts owned by this update; an uncertain cleanup remains inactive and retryable.
_Avoid_: New AWS connection, full deployment permission refresh, separate import Role, shared account manager Role, reconnect account

**AWS Import Access Stack Pair**:
Two connection-scoped CloudFormation stacks used only to manage Reverse Engineering access. The Manager Stack owns narrowly limited management and cleanup-verification access. The Policy Stack owns only the Reverse Engineering read policy attached to the existing connection Role. Cleanup always removes the Policy Stack before the Manager Stack. Neither stack owns the connection Role, original connection Stack, or deployment policy.
_Avoid_: Original connection Stack, deployment Stack, separate import connection

**AWS Import Readiness**:
A per-connection, per-region capability state for Reverse Engineering that is separate from deployment connection verification. Core readers cover EC2 networking and compute, S3, RDS, Load Balancer, ECS, and CloudFront; all must accept their bounded read request before the connection is ready for normal import. Resource Explorer, Tagging API, IAM, KMS, CloudWatch and Logs, API Gateway, Lambda, and AMI are expanded readers whose failure produces `ready with limited details` rather than blocking core import. An empty list is a successful read, Resource Explorer not being configured is distinct from access denial, and transient provider errors are retryable rather than permission conclusions.
_Avoid_: AWS connection status, deployment verification, Stack status

**Partial Architecture Import**:
A usable Reverse Engineering result containing every Resource successfully discovered even when one or more supported services could not be read. The Board remains visible and the UI gives a short notice plus an AWS Import Access Update action instead of blocking the result or exposing provider errors. `Use Imported Items Only` is the single explicit approval for applying this incomplete result and makes the incompleteness visible without a second confirmation dialog.
_Avoid_: Failed import, complete architecture, raw scan error

**IaC Preview**:
The generated infrastructure-as-code representation of a Practice Architecture before the user approves deployment.
_Avoid_: Code editor, Terraform code, deploy code

**Cost Risk**:
A condition that can create unexpected AWS charges, especially when selected resources, budget, traffic, or practice duration do not match.
_Avoid_: Price warning, billing issue

**Cost Analysis**:
The service capability that estimates and explains cost pressure across a Practice Architecture, IaC Preview, Deployment Plan, and Deployment History so users can understand Cost Risk before and after cloud changes.
_Avoid_: Price calculator, billing dashboard, monthly total

**Security Risk**:
A configuration that exposes a Practice Architecture beyond the user's intended access, such as open SSH, public storage, or excessive permissions.
_Avoid_: Vulnerability, danger

**Pre-Deployment Check**:
The review step that evaluates a Practice Architecture for cost, security, permissions, and missing configuration before deployment can be approved.
_Avoid_: Validation, review, inspection

**Deployment Safety Gate**:
The pre-deployment review boundary that records deterministic Check Findings and presents them before approval. In the current implementation, High severity alone does not set the Plan summary to blocked; approval-blocking enforcement by risk severity remains planned. Separate approval and apply boundaries still prevent unapproved execution.
_Avoid_: Warning popup, AI blocker, safety modal

**Check Finding**:
A single user-facing observation produced by a Pre-Deployment Check, tied to a cost, security, permission, configuration, performance, or availability concern.
_Avoid_: AI warning, issue, message

**Architecture Suggestion**:
A structured, non-applied proposal for changing a Practice Architecture in response to a Check Finding or Design Simulation result.
_Avoid_: Auto fix, patch, edit command

**Amazon Q Assistance**:
AWS-specialized AI support used to strengthen Architecture Draft recommendations, Resource explanations, Well-Architected guidance, security reasoning, IaC Preview explanation, and Terraform error interpretation without bypassing user approval or deterministic safety checks.
_Avoid_: Amazon Q deployment, auto apply, autonomous AWS operator

**Bedrock AI Layer**:
The managed AI layer used for Architecture Draft recommendations, review reasoning, guardrails, and explanation workflows while keeping structured changes behind user confirmation and deterministic safety checks.
_Avoid_: AI backend, Bedrock automation, model magic

**Design Simulation**:
An analysis that estimates request flow, bottlenecks, failure exposure, cost pressure, and capacity from the Infrastructure Graph under stated assumptions.
_Avoid_: Monitoring, load test, benchmark

**Design Version**:
A saved version of a Practice Architecture and its IaC Preview that can be compared with another version.
_Avoid_: Backup, history item, save point

**Auto Cleanup**:
The automatic or user-approved teardown of cloud resources created by a Deployment to prevent leftover cost.
_Avoid_: Auto delete, shutdown, removal

**Deployment History**:
The record of Deployment attempts, results, outputs, cleanup status, and changes for a Practice Architecture.
_Avoid_: Version history, CI/CD history, logs

**Representative Use Journey**:
A presentation or rehearsal path that proves SketchCatch's core service flow through realistic user work. It demonstrates the product; it does not define a separate demo-only scope.
_Avoid_: Demo script, feature showcase, sample flow

**Deployment**:
The approved execution that applies an IaC Preview to real cloud resources and tracks plan, approval, logs, outputs, and cleanup.
_Avoid_: lab, runtime
