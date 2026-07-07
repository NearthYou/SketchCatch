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
const DEFAULT_API_ERROR_MESSAGES = {
  bad_request: "입력값 형식을 확인해주세요.",
  conflict: "이미 사용 중인 정보입니다.",
  internal_server_error: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  not_found: "요청한 정보를 찾을 수 없습니다.",
  too_many_requests: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  unauthorized: "인증이 필요합니다."
} satisfies Partial<Record<ApiErrorCode, string>>;
const API_MESSAGE_TRANSLATIONS: Partial<Record<string, string>> = {
  "API request failed": "요청 처리 중 오류가 발생했습니다.",
  "Authentication required": "인증이 필요합니다.",
  "AWS account ID must be 12 digits": "AWS Account ID는 12자리 숫자여야 합니다.",
  "AWS account is already connected": "이미 연결된 AWS Account입니다.",
  "AWS Role account mismatch": "입력한 Account ID와 AWS에서 확인된 Account가 다릅니다.",
  "AWS Role connection test failed":
    "AWS Role 연결 검증에 실패했습니다. CloudFormation Stack 생성 완료 후 잠시 기다렸다가 다시 시도하고, Account ID와 Trust Policy를 확인해주세요.",
  "AWS Role external ID requirement could not be verified":
    "AWS Role의 External ID 조건을 확인하지 못했습니다. CloudFormation Stack의 Trust Policy에 SketchCatch External ID 조건이 있는지 확인해주세요.",
  "AWS Role trust policy must require external ID":
    "AWS Role Trust Policy에 SketchCatch External ID 조건이 필요합니다.",
  "Email already exists": "이미 사용 중인 이메일입니다.",
  "Refresh token is invalid or expired": "로그인 세션이 만료되었습니다. 다시 로그인해주세요.",
  "Route not found": "요청한 API 경로를 찾을 수 없습니다.",
  "Too many failed login attempts. Try again later.": "로그인 시도가 잠시 차단되었습니다. 잠시 후 다시 시도해주세요.",
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

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly lockedUntil?: string;

  constructor(status: number, response: ApiErrorResponse | LoginLockedErrorResponse) {
    super(response.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = response.error;

    if ("lockedUntil" in response) {
      this.lockedUntil = response.lockedUntil;
    }
  }
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { auth = false, body, headers, retryOnUnauthorized = true, ...requestInit } = options;
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
    throw createConnectionError();
  }

  if (response.status === 401 && auth && retryOnUnauthorized) {
    const latestSession = readStoredAuthSession();

    if (
      requestAccessToken &&
      latestSession &&
      latestSession.accessToken !== requestAccessToken
    ) {
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
    throw await toApiClientError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await readJson(response)) as T;
}

export function getApiErrorMessage(error: unknown, fallbackMessage: string): string {
  if (!(error instanceof ApiClientError)) {
    return fallbackMessage;
  }

  if (error.status === 0) {
    return error.message || fallbackMessage;
  }

  if (error.code === "too_many_requests" && error.lockedUntil) {
    return `로그인 시도가 잠시 차단되었습니다. ${formatLockedUntil(error.lockedUntil)} 이후 다시 시도해주세요.`;
  }

  return getKoreanApiMessage(error, fallbackMessage);
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
    throw createConnectionError();
  }

  if (response.status === 400 || response.status === 401) {
    clearStoredAuthSession();
    return null;
  }

  if (!response.ok) {
    throw await toApiClientError(response);
  }

  const authResponse = (await readJson(response)) as AuthResponse;
  writeStoredAuthSession(authResponse.session);

  return authResponse.session;
}

async function toApiClientError(response: Response): Promise<ApiClientError> {
  const responseBody = await readJson(response);

  if (isApiErrorResponse(responseBody)) {
    return new ApiClientError(response.status, responseBody);
  }

  return new ApiClientError(response.status, {
    error: response.status >= 500 ? "internal_server_error" : "bad_request",
    message: "요청 처리 중 오류가 발생했습니다."
  });
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

function createConnectionError(): ApiClientError {
  return new ApiClientError(0, {
    error: "internal_server_error",
    message: API_CONNECTION_ERROR_MESSAGE
  });
}

function getKoreanApiMessage(error: ApiClientError, fallbackMessage: string): string {
  if (error.code === "github_oauth_required") {
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

  if (normalizedMethod === "GET" || normalizedMethod === "HEAD" || headers.has(CSRF_TOKEN_HEADER_NAME)) {
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
