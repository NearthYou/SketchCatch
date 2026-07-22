import assert from "node:assert/strict";
import test from "node:test";
import {
  DescribeKeyCommand,
  GetKeyPolicyCommand,
  GetKeyRotationStatusCommand,
  ListAliasesCommand,
  ListKeysCommand,
  ListResourceTagsCommand
} from "@aws-sdk/client-kms";
import { readKmsResources } from "./aws-kms-reverse-engineering-reader.js";

test("customer KMS Key와 Alias를 완전한 서버 원본으로 읽는다", async () => {
  const policySecret = "kms-policy-server-only-secret";
  const commands: string[] = [];
  const client = {
    async send(command: object): Promise<unknown> {
      commands.push(command.constructor.name);
      if (command instanceof ListAliasesCommand) {
        return {
          Aliases: [
            {
              AliasName: "alias/orders",
              AliasArn: "arn:aws:kms:ap-northeast-2:123456789012:alias/orders",
              TargetKeyId: "key-1"
            }
          ],
          Truncated: false
        };
      }
      if (command instanceof ListKeysCommand) {
        return {
          Keys: [
            {
              KeyId: "key-1",
              KeyArn: "arn:aws:kms:ap-northeast-2:123456789012:key/key-1"
            }
          ],
          Truncated: false
        };
      }
      if (command instanceof DescribeKeyCommand) {
        return {
          KeyMetadata: {
            Arn: "arn:aws:kms:ap-northeast-2:123456789012:key/key-1",
            KeyId: "key-1",
            Description: "orders data",
            Enabled: true,
            KeyManager: "CUSTOMER",
            KeySpec: "SYMMETRIC_DEFAULT",
            KeyState: "Enabled",
            KeyUsage: "ENCRYPT_DECRYPT",
            MultiRegion: false,
            Origin: "AWS_KMS"
          }
        };
      }
      if (command instanceof GetKeyPolicyCommand) {
        return {
          Policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { AWS: "arn:aws:iam::123456789012:root" },
                Sid: policySecret
              }
            ]
          })
        };
      }
      if (command instanceof GetKeyRotationStatusCommand) {
        return { KeyRotationEnabled: true };
      }
      if (command instanceof ListResourceTagsCommand) {
        return {
          Tags: [{ TagKey: "Environment", TagValue: "production" }],
          Truncated: false
        };
      }
      throw new Error(`unexpected ${command.constructor.name}`);
    }
  };

  const result = await readKmsResources({
    region: "ap-northeast-2",
    client
  });

  assert.equal(result.failures.length, 0);
  assert.equal(result.records.length, 2);
  const key = result.records.find((record) => record.providerResourceType === "AWS::KMS::Key");
  const alias = result.records.find((record) => record.providerResourceType === "AWS::KMS::Alias");
  const { policyDigest, ...publicKeyConfig } = key?.config ?? {};
  assert.deepEqual(publicKeyConfig, {
    description: "orders data",
    enabled: true,
    keyManager: "CUSTOMER",
    keySpec: "SYMMETRIC_DEFAULT",
    keyState: "Enabled",
    keyUsage: "ENCRYPT_DECRYPT",
    managementReady: true,
    multiRegion: false,
    origin: "AWS_KMS",
    policyReadComplete: true,
    reverseEngineeringDetailsComplete: true,
    reverseEngineeringDetailsVersion: 1,
    rotationEnabled: true,
    rotationReadComplete: true,
    tags: [{ key: "Environment", value: "production" }],
    tagsReadComplete: true
  });
  assert.equal(typeof policyDigest, "string");
  assert.deepEqual(alias?.config, {
    awsManaged: false,
    managementReady: true,
    reverseEngineeringDetailsComplete: true
  });
  assert.deepEqual(alias?.relationships, [
    {
      type: "depends_on",
      targetProviderResourceId: "arn:aws:kms:ap-northeast-2:123456789012:key/key-1"
    }
  ]);
  assert.doesNotMatch(JSON.stringify(result.records), new RegExp(policySecret));
  assert.equal(key?.config["policyDocument"], undefined);
  assert.equal(key?.config["keyId"], undefined);
  assert.equal(key?.config["aliasNames"], undefined);
  assert.equal(Object.hasOwn(alias?.config ?? {}, "aliasName"), false);
  assert.equal(Object.hasOwn(alias?.config ?? {}, "targetKeyId"), false);
  assert.deepEqual(result.serverOnlyDetails, [
    {
      providerResourceId: "arn:aws:kms:ap-northeast-2:123456789012:key/key-1",
      resourceKind: "key",
      terraformImportId: "key-1",
      keyId: "key-1",
      policyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: "arn:aws:iam::123456789012:root" },
            Sid: policySecret
          }
        ]
      })
    },
    {
      providerResourceId: "arn:aws:kms:ap-northeast-2:123456789012:alias/orders",
      resourceKind: "alias",
      terraformImportId: "alias/orders",
      aliasName: "alias/orders",
      targetKeyId: "key-1"
    }
  ]);
  assert.deepEqual(commands, [
    "ListAliasesCommand",
    "ListKeysCommand",
    "DescribeKeyCommand",
    "GetKeyPolicyCommand",
    "GetKeyRotationStatusCommand",
    "ListResourceTagsCommand"
  ]);
});

test("KMS 세부 조회가 하나라도 실패하면 자동 관리에 필요한 완료 표시를 남기지 않는다", async () => {
  const client = {
    async send(command: object): Promise<unknown> {
      if (command instanceof ListAliasesCommand) return { Aliases: [], Truncated: false };
      if (command instanceof ListKeysCommand) {
        return { Keys: [{ KeyId: "key-1" }], Truncated: false };
      }
      if (command instanceof DescribeKeyCommand) {
        return {
          KeyMetadata: {
            KeyId: "key-1",
            KeyManager: "CUSTOMER",
            KeyState: "Enabled"
          }
        };
      }
      if (command instanceof GetKeyPolicyCommand) throw new Error("AccessDenied secret detail");
      if (command instanceof GetKeyRotationStatusCommand) return { KeyRotationEnabled: false };
      if (command instanceof ListResourceTagsCommand) return { Tags: [], Truncated: false };
      throw new Error(`unexpected ${command.constructor.name}`);
    }
  };

  const result = await readKmsResources({ region: "ap-northeast-2", client });
  const key = result.records.find((record) => record.providerResourceType === "AWS::KMS::Key");

  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0]?.operation, "GetKeyPolicy");
  assert.doesNotMatch(JSON.stringify(result.failures), /secret detail/u);
  assert.doesNotMatch(JSON.stringify(result.failures), /key-1/u);
  assert.match(result.failures[0]?.resourceId ?? "", /^kms-ref-[a-f0-9]{16}$/u);
  assert.equal(key?.config["reverseEngineeringDetailsComplete"], false);
  assert.equal(key?.config["managementReady"], false);
  assert.equal(key?.config["policyReadComplete"], false);
  assert.equal(key?.config["policyDocument"], undefined);
});

test("KMS Key 목록의 반복 토큰은 이미 읽은 Key와 Alias를 미완료 상태로 남긴다", async () => {
  let listKeyCalls = 0;
  const client = {
    async send(command: object): Promise<unknown> {
      if (command instanceof ListAliasesCommand) {
        return {
          Aliases: [{ AliasName: "alias/orders", TargetKeyId: "key-1" }],
          Truncated: false
        };
      }
      if (command instanceof ListKeysCommand) {
        listKeyCalls += 1;
        return listKeyCalls === 1
          ? { Keys: [{ KeyId: "key-1" }], Truncated: true, NextMarker: "next" }
          : { Keys: [], Truncated: true, NextMarker: "next" };
      }
      if (command instanceof DescribeKeyCommand) {
        return {
          KeyMetadata: {
            KeyId: "key-1",
            Enabled: true,
            KeyManager: "CUSTOMER",
            KeyState: "Enabled",
            MultiRegion: false,
            Origin: "AWS_KMS"
          }
        };
      }
      if (command instanceof GetKeyPolicyCommand) return { Policy: "{}" };
      if (command instanceof GetKeyRotationStatusCommand) return { KeyRotationEnabled: true };
      if (command instanceof ListResourceTagsCommand) return { Tags: [], Truncated: false };
      throw new Error(`unexpected ${command.constructor.name}`);
    }
  };

  const result = await readKmsResources({ region: "ap-northeast-2", client });

  assert.equal(listKeyCalls, 2);
  assert.equal(result.failures.at(-1)?.operation, "ListKeysPagination");
  assert.equal(
    result.records.find((record) => record.providerResourceType === "AWS::KMS::Key")?.config[
      "reverseEngineeringDetailsComplete"
    ],
    false
  );
  assert.equal(
    result.records.find((record) => record.providerResourceType === "AWS::KMS::Alias")?.config[
      "reverseEngineeringDetailsComplete"
    ],
    false
  );
});

test("KMS Key 목록 다음 page가 실패하면 이미 읽은 Key와 Alias를 관리 가능으로 표시하지 않는다", async () => {
  let listKeyCalls = 0;
  const client = {
    async send(command: object): Promise<unknown> {
      if (command instanceof ListAliasesCommand) {
        return {
          Aliases: [{ AliasName: "alias/orders", TargetKeyId: "key-1" }],
          Truncated: false
        };
      }
      if (command instanceof ListKeysCommand) {
        listKeyCalls += 1;
        if (listKeyCalls === 1) {
          return { Keys: [{ KeyId: "key-1" }], Truncated: true, NextMarker: "next" };
        }
        throw new Error("AccessDenied hidden account detail");
      }
      if (command instanceof DescribeKeyCommand) {
        return {
          KeyMetadata: {
            KeyId: "key-1",
            Enabled: true,
            KeyManager: "CUSTOMER",
            KeyState: "Enabled",
            MultiRegion: false,
            Origin: "AWS_KMS"
          }
        };
      }
      if (command instanceof GetKeyPolicyCommand) return { Policy: "{}" };
      if (command instanceof GetKeyRotationStatusCommand) return { KeyRotationEnabled: true };
      if (command instanceof ListResourceTagsCommand) return { Tags: [], Truncated: false };
      throw new Error(`unexpected ${command.constructor.name}`);
    }
  };

  const result = await readKmsResources({ region: "ap-northeast-2", client });

  assert.equal(result.failures.at(-1)?.operation, "ListKeys");
  assert.doesNotMatch(JSON.stringify(result.failures), /hidden account detail/u);
  assert.equal(
    result.records.find((record) => record.providerResourceType === "AWS::KMS::Key")?.config[
      "managementReady"
    ],
    false
  );
  assert.equal(
    result.records.find((record) => record.providerResourceType === "AWS::KMS::Alias")?.config[
      "managementReady"
    ],
    false
  );
});

test("KMS 목록과 태그가 잘렸는데 다음 marker가 없으면 성공으로 처리하지 않는다", async () => {
  const truncatedScopes = ["keys", "aliases", "tags"] as const;

  for (const scope of truncatedScopes) {
    const client = {
      async send(command: object): Promise<unknown> {
        if (command instanceof ListAliasesCommand) {
          return scope === "aliases"
            ? { Aliases: [{ AliasName: "alias/orders", TargetKeyId: "key-1" }], Truncated: true }
            : { Aliases: [{ AliasName: "alias/orders", TargetKeyId: "key-1" }], Truncated: false };
        }
        if (command instanceof ListKeysCommand) {
          return { Keys: [{ KeyId: "key-1" }], Truncated: scope === "keys" };
        }
        if (command instanceof DescribeKeyCommand) {
          return {
            KeyMetadata: {
              KeyId: "key-1",
              Enabled: true,
              KeyManager: "CUSTOMER",
              KeyState: "Enabled",
              MultiRegion: false,
              Origin: "AWS_KMS"
            }
          };
        }
        if (command instanceof GetKeyPolicyCommand) return { Policy: "{}" };
        if (command instanceof GetKeyRotationStatusCommand) return { KeyRotationEnabled: true };
        if (command instanceof ListResourceTagsCommand) {
          return { Tags: [], Truncated: scope === "tags" };
        }
        throw new Error(`unexpected ${command.constructor.name}`);
      }
    };

    const result = await readKmsResources({ region: "ap-northeast-2", client });
    const expectedOperation =
      scope === "keys"
        ? "ListKeysPagination"
        : scope === "aliases"
          ? "ListAliasesPagination"
          : "ListResourceTagsPagination";

    assert.equal(
      result.failures.some((failure) => failure.operation === expectedOperation),
      true,
      `${scope} must record a pagination failure`
    );
    assert.equal(
      result.records.find((record) => record.providerResourceType === "AWS::KMS::Key")?.config[
        "managementReady"
      ],
      false
    );
  }
});

test("KMS 관리 가능 표시는 안전한 customer single-region Key와 customer Alias에만 설정한다", async () => {
  const client = {
    async send(command: object): Promise<unknown> {
      if (command instanceof ListAliasesCommand) {
        return {
          Aliases: [
            { AliasName: "alias/aws/s3", TargetKeyId: "key-1" },
            { AliasName: "alias/orders", TargetKeyId: "key-1" }
          ],
          Truncated: false
        };
      }
      if (command instanceof ListKeysCommand) {
        return { Keys: [{ KeyId: "key-1" }], Truncated: false };
      }
      if (command instanceof DescribeKeyCommand) {
        return {
          KeyMetadata: {
            KeyId: "key-1",
            Enabled: false,
            KeyManager: "CUSTOMER",
            KeyState: "PendingDeletion",
            MultiRegion: true,
            MultiRegionConfiguration: { MultiRegionKeyType: "PRIMARY" },
            Origin: "AWS_KMS"
          }
        };
      }
      if (command instanceof GetKeyPolicyCommand) return { Policy: "{}" };
      if (command instanceof GetKeyRotationStatusCommand) return { KeyRotationEnabled: false };
      if (command instanceof ListResourceTagsCommand) return { Tags: [], Truncated: false };
      throw new Error(`unexpected ${command.constructor.name}`);
    }
  };

  const result = await readKmsResources({ region: "ap-northeast-2", client });
  const key = result.records.find((record) => record.providerResourceType === "AWS::KMS::Key");
  const awsManagedAlias = result.records.find(
    (record) =>
      record.providerResourceType === "AWS::KMS::Alias" && record.displayName === "alias/aws/s3"
  );
  const customerAlias = result.records.find(
    (record) =>
      record.providerResourceType === "AWS::KMS::Alias" && record.displayName === "alias/orders"
  );

  assert.equal(key?.config["reverseEngineeringDetailsComplete"], true);
  assert.equal(key?.config["managementReady"], false);
  assert.equal(awsManagedAlias?.config["awsManaged"], true);
  assert.equal(awsManagedAlias?.config["managementReady"], false);
  assert.equal(
    customerAlias?.config["managementReady"],
    false,
    "customer Alias도 안전하지 않은 Key를 관리 대상으로 승격하면 안 됩니다"
  );
});
