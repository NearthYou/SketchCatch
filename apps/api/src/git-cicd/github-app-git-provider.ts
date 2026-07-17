import { requireGitHubAppConfig } from "../config/env.js";
import {
  createTerraformArtifactCanonicalContent,
  defaultTerraformArtifactMaxBytes,
  parseTerraformArtifactBundle
} from "../deployments/terraform-workspace.js";
import { createHash } from "node:crypto";
import { posix } from "node:path";
import { createProjectAssetStorage } from "../projects/project-asset-storage-factory.js";
import type { ProjectAssetStorage } from "../projects/project-asset-storage.js";
import {
  createGitHubAppClient,
  type GitHubAppClient
} from "../source-repositories/github-app-client.js";
import type {
  GitProvider,
  GitProviderCreatePullRequestInput
} from "./git-cicd-handoff-service.js";

export type CreateGitHubAppGitProviderOptions = {
  githubAppClient?: GitHubAppClient;
  downloadTerraformArtifact?: (objectKey: string) => Promise<Buffer | Uint8Array | string>;
  projectAssetStorage?: ProjectAssetStorage;
};

export function createGitHubAppGitProvider(
  options: CreateGitHubAppGitProviderOptions = {}
): GitProvider {
  let cachedClient: GitHubAppClient | null = null;
  const projectAssetStorage = options.projectAssetStorage ?? createProjectAssetStorage();

  return {
    async createPullRequest(input) {
      cachedClient = cachedClient ?? options.githubAppClient ?? createGitHubAppClientFromEnv();
      const files = (
        await Promise.all(
          input.files.map((file) =>
            expandPullRequestFile(
              file,
              options.downloadTerraformArtifact,
              projectAssetStorage
            )
          )
        )
      ).flat();
      const result = await cachedClient.createPullRequest({
        installationId: input.repository.installationId,
        owner: input.repository.owner,
        name: input.repository.name,
        targetBranch: input.targetBranch,
        sourceBranch: input.sourceBranch,
        commitMessage: input.commitMessage,
        pullRequestTitle: input.pullRequest.title,
        pullRequestBody: input.pullRequest.body,
        files
      });

      return {
        pullRequestUrl: result.pullRequestUrl,
        sourceBranch: input.sourceBranch,
        commitSha: result.commitSha,
        pullRequestHeadSha: result.pullRequestHeadSha,
        pullRequestNumber: result.pullRequestNumber
      };
    }
  };
}

// Terraform bundle은 PR 안에서 사용자가 편집한 원래 파일들로 다시 펼칩니다.
async function expandPullRequestFile(
  file: GitProviderCreatePullRequestInput["files"][number],
  downloadTerraformArtifact:
    | ((objectKey: string) => Promise<Buffer | Uint8Array | string>)
    | undefined,
  projectAssetStorage: ProjectAssetStorage
): Promise<Array<{ path: string; content: string }>> {
  const content = await downloadTerraformArtifactText(
    file,
    downloadTerraformArtifact,
    projectAssetStorage
  );
  assertApprovedTerraformArtifact(file, content);
  if (file.contentType !== "application/vnd.sketchcatch.terraform-files+json") {
    return [{ path: file.path, content }];
  }

  const directory = posix.dirname(file.path);
  return parseTerraformArtifactBundle(content).files.map((bundleFile) => ({
    path: posix.join(directory, bundleFile.fileName),
    content: bundleFile.terraformCode
  }));
}

// Project asset 저장소에서 다시 읽은 Terraform이 승인한 Plan의 파일과 같은지 확인합니다.
function assertApprovedTerraformArtifact(
  file: GitProviderCreatePullRequestInput["files"][number],
  content: string
): void {
  if (file.expectedSha256 === undefined) {
    return;
  }

  const canonicalContent = createTerraformArtifactCanonicalContent(
    {
      objectKey: file.artifactObjectKey ?? file.path,
      fileName: posix.basename(file.path),
      contentType: file.contentType
    },
    content
  );
  const currentSha256 = createHash("sha256").update(canonicalContent).digest("hex");

  if (currentSha256 !== file.expectedSha256) {
    throw new GitProviderArtifactChangedError();
  }
}

class GitProviderArtifactChangedError extends Error {
  readonly statusCode = 409;

  constructor() {
    super("Terraform artifact changed after approval");
    this.name = "GitProviderArtifactChangedError";
  }
}

function createGitHubAppClientFromEnv(): GitHubAppClient {
  const config = requireGitHubAppConfig();

  return createGitHubAppClient({
    appId: config.appId,
    privateKey: config.privateKey
  });
}

async function downloadTerraformArtifactText(
  file: GitProviderCreatePullRequestInput["files"][number],
  downloadTerraformArtifact:
    | ((objectKey: string) => Promise<Buffer | Uint8Array | string>)
    | undefined,
  projectAssetStorage: ProjectAssetStorage
): Promise<string> {
  if (file.content !== undefined) {
    return file.content;
  }

  if (!file.artifactObjectKey) {
    throw new Error(`Git/CI/CD handoff file ${file.path} has no content source`);
  }

  const content =
    downloadTerraformArtifact !== undefined
      ? await downloadTerraformArtifact(file.artifactObjectKey)
      : await projectAssetStorage.getObject({ objectKey: file.artifactObjectKey });

  const buffer = typeof content === "string" ? Buffer.from(content) : Buffer.from(content);
  if (buffer.byteLength > defaultTerraformArtifactMaxBytes) {
    throw new Error(
      `Terraform artifact exceeds the ${defaultTerraformArtifactMaxBytes} byte size limit`
    );
  }

  return buffer.toString("utf8");
}
