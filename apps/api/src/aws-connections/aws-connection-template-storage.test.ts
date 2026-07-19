import assert from "node:assert/strict";
import test from "node:test";
import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  assertAwsImportPresignedTemplateUrl,
  getAwsImportPresignedTemplateUrlPatterns,
  publishAwsImportCloudFormationTemplateToS3
} from "./aws-connection-template-storage.js";

const templateInput = {
  bucketName: "sketchcatch-private-templates",
  region: "ap-northeast-2",
  connectionId: "11111111-2222-4333-8444-555555555555",
  kind: "policy" as const,
  contractVersion: "1",
  templateBody: '{"Resources":{}}',
  expiresInSeconds: 600,
  now: () => new Date("2026-07-19T12:05:00.000Z")
};

test("import template upload uses a conditional Put and returns only an internal presigned result", async () => {
  const commands: Array<{ name: string; input: Record<string, unknown> }> = [];
  const published = await publishAwsImportCloudFormationTemplateToS3({
    ...templateInput,
    s3Client: {
      async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
        commands.push({ name: command.constructor.name, input: command.input });
        return {};
      }
    } as unknown as S3Client,
    signTemplateUrl: async ({ baseUrl }) => createValidPresignedUrl(baseUrl)
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0]!.name, "PutObjectCommand");
  assert.deepEqual(commands[0]!.input, {
    Bucket: templateInput.bucketName,
    Key: published.objectKey,
    Body: templateInput.templateBody,
    ContentType: "application/json",
    ServerSideEncryption: "AES256",
    IfNoneMatch: "*"
  });
  assert.equal(Object.isFrozen(published), true);
  assert.equal(published.baseUrl + "?" + new URL(published.templateUrl).searchParams, published.templateUrl);
});

test("an existing hash key is reused only after its exact body is verified", async () => {
  const commands: string[] = [];
  const published = await publishAwsImportCloudFormationTemplateToS3({
    ...templateInput,
    s3Client: {
      async send(command: { constructor: { name: string } }) {
        commands.push(command.constructor.name);
        if (commands.length === 1) {
          throw Object.assign(new Error("already exists"), {
            name: "PreconditionFailed",
            $metadata: { httpStatusCode: 412 }
          });
        }
        return {
          Body: { transformToString: async () => templateInput.templateBody }
        };
      }
    } as unknown as S3Client,
    signTemplateUrl: async ({ baseUrl }) => createValidPresignedUrl(baseUrl)
  });

  assert.deepEqual(commands, ["PutObjectCommand", "GetObjectCommand"]);
  assert.match(published.templateUrl, /X-Amz-Signature=[a-f0-9]{64}/u);
});

test("an existing hash key with different bytes is rejected instead of overwritten", async () => {
  await assert.rejects(
    publishAwsImportCloudFormationTemplateToS3({
      ...templateInput,
      s3Client: {
        async send(command: { constructor: { name: string } }) {
          if (command.constructor.name === "PutObjectCommand") {
            throw Object.assign(new Error("already exists"), {
              name: "PreconditionFailed",
              $metadata: { httpStatusCode: 412 }
            });
          }
          return { Body: { transformToString: async () => '{"Resources":{"Unexpected":{}}}' } };
        }
      } as unknown as S3Client,
      signTemplateUrl: async ({ baseUrl }) => createValidPresignedUrl(baseUrl)
    }),
    /Immutable AWS import template object does not match/u
  );
});

test("a conditional write conflict is retried before the immutable winner is verified", async () => {
  const commands: string[] = [];
  const published = await publishAwsImportCloudFormationTemplateToS3({
    ...templateInput,
    s3Client: {
      async send(command: { constructor: { name: string } }) {
        commands.push(command.constructor.name);
        if (commands.length === 1) {
          throw Object.assign(new Error("conditional conflict"), {
            name: "ConditionalRequestConflict",
            $metadata: { httpStatusCode: 409 }
          });
        }
        if (commands.length === 2) {
          throw Object.assign(new Error("winner exists"), {
            name: "PreconditionFailed",
            $metadata: { httpStatusCode: 412 }
          });
        }
        return { Body: { transformToString: async () => templateInput.templateBody } };
      }
    } as unknown as S3Client,
    signTemplateUrl: async ({ baseUrl }) => createValidPresignedUrl(baseUrl)
  });

  assert.deepEqual(commands, ["PutObjectCommand", "PutObjectCommand", "GetObjectCommand"]);
  assert.match(published.templateUrl, /X-Amz-Signature=[a-f0-9]{64}/u);
});

test("publisher and IAM patterns match the pinned signer for every bucket and credential shape", async () => {
  const credentialCases = [
    {
      credentials: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" },
      sessionToken: undefined
    },
    {
      credentials: {
        accessKeyId: "ASIAEXAMPLE",
        secretAccessKey: "temporary-secret",
        sessionToken: "temporary/session+token="
      },
      sessionToken: "temporary/session+token="
    }
  ] as const;

  for (const credentialCase of credentialCases) {
    const signer = new S3Client({
      region: templateInput.region,
      credentials: credentialCase.credentials
    });

    for (const bucketName of [templateInput.bucketName, "sketchcatch.private.templates"]) {
      const published = await publishAwsImportCloudFormationTemplateToS3({
        ...templateInput,
        bucketName,
        now: () => new Date(),
        s3Client: { async send() { return {}; } } as unknown as S3Client,
        signTemplateUrl: async ({ command, expiresInSeconds }) =>
          getSignedUrl(signer, command, { expiresIn: expiresInSeconds })
      });

      const expectedBaseUrl = bucketName.includes(".")
        ? `https://s3.${templateInput.region}.amazonaws.com/${bucketName}/${published.objectKey}`
        : `https://${bucketName}.s3.${templateInput.region}.amazonaws.com/${published.objectKey}`;
      const patterns = getAwsImportPresignedTemplateUrlPatterns(expectedBaseUrl);
      assert.equal(published.baseUrl, expectedBaseUrl);
      assert(published.templateUrl.startsWith(`${expectedBaseUrl}?`));
      assert.equal(
        new URL(published.templateUrl).searchParams.get("X-Amz-Security-Token"),
        credentialCase.sessionToken ?? null
      );
      assert(
        patterns.every((pattern) =>
          pattern.startsWith(`${expectedBaseUrl}\${?}X-Amz-Algorithm=`)
        )
      );
      assert.match(patterns[1]!, /X-Amz-Security-Token=\*&/u);
    }
  }
});

test("presigned template validation rejects another object and non-SigV4 query input", () => {
  const baseUrl =
    "https://sketchcatch-private-templates.s3.ap-northeast-2.amazonaws.com/" +
    "aws-connections/11111111-2222-4333-8444-555555555555/import-access/policy/v1/" +
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json";

  assert.doesNotThrow(() =>
    assertAwsImportPresignedTemplateUrl({
      baseUrl,
      templateUrl: createValidPresignedUrl(baseUrl),
      expiresInSeconds: 600,
      region: "ap-northeast-2",
      now: templateInput.now
    })
  );
  assert.throws(
    () =>
      assertAwsImportPresignedTemplateUrl({
        baseUrl,
        templateUrl: createValidPresignedUrl(baseUrl.replace("/policy/", "/manager/")),
        expiresInSeconds: 600,
        region: "ap-northeast-2",
        now: templateInput.now
      }),
    /object URL/u
  );
  assert.throws(
    () =>
      assertAwsImportPresignedTemplateUrl({
        baseUrl,
        templateUrl: `${baseUrl}?token=caller-controlled`,
        expiresInSeconds: 600,
        region: "ap-northeast-2",
        now: templateInput.now
      }),
    /query/u
  );
  assert.throws(
    () =>
      assertAwsImportPresignedTemplateUrl({
        baseUrl,
        templateUrl: createValidPresignedUrl(baseUrl).replace("X-Amz-Expires=600", "X-Amz-Expires=901"),
        expiresInSeconds: 901,
        region: "ap-northeast-2",
        now: templateInput.now
      }),
    /expiry/u
  );
});

test("presigned template validation enforces expiry with five minutes of future clock skew", () => {
  const baseUrl =
    "https://sketchcatch-private-templates.s3.ap-northeast-2.amazonaws.com/" +
    "aws-connections/11111111-2222-4333-8444-555555555555/import-access/policy/v1/" +
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json";
  const templateUrl = createValidPresignedUrl(baseUrl);
  const validateAt = (now: string) =>
    assertAwsImportPresignedTemplateUrl({
      baseUrl,
      templateUrl,
      expiresInSeconds: 600,
      region: "ap-northeast-2",
      now: () => new Date(now)
    });

  assert.doesNotThrow(() => validateAt("2026-07-19T11:55:00.000Z"));
  assert.throws(() => validateAt("2026-07-19T11:54:59.999Z"), /future/u);
  assert.doesNotThrow(() => validateAt("2026-07-19T12:09:59.999Z"));
  assert.throws(() => validateAt("2026-07-19T12:10:00.000Z"), /expired/u);
});

// gg: pinned S3 signer가 만드는 exact query shape만 storage 계약 테스트에 제공합니다.
function createValidPresignedUrl(baseUrl: string): string {
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Amz-Credential": "AKIDEXAMPLE/20260719/ap-northeast-2/s3/aws4_request",
    "X-Amz-Date": "20260719T120000Z",
    "X-Amz-Expires": "600",
    "X-Amz-Signature": "a".repeat(64),
    "X-Amz-SignedHeaders": "host",
    "x-amz-checksum-mode": "ENABLED",
    "x-id": "GetObject"
  });
  return `${baseUrl}?${params.toString()}`;
}
