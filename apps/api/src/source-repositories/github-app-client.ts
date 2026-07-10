import { createPrivateKey } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import type {
  GitCicdHandoffStatus,
  GitCicdPipelineDetailStatus,
  GitHubRepositoryCandidate
} from "@sketchcatch/types";

const githubApiBaseUrl = "https://api.github.com";
const githubJwtTtlSeconds = 9 * 60;

const repositoryEvidenceFileNames = new Set([
  "angular.json",
  "app.yaml",
  "cdk.json",
  "compose.yaml",
  "compose.yml",
  "docker-compose.yaml",
  "docker-compose.yml",
  "kustomization.yaml",
  "kustomization.yml",
  "netlify.toml",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "nuxt.config.js",
  "nuxt.config.ts",
  "samconfig.toml",
  "serverless.yaml",
  "serverless.yml",
  "template.yaml",
  "template.yml",
  "vercel.json",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.ts",
  "wrangler.json",
  "wrangler.jsonc",
  "wrangler.toml"
]);

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
  files: GitHubAppPullRequestFile[];
};

export type GitHubAppCreatePullRequestResult = {
  pullRequestUrl: string;
  pullRequestNumber: number;
  pullRequestHeadSha: string;
  commitSha: string;
};

export type GitHubRepositorySettingsInput = {
  installationId: string;
  owner: string;
  name: string;
  environmentName: string;
  variables: Record<string, string>;
};

export type GitHubRepositorySettingsResult = {
  environmentName: string;
  variables: string[];
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
  accountLogin: string;
  accountType: string | null;
  repositorySelection: "all" | "selected" | null;
  htmlUrl: string | null;
};

export type GitHubReadRepositoryEvidenceInput = {
  readonly installationId: string;
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

export class GitHubRepositoryTreeTruncatedError extends Error {
  readonly name = "GitHubRepositoryTreeTruncatedError";

  // 일부 tree만으로 잘못된 Template을 고르지 않도록 분석을 중단한다.
  constructor() {
    super("GitHub repository tree response was truncated");
  }
}

export class GitHubRepositoryFileEncodingError extends Error {
  readonly name = "GitHubRepositoryFileEncodingError";

  // 해석할 수 없는 파일을 근거로 쓰지 않도록 문제 경로를 함께 남긴다.
  constructor(readonly path: string) {
    super(`GitHub repository evidence file has unsupported encoding: ${path}`);
  }
}

export type GitHubAppClient = {
  listInstallations(): Promise<GitHubAppInstallation[]>;
  listInstallationRepositories(installationId: string): Promise<GitHubRepositoryCandidate[]>;
  createPullRequest(input: GitHubAppCreatePullRequestInput): Promise<GitHubAppCreatePullRequestResult>;
  applyRepositorySettings(
    input: GitHubRepositorySettingsInput
  ): Promise<GitHubRepositorySettingsResult>;
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

type GitHubPullRequestResponse = {
  readonly html_url?: unknown;
  readonly number?: unknown;
  readonly head?: {
    readonly sha?: unknown;
  };
  readonly merged?: unknown;
  readonly state?: unknown;
  readonly merge_commit_sha?: unknown;
};

type GitHubWorkflowRunsResponse = {
  readonly workflow_runs?: GitHubWorkflowRunApiResponse[];
};

type GitHubWorkflowRunApiResponse = {
  readonly html_url?: unknown;
  readonly name?: unknown;
  readonly status?: unknown;
  readonly conclusion?: unknown;
  readonly created_at?: unknown;
  readonly updated_at?: unknown;
};

// GitHub App 인증을 재사용해 repository 연결과 정적 evidence 조회 기능을 제공한다.
export function createGitHubAppClient(
  options: GitHubAppClientOptions
): GitHubAppClient & GitHubRepositoryEvidenceReader {
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
      const repository = await requestWithInstallationToken<GitHubRepositoryApiResponse>(
        input.installationId,
        createRepositoryPath(input, "")
      );
      const defaultBranch = readRequiredString(
        repository.default_branch,
        "repository default branch"
      );
      const commit = await requestWithInstallationToken<GitHubCommitResponse>(
        input.installationId,
        createRepositoryPath(input, `/commits/${encodeURIComponent(defaultBranch)}`)
      );
      const revision = readRequiredString(commit.sha, "repository commit sha");
      const tree = await requestWithInstallationToken<GitHubRecursiveTreeResponse>(
        input.installationId,
        createRepositoryPath(
          input,
          `/git/trees/${encodeURIComponent(revision)}?recursive=1`
        )
      );

      if (tree.truncated === true) {
        throw new GitHubRepositoryTreeTruncatedError();
      }

      const treePaths = readRepositoryTreePaths(tree);
      const evidencePaths = treePaths.filter(isRepositoryEvidenceContentPath);
      const files: GitHubRepositoryEvidenceFile[] = [];

      for (const path of evidencePaths) {
        const contents = await getRepositoryContent(
          input,
          path,
          revision,
          requestWithInstallationToken
        );

        if (contents) {
          files.push({
            path,
            content: decodeRepositoryEvidenceFile(path, contents)
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
      const targetSha = await getOrCreateTargetBranchSha(
        input,
        requestWithInstallationToken
      );

      await createSourceBranchIfNeeded(input, targetSha, requestWithInstallationToken);

      let lastCommitSha = targetSha;
      let changedFileCount = 0;

      for (const file of input.files) {
        const sourceFile = await getRepositoryContent(
          input,
          file.path,
          input.sourceBranch,
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
              branch: input.sourceBranch,
              ...(sourceFile?.sha ? { sha: sourceFile.sha } : {})
            }
          }
        );

        lastCommitSha = readRequiredString(putResponse.commit?.sha, "commit sha");
        changedFileCount += 1;
      }

      if (changedFileCount === 0) {
        const error = new Error("No Git/CI/CD handoff file changes were needed") as Error & {
          statusCode?: number;
        };

        error.statusCode = 409;
        throw error;
      }

      const pullRequest = await requestWithInstallationToken<GitHubPullRequestResponse>(
        input.installationId,
        createRepositoryPath(input, "/pulls"),
        {
          method: "POST",
          body: {
            title: input.pullRequestTitle,
            body: input.pullRequestBody,
            head: input.sourceBranch,
            base: input.targetBranch
          }
        }
      );

      return {
        pullRequestUrl: readRequiredString(pullRequest.html_url, "pull request url"),
        pullRequestNumber: readRequiredNumber(pullRequest.number, "pull request number"),
        pullRequestHeadSha: readRequiredString(pullRequest.head?.sha, "pull request head sha"),
        commitSha: lastCommitSha
      };
    },

    async applyRepositorySettings(input) {
      await requestWithInstallationToken<Record<string, never>>(
        input.installationId,
        createRepositoryPath(input, `/environments/${encodeURIComponent(input.environmentName)}`),
        {
          method: "PUT",
          body: {}
        }
      );

      const variableNames = Object.keys(input.variables).sort();

      for (const variableName of variableNames) {
        await upsertRepositoryVariable(input, variableName, requestWithInstallationToken);
      }

      return {
        environmentName: input.environmentName,
        variables: variableNames
      };
    },

    async getLatestWorkflowRunForHeadSha(input) {
      const response = await requestWithInstallationToken<GitHubWorkflowRunsResponse>(
        input.installationId,
        createRepositoryPath(input, `/actions/runs?per_page=10&head_sha=${encodeURIComponent(input.headSha)}`)
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

// recursive tree에서 실제 파일 경로만 골라 항상 같은 순서로 반환한다.
function readRepositoryTreePaths(tree: GitHubRecursiveTreeResponse): string[] {
  return (tree.tree ?? [])
    .flatMap((entry) =>
      entry.type === "blob" && typeof entry.path === "string" && entry.path
        ? [entry.path]
        : []
    )
    .sort();
}

// 분석 근거로 합의한 작은 설정 파일만 content API 조회 대상으로 허용한다.
function isRepositoryEvidenceContentPath(path: string): boolean {
  const fileName = path.split("/").at(-1) ?? "";
  const lowerFileName = fileName.toLowerCase();

  if (
    lowerFileName === "package.json" ||
    /^readme(?:\.(?:md|mdx|rst|txt))?$/.test(lowerFileName)
  ) {
    return true;
  }

  if (fileName === "Dockerfile" || fileName.endsWith(".Dockerfile")) {
    return true;
  }

  return repositoryEvidenceFileNames.has(fileName);
}

// GitHub content API의 base64 텍스트만 UTF-8 evidence로 변환한다.
function decodeRepositoryEvidenceFile(path: string, contents: GitHubContentsResponse): string {
  if (contents.encoding !== "base64" || typeof contents.content !== "string") {
    throw new GitHubRepositoryFileEncodingError(path);
  }

  return Buffer.from(contents.content.replace(/\s/g, ""), "base64").toString("utf8");
}

function toGitHubAppInstallation(
  installation: GitHubInstallationApiResponse
): GitHubAppInstallation {
  const repositorySelection = installation.repository_selection;

  return {
    installationId: String(readRequiredNumber(installation.id, "installation id")),
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
            content: `# ${input.name}\n\nInitialized by SketchCatch for Git/CI/CD handoff.\n`
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

async function createSourceBranchIfNeeded(
  input: GitHubAppCreatePullRequestInput,
  targetSha: string,
  requestWithInstallationToken: <T>(
    installationId: string,
    path: string,
    init?: Omit<GitHubRequestInit, "token" | "authScheme">
  ) => Promise<T>
): Promise<void> {
  try {
    await requestWithInstallationToken<GitHubRefResponse>(
      input.installationId,
      createRepositoryPath(input, "/git/refs"),
      {
        method: "POST",
        body: {
          ref: `refs/heads/${input.sourceBranch}`,
          sha: targetSha
        }
      }
    );
  } catch (error) {
    if (isHttpStatus(error, 422)) {
      return;
    }

    throw error;
  }
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
    await requestWithInstallationToken<Record<string, never>>(input.installationId, variablePath);
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
  const leftTime = Date.parse(readDateString(left.updated_at) ?? readDateString(left.created_at) ?? "");
  const rightTime = Date.parse(readDateString(right.updated_at) ?? readDateString(right.created_at) ?? "");

  return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
}

function mapWorkflowRunStatus(run: GitHubWorkflowRunApiResponse): GitHubActionsPipelineStatus {
  const pipelineRunUrl =
    typeof run.html_url === "string" && run.html_url ? run.html_url : null;
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
  return [...runs]
    .filter((run) => run.name === name)
    .sort(compareWorkflowRunsDesc)[0];
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
