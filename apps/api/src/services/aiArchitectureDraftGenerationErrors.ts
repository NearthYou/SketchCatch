import type { ApiErrorCode } from "@sketchcatch/types";

export type ArchitectureDraftGenerationErrorKind =
  | "requirements_unsatisfied"
  | "provider_response_invalid"
  | "provider_unavailable"
  | "internal_generation_error";

const ERROR_CONTRACT = {
  requirements_unsatisfied: {
    statusCode: 422,
    errorCode: "unprocessable_entity",
    message: "요구사항을 모두 충족하는 아키텍처를 생성하지 못했습니다. 조건을 확인한 뒤 다시 시도해주세요."
  },
  provider_response_invalid: {
    statusCode: 502,
    errorCode: "bad_gateway",
    message: "Amazon Q 응답을 유효한 아키텍처로 해석하지 못했습니다. 다시 시도해주세요."
  },
  provider_unavailable: {
    statusCode: 503,
    errorCode: "service_unavailable",
    message: "Amazon Q 아키텍처 생성 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요."
  },
  internal_generation_error: {
    statusCode: 500,
    errorCode: "internal_server_error",
    message: "아키텍처 조립 중 내부 오류가 발생했습니다."
  }
} as const satisfies Record<
  ArchitectureDraftGenerationErrorKind,
  { readonly statusCode: number; readonly errorCode: ApiErrorCode; readonly message: string }
>;

export class ArchitectureDraftGenerationError extends Error {
  readonly errorCode: ApiErrorCode;
  readonly exposeMessage = true;
  readonly issues: readonly string[];
  readonly kind: ArchitectureDraftGenerationErrorKind;
  readonly statusCode: number;

  constructor(
    cause: unknown,
    kind: ArchitectureDraftGenerationErrorKind = "provider_unavailable",
    issues: readonly string[] = []
  ) {
    const contract = ERROR_CONTRACT[kind];
    super(contract.message, { cause });
    this.name = "ArchitectureDraftGenerationError";
    this.errorCode = contract.errorCode;
    this.issues = [...issues];
    this.kind = kind;
    this.statusCode = contract.statusCode;
  }
}

export function createRequirementsUnsatisfiedError(
  issues: readonly string[],
  cause?: unknown
): ArchitectureDraftGenerationError {
  return new ArchitectureDraftGenerationError(
    cause ?? new Error(issues.join(" ")),
    "requirements_unsatisfied",
    issues
  );
}

export function createProviderResponseInvalidError(cause: unknown): ArchitectureDraftGenerationError {
  return new ArchitectureDraftGenerationError(cause, "provider_response_invalid");
}

export function createProviderUnavailableError(cause: unknown): ArchitectureDraftGenerationError {
  return new ArchitectureDraftGenerationError(cause, "provider_unavailable");
}

export function createInternalArchitectureGenerationError(cause: unknown): ArchitectureDraftGenerationError {
  return new ArchitectureDraftGenerationError(cause, "internal_generation_error");
}
