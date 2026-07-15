import type { TemplateReviewDecision } from "./template-review-workflow";

/**
 * Checked-in decisions are deliberately empty until a maintainer reviews a compiled variant.
 * The gallery consumes this registry through one resolver, so adding an approval never mutates
 * an authored source fixture or silently accepts a fresh Compiler result.
 */
export const approvedTemplateReviewDecisions: readonly TemplateReviewDecision[] = [];

export function findApprovedTemplateReviewDecision(
  templateId: string
): TemplateReviewDecision | undefined {
  return approvedTemplateReviewDecisions.find((decision) => decision.templateId === templateId);
}
