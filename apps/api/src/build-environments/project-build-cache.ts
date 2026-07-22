export const projectBuildCacheTag = "buildcache-v1-linux-amd64";

export const projectBuildCacheRepositoryActions = [
  "ecr:BatchCheckLayerAvailability",
  "ecr:GetDownloadUrlForLayer",
  "ecr:BatchGetImage",
  "ecr:InitiateLayerUpload",
  "ecr:UploadLayerPart",
  "ecr:CompleteLayerUpload",
  "ecr:PutImage"
] as const;

export type ProjectBuildCacheIdentity = {
  repositoryName: string;
  repositoryArn: string;
  repositoryUri: string;
  cacheTag: typeof projectBuildCacheTag;
  cacheReference: string;
};

export function createProjectBuildCacheIdentity(input: {
  projectId: string;
  accountId: string;
  region: string;
}): ProjectBuildCacheIdentity {
  const projectSuffix = input.projectId.replaceAll("-", "").slice(0, 8).toLowerCase();
  const repositoryName = `sketchcatch-${projectSuffix}-build-cache`;
  const repositoryUri =
    `${input.accountId}.dkr.ecr.${input.region}.amazonaws.com/${repositoryName}`;
  return {
    repositoryName,
    repositoryArn:
      `arn:aws:ecr:${input.region}:${input.accountId}:repository/${repositoryName}`,
    repositoryUri,
    cacheTag: projectBuildCacheTag,
    cacheReference: `${repositoryUri}:${projectBuildCacheTag}`
  };
}
