# SketchCatch

SketchCatch is a safe AWS learning context for beginners who design, inspect, and optionally deploy short-lived practice architectures.

## Language

**Practice Architecture**:
An AWS learning environment described as connected resources, constraints, and learner-facing explanations. It is the thing the user designs before any deployment exists.
_Avoid_: Infrastructure, diagram, AWS setup

**Architecture Board**:
The visual workspace where a Practice Architecture is shown and edited as resource nodes and relationships.
_Avoid_: Main board, canvas, drawing board

**Resource**:
An AWS building block inside a Practice Architecture, such as VPC, Subnet, EC2, RDS, Security Group, IAM, S3, or CloudFront.
_Avoid_: Component, block, service

**Template**:
A reusable starter Practice Architecture that a learner can choose instead of starting from a blank prompt.
_Avoid_: Preset, sample, example

**Architecture Draft**:
A proposed Practice Architecture that has not yet been accepted, corrected, or saved by the learner.
_Avoid_: AI result, generated diagram, draft infrastructure

**Source Repository**:
A code repository used as evidence for proposing an Architecture Draft when the learner starts from an existing application.
_Avoid_: GitHub link, repo URL, codebase

**IaC Preview**:
The generated infrastructure-as-code representation of a Practice Architecture before the learner approves deployment.
_Avoid_: Code editor, Terraform code, deploy code

**Cost Risk**:
A condition that can create unexpected AWS charges for a learner, especially when the selected resources, budget, or practice duration do not match.
_Avoid_: Price warning, billing issue

**Security Risk**:
A configuration that exposes a Practice Architecture beyond the learner's intended access, such as open SSH, public storage, or excessive permissions.
_Avoid_: Vulnerability, danger

**Pre-Deployment Check**:
The review step that evaluates a Practice Architecture for cost, security, permissions, and missing configuration before deployment can be approved.
_Avoid_: Validation, review, inspection

**Check Finding**:
A single learner-facing observation produced by a Pre-Deployment Check, tied to a cost, security, permission, or configuration concern.
_Avoid_: AI warning, issue, message

**Practice Session**:
The time-limited period during which an approved Practice Architecture may exist as real AWS resources.
_Avoid_: Deployment, lab, runtime

**Auto Cleanup**:
The automatic teardown of AWS resources at the end of a Practice Session to prevent leftover cost.
_Avoid_: Auto delete, shutdown, removal

**Deployment History**:
The record of approved deployment attempts, results, outputs, and changes for a Practice Architecture.
_Avoid_: Version history, CI/CD history, logs
