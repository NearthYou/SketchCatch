import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { ProjectAccessContext } from "../deployments/deployment-service.js";
import type {
  AwsConnectionRecord,
  AwsConnectionRepository
} from "./aws-connection-service.js";
import {
  AwsImportAccessApprovalError,
  AwsImportAccessLeaseError,
  AwsImportAccessNotFoundError,
  createAwsImportAccessService,
  type AwsImportAccessServiceGateway
} from "./aws-import-access-service.js";
import type {
  AwsImportAccessRecord,
  AwsImportAccessRepository
} from "./aws-import-access-repository.js";

const ownerAccessContext: ProjectAccessContext = { kind: "user", userId: "owner-user" };
const connectionId = "11111111-2222-4333-8444-555555555555";
const fixedNow = new Date("2026-07-19T12:00:00.000Z");

test("policy apply consumes one approval and preserves deployment verification", async () => {
  const fixture = createImportAccessServiceFixture({ connectionStatus: "verified" });
  const preview = await fixture.service.previewPolicy(fixture.ownerInput);
  const result = await fixture.service.applyPolicy({
    ...fixture.ownerInput,
    approvalId: preview.approvalId,
    operationId: preview.operationId
  });

  assert.equal(result.state.status, "checking_reads");
  assert.equal(fixture.connection.status, "verified");
  assert.equal(fixture.gateway.policyMutations.length, 1);
  await assert.rejects(
    fixture.service.applyPolicy({
      ...fixture.ownerInput,
      approvalId: preview.approvalId,
      operationId: randomUUID()
    }),
    AwsImportAccessApprovalError
  );
});

test("the same operation ID returns the stored result without a second AWS call", async () => {
  const fixture = createImportAccessServiceFixture();
  const preview = await fixture.service.previewPolicy(fixture.ownerInput);
  const input = {
    ...fixture.ownerInput,
    approvalId: preview.approvalId,
    operationId: preview.operationId
  };

  const first = await fixture.service.applyPolicy(input);
  const repeated = await fixture.service.applyPolicy(input);

  assert.deepEqual(repeated, first);
  assert.equal(fixture.gateway.policyMutations.length, 1);
});

test("approval expires after ten minutes and is bound to the inspected manager", async () => {
  let now = fixedNow;
  const fixture = createImportAccessServiceFixture({ now: () => now });
  const preview = await fixture.service.previewPolicy(fixture.ownerInput);
  now = new Date(fixedNow.getTime() + 10 * 60 * 1000);

  await assert.rejects(
    fixture.service.applyPolicy({
      ...fixture.ownerInput,
      approvalId: preview.approvalId,
      operationId: preview.operationId
    }),
    AwsImportAccessApprovalError
  );
  assert.equal(fixture.gateway.policyMutations.length, 0);

  now = fixedNow;
  const fresh = await fixture.service.previewPolicy(fixture.ownerInput);
  fixture.gateway.managerStackId = "changed-manager-stack-id";
  await assert.rejects(
    fixture.service.applyPolicy({
      ...fixture.ownerInput,
      approvalId: fresh.approvalId,
      operationId: fresh.operationId
    }),
    AwsImportAccessApprovalError
  );
  assert.equal(fixture.gateway.policyMutations.length, 0);
});

test("apply consumes approval before re-inspecting AWS and drifted state cannot restore it", async () => {
  const fixture = createImportAccessServiceFixture();
  const preview = await fixture.service.previewPolicy(fixture.ownerInput);
  const events: string[] = [];
  const claimPolicyApply = fixture.repository.claimPolicyApply.bind(fixture.repository);
  fixture.repository.claimPolicyApply = async (input) => {
    events.push("claim");
    return claimPolicyApply(input);
  };
  fixture.gateway.inspectManager = async () => {
    events.push("inspect");
    return {
      verified: false,
      managerStatus: "invalid",
      managerStackId: "replacement-manager-stack-id",
      managerContractVersion: null,
      managerTemplateSha256: null,
      policyStatus: "absent",
      policyStackId: null,
      policyStackExists: false,
      policyContractVersion: null,
      policyTemplateSha256: null,
      policyFingerprint: null,
      reason: "drifted"
    };
  };

  await assert.rejects(
    fixture.service.applyPolicy({
      ...fixture.ownerInput,
      approvalId: preview.approvalId,
      operationId: preview.operationId
    }),
    AwsImportAccessApprovalError
  );

  assert.deepEqual(events, ["claim", "inspect"]);
  assert(fixture.getRecord()?.approvalConsumedAt);
  assert.equal(fixture.gateway.policyMutations.length, 0);

  fixture.gateway.inspectManager = async (input) => ({
    verified: true,
    managerStatus: "target",
    managerStackId: fixture.gateway.managerStackId,
    managerContractVersion: input.contract.contractVersion,
    managerTemplateSha256: input.contract.templateSha256,
    policyStatus: "absent",
    policyStackId: null,
    policyStackExists: false,
    policyContractVersion: null,
    policyTemplateSha256: null,
    policyFingerprint: null
  });
  await assert.rejects(
    fixture.service.applyPolicy({
      ...fixture.ownerInput,
      approvalId: preview.approvalId,
      operationId: randomUUID()
    }),
    AwsImportAccessApprovalError
  );
  assert.equal(fixture.gateway.policyMutations.length, 0);
});

test("preparing an already-current Manager is a read-only no-op", async () => {
  const fixture = createImportAccessServiceFixture();
  let prepareCalls = 0;
  fixture.gateway.prepareManager = async () => {
    prepareCalls += 1;
    return { consoleUrl: "https://example.invalid/should-not-open" };
  };

  const result = await fixture.service.prepareManager(fixture.ownerInput);

  assert.equal(prepareCalls, 0);
  assert.equal(result.consoleUrl, undefined);
  assert.equal(result.state.status, "policy_approval_required");
});

test("Manager preparation uses Quick Create only when absent and exact update when owned older", async () => {
  for (const scenario of ["absent", "owned_older"] as const) {
    const fixture = createImportAccessServiceFixture();
    await fixture.service.getState(fixture.ownerInput);
    const record = fixture.getRecord()!;
    if (scenario === "owned_older") {
      record.managerStackId = "manager-stack-id";
      record.managerContractVersion = "0";
      record.managerTemplateHash = "1".repeat(64);
    }
    fixture.gateway.inspectManager = async () => scenario === "absent"
      ? {
          verified: false,
          managerStatus: "absent",
          managerStackId: null,
          managerContractVersion: null,
          managerTemplateSha256: null,
          policyStatus: "absent",
          policyStackId: null,
          policyStackExists: false,
          policyContractVersion: null,
          policyTemplateSha256: null,
          policyFingerprint: null,
          reason: "not_found"
        }
      : {
          verified: false,
          managerStatus: "owned_older",
          managerStackId: "manager-stack-id",
          managerContractVersion: "0",
          managerTemplateSha256: "1".repeat(64),
          policyStatus: "absent",
          policyStackId: null,
          policyStackExists: false,
          policyContractVersion: null,
          policyTemplateSha256: null,
          policyFingerprint: null,
          reason: "drifted"
        };
    const modes: unknown[] = [];
    fixture.gateway.prepareManager = async (input) => {
      modes.push(input.mode);
      return {
        consoleUrl: "https://console.example/manager",
        ...(input.mode.kind === "update"
          ? { managerTemplateUrl: "https://private.example/manager-template?signature=short" }
          : {})
      };
    };

    const result = await fixture.service.prepareManager(fixture.ownerInput);

    assert.deepEqual(
      modes,
      scenario === "absent"
        ? [{ kind: "create" }]
        : [{ kind: "update", stackId: "manager-stack-id" }]
    );
    assert.equal(result.state.status, "manager_approval_required");
    assert.equal(result.consoleUrl, "https://console.example/manager");
    assert.equal(
      (result as unknown as { managerTemplateUrl?: string }).managerTemplateUrl,
      scenario === "owned_older"
        ? "https://private.example/manager-template?signature=short"
        : undefined
    );
  }
});

test("preview and apply preserve an owned older Policy as the exact expected current Stack", async () => {
  const fixture = createImportAccessServiceFixture();
  const oldPolicy = {
    stackId: "policy-stack-id",
    contractVersion: "0",
    templateSha256: "2".repeat(64),
    policyFingerprint: "3".repeat(64)
  };
  fixture.gateway.inspectManager = async (input) => ({
    verified: true,
    managerStatus: "target",
    managerStackId: fixture.gateway.managerStackId,
    managerContractVersion: input.contract.contractVersion,
    managerTemplateSha256: input.contract.templateSha256,
    policyStatus: "owned_older",
    policyStackId: oldPolicy.stackId,
    policyStackExists: true,
    policyContractVersion: oldPolicy.contractVersion,
    policyTemplateSha256: oldPolicy.templateSha256,
    policyFingerprint: oldPolicy.policyFingerprint
  });
  const expectedPolicies: unknown[] = [];
  fixture.gateway.createOrUpdatePolicyStack = async (input) => {
    expectedPolicies.push(input.expectedPolicy);
    fixture.gateway.policyMutations.push(input.operationId);
    return { policyStackId: oldPolicy.stackId, status: "accepted" };
  };

  const preview = await fixture.service.previewPolicy(fixture.ownerInput);
  await fixture.service.applyPolicy({
    ...fixture.ownerInput,
    approvalId: preview.approvalId,
    operationId: preview.operationId
  });

  assert.deepEqual(expectedPolicies, [{ kind: "present", ...oldPolicy }]);
  assert.equal(fixture.getRecord()?.policyTemplateHash, oldPolicy.templateSha256);
});

test("preview approval is issued atomically and cannot replace an active operation lease", async () => {
  const fixture = createImportAccessServiceFixture();
  let atomicIssueCalls = 0;
  fixture.repository.issueApproval = async () => {
    atomicIssueCalls += 1;
    return { kind: "leased" };
  };

  await assert.rejects(
    fixture.service.previewPolicy(fixture.ownerInput),
    AwsImportAccessLeaseError
  );
  assert.equal(atomicIssueCalls, 1);
});

test("an active apply lease prevents other commands from replacing operation state", async () => {
  const fixture = createImportAccessServiceFixture();
  let guardedSaveCalls = 0;
  fixture.repository.saveCommand = async () => {
    guardedSaveCalls += 1;
    return { kind: "leased" };
  };

  await assert.rejects(
    fixture.service.checkManager(fixture.ownerInput),
    AwsImportAccessLeaseError
  );
  assert.equal(guardedSaveCalls, 1);
});

test("cleanup opens the exact owned Policy Stack and never a caller-selected stack", async () => {
  const fixture = createImportAccessServiceFixture();
  fixture.gateway.inspectCleanup = async () => ({
    verified: true,
    managerStackExists: true,
    policyStackExists: true
  });

  const result = await fixture.service.prepareCleanup(fixture.ownerInput);

  assert.match(result.consoleUrl ?? "", /sketchcatch-import-cf4c4732fd3b8f8a-policy/u);
  assert.doesNotMatch(result.consoleUrl ?? "", /stack=policy(?:&|$)/u);
});

test("apply completion cannot overwrite a newer operation after its lease", async () => {
  const fixture = createImportAccessServiceFixture();
  const preview = await fixture.service.previewPolicy(fixture.ownerInput);
  let finishCalls = 0;
  fixture.repository.finishPolicyApply = async () => {
    finishCalls += 1;
    return { kind: "stale" };
  };

  await assert.rejects(
    fixture.service.applyPolicy({
      ...fixture.ownerInput,
      approvalId: preview.approvalId,
      operationId: preview.operationId
    }),
    AwsImportAccessLeaseError
  );
  assert.equal(finishCalls, 1);
  assert.equal(fixture.gateway.policyMutations.length, 1);
});

test("read-only and preview commands never mutate customer AWS", async () => {
  const fixture = createImportAccessServiceFixture();

  await fixture.service.getState(fixture.ownerInput);
  await fixture.service.prepareManager(fixture.ownerInput);
  await fixture.service.checkManager(fixture.ownerInput);
  await fixture.service.previewPolicy(fixture.ownerInput);
  await fixture.service.checkImportReads(fixture.ownerInput);
  await fixture.service.prepareCleanup(fixture.ownerInput);
  await fixture.service.checkCleanup(fixture.ownerInput);

  assert.deepEqual(fixture.gateway.policyMutations, []);
  assert.equal(fixture.gateway.deleteCalls, 0);
});

test("every command rejects another user's connection", async () => {
  const fixture = createImportAccessServiceFixture();
  const otherInput = {
    connectionId,
    accessContext: { kind: "user", userId: "other-user" } as const
  };

  await assert.rejects(fixture.service.getState(otherInput), AwsImportAccessNotFoundError);
  await assert.rejects(fixture.service.prepareManager(otherInput), AwsImportAccessNotFoundError);
  await assert.rejects(fixture.service.checkManager(otherInput), AwsImportAccessNotFoundError);
  await assert.rejects(fixture.service.previewPolicy(otherInput), AwsImportAccessNotFoundError);
  await assert.rejects(fixture.service.checkImportReads(otherInput), AwsImportAccessNotFoundError);
  await assert.rejects(fixture.service.prepareCleanup(otherInput), AwsImportAccessNotFoundError);
  await assert.rejects(fixture.service.checkCleanup(otherInput), AwsImportAccessNotFoundError);
});

function createImportAccessServiceFixture(
  options: {
    connectionStatus?: AwsConnectionRecord["status"];
    now?: () => Date;
  } = {}
) {
  const connection = createConnection(options.connectionStatus ?? "verified");
  let record: AwsImportAccessRecord | undefined;
  const repository: AwsImportAccessRepository = {
    async getOrCreate(input) {
      record ??= createRecord(input.connectionId, input.now);
      return record;
    },
    async claimPolicyApply(input) {
      if (
        record?.operationId === input.operationId &&
        record.approvalConsumedAt !== null
      ) {
        return { kind: "idempotent", record };
      }
      if (
        !record ||
        record.operationId !== input.operationId ||
        record.approvalFingerprint !== input.approvalFingerprint ||
        record.approvalConsumedAt !== null ||
        !record.approvalExpiresAt ||
        record.approvalExpiresAt.getTime() <= input.now.getTime()
      ) {
        return { kind: "rejected" };
      }
      if (record.leaseExpiresAt && record.leaseExpiresAt.getTime() > input.now.getTime()) {
        return { kind: "leased" };
      }
      record = {
        ...record,
        approvalConsumedAt: input.now,
        status: "policy_working",
        operationKind: "apply_policy",
        leaseExpiresAt: input.leaseExpiresAt,
        updatedAt: input.now
      };
      return { kind: "claimed", record };
    },
    async issueApproval(input) {
      if (record?.leaseExpiresAt && record.leaseExpiresAt.getTime() > input.now.getTime()) {
        return { kind: "leased" };
      }
      record = { ...record!, ...input.changes, updatedAt: input.now };
      return { kind: "issued", record };
    },
    async saveCommand(input) {
      if (record?.leaseExpiresAt && record.leaseExpiresAt.getTime() > input.now.getTime()) {
        return { kind: "leased" };
      }
      record = { ...record!, ...input.changes, updatedAt: input.now };
      return { kind: "saved", record };
    },
    async finishPolicyApply(input) {
      if (record?.operationId !== input.operationId) return { kind: "stale" };
      record = { ...record, ...input.changes, updatedAt: input.now };
      return { kind: "saved", record };
    }
  };
  const gateway: AwsImportAccessServiceGateway & {
    managerStackId: string;
    policyMutations: string[];
    deleteCalls: number;
  } = {
    managerStackId: "manager-stack-id",
    policyMutations: [],
    deleteCalls: 0,
    async prepareManager() {
      return { consoleUrl: "https://ap-northeast-2.console.aws.amazon.com/cloudformation/home" };
    },
    async inspectManager(input) {
      return {
        verified: true,
        managerStatus: "target",
        managerStackId: this.managerStackId,
        managerContractVersion: input.contract.contractVersion,
        managerTemplateSha256: input.contract.templateSha256,
        policyStatus: "absent",
        policyStackId: null,
        policyStackExists: false,
        policyContractVersion: null,
        policyTemplateSha256: null,
        policyFingerprint: null
      };
    },
    async createOrUpdatePolicyStack(input) {
      this.policyMutations.push(input.operationId);
      return { policyStackId: "policy-stack-id", status: "accepted" };
    },
    async inspectCleanup() {
      return { managerStackExists: false, policyStackExists: false, verified: true };
    }
  };
  const connectionRepository = createConnectionRepository(connection);
  const service = createAwsImportAccessService({
    connectionRepository,
    repository,
    gateway,
    templateBucketName: "sketchcatch-private-templates",
    now: options.now ?? (() => fixedNow),
    generateApprovalSecret: () => `approval-${randomUUID()}`,
    generateOperationId: () => randomUUID()
  });

  return {
    connection,
    gateway,
    repository,
    service,
    getRecord: () => record,
    ownerInput: { connectionId, accessContext: ownerAccessContext }
  };
}

function createConnection(status: AwsConnectionRecord["status"]): AwsConnectionRecord {
  return {
    id: connectionId,
    userId: "owner-user",
    accountId: "123456789012",
    roleArn:
      "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-11111111",
    externalId: "external-id",
    region: "ap-northeast-2",
    status,
    lastVerifiedAt: fixedNow,
    deletionStartedAt: null,
    deletionErrorSummary: null,
    createdAt: fixedNow,
    updatedAt: fixedNow
  };
}

function createConnectionRepository(connection: AwsConnectionRecord): AwsConnectionRepository {
  return {
    async findAccessibleAwsConnection(id, context) {
      return id === connection.id && context.kind === "user" && context.userId === connection.userId
        ? connection
        : undefined;
    }
  } as AwsConnectionRepository;
}

function createRecord(id: string, now: Date): AwsImportAccessRecord {
  return {
    awsConnectionId: id,
    status: "check_required",
    managerStackName: null,
    managerStackId: null,
    managerContractVersion: null,
    managerTemplateHash: null,
    policyStackName: null,
    policyStackId: null,
    policyContractVersion: null,
    policyTemplateHash: null,
    targetRoleArn: null,
    serviceRoleArn: null,
    readPolicyArn: null,
    controlPolicyArn: null,
    cleanupVerificationPolicyArn: null,
    policyFingerprint: null,
    approvalFingerprint: null,
    approvalExpiresAt: null,
    approvalConsumedAt: null,
    operationId: null,
    operationKind: null,
    leaseExpiresAt: null,
    coreReadSummary: null,
    expandedReadSummary: null,
    safeErrorCode: null,
    safeErrorSummary: null,
    lastCheckedAt: null,
    cleanupStartedAt: null,
    createdAt: now,
    updatedAt: now
  };
}
