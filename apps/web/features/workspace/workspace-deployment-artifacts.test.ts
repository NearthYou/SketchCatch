import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagramJson, Project } from "../../../../packages/types/src";
import { clearStoredAuthSession, writeStoredAuthSession } from "../../lib/auth-storage";
import {
  saveWorkspaceArchitectureSnapshot,
  saveWorkspaceTerraformArtifact
} from "./workspace-deployment-artifacts";

const project: Project = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  name: "Learning VPC",
  description: "VPC practice",
  createdAt: "2026-06-24T01:00:00.000Z",
  updatedAt: "2026-06-24T02:00:00.000Z"
};

const diagramJson: DiagramJson = {
  edges: [],
  nodes: [
    {
      id: "ec2-node",
      kind: "resource",
      label: "EC2 Instance",
      locked: false,
      parameters: {
        fileName: "main",
        resourceName: "web",
        resourceType: "aws_instance",
        terraformBlockType: "resource",
        values: {
          instance_type: "t2.micro"
        }
      },
      position: { x: 10, y: 20 },
      size: { width: 120, height: 80 },
      type: "aws_instance",
      zIndex: 1
    }
  ],
  viewport: { x: 0, y: 0, zoom: 1 }
};

test("saveWorkspaceArchitectureSnapshot stores the current diagram as manual architecture json", async (context) => {
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

  const savedSnapshot = await saveWorkspaceArchitectureSnapshot({
    diagramJson,
    projectId: project.id
  });
  const body = JSON.parse(String(requests[0]?.init?.body));

  assert.equal(String(requests[0]?.input), `/api/projects/${project.id}/architectures`);
  assert.equal(body.source, "manual");
  assert.deepEqual(body.architectureJson, {
    edges: [],
    nodes: [
      {
        config: {
          instance_type: "t2.micro",
          terraformResourceName: "web",
          terraformResourceType: "aws_instance"
        },
        id: "ec2-node",
        label: "EC2 Instance",
        positionX: 10,
        positionY: 20,
        type: "EC2"
      }
    ]
  });
  assert.equal(savedSnapshot.architecture.id, "55555555-5555-4555-8555-555555555555");
});

test("saveWorkspaceTerraformArtifact validates, snapshots, uploads, and links terraform file", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];
  const terraformCode = 'resource "aws_instance" "web" {}\n';

  context.after(() => {
    globalThis.fetch = originalFetch;
    restoreWindow(originalWindowDescriptor);
  });

  installAuthSession();

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    if (String(input).endsWith("/terraform/validate")) {
      return jsonResponse({
        diagnostics: []
      });
    }

    if (String(input).endsWith(`/projects/${project.id}/architectures`)) {
      return jsonResponse(
        {
          architecture: {
            id: "55555555-5555-4555-8555-555555555555",
            projectId: project.id,
            version: 1,
            source: "manual",
            architectureJson: { nodes: [], edges: [] },
            createdAt: "2026-06-26T00:00:00.000Z"
          }
        },
        201
      );
    }

    if (String(input).endsWith(`/projects/${project.id}/assets/presigned-upload`)) {
      return jsonResponse(
        {
          asset: {
            id: "66666666-6666-4666-8666-666666666666",
            projectId: project.id,
            architectureId: "55555555-5555-4555-8555-555555555555",
            assetType: "terraform_file",
            objectKey: "projects/project/assets/terraform_file/main.tf",
            fileName: "main.tf",
            contentType: "text/plain",
            byteSize: new TextEncoder().encode(terraformCode).byteLength,
            uploadStatus: "pending",
            createdAt: "2026-06-26T00:00:00.000Z"
          },
          upload: {
            method: "PUT",
            url: "https://s3.example.test/upload",
            headers: { "Content-Type": "text/plain" },
            expiresInSeconds: 900
          }
        },
        201
      );
    }

    if (
      String(input).endsWith(
        `/projects/${project.id}/assets/66666666-6666-4666-8666-666666666666/confirm-upload`
      )
    ) {
      return jsonResponse({
        asset: {
          id: "66666666-6666-4666-8666-666666666666",
          projectId: project.id,
          architectureId: "55555555-5555-4555-8555-555555555555",
          assetType: "terraform_file",
          objectKey: "projects/project/assets/terraform_file/main.tf",
          fileName: "main.tf",
          contentType: "text/plain",
          byteSize: new TextEncoder().encode(terraformCode).byteLength,
          uploadStatus: "uploaded",
          createdAt: "2026-06-26T00:00:00.000Z"
        }
      });
    }

    return new Response(null, { status: 200 });
  };

  const savedArtifact = await saveWorkspaceTerraformArtifact({
    diagramJson,
    projectId: project.id,
    terraformCode
  });
  const uploadBody = JSON.parse(String(requests[2]?.init?.body));

  assert.equal(String(requests[0]?.input), "/api/terraform/validate");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    terraformCode
  });
  assert.equal(String(requests[1]?.input), `/api/projects/${project.id}/architectures`);
  assert.equal(String(requests[2]?.input), `/api/projects/${project.id}/assets/presigned-upload`);
  assert.deepEqual(uploadBody, {
    architectureId: "55555555-5555-4555-8555-555555555555",
    assetType: "terraform_file",
    fileName: "main.tf",
    contentType: "text/plain",
    byteSize: new TextEncoder().encode(terraformCode).byteLength
  });
  assert.equal(String(requests[3]?.input), "https://s3.example.test/upload");
  assert.equal(requests[3]?.init?.method, "PUT");
  assert.equal(requests[3]?.init?.body, terraformCode);
  assert.equal(
    String(requests[4]?.input),
    `/api/projects/${project.id}/assets/66666666-6666-4666-8666-666666666666/confirm-upload`
  );
  assert.equal(requests[4]?.init?.method, "POST");
  assert.equal(savedArtifact.architecture.id, "55555555-5555-4555-8555-555555555555");
  assert.equal(
    savedArtifact.terraformArtifact.architectureId,
    "55555555-5555-4555-8555-555555555555"
  );
  assert.equal(savedArtifact.terraformArtifact.uploadStatus, "uploaded");
});

test("saveWorkspaceTerraformArtifact aborts a pending asset when S3 upload fails", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];
  const terraformCode = 'resource "aws_instance" "web" {}\n';
  const assetId = "66666666-6666-4666-8666-666666666666";

  context.after(() => {
    globalThis.fetch = originalFetch;
    restoreWindow(originalWindowDescriptor);
  });

  installAuthSession();

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    if (String(input).endsWith("/terraform/validate")) {
      return jsonResponse({
        diagnostics: []
      });
    }

    if (String(input).endsWith(`/projects/${project.id}/architectures`)) {
      return jsonResponse(
        {
          architecture: {
            id: "55555555-5555-4555-8555-555555555555",
            projectId: project.id,
            version: 1,
            source: "manual",
            architectureJson: { nodes: [], edges: [] },
            createdAt: "2026-06-26T00:00:00.000Z"
          }
        },
        201
      );
    }

    if (String(input).endsWith(`/projects/${project.id}/assets/presigned-upload`)) {
      return jsonResponse(
        {
          asset: {
            id: assetId,
            projectId: project.id,
            architectureId: "55555555-5555-4555-8555-555555555555",
            assetType: "terraform_file",
            objectKey: "projects/project/assets/terraform_file/main.tf",
            fileName: "main.tf",
            contentType: "text/plain",
            byteSize: new TextEncoder().encode(terraformCode).byteLength,
            uploadStatus: "pending",
            createdAt: "2026-06-26T00:00:00.000Z"
          },
          upload: {
            method: "PUT",
            url: "https://s3.example.test/upload",
            headers: { "Content-Type": "text/plain" },
            expiresInSeconds: 900
          }
        },
        201
      );
    }

    if (String(input) === "https://s3.example.test/upload") {
      return new Response(null, { status: 500 });
    }

    if (String(input).endsWith(`/projects/${project.id}/assets/${assetId}/abort-upload`)) {
      return new Response(null, { status: 204 });
    }

    return new Response(null, { status: 404 });
  };

  await assert.rejects(
    () =>
      saveWorkspaceTerraformArtifact({
        diagramJson,
        projectId: project.id,
        terraformCode
      }),
    /Terraform artifact/
  );

  assert.equal(String(requests[3]?.input), "https://s3.example.test/upload");
  assert.equal(
    String(requests[4]?.input),
    `/api/projects/${project.id}/assets/${assetId}/abort-upload`
  );
  assert.equal(requests[4]?.init?.method, "POST");
  assert.equal(
    requests.some((request) => String(request.input).includes("confirm-upload")),
    false
  );
});

test("saveWorkspaceTerraformArtifact stops before snapshot when terraform validation fails", async (context) => {
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

    return jsonResponse({
      diagnostics: [
        {
          severity: "error",
          message: "block header가 올바르지 않습니다.",
          line: 3
        }
      ]
    });
  };

  await assert.rejects(
    () =>
      saveWorkspaceTerraformArtifact({
        diagramJson,
        projectId: project.id,
        terraformCode: "broken"
      }),
    /3번째 줄/
  );
  assert.equal(requests.length, 1);
  assert.equal(String(requests[0]?.input), "/api/terraform/validate");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    terraformCode: "broken"
  });
});

test("saveWorkspaceTerraformArtifact can skip validation after Terraform panel already validated", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit | undefined }> = [];
  const terraformCode = 'resource "aws_instance" "web" {}\n';

  context.after(() => {
    globalThis.fetch = originalFetch;
    restoreWindow(originalWindowDescriptor);
  });

  installAuthSession();

  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });

    if (String(input).endsWith("/terraform/validate")) {
      return new Response(null, { status: 500 });
    }

    if (String(input).endsWith(`/projects/${project.id}/architectures`)) {
      return jsonResponse(
        {
          architecture: {
            id: "55555555-5555-4555-8555-555555555555",
            projectId: project.id,
            version: 1,
            source: "manual",
            architectureJson: { nodes: [], edges: [] },
            createdAt: "2026-06-26T00:00:00.000Z"
          }
        },
        201
      );
    }

    if (String(input).endsWith(`/projects/${project.id}/assets/presigned-upload`)) {
      return jsonResponse(
        {
          asset: {
            id: "66666666-6666-4666-8666-666666666666",
            projectId: project.id,
            architectureId: "55555555-5555-4555-8555-555555555555",
            assetType: "terraform_file",
            objectKey: "projects/project/assets/terraform_file/main.tf",
            fileName: "main.tf",
            contentType: "text/plain",
            byteSize: new TextEncoder().encode(terraformCode).byteLength,
            uploadStatus: "pending",
            createdAt: "2026-06-26T00:00:00.000Z"
          },
          upload: {
            method: "PUT",
            url: "https://s3.example.test/upload",
            headers: { "Content-Type": "text/plain" },
            expiresInSeconds: 900
          }
        },
        201
      );
    }

    if (
      String(input).endsWith(
        `/projects/${project.id}/assets/66666666-6666-4666-8666-666666666666/confirm-upload`
      )
    ) {
      return jsonResponse({
        asset: {
          id: "66666666-6666-4666-8666-666666666666",
          projectId: project.id,
          architectureId: "55555555-5555-4555-8555-555555555555",
          assetType: "terraform_file",
          objectKey: "projects/project/assets/terraform_file/main.tf",
          fileName: "main.tf",
          contentType: "text/plain",
          byteSize: new TextEncoder().encode(terraformCode).byteLength,
          uploadStatus: "uploaded",
          createdAt: "2026-06-26T00:00:00.000Z"
        }
      });
    }

    return new Response(null, { status: 200 });
  };

  await saveWorkspaceTerraformArtifact({
    diagramJson,
    projectId: project.id,
    skipValidation: true,
    terraformCode
  });

  assert.equal(
    requests.some((request) => String(request.input).endsWith("/terraform/validate")),
    false
  );
  assert.equal(String(requests[0]?.input), `/api/projects/${project.id}/architectures`);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json"
    },
    status
  });
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
