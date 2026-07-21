import assert from "node:assert/strict";
import { test } from "node:test";
import type { AwsConnection } from "@sketchcatch/types";
import {
  AwsConnectionRuntimeCredentialsError,
  prepareTerraformAwsCredentialEnv
} from "./aws-connection-runtime-credentials.js";
import type { AwsConnectionStsGateway } from "./aws-connection-test-service.js";

const verifiedConnection: AwsConnection = {
  id: "6155880e-1111-4222-8333-444444444444",
  userId: "user-1",
  accountId: "691684280342",
  roleArn: "arn:aws:iam::691684280342:role/SketchCatchTerraformExecutionRole-6155880e",
  externalId: "sc_conn_test_external_id",
  region: "ap-northeast-2",
  status: "verified",
  lastVerifiedAt: "2026-07-16T00:00:00.000Z",
  createdAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z"
};

test("Terraform credentials preserve an AssumeRole permission denial", async () => {
  const gateway: AwsConnectionStsGateway = {
    async assumeRole() {
      const error = new Error("not authorized to perform: sts:AssumeRole");
      error.name = "AccessDenied";
      throw error;
    },
    async getCallerIdentity() {
      throw new Error("GetCallerIdentity must not run after AssumeRole fails");
    }
  };

  await assert.rejects(
    prepareTerraformAwsCredentialEnv(verifiedConnection, gateway, { reportFailure: () => {} }),
    new AwsConnectionRuntimeCredentialsError("AWS Role assume permission denied")
  );
});

test("Terraform credentials preserve an expired caller credential error", async () => {
  const gateway: AwsConnectionStsGateway = {
    async assumeRole() {
      const error = new Error("caller token expired");
      error.name = "ExpiredToken";
      throw error;
    },
    async getCallerIdentity() {
      throw new Error("GetCallerIdentity must not run after AssumeRole fails");
    }
  };

  await assert.rejects(
    prepareTerraformAwsCredentialEnv(verifiedConnection, gateway, { reportFailure: () => {} }),
    new AwsConnectionRuntimeCredentialsError("AWS caller credentials are invalid or expired")
  );
});
