import { createHash, randomUUID } from "node:crypto";
import {
  CloudFormationClient,
  CreateStackCommand,
  DescribeStacksCommand,
  GetTemplateCommand,
  UpdateStackCommand,
  type CloudFormationClientConfig,
  type Stack
} from "@aws-sdk/client-cloudformation";
import {
  GetPolicyCommand,
  GetPolicyVersionCommand,
  GetRoleCommand,
  GetRolePolicyCommand,
  IAMClient,
  ListAttachedRolePoliciesCommand,
  ListRolePoliciesCommand,
  type IAMClientConfig
} from "@aws-sdk/client-iam";
import type { AwsConnectionRecord } from "./aws-connection-service.js";
import {
  createAwsSdkStsGateway,
  type AwsTemporaryCredentials
} from "./aws-connection-test-service.js";
import {
  publishAwsImportCloudFormationTemplateToS3,
  type AwsImportPublishedTemplate
} from "./aws-connection-template-storage.js";
import {
  createAwsImportPolicyStackCreateInput,
  createAwsImportPolicyStackUpdateInput,
  type AwsImportManagerContract
} from "./aws-import-access-manager-template.js";
import { createAwsImportReadPolicyDocument } from "./aws-import-access-catalog.js";

export type ManagerInspection = {
  verified: boolean;
  managerStackId: string | null;
  policyStackId: string | null;
  policyStackExists: boolean;
  reason?: "not_found" | "drifted" | "retry";
};

export type PolicyStackResult = {
  policyStackId: string;
  status: "accepted";
};

export type CleanupInspection = {
  verified: boolean;
  managerStackExists: boolean;
  policyStackExists: boolean;
  reason?: "drifted" | "retry";
};

export type AwsImportAccessGateway = {
  prepareManager(input: {
    connection: AwsConnectionRecord;
    contract: AwsImportManagerContract;
  }): Promise<{ consoleUrl: string }>;
  inspectManager(input: {
    connection: AwsConnectionRecord;
    contract: AwsImportManagerContract;
  }): Promise<ManagerInspection>;
  createOrUpdatePolicyStack(input: {
    connection: AwsConnectionRecord;
    contract: AwsImportManagerContract;
    operationId: string;
  }): Promise<PolicyStackResult>;
  inspectCleanup(input: {
    connection: AwsConnectionRecord;
    contract: AwsImportManagerContract;
  }): Promise<CleanupInspection>;
};

type CloudFormationClientLike = {
  send(command: unknown): Promise<unknown>;
};

type IamClientLike = {
  send(command: unknown): Promise<unknown>;
};

export type AwsImportAccessGatewayOptions = {
  templateBucketName?: string;
  createCloudFormationClient?: (config: CloudFormationClientConfig) => CloudFormationClientLike;
  createIamClient?: (config: IAMClientConfig) => IamClientLike;
  assumeConnectionRole?: (connection: AwsConnectionRecord) => Promise<AwsTemporaryCredentials>;
  publishTemplate?: (
    input: Parameters<typeof publishAwsImportCloudFormationTemplateToS3>[0]
  ) => Promise<AwsImportPublishedTemplate>;
  now?: () => Date;
};

/** gg: CloudFormation 호출은 Task 2의 exact Stack·Role·Template builder만 통과시킵니다. */
export function createAwsImportAccessGateway(
  options: AwsImportAccessGatewayOptions = {}
): AwsImportAccessGateway {
  const createClient =
    options.createCloudFormationClient ??
    ((config: CloudFormationClientConfig) => new CloudFormationClient(config));
  const assumeConnectionRole = options.assumeConnectionRole ?? defaultAssumeConnectionRole;
  const createIamClient =
    options.createIamClient ?? ((config: IAMClientConfig) => new IAMClient(config));
  const publishTemplate =
    options.publishTemplate ?? publishAwsImportCloudFormationTemplateToS3;
  const now = options.now ?? (() => new Date());

  return {
    // gg: Manager 준비는 SketchCatch private S3에 immutable Template을 올리고 Console만 엽니다.
    async prepareManager({ connection, contract }) {
      const published = await publishTemplate({
        bucketName: options.templateBucketName ?? getBucketName(contract.templateBaseUrl),
        region: connection.region,
        connectionId: connection.id,
        kind: "manager",
        contractVersion: contract.contractVersion,
        templateBody: contract.templateBody,
        expiresInSeconds: 600,
        now
      });
      const query = new URLSearchParams({
        templateURL: published.templateUrl,
        stackName: contract.managerStackName,
        capabilities: "CAPABILITY_NAMED_IAM"
      });
      return {
        consoleUrl:
          `https://console.aws.amazon.com/cloudformation/home?region=${connection.region}` +
          `#/stacks/quickcreate?${query.toString()}`
      };
    },

    // gg: exact Template hash가 맞으면 trust·Policy·attachment도 같은 계약으로 검증된 것입니다.
    async inspectManager({ connection, contract }) {
      try {
        const clients = await createConnectionClients(
          connection,
          createClient,
          createIamClient,
          assumeConnectionRole
        );
        const manager = await describeStack(clients.cloudFormation, contract.managerStackName);
        if (!manager) {
          return {
            verified: false,
            managerStackId: null,
            policyStackId: null,
            policyStackExists: false,
            reason: "not_found"
          };
        }
        const managerTemplate = await getStackTemplate(
          clients.cloudFormation,
          manager.StackId ?? contract.managerStackName
        );
        const managerContractVerified = verifyManagerStack(manager, managerTemplate, contract);
        const policy = await describeStack(clients.cloudFormation, contract.policyStackName);
        const policyTemplate = policy
          ? await getStackTemplate(
              clients.cloudFormation,
              policy.StackId ?? contract.policyStackName
            )
          : null;
        const policyVerified = policy
          ? verifyPolicyStack(policy, policyTemplate, contract)
          : true;

        const iamVerified = managerContractVerified
          ? await verifyManagerIamResources(clients.iam, contract, Boolean(policy))
          : false;
        return {
          verified: managerContractVerified && policyVerified && iamVerified,
          managerStackId: manager.StackId ?? null,
          policyStackId: policy?.StackId ?? null,
          policyStackExists: Boolean(policy),
          ...(!managerContractVerified || !policyVerified || !iamVerified
            ? { reason: "drifted" as const }
            : {})
        };
      } catch {
        return {
          verified: false,
          managerStackId: null,
          policyStackId: null,
          policyStackExists: false,
          reason: "retry"
        };
      }
    },

    // gg: caller 입력에서 Template URL·Role·tag를 받지 않고 내부 publisher 결과만 사용합니다.
    async createOrUpdatePolicyStack({ connection, contract, operationId }) {
      const client = await createConnectionClient(connection, createClient, assumeConnectionRole);
      const current = await describeStack(client, contract.policyStackName);
      const published = await publishTemplate({
        bucketName: options.templateBucketName ?? getBucketName(contract.policyTemplateBaseUrl),
        region: connection.region,
        connectionId: connection.id,
        kind: "policy",
        contractVersion: contract.policyContractVersion,
        templateBody: contract.policyTemplateBody,
        expiresInSeconds: 600,
        now
      });
      const request = current
        ? createAwsImportPolicyStackUpdateInput(contract, published, { now }, operationId)
        : createAwsImportPolicyStackCreateInput(contract, published, { now }, operationId);
      const response = current
        ? await client.send(new UpdateStackCommand(request))
        : await client.send(new CreateStackCommand(request));
      const stackId = getStackId(response) ?? current?.StackId;
      if (!stackId) throw new AwsImportAccessGatewayError("Policy Stack 작업을 시작하지 못했습니다.");
      return { policyStackId: stackId, status: "accepted" };
    },

    // gg: 정리는 exact Stack·Template·IAM artifact만 읽고 DeleteStack은 제공하지 않습니다.
    async inspectCleanup({ connection, contract }) {
      try {
        const clients = await createConnectionClients(
          connection,
          createClient,
          createIamClient,
          assumeConnectionRole
        );
        const policy = await describeStack(clients.cloudFormation, contract.policyStackName);
        const manager = await describeStack(clients.cloudFormation, contract.managerStackName);
        if (!manager && policy) {
          return {
            verified: false,
            managerStackExists: false,
            policyStackExists: true,
            reason: "drifted"
          };
        }
        const managerVerified = manager
          ? verifyManagerStack(
              manager,
              await getStackTemplate(
                clients.cloudFormation,
                manager.StackId ?? contract.managerStackName
              ),
              contract
            )
          : true;
        const policyVerified = policy
          ? verifyPolicyStack(
              policy,
              await getStackTemplate(
                clients.cloudFormation,
                policy.StackId ?? contract.policyStackName
              ),
              contract
            )
          : true;
        const iamVerified = manager
          ? await verifyManagerIamResources(clients.iam, contract, Boolean(policy))
          : true;
        return {
          verified: managerVerified && policyVerified && iamVerified,
          managerStackExists: Boolean(manager),
          policyStackExists: Boolean(policy),
          ...(!managerVerified || !policyVerified || !iamVerified
            ? { reason: "drifted" as const }
            : {})
        };
      } catch {
        return {
          verified: false,
          managerStackExists: true,
          policyStackExists: true,
          reason: "retry"
        };
      }
    }
  };
}

export class AwsImportAccessGatewayError extends Error {
  /** gg: AWS 원문 대신 사용자에게 공개 가능한 짧은 오류만 유지합니다. */
  constructor(message: string) {
    super(message);
    this.name = "AwsImportAccessGatewayError";
  }
}

/** gg: 기존 connection Role만 맡아 해당 account·region의 CloudFormation을 조회합니다. */
async function createConnectionClient(
  connection: AwsConnectionRecord,
  createClient: (config: CloudFormationClientConfig) => CloudFormationClientLike,
  assumeConnectionRole: (connection: AwsConnectionRecord) => Promise<AwsTemporaryCredentials>
): Promise<CloudFormationClientLike> {
  assertUsableConnection(connection);
  const credentials = await assumeConnectionRole(connection);
  return createClient({ region: connection.region, credentials });
}

/** gg: 한 번 얻은 exact connection credentials를 CloudFormation과 IAM read client가 공유합니다. */
async function createConnectionClients(
  connection: AwsConnectionRecord,
  createCloudFormationClient: (config: CloudFormationClientConfig) => CloudFormationClientLike,
  createIamClient: (config: IAMClientConfig) => IamClientLike,
  assumeConnectionRole: (connection: AwsConnectionRecord) => Promise<AwsTemporaryCredentials>
): Promise<{ cloudFormation: CloudFormationClientLike; iam: IamClientLike }> {
  assertUsableConnection(connection);
  const credentials = await assumeConnectionRole(connection);
  return {
    cloudFormation: createCloudFormationClient({ region: connection.region, credentials }),
    iam: createIamClient({ region: connection.region, credentials })
  };
}

/** gg: 다른 상태나 불완전한 연결로 AWS Stack 작업을 시작하지 않습니다. */
function assertUsableConnection(
  connection: AwsConnectionRecord
): asserts connection is AwsConnectionRecord & { accountId: string; roleArn: string } {
  if (connection.status !== "verified" || !connection.accountId || !connection.roleArn) {
    throw new AwsImportAccessGatewayError("검증된 AWS 연결이 필요합니다.");
  }
}

/** gg: STS session은 connection의 외부 ID와 Role만 사용합니다. */
async function defaultAssumeConnectionRole(
  connection: AwsConnectionRecord
): Promise<AwsTemporaryCredentials> {
  assertUsableConnection(connection);
  return createAwsSdkStsGateway().assumeRole({
    roleArn: connection.roleArn,
    externalId: connection.externalId,
    region: connection.region,
    roleSessionName: `sketchcatch-import-${randomUUID()}`,
    durationSeconds: 900
  });
}

/** gg: ValidationError의 Stack 부재만 정상적인 미생성 상태로 취급합니다. */
async function describeStack(
  client: CloudFormationClientLike,
  stackName: string
): Promise<Stack | null> {
  try {
    const response = (await client.send(
      new DescribeStacksCommand({ StackName: stackName })
    )) as { Stacks?: Stack[] };
    return response.Stacks?.[0] ?? null;
  } catch (error) {
    if (isStackNotFound(error)) return null;
    throw error;
  }
}

/** gg: Stack이 실제 사용한 Template 본문만 읽어 deterministic hash를 검증합니다. */
async function getStackTemplate(
  client: CloudFormationClientLike,
  stackName: string
): Promise<string | null> {
  const response = (await client.send(
    new GetTemplateCommand({ StackName: stackName, TemplateStage: "Original" })
  )) as { TemplateBody?: string };
  return response.TemplateBody ?? null;
}

/** gg: Manager Stack의 이름·상태·tag·output·전체 Template을 한 계약으로 확인합니다. */
function verifyManagerStack(
  stack: Stack,
  templateBody: string | null,
  contract: AwsImportManagerContract
): boolean {
  const expectedOutputs = {
    SketchCatchConnectionId: contract.connectionId,
    TemplateContractVersion: contract.contractVersion,
    TargetRoleArn: contract.targetRoleArn,
    CloudFormationServiceRoleArn: contract.serviceRoleArn,
    PolicyStackName: contract.policyStackName,
    PolicyStackArnPattern: contract.policyStackArn,
    PolicyTemplateSha256: contract.policyTemplateSha256,
    PolicyFingerprint: contract.policyFingerprint,
    ControlPolicyArn: contract.controlPolicyArn,
    CleanupVerificationPolicyArn: contract.cleanupVerificationPolicyArn
  };
  return (
    stack.StackName === contract.managerStackName &&
    isCompleteStackStatus(stack.StackStatus) &&
    sameKeyValues(stack.Tags, contract.ownershipTags, "Key", "Value") &&
    sameKeyValues(stack.Outputs, objectEntries(expectedOutputs), "OutputKey", "OutputValue") &&
    templateBody !== null &&
    sha256(templateBody) === contract.templateSha256
  );
}

/** gg: 기존 Policy Stack도 exact ownership과 Template hash가 아니면 갱신 승인을 막습니다. */
function verifyPolicyStack(
  stack: Stack,
  templateBody: string | null,
  contract: AwsImportManagerContract
): boolean {
  const expectedOutputs = {
    SketchCatchConnectionId: contract.connectionId,
    TemplateContractVersion: contract.policyContractVersion,
    TargetRoleArn: contract.targetRoleArn,
    ReadManagedPolicyArn: contract.readManagedPolicyArn,
    PolicyFingerprint: contract.policyFingerprint
  };
  return (
    stack.StackName === contract.policyStackName &&
    isCompleteStackStatus(stack.StackStatus) &&
    sameKeyValues(stack.Tags, contract.ownershipTags, "Key", "Value") &&
    sameKeyValues(stack.Outputs, objectEntries(expectedOutputs), "OutputKey", "OutputValue") &&
    templateBody !== null &&
    sha256(templateBody) === contract.policyTemplateSha256
  );
}

/** gg: 실제 trust·inline permission·관리 Policy·target attachment를 Task 2 contract와 비교합니다. */
async function verifyManagerIamResources(
  iam: IamClientLike,
  contract: AwsImportManagerContract,
  policyStackExists: boolean
): Promise<boolean> {
  const role = (await iam.send(new GetRoleCommand({ RoleName: contract.serviceRoleName }))) as {
    Role?: { AssumeRolePolicyDocument?: unknown };
  };
  const expectedTrust = {
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Principal: { Service: "cloudformation.amazonaws.com" },
      Action: "sts:AssumeRole"
    }]
  };
  if (!samePolicyDocument(role.Role?.AssumeRolePolicyDocument, expectedTrust)) return false;

  const inlineNames = (await iam.send(new ListRolePoliciesCommand({
    RoleName: contract.serviceRoleName
  }))) as { PolicyNames?: string[] };
  if (!(inlineNames.PolicyNames ?? []).includes(contract.serviceRoleInlinePolicyName)) return false;
  const inline = (await iam.send(new GetRolePolicyCommand({
    RoleName: contract.serviceRoleName,
    PolicyName: contract.serviceRoleInlinePolicyName
  }))) as { PolicyDocument?: unknown };
  if (!samePolicyDocument(inline.PolicyDocument, contract.serviceRolePolicyDocument)) return false;

  if (!await managedPolicyMatches(iam, contract.controlPolicyArn, contract.controlPolicyDocument)) {
    return false;
  }
  if (!await managedPolicyMatches(
    iam,
    contract.cleanupVerificationPolicyArn,
    contract.cleanupVerificationPolicyDocument
  )) {
    return false;
  }
  if (
    policyStackExists &&
    !await managedPolicyMatches(
      iam,
      contract.readManagedPolicyArn,
      createAwsImportReadPolicyDocument()
    )
  ) {
    return false;
  }

  const attachments = (await iam.send(new ListAttachedRolePoliciesCommand({
    RoleName: contract.targetRoleName
  }))) as { AttachedPolicies?: Array<{ PolicyArn?: string }> };
  const attachedArns = new Set(
    (attachments.AttachedPolicies ?? []).flatMap((item) => item.PolicyArn ? [item.PolicyArn] : [])
  );
  const required = [contract.controlPolicyArn, contract.cleanupVerificationPolicyArn];
  if (policyStackExists) required.push(contract.readManagedPolicyArn);
  return required.every((arn) => attachedArns.has(arn));
}

/** gg: managed Policy는 실제 default version document까지 exact 비교합니다. */
async function managedPolicyMatches(
  iam: IamClientLike,
  policyArn: string,
  expectedDocument: unknown
): Promise<boolean> {
  const policy = (await iam.send(new GetPolicyCommand({ PolicyArn: policyArn }))) as {
    Policy?: { DefaultVersionId?: string };
  };
  const versionId = policy.Policy?.DefaultVersionId;
  if (!versionId) return false;
  const version = (await iam.send(new GetPolicyVersionCommand({
    PolicyArn: policyArn,
    VersionId: versionId
  }))) as { PolicyVersion?: { Document?: unknown } };
  return samePolicyDocument(version.PolicyVersion?.Document, expectedDocument);
}

/** gg: IAM URL-encoded document와 object document를 같은 canonical JSON으로 비교합니다. */
function samePolicyDocument(actual: unknown, expected: unknown): boolean {
  try {
    const parsed = typeof actual === "string"
      ? JSON.parse(decodeURIComponent(actual)) as unknown
      : actual;
    return stableJson(parsed) === stableJson(expected);
  } catch {
    return false;
  }
}

/** gg: object key 순서 차이만 허용하고 배열과 값은 exact 유지합니다. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** gg: 진행 중 Stack을 완료된 계약으로 오인하지 않습니다. */
function isCompleteStackStatus(status: string | undefined): boolean {
  return status === "CREATE_COMPLETE" || status === "UPDATE_COMPLETE";
}

/** gg: Stack tag와 output은 누락·추가 없이 exact set으로 비교합니다. */
function sameKeyValues(
  actual: readonly unknown[] | undefined,
  expected: readonly unknown[],
  key: string,
  value: string
): boolean {
  const normalize = (items: readonly unknown[] | undefined) =>
    (items ?? [])
      .map((item) => {
        const record = item as Record<string, unknown>;
        return `${String(record[key])}\0${String(record[value])}`;
      })
      .sort();
  return JSON.stringify(normalize(actual)) === JSON.stringify(normalize(expected));
}

/** gg: expected output map을 AWS SDK output shape로 바꿉니다. */
function objectEntries(values: Record<string, string>): Array<Record<string, unknown>> {
  return Object.entries(values).map(([OutputKey, OutputValue]) => ({ OutputKey, OutputValue }));
}

/** gg: AWS SDK 응답에서 Stack ID 외 다른 provider 세부정보는 전달하지 않습니다. */
function getStackId(response: unknown): string | undefined {
  return typeof response === "object" && response !== null &&
      "StackId" in response && typeof response.StackId === "string"
    ? response.StackId
    : undefined;
}

/** gg: AWS SDK Stack-not-found만 부재로 바꾸고 다른 오류는 내부 retry로 분류합니다. */
function isStackNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "ValidationError";
}

/** gg: service와 gateway가 동일한 configured private bucket을 쓰는지 확인합니다. */
function getBucketName(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.hostname.startsWith("s3.")) {
    const bucket = url.pathname.split("/").filter(Boolean)[0];
    if (bucket) return bucket;
  }
  const suffixIndex = url.hostname.indexOf(".s3.");
  if (suffixIndex > 0) return url.hostname.slice(0, suffixIndex);
  throw new AwsImportAccessGatewayError("Template 저장소 설정을 확인해 주세요.");
}

/** gg: CloudFormation Template 본문은 Task 2와 같은 SHA-256 표현으로 비교합니다. */
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
