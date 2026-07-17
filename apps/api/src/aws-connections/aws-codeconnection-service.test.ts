import assert from "node:assert/strict";
import test from "node:test";
import type { AwsCodeConnectionStatus } from "@sketchcatch/types";
import {
  AwsCodeConnectionError,
  createAwsCodeConnection,
  createAwsCodeConnectionGateway,
  getAwsCodeConnection,
  refreshAwsCodeConnection,
  type AwsCodeConnectionGateway,
  type AwsCodeConnectionRecord,
  type AwsCodeConnectionRepository
} from "./aws-codeconnection-service.js";

const userId = "11111111-1111-4111-8111-111111111111";
const connectionId = "22222222-2222-4222-8222-222222222222";
const codeConnectionId = "33333333-3333-4333-8333-333333333333";
const connectionArn =
  "arn:aws:codeconnections:ap-northeast-2:123456789012:connection/44444444-4444-4444-8444-444444444444";
const fixedNow = new Date("2026-07-15T00:00:00.000Z");

class InMemoryRepository implements AwsCodeConnectionRepository {
  activeGitHubInstallationIds = ["github-installation-1"];
  verifiedConnection: Awaited<ReturnType<AwsCodeConnectionRepository["findVerifiedConnection"]>> = {
    id: connectionId,
    roleArn:
      "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-22222222",
    externalId: "external-id",
    region: "ap-northeast-2"
  };
  record: AwsCodeConnectionRecord | undefined;

  async listActiveGitHubInstallationIds() {
    return this.activeGitHubInstallationIds;
  }

  async findVerifiedConnection() {
    return this.verifiedConnection;
  }

  async findByAwsConnectionId() {
    return this.record;
  }

  async reserve(input: Omit<AwsCodeConnectionRecord, "createdAt"> & { createdAt?: Date }) {
    if (this.record) return { record: this.record, acquired: false };
    this.record = {
      ...input,
      createdAt: input.createdAt ?? fixedNow
    };
    return { record: this.record, acquired: true };
  }

  async claimCreation(input: {
    id: string;
    expectedUpdatedAt: Date;
    now: Date;
  }) {
    if (
      !this.record ||
      this.record.id !== input.id ||
      this.record.connectionArn !== null ||
      this.record.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
    ) {
      return false;
    }
    this.record = {
      ...this.record,
      status: "CREATING",
      statusReason: null,
      updatedAt: input.now
    };
    return true;
  }

  async completeCreation(input: { id: string; connectionArn: string; now: Date }) {
    if (!this.record || this.record.id !== input.id || this.record.connectionArn !== null) {
      return undefined;
    }
    this.record = {
      ...this.record,
      connectionArn: input.connectionArn,
      status: "PENDING",
      statusReason: null,
      updatedAt: input.now
    };
    return this.record;
  }

  async markCreationFailed(input: { id: string; reason: string; now: Date }) {
    if (!this.record || this.record.id !== input.id || this.record.connectionArn !== null) {
      return;
    }
    this.record = {
      ...this.record,
      status: "ERROR",
      statusReason: input.reason,
      updatedAt: input.now
    };
  }

  async save(input: Omit<AwsCodeConnectionRecord, "createdAt"> & { createdAt?: Date }) {
    this.record = {
      ...input,
      createdAt: input.createdAt ?? this.record?.createdAt ?? fixedNow
    };
    return this.record;
  }
}

class FakeGateway implements AwsCodeConnectionGateway {
  createCalls: Array<{ name: string }> = [];
  deleteCalls: string[] = [];
  ownedConnectionArns: string[] = [];
  observedStatus: AwsCodeConnectionStatus = "PENDING";

  async findOwnedByName() {
    return this.ownedConnectionArns.map((ownedArn) => ({ connectionArn: ownedArn }));
  }

  async create(input: { name: string }) {
    this.createCalls.push(input);
    return { connectionArn };
  }

  async get() {
    return {
      connectionArn,
      providerType: "GitHub" as const,
      status: this.observedStatus,
      statusReason: this.observedStatus === "ERROR" ? "handshake failed" : null
    };
  }

  async delete(input: { connectionArn: string }) {
    this.deleteCalls.push(input.connectionArn);
  }
}

test("creating a GitHub CodeConnection requires a verified AWS connection", async () => {
  const repository = new InMemoryRepository();
  repository.verifiedConnection = undefined;

  await assert.rejects(
    createAwsCodeConnection(
      { connectionId, userId },
      repository,
      new FakeGateway(),
      { generateId: () => codeConnectionId, now: () => fixedNow }
    ),
    (error: unknown) =>
      error instanceof AwsCodeConnectionError && error.code === "AWS_CONNECTION_REQUIRED"
  );
});

test("creating a GitHub CodeConnection requires a GitHub App installation", async () => {
  const repository = new InMemoryRepository();
  repository.activeGitHubInstallationIds = [];
  const gateway = new FakeGateway();

  await assert.rejects(
    createAwsCodeConnection(
      { connectionId, userId },
      repository,
      gateway,
      { generateId: () => codeConnectionId, now: () => fixedNow }
    ),
    (error: unknown) =>
      error instanceof AwsCodeConnectionError &&
      error.code === "GITHUB_INSTALLATION_REQUIRED"
  );

  assert.equal(gateway.createCalls.length, 0);
});

test("creating a GitHub CodeConnection rejects ambiguous GitHub App installations", async () => {
  const repository = new InMemoryRepository();
  repository.activeGitHubInstallationIds = [
    "github-installation-1",
    "github-installation-2"
  ];
  const gateway = new FakeGateway();

  await assert.rejects(
    createAwsCodeConnection(
      { connectionId, userId },
      repository,
      gateway,
      { generateId: () => codeConnectionId, now: () => fixedNow }
    ),
    (error: unknown) =>
      error instanceof AwsCodeConnectionError &&
      error.code === "MULTIPLE_GITHUB_INSTALLATIONS_UNSUPPORTED"
  );

  assert.equal(gateway.createCalls.length, 0);
});

test("creating a GitHub CodeConnection stores the pending AWS connection once", async () => {
  const repository = new InMemoryRepository();
  const gateway = new FakeGateway();

  const first = await createAwsCodeConnection(
    { connectionId, userId },
    repository,
    gateway,
    { generateId: () => codeConnectionId, now: () => fixedNow }
  );
  const second = await createAwsCodeConnection(
    { connectionId, userId },
    repository,
    gateway,
    { generateId: () => "unused", now: () => fixedNow }
  );

  assert.equal(first.codeConnection?.status, "PENDING");
  assert.equal(first.codeConnection?.connectionArn, connectionArn);
  assert.match(first.setupUrl ?? "", /codesuite\/settings\/connections/);
  assert.equal(second.codeConnection?.id, codeConnectionId);
  assert.equal(gateway.createCalls.length, 1);
  assert.equal(gateway.createCalls[0]?.name, "sketchcatch-22222222-github");
});

test("a concurrent CodeConnection request observes the creation reservation without creating another AWS resource", async () => {
  const repository = new InMemoryRepository();
  repository.record = {
    id: codeConnectionId,
    awsConnectionId: connectionId,
    connectionArn: null,
    providerType: "GitHub",
    status: "CREATING",
    statusReason: null,
    createdAt: fixedNow,
    updatedAt: fixedNow
  };
  const gateway = new FakeGateway();

  const response = await createAwsCodeConnection(
    { connectionId, userId },
    repository,
    gateway,
    { now: () => fixedNow }
  );

  assert.equal(response.codeConnection?.status, "CREATING");
  assert.equal(response.codeConnection?.connectionArn, null);
  assert.equal(response.setupUrl, null);
  assert.equal(gateway.createCalls.length, 0);
});

test("CodeConnection creation stops before AWS create when connection deletion starts", async () => {
  const repository = new InMemoryRepository();
  const gateway = new FakeGateway();
  gateway.findOwnedByName = async () => {
    repository.verifiedConnection = undefined;
    return [];
  };

  await assert.rejects(
    createAwsCodeConnection(
      { connectionId, userId },
      repository,
      gateway,
      { generateId: () => codeConnectionId, now: () => fixedNow }
    ),
    (error: unknown) =>
      error instanceof AwsCodeConnectionError && error.code === "AWS_CONNECTION_REQUIRED"
  );

  assert.equal(gateway.createCalls.length, 0);
  assert.equal(repository.record?.status, "ERROR");
});

test("a stale creation reservation adopts the tagged AWS connection instead of creating a duplicate", async () => {
  const repository = new InMemoryRepository();
  repository.record = {
    id: codeConnectionId,
    awsConnectionId: connectionId,
    connectionArn: null,
    providerType: "GitHub",
    status: "CREATING",
    statusReason: null,
    createdAt: fixedNow,
    updatedAt: fixedNow
  };
  const gateway = new FakeGateway();
  gateway.ownedConnectionArns = [connectionArn];
  const retryAt = new Date("2026-07-15T00:05:00.000Z");

  const response = await createAwsCodeConnection(
    { connectionId, userId },
    repository,
    gateway,
    { now: () => retryAt, creationReservationTtlMs: 60_000 }
  );

  assert.equal(response.codeConnection?.status, "PENDING");
  assert.equal(response.codeConnection?.connectionArn, connectionArn);
  assert.equal(gateway.createCalls.length, 0);
});

test("AWS CodeConnection creation tags the resource with SketchCatch ownership", async () => {
  const commands: Array<Record<string, unknown>> = [];
  const gateway = createAwsCodeConnectionGateway({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createClient: () => ({
      async send(command: { input: Record<string, unknown> }) {
        commands.push(command.input);
        return { ConnectionArn: connectionArn };
      },
      destroy() {}
    } as never)
  });

  await gateway.create({
    id: connectionId,
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-22222222",
    externalId: "external-id",
    region: "ap-northeast-2",
    name: "sketchcatch-22222222-github"
  });

  assert.deepEqual(commands[0]?.["Tags"], [
    { Key: "ManagedBy", Value: "SketchCatch" },
    { Key: "SketchCatchAwsConnection", Value: connectionId }
  ]);
});

test("CodeConnection recovery adopts only the deterministic name with matching ownership tags", async () => {
  const ownedArn = connectionArn;
  const foreignArn = connectionArn.replace("44444444", "55555555");
  const gateway = createAwsCodeConnectionGateway({
    assumeRole: async () => ({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      sessionToken: "session-token"
    }),
    createClient: () => ({
      async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
        if (command.constructor.name === "ListConnectionsCommand") {
          return {
            Connections: [
              {
                ConnectionArn: ownedArn,
                ConnectionName: "sketchcatch-22222222-github"
              },
              {
                ConnectionArn: foreignArn,
                ConnectionName: "sketchcatch-22222222-github"
              }
            ]
          };
        }
        if (command.constructor.name === "ListTagsForResourceCommand") {
          return command.input["ResourceArn"] === ownedArn
            ? {
                Tags: [
                  { Key: "ManagedBy", Value: "SketchCatch" },
                  { Key: "SketchCatchAwsConnection", Value: connectionId }
                ]
              }
            : { Tags: [{ Key: "ManagedBy", Value: "SomeoneElse" }] };
        }
        throw new Error(`Unexpected command ${command.constructor.name}`);
      },
      destroy() {}
    } as never)
  });

  const found = await gateway.findOwnedByName({
    id: connectionId,
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-22222222",
    externalId: "external-id",
    region: "ap-northeast-2",
    name: "sketchcatch-22222222-github"
  });

  assert.deepEqual(found, [{ connectionArn: ownedArn }]);
});

test("CodeConnection creation leaves an owned AWS resource adoptable when completion persistence fails", async () => {
  const repository = new InMemoryRepository();
  repository.completeCreation = async () => {
    throw new Error("database unavailable");
  };
  const gateway = new FakeGateway();

  await assert.rejects(
    createAwsCodeConnection(
      { connectionId, userId },
      repository,
      gateway,
      { generateId: () => codeConnectionId, now: () => fixedNow }
    ),
    /database unavailable/
  );

  assert.deepEqual(gateway.deleteCalls, []);
  assert.equal(repository.record?.status, "CREATING");
});

test("refreshing a GitHub CodeConnection persists the AWS handshake status", async () => {
  const repository = new InMemoryRepository();
  const gateway = new FakeGateway();
  await createAwsCodeConnection(
    { connectionId, userId },
    repository,
    gateway,
    { generateId: () => codeConnectionId, now: () => fixedNow }
  );
  gateway.observedStatus = "AVAILABLE";

  const refreshed = await refreshAwsCodeConnection(
    { connectionId, userId },
    repository,
    gateway,
    { now: () => new Date("2026-07-15T00:05:00.000Z") }
  );
  const read = await getAwsCodeConnection({ connectionId, userId }, repository);

  assert.equal(refreshed.codeConnection?.status, "AVAILABLE");
  assert.equal(read.codeConnection?.status, "AVAILABLE");
  assert.equal(repository.record?.updatedAt.toISOString(), "2026-07-15T00:05:00.000Z");
});
