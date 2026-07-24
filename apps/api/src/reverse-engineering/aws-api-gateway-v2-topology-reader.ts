import { createHash } from "node:crypto";
import {
  ApiGatewayV2Client,
  GetApisCommand,
  GetIntegrationsCommand,
  GetRoutesCommand,
  GetStagesCommand,
  type Api,
  type GetApisCommandOutput,
  type GetIntegrationsCommandOutput,
  type GetRoutesCommandOutput,
  type GetStagesCommandOutput,
  type Integration,
  type Route,
  type Stage
} from "@aws-sdk/client-apigatewayv2";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";

export type AwsApiGatewayV2TopologyAdvancedFeature =
  | "api_gateway_managed"
  | "cors"
  | "api_route_selection"
  | "route_authorizer"
  | "route_models"
  | "route_parameters"
  | "route_target"
  | "integration_uri"
  | "integration_credentials"
  | "vpc_link"
  | "integration_templates"
  | "integration_response_parameters"
  | "stage_variables"
  | "access_logs"
  | "stage_route_settings";

export type AwsApiGatewayV2TopologyClassification = "simple" | "advanced" | "incomplete";

export type AwsApiGatewayV2TopologyFailureOutcome =
  | "permission_denied"
  | "not_configured"
  | "expired_credential"
  | "invalid_region"
  | "throttled"
  | "transient"
  | "invalid_response";

export type AwsApiGatewayV2TopologyFailureScope = "catalog" | "integrations" | "routes" | "stages";

export type AwsApiGatewayV2TopologyPublicRecord = {
  readonly recordId: string;
  readonly familyRecordId: string;
  readonly providerResourceType: string;
  readonly displayName: string;
  readonly region: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly parentRecordId?: string;
  readonly relatedRecordIds: readonly string[];
};

export type AwsApiGatewayV2TopologyServerOnlyRecord = {
  readonly publicRecordId: string;
  readonly familyPublicApiRecordId: string;
  readonly providerResourceType: string;
  readonly terraformImportId: string;
  readonly parentProviderResourceType?: string;
  readonly parentTerraformImportId?: string;
  readonly relatedTerraformImportIdentities: readonly {
    readonly providerResourceType: string;
    readonly terraformImportId: string;
  }[];
  readonly serverOnlyConfig: Readonly<Record<string, unknown>>;
};

export type AwsApiGatewayV2TopologyFamily = {
  readonly publicApiRecordId: string;
  readonly protocolType: string | undefined;
  readonly readComplete: boolean;
  readonly classification: AwsApiGatewayV2TopologyClassification;
  readonly managementReady: boolean;
  readonly advancedFeatures: readonly AwsApiGatewayV2TopologyAdvancedFeature[];
};

export type AwsApiGatewayV2TopologyFailure = {
  readonly scope: AwsApiGatewayV2TopologyFailureScope;
  readonly outcome: AwsApiGatewayV2TopologyFailureOutcome;
  readonly familyRecordId?: string;
};

export type AwsApiGatewayV2TopologyReadResult = {
  readonly catalogReadComplete: boolean;
  readonly families: readonly AwsApiGatewayV2TopologyFamily[];
  readonly publicRecords: readonly AwsApiGatewayV2TopologyPublicRecord[];
  readonly serverOnlyRecords: readonly AwsApiGatewayV2TopologyServerOnlyRecord[];
  readonly failures: readonly AwsApiGatewayV2TopologyFailure[];
};

export type AwsApiGatewayV2TopologyReadClient = {
  send(command: object): Promise<unknown>;
};

export type AwsApiGatewayV2TopologyReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsApiGatewayV2TopologyReadClient;

export type ReadAwsApiGatewayV2TopologyInput = {
  readonly region: string;
  readonly credentials: TerraformAwsCredentialEnv;
  readonly createClient?: AwsApiGatewayV2TopologyReadClientFactory;
};

type RecordIdentity = {
  readonly providerResourceType: string;
  readonly terraformImportId: string;
};

type RelatedRecordIdentity = RecordIdentity & {
  readonly publicRecordId?: string;
};

type CreatedTopologyRecord = {
  readonly publicRecord: AwsApiGatewayV2TopologyPublicRecord;
  readonly serverOnlyRecord: AwsApiGatewayV2TopologyServerOnlyRecord;
};

type FamilyReadState = {
  readonly publicApiRecordId: string;
  readonly publicRecords: AwsApiGatewayV2TopologyPublicRecord[];
  readonly serverOnlyRecords: AwsApiGatewayV2TopologyServerOnlyRecord[];
  readonly failures: AwsApiGatewayV2TopologyFailure[];
  readonly advancedFeatures: Set<AwsApiGatewayV2TopologyAdvancedFeature>;
  readonly seenRecordIds: Set<string>;
  readComplete: boolean;
};

type PageReadResult<T> = {
  readonly items: readonly T[];
  readonly failure?: AwsApiGatewayV2TopologyFailureOutcome;
};

type PagedCollectionPage<T> = {
  readonly items: readonly T[];
  readonly nextToken?: string | undefined;
};

const ADVANCED_FEATURE_ORDER: readonly AwsApiGatewayV2TopologyAdvancedFeature[] = [
  "api_gateway_managed",
  "cors",
  "api_route_selection",
  "route_authorizer",
  "route_models",
  "route_parameters",
  "route_target",
  "integration_uri",
  "integration_credentials",
  "vpc_link",
  "integration_templates",
  "integration_response_parameters",
  "stage_variables",
  "access_logs",
  "stage_route_settings"
];

/** gg: HTTP/WebSocket API와 Route·Integration·Stage를 같은 전용 API에서 읽어 Cloud Control 의존을 없앱니다. */
export async function readAwsApiGatewayV2Topology(
  input: ReadAwsApiGatewayV2TopologyInput
): Promise<AwsApiGatewayV2TopologyReadResult> {
  const client = (input.createClient ?? createDefaultApiGatewayV2TopologyReadClient)(
    input.region,
    input.credentials
  );
  const catalog = await readPagedCollection<Api>(async (nextToken) => {
    const response = await sendApiGatewayV2Command<GetApisCommandOutput>(
      client,
      new GetApisCommand({ NextToken: nextToken })
    );
    return { items: response.Items ?? [], nextToken: response.NextToken };
  });
  const validCatalogItems: Array<{ readonly api: Api; readonly apiId: string }> = [];
  const seenApiIds = new Set<string>();
  let catalogIdentityInvalid = false;
  for (const api of catalog.items) {
    const apiId = getNonEmptyString(api.ApiId);
    if (!apiId || seenApiIds.has(apiId)) {
      catalogIdentityInvalid = true;
      continue;
    }
    seenApiIds.add(apiId);
    validCatalogItems.push({ api, apiId });
  }
  const catalogReadComplete = catalog.failure === undefined && !catalogIdentityInvalid;
  const failures: AwsApiGatewayV2TopologyFailure[] = [
    ...(catalog.failure ? [{ scope: "catalog" as const, outcome: catalog.failure }] : []),
    ...(catalogIdentityInvalid
      ? [{ scope: "catalog" as const, outcome: "invalid_response" as const }]
      : [])
  ];
  const publicRecords: AwsApiGatewayV2TopologyPublicRecord[] = [];
  const serverOnlyRecords: AwsApiGatewayV2TopologyServerOnlyRecord[] = [];
  const families: AwsApiGatewayV2TopologyFamily[] = [];

  for (const { api, apiId } of validCatalogItems) {
    const state = await readApiFamily({
      api,
      apiId,
      region: input.region,
      client,
      catalogReadComplete
    });
    publicRecords.push(...state.publicRecords);
    serverOnlyRecords.push(...state.serverOnlyRecords);
    failures.push(...state.failures);
    const advancedFeatures = ADVANCED_FEATURE_ORDER.filter((feature) =>
      state.advancedFeatures.has(feature)
    );
    const classification: AwsApiGatewayV2TopologyClassification = state.readComplete
      ? advancedFeatures.length > 0
        ? "advanced"
        : "simple"
      : "incomplete";
    families.push({
      publicApiRecordId: state.publicApiRecordId,
      protocolType: getNonEmptyString(api.ProtocolType),
      readComplete: state.readComplete,
      classification,
      managementReady: classification === "simple",
      advancedFeatures
    });
  }

  if (!catalogReadComplete) {
    for (const [index, family] of families.entries()) {
      if (!family.readComplete) continue;
      families[index] = {
        ...family,
        readComplete: false,
        classification: "incomplete",
        managementReady: false
      };
    }
  }

  return { catalogReadComplete, families, publicRecords, serverOnlyRecords, failures };
}

/** gg: API마다 child collection을 끝까지 읽고, 하나라도 실패하면 해당 family만 incomplete로 남깁니다. */
async function readApiFamily(input: {
  readonly api: Api;
  readonly apiId: string;
  readonly region: string;
  readonly client: AwsApiGatewayV2TopologyReadClient;
  readonly catalogReadComplete: boolean;
}): Promise<FamilyReadState> {
  const apiIdentity = createIdentity("AWS::ApiGatewayV2::Api", input.apiId);
  const apiRecord = createTopologyRecord({
    identity: apiIdentity,
    familyIdentity: apiIdentity,
    region: input.region,
    displayName: getNonEmptyString(input.api.Name) ?? "API Gateway V2 API",
    publicConfig: createPublicApiConfig(input.api),
    serverOnlyConfig: createServerOnlyApiConfig(input.api, input.apiId)
  });
  const state: FamilyReadState = {
    publicApiRecordId: apiRecord.publicRecord.recordId,
    publicRecords: [apiRecord.publicRecord],
    serverOnlyRecords: [apiRecord.serverOnlyRecord],
    failures: [],
    advancedFeatures: new Set(),
    seenRecordIds: new Set([apiRecord.publicRecord.recordId]),
    readComplete: input.catalogReadComplete
  };

  if (!getNonEmptyString(input.api.Name) || !getNonEmptyString(input.api.ProtocolType)) {
    markFamilyIncomplete(state, "catalog", "invalid_response");
  }
  addApiAdvancedFeatures(state, input.api);

  const integrations = await readFamilyPagedCollection<Integration>(state, "integrations", async (nextToken) => {
    const response = await sendApiGatewayV2Command<GetIntegrationsCommandOutput>(
      input.client,
      new GetIntegrationsCommand({ ApiId: input.apiId, NextToken: nextToken })
    );
    return { items: response.Items ?? [], nextToken: response.NextToken };
  });
  const integrationIdentities = addIntegrationRecords({
    ...input,
    state,
    apiIdentity,
    integrations
  });

  const routes = await readFamilyPagedCollection<Route>(state, "routes", async (nextToken) => {
    const response = await sendApiGatewayV2Command<GetRoutesCommandOutput>(
      input.client,
      new GetRoutesCommand({ ApiId: input.apiId, NextToken: nextToken })
    );
    return { items: response.Items ?? [], nextToken: response.NextToken };
  });
  addRouteRecords({ ...input, state, apiIdentity, routes, integrationIdentities });

  const stages = await readFamilyPagedCollection<Stage>(state, "stages", async (nextToken) => {
    const response = await sendApiGatewayV2Command<GetStagesCommandOutput>(
      input.client,
      new GetStagesCommand({ ApiId: input.apiId, NextToken: nextToken })
    );
    return { items: response.Items ?? [], nextToken: response.NextToken };
  });
  addStageRecords({ ...input, state, apiIdentity, stages });

  return state;
}

/** gg: Integration URI·Role ARN은 공개하지 않고, 안전하게 해석되는 Lambda·Role 관계만 연결합니다. */
function addIntegrationRecords(input: {
  readonly apiId: string;
  readonly region: string;
  readonly state: FamilyReadState;
  readonly apiIdentity: RecordIdentity;
  readonly integrations: readonly Integration[];
}): ReadonlyMap<string, RecordIdentity> {
  const identities = new Map<string, RecordIdentity>();
  for (const integration of input.integrations) {
    const integrationId = getNonEmptyString(integration.IntegrationId);
    if (!integrationId || identities.has(integrationId)) {
      markFamilyIncomplete(input.state, "integrations", "invalid_response");
      continue;
    }
    const identity = createIdentity(
      "AWS::ApiGatewayV2::Integration",
      `${input.apiId}/${integrationId}`
    );
    identities.set(integrationId, identity);
    const relatedIdentities = analyzeIntegration(input.state, integration);
    addTopologyRecord(
      input.state,
      createTopologyRecord({
        identity,
        familyIdentity: input.apiIdentity,
        parentIdentity: input.apiIdentity,
        relatedIdentities,
        region: input.region,
        displayName: getNonEmptyString(integration.Description) ?? "API Gateway V2 Integration",
        publicConfig: createPublicIntegrationConfig(integration),
        serverOnlyConfig: createServerOnlyIntegrationConfig(integration, input.apiId, integrationId)
      }),
      "integrations"
    );
  }
  return identities;
}

/** gg: Route Target의 `integrations/{id}`만 공개 관계로 연결하고, 원문 target은 server-only에 보존합니다. */
function addRouteRecords(input: {
  readonly apiId: string;
  readonly region: string;
  readonly state: FamilyReadState;
  readonly apiIdentity: RecordIdentity;
  readonly routes: readonly Route[];
  readonly integrationIdentities: ReadonlyMap<string, RecordIdentity>;
}): void {
  const seenRouteIds = new Set<string>();
  for (const route of input.routes) {
    const routeId = getNonEmptyString(route.RouteId);
    const routeKey = getNonEmptyString(route.RouteKey);
    if (!routeId || !routeKey || seenRouteIds.has(routeId)) {
      markFamilyIncomplete(input.state, "routes", "invalid_response");
      continue;
    }
    seenRouteIds.add(routeId);
    const target = getNonEmptyString(route.Target);
    const integrationId = target ? parseRouteIntegrationTarget(target) : undefined;
    const integrationIdentity = integrationId
      ? input.integrationIdentities.get(integrationId)
      : undefined;
    if (
      integrationId &&
      !integrationIdentity &&
      !input.state.failures.some((failure) => failure.scope === "integrations")
    ) {
      markFamilyIncomplete(input.state, "routes", "invalid_response");
    }
    addRouteAdvancedFeatures(input.state, route, target, integrationId);
    const identity = createIdentity("AWS::ApiGatewayV2::Route", `${input.apiId}/${routeId}`);
    addTopologyRecord(
      input.state,
      createTopologyRecord({
        identity,
        familyIdentity: input.apiIdentity,
        parentIdentity: input.apiIdentity,
        relatedIdentities: integrationIdentity ? [integrationIdentity] : [],
        region: input.region,
        displayName: routeKey,
        publicConfig: createPublicRouteConfig(route),
        serverOnlyConfig: createServerOnlyRouteConfig(route, input.apiId, routeId)
      }),
      "routes"
    );
  }
}

/** gg: V2 Stage는 배포 ID가 API 목록에 없으므로 parent API 관계만 만들고 exact 설정은 private detail에 둡니다. */
function addStageRecords(input: {
  readonly apiId: string;
  readonly region: string;
  readonly state: FamilyReadState;
  readonly apiIdentity: RecordIdentity;
  readonly stages: readonly Stage[];
}): void {
  const seenStageNames = new Set<string>();
  for (const stage of input.stages) {
    const stageName = getNonEmptyString(stage.StageName);
    if (!stageName || seenStageNames.has(stageName)) {
      markFamilyIncomplete(input.state, "stages", "invalid_response");
      continue;
    }
    seenStageNames.add(stageName);
    addStageAdvancedFeatures(input.state, stage);
    const identity = createIdentity("AWS::ApiGatewayV2::Stage", `${input.apiId}/${stageName}`);
    addTopologyRecord(
      input.state,
      createTopologyRecord({
        identity,
        familyIdentity: input.apiIdentity,
        parentIdentity: input.apiIdentity,
        region: input.region,
        displayName: stageName,
        publicConfig: createPublicStageConfig(stage),
        serverOnlyConfig: createServerOnlyStageConfig(stage, input.apiId, stageName)
      }),
      "stages"
    );
  }
}

/** gg: 다음 page token이 반복되거나 조회가 실패하면 읽은 항목은 살리고 family를 incomplete로 남깁니다. */
async function readPagedCollection<T>(
  readPage: (nextToken: string | undefined) => Promise<PagedCollectionPage<T>>
): Promise<PageReadResult<T>> {
  const items: T[] = [];
  const seenTokens = new Set<string>();
  let nextToken: string | undefined;
  do {
    try {
      const page = await readPage(nextToken);
      items.push(...page.items);
      const candidateToken = getNonEmptyString(page.nextToken);
      if (candidateToken && seenTokens.has(candidateToken)) {
        return { items, failure: "invalid_response" };
      }
      if (candidateToken) seenTokens.add(candidateToken);
      nextToken = candidateToken;
    } catch (error) {
      return { items, failure: classifyReadFailure(error) };
    }
  } while (nextToken);
  return { items };
}

/** gg: 각 API의 pagination 실패 사유에는 raw AWS 오류를 넣지 않습니다. */
async function readFamilyPagedCollection<T>(
  state: FamilyReadState,
  scope: Exclude<AwsApiGatewayV2TopologyFailureScope, "catalog">,
  readPage: (nextToken: string | undefined) => Promise<PagedCollectionPage<T>>
): Promise<readonly T[]> {
  const result = await readPagedCollection(readPage);
  if (result.failure) markFamilyIncomplete(state, scope, result.failure);
  return result.items;
}

/** gg: 명확히 해석 가능한 integration target만 Route→Integration 관계로 바꿉니다. */
function parseRouteIntegrationTarget(value: string): string | undefined {
  const match = /^integrations\/([A-Za-z0-9_-]+)$/u.exec(value);
  return match?.[1];
}

/** gg: URI의 Lambda ARN과 credentials의 IAM Role ARN만 기존 상세 reader와 호환되는 opaque 관계로 만듭니다. */
function analyzeIntegration(
  state: FamilyReadState,
  integration: Integration
): readonly RelatedRecordIdentity[] {
  const relatedIdentities: RelatedRecordIdentity[] = [];
  const integrationUri = getNonEmptyString(integration.IntegrationUri);
  const integrationType = getNonEmptyString(integration.IntegrationType)?.toUpperCase();
  if (integrationType === "AWS" || integrationType === "AWS_PROXY") {
    const lambdaIdentity = integrationUri ? parseLambdaIntegrationUri(integrationUri) : undefined;
    if (lambdaIdentity) relatedIdentities.push(lambdaIdentity);
    else if (integrationUri) state.advancedFeatures.add("integration_uri");
  } else if (integrationUri) {
    state.advancedFeatures.add("integration_uri");
  }

  const credentialsArn = getNonEmptyString(integration.CredentialsArn);
  if (credentialsArn) {
    const roleIdentity = parseIamRoleCredentials(credentialsArn);
    if (roleIdentity) relatedIdentities.push(roleIdentity);
    else state.advancedFeatures.add("integration_credentials");
  }
  if (
    integration.ConnectionType === "VPC_LINK" ||
    Boolean(getNonEmptyString(integration.ConnectionId))
  ) {
    state.advancedFeatures.add("vpc_link");
  }
  if (hasRecordEntries(integration.RequestTemplates)) {
    state.advancedFeatures.add("integration_templates");
  }
  if (hasRecordEntries(integration.ResponseParameters)) {
    state.advancedFeatures.add("integration_response_parameters");
  }
  return relatedIdentities;
}

/** gg: 실제 Lambda integration URI만 공개 hash 관계로 만들고 다른 URI는 가공하지 않습니다. */
function parseLambdaIntegrationUri(value: string): RelatedRecordIdentity | undefined {
  const match =
    /^arn:(aws(?:-[a-z0-9-]+)?):apigateway:([a-z0-9-]+):lambda:path\/2015-03-31\/functions\/(arn:\1:lambda:\2:\d{12}:function:([A-Za-z0-9-_]{1,64}))\/invocations$/u.exec(
      value
    );
  const functionArn = match?.[3];
  const functionName = match?.[4];
  return functionArn && functionName
    ? {
        providerResourceType: "AWS::Lambda::Function",
        terraformImportId: functionName,
        publicRecordId: createOpaqueAwsProviderResourceId("AWS::Lambda::Function", functionArn)
      }
    : undefined;
}

/** gg: API Gateway가 assume할 수 있는 IAM Role만 관계로 만들고 raw credentials 값은 공개하지 않습니다. */
function parseIamRoleCredentials(value: string): RelatedRecordIdentity | undefined {
  const match =
    /^arn:aws(?:-[a-z0-9-]+)?:iam::\d{12}:role\/((?:[A-Za-z0-9+=,.@_-]+\/)*([A-Za-z0-9+=,.@_-]{1,64}))$/u.exec(
      value
    );
  const rolePathAndName = match?.[1];
  const roleName = match?.[2];
  return rolePathAndName && roleName && rolePathAndName.length <= 512
    ? {
        providerResourceType: "AWS::IAM::Role",
        terraformImportId: roleName,
        publicRecordId: createOpaqueAwsProviderResourceId("AWS::IAM::Role", value)
      }
    : undefined;
}

/** gg: API 자체에서 상세 재현 경계를 벗어나는 기능은 error가 아닌 advanced marker로 남깁니다. */
function addApiAdvancedFeatures(state: FamilyReadState, api: Api): void {
  if (api.ApiGatewayManaged === true) state.advancedFeatures.add("api_gateway_managed");
  if (api.CorsConfiguration) state.advancedFeatures.add("cors");
  const routeSelectionExpression = getNonEmptyString(api.RouteSelectionExpression);
  if (
    routeSelectionExpression &&
    (api.ProtocolType === "WEBSOCKET" || routeSelectionExpression !== "${request.method} ${request.path}")
  ) {
    state.advancedFeatures.add("api_route_selection");
  }
}

/** gg: Route의 raw authorizer/target/모델은 server-only에 보존하고 공개 결과에는 재현 난이도 marker만 남깁니다. */
function addRouteAdvancedFeatures(
  state: FamilyReadState,
  route: Route,
  target: string | undefined,
  parsedIntegrationId: string | undefined
): void {
  if (getNonEmptyString(route.AuthorizerId)) state.advancedFeatures.add("route_authorizer");
  if (hasRecordEntries(route.RequestModels)) state.advancedFeatures.add("route_models");
  if (hasRecordEntries(route.RequestParameters)) state.advancedFeatures.add("route_parameters");
  if (target && !parsedIntegrationId) state.advancedFeatures.add("route_target");
}

/** gg: Stage 변수·접근 로그·route settings는 값을 숨기고 존재 여부만 advanced marker로 둡니다. */
function addStageAdvancedFeatures(state: FamilyReadState, stage: Stage): void {
  if (hasRecordEntries(stage.StageVariables)) state.advancedFeatures.add("stage_variables");
  if (stage.AccessLogSettings) state.advancedFeatures.add("access_logs");
  if (stage.DefaultRouteSettings || hasRecordEntries(stage.RouteSettings)) {
    state.advancedFeatures.add("stage_route_settings");
  }
}

/** gg: API endpoint·route expression·CORS 원문·tags는 public 결과에 넣지 않습니다. */
function createPublicApiConfig(api: Api): Readonly<Record<string, unknown>> {
  return {
    protocolType: api.ProtocolType,
    apiGatewayManaged: api.ApiGatewayManaged,
    hasDescription: Boolean(getNonEmptyString(api.Description)),
    hasCorsConfiguration: Boolean(api.CorsConfiguration),
    disableExecuteApiEndpoint: api.DisableExecuteApiEndpoint,
    disableSchemaValidation: api.DisableSchemaValidation,
    ipAddressType: api.IpAddressType,
    tagCount: Object.keys(api.Tags ?? {}).length,
    createdAt: api.CreatedDate?.toISOString()
  };
}

/** gg: 원본 API 설정은 이후 별도 Terraform 흐름에서만 사용할 수 있도록 private detail에 보존합니다. */
function createServerOnlyApiConfig(api: Api, apiId: string): Readonly<Record<string, unknown>> {
  return {
    apiId,
    name: api.Name,
    protocolType: api.ProtocolType,
    apiEndpoint: api.ApiEndpoint,
    apiGatewayManaged: api.ApiGatewayManaged,
    apiKeySelectionExpression: api.ApiKeySelectionExpression,
    corsConfiguration: api.CorsConfiguration,
    createdAt: api.CreatedDate?.toISOString(),
    description: api.Description,
    disableSchemaValidation: api.DisableSchemaValidation,
    disableExecuteApiEndpoint: api.DisableExecuteApiEndpoint,
    importInfo: api.ImportInfo,
    ipAddressType: api.IpAddressType,
    routeSelectionExpression: api.RouteSelectionExpression,
    tags: api.Tags,
    version: api.Version,
    warnings: api.Warnings
  };
}

/** gg: Route의 target·authorizer ID·request mapping은 공개하지 않고 사용자에게 필요한 상태만 표시합니다. */
function createPublicRouteConfig(route: Route): Readonly<Record<string, unknown>> {
  return {
    routeKey: route.RouteKey,
    apiGatewayManaged: route.ApiGatewayManaged,
    apiKeyRequired: route.ApiKeyRequired,
    authorizationType: route.AuthorizationType,
    hasAuthorizer: Boolean(getNonEmptyString(route.AuthorizerId)),
    hasAuthorizationScopes: (route.AuthorizationScopes?.length ?? 0) > 0,
    hasRequestModels: hasRecordEntries(route.RequestModels),
    hasRequestParameters: hasRecordEntries(route.RequestParameters),
    hasTarget: Boolean(getNonEmptyString(route.Target))
  };
}

/** gg: Route의 정확한 API/route ID와 mapping 원문은 server-only import detail에만 남깁니다. */
function createServerOnlyRouteConfig(
  route: Route,
  apiId: string,
  routeId: string
): Readonly<Record<string, unknown>> {
  return {
    apiId,
    routeId,
    routeKey: route.RouteKey,
    apiGatewayManaged: route.ApiGatewayManaged,
    apiKeyRequired: route.ApiKeyRequired,
    authorizationScopes: route.AuthorizationScopes,
    authorizationType: route.AuthorizationType,
    authorizerId: route.AuthorizerId,
    modelSelectionExpression: route.ModelSelectionExpression,
    operationName: route.OperationName,
    requestModels: route.RequestModels,
    requestParameters: route.RequestParameters,
    routeResponseSelectionExpression: route.RouteResponseSelectionExpression,
    target: route.Target
  };
}

/** gg: Integration URI·credentials·connection ID는 비공개로 두고 type과 존재 여부만 public config에 둡니다. */
function createPublicIntegrationConfig(integration: Integration): Readonly<Record<string, unknown>> {
  return {
    apiGatewayManaged: integration.ApiGatewayManaged,
    integrationType: integration.IntegrationType,
    integrationMethod: integration.IntegrationMethod,
    integrationSubtype: integration.IntegrationSubtype,
    connectionType: integration.ConnectionType,
    hasConnectionId: Boolean(getNonEmptyString(integration.ConnectionId)),
    hasCredentials: Boolean(getNonEmptyString(integration.CredentialsArn)),
    hasIntegrationUri: Boolean(getNonEmptyString(integration.IntegrationUri)),
    hasRequestParameters: hasRecordEntries(integration.RequestParameters),
    hasRequestTemplates: hasRecordEntries(integration.RequestTemplates),
    hasResponseParameters: hasRecordEntries(integration.ResponseParameters),
    payloadFormatVersion: integration.PayloadFormatVersion,
    timeoutInMillis: integration.TimeoutInMillis
  };
}

/** gg: Integration의 exact ID와 URI·Role ARN·mapping 원문은 Terraform 생성 전 private detail에만 보관합니다. */
function createServerOnlyIntegrationConfig(
  integration: Integration,
  apiId: string,
  integrationId: string
): Readonly<Record<string, unknown>> {
  return {
    apiId,
    integrationId,
    apiGatewayManaged: integration.ApiGatewayManaged,
    connectionId: integration.ConnectionId,
    connectionType: integration.ConnectionType,
    contentHandlingStrategy: integration.ContentHandlingStrategy,
    credentialsArn: integration.CredentialsArn,
    description: integration.Description,
    integrationMethod: integration.IntegrationMethod,
    integrationResponseSelectionExpression: integration.IntegrationResponseSelectionExpression,
    integrationSubtype: integration.IntegrationSubtype,
    integrationType: integration.IntegrationType,
    integrationUri: integration.IntegrationUri,
    passthroughBehavior: integration.PassthroughBehavior,
    payloadFormatVersion: integration.PayloadFormatVersion,
    requestParameters: integration.RequestParameters,
    requestTemplates: integration.RequestTemplates,
    responseParameters: integration.ResponseParameters,
    templateSelectionExpression: integration.TemplateSelectionExpression,
    timeoutInMillis: integration.TimeoutInMillis,
    tlsConfig: integration.TlsConfig
  };
}

/** gg: Stage의 log destination·변수·routing 설정은 노출하지 않고 존재 여부만 public result에 둡니다. */
function createPublicStageConfig(stage: Stage): Readonly<Record<string, unknown>> {
  return {
    stageName: stage.StageName,
    apiGatewayManaged: stage.ApiGatewayManaged,
    autoDeploy: stage.AutoDeploy,
    hasDescription: Boolean(getNonEmptyString(stage.Description)),
    hasAccessLogs: Boolean(stage.AccessLogSettings),
    hasDefaultRouteSettings: Boolean(stage.DefaultRouteSettings),
    hasRouteSettings: hasRecordEntries(stage.RouteSettings),
    hasStageVariables: hasRecordEntries(stage.StageVariables),
    tagCount: Object.keys(stage.Tags ?? {}).length
  };
}

/** gg: Stage의 deployment·로그·변수·route settings 원문은 server-only detail에만 보존합니다. */
function createServerOnlyStageConfig(
  stage: Stage,
  apiId: string,
  stageName: string
): Readonly<Record<string, unknown>> {
  return {
    apiId,
    stageName,
    accessLogSettings: stage.AccessLogSettings,
    apiGatewayManaged: stage.ApiGatewayManaged,
    autoDeploy: stage.AutoDeploy,
    clientCertificateId: stage.ClientCertificateId,
    createdAt: stage.CreatedDate?.toISOString(),
    defaultRouteSettings: stage.DefaultRouteSettings,
    deploymentId: stage.DeploymentId,
    description: stage.Description,
    lastDeploymentStatusMessage: stage.LastDeploymentStatusMessage,
    lastUpdatedAt: stage.LastUpdatedDate?.toISOString(),
    routeSettings: stage.RouteSettings,
    stageVariables: stage.StageVariables,
    tags: stage.Tags
  };
}

/** gg: exact import ID 기반 public hash로 AWS ID를 숨기면서 같은 scan 안의 parent/related 관계를 보존합니다. */
function createTopologyRecord(input: {
  readonly identity: RecordIdentity;
  readonly familyIdentity: RecordIdentity;
  readonly parentIdentity?: RecordIdentity;
  readonly relatedIdentities?: readonly RelatedRecordIdentity[];
  readonly region: string;
  readonly displayName: string;
  readonly publicConfig: Readonly<Record<string, unknown>>;
  readonly serverOnlyConfig: Readonly<Record<string, unknown>>;
}): CreatedTopologyRecord {
  const recordId = createPublicRecordId(input.identity);
  const familyRecordId = createPublicRecordId(input.familyIdentity);
  const relatedIdentities = input.relatedIdentities ?? [];
  return {
    publicRecord: {
      recordId,
      familyRecordId,
      providerResourceType: input.identity.providerResourceType,
      displayName: input.displayName,
      region: input.region,
      config: input.publicConfig,
      ...(input.parentIdentity ? { parentRecordId: createPublicRecordId(input.parentIdentity) } : {}),
      relatedRecordIds: relatedIdentities.map(
        (identity) => identity.publicRecordId ?? createPublicRecordId(identity)
      )
    },
    serverOnlyRecord: {
      publicRecordId: recordId,
      familyPublicApiRecordId: familyRecordId,
      providerResourceType: input.identity.providerResourceType,
      terraformImportId: input.identity.terraformImportId,
      ...(input.parentIdentity
        ? {
            parentProviderResourceType: input.parentIdentity.providerResourceType,
            parentTerraformImportId: input.parentIdentity.terraformImportId
          }
        : {}),
      relatedTerraformImportIdentities: relatedIdentities.map(
        ({ providerResourceType, terraformImportId }) => ({ providerResourceType, terraformImportId })
      ),
      serverOnlyConfig: input.serverOnlyConfig
    }
  };
}

/** gg: duplicate opaque ID는 AWS ID collision이므로 partial scan으로 닫고 먼저 읽은 원본만 보존합니다. */
function addTopologyRecord(
  state: FamilyReadState,
  record: CreatedTopologyRecord,
  scope: Exclude<AwsApiGatewayV2TopologyFailureScope, "catalog">
): boolean {
  if (state.seenRecordIds.has(record.publicRecord.recordId)) {
    markFamilyIncomplete(state, scope, "invalid_response");
    return false;
  }
  state.seenRecordIds.add(record.publicRecord.recordId);
  state.publicRecords.push(record.publicRecord);
  state.serverOnlyRecords.push(record.serverOnlyRecord);
  return true;
}

/** gg: 한 family의 reader 실패에는 API ID나 raw SDK 오류를 싣지 않습니다. */
function markFamilyIncomplete(
  state: FamilyReadState,
  scope: AwsApiGatewayV2TopologyFailureScope,
  outcome: AwsApiGatewayV2TopologyFailureOutcome
): void {
  state.readComplete = false;
  state.failures.push({ scope, outcome, familyRecordId: state.publicApiRecordId });
}

function createIdentity(providerResourceType: string, terraformImportId: string): RecordIdentity {
  return { providerResourceType, terraformImportId };
}

function createPublicRecordId(identity: RecordIdentity): string {
  return `apigwv2-ref-${createHash("sha256")
    .update(identity.providerResourceType)
    .update("\0")
    .update(identity.terraformImportId)
    .digest("hex")
    .slice(0, 24)}`;
}

function createOpaqueAwsProviderResourceId(
  providerResourceType: string,
  exactProviderResourceId: string
): string {
  return `aws-ref-${createHash("sha256")
    .update(`${providerResourceType}\0${exactProviderResourceId}`)
    .digest("hex")
    .slice(0, 24)}`;
}

function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function hasRecordEntries(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && Object.keys(value).length > 0;
}

/** gg: SDK raw message는 버리고 설정 화면이 이해할 수 있는 안전한 오류 원인으로만 줄입니다. */
function classifyReadFailure(error: unknown): AwsApiGatewayV2TopologyFailureOutcome {
  const details =
    error && typeof error === "object"
      ? (error as { readonly name?: unknown; readonly code?: unknown; readonly message?: unknown })
      : {};
  const classifier = [details.name, details.code, details.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  if (/accessdenied|unauthorized|forbidden|not authorized|permission/u.test(classifier)) {
    return "permission_denied";
  }
  if (/expired|invalidclienttoken|token.*expired|credential/u.test(classifier)) {
    return "expired_credential";
  }
  if (/invalid.*region|region.*invalid|unknownendpoint|endpoint.*region/u.test(classifier)) {
    return "invalid_region";
  }
  if (/throttl|too many requests|requestlimit/u.test(classifier)) return "throttled";
  if (/not configured|notconfigured|no default view/u.test(classifier)) return "not_configured";
  return "transient";
}

/** gg: 실제 실행에서는 연결 검증을 마친 임시 credential만 V2 SDK client에 주입합니다. */
function createDefaultApiGatewayV2TopologyReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsApiGatewayV2TopologyReadClient {
  const client = new ApiGatewayV2Client({
    region,
    credentials: {
      accessKeyId: credentials.AWS_ACCESS_KEY_ID,
      secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY,
      ...(credentials.AWS_SESSION_TOKEN ? { sessionToken: credentials.AWS_SESSION_TOKEN } : {})
    }
  });
  return {
    send: (command) => client.send(command as Parameters<ApiGatewayV2Client["send"]>[0])
  };
}

async function sendApiGatewayV2Command<TOutput>(
  client: AwsApiGatewayV2TopologyReadClient,
  command: object
): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}
