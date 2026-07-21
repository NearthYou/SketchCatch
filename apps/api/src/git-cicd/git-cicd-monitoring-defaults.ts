export function createDefaultGitCicdMonitoringConfig<TUpdatedAt>(input: {
  sourceRepositoryId: string;
  defaultBranch: string;
  updatedAt: TUpdatedAt;
}) {
  return {
    sourceRepositoryId: input.sourceRepositoryId,
    enabled: true,
    monitorBranch: input.defaultBranch,
    appPath: { mode: "repository_root" as const, path: "." },
    infraPath: { mode: "repository_root" as const, path: "." },
    validationStatus: "required" as const,
    validationMessage: null,
    validatedAt: null,
    updatedAt: input.updatedAt
  };
}
