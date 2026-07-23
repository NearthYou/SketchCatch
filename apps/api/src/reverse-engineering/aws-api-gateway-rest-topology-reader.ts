import { createHash } from "node:crypto";
import {
  APIGatewayClient,
  GetAuthorizersCommand,
  GetDeploymentsCommand,
  GetIntegrationCommand,
  GetMethodCommand,
  GetModelsCommand,
  GetRequestValidatorsCommand,
  GetResourcesCommand,
  GetRestApisCommand,
  GetStagesCommand,
  type Authorizer,
  type Deployment,
  type GetAuthorizersCommandOutput,
  type GetDeploymentsCommandOutput,
  type GetIntegrationCommandOutput,
  type GetMethodCommandOutput,
  type GetModelsCommandOutput,
  type GetRequestValidatorsCommandOutput,
  type GetResourcesCommandOutput,
  type GetRestApisCommandOutput,
  type GetStagesCommandOutput,
  type Integration,
  type Method,
  type Model,
  type RequestValidator,
  type Resource,
  type RestApi,
  type Stage
} from "@aws-sdk/client-api-gateway";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";

export type AwsApiGatewayRestTopologyAdvancedFeature =
  | "resource_policy"
  | "authorizers"
  | "models"
  | "validators"
  | "response_mappings"
  | "vpc_link"
  | "integration_uri"
  | "integration_credentials"
  | "stage_variables"
  | "access_logs"
  | "canary"
  | "method_settings"
  | "cache";

export type AwsApiGatewayRestTopologyClassification = "simple" | "advanced" | "incomplete";

export type AwsApiGatewayRestTopologyFailureOutcome =
  | "permission_denied"
  | "not_configured"
  | "expired_credential"
  | "invalid_region"
  | "throttled"
  | "transient"
  | "invalid_response";

export type AwsApiGatewayRestTopologyFailureScope =
  | "catalog"
  | "resources"
  | "methods"
  | "integrations"
  | "deployments"
  | "stages"
  | "authorizers"
  | "models"
  | "validators";

export type AwsApiGatewayRestTopologyPublicRecord = {
  readonly recordId: string;
  readonly familyRecordId: string;
  readonly providerResourceType: string;
  readonly displayName: string;
  readonly region: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly parentRecordId?: string;
  readonly relatedRecordIds: readonly string[];
};

export type AwsApiGatewayRestTopologyServerOnlyRecord = {
  readonly publicRecordId: string;
  readonly familyPublicRestApiRecordId: string;
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

export type AwsApiGatewayRestTopologyFamily = {
  readonly publicRestApiRecordId: string;
  readonly readComplete: boolean;
  readonly classification: AwsApiGatewayRestTopologyClassification;
  readonly managementReady: boolean;
  readonly advancedFeatures: readonly AwsApiGatewayRestTopologyAdvancedFeature[];
};

export type AwsApiGatewayRestTopologyFailure = {
  readonly scope: AwsApiGatewayRestTopologyFailureScope;
  readonly outcome: AwsApiGatewayRestTopologyFailureOutcome;
  readonly familyRecordId?: string;
};

export type AwsApiGatewayRestTopologyReadResult = {
  readonly catalogReadComplete: boolean;
  readonly families: readonly AwsApiGatewayRestTopologyFamily[];
  readonly publicRecords: readonly AwsApiGatewayRestTopologyPublicRecord[];
  readonly serverOnlyRecords: readonly AwsApiGatewayRestTopologyServerOnlyRecord[];
  readonly failures: readonly AwsApiGatewayRestTopologyFailure[];
};

export type AwsApiGatewayRestTopologyReadClient = {
  send(command: object): Promise<unknown>;
};

export type AwsApiGatewayRestTopologyReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsApiGatewayRestTopologyReadClient;

export type ReadAwsApiGatewayRestTopologyInput = {
  readonly region: string;
  readonly credentials: TerraformAwsCredentialEnv;
  readonly createClient?: AwsApiGatewayRestTopologyReadClientFactory;
};

type PageReadResult<T> = {
  readonly items: readonly T[];
  readonly failure?: AwsApiGatewayRestTopologyFailureOutcome;
};

type FamilyReadState = {
  readonly publicRestApiRecordId: string;
  readonly publicRecords: AwsApiGatewayRestTopologyPublicRecord[];
  readonly serverOnlyRecords: AwsApiGatewayRestTopologyServerOnlyRecord[];
  readonly failures: AwsApiGatewayRestTopologyFailure[];
  readonly advancedFeatures: Set<AwsApiGatewayRestTopologyAdvancedFeature>;
  readonly seenRecordIds: Set<string>;
  readComplete: boolean;
};

type PagedCollectionPage<T> = {
  readonly items: readonly T[];
  readonly nextToken?: string | undefined;
  readonly truncated?: boolean | undefined;
};

type CreatedTopologyRecord = {
  readonly publicRecord: AwsApiGatewayRestTopologyPublicRecord;
  readonly serverOnlyRecord: AwsApiGatewayRestTopologyServerOnlyRecord;
};

type RecordIdentity = {
  readonly providerResourceType: string;
  readonly terraformImportId: string;
};

type RelatedRecordIdentity = RecordIdentity & {
  readonly publicRecordId?: string;
};

const ADVANCED_FEATURE_ORDER: readonly AwsApiGatewayRestTopologyAdvancedFeature[] = [
  "resource_policy",
  "authorizers",
  "models",
  "validators",
  "response_mappings",
  "vpc_link",
  "integration_uri",
  "integration_credentials",
  "stage_variables",
  "access_logs",
  "canary",
  "method_settings",
  "cache"
];

const DEFAULT_API_GATEWAY_MODEL_NAMES = new Set(["Empty", "Error"]);

/** gg: REST API 전체 목록과 각 하위 topology를 읽되 정확한 import 값은 server-only 결과로 분리합니다. */
export async function readAwsApiGatewayRestTopology(
  input: ReadAwsApiGatewayRestTopologyInput
): Promise<AwsApiGatewayRestTopologyReadResult> {
  const client = (input.createClient ?? createDefaultApiGatewayRestTopologyReadClient)(
    input.region,
    input.credentials
  );
  const catalog = await readPagedCollection<RestApi>(async (position) => {
    const response = await sendApiGatewayCommand<GetRestApisCommandOutput>(
      client,
      new GetRestApisCommand({ position })
    );

    return {
      items: response.items ?? [],
      nextToken: response.position,
      truncated: readAwsPaginationTruncated(response)
    };
  });
  const validCatalogItems: Array<{ readonly restApi: RestApi; readonly restApiId: string }> = [];
  const seenRestApiIds = new Set<string>();
  let catalogIdentityInvalid = false;
  for (const restApi of catalog.items) {
    const restApiId = getNonEmptyString(restApi.id);
    if (!restApiId || seenRestApiIds.has(restApiId)) {
      catalogIdentityInvalid = true;
      continue;
    }
    seenRestApiIds.add(restApiId);
    validCatalogItems.push({ restApi, restApiId });
  }
  const catalogReadComplete = catalog.failure === undefined && !catalogIdentityInvalid;
  const failures: AwsApiGatewayRestTopologyFailure[] = [
    ...(catalog.failure ? [{ scope: "catalog" as const, outcome: catalog.failure }] : []),
    ...(catalogIdentityInvalid
      ? [{ scope: "catalog" as const, outcome: "invalid_response" as const }]
      : [])
  ];
  const publicRecords: AwsApiGatewayRestTopologyPublicRecord[] = [];
  const serverOnlyRecords: AwsApiGatewayRestTopologyServerOnlyRecord[] = [];
  const families: AwsApiGatewayRestTopologyFamily[] = [];

  for (const { restApi, restApiId } of validCatalogItems) {
    const state = await readRestApiFamily({
      restApi,
      restApiId,
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
    const classification: AwsApiGatewayRestTopologyClassification = state.readComplete
      ? advancedFeatures.length > 0
        ? "advanced"
        : "simple"
      : "incomplete";
    families.push({
      publicRestApiRecordId: state.publicRestApiRecordId,
      readComplete: state.readComplete,
      classification,
      managementReady: classification === "simple",
      advancedFeatures
    });
  }

  if (!catalogReadComplete) {
    for (const family of families) {
      if (family.readComplete) {
        const index = families.indexOf(family);
        families[index] = {
          ...family,
          readComplete: false,
          classification: "incomplete",
          managementReady: false
        };
      }
    }
  }

  return { catalogReadComplete, families, publicRecords, serverOnlyRecords, failures };
}

/** gg: 한 REST API의 하위 조회 하나라도 실패하면 그 API family 전체를 관리 불가로 낮춥니다. */
async function readRestApiFamily(input: {
  readonly restApi: RestApi;
  readonly restApiId: string;
  readonly region: string;
  readonly client: AwsApiGatewayRestTopologyReadClient;
  readonly catalogReadComplete: boolean;
}): Promise<FamilyReadState> {
  const restApiIdentity = createIdentity("AWS::ApiGateway::RestApi", input.restApiId);
  const restApiRecord = createTopologyRecord({
    identity: restApiIdentity,
    familyIdentity: restApiIdentity,
    region: input.region,
    displayName: getNonEmptyString(input.restApi.name) ?? "API Gateway REST API",
    publicConfig: createPublicRestApiConfig(input.restApi),
    serverOnlyConfig: createServerOnlyRestApiConfig(input.restApi, input.restApiId)
  });
  const state: FamilyReadState = {
    publicRestApiRecordId: restApiRecord.publicRecord.recordId,
    publicRecords: [restApiRecord.publicRecord],
    serverOnlyRecords: [restApiRecord.serverOnlyRecord],
    failures: [],
    advancedFeatures: new Set(),
    seenRecordIds: new Set([restApiRecord.publicRecord.recordId]),
    readComplete: input.catalogReadComplete
  };

  if (getNonEmptyString(input.restApi.policy)) {
    state.advancedFeatures.add("resource_policy");
  }

  const resources = await readFamilyPagedCollection<Resource>(
    state,
    "resources",
    async (position) => {
      const response = await sendApiGatewayCommand<GetResourcesCommandOutput>(
        input.client,
        new GetResourcesCommand({ restApiId: input.restApiId, position, embed: ["methods"] })
      );

      return {
        items: response.items ?? [],
        nextToken: response.position,
        truncated: readAwsPaginationTruncated(response)
      };
    }
  );
  const rootResourceId = resolveRestApiRootResourceId(state, input.restApi, resources);
  if (rootResourceId) preserveServerOnlyRootResourceId(state, rootResourceId);
  await addResourceAndMethodRecords({
    ...input,
    state,
    restApiIdentity,
    resources,
    rootResourceId
  });

  const deployments = await readFamilyPagedCollection<Deployment>(
    state,
    "deployments",
    async (position) => {
      const response = await sendApiGatewayCommand<GetDeploymentsCommandOutput>(
        input.client,
        new GetDeploymentsCommand({ restApiId: input.restApiId, position })
      );

      return {
        items: response.items ?? [],
        nextToken: response.position,
        truncated: readAwsPaginationTruncated(response)
      };
    }
  );
  const deploymentIdentities = addDeploymentRecords({
    ...input,
    state,
    restApiIdentity,
    deployments
  });

  const stages = await readFamilySingleCollection<Stage>(state, "stages", async () => {
    const response = await sendApiGatewayCommand<GetStagesCommandOutput>(
      input.client,
      new GetStagesCommand({ restApiId: input.restApiId })
    );

    return response.item ?? [];
  });
  addStageRecords({ ...input, state, restApiIdentity, stages, deploymentIdentities });

  const authorizers = await readFamilyPagedCollection<Authorizer>(
    state,
    "authorizers",
    async (position) => {
      const response = await sendApiGatewayCommand<GetAuthorizersCommandOutput>(
        input.client,
        new GetAuthorizersCommand({ restApiId: input.restApiId, position })
      );

      return {
        items: response.items ?? [],
        nextToken: response.position,
        truncated: readAwsPaginationTruncated(response)
      };
    }
  );
  if (authorizers.length > 0) state.advancedFeatures.add("authorizers");

  const models = await readFamilyPagedCollection<Model>(state, "models", async (position) => {
    const response = await sendApiGatewayCommand<GetModelsCommandOutput>(
      input.client,
      new GetModelsCommand({ restApiId: input.restApiId, position })
    );

    return {
      items: response.items ?? [],
      nextToken: response.position,
      truncated: readAwsPaginationTruncated(response)
    };
  });
  if (models.some(isCustomApiGatewayModel)) state.advancedFeatures.add("models");

  const validators = await readFamilyPagedCollection<RequestValidator>(
    state,
    "validators",
    async (position) => {
      const response = await sendApiGatewayCommand<GetRequestValidatorsCommandOutput>(
        input.client,
        new GetRequestValidatorsCommand({ restApiId: input.restApiId, position })
      );

      return {
        items: response.items ?? [],
        nextToken: response.position,
        truncated: readAwsPaginationTruncated(response)
      };
    }
  );
  if (validators.length > 0) state.advancedFeatures.add("validators");

  validateResourceParentRelations(state, resources);

  return state;
}

/** gg: AWS의 `/` Resource를 Terraform 관리 노드로 만들지 않고 RestApi의 root 기준점만 검증합니다. */
function resolveRestApiRootResourceId(
  state: FamilyReadState,
  restApi: RestApi,
  resources: readonly Resource[]
): string | undefined {
  if (state.failures.some((failure) => failure.scope === "resources")) return undefined;

  const rootResources = resources.filter((resource) => !getNonEmptyString(resource.parentId));
  if (rootResources.length !== 1) {
    markFamilyIncomplete(state, "resources", "invalid_response");
    return undefined;
  }

  const rootResourceId = getNonEmptyString(rootResources[0]?.id);
  if (!rootResourceId || rootResources[0]?.path !== "/") {
    markFamilyIncomplete(state, "resources", "invalid_response");
    return undefined;
  }

  const catalogRootResourceId = getNonEmptyString(restApi.rootResourceId);
  if (catalogRootResourceId && catalogRootResourceId !== rootResourceId) {
    markFamilyIncomplete(state, "resources", "invalid_response");
  }

  return rootResourceId;
}

/** gg: `/`의 exact AWS ID는 RestApi server-only 설정에만 보존해 child parent_id 투영에 사용합니다. */
function preserveServerOnlyRootResourceId(state: FamilyReadState, rootResourceId: string): void {
  const index = state.serverOnlyRecords.findIndex(
    (record) => record.publicRecordId === state.publicRestApiRecordId
  );
  const record = state.serverOnlyRecords[index];
  if (!record) {
    markFamilyIncomplete(state, "resources", "invalid_response");
    return;
  }

  state.serverOnlyRecords[index] = {
    ...record,
    serverOnlyConfig: { ...record.serverOnlyConfig, rootResourceId }
  };
}

/** gg: Resource hierarchy와 실제 Method/Integration 상세를 함께 읽어 public 관계와 비공개 import ID를 만듭니다. */
async function addResourceAndMethodRecords(input: {
  readonly restApiId: string;
  readonly region: string;
  readonly client: AwsApiGatewayRestTopologyReadClient;
  readonly state: FamilyReadState;
  readonly restApiIdentity: RecordIdentity;
  readonly resources: readonly Resource[];
  readonly rootResourceId?: string | undefined;
}): Promise<void> {
  for (const resource of input.resources) {
    const resourceId = getNonEmptyString(resource.id);
    if (!resourceId) {
      markFamilyIncomplete(input.state, "resources", "invalid_response");
      continue;
    }
    const parentResourceId = getNonEmptyString(resource.parentId);
    if (!parentResourceId) {
      if (resourceId === input.rootResourceId) {
        for (const requestedHttpMethod of Object.keys(resource.resourceMethods ?? {})) {
          await addMethodAndIntegrationRecord({
            ...input,
            resource,
            resourceId,
            resourceIdentity: input.restApiIdentity,
            requestedHttpMethod
          });
        }
      }
      continue;
    }
    const pathPart = getNonEmptyString(resource.pathPart);
    if (!pathPart) {
      markFamilyIncomplete(input.state, "resources", "invalid_response");
      continue;
    }
    const resourceIdentity = createIdentity(
      "AWS::ApiGateway::Resource",
      `${input.restApiId}/${resourceId}`
    );
    const parentIdentity =
      parentResourceId === input.rootResourceId
        ? input.restApiIdentity
        : createIdentity("AWS::ApiGateway::Resource", `${input.restApiId}/${parentResourceId}`);
    const resourceRecord = createTopologyRecord({
      identity: resourceIdentity,
      familyIdentity: input.restApiIdentity,
      parentIdentity,
      region: input.region,
      displayName: getNonEmptyString(resource.path) ?? "API Resource",
      publicConfig: {
        path: resource.path,
        pathPart,
        hasMethods: Object.keys(resource.resourceMethods ?? {}).length > 0
      },
      serverOnlyConfig: {
        restApiId: input.restApiId,
        resourceId,
        parentResourceId,
        path: resource.path,
        pathPart
      }
    });
    if (!addTopologyRecord(input.state, resourceRecord, "resources")) continue;

    for (const requestedHttpMethod of Object.keys(resource.resourceMethods ?? {})) {
      await addMethodAndIntegrationRecord({
        ...input,
        resource,
        resourceId,
        resourceIdentity,
        requestedHttpMethod
      });
    }
  }
}

/** gg: Method가 Integration을 실제로 가진 경우에만 별도 상세를 읽고 없는 Method는 정상 상태로 보존합니다. */
async function addMethodAndIntegrationRecord(input: {
  readonly restApiId: string;
  readonly region: string;
  readonly client: AwsApiGatewayRestTopologyReadClient;
  readonly state: FamilyReadState;
  readonly restApiIdentity: RecordIdentity;
  readonly resource: Resource;
  readonly resourceId: string;
  readonly resourceIdentity: RecordIdentity;
  readonly requestedHttpMethod: string;
}): Promise<void> {
  const httpMethod = input.requestedHttpMethod.trim().toUpperCase();
  if (httpMethod.length === 0) {
    markFamilyIncomplete(input.state, "methods", "invalid_response");
    return;
  }

  let method: GetMethodCommandOutput;
  try {
    method = await sendApiGatewayCommand<GetMethodCommandOutput>(
      input.client,
      new GetMethodCommand({
        restApiId: input.restApiId,
        resourceId: input.resourceId,
        httpMethod
      })
    );
  } catch (error) {
    markFamilyIncomplete(input.state, "methods", classifyReadFailure(error));
    return;
  }
  if (!getNonEmptyString(method.authorizationType)) {
    markFamilyIncomplete(input.state, "methods", "invalid_response");
    return;
  }

  addMethodAdvancedFeatures(input.state, method);
  const methodIdentity = createIdentity(
    "AWS::ApiGateway::Method",
    `${input.restApiId}/${input.resourceId}/${httpMethod}`
  );
  const methodRecord = createTopologyRecord({
    identity: methodIdentity,
    familyIdentity: input.restApiIdentity,
    parentIdentity: input.resourceIdentity,
    region: input.region,
    displayName: `${httpMethod} ${getNonEmptyString(input.resource.path) ?? "/"}`,
    publicConfig: createPublicMethodConfig(method, httpMethod),
    serverOnlyConfig: createServerOnlyMethodConfig(method, {
      restApiId: input.restApiId,
      resourceId: input.resourceId,
      httpMethod
    })
  });
  if (!addTopologyRecord(input.state, methodRecord, "methods")) return;

  if (!method.methodIntegration) return;

  let integration: GetIntegrationCommandOutput;
  try {
    integration = await sendApiGatewayCommand<GetIntegrationCommandOutput>(
      input.client,
      new GetIntegrationCommand({
        restApiId: input.restApiId,
        resourceId: input.resourceId,
        httpMethod
      })
    );
  } catch (error) {
    markFamilyIncomplete(input.state, "integrations", classifyReadFailure(error));
    return;
  }
  if (!getNonEmptyString(integration.type)) {
    markFamilyIncomplete(input.state, "integrations", "invalid_response");
    return;
  }

  const relatedIdentities = analyzeIntegration(input.state, integration);
  const integrationIdentity = createIdentity(
    "AWS::ApiGateway::Integration",
    `${input.restApiId}/${input.resourceId}/${httpMethod}`
  );
  const integrationRecord = createTopologyRecord({
    identity: integrationIdentity,
    familyIdentity: input.restApiIdentity,
    parentIdentity: methodIdentity,
    relatedIdentities,
    region: input.region,
    displayName: `${httpMethod} ${getNonEmptyString(input.resource.path) ?? "/"} Integration`,
    publicConfig: createPublicIntegrationConfig(integration),
    serverOnlyConfig: createServerOnlyIntegrationConfig(integration, {
      restApiId: input.restApiId,
      resourceId: input.resourceId,
      httpMethod
    })
  });
  addTopologyRecord(input.state, integrationRecord, "integrations");
}

/** gg: Deployment 목록을 모두 보존해 Stage가 가리키는 정확한 배포 identity를 server-only로 연결합니다. */
function addDeploymentRecords(input: {
  readonly restApiId: string;
  readonly region: string;
  readonly state: FamilyReadState;
  readonly restApiIdentity: RecordIdentity;
  readonly deployments: readonly Deployment[];
}): ReadonlyMap<string, RecordIdentity> {
  const identities = new Map<string, RecordIdentity>();

  for (const deployment of input.deployments) {
    const deploymentId = getNonEmptyString(deployment.id);
    if (!deploymentId) {
      markFamilyIncomplete(input.state, "deployments", "invalid_response");
      continue;
    }
    const identity = createIdentity(
      "AWS::ApiGateway::Deployment",
      `${input.restApiId}/${deploymentId}`
    );
    identities.set(deploymentId, identity);
    addTopologyRecord(
      input.state,
      createTopologyRecord({
        identity,
        familyIdentity: input.restApiIdentity,
        parentIdentity: input.restApiIdentity,
        region: input.region,
        displayName: "API Deployment",
        publicConfig: {
          createdAt: deployment.createdDate?.toISOString(),
          hasDescription: Boolean(getNonEmptyString(deployment.description))
        },
        serverOnlyConfig: {
          restApiId: input.restApiId,
          deploymentId,
          description: deployment.description,
          createdAt: deployment.createdDate?.toISOString(),
          apiSummary: deployment.apiSummary
        }
      }),
      "deployments"
    );
  }

  return identities;
}

/** gg: Stage의 운영 옵션은 존재 여부만 공개하고 값·ARN은 server-only 경계 안에 둡니다. */
function addStageRecords(input: {
  readonly restApiId: string;
  readonly region: string;
  readonly state: FamilyReadState;
  readonly restApiIdentity: RecordIdentity;
  readonly stages: readonly Stage[];
  readonly deploymentIdentities: ReadonlyMap<string, RecordIdentity>;
}): void {
  for (const stage of input.stages) {
    const stageName = getNonEmptyString(stage.stageName);
    if (!stageName) {
      markFamilyIncomplete(input.state, "stages", "invalid_response");
      continue;
    }
    const deploymentId = getNonEmptyString(stage.deploymentId);
    const deploymentIdentity = deploymentId
      ? input.deploymentIdentities.get(deploymentId)
      : undefined;
    if (!deploymentId || !deploymentIdentity) {
      markFamilyIncomplete(input.state, "stages", "invalid_response");
    }
    addStageAdvancedFeatures(input.state, stage);
    const identity = createIdentity("AWS::ApiGateway::Stage", `${input.restApiId}/${stageName}`);
    addTopologyRecord(
      input.state,
      createTopologyRecord({
        identity,
        familyIdentity: input.restApiIdentity,
        parentIdentity: input.restApiIdentity,
        relatedIdentities: deploymentIdentity ? [deploymentIdentity] : [],
        region: input.region,
        displayName: stageName,
        publicConfig: createPublicStageConfig(stage),
        serverOnlyConfig: createServerOnlyStageConfig(stage, input.restApiId, stageName)
      }),
      "stages"
    );
  }
}

/** gg: Resource ID 중복과 root까지 이어지지 않는 parent cycle을 관리 가능한 구조로 올리지 않습니다. */
function validateResourceParentRelations(
  state: FamilyReadState,
  resources: readonly Resource[]
): void {
  if (state.failures.some((failure) => failure.scope === "resources")) return;

  const resourceIds = new Set<string>();
  const parentByResourceId = new Map<string, string | undefined>();
  let rootResourceId: string | undefined;
  for (const resource of resources) {
    const resourceId = getNonEmptyString(resource.id);
    if (!resourceId || resourceIds.has(resourceId)) {
      markFamilyIncomplete(state, "resources", "invalid_response");
      continue;
    }
    resourceIds.add(resourceId);
    const parentId = getNonEmptyString(resource.parentId);
    parentByResourceId.set(resourceId, parentId);
    if (!parentId) rootResourceId = resourceId;
  }

  if (!rootResourceId) {
    markFamilyIncomplete(state, "resources", "invalid_response");
    return;
  }

  for (const [resourceId, directParentId] of parentByResourceId) {
    if (!directParentId) continue;
    const visited = new Set<string>();
    let currentId = resourceId;

    while (currentId !== rootResourceId) {
      if (visited.has(currentId)) {
        markFamilyIncomplete(state, "resources", "invalid_response");
        break;
      }
      visited.add(currentId);
      const parentId = parentByResourceId.get(currentId);
      if (!parentId || !resourceIds.has(parentId)) {
        markFamilyIncomplete(state, "resources", "invalid_response");
        break;
      }
      currentId = parentId;
    }
  }

  for (const parentId of parentByResourceId.values()) {
    if (parentId && !resourceIds.has(parentId)) {
      markFamilyIncomplete(state, "resources", "invalid_response");
    }
  }
}

/** gg: Family page 실패는 원문 없이 안전한 분류만 남기고 partial item은 진단용으로 보존합니다. */
async function readFamilyPagedCollection<T>(
  state: FamilyReadState,
  scope: AwsApiGatewayRestTopologyFailureScope,
  readPage: (position: string | undefined) => Promise<PagedCollectionPage<T>>
): Promise<readonly T[]> {
  const result = await readPagedCollection(readPage);
  if (result.failure) markFamilyIncomplete(state, scope, result.failure);
  return result.items;
}

/** gg: GetStages처럼 AWS가 한 번에 전체 목록을 주는 API도 동일한 fail-closed 규칙으로 읽습니다. */
async function readFamilySingleCollection<T>(
  state: FamilyReadState,
  scope: AwsApiGatewayRestTopologyFailureScope,
  read: () => Promise<readonly T[]>
): Promise<readonly T[]> {
  try {
    return await read();
  } catch (error) {
    markFamilyIncomplete(state, scope, classifyReadFailure(error));
    return [];
  }
}

/** gg: AWS position pagination을 끝까지 읽고 실패·반복 token을 partial 성공으로 숨기지 않습니다. */
async function readPagedCollection<T>(
  readPage: (position: string | undefined) => Promise<PagedCollectionPage<T>>
): Promise<PageReadResult<T>> {
  const items: T[] = [];
  const seenTokens = new Set<string>();
  let position: string | undefined;

  do {
    try {
      const page = await readPage(position);
      items.push(...page.items);
      const nextToken = getNonEmptyString(page.nextToken);
      if (page.truncated === true && !nextToken) {
        return { items, failure: "invalid_response" };
      }
      if (nextToken && seenTokens.has(nextToken)) {
        return { items, failure: "invalid_response" };
      }
      if (nextToken) seenTokens.add(nextToken);
      position = nextToken;
    } catch (error) {
      return { items, failure: classifyReadFailure(error) };
    }
  } while (position);

  return { items };
}

/** gg: SDK별 Truncated 표기 차이를 흡수하되 명시된 boolean 값만 pagination 근거로 사용합니다. */
function readAwsPaginationTruncated(response: unknown): boolean | undefined {
  if (!response || typeof response !== "object") return undefined;
  const record = response as Readonly<Record<string, unknown>>;

  for (const key of ["isTruncated", "IsTruncated", "truncated", "Truncated"] as const) {
    if (typeof record[key] === "boolean") return record[key];
  }

  return undefined;
}

/** gg: Family incomplete 사유는 API ID나 provider 오류 원문 없이 공개 가능한 범위만 기록합니다. */
function markFamilyIncomplete(
  state: FamilyReadState,
  scope: AwsApiGatewayRestTopologyFailureScope,
  outcome: AwsApiGatewayRestTopologyFailureOutcome
): void {
  state.readComplete = false;
  state.failures.push({ scope, outcome, familyRecordId: state.publicRestApiRecordId });
}

/** gg: Method가 고급 Authorizer·Model·Validator를 참조하는지만 분류하고 ID는 공개하지 않습니다. */
function addMethodAdvancedFeatures(state: FamilyReadState, method: Method): void {
  const authorizationType = getNonEmptyString(method.authorizationType)?.toUpperCase();
  if (
    getNonEmptyString(method.authorizerId) ||
    authorizationType === "CUSTOM" ||
    authorizationType === "COGNITO_USER_POOLS"
  ) {
    state.advancedFeatures.add("authorizers");
  }
  if (getNonEmptyString(method.requestValidatorId)) state.advancedFeatures.add("validators");
  if (hasCustomModelReference(method.requestModels, method.methodResponses)) {
    state.advancedFeatures.add("models");
  }
  if (hasRecordEntries(method.methodResponses)) {
    state.advancedFeatures.add("response_mappings");
  }
}

/** gg: 안전하게 해석한 Lambda·Role만 opaque 관계로 만들고 나머지 integration 원문은 자동 관리에서 닫습니다. */
function analyzeIntegration(
  state: FamilyReadState,
  integration: Integration
): readonly RelatedRecordIdentity[] {
  const relatedIdentities: RelatedRecordIdentity[] = [];
  if (
    integration.connectionType === "VPC_LINK" ||
    Boolean(getNonEmptyString(integration.connectionId))
  ) {
    state.advancedFeatures.add("vpc_link");
  }

  const integrationType = getNonEmptyString(integration.type)?.toUpperCase();
  const integrationUri = getNonEmptyString(integration.uri);
  if (integrationType === "AWS" || integrationType === "AWS_PROXY") {
    const lambdaIdentity = integrationUri ? parseLambdaIntegrationUri(integrationUri) : undefined;
    if (lambdaIdentity) relatedIdentities.push(lambdaIdentity);
    else state.advancedFeatures.add("integration_uri");
  } else if (integrationType === "HTTP" || integrationType === "HTTP_PROXY") {
    if (!integrationUri || !isHttpIntegrationUri(integrationUri)) {
      state.advancedFeatures.add("integration_uri");
    }
  } else if (integrationType === "MOCK") {
    if (integrationUri) state.advancedFeatures.add("integration_uri");
  } else {
    state.advancedFeatures.add("integration_uri");
  }

  const credentials = getNonEmptyString(integration.credentials);
  if (credentials) {
    const roleIdentity = parseIamRoleCredentials(credentials);
    if (roleIdentity) relatedIdentities.push(roleIdentity);
    else state.advancedFeatures.add("integration_credentials");
  }
  if ((integration.cacheKeyParameters?.length ?? 0) > 0) {
    state.advancedFeatures.add("cache");
  }
  if (hasRecordEntries(integration.integrationResponses)) {
    state.advancedFeatures.add("response_mappings");
  }

  return relatedIdentities;
}

/** gg: Lambda invoke URI의 partition·region·account·함수 이름이 정확히 일치할 때만 cross-service 관계를 만듭니다. */
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

/** gg: API Gateway가 assume할 수 있는 exact IAM Role ARN만 연결하고 user passthrough 등은 고급 기능으로 남깁니다. */
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

/** gg: HTTP integration은 유효한 http/https URL만 단순 topology로 인정합니다. */
function isHttpIntegrationUri(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** gg: Stage 운영 옵션은 값이 아니라 지원 범위를 넘는 기능의 존재 여부로만 분류합니다. */
function addStageAdvancedFeatures(state: FamilyReadState, stage: Stage): void {
  if (hasRecordEntries(stage.variables)) state.advancedFeatures.add("stage_variables");
  if (stage.accessLogSettings) state.advancedFeatures.add("access_logs");
  if (stage.canarySettings) state.advancedFeatures.add("canary");
  if (hasRecordEntries(stage.methodSettings)) state.advancedFeatures.add("method_settings");
  if (
    stage.cacheClusterEnabled === true ||
    Object.values(stage.methodSettings ?? {}).some((setting) => setting.cachingEnabled === true)
  ) {
    state.advancedFeatures.add("cache");
  }
}

/** gg: AWS 기본 Empty/Error Model은 단순 API에도 존재하므로 사용자 Model만 고급 기능으로 봅니다. */
function isCustomApiGatewayModel(model: Model): boolean {
  const name = getNonEmptyString(model.name);
  return name === undefined || !DEFAULT_API_GATEWAY_MODEL_NAMES.has(name);
}

/** gg: Method request/response에서 기본 Model 외 참조가 하나라도 있는지 확인합니다. */
function hasCustomModelReference(
  requestModels: Readonly<Record<string, string>> | undefined,
  methodResponses: Method["methodResponses"]
): boolean {
  const names = [
    ...Object.values(requestModels ?? {}),
    ...Object.values(methodResponses ?? {}).flatMap((response) =>
      Object.values(response.responseModels ?? {})
    )
  ];
  return names.some((name) => !DEFAULT_API_GATEWAY_MODEL_NAMES.has(name));
}

/** gg: REST API 공개 설정은 policy와 tag 값을 버리고 재현 범위 판단에 필요한 표시만 남깁니다. */
function createPublicRestApiConfig(restApi: RestApi): Readonly<Record<string, unknown>> {
  return {
    name: restApi.name,
    hasDescription: Boolean(getNonEmptyString(restApi.description)),
    version: restApi.version,
    binaryMediaTypes: restApi.binaryMediaTypes,
    minimumCompressionSize: restApi.minimumCompressionSize,
    apiKeySource: restApi.apiKeySource,
    endpointTypes: restApi.endpointConfiguration?.types,
    disableExecuteApiEndpoint: restApi.disableExecuteApiEndpoint,
    hasResourcePolicy: Boolean(getNonEmptyString(restApi.policy)),
    tagCount: Object.keys(restApi.tags ?? {}).length
  };
}

/** gg: Terraform 재현에 필요한 원문은 응답용 config와 분리된 server-only 저장 후보로 만듭니다. */
function createServerOnlyRestApiConfig(
  restApi: RestApi,
  restApiId: string
): Readonly<Record<string, unknown>> {
  return {
    restApiId,
    name: restApi.name,
    description: restApi.description,
    version: restApi.version,
    binaryMediaTypes: restApi.binaryMediaTypes,
    minimumCompressionSize: restApi.minimumCompressionSize,
    apiKeySource: restApi.apiKeySource,
    endpointConfiguration: restApi.endpointConfiguration,
    disableExecuteApiEndpoint: restApi.disableExecuteApiEndpoint,
    policyBody: restApi.policy,
    tags: restApi.tags
  };
}

/** gg: Method 공개 설정에는 Authorizer·Validator·Model의 exact ID 대신 존재 여부만 둡니다. */
function createPublicMethodConfig(
  method: Method,
  httpMethod: string
): Readonly<Record<string, unknown>> {
  return {
    httpMethod,
    authorizationType: method.authorizationType,
    apiKeyRequired: method.apiKeyRequired,
    hasAuthorizer: Boolean(getNonEmptyString(method.authorizerId)),
    hasValidator: Boolean(getNonEmptyString(method.requestValidatorId)),
    hasRequestParameters: hasRecordEntries(method.requestParameters),
    hasRequestModels: hasRecordEntries(method.requestModels),
    responseCount: Object.keys(method.methodResponses ?? {}).length
  };
}

/** gg: Method의 composite identity 구성값과 세부 설정은 server-only 경계에서만 보존합니다. */
function createServerOnlyMethodConfig(
  method: Method,
  identity: { readonly restApiId: string; readonly resourceId: string; readonly httpMethod: string }
): Readonly<Record<string, unknown>> {
  return {
    ...identity,
    authorizationType: method.authorizationType,
    authorizerId: method.authorizerId,
    apiKeyRequired: method.apiKeyRequired,
    requestValidatorId: method.requestValidatorId,
    operationName: method.operationName,
    requestParameters: method.requestParameters,
    requestModels: method.requestModels,
    methodResponses: method.methodResponses,
    authorizationScopes: method.authorizationScopes
  };
}

/** gg: Integration URI·Role ARN·VpcLink ID는 공개하지 않고 기능 유형만 보여줍니다. */
function createPublicIntegrationConfig(
  integration: Integration
): Readonly<Record<string, unknown>> {
  return {
    integrationType: integration.type,
    integrationHttpMethod: integration.httpMethod,
    connectionType: integration.connectionType,
    hasVpcLink:
      integration.connectionType === "VPC_LINK" ||
      Boolean(getNonEmptyString(integration.connectionId)),
    hasCredentials: Boolean(getNonEmptyString(integration.credentials)),
    hasRequestParameters: hasRecordEntries(integration.requestParameters),
    hasRequestTemplates: hasRecordEntries(integration.requestTemplates),
    cacheConfigured: (integration.cacheKeyParameters?.length ?? 0) > 0,
    passthroughBehavior: integration.passthroughBehavior,
    contentHandling: integration.contentHandling,
    timeoutInMillis: integration.timeoutInMillis
  };
}

/** gg: Integration의 정확한 URI와 Role은 Terraform 생성 전까지 server-only로만 전달합니다. */
function createServerOnlyIntegrationConfig(
  integration: Integration,
  identity: { readonly restApiId: string; readonly resourceId: string; readonly httpMethod: string }
): Readonly<Record<string, unknown>> {
  return {
    ...identity,
    integrationType: integration.type,
    integrationHttpMethod: integration.httpMethod,
    integrationUri: integration.uri,
    connectionType: integration.connectionType,
    connectionId: integration.connectionId,
    credentialsArn: integration.credentials,
    requestParameters: integration.requestParameters,
    requestTemplates: integration.requestTemplates,
    passthroughBehavior: integration.passthroughBehavior,
    contentHandling: integration.contentHandling,
    timeoutInMillis: integration.timeoutInMillis,
    cacheNamespace: integration.cacheNamespace,
    cacheKeyParameters: integration.cacheKeyParameters,
    integrationResponses: integration.integrationResponses,
    tlsConfig: integration.tlsConfig
  };
}

/** gg: Stage 공개 설정은 운영 옵션의 값과 ARN 없이 단순/고급 판정용 marker만 남깁니다. */
function createPublicStageConfig(stage: Stage): Readonly<Record<string, unknown>> {
  return {
    stageName: stage.stageName,
    hasDescription: Boolean(getNonEmptyString(stage.description)),
    tracingEnabled: stage.tracingEnabled,
    hasStageVariables: hasRecordEntries(stage.variables),
    hasAccessLogs: Boolean(stage.accessLogSettings),
    hasCanary: Boolean(stage.canarySettings),
    cacheEnabled:
      stage.cacheClusterEnabled === true ||
      Object.values(stage.methodSettings ?? {}).some((setting) => setting.cachingEnabled === true),
    tagCount: Object.keys(stage.tags ?? {}).length
  };
}

/** gg: Stage variable·로그 ARN·canary 값은 공개 응답과 분리된 server-only 설정으로 보존합니다. */
function createServerOnlyStageConfig(
  stage: Stage,
  restApiId: string,
  stageName: string
): Readonly<Record<string, unknown>> {
  return {
    restApiId,
    stageName,
    deploymentId: stage.deploymentId,
    clientCertificateId: stage.clientCertificateId,
    description: stage.description,
    cacheClusterEnabled: stage.cacheClusterEnabled,
    cacheClusterSize: stage.cacheClusterSize,
    methodSettings: stage.methodSettings,
    variables: stage.variables,
    documentationVersion: stage.documentationVersion,
    accessLogSettings: stage.accessLogSettings,
    canarySettings: stage.canarySettings,
    tracingEnabled: stage.tracingEnabled,
    webAclArn: stage.webAclArn,
    tags: stage.tags
  };
}

/** gg: exact import identity로 만든 불투명 ID만 공개해 parent 관계는 유지하고 AWS ID는 숨깁니다. */
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
      ...(input.parentIdentity
        ? { parentRecordId: createPublicRecordId(input.parentIdentity) }
        : {}),
      relatedRecordIds: relatedIdentities.map(
        (identity) => identity.publicRecordId ?? createPublicRecordId(identity)
      )
    },
    serverOnlyRecord: {
      publicRecordId: recordId,
      familyPublicRestApiRecordId: familyRecordId,
      providerResourceType: input.identity.providerResourceType,
      terraformImportId: input.identity.terraformImportId,
      ...(input.parentIdentity
        ? {
            parentProviderResourceType: input.parentIdentity.providerResourceType,
            parentTerraformImportId: input.parentIdentity.terraformImportId
          }
        : {}),
      relatedTerraformImportIdentities: relatedIdentities.map(
        ({ providerResourceType, terraformImportId }) => ({
          providerResourceType,
          terraformImportId
        })
      ),
      serverOnlyConfig: input.serverOnlyConfig
    }
  };
}

/** gg: provider type이 포함된 public identity를 family 안에서 한 번만 받아 child 덮어쓰기를 막습니다. */
function addTopologyRecord(
  state: FamilyReadState,
  record: CreatedTopologyRecord,
  scope: AwsApiGatewayRestTopologyFailureScope
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

/** gg: provider type과 import ID 조합을 명시해 같은 composite ID를 쓰는 Method/Integration도 구분합니다. */
function createIdentity(providerResourceType: string, terraformImportId: string): RecordIdentity {
  return { providerResourceType, terraformImportId };
}

/** gg: 정확한 AWS/composite ID 대신 안정적인 단방향 hash만 공개 관계 키로 사용합니다. */
function createPublicRecordId(identity: RecordIdentity): string {
  return `apigw-ref-${createHash("sha256")
    .update(identity.providerResourceType)
    .update("\0")
    .update(identity.terraformImportId)
    .digest("hex")
    .slice(0, 24)}`;
}

/** gg: 다른 상세 reader와 같은 opaque ID를 사용해 공개 ARN 없이 same-scan 관계를 연결합니다. */
function createOpaqueAwsProviderResourceId(
  providerResourceType: string,
  exactProviderResourceId: string
): string {
  return `aws-ref-${createHash("sha256")
    .update(`${providerResourceType}\0${exactProviderResourceId}`)
    .digest("hex")
    .slice(0, 24)}`;
}

/** gg: 빈 값은 identity나 feature 존재 근거로 쓰지 않도록 한 번에 정규화합니다. */
function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** gg: Map 형태 설정이 실제 값을 하나 이상 포함하는지 안전하게 판정합니다. */
function hasRecordEntries(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && Object.keys(value).length > 0;
}

/** gg: SDK 오류 원문은 버리고 기존 Reverse Engineering과 같은 안전한 실패 범주만 남깁니다. */
function classifyReadFailure(error: unknown): AwsApiGatewayRestTopologyFailureOutcome {
  const details =
    error && typeof error === "object"
      ? (error as { readonly name?: unknown; readonly code?: unknown; readonly message?: unknown })
      : {};
  const classifier = [details.name, details.code, details.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (/accessdenied|unauthorized|forbidden|not authorized/u.test(classifier)) {
    return "permission_denied";
  }
  if (/expiredtoken|expired credential|invalidclienttokenid|unrecognizedclient/u.test(classifier)) {
    return "expired_credential";
  }
  if (/throttl|too many request|requestlimitexceeded/u.test(classifier)) return "throttled";
  if (/invalid.*region|unknownendpoint|endpoint.*region/u.test(classifier)) return "invalid_region";
  if (/notconfigured|not configured|no default view/u.test(classifier)) return "not_configured";
  return "transient";
}

/** gg: 운영 시에는 검증된 임시 자격 증명만 SDK client에 전달하고 module 밖으로 노출하지 않습니다. */
function createDefaultApiGatewayRestTopologyReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsApiGatewayRestTopologyReadClient {
  const client = new APIGatewayClient({
    region,
    credentials: {
      accessKeyId: credentials.AWS_ACCESS_KEY_ID,
      secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY,
      ...(credentials.AWS_SESSION_TOKEN ? { sessionToken: credentials.AWS_SESSION_TOKEN } : {})
    }
  });

  return {
    send: (command) => client.send(command as Parameters<APIGatewayClient["send"]>[0])
  };
}

/** gg: 테스트 client와 실제 SDK client가 같은 좁은 send 계약을 쓰도록 출력 변환을 한곳에 둡니다. */
async function sendApiGatewayCommand<TOutput>(
  client: AwsApiGatewayRestTopologyReadClient,
  command: object
): Promise<TOutput> {
  return (await client.send(command)) as TOutput;
}
