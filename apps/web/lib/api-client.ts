import type {
  ApiErrorCode,
  ApiErrorResponse,
  AuthResponse,
  AuthSession,
  LoginLockedErrorResponse
} from "@sketchcatch/types";
import {
  clearStoredAuthSession,
  readStoredAuthSession,
  writeStoredAuthSession
} from "./auth-storage";

const DEFAULT_API_BASE_URL = "/api";
const JSON_CONTENT_TYPE = "application/json";
const CSRF_TOKEN_COOKIE_NAME = "sketchcatch_csrf_token";
const CSRF_TOKEN_HEADER_NAME = "X-CSRF-Token";
const API_CONNECTION_ERROR_MESSAGE =
  "API 서버에 연결할 수 없습니다. Docker DB와 API 서버가 켜져 있는지 확인해주세요.";
const DEFAULT_API_ERROR_MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  bad_request: "입력값 형식을 확인해주세요.",
  bad_gateway: "AI 응답을 아키텍처로 해석하지 못했습니다. 다시 시도해주세요.",
  conflict: "현재 상태와 요청 조건이 충돌합니다. 최신 상태와 필요한 설정을 확인해주세요.",
  internal_server_error: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  PUBLIC_REPOSITORY_INPUT_INVALID: "지원하는 GitHub Repository URL과 branch를 확인해주세요.",
  PUBLIC_REPOSITORY_UNAVAILABLE:
    "Repository를 확인할 수 없습니다. URL이 잘못되었거나 비공개 Repository일 수 있습니다.",
  PUBLIC_REPOSITORY_BRANCH_UNAVAILABLE: "Repository의 branch를 확인할 수 없습니다.",
  PUBLIC_REPOSITORY_RATE_LIMITED:
    "GitHub 공개 조회 한도를 초과했습니다. 잠시 후 다시 시도하거나 GitHub를 연결해주세요.",
  PUBLIC_REPOSITORY_PROVIDER_UNAVAILABLE:
    "GitHub가 Repository 정보를 반환하지 못했습니다. 잠시 후 다시 시도해주세요.",
  LIVE_OBSERVATION_DISABLED: "실시간 관측 기능이 서버에서 비활성화되어 있습니다.",
  LIVE_OBSERVATION_CACHE_UNAVAILABLE:
    "실시간 관측 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.",
  LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE:
    "이 배포는 실시간 관측을 시작할 수 있는 상태가 아닙니다.",
  LIVE_OBSERVATION_GONE: "실시간 관측 세션이 종료되었거나 만료되었습니다.",
  LIVE_OBSERVATION_NOT_FOUND: "실시간 관측 세션을 찾을 수 없습니다.",
  LIVE_OBSERVATION_OUTPUT_INVALID: "배포 결과에 실시간 관측에 필요한 Terraform output이 없습니다.",
  LIVE_OBSERVATION_RATE_LIMITED: "실시간 관측 요청 한도를 초과했습니다.",
  not_found: "요청한 정보를 찾을 수 없습니다.",
  service_unavailable: "AI 생성 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.",
  too_many_requests: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  unprocessable_entity: "요구사항을 모두 충족하지 못했습니다. 선택한 조건을 확인해주세요.",
  unauthorized: "인증이 필요합니다."
};
const API_MESSAGE_TRANSLATIONS: Partial<Record<string, string>> = {
  "API request failed": "요청 처리 중 오류가 발생했습니다.",
  "Authentication required": "인증이 필요합니다.",
  DATABASE_MIGRATION_REQUIRED:
    "API 데이터베이스 마이그레이션이 필요합니다. 서버에서 pnpm --filter @sketchcatch/api db:migrate를 실행한 뒤 다시 시도해주세요.",
  DEPLOYMENT_OUTPUT_URL_REQUIRED:
    "ECS 배포 결과 URL이 설정되지 않았습니다. 프로젝트 배포 대상 설정에서 외부 HTTPS URL을 입력한 뒤 다시 시도해주세요.",
  "GitOps application handoff requires a confirmed project deployment target":
    "프로젝트 배포 대상이 확정되지 않았습니다. 프로젝트 설정에서 검증된 AWS 연결과 Repository 빌드 근거를 저장한 뒤 다시 시도해주세요.",
  "A confirmed project deployment target is required for automatic ECS application deployment":
    "전체 스택 배포 전에 Source Repository를 연결하고 프로젝트 배포 타깃과 ECS 빌드 설정을 저장해 주세요.",
  "A confirmed project deployment target is required for application deployment":
    "전체 스택 또는 애플리케이션 배포 전에 Source Repository를 연결하고 프로젝트 배포 타깃과 빌드 설정을 저장해 주세요.",
  PROJECT_DEPLOYMENT_TARGET_REQUIRED:
    "프로젝트 배포 대상이 확정되지 않았습니다. 프로젝트 설정에서 검증된 AWS 연결과 Repository 빌드 근거를 저장한 뒤 다시 시도해주세요.",
  GIT_APP_AUTHENTICATION_FAILED:
    "GitHub App 인증에 실패했습니다. GitHub App 설치와 서버 설정을 확인해주세요.",
  GIT_APP_INSTALLATION_FORBIDDEN:
    "이 GitHub App installation은 다른 SketchCatch 계정에 연결되어 있거나 접근할 수 없습니다. GitHub App 연결을 다시 진행해주세요.",
  GIT_APP_USER_AUTHORIZATION_CANCELLED:
    "GitHub 사용자 권한 확인이 취소됐습니다. GitHub App 연결을 다시 진행해주세요.",
  GIT_APP_USER_AUTHORIZATION_FAILED:
    "GitHub 사용자 권한을 확인하지 못했습니다. GitHub App 설정과 Client Secret을 확인해주세요.",
  GIT_APP_USER_AUTHORIZATION_INVALID:
    "GitHub 사용자 권한 확인 정보가 만료됐거나 올바르지 않습니다. 연결을 다시 진행해주세요.",
  GIT_APP_REPOSITORY_ACCESS_UNAVAILABLE:
    "GitHub App 연결이 해제됐거나 repository 접근 권한이 없습니다. 다시 연결해주세요.",
  GIT_APP_REPOSITORY_ARCHIVED:
    "연결된 GitHub repository가 archived 상태라 분석할 수 없습니다. 다른 repository를 연결해주세요.",
  GIT_APP_REPOSITORY_EVIDENCE_LIMIT_EXCEEDED:
    "repository가 안전한 정적 분석 범위를 초과했습니다. 분석 범위를 줄여주세요.",
  GIT_APP_REPOSITORY_FILE_ENCODING_UNSUPPORTED:
    "분석 파일의 문자 인코딩을 읽을 수 없어 Repository Analysis를 중단했습니다.",
  GIT_APP_REPOSITORY_IDENTITY_MISMATCH:
    "연결 당시와 다른 GitHub repository가 감지되었습니다. repository를 다시 연결한 뒤 분석해주세요.",
  GIT_APP_REPOSITORY_TREE_TRUNCATED:
    "GitHub가 repository tree 일부만 반환해 안전하게 분석할 수 없습니다.",
  REPOSITORY_ANALYSIS_TEMPLATE_MISMATCH:
    "Repository Analysis가 선택한 Template과 요청한 Template이 다릅니다. 분석 결과 화면에서 다시 시작해주세요.",
  REPOSITORY_ANALYSIS_TEMPLATE_UNAVAILABLE:
    "저장된 Repository Analysis Template을 확인할 수 없습니다. repository를 다시 분석해주세요.",
  "AWS account ID must be 12 digits": "AWS Account ID는 12자리 숫자여야 합니다.",
  "AWS account is already connected": "이미 연결된 AWS Account입니다.",
  "AWS connection is used by a deployment":
    "이 AWS 연결은 배포 기록에서 사용 중이라 삭제할 수 없습니다. 먼저 해당 프로젝트 또는 배포 기록을 정리한 뒤 다시 시도해주세요.",
  "AWS Role account mismatch": "입력한 Account ID와 AWS에서 확인된 Account가 다릅니다.",
  "AWS Role connection test failed":
    "AWS Role 연결 검증에 실패했습니다. CloudFormation Stack 생성 완료 후 잠시 기다렸다가 다시 시도하고, Account ID와 Trust Policy를 확인해주세요.",
  "AWS Role assume permission denied":
    "AWS Role을 AssumeRole할 권한이 없습니다. 로컬 SSO Permission Set 또는 실행 Role에 sts:AssumeRole 권한을 추가하고, 대상 Role Trust Policy의 Principal과 External ID가 현재 연결 정보와 일치하는지 확인해주세요.",
  "AWS caller credentials are invalid or expired":
    "로컬 AWS 자격 증명이 만료되었거나 유효하지 않습니다. AWS SSO를 다시 로그인한 뒤 API 서버를 재시작하고 다시 시도해주세요.",
  "AWS Role external ID requirement could not be verified":
    "AWS Role의 External ID 조건을 확인하지 못했습니다. CloudFormation Stack의 Trust Policy에 SketchCatch External ID 조건이 있는지 확인해주세요.",
  "AWS Role trust policy must require external ID":
    "AWS Role Trust Policy에 SketchCatch External ID 조건이 필요합니다.",
  "Email already exists": "이미 사용 중인 이메일입니다.",
  "Refresh token is invalid or expired": "로그인 세션이 만료되었습니다. 다시 로그인해주세요.",
  "Route not found": "요청한 API 경로를 찾을 수 없습니다.",
  "Only an active GitHub source repository can be analyzed":
    "현재 연결된 active GitHub repository만 분석할 수 있습니다.",
  "Source repository changed during analysis":
    "분석 중 repository 연결 상태가 바뀌었습니다. 현재 연결을 확인하고 다시 시도해주세요.",
  "GitHub repository analysis is not configured":
    "GitHub Repository Analysis 설정이 준비되지 않았습니다. GitHub App 설정을 확인해주세요.",
  "Too many failed login attempts. Try again later.":
    "로그인 시도가 잠시 차단되었습니다. 잠시 후 다시 시도해주세요.",
  "Username already exists": "이미 사용 중인 아이디입니다.",
  "Username or password is incorrect": "아이디 또는 비밀번호가 올바르지 않습니다."
};

let refreshSessionPromise: Promise<AuthSession | null> | null = null;

type ApiRequestOptions = Omit<RequestInit, "body" | "headers"> & {
  auth?: boolean;
  body?: unknown;
  headers?: HeadersInit;
  retryOnUnauthorized?: boolean;
};

export type ApiRequestContext = Readonly<{
  method: string;
  path: string;
  requestId?: string | undefined;
}>;

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly response: ApiErrorResponse | LoginLockedErrorResponse;
  readonly lockedUntil?: string;
  readonly requestContext: ApiRequestContext | undefined;

  constructor(
    status: number,
    response: ApiErrorResponse | LoginLockedErrorResponse,
    requestContext?: ApiRequestContext
  ) {
    super(response.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = response.error;
    this.response = response;
    this.requestContext = requestContext;

    if ("lockedUntil" in response) {
      this.lockedUntil = response.lockedUntil;
    }
  }
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { auth = false, body, headers, retryOnUnauthorized = true, ...requestInit } = options;
  const requestContext = createApiRequestContext(path, requestInit.method);
  const requestHeaders = new Headers(headers);
  let requestAccessToken: string | null = null;

  if (!requestHeaders.has("Accept")) {
    requestHeaders.set("Accept", JSON_CONTENT_TYPE);
  }

  if (body !== undefined && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", JSON_CONTENT_TYPE);
  }

  setCsrfHeader(requestHeaders, requestInit.method);

  if (auth) {
    const session = readStoredAuthSession();

    if (session) {
      requestAccessToken = session.accessToken;
      requestHeaders.set("Authorization", `Bearer ${session.accessToken}`);
    }
  }

  const request: RequestInit = {
    ...requestInit,
    credentials: requestInit.credentials ?? "include",
    headers: requestHeaders
  };

  if (body !== undefined) {
    request.body = JSON.stringify(body);
  }

  let response: Response;

  try {
    response = await fetch(buildApiUrl(path), request);
  } catch {
    throw createConnectionError(requestContext);
  }

  if (response.status === 401 && auth && retryOnUnauthorized) {
    const latestSession = readStoredAuthSession();

    if (requestAccessToken && latestSession && latestSession.accessToken !== requestAccessToken) {
      return apiFetch<T>(path, {
        ...options,
        retryOnUnauthorized: false
      });
    }

    const refreshedSession = await refreshStoredSessionOnce();

    if (refreshedSession) {
      return apiFetch<T>(path, {
        ...options,
        retryOnUnauthorized: false
      });
    }
  }

  if (!response.ok) {
    throw await toApiClientError(response, requestContext);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await readJson(response)) as T;
}

export function getApiErrorMessage(
  error: unknown,
  fallbackMessage: string,
  options: { developerMode?: boolean } = {}
): string {
  const developerMode = options.developerMode ?? process.env.NODE_ENV === "development";
  if (!(error instanceof ApiClientError)) {
    const message =
      error instanceof Error
        ? (API_MESSAGE_TRANSLATIONS[error.message] ?? fallbackMessage)
        : fallbackMessage;
    return appendDeveloperDiagnostic(message, error, developerMode);
  }

  const message = appendDeveloperDiagnostic(
    getBaseApiErrorMessage(error, fallbackMessage),
    error,
    developerMode
  );
  return appendApiDiagnostic(message, error);
}

export async function refreshAuthSession(): Promise<AuthSession | null> {
  return refreshStoredSessionOnce();
}

export function hasRefreshSessionCookieHint(): boolean {
  return readCookie(CSRF_TOKEN_COOKIE_NAME) !== null;
}

async function refreshStoredSessionOnce(): Promise<AuthSession | null> {
  refreshSessionPromise ??= refreshStoredSession().finally(() => {
    refreshSessionPromise = null;
  });

  return refreshSessionPromise;
}

async function refreshStoredSession(): Promise<AuthSession | null> {
  const requestContext = createApiRequestContext("/auth/refresh", "POST");
  let response: Response;

  try {
    response = await fetch(buildApiUrl("/auth/refresh"), {
      credentials: "include",
      headers: {
        Accept: JSON_CONTENT_TYPE,
        ...getCsrfHeader()
      },
      method: "POST"
    });
  } catch {
    throw createConnectionError(requestContext);
  }

  if (response.status === 400 || response.status === 401) {
    clearStoredAuthSession();
    return null;
  }

  if (!response.ok) {
    throw await toApiClientError(response, requestContext);
  }

  const authResponse = (await readJson(response)) as AuthResponse;
  writeStoredAuthSession(authResponse.session);

  return authResponse.session;
}

async function toApiClientError(
  response: Response,
  requestContext: ApiRequestContext
): Promise<ApiClientError> {
  const responseContext = withRequestId(requestContext, response.headers.get("x-request-id"));
  const responseBody = await readJson(response);

  if (isApiErrorResponse(responseBody)) {
    return new ApiClientError(response.status, responseBody, responseContext);
  }

  return new ApiClientError(
    response.status,
    {
      error: response.status >= 500 ? "internal_server_error" : "bad_request",
      message: "요청 처리 중 오류가 발생했습니다."
    },
    responseContext
  );
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse | LoginLockedErrorResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ApiErrorResponse & LoginLockedErrorResponse>;

  return typeof candidate.error === "string" && typeof candidate.message === "string";
}

function createConnectionError(requestContext: ApiRequestContext): ApiClientError {
  return new ApiClientError(
    0,
    {
      error: "internal_server_error",
      message: API_CONNECTION_ERROR_MESSAGE
    },
    requestContext
  );
}

function getBaseApiErrorMessage(error: ApiClientError, fallbackMessage: string): string {
  if (error.status === 0) {
    return error.message || fallbackMessage;
  }

  if (error.code === "too_many_requests" && error.lockedUntil) {
    return `로그인 시도가 잠시 차단되었습니다. ${formatLockedUntil(error.lockedUntil)} 이후 다시 시도해주세요.`;
  }

  return getKoreanApiMessage(error, fallbackMessage);
}

function createApiRequestContext(path: string, method?: string): ApiRequestContext {
  return {
    method: (method ?? "GET").toUpperCase(),
    path: getSafeApiPath(buildApiUrl(path))
  };
}

function getSafeApiPath(value: string): string {
  try {
    return new URL(value, "http://sketchcatch.local").pathname;
  } catch {
    return "/api";
  }
}

function withRequestId(context: ApiRequestContext, requestId: string | null): ApiRequestContext {
  const normalizedRequestId = requestId?.trim();
  return normalizedRequestId ? { ...context, requestId: normalizedRequestId } : context;
}

function appendApiDiagnostic(message: string, error: ApiClientError): string {
  const context = error.requestContext;
  if (!context) return message;

  const response = error.status === 0 ? "응답 없음" : `HTTP ${error.status}`;
  const requestId = context.requestId ? ` · 요청 ID ${context.requestId}` : "";
  return `${message} [${context.method} ${context.path} · ${response} · ${error.code}${requestId}]`;
}

type DeveloperErrorArea = Readonly<{
  stage: string;
  check: string;
}>;

function appendDeveloperDiagnostic(
  message: string,
  error: unknown,
  developerMode: boolean
): string {
  if (!developerMode) return message;

  const apiError = error instanceof ApiClientError ? error : undefined;
  const area = getDeveloperErrorArea(apiError?.requestContext?.path);
  const cause = sanitizeDeveloperCause(error instanceof Error ? error.message : "알 수 없는 오류");

  return `${message} 개발자 진단 — 실패 단계: ${area.stage} · 서버 원인: ${cause} · 확인: ${area.check}`;
}

function getDeveloperErrorArea(path: string | undefined): DeveloperErrorArea {
  const normalizedPath = path?.toLowerCase() ?? "";

  if (normalizedPath.endsWith("/deployments/prepare")) {
    return {
      stage: "배포 범위 및 타깃 확인",
      check:
        "이 단계에서는 worker가 시작되지 않습니다. worker 로그 대신 저장된 ProjectDraft의 ECS 리소스, 프로젝트 배포 타깃의 빌드 설정, 선택한 AWS 연결의 일치 여부를 확인하세요."
    };
  }

  if (normalizedPath.includes("live-observation")) {
    return {
      stage: "실시간 서비스 관측",
      check:
        "Deployment output과 관측 manifest, HTTPS Output URL, LIVE_OBSERVATION_* 설정, Redis 연결, AWS 관측 권한을 확인하세요."
    };
  }

  if (
    normalizedPath.includes("git-cicd") ||
    normalizedPath.includes("release-runs") ||
    normalizedPath.includes("infrastructure-runs")
  ) {
    return {
      stage: "GitHub CI/CD 실행",
      check:
        "GitHub App installation과 repository 권한, Actions variables, OIDC claim, pipeline run DB 기록, ECS worker와 CodeBuild 실행 로그를 확인하세요."
    };
  }

  if (normalizedPath.includes("build-environment") || normalizedPath.includes("codeconnection")) {
    return {
      stage: "AWS 빌드 환경 준비",
      check:
        "AWS에서 CodeBuild project와 service role이 존재하는지, Role trust/policy와 Permissions Boundary, CodeConnections 상태, AWS Connector for GitHub 설치 및 대상 Repository 권한을 확인하세요."
    };
  }

  if (normalizedPath.includes("deployment-target")) {
    return {
      stage: "프로젝트 배포 타깃 저장",
      check:
        "RDS의 deployment target, verified AWS connection, Repository build evidence, ECS/S3/CloudFront runtime 좌표를 확인하세요."
    };
  }

  if (normalizedPath.includes("deployments")) {
    return {
      stage: "Terraform 및 애플리케이션 배포",
      check:
        "Deployment의 failureStage·errorSummary와 worker 로그를 먼저 보고 Terraform state/output, CodeBuild, ECS target health, S3와 CloudFront 결과를 확인하세요."
    };
  }

  if (normalizedPath.includes("aws-connections") || normalizedPath.includes("/aws/connections")) {
    return {
      stage: "AWS 계정 연결",
      check:
        "CloudFormation Stack 상태와 생성 Role ARN, Account ID, Trust Policy의 Principal·External ID, 필요한 IAM 권한을 확인하세요."
    };
  }

  if (
    normalizedPath.includes("source-repositories") ||
    normalizedPath.includes("repository-analysis") ||
    normalizedPath.includes("github")
  ) {
    return {
      stage: "GitHub Repository 연결 및 분석",
      check:
        "GitHub App installation 대상 계정·Repository, App 권한, 사용자 OAuth 승인, 분석 commit SHA와 Repository 접근 로그를 확인하세요."
    };
  }

  if (normalizedPath.includes("terraform")) {
    return {
      stage: "Terraform 생성 및 검증",
      check:
        "검증 결과의 파일·행 번호와 생성 Terraform, 승인 snapshot, terraform init/validate/plan stderr를 확인하세요."
    };
  }

  if (normalizedPath.includes("/ai/") || normalizedPath.includes("architecture")) {
    return {
      stage: "AI 아키텍처 생성 및 검증",
      check:
        "요청 payload와 모델 provider 설정, timeout·quota, API 서버의 동일 request ID 로그와 반환 스키마 검증 오류를 확인하세요."
    };
  }

  return {
    stage: "SketchCatch API 요청",
    check:
      "브라우저 Network 응답과 API 서버의 동일 request ID 로그, RDS 연결, 해당 route의 입력 검증 및 외부 서비스 응답을 확인하세요."
  };
}

function sanitizeDeveloperCause(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim() || "구체 원인이 전달되지 않았습니다.";
  const masked = normalized
    .replace(
      /\b(?:authorization|password|token|secret|client_secret|private_key|database_url|external_id)\b\s*[:=]\s*[^\s,}\]]+/gi,
      "[REDACTED]"
    )
    .replace(/\/\/([^:\s/@]+):([^@\s]+)@/g, "//[REDACTED]@[REDACTED]");
  return masked.length > 800 ? `${masked.slice(0, 797)}...` : masked;
}

function getKoreanApiMessage(error: ApiClientError, fallbackMessage: string): string {
  if (error.code === "github_app_permission_required") {
    if (error.message.includes("environments or Actions variables")) {
      return "GitHub App 권한이 부족해서 repository settings를 적용할 수 없습니다. GitHub App repository permissions에서 Administration 권한과 Variables 권한을 Read and write로 승인한 뒤 다시 시도해주세요.";
    }

    if (error.message.includes("credentials are not configured")) {
      return "GitHub App 설정이 서버에 완전히 연결되지 않았습니다. 운영 환경의 GitHub App ID와 private key 설정을 확인해주세요.";
    }

    return "GitHub App 권한이 부족해서 PR을 만들 수 없습니다. GitHub App repository permissions에서 Contents, Pull requests, Workflows 권한을 Read and write로 승인한 뒤 다시 시도해주세요.";
  }

  const translatedMessage = API_MESSAGE_TRANSLATIONS[error.message];

  if (translatedMessage) {
    return translatedMessage;
  }

  if (containsKorean(error.message)) {
    return error.message;
  }

  return DEFAULT_API_ERROR_MESSAGES[error.code] ?? fallbackMessage;
}

function containsKorean(value: string): boolean {
  return /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(value);
}

function setCsrfHeader(headers: Headers, method: string | undefined): void {
  const normalizedMethod = (method ?? "GET").toUpperCase();

  if (
    normalizedMethod === "GET" ||
    normalizedMethod === "HEAD" ||
    headers.has(CSRF_TOKEN_HEADER_NAME)
  ) {
    return;
  }

  const csrfToken = readCookie(CSRF_TOKEN_COOKIE_NAME);

  if (csrfToken) {
    headers.set(CSRF_TOKEN_HEADER_NAME, csrfToken);
  }
}

function getCsrfHeader(): Record<string, string> {
  const csrfToken = readCookie(CSRF_TOKEN_COOKIE_NAME);

  return csrfToken ? { [CSRF_TOKEN_HEADER_NAME]: csrfToken } : {};
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const cookies = document.cookie ? document.cookie.split(";") : [];

  for (const cookie of cookies) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");

    if (rawName === name) {
      const rawValue = rawValueParts.join("=");

      try {
        return rawValue ? decodeURIComponent(rawValue) : null;
      } catch {
        return null;
      }
    }
  }

  return null;
}

export function buildApiUrl(path: string): string {
  const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL).replace(
    /\/+$/,
    ""
  );
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

function formatLockedUntil(lockedUntil: string): string {
  const date = new Date(lockedUntil);

  if (Number.isNaN(date.getTime())) {
    return lockedUntil;
  }

  return date.toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}
