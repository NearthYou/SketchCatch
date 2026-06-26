import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAwsConnectionSetup,
  getAwsConnectionCloudFormationTemplate,
  listProjects,
  saveProjectDraft,
  testAwsConnection,
  verifyAwsConnection
} from "./api";
import type { Project } from "../../../../packages/types/src";

const AUTH_SESSION_STORAGE_KEY = "sketchcatch.auth.session";

const project: Project = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  name: "Learning VPC",
  description: "VPC practice",
  createdAt: "2026-06-24T01:00:00.000Z",
  updatedAt: "2026-06-24T02:00:00.000Z"
};

test("listProjects fetches projects for the authenticated user", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];

  context.after(() => {
    globalThis.fetch = originalFetch;
    restoreWindow(originalWindowDescriptor);
  });

  installAuthSession();

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    return new Response(JSON.stringify({ projects: [project] }), {
      headers: {
        "Content-Type": "application/json"
      },
      status: 200
    });
  };

  const projects = await listProjects();

  assert.equal(String(requests[0]?.input), "/api/projects");
  assert.equal(requests[0]?.init?.method, undefined);
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.deepEqual(projects, [project]);
});

test("saveProjectDraft sends authenticated PUT request with diagram json", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];

  context.after(() => {
    globalThis.fetch = originalFetch;
    restoreWindow(originalWindowDescriptor);
  });

  installAuthSession();

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    return new Response(JSON.stringify({ draft: null }), {
      headers: {
        "Content-Type": "application/json"
      },
      status: 200
    });
  };

  await saveProjectDraft({
    projectId: project.id,
    diagramJson: {
      nodes: [],
      edges: [],
      viewport: {
        x: 0,
        y: 0,
        zoom: 1
      }
    }
  });

  assert.equal(String(requests[0]?.input), `/api/projects/${project.id}/draft`);
  assert.equal(requests[0]?.init?.method, "PUT");
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    diagramJson: {
      nodes: [],
      edges: [],
      viewport: {
        x: 0,
        y: 0,
        zoom: 1
      }
    }
  });
});

test("createAwsConnectionSetup requests generated Role setup values", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];

  context.after(() => {
    globalThis.fetch = originalFetch;
    restoreWindow(originalWindowDescriptor);
  });

  installAuthSession();

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    return new Response(
      JSON.stringify({
        awsConnection: {
          id: "33333333-3333-4333-8333-333333333333",
          projectId: project.id,
          userId: project.userId,
          accountId: null,
          roleArn: null,
          externalId: "sc_conn_33333333-3333-4333-8333-333333333333_random",
          region: "ap-northeast-2",
          status: "pending",
          lastVerifiedAt: null,
          createdAt: "2026-06-26T00:00:00.000Z",
          updatedAt: "2026-06-26T00:00:00.000Z"
        },
        callerPrincipalArn: "arn:aws:iam::123456789012:role/SketchCatchRuntimeRole",
        recommendedRoleName: "SketchCatchTerraformExecutionRole",
        roleSetup: {
          roleName: "SketchCatchTerraformExecutionRole",
          trustedPrincipalArn: "arn:aws:iam::123456789012:role/SketchCatchRuntimeRole",
          externalId: "sc_conn_33333333-3333-4333-8333-333333333333_random",
          trustPolicy: {
            Version: "2012-10-17",
            Statement: []
          },
          permissionSetup: {
            verificationActions: ["sts:GetCallerIdentity"],
            initialPolicyDocument: null,
            terraformPolicyDocument: null
          }
        },
        callerRoleSetup: {
          policyName: "SketchCatchAssumeTerraformExecutionRole",
          assumableRoleArnPattern: "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole",
          policyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: "sts:AssumeRole",
                Resource: "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole"
              }
            ]
          }
        },
        trustPolicyTemplate: {
          Version: "2012-10-17",
          Statement: []
        }
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 201
      }
    );
  };

  const response = await createAwsConnectionSetup({
    projectId: project.id,
    region: "ap-northeast-2"
  });

  assert.equal(String(requests[0]?.input), `/api/projects/${project.id}/aws-connections`);
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    region: "ap-northeast-2"
  });
  assert.equal(
    response.awsConnection.externalId,
    "sc_conn_33333333-3333-4333-8333-333333333333_random"
  );
  assert.equal(
    response.callerPrincipalArn,
    "arn:aws:iam::123456789012:role/SketchCatchRuntimeRole"
  );
  assert.equal(response.roleSetup.roleName, "SketchCatchTerraformExecutionRole");
  assert.equal(
    response.roleSetup.externalId,
    "sc_conn_33333333-3333-4333-8333-333333333333_random"
  );
  assert.deepEqual(response.roleSetup.permissionSetup.verificationActions, [
    "sts:GetCallerIdentity"
  ]);
  assert.equal(response.roleSetup.permissionSetup.initialPolicyDocument, null);
  assert.equal(
    response.callerRoleSetup.assumableRoleArnPattern,
    "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole"
  );
});

test("testAwsConnection requests STS connection test without exposing credentials", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];

  context.after(() => {
    globalThis.fetch = originalFetch;
    restoreWindow(originalWindowDescriptor);
  });

  installAuthSession();

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    return new Response(
      JSON.stringify({
        ok: true,
        accountId: "123456789012",
        callerArn:
          "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/sketchcatch-connection-test",
        region: "ap-northeast-2"
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      }
    );
  };

  const response = await testAwsConnection({
    projectId: project.id,
    connectionId: "33333333-3333-4333-8333-333333333333",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole"
  });

  assert.equal(
    String(requests[0]?.input),
    `/api/projects/${project.id}/aws-connections/33333333-3333-4333-8333-333333333333/test`
  );
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole"
  });
  assert.deepEqual(response, {
    ok: true,
    accountId: "123456789012",
    callerArn:
      "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/sketchcatch-connection-test",
    region: "ap-northeast-2"
  });
  assert.equal("credentials" in response, false);
  assert.equal("accessKeyId" in response, false);
  assert.equal("secretAccessKey" in response, false);
  assert.equal("sessionToken" in response, false);
});

test("verifyAwsConnection stores verified AWS connection metadata", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];

  context.after(() => {
    globalThis.fetch = originalFetch;
    restoreWindow(originalWindowDescriptor);
  });

  installAuthSession();

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    return new Response(
      JSON.stringify({
        ok: true,
        accountId: "123456789012",
        callerArn:
          "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/sketchcatch-connection-test",
        region: "ap-northeast-2",
        awsConnection: {
          id: "33333333-3333-4333-8333-333333333333",
          projectId: "11111111-1111-4111-8111-111111111111",
          userId: "22222222-2222-4222-8222-222222222222",
          accountId: "123456789012",
          roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
          externalId: "sc_conn_33333333-3333-4333-8333-333333333333_random",
          region: "ap-northeast-2",
          status: "verified",
          lastVerifiedAt: "2026-06-26T00:00:00.000Z",
          createdAt: "2026-06-26T00:00:00.000Z",
          updatedAt: "2026-06-26T00:00:00.000Z"
        }
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      }
    );
  };

  const response = await verifyAwsConnection({
    projectId: "11111111-1111-4111-8111-111111111111",
    connectionId: "33333333-3333-4333-8333-333333333333",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole"
  });

  assert.equal(
    String(requests[0]?.input),
    "/api/projects/11111111-1111-4111-8111-111111111111/aws-connections/33333333-3333-4333-8333-333333333333/verify"
  );
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole"
  });
  assert.equal(response.awsConnection.status, "verified");
  assert.equal(response.awsConnection.accountId, "123456789012");
  assert.equal("credentials" in response, false);
  assert.equal("accessKeyId" in response, false);
  assert.equal("secretAccessKey" in response, false);
  assert.equal("sessionToken" in response, false);
});

test("getAwsConnectionCloudFormationTemplate fetches the launch stack setup", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];

  context.after(() => {
    globalThis.fetch = originalFetch;
    restoreWindow(originalWindowDescriptor);
  });

  installAuthSession();

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    return new Response(
      JSON.stringify({
        roleName: "SketchCatchTerraformExecutionRole",
        stackName: "sketchcatch-aws-connection-33333333",
        region: "ap-northeast-2",
        capabilities: ["CAPABILITY_NAMED_IAM"],
        templateBody:
          "Resources:\n  SketchCatchTerraformExecutionRole:\n    Type: AWS::IAM::Role\n",
        templateUrl:
          "https://api.sketchcatch.test/api/aws/connections/cloudformation-template?token=signed",
        templateUrlExpiresAt: "2026-06-26T01:00:00.000Z",
        launchStackUrl:
          "https://console.aws.amazon.com/cloudformation/home?region=ap-northeast-2#/stacks/quickcreate?templateURL=https%3A%2F%2Fapi.sketchcatch.test%2Fapi%2Faws%2Fconnections%2Fcloudformation-template%3Ftoken%3Dsigned&stackName=sketchcatch-aws-connection-33333333"
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      }
    );
  };

  const response = await getAwsConnectionCloudFormationTemplate({
    projectId: "11111111-1111-4111-8111-111111111111",
    connectionId: "33333333-3333-4333-8333-333333333333"
  });

  assert.equal(
    String(requests[0]?.input),
    "/api/projects/11111111-1111-4111-8111-111111111111/aws-connections/33333333-3333-4333-8333-333333333333/cloudformation-template"
  );
  assert.equal(requests[0]?.init?.method, undefined);
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.equal(response.roleName, "SketchCatchTerraformExecutionRole");
  assert.equal(response.capabilities[0], "CAPABILITY_NAMED_IAM");
  assert.match(response.launchStackUrl ?? "", /cloudformation\/home/);
});

function installAuthSession(): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: createMemoryStorage({
        [AUTH_SESSION_STORAGE_KEY]: JSON.stringify({
          accessToken: "access-token",
          refreshToken: "refresh-token",
          expiresInSeconds: 3600
        })
      })
    }
  });
}

function createMemoryStorage(initialValues: Record<string, string>) {
  const values = new Map(Object.entries(initialValues));

  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
}

function restoreWindow(descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(globalThis, "window", descriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, "window");
}
