import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approveDeploymentPlan,
  abortProjectAssetUpload,
  applyGitCicdAwsRoleDiff,
  applyGitCicdRepositorySettings,
  applyGitCicdRepositorySettingsWithGitHubOAuth,
  confirmProjectAssetUpload,
  createAiArchitecturePatchPreview,
  createArchitectureSnapshot,
  createAwsConnectionSetup,
  createDeployment,
  createGitCicdGitHubOAuthStartUrl,
  createProjectAssetUpload,
  cancelReverseEngineeringScan,
  createReverseEngineeringPreviewScan,
  createReverseEngineeringScan,
  deleteAwsConnection,
  deleteProject,
  deleteReverseEngineeringScan,
  getAwsConnectionCloudFormationTemplate,
  getDeploymentFailureExplanation,
  getGitCicdHandoffPipelineStatus,
  getProjectDeletePreview,
  listDeploymentResources,
  listAwsConnections,
  listDeployments,
  listGitCicdHandoffs,
  listTerraformOutputs,
  listCostUsageAnalysis,
  listProjects,
  listReverseEngineeringScanLogs,
  listReverseEngineeringScans,
  runDeploymentDestroy,
  runDeploymentDestroyPlan,
  runDeploymentPlan,
  runDeploymentApply,
  saveProjectDraft,
  testAwsConnection,
  uploadProjectAsset,
  validateTerraformCode,
  verifyAwsConnection,
  verifyAwsConnectionCreatedRole
} from "./api";
import type { Project } from "../../../../packages/types/src";
import { clearStoredAuthSession, writeStoredAuthSession } from "../../lib/auth-storage";

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

test("listCostUsageAnalysis fetches actual usage analysis with range and AWS connection query", async (context) => {
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
        currency: "USD",
        dailyTrend: [],
        dataSource: "sample",
        endDate: "2026-07-07",
        fallbackUsed: true,
        forecastMonthEndCost: {
          amount: 42,
          currency: "USD"
        },
        generatedAt: "2026-07-07T00:00:00.000Z",
        metricSeries: [],
        projectCosts: [],
        range: "30d",
        recommendations: [],
        serviceCosts: [],
        startDate: "2026-06-08",
        totalCost: {
          amount: 40,
          currency: "USD"
        },
        wasteResources: []
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      }
    );
  };

  const response = await listCostUsageAnalysis({
    awsConnectionId: "33333333-3333-4333-8333-333333333333",
    range: "30d"
  });

  assert.equal(
    String(requests[0]?.input),
    "/api/costs/usage?range=30d&awsConnectionId=33333333-3333-4333-8333-333333333333"
  );
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.equal(response.totalCost.amount, 40);
  assert.equal(response.fallbackUsed, true);
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

test("validateTerraformCode sends Terraform validation files only", async (context) => {
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
        diagnostics: []
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      }
    );
  };

  const response = await validateTerraformCode({
    terraformCode: "",
    terraformFiles: [
      {
        fileName: "main.tf",
        terraformCode: `resource "aws_vpc" "main" {}`
      }
    ]
  });

  assert.deepEqual(response, {
    diagnostics: []
  });
  assert.equal(String(requests[0]?.input), "/api/terraform/validate");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    terraformCode: "",
    terraformFiles: [
      {
        fileName: "main.tf",
        terraformCode: `resource "aws_vpc" "main" {}`
      }
    ]
  });
});

test("createArchitectureSnapshot posts converted architecture json", async (context) => {
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
        architecture: {
          id: "55555555-5555-4555-8555-555555555555",
          projectId: project.id,
          version: 1,
          source: "manual",
          architectureJson: { nodes: [], edges: [] },
          createdAt: "2026-06-26T00:00:00.000Z"
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

  const architecture = await createArchitectureSnapshot({
    projectId: project.id,
    source: "manual",
    architectureJson: { nodes: [], edges: [] }
  });

  assert.equal(String(requests[0]?.input), `/api/projects/${project.id}/architectures`);
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    source: "manual",
    architectureJson: { nodes: [], edges: [] }
  });
  assert.equal(architecture.id, "55555555-5555-4555-8555-555555555555");
});

test("createAiArchitecturePatchPreview posts natural language edit requests to the public AI patch endpoint", async (context) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];

  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    return new Response(
      JSON.stringify({
        status: "preview",
        intent: {
          instruction: "delete bucket",
          requestedAction: "remove_resource",
          resourceType: "S3",
          targetResourceId: "assets-bucket"
        },
        baseArchitectureJson: {
          nodes: [],
          edges: []
        },
        proposedArchitectureJson: {
          nodes: [],
          edges: []
        },
        changes: [],
        requiresUserAcceptance: true,
        userAcceptedChange: null,
        providerMetadata: {
          provider: "fallback",
          service: "rule_fallback",
          routeTarget: "architecture_patch_preview",
          cacheHit: false,
          cacheKey: "test",
          estimatedUsage: {
            inputCharacters: 1,
            inputTokensEstimate: 1
          },
          billingMode: "disabled",
          generatedAt: new Date(0).toISOString()
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

  const response = await createAiArchitecturePatchPreview({
    architectureJson: {
      nodes: [],
      edges: []
    },
    instruction: "delete bucket",
    selectedTargetResourceId: "assets-bucket",
    connectionTargetResourceId: "app-server",
    skipConnection: true
  });

  assert.equal(String(requests[0]?.input), "/api/ai/architecture-patch-preview");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    architectureJson: {
      nodes: [],
      edges: []
    },
    instruction: "delete bucket",
    selectedTargetResourceId: "assets-bucket",
    connectionTargetResourceId: "app-server",
    skipConnection: true
  });
  assert.equal(response.status, "preview");
});

test("createProjectAssetUpload requests terraform file presigned upload metadata", async (context) => {
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
        asset: {
          id: "66666666-6666-4666-8666-666666666666",
          projectId: project.id,
          architectureId: "55555555-5555-4555-8555-555555555555",
          assetType: "terraform_file",
          objectKey: "projects/project/assets/terraform.tf",
          fileName: "main.tf",
          contentType: "text/plain",
          byteSize: 12,
          uploadStatus: "pending",
          createdAt: "2026-06-26T00:00:00.000Z"
        },
        upload: {
          method: "PUT",
          url: "https://s3.example.test/upload",
          headers: { "Content-Type": "text/plain" },
          expiresInSeconds: 900
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

  const response = await createProjectAssetUpload({
    projectId: project.id,
    architectureId: "55555555-5555-4555-8555-555555555555",
    assetType: "terraform_file",
    fileName: "main.tf",
    contentType: "text/plain",
    byteSize: 12
  });

  assert.equal(String(requests[0]?.input), `/api/projects/${project.id}/assets/presigned-upload`);
  assert.equal(requests[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    architectureId: "55555555-5555-4555-8555-555555555555",
    assetType: "terraform_file",
    fileName: "main.tf",
    contentType: "text/plain",
    byteSize: 12
  });
  assert.equal(response.asset.assetType, "terraform_file");
  assert.equal(response.asset.uploadStatus, "pending");
  assert.equal(response.upload.method, "PUT");
});

test("uploadProjectAsset uploads terraform content to the presigned URL", async (context) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];

  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    return new Response(null, {
      status: 200
    });
  };

  await uploadProjectAsset(
    {
      method: "PUT",
      url: "https://s3.example.test/upload",
      headers: { "Content-Type": "text/plain" },
      expiresInSeconds: 900
    },
    "resource {}"
  );

  assert.equal(String(requests[0]?.input), "https://s3.example.test/upload");
  assert.equal(requests[0]?.init?.method, "PUT");
  assert.equal(new Headers(requests[0]?.init?.headers).get("content-type"), "text/plain");
  assert.equal(requests[0]?.init?.body, "resource {}");
});

test("confirmProjectAssetUpload marks the uploaded asset through the API", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];
  const assetId = "66666666-6666-4666-8666-666666666666";

  context.after(() => {
    globalThis.fetch = originalFetch;
    restoreWindow(originalWindowDescriptor);
  });

  installAuthSession();

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    return new Response(
      JSON.stringify({
        asset: {
          id: assetId,
          projectId: project.id,
          architectureId: "55555555-5555-4555-8555-555555555555",
          assetType: "terraform_file",
          objectKey: "projects/project/assets/terraform.tf",
          fileName: "main.tf",
          contentType: "text/plain",
          byteSize: 12,
          uploadStatus: "uploaded",
          createdAt: "2026-06-26T00:00:00.000Z"
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

  const asset = await confirmProjectAssetUpload({
    projectId: project.id,
    assetId
  });

  assert.equal(
    String(requests[0]?.input),
    `/api/projects/${project.id}/assets/${assetId}/confirm-upload`
  );
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.equal(asset.uploadStatus, "uploaded");
});

test("abortProjectAssetUpload requests pending upload cleanup", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];
  const assetId = "66666666-6666-4666-8666-666666666666";

  context.after(() => {
    globalThis.fetch = originalFetch;
    restoreWindow(originalWindowDescriptor);
  });

  installAuthSession();

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    return new Response(null, {
      status: 204
    });
  };

  await abortProjectAssetUpload({
    projectId: project.id,
    assetId
  });

  assert.equal(
    String(requests[0]?.input),
    `/api/projects/${project.id}/assets/${assetId}/abort-upload`
  );
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
});

test("deleteProject sends an authenticated DELETE request", async (context) => {
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
        deleted: true,
        cleanup: {
          failedObjectCount: 0,
          message: null,
          s3Status: "success"
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

  const result = await deleteProject(project.id, "delete_project_only");

  assert.equal(String(requests[0]?.input), `/api/projects/${project.id}`);
  assert.equal(requests[0]?.init?.method, "DELETE");
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    action: "delete_project_only"
  });
  assert.equal(result.cleanup.s3Status, "success");
});

test("getProjectDeletePreview fetches the project deletion mode", async (context) => {
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
        preview: {
          activeDeploymentCount: 1,
          activeDeploymentId: "44444444-4444-4444-8444-444444444444",
          activeResourceCount: 2,
          availableActions: ["destroy_then_delete", "delete_project_only"],
          hasDeploymentHistory: true,
          hasPlanHistory: true,
          latestDeploymentStatus: "SUCCESS",
          message: "현재 AWS에 배포된 리소스가 있습니다.",
          mode: "active_resources",
          projectId: project.id
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

  const preview = await getProjectDeletePreview(project.id);

  assert.equal(String(requests[0]?.input), `/api/projects/${project.id}/delete-preview`);
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.equal(preview.mode, "active_resources");
  assert.equal(preview.activeDeploymentId, "44444444-4444-4444-8444-444444444444");
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
        recommendedRoleName: "SketchCatchTerraformExecutionRole-33333333",
        roleSetup: {
          roleName: "SketchCatchTerraformExecutionRole-33333333",
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
          assumableRoleArnPattern: "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole*",
          policyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: "sts:AssumeRole",
                Resource: [
                  "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole",
                  "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole-*"
                ]
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
    region: "ap-northeast-2"
  });

  assert.equal(String(requests[0]?.input), "/api/aws/connections");
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
  assert.equal(response.roleSetup.roleName, "SketchCatchTerraformExecutionRole-33333333");
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
    "arn:aws:iam::*:role/SketchCatchTerraformExecutionRole*"
  );
});

test("listAwsConnections fetches user AWS connection metadata", async (context) => {
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
        awsConnections: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            userId: project.userId,
            accountId: "123456789012",
            roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
            externalId: "sc_conn_33333333-3333-4333-8333-333333333333_random",
            region: "ap-northeast-2",
            status: "verified",
            lastVerifiedAt: "2026-06-26T00:00:00.000Z",
            createdAt: "2026-06-26T00:00:00.000Z",
            updatedAt: "2026-06-26T00:00:00.000Z"
          }
        ]
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      }
    );
  };

  const connections = await listAwsConnections();

  assert.equal(String(requests[0]?.input), "/api/aws/connections");
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.equal(connections[0]?.status, "verified");
  assert.equal(connections[0]?.accountId, "123456789012");
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
    connectionId: "33333333-3333-4333-8333-333333333333",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole"
  });

  assert.equal(
    String(requests[0]?.input),
    "/api/aws/connections/33333333-3333-4333-8333-333333333333/test"
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
    connectionId: "33333333-3333-4333-8333-333333333333",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole"
  });

  assert.equal(
    String(requests[0]?.input),
    "/api/aws/connections/33333333-3333-4333-8333-333333333333/verify"
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

test("verifyAwsConnectionCreatedRole stores the CloudFormation-created role by account id", async (context) => {
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

  const response = await verifyAwsConnectionCreatedRole({
    accountId: "123456789012",
    connectionId: "33333333-3333-4333-8333-333333333333"
  });

  assert.equal(
    String(requests[0]?.input),
    "/api/aws/connections/33333333-3333-4333-8333-333333333333/verify-created-role"
  );
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    accountId: "123456789012"
  });
  assert.equal(response.awsConnection.status, "verified");
  assert.equal(response.awsConnection.accountId, "123456789012");
  assert.equal("credentials" in response, false);
  assert.equal("accessKeyId" in response, false);
  assert.equal("secretAccessKey" in response, false);
  assert.equal("sessionToken" in response, false);
});

test("deleteAwsConnection sends an authenticated DELETE request", async (context) => {
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

    return new Response(null, {
      status: 204
    });
  };

  await deleteAwsConnection("33333333-3333-4333-8333-333333333333");

  assert.equal(
    String(requests[0]?.input),
    "/api/aws/connections/33333333-3333-4333-8333-333333333333"
  );
  assert.equal(requests[0]?.init?.method, "DELETE");
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
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
        roleName: "SketchCatchTerraformExecutionRole-33333333",
        stackName: "sketchcatch-aws-connection-33333333",
        region: "ap-northeast-2",
        capabilities: ["CAPABILITY_NAMED_IAM"],
        templateBody:
          "Resources:\n  SketchCatchTerraformExecutionRole:\n    Type: AWS::IAM::Role\n",
        templateUrl:
          "https://sketchcatch-test-bucket.s3.ap-northeast-2.amazonaws.com/aws-connections/33333333-3333-4333-8333-333333333333/cloudformation-template.yaml?X-Amz-Signature=signed",
        templateUrlExpiresAt: "2026-06-26T01:00:00.000Z",
        manualTemplateFallbackAvailable: false,
        launchStackUrl:
          "https://console.aws.amazon.com/cloudformation/home?region=ap-northeast-2#/stacks/quickcreate?templateURL=https%3A%2F%2Fsketchcatch-test-bucket.s3.ap-northeast-2.amazonaws.com%2Faws-connections%2F33333333-3333-4333-8333-333333333333%2Fcloudformation-template.yaml%3FX-Amz-Signature%3Dsigned&stackName=sketchcatch-aws-connection-33333333"
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
    connectionId: "33333333-3333-4333-8333-333333333333"
  });

  assert.equal(
    String(requests[0]?.input),
    "/api/aws/connections/33333333-3333-4333-8333-333333333333/cloudformation-template"
  );
  assert.equal(requests[0]?.init?.method, undefined);
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.equal(response.roleName, "SketchCatchTerraformExecutionRole-33333333");
  assert.equal(response.capabilities[0], "CAPABILITY_NAMED_IAM");
  assert.equal(response.manualTemplateFallbackAvailable, false);
  assert.match(response.launchStackUrl ?? "", /cloudformation\/home/);
});

test("createReverseEngineeringScan starts an authenticated AWS scan", async (context) => {
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
        scan: createReverseEngineeringScanPayload({
          id: "77777777-7777-4777-8777-777777777777",
          projectId: project.id,
          status: "running"
        })
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 202
      }
    );
  };

  const response = await createReverseEngineeringScan({
    projectId: project.id,
    awsConnectionId: "33333333-3333-4333-8333-333333333333",
    region: "ap-northeast-2",
    resourceTypes: ["VPC", "SUBNET", "EC2", "RDS", "S3", "SECURITY_GROUP"]
  });

  assert.equal(
    String(requests[0]?.input),
    `/api/projects/${project.id}/reverse-engineering/scans`
  );
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    awsConnectionId: "33333333-3333-4333-8333-333333333333",
    region: "ap-northeast-2",
    resourceTypes: ["VPC", "SUBNET", "EC2", "RDS", "S3", "SECURITY_GROUP"]
  });
  assert.equal(response.scan.status, "running");
  assert.equal(response.result, undefined);
});

test("createReverseEngineeringPreviewScan starts an authenticated AWS scan without a project", async (context) => {
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

    const scan = createReverseEngineeringScanPayload({
      id: "77777777-7777-4777-8777-777777777777",
      projectId: "00000000-0000-4000-8000-000000000000",
      status: "completed"
    });

    return new Response(
      JSON.stringify({
        scan,
        result: {
          scan,
          discoveredResources: [],
          reverseEngineeringDraft: {
            id: `draft-${scan.id}`,
            scanId: scan.id,
            architectureJson: { nodes: [], edges: [] },
            protectedValueKeys: [],
            editableValueKeys: [],
            createdAt: "2026-07-05T00:00:01.000Z"
          },
          architectureJson: { nodes: [], edges: [] },
          findings: [],
          analysisExclusions: [],
          importSuggestions: [],
          scanErrors: []
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

  const response = await createReverseEngineeringPreviewScan({
    awsConnectionId: "33333333-3333-4333-8333-333333333333",
    region: "ap-northeast-2",
    resourceTypes: ["ALL"]
  });

  assert.equal(String(requests[0]?.input), "/api/reverse-engineering/scans/preview");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    awsConnectionId: "33333333-3333-4333-8333-333333333333",
    region: "ap-northeast-2",
    resourceTypes: ["ALL"]
  });
  assert.equal(response.scan.status, "completed");
  assert.equal(response.result?.reverseEngineeringDraft.scanId, response.scan.id);
});

test("reverseEngineering helpers list scans and logs", async (context) => {
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

    if (String(input).endsWith("/logs")) {
      return new Response(
        JSON.stringify({
          logs: [
            {
              id: "log-1",
              scanId: "77777777-7777-4777-8777-777777777777",
              sequence: 1,
              stage: "provider_api",
              level: "INFO",
              message: "VPC 목록을 읽었습니다.",
              createdAt: "2026-07-05T00:00:00.000Z"
            }
          ]
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    }

    return new Response(
      JSON.stringify({
        scans: [
          createReverseEngineeringScanPayload({
            id: "77777777-7777-4777-8777-777777777777",
            projectId: project.id
          })
        ]
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      }
    );
  };

  const scans = await listReverseEngineeringScans(project.id);
  const logs = await listReverseEngineeringScanLogs({
    projectId: project.id,
    scanId: "77777777-7777-4777-8777-777777777777"
  });

  assert.equal(
    String(requests[0]?.input),
    `/api/projects/${project.id}/reverse-engineering/scans`
  );
  assert.equal(
    String(requests[1]?.input),
    `/api/projects/${project.id}/reverse-engineering/scans/77777777-7777-4777-8777-777777777777/logs`
  );
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.equal(scans[0]?.status, "completed");
  assert.equal(logs[0]?.stage, "provider_api");
});

test("reverseEngineering helpers cancel and delete scans", async (context) => {
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

    if (init?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }

    return new Response(
      JSON.stringify({
        scan: createReverseEngineeringScanPayload({
          id: "77777777-7777-4777-8777-777777777777",
          projectId: project.id,
          status: "cancelled"
        })
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      }
    );
  };

  const cancelledScan = await cancelReverseEngineeringScan({
    projectId: project.id,
    scanId: "77777777-7777-4777-8777-777777777777"
  });
  await deleteReverseEngineeringScan({
    projectId: project.id,
    scanId: "77777777-7777-4777-8777-777777777777"
  });

  assert.equal(
    String(requests[0]?.input),
    `/api/projects/${project.id}/reverse-engineering/scans/77777777-7777-4777-8777-777777777777/cancel`
  );
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(
    String(requests[1]?.input),
    `/api/projects/${project.id}/reverse-engineering/scans/77777777-7777-4777-8777-777777777777`
  );
  assert.equal(requests[1]?.init?.method, "DELETE");
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.equal(cancelledScan.status, "cancelled");
});

test("createDeployment posts selected artifact and verified AWS connection", async (context) => {
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
        deployment: createDeploymentPayload({
          id: "44444444-4444-4444-8444-444444444444",
          projectId: project.id
        })
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 201
      }
    );
  };

  const deployment = await createDeployment({
    projectId: project.id,
    architectureId: "55555555-5555-4555-8555-555555555555",
    terraformArtifactId: "66666666-6666-4666-8666-666666666666",
    awsConnectionId: "33333333-3333-4333-8333-333333333333"
  });

  assert.equal(String(requests[0]?.input), `/api/projects/${project.id}/deployments`);
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    architectureId: "55555555-5555-4555-8555-555555555555",
    terraformArtifactId: "66666666-6666-4666-8666-666666666666",
    awsConnectionId: "33333333-3333-4333-8333-333333333333"
  });
  assert.equal(deployment.status, "PENDING");
});

test("deployment helpers list records, start plan, approve plan, apply, destroy, and read results", async (context) => {
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

    if (String(input).endsWith("/destroy/plan")) {
      return new Response(
        JSON.stringify({
          deployment: createDeploymentPayload({
            id: "44444444-4444-4444-8444-444444444444",
            projectId: project.id,
            currentPlanOperation: "destroy",
            status: "RUNNING"
          })
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 202
        }
      );
    }

    if (String(input).endsWith("/plan")) {
      return new Response(
        JSON.stringify({
          deployment: createDeploymentPayload({
            id: "44444444-4444-4444-8444-444444444444",
            projectId: project.id,
            status: "RUNNING"
          })
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 202
        }
      );
    }

    if (String(input).endsWith("/approve")) {
      return new Response(
        JSON.stringify({
          deployment: createDeploymentPayload({
            id: "44444444-4444-4444-8444-444444444444",
            projectId: project.id,
            approved: true
          })
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    }

    if (String(input).endsWith("/apply")) {
      return new Response(
        JSON.stringify({
          deployment: createDeploymentPayload({
            id: "44444444-4444-4444-8444-444444444444",
            projectId: project.id,
            status: "RUNNING",
            approved: true
          })
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 202
        }
      );
    }

    if (String(input).endsWith("/destroy")) {
      return new Response(
        JSON.stringify({
          deployment: createDeploymentPayload({
            id: "44444444-4444-4444-8444-444444444444",
            projectId: project.id,
            currentPlanOperation: "destroy",
            status: "RUNNING"
          })
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 202
        }
      );
    }

    if (String(input).endsWith("/resources")) {
      return new Response(
        JSON.stringify({
          resources: [
            {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              deploymentId: "44444444-4444-4444-8444-444444444444",
              terraformAddress: "aws_instance.web",
              terraformType: "aws_instance",
              providerName: "registry.terraform.io/hashicorp/aws",
              resourceId: "i-0123456789abcdef0",
              region: "ap-northeast-2",
              createdAt: "2026-06-26T00:00:00.000Z"
            }
          ]
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    }

    if (String(input).endsWith("/outputs")) {
      return new Response(
        JSON.stringify({
          outputs: [
            {
              id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              deploymentId: "44444444-4444-4444-8444-444444444444",
              name: "instance_id",
              value: "i-0123456789abcdef0",
              sensitive: false,
              createdAt: "2026-06-26T00:00:00.000Z"
            }
          ]
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    }

    if (String(input).endsWith("/failure-explanation")) {
      return new Response(
        JSON.stringify({
          explanation: {
            deploymentId: "44444444-4444-4444-8444-444444444444",
            stage: "apply",
            severity: "high",
            summary: "apply 단계에서 Direct Deployment가 실패했습니다.",
            likelyCause: "권한 부족",
            nextActions: ["권한을 확인하세요."],
            firstErrorLog: "AccessDenied",
            cleanupRequired: true,
            llmExplanation: {
              target: "terraform_error_explanation",
              summary: "fallback summary",
              highlights: [],
              nextActions: ["권한을 확인하세요."],
              fallbackUsed: true,
              fallbackReason: "missing_api_key"
            }
          }
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    }

    return new Response(
      JSON.stringify({
        deployments: [
          createDeploymentPayload({
            id: "44444444-4444-4444-8444-444444444444",
            projectId: project.id
          })
        ]
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      }
    );
  };

  const deployments = await listDeployments(project.id);
  const runningDeployment = await runDeploymentPlan("44444444-4444-4444-8444-444444444444");
  const approvedDeployment = await approveDeploymentPlan("44444444-4444-4444-8444-444444444444");
  const applyingDeployment = await runDeploymentApply("44444444-4444-4444-8444-444444444444");
  const destroyPlanningDeployment = await runDeploymentDestroyPlan(
    "44444444-4444-4444-8444-444444444444"
  );
  const destroyingDeployment = await runDeploymentDestroy("44444444-4444-4444-8444-444444444444");
  const resources = await listDeploymentResources("44444444-4444-4444-8444-444444444444");
  const outputs = await listTerraformOutputs("44444444-4444-4444-8444-444444444444");
  const failureExplanation = await getDeploymentFailureExplanation(
    "44444444-4444-4444-8444-444444444444"
  );

  assert.equal(String(requests[0]?.input), `/api/projects/${project.id}/deployments`);
  assert.equal(
    String(requests[1]?.input),
    "/api/deployments/44444444-4444-4444-8444-444444444444/plan"
  );
  assert.equal(requests[1]?.init?.method, "POST");
  assert.equal(
    String(requests[2]?.input),
    "/api/deployments/44444444-4444-4444-8444-444444444444/approve"
  );
  assert.equal(requests[2]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[2]?.init?.body)), {});
  assert.equal(
    String(requests[3]?.input),
    "/api/deployments/44444444-4444-4444-8444-444444444444/apply"
  );
  assert.equal(requests[3]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[3]?.init?.body)), {});
  assert.equal(
    String(requests[4]?.input),
    "/api/deployments/44444444-4444-4444-8444-444444444444/destroy/plan"
  );
  assert.equal(requests[4]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[4]?.init?.body)), {});
  assert.equal(
    String(requests[5]?.input),
    "/api/deployments/44444444-4444-4444-8444-444444444444/destroy"
  );
  assert.equal(requests[5]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[5]?.init?.body)), {});
  assert.equal(
    String(requests[6]?.input),
    "/api/deployments/44444444-4444-4444-8444-444444444444/resources"
  );
  assert.equal(
    String(requests[7]?.input),
    "/api/deployments/44444444-4444-4444-8444-444444444444/outputs"
  );
  assert.equal(
    String(requests[8]?.input),
    "/api/deployments/44444444-4444-4444-8444-444444444444/failure-explanation"
  );
  assert.equal(deployments[0]?.status, "PENDING");
  assert.equal(runningDeployment.status, "RUNNING");
  assert.equal(approvedDeployment.approvedPlanArtifactId, "99999999-9999-4999-8999-999999999999");
  assert.equal(applyingDeployment.status, "RUNNING");
  assert.equal(destroyPlanningDeployment.currentPlanOperation, "destroy");
  assert.equal(destroyingDeployment.currentPlanOperation, "destroy");
  assert.equal(resources[0]?.resourceId, "i-0123456789abcdef0");
  assert.equal(outputs[0]?.name, "instance_id");
  assert.equal(failureExplanation.cleanupRequired, true);
});

test("Git/CI/CD handoff helpers list handoffs and read pipeline status", async (context) => {
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

    if (String(input).endsWith("/pipeline-status")) {
      return new Response(
        JSON.stringify({
          pipelineStatus: {
            id: "44444444-4444-4444-8444-444444444444",
            projectId: project.id,
            status: "pipeline_running",
            pullRequestUrl: "https://github.com/sketchcatch/infra-live/pull/42",
            pullRequestNumber: 42,
            mergeCommitSha: "merge1234",
            pipelineRunUrl: "https://github.com/sketchcatch/infra-live/actions/runs/1",
            infraPipelineRunUrl: "https://github.com/sketchcatch/infra-live/actions/runs/1",
            infraPipelineStatus: "running",
            appPipelineRunUrl: null,
            appPipelineStatus: "not_started",
            destroyPipelineRunUrl: null,
            destroyPipelineStatus: "not_started",
            environmentName: "sketchcatch-production",
            staticSiteUrl: null,
            apiBaseUrl: null,
            statusMessage: "Pipeline is running",
            updatedAt: "2026-06-26T00:00:00.000Z",
            source: "runtime_cache"
          }
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    }

    if (String(input).endsWith("/repository-settings/apply")) {
      return new Response(
        JSON.stringify({
          applied: true,
          environmentName: "sketchcatch-production",
          variables: ["SKETCHCATCH_AWS_REGION"],
          secrets: [],
          workflowFiles: [".github/workflows/sketchcatch-app.yml"],
          githubOAuthRequired: false
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    }

    if (String(input).endsWith("/github-oauth/start")) {
      return new Response(
        JSON.stringify({
          authorizationUrl: "https://github.com/login/oauth/authorize?state=state-token",
          expiresAt: "2026-01-01T00:10:00.000Z"
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 201
        }
      );
    }

    if (String(input).endsWith("/repository-settings/apply-with-github-oauth")) {
      return new Response(
        JSON.stringify({
          applied: true,
          environmentName: "sketchcatch-production",
          variables: ["SKETCHCATCH_AWS_REGION"],
          secrets: [],
          workflowFiles: [".github/workflows/sketchcatch-app.yml"],
          githubOAuthRequired: false
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    }

    if (String(input).endsWith("/aws-role-diff/apply")) {
      return new Response(
        JSON.stringify({
          applied: true,
          roleArn: "arn:aws:iam::123456789012:role/SketchCatchGitHubDeployRole",
          repository: "sketchcatch/infra-live",
          environmentName: "sketchcatch-production",
          appliedAt: "2026-01-01T00:00:00.000Z",
          verified: true
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    }

    return new Response(
      JSON.stringify({
        handoffs: [
          createGitCicdHandoffPayload({
            id: "44444444-4444-4444-8444-444444444444",
            projectId: project.id
          })
        ]
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      }
    );
  };

  const handoffs = await listGitCicdHandoffs(project.id);
  const pipelineStatus = await getGitCicdHandoffPipelineStatus(
    "44444444-4444-4444-8444-444444444444"
  );
  const settingsApply = await applyGitCicdRepositorySettings(
    "44444444-4444-4444-8444-444444444444"
  );
  const oauthStart = await createGitCicdGitHubOAuthStartUrl(
    "44444444-4444-4444-8444-444444444444"
  );
  const oauthSettingsApply = await applyGitCicdRepositorySettingsWithGitHubOAuth(
    "44444444-4444-4444-8444-444444444444"
  );
  const roleApply = await applyGitCicdAwsRoleDiff(
    "44444444-4444-4444-8444-444444444444"
  );

  assert.equal(String(requests[0]?.input), `/api/projects/${project.id}/git-cicd-handoffs`);
  assert.equal(
    String(requests[1]?.input),
    "/api/git-cicd-handoffs/44444444-4444-4444-8444-444444444444/pipeline-status"
  );
  assert.equal(
    String(requests[2]?.input),
    "/api/git-cicd-handoffs/44444444-4444-4444-8444-444444444444/repository-settings/apply"
  );
  assert.equal(
    String(requests[3]?.input),
    "/api/git-cicd-handoffs/44444444-4444-4444-8444-444444444444/github-oauth/start"
  );
  assert.equal(
    String(requests[4]?.input),
    "/api/git-cicd-handoffs/44444444-4444-4444-8444-444444444444/repository-settings/apply-with-github-oauth"
  );
  assert.equal(
    String(requests[5]?.input),
    "/api/git-cicd-handoffs/44444444-4444-4444-8444-444444444444/aws-role-diff/apply"
  );
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer access-token");
  assert.equal(handoffs[0]?.repositoryProvider, "github");
  assert.equal(pipelineStatus.status, "pipeline_running");
  assert.equal(pipelineStatus.source, "runtime_cache");
  assert.equal(settingsApply.githubOAuthRequired, false);
  assert.match(oauthStart.authorizationUrl, /^https:\/\/github\.com\/login\/oauth\/authorize/);
  assert.equal(oauthSettingsApply.githubOAuthRequired, false);
  assert.equal(roleApply.verified, true);
});

function createDeploymentPayload(input: {
  id: string;
  projectId: string;
  status?: "PENDING" | "RUNNING";
  approved?: boolean;
  currentPlanOperation?: "apply" | "destroy" | null;
}) {
  return {
    id: input.id,
    projectId: input.projectId,
    architectureId: "55555555-5555-4555-8555-555555555555",
    terraformArtifactId: "66666666-6666-4666-8666-666666666666",
    awsConnectionId: "33333333-3333-4333-8333-333333333333",
    currentPlanArtifactId: null,
    currentPlanOperation: input.currentPlanOperation ?? null,
    stateObjectKey: null,
    resultWarningSummary: null,
    status: input.status ?? "PENDING",
    planSummary: null,
    isBlocked: false,
    blockedBy: null,
    blockedReason: null,
    failureStage: null,
    errorSummary: null,
    approvedAt: null,
    approvedByUserId: null,
    approvedTerraformArtifactId: null,
    approvedPlanArtifactId: input.approved ? "99999999-9999-4999-8999-999999999999" : null,
    approvedTerraformArtifactHash: input.approved ? "a".repeat(64) : null,
    approvedTfplanHash: input.approved ? "b".repeat(64) : null,
    approvedAwsAccountId: input.approved ? "123456789012" : null,
    approvedAwsRegion: input.approved ? "ap-northeast-2" : null,
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z"
  };
}

function createReverseEngineeringScanPayload(input: {
  id: string;
  projectId: string;
  status?: "running" | "completed" | "cancelled";
}) {
  return {
    id: input.id,
    projectId: input.projectId,
    awsConnectionId: "33333333-3333-4333-8333-333333333333",
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["VPC", "SUBNET", "EC2", "RDS", "S3", "SECURITY_GROUP"],
    status: input.status ?? "completed",
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:01.000Z",
    startedAt: "2026-07-05T00:00:00.000Z",
    completedAt: "2026-07-05T00:00:01.000Z",
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  };
}

function createGitCicdHandoffPayload(input: { id: string; projectId: string }) {
  return {
    id: input.id,
    projectId: input.projectId,
    architectureId: "55555555-5555-4555-8555-555555555555",
    terraformArtifactId: "66666666-6666-4666-8666-666666666666",
    handoffKind: "terraform_iac",
    sourceDeploymentId: null,
    deploymentMode: "infra_and_app",
    requiresEnvironmentApproval: true,
    sourceRepositoryId: "repo-1",
    repositoryProvider: "github",
    repositoryOwner: "sketchcatch",
    repositoryName: "infra-live",
    targetBranch: "main",
    sourceBranch: "sketchcatch/iac-preview",
    commitMessage: "Add SketchCatch Terraform preview",
    pullRequestTitle: "SketchCatch IaC preview",
    pullRequestUrl: "https://github.com/sketchcatch/infra-live/pull/42",
    pullRequestNumber: 42,
    pullRequestHeadSha: "abc1234",
    mergeCommitSha: null,
    environmentName: "sketchcatch-production",
    pipelineRunUrl: null,
    infraPipelineRunUrl: null,
    infraPipelineStatus: "waiting_for_merge",
    appPipelineRunUrl: null,
    appPipelineStatus: "not_started",
    destroyPipelineRunUrl: null,
    destroyPipelineStatus: "not_started",
    staticSiteUrl: null,
    apiBaseUrl: null,
    repositorySettingsPreview: null,
    awsRoleDiff: null,
    githubOAuthRequired: true,
    status: "pr_created",
    statusMessage: "GitHub PR created",
    userAcceptedChangeId: "accepted-change-1",
    createdByUserId: "22222222-2222-4222-8222-222222222222",
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z"
  };
}

function installAuthSession(): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {}
  });

  writeStoredAuthSession({
    accessToken: "access-token",
    expiresInSeconds: 3600
  });
}

function restoreWindow(descriptor: PropertyDescriptor | undefined): void {
  clearStoredAuthSession();

  if (descriptor) {
    Object.defineProperty(globalThis, "window", descriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, "window");
}
