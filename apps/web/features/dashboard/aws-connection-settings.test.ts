import assert from "node:assert/strict";
import test from "node:test";
import type {
  AwsConnection,
  AwsConnectionCloudFormationTemplateResponse
} from "@sketchcatch/types";
import { restoreAwsConnectionSetup } from "./aws-connection-setup";

const pendingConnection: AwsConnection = {
  id: "connection-1",
  userId: "user-1",
  accountId: null,
  roleArn: null,
  externalId: "external-1",
  region: "ap-northeast-2",
  status: "pending",
  lastVerifiedAt: null,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z"
};

const cloudFormation: AwsConnectionCloudFormationTemplateResponse = {
  roleName: "SketchCatchConnectionRole",
  stackName: "sketchcatch-connection-1",
  region: "ap-northeast-2",
  capabilities: ["CAPABILITY_NAMED_IAM"],
  templateBody: "{}",
  templateUrl: null,
  templateUrlExpiresAt: null,
  launchStackUrl: "https://console.aws.amazon.com/cloudformation",
  manualTemplateFallbackAvailable: true
};

test("pending AWS connections restore the saved verification setup", async () => {
  let requestedConnectionId = "";

  const restored = await restoreAwsConnectionSetup(pendingConnection, async (input) => {
    requestedConnectionId = input.connectionId;
    return cloudFormation;
  });

  assert.equal(requestedConnectionId, pendingConnection.id);
  assert.deepEqual(restored, {
    connection: pendingConnection,
    cloudFormation,
    accountId: "",
    region: pendingConnection.region
  });
});
