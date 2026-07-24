import { createHash } from "node:crypto";
import {
  GetFunctionCodeSigningConfigCommand,
  GetFunctionConcurrencyCommand,
  GetFunctionCommand,
  GetPolicyCommand,
  LambdaClient,
  ListAliasesCommand,
  ListFunctionsCommand,
  ListTagsCommand,
  ListVersionsByFunctionCommand,
  type AliasConfiguration,
  type FunctionConfiguration,
  type GetFunctionCodeSigningConfigCommandOutput,
  type GetFunctionConcurrencyCommandOutput,
  type GetFunctionCommandOutput,
  type GetPolicyCommandOutput,
  type ListAliasesCommandOutput,
  type ListFunctionsCommandOutput,
  type ListTagsCommandOutput,
  type ListVersionsByFunctionCommandOutput
} from "@aws-sdk/client-lambda";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";
import type { AwsDiscoveredResourceRecord } from "./aws-provider-adapter.js";

export type AwsLambdaDetailReadClient = {
  send(command: object): Promise<unknown>;
};

export type AwsLambdaDetailReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsLambdaDetailReadClient;

export type AwsLambdaDetailFailureOutcome =
  | "permission_denied"
  | "expired_credential"
  | "invalid_region"
  | "not_configured"
  | "throttled"
  | "transient";

export type AwsLambdaDetailFailure = {
  readonly providerResourceType: string;
  readonly providerResourceId?: string;
  readonly detail: string;
  readonly outcome: AwsLambdaDetailFailureOutcome;
};

export type AwsLambdaServerOnlyDetail =
  | {
      readonly providerResourceId: string;
      readonly resourceKind: "function";
      readonly terraformImportId: string;
      readonly functionArn: string;
      readonly functionConfiguration: FunctionConfiguration;
      readonly codeSource: Readonly<Record<string, unknown>>;
      readonly tags: Readonly<Record<string, string>>;
      readonly environmentVariables: Readonly<Record<string, string>>;
      readonly codeSigningConfigArn?: string;
      readonly reservedConcurrentExecutions?: number;
      readonly resourcePolicyDocument?: unknown;
    }
  | {
      readonly providerResourceId: string;
      readonly resourceKind: "permission";
      readonly terraformImportId: string;
      readonly functionProviderResourceId: string;
      readonly statementId: string;
      readonly statement: Readonly<Record<string, unknown>>;
    };

export type AwsDetailedLambdaReadResult = {
  readonly records: AwsDiscoveredResourceRecord[];
  readonly serverOnlyDetails: AwsLambdaServerOnlyDetail[];
  readonly failures: AwsLambdaDetailFailure[];
};

type SafePageResult<T> = {
  readonly items: T[];
  readonly complete: boolean;
  readonly failureOutcome?: AwsLambdaDetailFailureOutcome;
};

type LambdaPolicyReadResult =
  | {
      readonly complete: true;
      readonly present: false;
      readonly statements: readonly LambdaPermissionStatement[];
    }
  | {
      readonly complete: true;
      readonly present: true;
      readonly document: unknown;
      readonly statements: readonly LambdaPermissionStatement[];
    }
  | {
      readonly complete: false;
      readonly present: "unknown";
      readonly statements: readonly LambdaPermissionStatement[];
      readonly failureOutcome: AwsLambdaDetailFailureOutcome;
    };

type LambdaPermissionStatement = {
  readonly statementId: string | null;
  readonly statement: Readonly<Record<string, unknown>>;
};

type LambdaPermissionAssessment = {
  readonly qualifier: string | null;
  readonly missingDetails: readonly string[];
};

const LAMBDA_DETAIL_READ_CONCURRENCY = 8;

/**
 * gg: Lambda의 상세 설정을 읽되 환경값·정책 문서·임시 code URL은 공개 record와 완전히 분리합니다.
 */
export async function readDetailedLambdaResources(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsLambdaDetailReadClientFactory = createDefaultLambdaDetailReadClient
): Promise<AwsDetailedLambdaReadResult> {
  const client = createClient(region, credentials);
  const inventory = await collectSafeLambdaPages<FunctionConfiguration>(async (marker) => {
    const response = await sendLambda<ListFunctionsCommandOutput>(
      client,
      new ListFunctionsCommand({ Marker: marker })
    );
    return { items: response.Functions ?? [], nextMarker: response.NextMarker };
  });
  const details = await mapWithConcurrency(
    inventory.items,
    LAMBDA_DETAIL_READ_CONCURRENCY,
    (lambdaFunction) => readDetailedLambdaFunction(lambdaFunction, region, client)
  );
  const records = details
    .flatMap((detail) => detail.records)
    .map((record) =>
      inventory.complete ? record : addLambdaIncompleteDetail(record, "functionInventory")
    );
  const failures: AwsLambdaDetailFailure[] = [
    ...(inventory.complete
      ? []
      : [
          {
            providerResourceType: "AWS::Lambda::Function",
            detail: "functionInventory",
            outcome: inventory.failureOutcome ?? "transient"
          } satisfies AwsLambdaDetailFailure
        ]),
    ...details.flatMap((detail) => detail.failures)
  ];

  return {
    records,
    serverOnlyDetails: details.flatMap((detail) => detail.serverOnlyDetails),
    failures
  };
}

/** gg: Function별 상세·tags·policy·alias·version이 모두 확인될 때만 관리 가능 상태를 만듭니다. */
async function readDetailedLambdaFunction(
  listedFunction: FunctionConfiguration,
  fallbackRegion: string,
  client: AwsLambdaDetailReadClient
): Promise<{
  records: AwsDiscoveredResourceRecord[];
  serverOnlyDetails: AwsLambdaServerOnlyDetail[];
  failures: AwsLambdaDetailFailure[];
}> {
  const listedArn = nonEmptyString(listedFunction.FunctionArn);
  const listedName = nonEmptyString(listedFunction.FunctionName);
  if (!listedArn || !listedName) {
    return {
      records: [],
      serverOnlyDetails: [],
      failures: [
        {
          providerResourceType: "AWS::Lambda::Function",
          detail: "functionIdentity",
          outcome: "transient"
        }
      ]
    };
  }

  const [functionDetail, concurrency, codeSigningConfig, tags, policy, aliases, versions] =
    await Promise.all([
      readLambdaDetail<GetFunctionCommandOutput>(
        client,
        new GetFunctionCommand({ FunctionName: listedName })
      ),
      readLambdaDetail<GetFunctionConcurrencyCommandOutput>(
        client,
        new GetFunctionConcurrencyCommand({ FunctionName: listedName })
      ),
      readLambdaDetail<GetFunctionCodeSigningConfigCommandOutput>(
        client,
        new GetFunctionCodeSigningConfigCommand({ FunctionName: listedName })
      ),
      readLambdaDetail<ListTagsCommandOutput>(client, new ListTagsCommand({ Resource: listedArn })),
      readLambdaResourcePolicy(client, listedName),
      collectSafeLambdaPages<AliasConfiguration>(async (marker) => {
        const response = await sendLambda<ListAliasesCommandOutput>(
          client,
          new ListAliasesCommand({ FunctionName: listedName, Marker: marker })
        );
        return { items: response.Aliases ?? [], nextMarker: response.NextMarker };
      }),
      collectSafeLambdaPages<FunctionConfiguration>(async (marker) => {
        const response = await sendLambda<ListVersionsByFunctionCommandOutput>(
          client,
          new ListVersionsByFunctionCommand({ FunctionName: listedName, Marker: marker })
        );
        return { items: response.Versions ?? [], nextMarker: response.NextMarker };
      })
    ]);

  const exactConfiguration = {
    ...listedFunction,
    ...(functionDetail.complete ? functionDetail.value.Configuration : {})
  } satisfies FunctionConfiguration;
  const functionArn = nonEmptyString(exactConfiguration.FunctionArn) ?? listedArn;
  const functionName = nonEmptyString(exactConfiguration.FunctionName) ?? listedName;
  const functionProviderResourceId = createOpaqueAwsProviderResourceId(
    "AWS::Lambda::Function",
    functionArn
  );
  const environmentVariables = toStringRecord(exactConfiguration.Environment?.Variables);
  const environmentReadComplete = exactConfiguration.Environment?.Error === undefined;
  const reservedConcurrentExecutions =
    concurrency.complete && typeof concurrency.value.ReservedConcurrentExecutions === "number"
      ? concurrency.value.ReservedConcurrentExecutions
      : undefined;
  const codeSigningConfigArn = codeSigningConfig.complete
    ? (nonEmptyString(codeSigningConfig.value.CodeSigningConfigArn) ?? undefined)
    : undefined;
  const serverOnlyCodeSource = functionDetail.complete
    ? compactRecord({
        repositoryType: functionDetail.value.Code?.RepositoryType,
        imageUri: functionDetail.value.Code?.ImageUri,
        resolvedImageUri: functionDetail.value.Code?.ResolvedImageUri,
        sourceKmsKeyArn: functionDetail.value.Code?.SourceKMSKeyArn
      })
    : {};
  const packageTypeReady = exactConfiguration.PackageType === "Image";
  const codeSourceReady = nonEmptyString(serverOnlyCodeSource["imageUri"]) !== null;
  const aliasesPresent = aliases.items.length > 0;
  const publishedVersions = uniqueInOrder(
    versions.items.flatMap((version) => {
      const versionName = nonEmptyString(version.Version);
      return versionName && versionName !== "$LATEST" ? [versionName] : [];
    })
  );
  const lifecycleStateReady = exactConfiguration.State === "Active";
  const lastUpdateReady = exactConfiguration.LastUpdateStatus === "Successful";
  const imageConfigurationReady = exactConfiguration.ImageConfigResponse?.Error === undefined;
  const unmappedPermissionStatementCount = policy.statements.filter(
    (statement) => statement.statementId === null
  ).length;
  const unsupportedProjectionDetails = getUnsupportedLambdaProjectionDetails(
    exactConfiguration,
    functionName,
    codeSigningConfigArn !== undefined
  );
  const missingDetails = uniqueSorted([
    ...(functionDetail.complete ? [] : ["function"]),
    ...(concurrency.complete ? [] : ["reservedConcurrency"]),
    ...(codeSigningConfig.complete ? [] : ["codeSigningConfigRead"]),
    ...(tags.complete ? [] : ["tags"]),
    ...(policy.complete ? [] : ["resourcePolicy"]),
    ...(unmappedPermissionStatementCount > 0 ? ["unmappedPermissions"] : []),
    ...(aliases.complete ? [] : ["aliasesRead"]),
    ...(versions.complete ? [] : ["versionsRead"]),
    ...(environmentReadComplete ? [] : ["environment"]),
    ...(packageTypeReady ? [] : ["packageType"]),
    ...(packageTypeReady && !codeSourceReady ? ["codeSource"] : []),
    ...(aliasesPresent ? ["aliases"] : []),
    ...(publishedVersions.length > 0 ? ["publishedVersions"] : []),
    ...(lifecycleStateReady ? [] : ["lifecycleState"]),
    ...(lastUpdateReady ? [] : ["lastUpdateStatus"]),
    ...(imageConfigurationReady ? [] : ["imageConfiguration"]),
    ...unsupportedProjectionDetails
  ]);
  const publicTags = toPublicLambdaTags(tags.complete ? tags.value.Tags : undefined);
  const relationships = createLambdaRelationships(exactConfiguration);
  const functionRecord: AwsDiscoveredResourceRecord = {
    providerResourceType: "AWS::Lambda::Function",
    providerResourceId: functionProviderResourceId,
    displayName: functionName,
    region: parseArnRegion(functionArn) ?? fallbackRegion,
    config: compactRecord({
      functionName,
      description: toSafePublicString(exactConfiguration.Description),
      packageType: exactConfiguration.PackageType,
      runtime: exactConfiguration.Runtime,
      handler: exactConfiguration.Handler,
      architectures: exactConfiguration.Architectures,
      memorySize: exactConfiguration.MemorySize,
      timeout: exactConfiguration.Timeout,
      ephemeralStorageSize: exactConfiguration.EphemeralStorage?.Size,
      tracingMode: exactConfiguration.TracingConfig?.Mode,
      state: exactConfiguration.State,
      lastUpdateStatus: exactConfiguration.LastUpdateStatus,
      codeSize: exactConfiguration.CodeSize,
      version: exactConfiguration.Version,
      vpcId: exactConfiguration.VpcConfig?.VpcId,
      subnetIds: exactConfiguration.VpcConfig?.SubnetIds ?? [],
      securityGroupIds: exactConfiguration.VpcConfig?.SecurityGroupIds ?? [],
      ipv6AllowedForDualStack: exactConfiguration.VpcConfig?.Ipv6AllowedForDualStack,
      layerCount: exactConfiguration.Layers?.length ?? 0,
      hasKmsKey: nonEmptyString(exactConfiguration.KMSKeyArn) !== null,
      hasDeadLetterTarget: nonEmptyString(exactConfiguration.DeadLetterConfig?.TargetArn) !== null,
      fileSystemConfigCount: exactConfiguration.FileSystemConfigs?.length ?? 0,
      loggingConfig: exactConfiguration.LoggingConfig
        ? compactRecord({
            logGroup: exactConfiguration.LoggingConfig.LogGroup,
            logFormat: exactConfiguration.LoggingConfig.LogFormat,
            applicationLogLevel: exactConfiguration.LoggingConfig.ApplicationLogLevel,
            systemLogLevel: exactConfiguration.LoggingConfig.SystemLogLevel
          })
        : undefined,
      hasImageConfig: exactConfiguration.ImageConfigResponse?.ImageConfig !== undefined,
      snapStart: exactConfiguration.SnapStart
        ? compactRecord({
            applyOn: exactConfiguration.SnapStart.ApplyOn,
            optimizationStatus: exactConfiguration.SnapStart.OptimizationStatus
          })
        : undefined,
      codeSourceType: packageTypeReady ? "image" : "zip",
      codeSourceReady,
      environmentVariableNames: Object.keys(environmentVariables).sort(),
      environmentValuesRedacted: true,
      environmentReadComplete,
      hasReservedConcurrency: concurrency.complete
        ? reservedConcurrentExecutions !== undefined
        : undefined,
      reservedConcurrencyReadComplete: concurrency.complete,
      hasCodeSigningConfig: codeSigningConfig.complete
        ? codeSigningConfigArn !== undefined
        : undefined,
      codeSigningConfigReadComplete: codeSigningConfig.complete,
      resourcePolicyPresent: policy.present === true,
      resourcePolicyRedacted: policy.present === true,
      resourcePolicyStatementCount: policy.statements.length,
      unmappedPermissionStatementCount,
      aliases: aliases.items
        .flatMap((alias) => {
          const name = nonEmptyString(alias.Name);
          const functionVersion = nonEmptyString(alias.FunctionVersion);
          const description = toSafePublicString(alias.Description);
          return name && functionVersion
            ? [{ name, functionVersion, ...(description ? { description } : {}) }]
            : [];
        })
        .sort((left, right) => left.name.localeCompare(right.name)),
      versions: uniqueInOrder(
        versions.items.flatMap((version) =>
          nonEmptyString(version.Version) ? [version.Version as string] : []
        )
      ),
      tags: publicTags,
      tagsReadComplete: tags.complete,
      managementReady: missingDetails.length === 0,
      reverseEngineeringDetailsVersion: 1,
      reverseEngineeringDetailsComplete: missingDetails.length === 0,
      reverseEngineeringIncompleteDetails: missingDetails
    }),
    relationships
  };
  const permissionArtifacts = policy.complete
    ? policy.statements.flatMap(({ statementId, statement }) =>
        statementId
          ? [
              createLambdaPermissionArtifacts({
                functionArn,
                functionName,
                functionProviderResourceId,
                fallbackRegion,
                statementId,
                statement,
                parentMissingDetails: missingDetails
              })
            ]
          : []
      )
    : [];
  const serverOnlyDetail: AwsLambdaServerOnlyDetail = {
    providerResourceId: functionProviderResourceId,
    resourceKind: "function",
    terraformImportId: functionName,
    functionArn,
    functionConfiguration: exactConfiguration,
    codeSource: serverOnlyCodeSource,
    tags: tags.complete ? (tags.value.Tags ?? {}) : {},
    environmentVariables,
    ...(codeSigningConfigArn ? { codeSigningConfigArn } : {}),
    ...(reservedConcurrentExecutions !== undefined ? { reservedConcurrentExecutions } : {}),
    ...(policy.complete && policy.present ? { resourcePolicyDocument: policy.document } : {})
  };

  return {
    records: [functionRecord, ...permissionArtifacts.map((artifact) => artifact.record)],
    serverOnlyDetails: [
      serverOnlyDetail,
      ...permissionArtifacts.map((artifact) => artifact.serverOnlyDetail)
    ],
    failures: [
      ...toLambdaDetailFailure(functionProviderResourceId, "function", functionDetail),
      ...toLambdaDetailFailure(functionProviderResourceId, "reservedConcurrency", concurrency),
      ...toLambdaDetailFailure(functionProviderResourceId, "codeSigningConfig", codeSigningConfig),
      ...toLambdaDetailFailure(functionProviderResourceId, "tags", tags),
      ...(policy.complete
        ? []
        : [
            {
              providerResourceType: "AWS::Lambda::Function",
              providerResourceId: functionProviderResourceId,
              detail: "resourcePolicy",
              outcome: policy.failureOutcome
            } satisfies AwsLambdaDetailFailure
          ]),
      ...toLambdaPageFailure(functionProviderResourceId, "aliases", aliases),
      ...toLambdaPageFailure(functionProviderResourceId, "versions", versions),
      ...(environmentReadComplete
        ? []
        : [
            {
              providerResourceType: "AWS::Lambda::Function",
              providerResourceId: functionProviderResourceId,
              detail: "environment",
              outcome: "transient"
            } satisfies AwsLambdaDetailFailure
          ])
    ]
  };
}

/** gg: 아직 Terraform projection이 재현하지 못하는 Lambda 설정은 원문을 보존하고 관리 승격만 막습니다. */
function getUnsupportedLambdaProjectionDetails(
  configuration: FunctionConfiguration,
  functionName: string,
  hasCodeSigningConfig: boolean
): string[] {
  const loggingConfig = configuration.LoggingConfig;
  const logGroup = nonEmptyString(loggingConfig?.LogGroup);
  const logFormat = nonEmptyString(loggingConfig?.LogFormat);
  const customLoggingConfigured =
    (logGroup !== null && logGroup !== `/aws/lambda/${functionName}`) ||
    (logFormat !== null && logFormat !== "Text") ||
    nonEmptyString(loggingConfig?.ApplicationLogLevel) !== null ||
    nonEmptyString(loggingConfig?.SystemLogLevel) !== null;
  const snapStartConfigured =
    nonEmptyString(configuration.SnapStart?.ApplyOn) !== null &&
    configuration.SnapStart?.ApplyOn !== "None";

  return [
    ...(nonEmptyString(configuration.KMSKeyArn) ? ["kmsKey"] : []),
    ...(nonEmptyString(configuration.DeadLetterConfig?.TargetArn) ? ["deadLetterConfig"] : []),
    ...((configuration.FileSystemConfigs?.length ?? 0) > 0 ? ["fileSystemConfigs"] : []),
    ...((configuration.Layers?.length ?? 0) > 0 ? ["layers"] : []),
    ...(customLoggingConfigured ? ["loggingConfig"] : []),
    ...(snapStartConfigured ? ["snapStart"] : []),
    ...(hasCodeSigningConfig ? ["codeSigningConfig"] : [])
  ];
}

/** gg: ResourceNotFound만 policy 없음으로 인정하고 다른 실패는 권한 누락으로 닫습니다. */
async function readLambdaResourcePolicy(
  client: AwsLambdaDetailReadClient,
  functionName: string
): Promise<LambdaPolicyReadResult> {
  try {
    const response = await sendLambda<GetPolicyCommandOutput>(
      client,
      new GetPolicyCommand({ FunctionName: functionName })
    );
    if (!nonEmptyString(response.Policy)) {
      return { complete: true, present: false, statements: [] };
    }
    const parsed = parseLambdaPolicy(response.Policy as string);
    return parsed
      ? {
          complete: true,
          present: true,
          document: parsed.document,
          statements: parsed.statements
        }
      : {
          complete: false,
          present: "unknown",
          statements: [],
          failureOutcome: "transient"
        };
  } catch (error) {
    if (getAwsErrorName(error) === "ResourceNotFoundException") {
      return { complete: true, present: false, statements: [] };
    }
    return {
      complete: false,
      present: "unknown",
      statements: [],
      failureOutcome: classifyLambdaDetailFailure(error)
    };
  }
}

/** gg: 실제 Sid가 있는 statement만 Permission 후보가 되며 Sid 없는 문장에 가짜 ID를 만들지 않습니다. */
function parseLambdaPolicy(value: string): {
  document: unknown;
  statements: LambdaPermissionStatement[];
} | null {
  try {
    const document = JSON.parse(value) as unknown;
    if (!isRecord(document)) return null;
    const statementValue = document["Statement"];
    const statements = Array.isArray(statementValue)
      ? statementValue
      : statementValue === undefined
        ? []
        : [statementValue];
    if (!statements.every(isRecord)) return null;
    return {
      document,
      statements: statements.map((statement) => ({
        statementId: nonEmptyString(statement["Sid"]),
        statement
      }))
    };
  } catch {
    return null;
  }
}

/** gg: 실제 import ID와 정책 문장은 서버에만 두고 공개 Permission에는 안전 판단 결과만 둡니다. */
function createLambdaPermissionArtifacts(input: {
  readonly functionArn: string;
  readonly functionName: string;
  readonly functionProviderResourceId: string;
  readonly fallbackRegion: string;
  readonly statementId: string;
  readonly statement: Readonly<Record<string, unknown>>;
  readonly parentMissingDetails: readonly string[];
}): {
  readonly record: AwsDiscoveredResourceRecord;
  readonly serverOnlyDetail: AwsLambdaServerOnlyDetail;
} {
  const assessment = assessLambdaPermissionStatement(input.functionArn, input.statement);
  const exactPermissionIdentity = `${input.functionArn}:permission:${encodeURIComponent(input.statementId)}`;
  const providerResourceId = createOpaqueAwsProviderResourceId(
    "AWS::Lambda::Permission",
    exactPermissionIdentity
  );
  const terraformImportId = `${input.functionName}${assessment.qualifier ? `:${assessment.qualifier}` : ""}/${input.statementId}`;
  const managementReady =
    input.parentMissingDetails.length === 0 && assessment.missingDetails.length === 0;
  const action = input.statement["Action"];
  const actions = Array.isArray(action)
    ? action.filter((entry): entry is string => typeof entry === "string")
    : typeof action === "string"
      ? [action]
      : [];
  const principal = isRecord(input.statement["Principal"])
    ? Object.keys(input.statement["Principal"]).sort()
    : typeof input.statement["Principal"] === "string"
      ? ["direct"]
      : [];
  return {
    record: {
      providerResourceType: "AWS::Lambda::Permission",
      providerResourceId,
      displayName: `${input.functionName} ${input.statementId}`,
      region: parseArnRegion(input.functionArn) ?? input.fallbackRegion,
      config: {
        functionName: input.functionName,
        statementId: input.statementId,
        effect: input.statement["Effect"] === "Allow" ? "Allow" : "unsupported",
        actionCount: actions.length,
        principalKinds: principal,
        hasCondition: isRecord(input.statement["Condition"]),
        policyDocumentRedacted: true,
        managementReady,
        managementBlockers: assessment.missingDetails,
        reverseEngineeringDetailsVersion: 1,
        reverseEngineeringDetailsComplete: input.parentMissingDetails.length === 0,
        reverseEngineeringIncompleteDetails: [...input.parentMissingDetails]
      },
      relationships: [
        { type: "depends_on", targetProviderResourceId: input.functionProviderResourceId }
      ]
    },
    serverOnlyDetail: {
      providerResourceId,
      resourceKind: "permission",
      terraformImportId,
      functionProviderResourceId: input.functionProviderResourceId,
      statementId: input.statementId,
      statement: input.statement
    }
  };
}

/** gg: aws_lambda_permission으로 손실 없이 옮길 수 있는 좁은 Allow 문장만 관리 가능하게 판정합니다. */
function assessLambdaPermissionStatement(
  functionArn: string,
  statement: Readonly<Record<string, unknown>>
): LambdaPermissionAssessment {
  const resource = assessLambdaPermissionResource(functionArn, statement["Resource"]);
  const allowedKeys = new Set(["Action", "Condition", "Effect", "Principal", "Resource", "Sid"]);
  const missingDetails = uniqueSorted([
    ...(statement["Effect"] === "Allow" ? [] : ["permissionEffect"]),
    ...(statement["Action"] === "lambda:InvokeFunction" ? [] : ["permissionAction"]),
    ...(isSingleLambdaPrincipal(statement["Principal"]) ? [] : ["permissionPrincipal"]),
    ...(resource.complete ? [] : ["permissionResource"]),
    ...(isLosslessLambdaPermissionCondition(statement["Condition"]) ? [] : ["permissionCondition"]),
    ...(Object.keys(statement).every((key) => allowedKeys.has(key)) ? [] : ["permissionShape"])
  ]);
  return { qualifier: resource.qualifier, missingDetails };
}

/** gg: Function 자체 또는 한 단계 qualifier만 정확히 가리킬 때 Terraform import qualifier로 사용합니다. */
function assessLambdaPermissionResource(
  functionArn: string,
  value: unknown
): { readonly complete: boolean; readonly qualifier: string | null } {
  const resourceArn = nonEmptyString(value);
  if (resourceArn === functionArn) return { complete: true, qualifier: null };
  if (!resourceArn?.startsWith(`${functionArn}:`)) {
    return { complete: false, qualifier: null };
  }
  const qualifier = resourceArn.slice(functionArn.length + 1);
  return qualifier.length > 0 && !qualifier.includes(":")
    ? { complete: true, qualifier }
    : { complete: false, qualifier: null };
}

/** gg: Principal은 단일 문자열 또는 단일 종류의 단일 문자열만 허용해 배열·복합 주체를 추측하지 않습니다. */
function isSingleLambdaPrincipal(value: unknown): boolean {
  if (nonEmptyString(value)) return true;
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length === 1 && nonEmptyString(entries[0]?.[1]) !== null;
}

/** gg: Terraform permission 필드로 일대일 변환 가능한 Source/조직/Function URL 조건만 허용합니다. */
function isLosslessLambdaPermissionCondition(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || Object.keys(value).length === 0) return false;
  const mappedFields = new Set<string>();
  for (const [operator, conditionValue] of Object.entries(value)) {
    if (!isRecord(conditionValue) || Object.keys(conditionValue).length === 0) return false;
    if (operator === "ArnLike" || operator === "ArnEquals") {
      if (
        Object.keys(conditionValue).length !== 1 ||
        nonEmptyString(conditionValue["AWS:SourceArn"]) === null ||
        mappedFields.has("sourceArn")
      ) {
        return false;
      }
      mappedFields.add("sourceArn");
      continue;
    }
    if (operator === "StringEquals") {
      const fieldByKey = new Map([
        ["AWS:PrincipalOrgID", "principalOrgId"],
        ["AWS:SourceAccount", "sourceAccount"],
        ["lambda:FunctionUrlAuthType", "functionUrlAuthType"]
      ]);
      for (const [key, entryValue] of Object.entries(conditionValue)) {
        const mappedField = fieldByKey.get(key);
        if (!mappedField || nonEmptyString(entryValue) === null || mappedFields.has(mappedField)) {
          return false;
        }
        mappedFields.add(mappedField);
      }
      continue;
    }
    if (operator === "Bool") {
      const invokedViaUrl = conditionValue["lambda:InvokedViaFunctionUrl"];
      if (
        Object.keys(conditionValue).length === 1 &&
        (typeof invokedViaUrl === "boolean" ||
          invokedViaUrl === "true" ||
          invokedViaUrl === "false") &&
        !mappedFields.has("invokedViaFunctionUrl")
      ) {
        mappedFields.add("invokedViaFunctionUrl");
        continue;
      }
      return false;
    }
    return false;
  }
  return mappedFields.size > 0;
}

/** gg: Lambda의 VPC, Role, Layer, KMS, DLQ 근거가 실제 응답에 있을 때만 관계를 만듭니다. */
function createLambdaRelationships(
  configuration: FunctionConfiguration
): AwsDiscoveredResourceRecord["relationships"] {
  const targets = [
    toOpaqueArnRelationshipTarget("AWS::IAM::Role", configuration.Role),
    nonEmptyString(configuration.VpcConfig?.VpcId),
    ...(configuration.VpcConfig?.SubnetIds ?? []).map(nonEmptyString),
    ...(configuration.VpcConfig?.SecurityGroupIds ?? []).map(nonEmptyString),
    ...(configuration.Layers ?? []).map((layer) =>
      toOpaqueArnRelationshipTarget("AWS::Lambda::LayerVersion", layer.Arn)
    ),
    toOpaqueArnRelationshipTarget("AWS::KMS::Key", configuration.KMSKeyArn),
    toOpaqueArnRelationshipTarget(
      inferDeadLetterProviderResourceType(configuration.DeadLetterConfig?.TargetArn),
      configuration.DeadLetterConfig?.TargetArn
    ),
    ...(configuration.FileSystemConfigs ?? []).map((entry) =>
      toOpaqueArnRelationshipTarget("AWS::EFS::AccessPoint", entry.Arn)
    ),
    nonEmptyString(configuration.LoggingConfig?.LogGroup)
  ].filter((value): value is string => value !== null);
  return uniqueInOrder(targets).map((targetProviderResourceId) => ({
    type: "depends_on",
    targetProviderResourceId
  }));
}

/** gg: Lambda pagination이 중간에 실패해도 앞 page를 보존하되 management-ready로 올리지 않습니다. */
async function collectSafeLambdaPages<T>(
  readPage: (
    marker: string | undefined
  ) => Promise<{ items: readonly T[]; nextMarker?: string | undefined }>
): Promise<SafePageResult<T>> {
  const items: T[] = [];
  const seenMarkers = new Set<string>();
  let marker: string | undefined;
  do {
    try {
      const page = await readPage(marker);
      items.push(...page.items);
      if (page.nextMarker && seenMarkers.has(page.nextMarker)) {
        return { items, complete: false, failureOutcome: "transient" };
      }
      if (page.nextMarker) seenMarkers.add(page.nextMarker);
      marker = page.nextMarker;
    } catch (error) {
      return { items, complete: false, failureOutcome: classifyLambdaDetailFailure(error) };
    }
  } while (marker);
  return { items, complete: true };
}

/** gg: 개별 Lambda detail 실패는 원문 없이 안전한 결과 코드만 반환합니다. */
async function readLambdaDetail<T>(
  client: AwsLambdaDetailReadClient,
  command: object
): Promise<
  { complete: true; value: T } | { complete: false; failureOutcome: AwsLambdaDetailFailureOutcome }
> {
  try {
    return { complete: true, value: await sendLambda<T>(client, command) };
  } catch (error) {
    return { complete: false, failureOutcome: classifyLambdaDetailFailure(error) };
  }
}

/** gg: AWS 오류 메시지에 섞인 ARN·request ID를 버리고 고정된 분류만 유지합니다. */
function classifyLambdaDetailFailure(error: unknown): AwsLambdaDetailFailureOutcome {
  const details =
    error && typeof error === "object"
      ? (error as { name?: unknown; code?: unknown; Code?: unknown; message?: unknown })
      : {};
  const text = [details.name, details.code, details.Code, details.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  if (/accessdenied|unauthorized|not authorized/u.test(text)) return "permission_denied";
  if (/expiredtoken|invalidclienttoken|unrecognizedclient/u.test(text)) {
    return "expired_credential";
  }
  if (/invalidregion|invalid region|unknownendpoint/u.test(text)) return "invalid_region";
  if (/notconfigured|not configured/u.test(text)) return "not_configured";
  if (/throttl|too many request|requestlimitexceeded/u.test(text)) return "throttled";
  return "transient";
}

/** gg: ResourceNotFound 분기에서만 policy 없음으로 처리하기 위해 오류 이름만 읽습니다. */
function getAwsErrorName(error: unknown): string | null {
  return error &&
    typeof error === "object" &&
    typeof (error as { name?: unknown }).name === "string"
    ? ((error as { name: string }).name ?? null)
    : null;
}

/** gg: ARN이 섞인 tag 값은 서버 전용 원본에만 두고 공개 tag는 안전한 값만 정렬합니다. */
function toPublicLambdaTags(tags: Record<string, string> | undefined): {
  key: string;
  value: string;
}[] {
  return Object.entries(tags ?? {})
    .filter(
      ([key, value]) => key.trim().length > 0 && !containsAwsArn(key) && !containsAwsArn(value)
    )
    .map(([key, value]) => ({ key, value }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

/** gg: Lambda environment는 server-only 값 map으로만 정규화하고 공개 config에는 key만 제공합니다. */
function toStringRecord(value: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(
      ([key, entryValue]) => key.trim().length > 0 && typeof entryValue === "string"
    )
  );
}

/** gg: 실패한 detail만 안전한 Lambda 진단으로 바꿔 record 자동 승격을 막습니다. */
function toLambdaDetailFailure(
  providerResourceId: string,
  detail: string,
  result: { complete: boolean; failureOutcome?: AwsLambdaDetailFailureOutcome }
): AwsLambdaDetailFailure[] {
  return result.complete
    ? []
    : [
        {
          providerResourceType: "AWS::Lambda::Function",
          providerResourceId,
          detail,
          outcome: result.failureOutcome ?? "transient"
        }
      ];
}

/** gg: alias/version later-page 실패도 Function 단위 관리 차단 근거로 유지합니다. */
function toLambdaPageFailure(
  providerResourceId: string,
  detail: string,
  result: SafePageResult<unknown>
): AwsLambdaDetailFailure[] {
  return result.complete
    ? []
    : [
        {
          providerResourceType: "AWS::Lambda::Function",
          providerResourceId,
          detail,
          outcome: result.failureOutcome ?? "transient"
        }
      ];
}

/** gg: 전체 Function 목록이 불완전하면 이미 읽은 Function과 Permission도 관리 불가로 닫습니다. */
function addLambdaIncompleteDetail(
  record: AwsDiscoveredResourceRecord,
  detail: string
): AwsDiscoveredResourceRecord {
  const existing = Array.isArray(record.config["reverseEngineeringIncompleteDetails"])
    ? record.config["reverseEngineeringIncompleteDetails"].filter(
        (value): value is string => typeof value === "string" && value.length > 0
      )
    : [];
  return {
    ...record,
    config: {
      ...record.config,
      managementReady: false,
      reverseEngineeringDetailsComplete: false,
      reverseEngineeringIncompleteDetails: uniqueSorted([...existing, detail])
    }
  };
}

/** gg: 대량 Function도 정해진 수만 동시에 읽어 AWS throttling과 메모리 급증을 피합니다. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(items.length, Math.max(1, concurrency));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        const item = items[index];
        if (item !== undefined) results[index] = await mapper(item, index);
      }
    })
  );
  return results;
}

/** gg: raw ARN 관계값은 provider type을 포함한 불투명 ID로 바꿔 공개 record 밖으로 숨깁니다. */
function toOpaqueArnRelationshipTarget(
  providerResourceType: string,
  value: unknown
): string | null {
  const exactProviderResourceId = nonEmptyString(value);
  return exactProviderResourceId
    ? createOpaqueAwsProviderResourceId(providerResourceType, exactProviderResourceId)
    : null;
}

/** gg: DLQ ARN의 service 구분만 이용해 SQS와 SNS 관계 ID가 서로 충돌하지 않게 합니다. */
function inferDeadLetterProviderResourceType(value: unknown): string {
  const arn = nonEmptyString(value);
  if (arn?.startsWith("arn:aws:sqs:")) return "AWS::SQS::Queue";
  if (arn?.startsWith("arn:aws:sns:")) return "AWS::SNS::Topic";
  return "AWS::Lambda::DeadLetterTarget";
}

/** gg: adapter와 같은 hash 규칙으로 exact provider ID를 안정적인 공개 관계 키로 바꿉니다. */
function createOpaqueAwsProviderResourceId(
  providerResourceType: string,
  exactProviderResourceId: string
): string {
  return `aws-ref-${createHash("sha256")
    .update(`${providerResourceType}\0${exactProviderResourceId}`)
    .digest("hex")
    .slice(0, 24)}`;
}

/** gg: 사용자 설명에 ARN이 섞이면 설명 전체를 숨겨 account 식별자가 새지 않게 합니다. */
function toSafePublicString(value: unknown): string | undefined {
  const text = nonEmptyString(value);
  return text && !containsAwsArn(text) ? text : undefined;
}

/** gg: AWS partition 종류와 관계없이 ARN 문자열을 같은 비공개 경계로 판정합니다. */
function containsAwsArn(value: string): boolean {
  return /(?:^|[^a-z0-9])arn:aws(?:-[a-z0-9-]+)?:/iu.test(value);
}

/** gg: AWS SDK 객체 중 undefined 값은 공개 config에 쓰지 않습니다. */
function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

/** gg: AWS identifier는 빈 문자열을 버려 불안정한 관계와 Permission ID를 만들지 않습니다. */
function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** gg: object 검사 없이는 정책 원문을 안전한 statement 구조로 좁힐 수 없습니다. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** gg: ARN에서 region을 추출하지 못하면 호출자가 연결 region을 fallback으로 사용합니다. */
function parseArnRegion(arn: string): string | null {
  const parts = arn.split(":");
  return parts.length >= 4 ? nonEmptyString(parts[3]) : null;
}

/** gg: SDK page 순서를 유지하면서 중복 alias/version/관계를 제거합니다. */
function uniqueInOrder<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/** gg: incomplete marker를 정렬해 같은 AWS 상태에서 같은 record fingerprint를 만듭니다. */
function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** gg: 실제 SDK client는 임시 AWS 자격 증명을 process 환경이나 log에 복사하지 않습니다. */
function createDefaultLambdaDetailReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsLambdaDetailReadClient {
  const client = new LambdaClient({
    region,
    credentials: {
      accessKeyId: credentials.AWS_ACCESS_KEY_ID,
      secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY,
      ...(credentials.AWS_SESSION_TOKEN ? { sessionToken: credentials.AWS_SESSION_TOKEN } : {})
    }
  });
  return {
    send: (command) => client.send(command as Parameters<LambdaClient["send"]>[0])
  };
}

/** gg: injectable Lambda client의 unknown 응답을 command별 SDK output으로 좁힙니다. */
async function sendLambda<T>(client: AwsLambdaDetailReadClient, command: object): Promise<T> {
  return (await client.send(command)) as T;
}
