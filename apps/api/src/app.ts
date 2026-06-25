import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { ApiErrorCode, ApiErrorResponse } from "@sketchcatch/types";
import type { DatabaseClient } from "./db/client.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerProjectRoutes } from "./routes/projects.js";

type HttpError = Error & {
  statusCode?: number;
  errorCode?: ApiErrorCode;
};

export type BuildAppOptions = {
  getDatabaseClient?: () => DatabaseClient;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test"
  });

  app.setErrorHandler((error, _request, reply) => {
    const typedError = error as HttpError;
    const statusCode = error instanceof ZodError ? 400 : (typedError.statusCode ?? 500);
    const response: ApiErrorResponse = {
      error: getErrorCode(statusCode, typedError.errorCode),
      message: getErrorMessage(error, statusCode, typedError.message)
    };

    if (statusCode >= 500) {
      app.log.error(error);
    }

    reply.status(statusCode).send(response);
  });

  app.setNotFoundHandler((_request, reply) => {
    const response: ApiErrorResponse = {
      error: "not_found",
      message: "요청한 API 경로를 찾을 수 없습니다."
    };

    return reply.status(404).send(response);
  });

  app.register(registerHealthRoutes);
  app.register(registerAuthRoutes, {
    prefix: "/api",
    getDatabaseClient: options.getDatabaseClient
  });
  app.register(registerProjectRoutes, {
    prefix: "/api",
    getDatabaseClient: options.getDatabaseClient
  });

  return app;
}

function getErrorCode(statusCode: number, explicitErrorCode?: ApiErrorCode): ApiErrorCode {
  if (explicitErrorCode) {
    return explicitErrorCode;
  }

  if (statusCode >= 500) {
    return "internal_server_error";
  }

  return (
    {
      400: "bad_request",
      401: "unauthorized",
      404: "not_found",
      409: "conflict",
      429: "too_many_requests"
    } satisfies Partial<Record<number, ApiErrorCode>>
  )[statusCode] ?? "bad_request";
}

function getErrorMessage(error: unknown, statusCode: number, message?: string): string {
  if (error instanceof ZodError) {
    return "입력값 형식을 확인해주세요.";
  }

  if (statusCode >= 500) {
    return "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  }

  if (message && containsKorean(message)) {
    return message;
  }

  return getDefaultErrorMessage(statusCode);
}

function getDefaultErrorMessage(statusCode: number): string {
  return (
    {
      400: "요청 형식이 올바르지 않습니다.",
      401: "인증이 필요합니다.",
      404: "요청한 정보를 찾을 수 없습니다.",
      409: "이미 존재하는 값입니다.",
      429: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
    } satisfies Partial<Record<number, string>>
  )[statusCode] ?? "요청 처리 중 오류가 발생했습니다.";
}

function containsKorean(value: string): boolean {
  return /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(value);
}
