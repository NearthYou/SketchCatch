import assert from "node:assert/strict";
import test from "node:test";
import {
  GetFunctionCommand,
  GetPolicyCommand,
  ListAliasesCommand,
  ListFunctionsCommand,
  ListTagsCommand,
  ListVersionsByFunctionCommand
} from "@aws-sdk/client-lambda";
import {
  readDetailedLambdaResources,
  type AwsLambdaDetailReadClient
} from "./aws-lambda-reverse-engineering-reader.js";

const credentials = {
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
  AWS_SESSION_TOKEN: "test-session-token",
  AWS_REGION: "ap-northeast-2"
};

test("reads complete Lambda metadata and stable permissions while keeping secrets and temporary URLs server-only", async () => {
  const functionArn = "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-api";
  const roleArn = "arn:aws:iam::123456789012:role/orders-lambda";
  const kmsArn = "arn:aws:kms:ap-northeast-2:123456789012:key/key-id";
  const dlqArn = "arn:aws:sqs:ap-northeast-2:123456789012:orders-dlq";
  const layerArn = "arn:aws:lambda:ap-northeast-2:123456789012:layer:shared:3";
  const temporaryUrl = "https://temporary-download.example/private-token";
  const environmentSecret = "environment-secret-value";
  const policySecret = "policy-document-secret-marker";
  const client: AwsLambdaDetailReadClient = {
    async send(command) {
      if (command instanceof ListFunctionsCommand) {
        return {
          Functions: [{ FunctionArn: functionArn, FunctionName: "orders-api" }]
        };
      }
      if (command instanceof GetFunctionCommand) {
        return {
          Configuration: {
            FunctionArn: functionArn,
            FunctionName: "orders-api",
            PackageType: "Image",
            State: "Active",
            LastUpdateStatus: "Successful",
            Role: roleArn,
            MemorySize: 512,
            Timeout: 30,
            Architectures: ["arm64"],
            ImageConfigResponse: {
              ImageConfig: { Command: ["app.handler"], WorkingDirectory: "/var/task" }
            },
            Environment: { Variables: { DATABASE_URL: environmentSecret } },
            VpcConfig: {
              VpcId: "vpc-123",
              SubnetIds: ["subnet-a"],
              SecurityGroupIds: ["sg-123"],
              Ipv6AllowedForDualStack: false
            },
            Layers: [{ Arn: layerArn, CodeSize: 42 }],
            KMSKeyArn: kmsArn,
            DeadLetterConfig: { TargetArn: dlqArn },
            TracingConfig: { Mode: "Active" },
            LoggingConfig: { LogGroup: "/aws/lambda/orders-api", LogFormat: "JSON" },
            EphemeralStorage: { Size: 1024 }
          },
          Code: {
            RepositoryType: "ECR",
            ImageUri: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/orders:v1",
            ResolvedImageUri: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/orders@sha256:abc",
            Location: temporaryUrl
          }
        };
      }
      if (command instanceof ListTagsCommand) {
        return { Tags: { service: "orders", target: roleArn } };
      }
      if (command instanceof GetPolicyCommand) {
        return {
          Policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Sid: "AllowApiGateway",
                Effect: "Allow",
                Principal: { Service: "apigateway.amazonaws.com" },
                Action: "lambda:InvokeFunction",
                Resource: functionArn
              },
              {
                Effect: "Allow",
                Principal: { Service: "events.amazonaws.com" },
                Action: "lambda:InvokeFunction",
                Resource: functionArn
              },
              {
                Sid: "DenyInvoke",
                Effect: "Deny",
                Principal: { Service: "events.amazonaws.com" },
                Action: "lambda:InvokeFunction",
                Resource: functionArn,
                Condition: { StringEquals: { marker: policySecret } }
              }
            ]
          })
        };
      }
      if (command instanceof ListAliasesCommand) {
        if (!command.input.Marker) {
          return {
            Aliases: [{ Name: "live", FunctionVersion: "2", Description: "production" }],
            NextMarker: "alias-next"
          };
        }
        return { Aliases: [{ Name: "canary", FunctionVersion: "3" }] };
      }
      if (command instanceof ListVersionsByFunctionCommand) {
        if (!command.input.Marker) {
          return { Versions: [{ Version: "$LATEST" }, { Version: "1" }], NextMarker: "v-next" };
        }
        return { Versions: [{ Version: "2" }] };
      }
      throw new Error(`Unexpected command ${command.constructor.name}`);
    }
  };

  const result = await readDetailedLambdaResources("ap-northeast-2", credentials, () => client);

  assert.equal(result.failures.length, 0);
  const lambda = result.records.find(
    (record) => record.providerResourceType === "AWS::Lambda::Function"
  );
  assert.equal(lambda?.config["managementReady"], false);
  assert.equal(lambda?.config["environmentValuesRedacted"], true);
  assert.deepEqual(lambda?.config["environmentVariableNames"], ["DATABASE_URL"]);
  assert.deepEqual(lambda?.config["tags"], [{ key: "service", value: "orders" }]);
  assert.deepEqual(lambda?.config["aliases"], [
    { functionVersion: "3", name: "canary" },
    { description: "production", functionVersion: "2", name: "live" }
  ]);
  assert.deepEqual(lambda?.config["versions"], ["$LATEST", "1", "2"]);
  assert.equal(lambda?.config["codeSourceType"], "image");
  assert.deepEqual(lambda?.config["reverseEngineeringIncompleteDetails"], [
    "aliases",
    "publishedVersions"
  ]);
  assert.ok(
    lambda?.relationships.every(
      (relationship) => !relationship.targetProviderResourceId.includes("arn:aws")
    )
  );

  const permissions = result.records.filter(
    (record) => record.providerResourceType === "AWS::Lambda::Permission"
  );
  assert.equal(permissions.length, 2);
  assert.equal(permissions[0]?.config["statementId"], "AllowApiGateway");
  assert.equal(permissions[1]?.config["statementId"], "DenyInvoke");
  assert.equal(permissions[0]?.config["managementReady"], false);
  assert.equal(permissions[1]?.config["managementReady"], false);
  assert.equal(new Set(permissions.map((record) => record.providerResourceId)).size, 2);
  assert.ok(
    permissions.every((permission) => /^aws-ref-[a-f0-9]{24}$/u.test(permission.providerResourceId))
  );

  const functionServerDetail = result.serverOnlyDetails.find(
    (detail) => detail.resourceKind === "function"
  );
  const permissionServerDetails = result.serverOnlyDetails.filter(
    (detail) => detail.resourceKind === "permission"
  );
  assert.equal(functionServerDetail?.terraformImportId, "orders-api");
  assert.equal(functionServerDetail?.tags?.["target"], roleArn);
  assert.deepEqual(permissionServerDetails.map((detail) => detail.terraformImportId).sort(), [
    "orders-api/AllowApiGateway",
    "orders-api/DenyInvoke"
  ]);

  const publicJson = JSON.stringify(result.records);
  assert.doesNotMatch(publicJson, new RegExp(environmentSecret));
  assert.doesNotMatch(publicJson, new RegExp(policySecret));
  assert.doesNotMatch(publicJson, /temporary-download\.example/u);
  assert.doesNotMatch(publicJson, /arn:aws/u);
  assert.doesNotMatch(publicJson, /123456789012\.dkr\.ecr/u);
  assert.match(JSON.stringify(result.serverOnlyDetails), new RegExp(environmentSecret));
  assert.match(JSON.stringify(result.serverOnlyDetails), new RegExp(policySecret));
  assert.match(JSON.stringify(result.serverOnlyDetails), new RegExp(roleArn));
  assert.match(JSON.stringify(result.serverOnlyDetails), /123456789012\.dkr\.ecr/u);
  assert.doesNotMatch(JSON.stringify(result), /temporary-download\.example/u);
});

test("keeps Zip functions and detail failures visible but never management-ready", async () => {
  const functionArn = "arn:aws:lambda:ap-northeast-2:123456789012:function:zip-api";
  const client: AwsLambdaDetailReadClient = {
    async send(command) {
      if (command instanceof ListFunctionsCommand) {
        return { Functions: [{ FunctionArn: functionArn, FunctionName: "zip-api" }] };
      }
      if (command instanceof GetFunctionCommand) {
        return {
          Configuration: {
            FunctionArn: functionArn,
            FunctionName: "zip-api",
            PackageType: "Zip",
            State: "Active",
            LastUpdateStatus: "Successful",
            Runtime: "nodejs22.x",
            Handler: "index.handler",
            Environment: { Variables: {} }
          },
          Code: {
            RepositoryType: "S3",
            Location: "https://temporary-download.example/never-store"
          }
        };
      }
      if (command instanceof ListTagsCommand) return { Tags: {} };
      if (command instanceof GetPolicyCommand) {
        const error = new Error("policy permission was denied with private ARN");
        error.name = "AccessDeniedException";
        throw error;
      }
      if (command instanceof ListAliasesCommand) return { Aliases: [] };
      if (command instanceof ListVersionsByFunctionCommand) return { Versions: [] };
      throw new Error(`Unexpected command ${command.constructor.name}`);
    }
  };

  const result = await readDetailedLambdaResources("ap-northeast-2", credentials, () => client);
  const lambda = result.records.find(
    (record) => record.providerResourceType === "AWS::Lambda::Function"
  );

  assert.equal(lambda?.config["managementReady"], false);
  assert.equal(lambda?.config["reverseEngineeringDetailsComplete"], false);
  assert.deepEqual(lambda?.config["reverseEngineeringIncompleteDetails"], [
    "packageType",
    "resourcePolicy"
  ]);
  assert.deepEqual(result.failures, [
    {
      detail: "resourcePolicy",
      outcome: "permission_denied",
      providerResourceId: lambda?.providerResourceId,
      providerResourceType: "AWS::Lambda::Function"
    }
  ]);
  assert.equal(
    result.records.some((record) => record.providerResourceType === "AWS::Lambda::Permission"),
    false
  );
  assert.doesNotMatch(JSON.stringify(result), /private ARN|temporary-download\.example/u);
});

test("treats an absent Lambda policy as a complete zero-permission result", async () => {
  const functionArn = "arn:aws:lambda:ap-northeast-2:123456789012:function:image-api";
  const client: AwsLambdaDetailReadClient = {
    async send(command) {
      if (command instanceof ListFunctionsCommand) {
        return { Functions: [{ FunctionArn: functionArn, FunctionName: "image-api" }] };
      }
      if (command instanceof GetFunctionCommand) {
        return {
          Configuration: {
            FunctionArn: functionArn,
            FunctionName: "image-api",
            PackageType: "Image",
            State: "Active",
            LastUpdateStatus: "Successful",
            Environment: { Variables: {} }
          },
          Code: { ImageUri: "example/image:v1" }
        };
      }
      if (command instanceof ListTagsCommand) return { Tags: {} };
      if (command instanceof GetPolicyCommand) {
        const error = new Error("policy does not exist");
        error.name = "ResourceNotFoundException";
        throw error;
      }
      if (command instanceof ListAliasesCommand) return { Aliases: [] };
      if (command instanceof ListVersionsByFunctionCommand) {
        return { Versions: [{ Version: "$LATEST" }] };
      }
      throw new Error(`Unexpected command ${command.constructor.name}`);
    }
  };

  const result = await readDetailedLambdaResources("ap-northeast-2", credentials, () => client);
  const lambda = result.records.find(
    (record) => record.providerResourceType === "AWS::Lambda::Function"
  );

  assert.equal(result.failures.length, 0);
  assert.equal(lambda?.config["managementReady"], true);
  assert.equal(lambda?.config["resourcePolicyPresent"], false);
  assert.equal(
    result.serverOnlyDetails.find((detail) => detail.resourceKind === "function")
      ?.terraformImportId,
    "image-api"
  );
});

test("only actual-Sid lossless Lambda permissions become management-ready", async () => {
  const functionArn = "arn:aws:lambda:ap-northeast-2:123456789012:function:policy-api";
  const client: AwsLambdaDetailReadClient = {
    async send(command) {
      if (command instanceof ListFunctionsCommand) {
        return { Functions: [{ FunctionArn: functionArn, FunctionName: "policy-api" }] };
      }
      if (command instanceof GetFunctionCommand) {
        return {
          Configuration: {
            FunctionArn: functionArn,
            FunctionName: "policy-api",
            PackageType: "Image",
            State: "Active",
            LastUpdateStatus: "Successful",
            Environment: { Variables: {} }
          },
          Code: { ImageUri: "example/image:v1" }
        };
      }
      if (command instanceof ListTagsCommand) return { Tags: {} };
      if (command instanceof GetPolicyCommand) {
        return {
          Policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Sid: "AllowApiGateway",
                Effect: "Allow",
                Principal: { Service: "apigateway.amazonaws.com" },
                Action: "lambda:InvokeFunction",
                Resource: functionArn
              },
              {
                Sid: "AllowApiGatewaySourceArn",
                Effect: "Allow",
                Principal: { Service: "apigateway.amazonaws.com" },
                Action: "lambda:InvokeFunction",
                Resource: functionArn,
                Condition: {
                  ArnLike: {
                    "AWS:SourceArn": "arn:aws:execute-api:ap-northeast-2:123456789012:api-id/*/*/*"
                  }
                }
              },
              {
                Sid: "QualifiedInvoke",
                Effect: "Allow",
                Principal: { Service: "apigateway.amazonaws.com" },
                Action: "lambda:InvokeFunction",
                Resource: `${functionArn}:live`
              },
              {
                Effect: "Allow",
                Principal: { Service: "events.amazonaws.com" },
                Action: "lambda:InvokeFunction",
                Resource: functionArn
              },
              {
                Sid: "DenyInvoke",
                Effect: "Deny",
                Principal: { Service: "events.amazonaws.com" },
                Action: "lambda:InvokeFunction",
                Resource: functionArn
              },
              {
                Sid: "ManyActions",
                Effect: "Allow",
                Principal: { Service: "events.amazonaws.com" },
                Action: ["lambda:InvokeFunction", "lambda:GetFunction"],
                Resource: functionArn
              },
              {
                Sid: "ManyPrincipals",
                Effect: "Allow",
                Principal: {
                  Service: ["events.amazonaws.com", "apigateway.amazonaws.com"]
                },
                Action: "lambda:InvokeFunction",
                Resource: functionArn
              },
              {
                Sid: "UnsupportedCondition",
                Effect: "Allow",
                Principal: { Service: "events.amazonaws.com" },
                Action: "lambda:InvokeFunction",
                Resource: functionArn,
                Condition: { StringEquals: { marker: "server-only-value" } }
              },
              {
                Sid: "DuplicateSourceArn",
                Effect: "Allow",
                Principal: { Service: "apigateway.amazonaws.com" },
                Action: "lambda:InvokeFunction",
                Resource: functionArn,
                Condition: {
                  ArnLike: { "AWS:SourceArn": "arn:aws:execute-api:region:account:first" },
                  ArnEquals: { "AWS:SourceArn": "arn:aws:execute-api:region:account:second" }
                }
              }
            ]
          })
        };
      }
      if (command instanceof ListAliasesCommand) return { Aliases: [] };
      if (command instanceof ListVersionsByFunctionCommand) {
        return { Versions: [{ Version: "$LATEST" }] };
      }
      throw new Error(`Unexpected command ${command.constructor.name}`);
    }
  };

  const result = await readDetailedLambdaResources("ap-northeast-2", credentials, () => client);
  const permissions = result.records.filter(
    (record) => record.providerResourceType === "AWS::Lambda::Permission"
  );

  assert.deepEqual(
    permissions.map((permission) => permission.config["statementId"]),
    [
      "AllowApiGateway",
      "AllowApiGatewaySourceArn",
      "QualifiedInvoke",
      "DenyInvoke",
      "ManyActions",
      "ManyPrincipals",
      "UnsupportedCondition",
      "DuplicateSourceArn"
    ]
  );
  assert.deepEqual(
    permissions.map((permission) => permission.config["managementReady"]),
    [true, true, true, false, false, false, false, false]
  );
  assert.equal(
    permissions.some((permission) =>
      String(permission.config["statementId"]).startsWith("generated-")
    ),
    false
  );
  assert.deepEqual(
    result.serverOnlyDetails
      .filter((detail) => detail.resourceKind === "permission")
      .map((detail) => detail.terraformImportId),
    [
      "policy-api/AllowApiGateway",
      "policy-api/AllowApiGatewaySourceArn",
      "policy-api/live/QualifiedInvoke",
      "policy-api/DenyInvoke",
      "policy-api/ManyActions",
      "policy-api/ManyPrincipals",
      "policy-api/UnsupportedCondition",
      "policy-api/DuplicateSourceArn"
    ]
  );
  assert.doesNotMatch(JSON.stringify(result.records), /arn:aws|server-only-value/u);
});
