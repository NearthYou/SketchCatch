import type { AwsImportAccessCommandResponse } from "@sketchcatch/types";
import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { requireActiveUserId } from "../auth/current-user.js";
import {
  createPostgresAwsConnectionRepository
} from "../aws-connections/aws-connection-service.js";
import { createAwsImportAccessGateway } from "../aws-connections/aws-import-access-gateway.js";
import {
  createPostgresAwsImportAccessRepository
} from "../aws-connections/aws-import-access-repository.js";
import {
  AwsImportAccessApprovalError,
  AwsImportAccessLeaseError,
  AwsImportAccessNotFoundError,
  AwsImportAccessOperationError,
  createAwsImportAccessService,
  type AwsImportAccessApplyPolicyInput,
  type AwsImportAccessOwnerInput,
  type AwsImportAccessPreviewResponse,
  type AwsImportAccessService
} from "../aws-connections/aws-import-access-service.js";
import { getRuntimeEnv } from "../config/env.js";
import { type DatabaseClient, getDatabaseClient } from "../db/client.js";

const paramsSchema = z.object({ connectionId: z.uuid() });
const applyBodySchema = z.object({
  approvalId: z.string().min(1).max(256),
  operationId: z.uuid()
}).strict();
const emptyCommandBodySchema = z.object({}).strict().optional();

export type AwsImportAccessRouteService = Pick<
  AwsImportAccessService,
  | "getState"
  | "prepareManager"
  | "checkManager"
  | "previewPolicy"
  | "applyPolicy"
  | "checkImportReads"
  | "prepareCleanup"
  | "checkCleanup"
>;

export type AwsImportAccessRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  createService?: (db: DatabaseClient["db"]) => AwsImportAccessRouteService;
};

/** gg: 여덟 command route는 인증·소유권을 거친 뒤 safe DTO만 응답합니다. */
export async function registerAwsImportAccessRoutes(
  app: FastifyInstance,
  options: AwsImportAccessRouteOptions = {}
): Promise<void> {
  const getClient = options.getDatabaseClient ?? getDatabaseClient;

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: "bad_request", message: "요청 값을 확인해 주세요." });
    }
    if (isAuthenticationError(error)) {
      return reply.status(401).send({ error: "unauthorized", message: "인증이 필요합니다." });
    }
    if (
      error instanceof AwsImportAccessNotFoundError ||
      (error instanceof Error && error.name === "AwsImportAccessNotFoundError")
    ) {
      return reply.status(404).send({ error: "not_found", message: "AWS 연결을 찾을 수 없습니다." });
    }
    if (error instanceof AwsImportAccessApprovalError || error instanceof AwsImportAccessLeaseError) {
      return reply.status(409).send({ error: "conflict", message: error.message });
    }
    if (error instanceof AwsImportAccessOperationError) {
      return reply.status(502).send({ error: "bad_gateway", message: error.message });
    }
    reply.request.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "AWS import access request failed"
    );
    return reply.status(500).send({
      error: "internal_server_error",
      message: "AWS 가져오기 권한 요청을 처리하지 못했습니다."
    });
  });

  const ownerCommand = (
    path: string,
    command: keyof Pick<
      AwsImportAccessRouteService,
      "getState" | "prepareManager" | "checkManager" | "checkImportReads" | "prepareCleanup" | "checkCleanup"
    >,
    method: "GET" | "POST"
  ) => {
    app.route({
      method,
      url: path,
      // gg: HTTP handler는 입력과 인증만 만들고 상태 전이는 service에 맡깁니다.
      handler: async (request, reply) => {
        const { connectionId } = paramsSchema.parse(request.params);
        if (method === "POST") emptyCommandBodySchema.parse(request.body);
        const { service, userId } = await createRequestService(request, getClient, options);
        const result = await service[command]({
          connectionId,
          accessContext: { kind: "user", userId }
        } as AwsImportAccessOwnerInput);
        return reply.status(200).send(toSafeResponse(result));
      }
    });
  };

  ownerCommand("/aws/connections/:connectionId/import-access", "getState", "GET");
  ownerCommand(
    "/aws/connections/:connectionId/import-access/manager/prepare",
    "prepareManager",
    "POST"
  );
  ownerCommand(
    "/aws/connections/:connectionId/import-access/manager/check",
    "checkManager",
    "POST"
  );

  app.post(
    "/aws/connections/:connectionId/import-access/policy/preview",
    // gg: preview의 single-use secret만 이 응답에서 한 번 전달합니다.
    async (request, reply) => {
      const { connectionId } = paramsSchema.parse(request.params);
      emptyCommandBodySchema.parse(request.body);
      const { service, userId } = await createRequestService(request, getClient, options);
      const result = await service.previewPolicy({
        connectionId,
        accessContext: { kind: "user", userId }
      });
      return reply.status(200).send(toSafeResponse(result));
    }
  );

  app.post(
    "/aws/connections/:connectionId/import-access/policy/apply",
    // gg: apply body는 서버 발급 approval와 operation ID만 받고 AWS request 필드는 받지 않습니다.
    async (request, reply) => {
      const { connectionId } = paramsSchema.parse(request.params);
      const body = applyBodySchema.parse(request.body);
      const { service, userId } = await createRequestService(request, getClient, options);
      const input: AwsImportAccessApplyPolicyInput = {
        connectionId,
        accessContext: { kind: "user", userId },
        approvalId: body.approvalId,
        operationId: body.operationId
      };
      const result = await service.applyPolicy(input);
      return reply.status(200).send(toSafeResponse(result));
    }
  );

  ownerCommand("/aws/connections/:connectionId/import-access/check", "checkImportReads", "POST");
  ownerCommand(
    "/aws/connections/:connectionId/import-access/cleanup/prepare",
    "prepareCleanup",
    "POST"
  );
  ownerCommand(
    "/aws/connections/:connectionId/import-access/cleanup/check",
    "checkCleanup",
    "POST"
  );
}

/** gg: request마다 같은 DB client로 인증과 owner-scoped repositories를 만듭니다. */
async function createRequestService(
  request: Parameters<typeof requireActiveUserId>[0],
  getClient: () => DatabaseClient,
  options: AwsImportAccessRouteOptions
): Promise<{ service: AwsImportAccessRouteService; userId: string }> {
  const client = getClient();
  const userId = await requireActiveUserId(request, () => client);
  const service = options.createService?.(client.db) ?? createDefaultService(client);
  return { service, userId };
}

/** gg: runtime service는 private bucket 설정과 기존 connection repository를 공유합니다. */
function createDefaultService(client: DatabaseClient): AwsImportAccessRouteService {
  const templateBucketName = getRuntimeEnv().s3BucketName;
  if (!templateBucketName) {
    throw new AwsImportAccessOperationError("Template 저장소 설정을 확인해 주세요.");
  }
  return createAwsImportAccessService({
    connectionRepository: createPostgresAwsConnectionRepository(client.db),
    repository: createPostgresAwsImportAccessRepository(client.db),
    gateway: createAwsImportAccessGateway({ templateBucketName }),
    templateBucketName
  });
}

type SafeAwsImportAccessResponse = AwsImportAccessCommandResponse & {
  connectionId: string;
  approvalId?: string;
};

/** gg: 내부 identity와 provider 진단은 버리고 shared safe state만 HTTP에 투영합니다. */
function toSafeResponse(
  result: AwsImportAccessCommandResponse | AwsImportAccessPreviewResponse
): SafeAwsImportAccessResponse {
  return {
    connectionId: result.state.connectionId,
    operationId: result.operationId,
    state: result.state,
    nextAction: result.nextAction,
    ...(result.consoleUrl ? { consoleUrl: result.consoleUrl } : {}),
    ...(result.managerTemplateUrl
      ? { managerTemplateUrl: result.managerTemplateUrl }
      : {}),
    ...("approvalId" in result ? { approvalId: result.approvalId } : {})
  };
}

/** gg: auth layer의 표준 오류만 401로 바꾸고 다른 오류와 섞지 않습니다. */
function isAuthenticationError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "statusCode" in error &&
    error.statusCode === 401;
}
