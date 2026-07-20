import type {
  GitCicdAwsRoleDiff,
  GitCicdRepositorySettingsPreview
} from "@sketchcatch/types";

export type RepositorySettingsReview = {
  readonly environmentName: string;
  readonly variables: readonly {
    readonly name: string;
    readonly value: string;
  }[];
  readonly secrets: readonly string[];
  readonly workflowFiles: readonly string[];
};

export function buildRepositorySettingsReview(
  preview: GitCicdRepositorySettingsPreview
): RepositorySettingsReview {
  return {
    environmentName: preview.environmentName,
    variables: Object.entries(preview.variables)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => ({ name, value })),
    secrets: [...preview.secrets].sort((left, right) => left.localeCompare(right)),
    workflowFiles: [...preview.workflowFiles].sort((left, right) => left.localeCompare(right))
  };
}

export function getRepositorySettingsPreviewRevision(
  preview: GitCicdRepositorySettingsPreview
): string {
  return JSON.stringify(buildRepositorySettingsReview(preview));
}

export function getAwsRoleDiffPreviewRevision(diff: GitCicdAwsRoleDiff): string {
  return JSON.stringify({
    roleArn: diff.roleArn,
    repository: diff.repository,
    targetBranch: diff.targetBranch,
    environmentName: diff.environmentName,
    requiredTrustConditions: Object.entries(diff.requiredTrustConditions).sort(
      ([left], [right]) => left.localeCompare(right)
    ),
    approved: diff.approved,
    applied: diff.applied === true,
    verified: diff.verified === true
  });
}

export function canApplyReviewedChange(input: {
  readonly confirmedRevision: string | null;
  readonly previewRevision: string;
}): boolean {
  return input.confirmedRevision !== null && input.confirmedRevision === input.previewRevision;
}
