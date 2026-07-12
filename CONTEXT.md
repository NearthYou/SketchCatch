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

**AI Architecture Recommendation**:
The service capability that interprets a Requirement Prompt, proposes an Architecture Draft, explains the trade-offs, and lets the user accept it onto the Architecture Board.
_Avoid_: Chatbot answer, auto-generated diagram, magic design

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

**Reverse Engineering**:
The service capability that scans existing cloud Resources through provider adapters, reconstructs them as a Practice Architecture, and prepares an IaC handoff path through IaC Preview and import suggestions.
_Avoid_: Resource list, AWS scan, diagram import

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
The approval boundary that blocks high-risk cloud changes before Deployment while allowing lower-risk Check Findings to proceed only after explicit user acknowledgement.
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
