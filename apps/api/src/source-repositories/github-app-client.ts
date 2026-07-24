import { createHash, createPrivateKey } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import type {
  GitCicdHandoffStatus,
  GitCicdPipelineDetailStatus,
  GitHubRepositoryCandidate
} from "@sketchcatch/types";
import {
  isIgnoredRepositoryEvidencePath,
  isRepositoryEvidenceContentPath
} from "./repository-evidence-path.js";
import { maskDeploymentMessage } from "../deployments/log-masking.js";

const githubApiBaseUrl = "https://api.github.com";
const githubJwtTtlSeconds = 9 * 60;
const githubRequestTimeoutMs = 15_000;
const maxRepositoryTreeEntries = 20_000;
const maxRepositoryEvidenceFiles = 64;
const maxRepositoryEvidenceFileBytes = 256 * 1024;
const maxRepositoryEvidenceTotalBytes = 2 * 1024 * 1024;
const githubActionsRunPageSize = 100;
export const maxGitHubActionsRunPages = 2;

export type GitHubAppClientOptions = {
  appId: string;
  privateKey: string;
  fetch?: typeof fetch;
  now?: () => Date;
};

export type GitHubAppPullRequestFile = {
  path: string;
  content: string;
};

export type GitHubAppCreatePullRequestInput = {
  installationId: string;
  owner: string;
  name: string;
  targetBranch: string;
  sourceBranch: string;
  commitMessage: string;
  pullRequestTitle: string;
  pullRequestBody: string;
  expectedPullRequestHeadSha?: string | null | undefined;
  files: GitHubAppPullRequestFile[];
};

export type GitHubAppCreatePullRequestResult = {
  pullRequestUrl: string;
  pullRequestNumber: number;
  pullRequestHeadSha: string;
  commitSha: string;
  sourceBranch?: string;
};

export type GitHubRepositorySettingsInput = {
  installationId: string;
  owner: string;
  name: string;
  environmentName: string;
  targetBranch: string;
  variables: Record<string, string>;
};

export type GitHubRepositorySettingsResult = {
  environmentName: string;
  variables: string[];
  verified: boolean;
};

export type GitHubRepositoryRefInput = {
  installationId: string;
  owner: string;
  name: string;
  branch: string;
};

export type GitHubRepositoryInput = Omit<GitHubRepositoryRefInput, "branch">;

export type GitHubWorkflowRunReadInput = GitHubRepositoryRefInput & {
  commitSha?: string;
};

export type GitHubWorkflowRunSummary = {
  id: number;
  runAttempt: number;
  event: string;
  updatedAt: string | null;
  createdAt: string | null;
  commitSha: string;
  commitMessage: string;
  branch: string;
  workflowName: string;
  workflowPath: string;
  runUrl: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type GitHubWorkflowJobSummary = {
  id: number;
  name: string;
  runUrl: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  steps: GitHubWorkflowStepSummary[];
};

export type GitHubWorkflowStepSummary = {
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type GitHubActionsPipelineStatus = {
  status: GitCicdHandoffStatus;
  pipelineRunUrl: string | null;
  mergeCommitSha?: string | null | undefined;
  infraPipelineRunUrl?: string | null | undefined;
  infraPipelineStatus?: GitCicdPipelineDetailStatus | undefined;
  appPipelineRunUrl?: string | null | undefined;
  appPipelineStatus?: GitCicdPipelineDetailStatus | undefined;
  destroyPipelineRunUrl?: string | null | undefined;
  destroyPipelineStatus?: GitCicdPipelineDetailStatus | undefined;
  statusMessage: string;
};

export type GitHubAppInstallation = {
  installationId: string;
  accountId: string;
  accountLogin: string;
  accountType: string | null;
  repositorySelection: "all" | "selected" | null;
  htmlUrl: string | null;
};

export type GitHubReadRepositoryEvidenceInput = {
  readonly installationId: string;
  readonly expectedRepositoryId: string;
  readonly owner: string;
  readonly name: string;
};

export type GitHubRepositoryEvidenceFile = {
  readonly path: string;
  readonly content: string;
};

export type GitHubRepositoryEvidenceSnapshot = {
  readonly revision: string;
  readonly treePaths: readonly string[];
  readonly files: readonly GitHubRepositoryEvidenceFile[];
};

export type GitHubRepositoryEvidenceReader = {
  readRepositoryEvidence(
    input: GitHubReadRepositoryEvidenceInput
  ): Promise<GitHubRepositoryEvidenceSnapshot>;
};

export class GitHubApiRequestError extends Error {
  readonly name = "GitHubApiRequestError";

  // GitHub 오류 상태를 route 계층이 기존 방식으로 매핑할 수 있게 보존한다.
  constructor(
    readonly statusCode: number,
    readonly responseBody: string
  ) {
    super(`GitHub API request failed: ${statusCode}`);
  }
}

export class GitHubRepositorySettingsVerificationError extends Error {
  readonly name = "GitHubRepositorySettingsVerificationError";

  constructor(readonly settingName: string) {
    super(`GitHub repository setting did not match after apply: ${settingName}`);
  }
}

export class GitHubRepositoryTreeTruncatedError extends Error {
  readonly name = "GitHubRepositoryTreeTruncatedError";

  // 일부 tree만으로 잘못된 Template을 고르지 않도록 분석을 중단한다.
  constructor() {
    super("GIT_APP_REPOSITORY_TREE_TRUNCATED");
  }
}

export class GitHubRepositoryFileEncodingError extends Error {
  readonly name = "GitHubRepositoryFileEncodingError";

  // 해석할 수 없는 파일을 근거로 쓰지 않도록 문제 경로를 함께 남긴다.
  constructor(readonly path: string) {
    super("GIT_APP_REPOSITORY_FILE_ENCODING_UNSUPPORTED");
  }
}

export class GitHubRepositoryArchivedError extends Error {
  readonly name = "GitHubRepositoryArchivedError";

  // 연결 뒤 archived로 바뀐 Repository를 현재 분석에서 차단한다.
  constructor() {
    super("GIT_APP_REPOSITORY_ARCHIVED");
  }
}

export class GitHubRepositoryIdentityMismatchError extends Error {
  readonly name = "GitHubRepositoryIdentityMismatchError";

  // 같은 owner/name 경로가 다른 Repository로 재사용된 경우 연결된 대상을 보호한다.
  constructor() {
    super("GIT_APP_REPOSITORY_IDENTITY_MISMATCH");
  }
}

export class GitHubRepositoryEvidenceLimitError extends Error {
  readonly name = "GitHubRepositoryEvidenceLimitError";

  // 분석 상한 초과 원인을 보존해 호출 수와 메모리 고갈을 구분한다.
  constructor(
    readonly reason: "tree_entries" | "file_count" | "file_size" | "total_size",
    readonly limit: number,
    readonly actual: number,
    readonly path: string | null = null
  ) {
    super("GIT_APP_REPOSITORY_EVIDENCE_LIMIT_EXCEEDED");
  }
}

export type GitHubAppClient = {
  listInstallations(): Promise<GitHubAppInstallation[]>;
  listInstallationRepositories(installationId: string): Promise<GitHubRepositoryCandidate[]>;
  createPullRequest(
    input: GitHubAppCreatePullRequestInput
  ): Promise<GitHubAppCreatePullRequestResult>;
  applyRepositorySettings(
    input: GitHubRepositorySettingsInput
  ): Promise<GitHubRepositorySettingsResult>;
  validateRepositoryBranch(input: GitHubRepositoryRefInput): Promise<boolean>;
  validateRepositoryDirectory(
    input: GitHubRepositoryRefInput & { path: string }
  ): Promise<"directory" | "file" | "missing">;
  getLatestWorkflowRunForHeadSha(input: {
    installationId: string;
    owner: string;
    name: string;
    headSha: string;
  }): Promise<GitHubActionsPipelineStatus>;
  getPipelineStatusForPullRequest(input: {
    installationId: string;
    owner: string;
    name: string;
    pullRequestNumber: number;
  }): Promise<GitHubActionsPipelineStatus>;
};

type GitHubInstallationTokenResponse = {
  readonly token?: unknown;
};

type GitHubRepositoryApiResponse = {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly full_name?: unknown;
  readonly html_url?: unknown;
  readonly default_branch?: unknown;
  readonly private?: unknown;
  readonly visibility?: unknown;
  readonly archived?: unknown;
  readonly owner?: {
    readonly login?: unknown;
  };
};

type GitHubRepositoryListResponse = {
  readonly repositories?: GitHubRepositoryApiResponse[];
};

type GitHubInstallationApiResponse = {
  readonly id?: unknown;
  readonly repository_selection?: unknown;
  readonly html_url?: unknown;
  readonly account?: {
    readonly id?: unknown;
    readonly login?: unknown;
    readonly type?: unknown;
  };
};

type GitHubRefResponse = {
  readonly object?: {
    readonly sha?: unknown;
  };
};

type GitHubTreeResponse = {
  readonly sha?: unknown;
};

type GitHubRecursiveTreeResponse = {
  readonly sha?: unknown;
  readonly truncated?: unknown;
  readonly tree?: Array<{
    readonly path?: unknown;
    readonly type?: unknown;
  }>;
};

type GitHubCommitResponse = {
  readonly sha?: unknown;
};

type GitHubContentsResponse = {
  readonly sha?: unknown;
  readonly content?: unknown;
  readonly encoding?: unknown;
};

type GitHubPutContentsResponse = {
  readonly commit?: {
    readonly sha?: unknown;
  };
  readonly content?: {
    readonly sha?: unknown;
  };
};

type GitHubRepositoryVariableResponse = {
  readonly name?: unknown;
  readonly value?: unknown;
};

type GitHubEnvironmentResponse = {
  readonly name?: unknown;
  readonly deployment_branch_policy?: {
    readonly protected_branches?: unknown;
    readonly custom_branch_policies?: unknown;
  } | null;
};

type GitHubDeploymentBranchPolicy = {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly type?: unknown;
};

type GitHubDeploymentBranchPoliciesResponse = {
  readonly branch_policies?: GitHubDeploymentBranchPolicy[];
};

type GitHubPullRequestResponse = {
  readonly html_url?: unknown;
  readonly number?: unknown;
  readonly head?: {
    readonly sha?: unknown;
    readonly ref?: unknown;
    readonly repo?: {
      readonly full_name?: unknown;
    };
  };
  readonly base?: {
    readonly ref?: unknown;
  };
  readonly merged?: unknown;
  readonly merged_at?: unknown;
  readonly state?: unknown;
  readonly merge_commit_sha?: unknown;
};

type GitHubWorkflowRunsResponse = {
  readonly workflow_runs?: GitHubWorkflowRunApiResponse[];
};

type GitHubWorkflowRunApiResponse = {
  readonly id?: unknown;
  readonly run_attempt?: unknown;
  readonly event?: unknown;
  readonly head_sha?: unknown;
  readonly head_branch?: unknown;
  readonly html_url?: unknown;
  readonly name?: unknown;
  readonly path?: unknown;
  readonly status?: unknown;
  readonly conclusion?: unknown;
  readonly created_at?: unknown;
  readonly run_started_at?: unknown;
  readonly updated_at?: unknown;
  readonly head_commit?: { readonly message?: unknown };
};

export type GitHubActionsReadClient = {
  listBranchWorkflowRuns(input: GitHubWorkflowRunReadInput): Promise<GitHubWorkflowRunSummary[]>;
  getWorkflowRun(
    input: GitHubRepositoryInput & { runId: number }
  ): Promise<GitHubWorkflowRunSummary>;
  listCommitFiles(input: GitHubRepositoryRefInput & { commitSha: string }): Promise<string[]>;
  listWorkflowJobs(
    input: GitHubRepositoryInput & { runId: number }
  ): Promise<GitHubWorkflowJobSummary[]>;
  readWorkflowJobLog(input: GitHubRepositoryInput & { jobId: number }): Promise<string>;
};

type GitHubCommitFilesResponse = { readonly files?: Array<{ readonly filename?: unknown }> };
type GitHubWorkflowJobsResponse = { readonly jobs?: GitHubWorkflowJobApiResponse[] };
type GitHubWorkflowJobApiResponse = {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly html_url?: unknown;
  readonly status?: unknown;
  readonly conclusion?: unknown;
  readonly started_at?: unknown;
  readonly completed_at?: unknown;
  readonly steps?: GitHubWorkflowStepApiResponse[];
};
type GitHubWorkflowStepApiResponse = {
  readonly name?: unknown;
  readonly status?: unknown;
  readonly conclusion?: unknown;
  readonly started_at?: unknown;
  readonly completed_at?: unknown;
};

// GitHub App 인증을 재사용해 repository 연결과 정적 evidence 조회 기능을 제공한다.
export function createGitHubAppClient(
  options: GitHubAppClientOptions
): GitHubAppClient & GitHubRepositoryEvidenceReader & GitHubActionsReadClient {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  const keyPromise = importPKCS8(toPkcs8PrivateKey(options.privateKey), "RS256");

  async function createAppJwt(): Promise<string> {
    const key = await keyPromise;
    const issuedAt = Math.floor(now().getTime() / 1000) - 60;

    return new SignJWT({})
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + githubJwtTtlSeconds)
      .setIssuer(options.appId)
      .sign(key);
  }

  async function createInstallationToken(installationId: string): Promise<string> {
    const response = await requestGitHub<GitHubInstallationTokenResponse>(
      fetchImpl,
      `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
      {
        method: "POST",
        token: await createAppJwt(),
        authScheme: "Bearer"
      }
    );

    if (typeof response.token !== "string") {
      throw new Error("GitHub installation token response did not include token");
    }

    return response.token;
  }

  async function requestWithInstallationToken<T>(
    installationId: string,
    path: string,
    init: Omit<GitHubRequestInit, "token" | "authScheme"> = {}
  ): Promise<T> {
    return requestGitHub<T>(fetchImpl, path, {
      ...init,
      token: await createInstallationToken(installationId),
      authScheme: "token"
    });
  }

  return {
    async listBranchWorkflowRuns(input) {
      const runs: GitHubWorkflowRunSummary[] = [];
      for (let page = 1; page <= maxGitHubActionsRunPages; page += 1) {
        const params = new URLSearchParams({
          branch: input.branch,
          per_page: String(githubActionsRunPageSize),
          page: String(page)
        });
        if (input.commitSha) params.set("head_sha", input.commitSha);
        const response = await requestWithInstallationToken<GitHubWorkflowRunsResponse>(
          input.installationId,
          createRepositoryPath(input, `/actions/runs?${params.toString()}`)
        );
        const pageRuns = response.workflow_runs ?? [];
        runs.push(...pageRuns.map(toWorkflowRunSummary));
        if (pageRuns.length < githubActionsRunPageSize) break;
      }
      return runs;
    },

    async getWorkflowRun(input) {
      const response = await requestWithInstallationToken<GitHubWorkflowRunApiResponse>(
        input.installationId,
        createRepositoryPath(input, `/actions/runs/${input.runId}`)
      );
      return toWorkflowRunSummary(response);
    },

    async listCommitFiles(input) {
      const files: string[] = [];
      for (let page = 1; ; page += 1) {
        const response = await requestWithInstallationToken<GitHubCommitFilesResponse>(
          input.installationId,
          createRepositoryPath(
            input,
            `/commits/${encodeURIComponent(input.commitSha)}?per_page=100&page=${page}`
          )
        );
        const pageFiles = response.files ?? [];
        files.push(
          ...pageFiles.flatMap((file) =>
            typeof file.filename === "string" && file.filename ? [file.filename] : []
          )
        );
        if (pageFiles.length < 100) break;
      }
      return files;
    },

    async listWorkflowJobs(input) {
      const jobs: GitHubWorkflowJobSummary[] = [];
      for (let page = 1; ; page += 1) {
        const response = await requestWithInstallationToken<GitHubWorkflowJobsResponse>(
          input.installationId,
          createRepositoryPath(input, `/actions/runs/${input.runId}/jobs?per_page=100&page=${page}`)
        );
        const pageJobs = response.jobs ?? [];
        jobs.push(...pageJobs.map(toWorkflowJobSummary));
        if (pageJobs.length < 100) break;
      }
      return jobs;
    },

    async readWorkflowJobLog(input) {
      const text = await requestGitHubText(
        fetchImpl,
        createRepositoryPath(input, `/actions/jobs/${input.jobId}/logs`),
        await createInstallationToken(input.installationId)
      );
      return maskDeploymentMessage(text);
    },

    async validateRepositoryBranch(input) {
      try {
        await requestWithInstallationToken<Record<string, unknown>>(
          input.installationId,
          createRepositoryPath(input, `/git/ref/heads/${encodeURIComponent(input.branch)}`)
        );
        return true;
      } catch (error) {
        if (isHttpStatus(error, 404)) {
          return false;
        }
        throw error;
      }
    },

    async validateRepositoryDirectory(input) {
      const suffix = input.path === "." ? "/contents" : `/contents/${encodePath(input.path)}`;
      try {
        const contents = await requestWithInstallationToken<unknown>(
          input.installationId,
          `${createRepositoryPath(input, suffix)}?ref=${encodeURIComponent(input.branch)}`
        );
        return Array.isArray(contents) ? "directory" : "file";
      } catch (error) {
        if (isHttpStatus(error, 404)) {
          return "missing";
        }
        throw error;
      }
    },

    async listInstallations() {
      const installations: GitHubAppInstallation[] = [];

      for (let page = 1; page <= 10; page += 1) {
        const pageInstallations = await requestGitHub<GitHubInstallationApiResponse[]>(
          fetchImpl,
          `/app/installations?per_page=100&page=${page}`,
          {
            token: await createAppJwt(),
            authScheme: "Bearer"
          }
        );

        installations.push(...pageInstallations.map(toGitHubAppInstallation));

        if (pageInstallations.length < 100) {
          break;
        }
      }

      return installations.sort((left, right) =>
        left.accountLogin.localeCompare(right.accountLogin)
      );
    },

    async listInstallationRepositories(installationId) {
      const repositories: GitHubRepositoryCandidate[] = [];

      for (let page = 1; page <= 10; page += 1) {
        const response = await requestWithInstallationToken<GitHubRepositoryListResponse>(
          installationId,
          `/installation/repositories?per_page=100&page=${page}`
        );
        const pageRepositories = response.repositories ?? [];

        repositories.push(...pageRepositories.map(toGitHubRepositoryCandidate));

        if (pageRepositories.length < 100) {
          break;
        }
      }

      return repositories.sort((left, right) => left.fullName.localeCompare(right.fullName));
    },

    // branch를 commit SHA로 고정한 뒤 tree와 허용된 텍스트 설정 파일만 읽는다.
    async readRepositoryEvidence(input) {
      const installationToken = await createInstallationToken(input.installationId);

      // 한 분석 안에서는 installation token을 재사용해 GitHub rate budget을 보호한다.
      const requestWithEvidenceToken = <T>(
        _installationId: string,
        path: string,
        init: Omit<GitHubRequestInit, "token" | "authScheme"> = {}
      ): Promise<T> =>
        requestGitHub<T>(fetchImpl, path, {
          ...init,
          token: installationToken,
          authScheme: "token"
        });
      const repository = await requestWithEvidenceToken<GitHubRepositoryApiResponse>(
        input.installationId,
        createRepositoryPath(input, "")
      );
      const repositoryId = String(readRequiredNumber(repository.id, "repository id"));

      if (repositoryId !== input.expectedRepositoryId) {
        throw new GitHubRepositoryIdentityMismatchError();
      }

      if (repository.archived === true) {
        throw new GitHubRepositoryArchivedError();
      }

      const defaultBranch = readRequiredString(
        repository.default_branch,
        "repository default branch"
      );
      const commit = await requestWithEvidenceToken<GitHubCommitResponse>(
        input.installationId,
        createRepositoryPath(input, `/commits/${encodeURIComponent(defaultBranch)}`)
      );
      const revision = readRequiredString(commit.sha, "repository commit sha");
      const tree = await requestWithEvidenceToken<GitHubRecursiveTreeResponse>(
        input.installationId,
        createRepositoryPath(input, `/git/trees/${encodeURIComponent(revision)}?recursive=1`)
      );

      if (tree.truncated === true) {
        throw new GitHubRepositoryTreeTruncatedError();
      }

      const treePaths = readRepositoryTreePaths(tree);

      if (treePaths.length > maxRepositoryTreeEntries) {
        throw new GitHubRepositoryEvidenceLimitError(
          "tree_entries",
          maxRepositoryTreeEntries,
          treePaths.length
        );
      }

      const evidencePaths = treePaths.filter(
        (path) => !isIgnoredRepositoryEvidencePath(path) && isRepositoryEvidenceContentPath(path)
      );

      if (evidencePaths.length > maxRepositoryEvidenceFiles) {
        throw new GitHubRepositoryEvidenceLimitError(
          "file_count",
          maxRepositoryEvidenceFiles,
          evidencePaths.length
        );
      }

      const files: GitHubRepositoryEvidenceFile[] = [];
      let totalBytes = 0;

      for (const path of evidencePaths) {
        const contents = await getRepositoryContent(
          input,
          path,
          revision,
          requestWithEvidenceToken
        );

        if (contents) {
          const decoded = decodeRepositoryEvidenceFile(path, contents);

          totalBytes += decoded.byteLength;

          if (totalBytes > maxRepositoryEvidenceTotalBytes) {
            throw new GitHubRepositoryEvidenceLimitError(
              "total_size",
              maxRepositoryEvidenceTotalBytes,
              totalBytes,
              path
            );
          }

          files.push({
            path,
            content: decoded.content
          });
        }
      }

      return {
        revision,
        treePaths,
        files
      };
    },

    async createPullRequest(input) {
      const targetSha = await getOrCreateTargetBranchSha(input, requestWithInstallationToken);
      const relatedPullRequests = await listRelatedPullRequests(
        input,
        requestWithInstallationToken
      );
      const openPullRequest = relatedPullRequests.find(
        (pullRequest) => pullRequest.state === "open"
      );
      let hasUnsafeOpenPullRequest = false;

      if (openPullRequest) {
        const openSourceBranch = readPullRequestSourceBranch(openPullRequest);
        const openBranchSha = openSourceBranch
          ? await getRepositoryBranchSha(input, openSourceBranch, requestWithInstallationToken)
          : null;

        if (
          openSourceBranch &&
          openBranchSha &&
          await pullRequestFilesMatchRef(
            input,
            openSourceBranch,
            requestWithInstallationToken
          )
        ) {
          return createPullRequestResult(
            openPullRequest,
            openSourceBranch,
            openBranchSha
          );
        }

        const ownsOpenPullRequest =
          openSourceBranch !== null &&
          openBranchSha !== null &&
          input.expectedPullRequestHeadSha === openBranchSha &&
          await handoffManifestMatchesRef(
            input,
            openSourceBranch,
            requestWithInstallationToken
          );

        if (openSourceBranch && openBranchSha && ownsOpenPullRequest) {
          const update = await updatePullRequestFiles(
            input,
            openSourceBranch,
            openBranchSha,
            requestWithInstallationToken
          );
          const pullRequestNumber = readRequiredNumber(
            openPullRequest.number,
            "pull request number"
          );
          const refreshedPullRequest = await requestWithInstallationToken<GitHubPullRequestResponse>(
            input.installationId,
            createRepositoryPath(input, `/pulls/${pullRequestNumber}`),
            {
              method: "PATCH",
              body: {
                title: input.pullRequestTitle,
                body: input.pullRequestBody,
                base: input.targetBranch
              }
            }
          );

          return createPullRequestResult(
            refreshedPullRequest,
            openSourceBranch,
            update.lastCommitSha
          );
        }

        hasUnsafeOpenPullRequest = true;
      }

      const mergedPullRequest = hasUnsafeOpenPullRequest
        ? undefined
        : relatedPullRequests.find(isMergedPullRequest);

      if (
        mergedPullRequest &&
        await pullRequestFilesMatchRef(
          input,
          input.targetBranch,
          requestWithInstallationToken
        )
      ) {
        return createPullRequestResult(
          mergedPullRequest,
          readPullRequestSourceBranch(mergedPullRequest) ?? input.sourceBranch,
          targetSha,
          readRequiredString(mergedPullRequest.head?.sha, "pull request head sha")
        );
      }

      const sourceBranch = await createSafePullRequestSourceBranch(
        input,
        targetSha,
        relatedPullRequests,
        requestWithInstallationToken
      );
      const update = await updatePullRequestFiles(
        input,
        sourceBranch,
        targetSha,
        requestWithInstallationToken
      );

      if (update.changedFileCount === 0) {
        throw createNoPullRequestFileChangesError();
      }

      const pullRequest = await requestWithInstallationToken<GitHubPullRequestResponse>(
        input.installationId,
        createRepositoryPath(input, "/pulls"),
        {
          method: "POST",
          body: {
            title: input.pullRequestTitle,
            body: input.pullRequestBody,
            head: sourceBranch,
            base: input.targetBranch
          }
        }
      );

      return createPullRequestResult(pullRequest, sourceBranch, update.lastCommitSha);
    },

    async applyRepositorySettings(input) {
      const environmentPath = createRepositoryPath(
        input,
        `/environments/${encodeURIComponent(input.environmentName)}`
      );
      const currentEnvironment = await getRepositoryEnvironment(
        input,
        requestWithInstallationToken
      );

      if (!isExactRepositoryEnvironment(currentEnvironment, input.environmentName)) {
        await requestWithInstallationToken<GitHubEnvironmentResponse>(
          input.installationId,
          environmentPath,
          {
            method: "PUT",
            body: {
              deployment_branch_policy: {
                protected_branches: false,
                custom_branch_policies: true
              }
            }
          }
        );
      }

      const currentPolicies = await listDeploymentBranchPolicies(
        input,
        requestWithInstallationToken
      );

      if (!hasExactTargetBranchPolicy(currentPolicies, input.targetBranch)) {
        for (const policy of currentPolicies) {
          const policyId = readRequiredNumber(policy.id, "deployment branch policy id");
          await requestWithInstallationToken<Record<string, never>>(
            input.installationId,
            `${createDeploymentBranchPoliciesPath(input)}/${policyId}`,
            { method: "DELETE" }
          );
        }

        await requestWithInstallationToken<GitHubDeploymentBranchPolicy>(
          input.installationId,
          createDeploymentBranchPoliciesPath(input),
          {
            method: "POST",
            body: { name: input.targetBranch, type: "branch" }
          }
        );
      }

      const variableNames = Object.keys(input.variables).sort();

      for (const variableName of variableNames) {
        if (isBlankRepositoryVariable(input.variables[variableName])) {
          await deleteRepositoryVariableIfPresent(
            input,
            variableName,
            requestWithInstallationToken
          );
        } else {
          await upsertRepositoryVariable(input, variableName, requestWithInstallationToken);
        }
      }

      const environment = await getRepositoryEnvironment(
        input,
        requestWithInstallationToken
      );
      const policies = await listDeploymentBranchPolicies(
        input,
        requestWithInstallationToken
      );

      if (
        !isExactRepositoryEnvironment(environment, input.environmentName) ||
        !hasExactTargetBranchPolicy(policies, input.targetBranch)
      ) {
        throw new GitHubRepositorySettingsVerificationError(input.environmentName);
      }

      for (const variableName of variableNames) {
        const expectedValue = input.variables[variableName];
        const variable = await getRepositoryVariable(
          input,
          variableName,
          requestWithInstallationToken
        );

        if (isBlankRepositoryVariable(expectedValue)) {
          if (variable !== null) {
            throw new GitHubRepositorySettingsVerificationError(variableName);
          }
          continue;
        }

        if (variable?.name !== variableName || variable.value !== expectedValue) {
          throw new GitHubRepositorySettingsVerificationError(variableName);
        }
      }

      return {
        environmentName: input.environmentName,
        variables: variableNames,
        verified: true
      };
    },

    async getLatestWorkflowRunForHeadSha(input) {
      const response = await requestWithInstallationToken<GitHubWorkflowRunsResponse>(
        input.installationId,
        createRepositoryPath(
          input,
          `/actions/runs?per_page=10&head_sha=${encodeURIComponent(input.headSha)}`
        )
      );
      const [latestRun] = [...(response.workflow_runs ?? [])].sort(compareWorkflowRunsDesc);

      if (!latestRun) {
        return {
          status: "pr_created",
          pipelineRunUrl: null,
          statusMessage: "GitHub Actions workflow run has not started for this PR head SHA yet."
        };
      }

      return mapWorkflowRunStatus(latestRun);
    },

    async getPipelineStatusForPullRequest(input) {
      const pullRequest = await requestWithInstallationToken<GitHubPullRequestResponse>(
        input.installationId,
        createRepositoryPath(input, `/pulls/${input.pullRequestNumber}`)
      );
      const state = typeof pullRequest.state === "string" ? pullRequest.state : "";

      if (pullRequest.merged !== true) {
        if (state === "closed") {
          return {
            status: "cancelled",
            pipelineRunUrl: null,
            mergeCommitSha: null,
            infraPipelineStatus: "cancelled",
            appPipelineStatus: "cancelled",
            destroyPipelineStatus: "not_started",
            statusMessage: "GitHub PR was closed without merge."
          };
        }

        return {
          status: "pr_created",
          pipelineRunUrl: null,
          mergeCommitSha: null,
          infraPipelineStatus: "waiting_for_merge",
          appPipelineStatus: "not_started",
          destroyPipelineStatus: "not_started",
          statusMessage: "GitHub PR is open and waiting for merge."
        };
      }

      const mergeCommitSha = readRequiredString(
        pullRequest.merge_commit_sha,
        "pull request merge commit sha"
      );
      const response = await requestWithInstallationToken<GitHubWorkflowRunsResponse>(
        input.installationId,
        createRepositoryPath(
          input,
          `/actions/runs?per_page=30&head_sha=${encodeURIComponent(mergeCommitSha)}`
        )
      );
      const runs = response.workflow_runs ?? [];
      const infraRun = findLatestWorkflowRunByName(runs, "SketchCatch Infra");
      const appRun = findLatestWorkflowRunByName(runs, "SketchCatch App");
      const destroyRun = findLatestWorkflowRunByName(runs, "SketchCatch Destroy");
      const infra = mapWorkflowRunDetailStatus(infraRun, "waiting_for_approval");
      const app = mapWorkflowRunDetailStatus(
        appRun,
        infra.status === "success" ? "running" : "not_started"
      );
      const destroy = mapWorkflowRunDetailStatus(destroyRun, "not_started");
      const pipelineRunUrl = app.url ?? infra.url ?? destroy.url ?? null;
      const status = aggregatePipelineStatus(infra.status, app.status);

      return {
        status,
        pipelineRunUrl,
        mergeCommitSha,
        infraPipelineRunUrl: infra.url,
        infraPipelineStatus: infra.status,
        appPipelineRunUrl: app.url,
        appPipelineStatus: app.status,
        destroyPipelineRunUrl: destroy.url,
        destroyPipelineStatus: destroy.status,
        statusMessage: createPipelineStatusMessage(status, infra.status, app.status)
      };
    }
  };
}

function toWorkflowRunSummary(run: GitHubWorkflowRunApiResponse): GitHubWorkflowRunSummary {
  const status = readRequiredString(run.status, "workflow run status");
  return {
    id: readRequiredNumber(run.id, "workflow run id"),
    runAttempt: readOptionalNumber(run.run_attempt) ?? 1,
    event: readRequiredString(run.event, "workflow run event"),
    updatedAt: readDateString(run.updated_at),
    createdAt: readDateString(run.created_at),
    commitSha: readRequiredString(run.head_sha, "workflow run commit sha"),
    commitMessage: readRequiredString(run.head_commit?.message, "workflow run commit message"),
    branch: readRequiredString(run.head_branch, "workflow run branch"),
    workflowName: readRequiredString(run.name, "workflow run name"),
    workflowPath: readRequiredString(run.path, "workflow run path"),
    runUrl: readRequiredString(run.html_url, "workflow run url"),
    status,
    conclusion: typeof run.conclusion === "string" ? run.conclusion : null,
    startedAt: readDateString(run.run_started_at) ?? readDateString(run.created_at),
    finishedAt: status === "completed" ? readDateString(run.updated_at) : null
  };
}

function toWorkflowJobSummary(job: GitHubWorkflowJobApiResponse): GitHubWorkflowJobSummary {
  return {
    id: readRequiredNumber(job.id, "workflow job id"),
    name: readRequiredString(job.name, "workflow job name"),
    runUrl: readRequiredString(job.html_url, "workflow job url"),
    status: readRequiredString(job.status, "workflow job status"),
    conclusion: typeof job.conclusion === "string" ? job.conclusion : null,
    startedAt: readDateString(job.started_at),
    finishedAt: readDateString(job.completed_at),
    steps: (job.steps ?? []).map(toWorkflowStepSummary)
  };
}

function toWorkflowStepSummary(step: GitHubWorkflowStepApiResponse): GitHubWorkflowStepSummary {
  return {
    name: readRequiredString(step.name, "workflow step name"),
    status: readRequiredString(step.status, "workflow step status"),
    conclusion: typeof step.conclusion === "string" ? step.conclusion : null,
    startedAt: readDateString(step.started_at),
    finishedAt: readDateString(step.completed_at)
  };
}

function toPkcs8PrivateKey(privateKey: string): string {
  const key = createPrivateKey(privateKey);
  const exported = key.export({
    format: "pem",
    type: "pkcs8"
  });

  if (typeof exported !== "string") {
    throw new Error("GitHub App private key could not be exported as PEM");
  }

  return exported;
}

type GitHubRequestInit = {
  method?: string;
  token?: string;
  authScheme?: "Bearer" | "token";
  body?: Record<string, unknown>;
};

// GitHub HTTP 실패를 상태 코드가 있는 typed error로 통일한다.
async function requestGitHub<T>(
  fetchImpl: typeof fetch,
  path: string,
  init: GitHubRequestInit = {}
): Promise<T> {
  const requestInit: RequestInit = {
    method: init.method ?? "GET",
    signal: AbortSignal.timeout(githubRequestTimeoutMs),
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.token ? { Authorization: `${init.authScheme ?? "token"} ${init.token}` } : {})
    }
  };

  if (init.body) {
    requestInit.body = JSON.stringify(init.body);
  }

  const response = await fetchImpl(`${githubApiBaseUrl}${path}`, {
    ...requestInit
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new GitHubApiRequestError(response.status, body.slice(0, 500));
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

async function requestGitHubText(
  fetchImpl: typeof fetch,
  path: string,
  token: string
): Promise<string> {
  const response = await fetchImpl(`${githubApiBaseUrl}${path}`, {
    method: "GET",
    signal: AbortSignal.timeout(githubRequestTimeoutMs),
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `token ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new GitHubApiRequestError(response.status, body.slice(0, 500));
  }
  return response.text();
}

// recursive tree에서 실제 파일 경로만 골라 항상 같은 순서로 반환한다.
function readRepositoryTreePaths(tree: GitHubRecursiveTreeResponse): string[] {
  return (tree.tree ?? [])
    .flatMap((entry) =>
      entry.type === "blob" && typeof entry.path === "string" && entry.path ? [entry.path] : []
    )
    .sort();
}

// GitHub content API의 base64 텍스트만 UTF-8 evidence로 변환한다.
function decodeRepositoryEvidenceFile(
  path: string,
  contents: GitHubContentsResponse
): { content: string; byteLength: number } {
  if (contents.encoding !== "base64" || typeof contents.content !== "string") {
    throw new GitHubRepositoryFileEncodingError(path);
  }

  const contentBuffer = Buffer.from(contents.content.replace(/\s/g, ""), "base64");

  if (contentBuffer.byteLength > maxRepositoryEvidenceFileBytes) {
    throw new GitHubRepositoryEvidenceLimitError(
      "file_size",
      maxRepositoryEvidenceFileBytes,
      contentBuffer.byteLength,
      path
    );
  }

  return {
    content: contentBuffer.toString("utf8"),
    byteLength: contentBuffer.byteLength
  };
}

function toGitHubAppInstallation(
  installation: GitHubInstallationApiResponse
): GitHubAppInstallation {
  const repositorySelection = installation.repository_selection;

  return {
    installationId: String(readRequiredNumber(installation.id, "installation id")),
    accountId: String(readRequiredNumber(installation.account?.id, "installation account id")),
    accountLogin: readRequiredString(installation.account?.login, "installation account login"),
    accountType:
      typeof installation.account?.type === "string" && installation.account.type
        ? installation.account.type
        : null,
    repositorySelection:
      repositorySelection === "all" || repositorySelection === "selected"
        ? repositorySelection
        : null,
    htmlUrl:
      typeof installation.html_url === "string" && installation.html_url
        ? installation.html_url
        : null
  };
}

function toGitHubRepositoryCandidate(
  repository: GitHubRepositoryApiResponse
): GitHubRepositoryCandidate {
  const owner = readRequiredString(repository.owner?.login, "repository owner");
  const name = readRequiredString(repository.name, "repository name");
  const visibility = readVisibility(repository.visibility, repository.private);

  return {
    githubRepositoryId: String(readRequiredNumber(repository.id, "repository id")),
    owner,
    name,
    fullName:
      typeof repository.full_name === "string" && repository.full_name
        ? repository.full_name
        : `${owner}/${name}`,
    defaultBranch: readRequiredString(repository.default_branch, "default branch"),
    repositoryUrl:
      typeof repository.html_url === "string" && repository.html_url ? repository.html_url : null,
    visibility,
    archived: repository.archived === true
  };
}

function readVisibility(
  visibility: unknown,
  isPrivate: unknown
): GitHubRepositoryCandidate["visibility"] {
  if (visibility === "public" || visibility === "private" || visibility === "internal") {
    return visibility;
  }

  return isPrivate === true ? "private" : "public";
}

async function getOrCreateTargetBranchSha(
  input: GitHubAppCreatePullRequestInput,
  requestWithInstallationToken: <T>(
    installationId: string,
    path: string,
    init?: Omit<GitHubRequestInit, "token" | "authScheme">
  ) => Promise<T>
): Promise<string> {
  try {
    const targetRef = await requestWithInstallationToken<GitHubRefResponse>(
      input.installationId,
      createRepositoryPath(input, `/git/ref/heads/${encodeURIComponent(input.targetBranch)}`)
    );

    return readRequiredString(targetRef.object?.sha, "target branch sha");
  } catch (error) {
    if (!isHttpStatus(error, 404)) {
      throw error;
    }
  }

  return createInitialTargetBranch(input, requestWithInstallationToken);
}

async function createInitialTargetBranch(
  input: GitHubAppCreatePullRequestInput,
  requestWithInstallationToken: <T>(
    installationId: string,
    path: string,
    init?: Omit<GitHubRequestInit, "token" | "authScheme">
  ) => Promise<T>
): Promise<string> {
  const tree = await requestWithInstallationToken<GitHubTreeResponse>(
    input.installationId,
    createRepositoryPath(input, "/git/trees"),
    {
      method: "POST",
      body: {
        tree: [
          {
            path: "README.md",
            mode: "100644",
            type: "blob",
            content: `# ${input.name}\n\nInitialized by SketchCatch for CI/CD handoff.\n`
          }
        ]
      }
    }
  );
  const commit = await requestWithInstallationToken<GitHubCommitResponse>(
    input.installationId,
    createRepositoryPath(input, "/git/commits"),
    {
      method: "POST",
      body: {
        message: "Initialize repository for SketchCatch handoff",
        tree: readRequiredString(tree.sha, "initial tree sha")
      }
    }
  );
  const commitSha = readRequiredString(commit.sha, "initial commit sha");

  await requestWithInstallationToken<GitHubRefResponse>(
    input.installationId,
    createRepositoryPath(input, "/git/refs"),
    {
      method: "POST",
      body: {
        ref: `refs/heads/${input.targetBranch}`,
        sha: commitSha
      }
    }
  );

  return commitSha;
}

async function listRelatedPullRequests(
  input: GitHubAppCreatePullRequestInput,
  requestWithInstallationToken: <T>(
    installationId: string,
    path: string,
    init?: Omit<GitHubRequestInit, "token" | "authScheme">
  ) => Promise<T>
): Promise<GitHubPullRequestResponse[]> {
  const params = new URLSearchParams({
    state: "all",
    base: input.targetBranch,
    sort: "updated",
    direction: "desc",
    per_page: "100"
  });
  const pullRequests = await requestWithInstallationToken<GitHubPullRequestResponse[]>(
    input.installationId,
    createRepositoryPath(input, `/pulls?${params.toString()}`)
  );
  const repositoryFullName = `${input.owner}/${input.name}`.toLowerCase();
  const retryBranchPrefix = `${getManagedSourceBranchBase(input)}-retry-`;

  return pullRequests.filter((pullRequest) => {
    const sourceBranch = readPullRequestSourceBranch(pullRequest);
    const sourceRepository = typeof pullRequest.head?.repo?.full_name === "string"
      ? pullRequest.head.repo.full_name.toLowerCase()
      : "";

    return (
      pullRequest.base?.ref === input.targetBranch &&
      sourceRepository === repositoryFullName &&
      sourceBranch !== null &&
      (sourceBranch === input.sourceBranch || sourceBranch.startsWith(retryBranchPrefix))
    );
  });
}

function readPullRequestSourceBranch(pullRequest: GitHubPullRequestResponse): string | null {
  return typeof pullRequest.head?.ref === "string" && pullRequest.head.ref
    ? pullRequest.head.ref
    : null;
}

function isMergedPullRequest(pullRequest: GitHubPullRequestResponse): boolean {
  return (
    pullRequest.state === "closed" &&
    (pullRequest.merged === true ||
      (typeof pullRequest.merged_at === "string" && pullRequest.merged_at.length > 0))
  );
}

async function getRepositoryBranchSha(
  input: Pick<GitHubAppCreatePullRequestInput, "installationId" | "owner" | "name">,
  branch: string,
  requestWithInstallationToken: <T>(
    installationId: string,
    path: string,
    init?: Omit<GitHubRequestInit, "token" | "authScheme">
  ) => Promise<T>
): Promise<string | null> {
  try {
    const branchRef = await requestWithInstallationToken<GitHubRefResponse>(
      input.installationId,
      createRepositoryPath(input, `/git/ref/heads/${encodeURIComponent(branch)}`)
    );

    return readRequiredString(branchRef.object?.sha, "source branch sha");
  } catch (error) {
    if (isHttpStatus(error, 404)) {
      return null;
    }

    throw error;
  }
}

async function createSafePullRequestSourceBranch(
  input: GitHubAppCreatePullRequestInput,
  targetSha: string,
  relatedPullRequests: readonly GitHubPullRequestResponse[],
  requestWithInstallationToken: <T>(
    installationId: string,
    path: string,
    init?: Omit<GitHubRequestInit, "token" | "authScheme">
  ) => Promise<T>
): Promise<string> {
  const managedBranchBase = getManagedSourceBranchBase(input);
  const usedPullRequestBranches = new Set(
    relatedPullRequests.flatMap((pullRequest) => {
      const branch = readPullRequestSourceBranch(pullRequest);
      return branch ? [branch] : [];
    })
  );
  const candidates = relatedPullRequests.length === 0
    ? [managedBranchBase]
    : [];

  for (let retryNumber = 2; retryNumber <= 100; retryNumber += 1) {
    candidates.push(createRetryBranchName(managedBranchBase, retryNumber));
  }

  for (const candidate of candidates) {
    if (usedPullRequestBranches.has(candidate)) {
      continue;
    }

    if (await getRepositoryBranchSha(input, candidate, requestWithInstallationToken)) {
      continue;
    }

    try {
      await requestWithInstallationToken<GitHubRefResponse>(
        input.installationId,
        createRepositoryPath(input, "/git/refs"),
        {
          method: "POST",
          body: {
            ref: `refs/heads/${candidate}`,
            sha: targetSha
          }
        }
      );
      return candidate;
    } catch (error) {
      if (!isHttpStatus(error, 422)) {
        throw error;
      }
    }
  }

  const error = new Error("No available SketchCatch pull request branch was found") as Error & {
    statusCode?: number;
  };
  error.statusCode = 409;
  throw error;
}

function getManagedSourceBranchBase(input: GitHubAppCreatePullRequestInput): string {
  if (input.sourceBranch.startsWith("sketchcatch/")) {
    return input.sourceBranch.replace(/-retry-\d+$/u, "");
  }

  const readableBranch = input.sourceBranch
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80) || "handoff";
  const fingerprint = createHash("sha256")
    .update(`${input.owner}/${input.name}:${input.targetBranch}:${input.sourceBranch}`)
    .digest("hex")
    .slice(0, 12);

  return `sketchcatch/retry/${readableBranch}-${fingerprint}`;
}

function createRetryBranchName(branchBase: string, retryNumber: number): string {
  const suffix = `-retry-${retryNumber}`;
  return `${branchBase.slice(0, 240 - suffix.length)}${suffix}`;
}

async function updatePullRequestFiles(
  input: GitHubAppCreatePullRequestInput,
  sourceBranch: string,
  initialCommitSha: string,
  requestWithInstallationToken: <T>(
    installationId: string,
    path: string,
    init?: Omit<GitHubRequestInit, "token" | "authScheme">
  ) => Promise<T>
): Promise<{ lastCommitSha: string; changedFileCount: number }> {
  let lastCommitSha = initialCommitSha;
  let changedFileCount = 0;

  for (const file of input.files) {
    const sourceFile = await getRepositoryContent(
      input,
      file.path,
      sourceBranch,
      requestWithInstallationToken
    );

    if (sourceFile && isSameGitHubFileContent(sourceFile, file.content)) {
      continue;
    }

    const putResponse = await requestWithInstallationToken<GitHubPutContentsResponse>(
      input.installationId,
      createRepositoryPath(input, `/contents/${encodePath(file.path)}`),
      {
        method: "PUT",
        body: {
          message: input.commitMessage,
          content: Buffer.from(file.content, "utf8").toString("base64"),
          branch: sourceBranch,
          ...(sourceFile?.sha ? { sha: sourceFile.sha } : {})
        }
      }
    );

    lastCommitSha = readRequiredString(putResponse.commit?.sha, "commit sha");
    changedFileCount += 1;
  }

  return { lastCommitSha, changedFileCount };
}

async function pullRequestFilesMatchRef(
  input: GitHubAppCreatePullRequestInput,
  ref: string,
  requestWithInstallationToken: <T>(
    installationId: string,
    path: string,
    init?: Omit<GitHubRequestInit, "token" | "authScheme">
  ) => Promise<T>
): Promise<boolean> {
  for (const file of input.files) {
    const repositoryFile = await getRepositoryContent(
      input,
      file.path,
      ref,
      requestWithInstallationToken
    );

    if (!repositoryFile || !isSameGitHubFileContent(repositoryFile, file.content)) {
      return false;
    }
  }

  return true;
}

async function handoffManifestMatchesRef(
  input: GitHubAppCreatePullRequestInput,
  ref: string,
  requestWithInstallationToken: <T>(
    installationId: string,
    path: string,
    init?: Omit<GitHubRequestInit, "token" | "authScheme">
  ) => Promise<T>
): Promise<boolean> {
  const manifests = input.files.filter((file) => file.path.endsWith("/ci-cd/handoff.json"));
  const manifest = manifests[0];

  if (!manifest || manifests.length !== 1) {
    return false;
  }

  const repositoryFile = await getRepositoryContent(
    input,
    manifest.path,
    ref,
    requestWithInstallationToken
  );

  return repositoryFile !== null && isSameGitHubFileContent(repositoryFile, manifest.content);
}

function createPullRequestResult(
  pullRequest: GitHubPullRequestResponse,
  sourceBranch: string,
  commitSha: string,
  pullRequestHeadSha: string = commitSha
): GitHubAppCreatePullRequestResult {
  return {
    pullRequestUrl: readRequiredString(pullRequest.html_url, "pull request url"),
    pullRequestNumber: readRequiredNumber(pullRequest.number, "pull request number"),
    pullRequestHeadSha,
    commitSha,
    sourceBranch
  };
}

function createNoPullRequestFileChangesError(): Error {
  const error = new Error("No CI/CD handoff file changes were needed") as Error & {
    statusCode?: number;
  };
  error.statusCode = 409;
  return error;
}

function isSameGitHubFileContent(file: GitHubContentsResponse, nextContent: string): boolean {
  if (file.encoding !== "base64" || typeof file.content !== "string") {
    return false;
  }

  const normalizedBase64 = file.content.replace(/\s/g, "");

  try {
    return Buffer.from(normalizedBase64, "base64").toString("utf8") === nextContent;
  } catch {
    return false;
  }
}

async function getRepositoryContent(
  input: Pick<GitHubAppCreatePullRequestInput, "installationId" | "owner" | "name">,
  path: string,
  ref: string,
  requestWithInstallationToken: <T>(
    installationId: string,
    path: string,
    init?: Omit<GitHubRequestInit, "token" | "authScheme">
  ) => Promise<T>
): Promise<GitHubContentsResponse | null> {
  try {
    return await requestWithInstallationToken<GitHubContentsResponse>(
      input.installationId,
      createRepositoryPath(input, `/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`)
    );
  } catch (error) {
    if (isHttpStatus(error, 404)) {
      return null;
    }

    throw error;
  }
}

async function upsertRepositoryVariable(
  input: GitHubRepositorySettingsInput,
  variableName: string,
  requestWithInstallationToken: <T>(
    installationId: string,
    path: string,
    init?: Omit<GitHubRequestInit, "token" | "authScheme">
  ) => Promise<T>
): Promise<void> {
  const variablePath = createRepositoryPath(
    input,
    `/actions/variables/${encodeURIComponent(variableName)}`
  );
  const body = {
    name: variableName,
    value: input.variables[variableName] ?? ""
  };

  try {
    const currentVariable = await requestWithInstallationToken<GitHubRepositoryVariableResponse>(
      input.installationId,
      variablePath
    );
    if (currentVariable.name === variableName && currentVariable.value === body.value) {
      return;
    }
    await requestWithInstallationToken<Record<string, never>>(input.installationId, variablePath, {
      method: "PATCH",
      body
    });
  } catch (error) {
    if (!isHttpStatus(error, 404)) {
      throw error;
    }

    await requestWithInstallationToken<Record<string, never>>(
      input.installationId,
      createRepositoryPath(input, "/actions/variables"),
      {
        method: "POST",
        body
      }
    );
  }
}

async function deleteRepositoryVariableIfPresent(
  input: GitHubRepositorySettingsInput,
  variableName: string,
  requestWithInstallationToken: <T>(
    installationId: string,
    path: string,
    init?: Omit<GitHubRequestInit, "token" | "authScheme">
  ) => Promise<T>
): Promise<void> {
  const currentVariable = await getRepositoryVariable(
    input,
    variableName,
    requestWithInstallationToken
  );

  if (currentVariable === null) {
    return;
  }

  try {
    await requestWithInstallationToken<Record<string, never>>(
      input.installationId,
      createRepositoryPath(
        input,
        `/actions/variables/${encodeURIComponent(variableName)}`
      ),
      { method: "DELETE" }
    );
  } catch (error) {
    if (!isHttpStatus(error, 404)) {
      throw error;
    }
  }
}

async function getRepositoryVariable(
  input: GitHubRepositorySettingsInput,
  variableName: string,
  requestWithInstallationToken: <T>(
    installationId: string,
    path: string,
    init?: Omit<GitHubRequestInit, "token" | "authScheme">
  ) => Promise<T>
): Promise<GitHubRepositoryVariableResponse | null> {
  try {
    return await requestWithInstallationToken<GitHubRepositoryVariableResponse>(
      input.installationId,
      createRepositoryPath(
        input,
        `/actions/variables/${encodeURIComponent(variableName)}`
      )
    );
  } catch (error) {
    if (isHttpStatus(error, 404)) {
      return null;
    }

    throw error;
  }
}

function isBlankRepositoryVariable(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

async function getRepositoryEnvironment(
  input: GitHubRepositorySettingsInput,
  requestWithInstallationToken: <T>(
    installationId: string,
    path: string,
    init?: Omit<GitHubRequestInit, "token" | "authScheme">
  ) => Promise<T>
): Promise<GitHubEnvironmentResponse | null> {
  try {
    return await requestWithInstallationToken<GitHubEnvironmentResponse>(
      input.installationId,
      createRepositoryPath(
        input,
        `/environments/${encodeURIComponent(input.environmentName)}`
      )
    );
  } catch (error) {
    if (isHttpStatus(error, 404)) {
      return null;
    }

    throw error;
  }
}

function isExactRepositoryEnvironment(
  environment: GitHubEnvironmentResponse | null,
  expectedName: string
): boolean {
  return (
    environment?.name === expectedName &&
    environment.deployment_branch_policy?.protected_branches === false &&
    environment.deployment_branch_policy.custom_branch_policies === true
  );
}

async function listDeploymentBranchPolicies(
  input: GitHubRepositorySettingsInput,
  requestWithInstallationToken: <T>(
    installationId: string,
    path: string,
    init?: Omit<GitHubRequestInit, "token" | "authScheme">
  ) => Promise<T>
): Promise<GitHubDeploymentBranchPolicy[]> {
  const policies: GitHubDeploymentBranchPolicy[] = [];

  for (let page = 1; ; page += 1) {
    const response = await requestWithInstallationToken<GitHubDeploymentBranchPoliciesResponse>(
      input.installationId,
      `${createDeploymentBranchPoliciesPath(input)}?per_page=100&page=${page}`
    );
    const pagePolicies = response.branch_policies ?? [];
    policies.push(...pagePolicies);

    if (pagePolicies.length < 100) {
      return policies;
    }
  }
}

function createDeploymentBranchPoliciesPath(input: GitHubRepositorySettingsInput): string {
  return createRepositoryPath(
    input,
    `/environments/${encodeURIComponent(input.environmentName)}/deployment-branch-policies`
  );
}

function hasExactTargetBranchPolicy(
  policies: readonly GitHubDeploymentBranchPolicy[],
  targetBranch: string
): boolean {
  return (
    policies.length === 1 &&
    policies[0]?.name === targetBranch &&
    (policies[0]?.type === undefined || policies[0]?.type === "branch")
  );
}

function createRepositoryPath(
  input: Pick<GitHubAppCreatePullRequestInput, "owner" | "name">,
  suffix: string
): string {
  return `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.name)}${suffix}`;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function compareWorkflowRunsDesc(
  left: GitHubWorkflowRunApiResponse,
  right: GitHubWorkflowRunApiResponse
): number {
  const leftTime = Date.parse(
    readDateString(left.updated_at) ?? readDateString(left.created_at) ?? ""
  );
  const rightTime = Date.parse(
    readDateString(right.updated_at) ?? readDateString(right.created_at) ?? ""
  );

  return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
}

function mapWorkflowRunStatus(run: GitHubWorkflowRunApiResponse): GitHubActionsPipelineStatus {
  const pipelineRunUrl = typeof run.html_url === "string" && run.html_url ? run.html_url : null;
  const status = typeof run.status === "string" ? run.status : "";
  const conclusion = typeof run.conclusion === "string" ? run.conclusion : "";

  if (status === "queued" || status === "in_progress" || status === "waiting") {
    return {
      status: "pipeline_running",
      pipelineRunUrl,
      statusMessage: `GitHub Actions workflow run is ${status}.`
    };
  }

  if (status === "completed" && conclusion === "success") {
    return {
      status: "pipeline_success",
      pipelineRunUrl,
      statusMessage: "GitHub Actions workflow run completed successfully."
    };
  }

  if (
    status === "completed" &&
    (conclusion === "failure" ||
      conclusion === "cancelled" ||
      conclusion === "timed_out" ||
      conclusion === "action_required")
  ) {
    return {
      status: "pipeline_failed",
      pipelineRunUrl,
      statusMessage: `GitHub Actions workflow run completed with ${conclusion}.`
    };
  }

  return {
    status: "pipeline_running",
    pipelineRunUrl,
    statusMessage: `GitHub Actions workflow run is ${status || "unknown"}.`
  };
}

function findLatestWorkflowRunByName(
  runs: readonly GitHubWorkflowRunApiResponse[],
  name: string
): GitHubWorkflowRunApiResponse | undefined {
  return [...runs].filter((run) => run.name === name).sort(compareWorkflowRunsDesc)[0];
}

function mapWorkflowRunDetailStatus(
  run: GitHubWorkflowRunApiResponse | undefined,
  fallback: GitCicdPipelineDetailStatus
): { status: GitCicdPipelineDetailStatus; url: string | null } {
  if (!run) {
    return {
      status: fallback,
      url: null
    };
  }

  const url = typeof run.html_url === "string" && run.html_url ? run.html_url : null;
  const status = typeof run.status === "string" ? run.status : "";
  const conclusion = typeof run.conclusion === "string" ? run.conclusion : "";

  if (status === "queued" || status === "in_progress") {
    return { status: "running", url };
  }

  if (status === "waiting" || conclusion === "action_required") {
    return { status: "waiting_for_approval", url };
  }

  if (status === "completed" && conclusion === "success") {
    return { status: "success", url };
  }

  if (status === "completed" && conclusion === "cancelled") {
    return { status: "cancelled", url };
  }

  if (status === "completed") {
    return { status: "failed", url };
  }

  return { status: "running", url };
}

function aggregatePipelineStatus(
  infraStatus: GitCicdPipelineDetailStatus,
  appStatus: GitCicdPipelineDetailStatus
): GitCicdHandoffStatus {
  if (infraStatus === "failed" || appStatus === "failed") {
    return "pipeline_failed";
  }

  if (infraStatus === "cancelled" || appStatus === "cancelled") {
    return "cancelled";
  }

  if (infraStatus === "success" && appStatus === "success") {
    return "pipeline_success";
  }

  return "pipeline_running";
}

function createPipelineStatusMessage(
  status: GitCicdHandoffStatus,
  infraStatus: GitCicdPipelineDetailStatus,
  appStatus: GitCicdPipelineDetailStatus
): string {
  if (status === "pipeline_success") {
    return "Infra and app GitHub Actions workflows completed successfully.";
  }

  if (status === "pipeline_failed") {
    return `GitHub Actions failed. Infra: ${infraStatus}, app: ${appStatus}.`;
  }

  if (status === "cancelled") {
    return "GitHub Actions workflow was cancelled.";
  }

  return `GitHub Actions is running or waiting. Infra: ${infraStatus}, app: ${appStatus}.`;
}

function readRequiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`GitHub API response missing ${label}`);
  }

  return value;
}

function readRequiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`GitHub API response missing ${label}`);
  }

  return value;
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readDateString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function isHttpStatus(error: unknown, statusCode: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    (error as { readonly statusCode?: unknown }).statusCode === statusCode
  );
}
