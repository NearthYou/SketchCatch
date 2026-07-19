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
  AWS_IMPORT_CONTRACT_VERSION_TAG_KEY,
  createAwsImportPolicyStackCreateInput,
  createAwsImportPolicyStackUpdateInput,
  type AwsImportManagerContract
} from "./aws-import-access-manager-template.js";
import {
  AWS_IMPORT_READERS,
  createAwsImportReadPolicyDocument
} from "./aws-import-access-catalog.js";

export type ExpectedManagerStackState = {
  stackId: string;
  contractVersion: string;
  templateSha256: string;
};

export type ExpectedCurrentImportAccessState = {
  manager?: ExpectedManagerStackState;
  policy?: Extract<ExpectedPolicyStackState, { kind: "present" }>;
};

export type ManagerInspection = {
  verified: boolean;
  managerStatus: "absent" | "target" | "owned_older" | "invalid";
  managerStackId: string | null;
  managerContractVersion: string | null;
  managerTemplateSha256: string | null;
  policyStatus: "absent" | "target" | "owned_older" | "invalid";
  policyStackId: string | null;
  policyStackExists: boolean;
  policyContractVersion: string | null;
  policyTemplateSha256: string | null;
  policyFingerprint: string | null;
  reason?: "not_found" | "drifted" | "retry";
};

export type PolicyStackResult = {
  policyStackId: string;
  status: "accepted" | "already_current";
};

export type ExpectedPolicyStackState =
  | { kind: "absent" }
  | {
      kind: "present";
      stackId: string;
      contractVersion: string;
      templateSha256: string;
      policyFingerprint: string;
    };

export type ManagerPreparationMode =
  | { kind: "create" }
  | { kind: "update"; stackId: string };

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
    mode: ManagerPreparationMode;
  }): Promise<{ consoleUrl: string }>;
  inspectManager(input: {
    connection: AwsConnectionRecord;
    contract: AwsImportManagerContract;
    expectedCurrent?: ExpectedCurrentImportAccessState;
  }): Promise<ManagerInspection>;
  createOrUpdatePolicyStack(input: {
    connection: AwsConnectionRecord;
    contract: AwsImportManagerContract;
    operationId: string;
    expectedPolicy: ExpectedPolicyStackState;
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
    async prepareManager({ connection, contract, mode }) {
      if (mode.kind === "update") assertExpectedManagerStackId(contract, mode.stackId);
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
      const query = new URLSearchParams(mode.kind === "create"
        ? {
            templateURL: published.templateUrl,
            stackName: contract.managerStackName,
            capabilities: "CAPABILITY_NAMED_IAM"
          }
        : {
            stackId: mode.stackId,
            templateURL: published.templateUrl,
            capabilities: "CAPABILITY_NAMED_IAM"
          });
      return {
        consoleUrl:
          `https://console.aws.amazon.com/cloudformation/home?region=${connection.region}` +
          `#/stacks/${mode.kind === "create" ? "quickcreate" : "update/template"}?${query.toString()}`
      };
    },

    // gg: exact Template hash가 맞으면 trust·Policy·attachment도 같은 계약으로 검증된 것입니다.
    async inspectManager({ connection, contract, expectedCurrent }) {
      try {
        const clients = await createConnectionClients(
          connection,
          createClient,
          createIamClient,
          assumeConnectionRole
        );
        const manager = await describeStack(clients.cloudFormation, contract.managerStackName);
        const policy = await describeStack(clients.cloudFormation, contract.policyStackName);
        const managerTemplate = manager
          ? await getStackTemplate(
              clients.cloudFormation,
              manager.StackId ?? contract.managerStackName
            )
          : null;
        const policyTemplate = policy
          ? await getStackTemplate(
              clients.cloudFormation,
              policy.StackId ?? contract.policyStackName
            )
          : null;
        const managerInspection = inspectManagerStack(
          manager,
          managerTemplate,
          contract,
          expectedCurrent
        );
        const policyInspection = inspectPolicyStack(
          policy,
          policyTemplate,
          contract,
          expectedCurrent
        );
        const iamVerified = managerInspection.status === "target" &&
          policyInspection.status !== "invalid"
          ? await verifyManagerIamResources(
              clients.iam,
              contract,
              policyInspection.policyDocument
            )
          : false;
        const verified = managerInspection.status === "target" &&
          policyInspection.status !== "invalid" && iamVerified;
        return {
          verified,
          managerStatus: managerInspection.status,
          managerStackId: managerInspection.stackId,
          managerContractVersion: managerInspection.contractVersion,
          managerTemplateSha256: managerInspection.templateSha256,
          policyStatus: policyInspection.status,
          policyStackId: policyInspection.stackId,
          policyStackExists: policyInspection.status !== "absent",
          policyContractVersion: policyInspection.contractVersion,
          policyTemplateSha256: policyInspection.templateSha256,
          policyFingerprint: policyInspection.policyFingerprint,
          ...(!verified
            ? {
                reason: managerInspection.status === "absent" &&
                    policyInspection.status === "absent"
                  ? "not_found" as const
                  : "drifted" as const
              }
            : {})
        };
      } catch {
        return {
          verified: false,
          managerStatus: "invalid",
          managerStackId: null,
          managerContractVersion: null,
          managerTemplateSha256: null,
          policyStatus: "invalid",
          policyStackId: null,
          policyStackExists: false,
          policyContractVersion: null,
          policyTemplateSha256: null,
          policyFingerprint: null,
          reason: "retry"
        };
      }
    },

    // gg: caller 입력에서 Template URL·Role·tag를 받지 않고 내부 publisher 결과만 사용합니다.
    async createOrUpdatePolicyStack({ connection, contract, operationId, expectedPolicy }) {
      const client = await createConnectionClient(connection, createClient, assumeConnectionRole);
      const current = await describeStack(
        client,
        expectedPolicy.kind === "present" ? expectedPolicy.stackId : contract.policyStackName
      );
      if (expectedPolicy.kind === "absent" && current) {
        throw new AwsImportAccessGatewayError("AWS 상태가 달라졌습니다. 다시 확인해 주세요.");
      }
      if (expectedPolicy.kind === "present") {
        if (
          !current ||
          current.StackId !== expectedPolicy.stackId ||
          !verifyExpectedPolicyStack(
            current,
            await getStackTemplate(client, expectedPolicy.stackId),
            contract,
            expectedPolicy
          )
        ) {
          throw new AwsImportAccessGatewayError("AWS 상태가 달라졌습니다. 다시 확인해 주세요.");
        }
        if (
          expectedPolicy.contractVersion === contract.policyContractVersion &&
          expectedPolicy.templateSha256 === contract.policyTemplateSha256 &&
          expectedPolicy.policyFingerprint === contract.policyFingerprint
        ) {
          return { policyStackId: expectedPolicy.stackId, status: "already_current" };
        }
      }
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
      const request = expectedPolicy.kind === "present"
        ? createAwsImportPolicyStackUpdateInput(
            contract,
            published,
            { now },
            operationId,
            expectedPolicy.stackId
          )
        : createAwsImportPolicyStackCreateInput(contract, published, { now }, operationId);
      const response = expectedPolicy.kind === "present"
        ? await client.send(new UpdateStackCommand(request))
        : await client.send(new CreateStackCommand(request));
      const stackId = getStackId(response) ??
        (expectedPolicy.kind === "present" ? expectedPolicy.stackId : undefined);
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
          ? await verifyManagerIamResources(
              clients.iam,
              contract,
              policy ? createAwsImportReadPolicyDocument() : null
            )
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

type InspectedManagerStack = {
  status: ManagerInspection["managerStatus"];
  stackId: string | null;
  contractVersion: string | null;
  templateSha256: string | null;
};

type InspectedPolicyStack = {
  status: ManagerInspection["policyStatus"];
  stackId: string | null;
  contractVersion: string | null;
  templateSha256: string | null;
  policyFingerprint: string | null;
  policyDocument: unknown | null;
};

/** gg: Manager target validity와 이전에 검증한 owned Stack identity를 분리합니다. */
function inspectManagerStack(
  stack: Stack | null,
  templateBody: string | null,
  contract: AwsImportManagerContract,
  expectedCurrent: ExpectedCurrentImportAccessState | undefined
): InspectedManagerStack {
  if (!stack) {
    return {
      status: "absent",
      stackId: null,
      contractVersion: null,
      templateSha256: null
    };
  }
  if (verifyManagerStack(stack, templateBody, contract)) {
    return {
      status: "target",
      stackId: stack.StackId ?? null,
      contractVersion: contract.contractVersion,
      templateSha256: contract.templateSha256
    };
  }
  const expected = expectedCurrent?.manager;
  if (
    expected &&
    (expected.contractVersion !== contract.contractVersion ||
      expected.templateSha256 !== contract.templateSha256) &&
    verifyExpectedManagerStack(
      stack,
      templateBody,
      contract,
      expected,
      expectedCurrent?.policy
    )
  ) {
    return {
      status: "owned_older",
      stackId: expected.stackId,
      contractVersion: expected.contractVersion,
      templateSha256: expected.templateSha256
    };
  }
  return {
    status: "invalid",
    stackId: null,
    contractVersion: null,
    templateSha256: null
  };
}

/** gg: Policy target 여부와 승인 가능한 owned older current state를 독립적으로 분류합니다. */
function inspectPolicyStack(
  stack: Stack | null,
  templateBody: string | null,
  contract: AwsImportManagerContract,
  expectedCurrent: ExpectedCurrentImportAccessState | undefined
): InspectedPolicyStack {
  if (!stack) {
    return {
      status: "absent",
      stackId: null,
      contractVersion: null,
      templateSha256: null,
      policyFingerprint: null,
      policyDocument: null
    };
  }
  if (verifyPolicyStack(stack, templateBody, contract)) {
    return {
      status: "target",
      stackId: stack.StackId ?? null,
      contractVersion: contract.policyContractVersion,
      templateSha256: contract.policyTemplateSha256,
      policyFingerprint: contract.policyFingerprint,
      policyDocument: createAwsImportReadPolicyDocument()
    };
  }
  const expected = expectedCurrent?.policy;
  if (
    expected &&
    (expected.contractVersion !== contract.policyContractVersion ||
      expected.templateSha256 !== contract.policyTemplateSha256 ||
      expected.policyFingerprint !== contract.policyFingerprint) &&
    verifyExpectedPolicyStack(stack, templateBody, contract, expected)
  ) {
    const policyDocument = extractSafeOwnedPolicyDocument(templateBody, contract, expected);
    if (policyDocument !== null) {
      return {
        status: "owned_older",
        stackId: expected.stackId,
        contractVersion: expected.contractVersion,
        templateSha256: expected.templateSha256,
        policyFingerprint: expected.policyFingerprint,
        policyDocument
      };
    }
  }
  return {
    status: "invalid",
    stackId: null,
    contractVersion: null,
    templateSha256: null,
    policyFingerprint: null,
    policyDocument: null
  };
}

/** gg: 저장해 둔 exact prior Manager identity가 실제 owned Stack과 계속 일치할 때만 갱신 URL을 허용합니다. */
function verifyExpectedManagerStack(
  stack: Stack,
  templateBody: string | null,
  contract: AwsImportManagerContract,
  expectedManager: ExpectedManagerStackState,
  expectedPolicy: Extract<ExpectedPolicyStackState, { kind: "present" }> | undefined
): boolean {
  const outputs = keyValueRecord(stack.Outputs, "OutputKey", "OutputValue");
  const tags = keyValueRecord(stack.Tags, "Key", "Value");
  const contractTag = tags[AWS_IMPORT_CONTRACT_VERSION_TAG_KEY];
  return (
    stack.StackId === expectedManager.stackId &&
    stack.StackName === contract.managerStackName &&
    isCompleteStackStatus(stack.StackStatus) &&
    Object.keys(tags).length === 2 &&
    tags.SketchCatchConnectionId === contract.connectionId &&
    typeof contractTag === "string" && /^[A-Za-z0-9._-]{1,32}$/u.test(contractTag) &&
    outputs.SketchCatchConnectionId === contract.connectionId &&
    outputs.TemplateContractVersion === expectedManager.contractVersion &&
    outputs.TargetRoleArn === contract.targetRoleArn &&
    outputs.CloudFormationServiceRoleArn === contract.serviceRoleArn &&
    outputs.PolicyStackName === contract.policyStackName &&
    outputs.PolicyStackArnPattern === contract.policyStackArn &&
    outputs.ControlPolicyArn === contract.controlPolicyArn &&
    outputs.CleanupVerificationPolicyArn === contract.cleanupVerificationPolicyArn &&
    (expectedPolicy
      ? outputs.PolicyTemplateSha256 === expectedPolicy.templateSha256 &&
        outputs.PolicyFingerprint === expectedPolicy.policyFingerprint
      : isSha256(outputs.PolicyTemplateSha256) && isSha256(outputs.PolicyFingerprint)) &&
    Object.keys(outputs).length === 10 &&
    templateBody !== null &&
    sha256(templateBody) === expectedManager.templateSha256
  );
}

/** gg: older Policy는 현재 reader catalog의 action 부분집합인 단일 ManagedPolicy Template만 허용합니다. */
function extractSafeOwnedPolicyDocument(
  templateBody: string | null,
  contract: AwsImportManagerContract,
  expected: Extract<ExpectedPolicyStackState, { kind: "present" }>
): unknown | null {
  if (templateBody === null) return null;
  try {
    const template = JSON.parse(templateBody) as Record<string, unknown>;
    if (!hasExactKeys(template, [
      "AWSTemplateFormatVersion",
      "Description",
      "Resources",
      "Outputs"
    ])) return null;
    const resources = asRecord(template.Resources);
    if (!resources || !hasExactKeys(resources, ["ImportReadManagedPolicy"])) return null;
    const resource = asRecord(resources.ImportReadManagedPolicy);
    if (!resource || !hasExactKeys(resource, ["Type", "Properties"]) ||
      resource.Type !== "AWS::IAM::ManagedPolicy") return null;
    const properties = asRecord(resource.Properties);
    if (!properties || !hasExactKeys(properties, [
      "ManagedPolicyName",
      "Description",
      "PolicyDocument",
      "Roles"
    ])) return null;
    if (
      properties.ManagedPolicyName !== contract.readManagedPolicyName ||
      JSON.stringify(properties.Roles) !== JSON.stringify([contract.targetRoleName])
    ) return null;
    const policy = asRecord(properties.PolicyDocument);
    if (!policy || !hasExactKeys(policy, ["Version", "Statement"]) ||
      policy.Version !== "2012-10-17" || !Array.isArray(policy.Statement) ||
      policy.Statement.length !== 1) return null;
    const statement = asRecord(policy.Statement[0]);
    if (!statement || !hasExactKeys(statement, ["Sid", "Effect", "Action", "Resource"]) ||
      statement.Sid !== "ReadImportedArchitecture" || statement.Effect !== "Allow" ||
      statement.Resource !== "*" || !Array.isArray(statement.Action) ||
      statement.Action.length === 0) return null;
    const allowedActions = new Set(AWS_IMPORT_READERS.flatMap((reader) => reader.actions));
    const actions = statement.Action;
    if (
      actions.some((action) => typeof action !== "string" || !allowedActions.has(action)) ||
      new Set(actions).size !== actions.length
    ) return null;
    if (sha256(JSON.stringify(policy)) !== expected.policyFingerprint) return null;
    const outputs = asRecord(template.Outputs);
    const expectedOutputs = {
      SketchCatchConnectionId: { Value: contract.connectionId },
      TemplateContractVersion: { Value: expected.contractVersion },
      TargetRoleArn: { Value: contract.targetRoleArn },
      ReadManagedPolicyArn: { Value: contract.readManagedPolicyArn },
      PolicyFingerprint: { Value: expected.policyFingerprint }
    };
    if (!outputs || stableJson(outputs) !== stableJson(expectedOutputs)) return null;
    return policy;
  } catch {
    return null;
  }
}

/** gg: apply 직전에는 승인 시점의 current Policy identity를 target 계약과 별도로 확인합니다. */
function verifyExpectedPolicyStack(
  stack: Stack,
  templateBody: string | null,
  contract: AwsImportManagerContract,
  expected: Extract<ExpectedPolicyStackState, { kind: "present" }>
): boolean {
  const expectedOutputs = {
    SketchCatchConnectionId: contract.connectionId,
    TemplateContractVersion: expected.contractVersion,
    TargetRoleArn: contract.targetRoleArn,
    ReadManagedPolicyArn: contract.readManagedPolicyArn,
    PolicyFingerprint: expected.policyFingerprint
  };
  const expectedTags = contract.ownershipTags.map((tag) => tag.Key ===
      AWS_IMPORT_CONTRACT_VERSION_TAG_KEY
    ? { ...tag, Value: expected.contractVersion }
    : { ...tag });
  return (
    stack.StackId === expected.stackId &&
    stack.StackName === contract.policyStackName &&
    isCompleteStackStatus(stack.StackStatus) &&
    sameKeyValues(stack.Tags, expectedTags, "Key", "Value") &&
    sameKeyValues(stack.Outputs, objectEntries(expectedOutputs), "OutputKey", "OutputValue") &&
    templateBody !== null &&
    sha256(templateBody) === expected.templateSha256
  );
}

/** gg: 실제 trust·inline permission·관리 Policy·target attachment를 Task 2 contract와 비교합니다. */
async function verifyManagerIamResources(
  iam: IamClientLike,
  contract: AwsImportManagerContract,
  readPolicyDocument: unknown | null
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
  }))) as { PolicyNames?: string[]; IsTruncated?: boolean };
  if (
    inlineNames.IsTruncated === true ||
    stableJson(inlineNames.PolicyNames ?? []) !== stableJson([contract.serviceRoleInlinePolicyName])
  ) return false;
  const inline = (await iam.send(new GetRolePolicyCommand({
    RoleName: contract.serviceRoleName,
    PolicyName: contract.serviceRoleInlinePolicyName
  }))) as { PolicyDocument?: unknown };
  if (!samePolicyDocument(inline.PolicyDocument, contract.serviceRolePolicyDocument)) return false;

  const serviceAttachments = (await iam.send(new ListAttachedRolePoliciesCommand({
    RoleName: contract.serviceRoleName
  }))) as { AttachedPolicies?: Array<{ PolicyArn?: string }>; IsTruncated?: boolean };
  if (
    serviceAttachments.IsTruncated === true ||
    (serviceAttachments.AttachedPolicies ?? []).length !== 0
  ) return false;

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
    readPolicyDocument !== null &&
    !await managedPolicyMatches(
      iam,
      contract.readManagedPolicyArn,
      readPolicyDocument
    )
  ) {
    return false;
  }

  const attachments = (await iam.send(new ListAttachedRolePoliciesCommand({
    RoleName: contract.targetRoleName
  }))) as { AttachedPolicies?: Array<{ PolicyArn?: string }>; IsTruncated?: boolean };
  if (attachments.IsTruncated === true) return false;
  const attachedArns = new Set(
    (attachments.AttachedPolicies ?? []).flatMap((item) => item.PolicyArn ? [item.PolicyArn] : [])
  );
  const required = [contract.controlPolicyArn, contract.cleanupVerificationPolicyArn];
  if (readPolicyDocument !== null) required.push(contract.readManagedPolicyArn);
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

/** gg: exact tag/output set 검증 후 이름별 값을 안전하게 조회합니다. */
function keyValueRecord(
  items: readonly unknown[] | undefined,
  key: string,
  value: string
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of items ?? []) {
    const record = item as Record<string, unknown>;
    if (typeof record[key] !== "string" || typeof record[value] !== "string") return {};
    if (record[key] in result) return {};
    result[record[key]] = record[value];
  }
  return result;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return stableJson(Object.keys(value).sort()) === stableJson([...keys].sort());
}

function isSha256(value: string | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
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

/** gg: Manager 갱신 URL도 connection-scoped exact Stack ARN만 허용합니다. */
function assertExpectedManagerStackId(
  contract: AwsImportManagerContract,
  stackId: string
): void {
  const prefix = contract.managerStackArn.slice(0, -1);
  if (!stackId.startsWith(prefix) || stackId.length <= prefix.length) {
    throw new AwsImportAccessGatewayError("Manager Stack 상태를 다시 확인해 주세요.");
  }
}

/** gg: CloudFormation Template 본문은 Task 2와 같은 SHA-256 표현으로 비교합니다. */
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
