# SketchCatch

SketchCatch is an AI-assisted infrastructure design and simulation context for developers who turn requirements into cloud architecture graphs, Terraform previews, and cost/performance/security analysis.

## Language

**Practice Architecture**:
A cloud infrastructure design described as connected resources, constraints, and operator-facing explanations. It is the thing the user designs before any deployment exists.
_Avoid_: Infrastructure, diagram, AWS setup

**Architecture Board**:
The visual workspace where a Practice Architecture is shown and edited as resource nodes and relationships.
_Avoid_: Main board, canvas, drawing board

**Resource**:
An AWS building block inside a Practice Architecture, such as VPC, Subnet, EC2, RDS, Security Group, IAM, S3, or CloudFront.
_Avoid_: Component, block, service

**Template**:
A reusable starter Practice Architecture that a user can choose instead of starting from a blank prompt.
_Avoid_: Preset, sample, example

**Architecture Draft**:
A proposed Practice Architecture that has not yet been accepted, corrected, or saved by the user.
_Avoid_: AI result, generated diagram, draft infrastructure

**Source Repository**:
A code repository used as optional evidence for proposing an Architecture Draft when the user starts from an existing application.
_Avoid_: GitHub link, repo URL, codebase

**Requirement Prompt**:
A natural-language description of desired infrastructure constraints, such as budget, traffic, runtime, database, availability, or security priorities.
_Avoid_: User question, chat input, AI prompt

**Infrastructure Graph**:
The normalized graph of Resources and relationships that syncs Architecture Board state and IaC Preview state without treating either surface as the only source of truth. It carries stable resource identity, IaC identity, configuration, and relationships.
_Avoid_: AI JSON, canvas state, diagram data

**IaC Preview**:
The generated infrastructure-as-code representation of a Practice Architecture before the user approves deployment.
_Avoid_: Code editor, Terraform code, deploy code

**Cost Risk**:
A condition that can create unexpected AWS charges, especially when selected resources, budget, traffic, or practice duration do not match.
_Avoid_: Price warning, billing issue

**Security Risk**:
A configuration that exposes a Practice Architecture beyond the user's intended access, such as open SSH, public storage, or excessive permissions.
_Avoid_: Vulnerability, danger

**Pre-Deployment Check**:
The review step that evaluates a Practice Architecture for cost, security, permissions, and missing configuration before deployment can be approved.
_Avoid_: Validation, review, inspection

**Check Finding**:
A single user-facing observation produced by a Pre-Deployment Check, tied to a cost, security, permission, configuration, performance, or availability concern.
_Avoid_: AI warning, issue, message

**Architecture Suggestion**:
A structured, non-applied proposal for changing a Practice Architecture in response to a Check Finding or Design Simulation result.
_Avoid_: Auto fix, patch, edit command

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

**Deployment**:
The approved execution that applies an IaC Preview to real cloud resources and tracks plan, approval, logs, outputs, and cleanup.
_Avoid_: lab, runtime
