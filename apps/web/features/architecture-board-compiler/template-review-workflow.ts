import type {
  ArchitectureBoardCompilationChangeKind,
  ArchitectureBoardCompilationProposal,
  DiagramJson
} from "@sketchcatch/types";
import { reviewArchitectureBoardTemplate } from "./template-review";

const GALLERY_SAFE_CHANGE_KINDS = new Set<ArchitectureBoardCompilationChangeKind>([
  "presentation",
  "geometry",
  "edge-routing"
]);

export type TemplateReviewSession = {
  readonly templateId: string;
  readonly sourceDiagram: DiagramJson;
  readonly sourceFingerprint: string;
  readonly proposal: ArchitectureBoardCompilationProposal;
  readonly status: "ready" | "hold";
  readonly blockingChangeKinds: readonly ArchitectureBoardCompilationChangeKind[];
};

export type ApprovedTemplateReview = {
  readonly status: "approved";
  readonly templateId: string;
  readonly sourceFingerprint: string;
  readonly compilerVersion: string;
  readonly candidateId: string;
  readonly reviewedAt: string;
  readonly changeKinds: readonly ArchitectureBoardCompilationChangeKind[];
  readonly diagram: DiagramJson;
};

export type RejectedTemplateReview = {
  readonly status: "rejected";
  readonly templateId: string;
  readonly sourceFingerprint: string;
  readonly compilerVersion: string;
  readonly candidateId: string;
  readonly reviewedAt: string;
  readonly reason: string;
};

export type TemplateReviewDecision = ApprovedTemplateReview | RejectedTemplateReview;

export type TemplateReviewVariantResolution = {
  readonly applied: boolean;
  readonly diagram: DiagramJson;
  readonly reason?: "not-approved" | "source-changed" | "template-mismatch" | "unsafe-approval";
};

/**
 * A template review session never changes the authored source. It makes the compiler proposal,
 * its input fingerprint, and the safety boundary explicit so the decision can be persisted later.
 */
export function createTemplateReviewSession(input: {
  readonly templateId: string;
  readonly sourceDiagram: DiagramJson;
  readonly proposal?: ArchitectureBoardCompilationProposal | undefined;
}): TemplateReviewSession {
  const sourceDiagram = structuredClone(input.sourceDiagram);
  const proposal = structuredClone(input.proposal ?? reviewArchitectureBoardTemplate(sourceDiagram));
  const blockingChangeKinds = getBlockingChangeKinds(proposal);

  return {
    templateId: input.templateId,
    sourceDiagram,
    sourceFingerprint: fingerprintTemplateReviewDiagram(sourceDiagram),
    proposal,
    status: blockingChangeKinds.length === 0 ? "ready" : "hold",
    blockingChangeKinds
  };
}

/**
 * Gallery overlays are intentionally limited to visual changes. A semantic Template revision
 * needs a separately reviewed definition and Terraform update, not a Board-only approval.
 */
export function approveTemplateReview(
  session: TemplateReviewSession,
  input: { readonly reviewedAt: string }
): ApprovedTemplateReview {
  if (session.status !== "ready") {
    throw new Error(
      `Template review has semantic change kinds: ${session.blockingChangeKinds.join(", ") || "unknown"}.`
    );
  }

  return {
    status: "approved",
    templateId: session.templateId,
    sourceFingerprint: session.sourceFingerprint,
    compilerVersion: session.proposal.provenance.compilerVersion,
    candidateId: session.proposal.provenance.candidateId,
    reviewedAt: input.reviewedAt,
    changeKinds: collectChangeKinds(session.proposal),
    diagram: structuredClone(session.proposal.diagram)
  };
}

export function rejectTemplateReview(
  session: TemplateReviewSession,
  input: { readonly reviewedAt: string; readonly reason: string }
): RejectedTemplateReview {
  return {
    status: "rejected",
    templateId: session.templateId,
    sourceFingerprint: session.sourceFingerprint,
    compilerVersion: session.proposal.provenance.compilerVersion,
    candidateId: session.proposal.provenance.candidateId,
    reviewedAt: input.reviewedAt,
    reason: input.reason
  };
}

/**
 * The gallery/start path re-validates the exact authored source before consuming a persisted
 * approval. Stale or semantically broad approvals degrade safely to the source fixture.
 */
export function resolveApprovedTemplateReviewVariant(
  template: { readonly id: string; readonly diagramJson: DiagramJson },
  decision: TemplateReviewDecision | undefined
): TemplateReviewVariantResolution {
  const sourceDiagram = structuredClone(template.diagramJson);
  if (!decision || decision.status !== "approved") {
    return { applied: false, diagram: sourceDiagram, reason: "not-approved" };
  }
  if (decision.templateId !== template.id) {
    return { applied: false, diagram: sourceDiagram, reason: "template-mismatch" };
  }
  if (decision.sourceFingerprint !== fingerprintTemplateReviewDiagram(sourceDiagram)) {
    return { applied: false, diagram: sourceDiagram, reason: "source-changed" };
  }
  if (decision.changeKinds.some((kind) => !GALLERY_SAFE_CHANGE_KINDS.has(kind))) {
    return { applied: false, diagram: sourceDiagram, reason: "unsafe-approval" };
  }

  return { applied: true, diagram: structuredClone(decision.diagram) };
}

export function fingerprintTemplateReviewDiagram(diagram: DiagramJson): string {
  return fnv1a(JSON.stringify(canonicalize(diagram)));
}

function getBlockingChangeKinds(
  proposal: ArchitectureBoardCompilationProposal
): ArchitectureBoardCompilationChangeKind[] {
  return collectChangeKinds(proposal).filter((kind) => !GALLERY_SAFE_CHANGE_KINDS.has(kind));
}

function collectChangeKinds(
  proposal: ArchitectureBoardCompilationProposal
): ArchitectureBoardCompilationChangeKind[] {
  return [...new Set(proposal.changes.map((change) => change.kind))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
