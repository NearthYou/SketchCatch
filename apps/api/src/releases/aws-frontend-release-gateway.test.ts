import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  activateFrontendRelease,
  verifyPublicFrontendRelease
} from "./aws-frontend-release-gateway.js";
import type { FrontendArtifactManifest } from "./release-candidate-service.js";

test("frontend activation uploads assets before index and waits for /* invalidation", async () => {
  const fixture = await createFrontendFixture();
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  let objectVersion = 0;
  let mutationGuardCount = 0;
  try {
    const result = await activateFrontendRelease(
      {
        candidateId: "candidate-1",
        commitSha: "a".repeat(40),
        frontendDirectory: fixture.root,
        manifest: fixture.manifest,
        bucketName: "demo-web",
        cloudFrontDistributionId: "E123456"
      },
      {
        s3: {
          async send(command) {
            calls.push({
              name: command.constructor.name,
              input: command.input as Record<string, unknown>
            });
            objectVersion += 1;
            return { VersionId: `v${objectVersion}` };
          }
        },
        cloudFront: {
          async send(command) {
            calls.push({
              name: command.constructor.name,
              input: command.input as Record<string, unknown>
            });
            return command.constructor.name === "CreateInvalidationCommand"
              ? { Invalidation: { Id: "I123", Status: "InProgress" } }
              : { Invalidation: { Id: "I123", Status: "Completed" } };
          }
        }
      },
      {
        createInvalidationReference: () => "request-1",
        wait: async () => undefined,
        beforeMutation: async () => { mutationGuardCount += 1; }
      }
    );

    const putKeys = calls
      .filter((call) => call.name === "PutObjectCommand")
      .map((call) => call.input["Key"]);
    assert.deepEqual(putKeys, [
      "assets/app.abcdef12.js",
      ".sketchcatch/releases/candidate-1/frontend-manifest.json",
      "index.html"
    ]);
    const invalidation = calls.find((call) => call.name === "CreateInvalidationCommand");
    assert.match(JSON.stringify(invalidation?.input), /"Items":\["\/\*"\]/u);
    assert.equal(result.indexVersionId, "v3");
    assert.equal(result.commitMarker, `${"a".repeat(40)}:candidate-1`);
    assert.equal(mutationGuardCount, 4);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("public verification requires the release marker, health, and an /api probe", async () => {
  const requested: string[] = [];
  const marker = `${"a".repeat(40)}:candidate-1`;
  const evidence = await verifyPublicFrontendRelease(
    {
      outputUrl: "https://demo.cloudfront.net",
      expectedMarker: marker,
      healthPath: "/health",
      apiProbePath: "/api/health"
    },
    async (request) => {
      const url = String(request);
      requested.push(url);
      return new Response(
        url.endsWith("/") ? `<meta name="sketchcatch-release" content="${marker}">` : "ok",
        { status: 200 }
      );
    }
  );
  assert.deepEqual(requested, [
    "https://demo.cloudfront.net/",
    "https://demo.cloudfront.net/health",
    "https://demo.cloudfront.net/api/health"
  ]);
  assert.equal((evidence as { state: string }).state, "healthy");
});

test("public verification rejects a routed API 404 instead of treating it as healthy", async () => {
  const marker = `${"a".repeat(40)}:candidate-1`;
  await assert.rejects(
    verifyPublicFrontendRelease(
      {
        outputUrl: "https://demo.cloudfront.net",
        expectedMarker: marker,
        healthPath: "/health",
        apiProbePath: "/api/missing"
      },
      async (request) => {
        const url = String(request);
        return new Response(
          url.endsWith("/")
            ? `<meta name="sketchcatch-release" content="${marker}">`
            : "{}",
          { status: url.endsWith("/api/missing") ? 404 : 200 }
        );
      },
      { maxApiProbeAttempts: 1 }
    ),
    /Public API route probe failed with 404/u
  );
});

test("demo API verification requires POST /api/check-ins and its 201 response contract", async () => {
  const marker = `${"a".repeat(40)}:candidate-1`;
  let apiProbeAttempts = 0;
  const evidence = await verifyPublicFrontendRelease(
    {
      outputUrl: "https://demo.cloudfront.net",
      expectedMarker: marker,
      healthPath: "/health",
      apiProbePath: "/api/check-ins",
      apiProbeMethod: "POST",
      apiProbeExpectedStatus: 201
    },
    async (request, init) => {
      const url = String(request);
      if (url.endsWith("/")) {
        return new Response(
          `<meta name="sketchcatch-release" content="${marker}">`,
          { status: 200 }
        );
      }
      if (url.endsWith("/health")) return new Response("ok", { status: 200 });
      assert.equal(init?.method, "POST");
      apiProbeAttempts += 1;
      if (apiProbeAttempts === 1) return new Response("old target", { status: 200 });
      return Response.json(
        {
          sessionId: "11111111-1111-4111-8111-111111111111",
          expiresAt: "2026-07-16T12:01:00.000Z"
        },
        { status: 201 }
      );
    },
    { wait: async () => undefined }
  );

  assert.equal((evidence as { apiProbeStatus: number }).apiProbeStatus, 201);
  assert.equal(apiProbeAttempts, 2);
});

async function createFrontendFixture(): Promise<{
  root: string;
  manifest: FrontendArtifactManifest;
}> {
  const root = await mkdtemp(join(tmpdir(), "sketchcatch-frontend-"));
  await mkdir(join(root, "assets"));
  const marker = `${"a".repeat(40)}:candidate-1`;
  const index = `<meta name="sketchcatch-release" content="${marker}">`;
  const asset = "console.log('demo')";
  await writeFile(join(root, "index.html"), index);
  await writeFile(join(root, "assets", "app.abcdef12.js"), asset);
  return {
    root,
    manifest: {
      schemaVersion: 1,
      commitSha: "a".repeat(40),
      candidateId: "candidate-1",
      marker,
      index: { path: "index.html", sha256: sha256(index) },
      files: [
        {
          path: "assets/app.abcdef12.js",
          sha256: sha256(asset),
          size: Buffer.byteLength(asset),
          contentType: "text/javascript; charset=utf-8"
        },
        {
          path: "index.html",
          sha256: sha256(index),
          size: Buffer.byteLength(index),
          contentType: "text/html; charset=utf-8"
        }
      ]
    }
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
