import assert from "node:assert/strict";
import test from "node:test";
import type { ConfirmedBuildConfig } from "@sketchcatch/types";
import {
  renderPreflightBuildspec,
  renderPreflightPackagerScript
} from "./preflight-buildspec.js";

test("preflight buildspec builds and checks API/frontend without deployment permissions", () => {
  const buildspec = renderPreflightBuildspec(createBuildConfig());

  assert.match(buildspec, /env:\n {2}shell: bash\n/);
  assert.match(buildspec, /command -v zstd/);
  assert.match(buildspec, /CODEBUILD_RESOLVED_SOURCE_VERSION/);
  assert.match(buildspec, /docker build/);
  assert.match(buildspec, /docker run/);
  assert.match(buildspec, /docker logs/);
  assert.match(buildspec, /API container exited before the health check passed/);
  assert.match(buildspec, /curl --fail/);
  assert.match(buildspec, /pnpm .* install --frozen-lockfile/);
  assert.match(buildspec, /pnpm .* run build/);
  assert.match(buildspec, /test -f "\$\{SKETCHCATCH_FRONTEND_PACKAGE_MANIFEST_PATH\}"/);
  assert.match(buildspec, /test -f "\$\{SKETCHCATCH_FRONTEND_LOCKFILE_PATH\}"/);
  assert.match(buildspec, /frontend-manifest\.json/);
  assert.match(buildspec, /SKETCHCATCH_API_OCI_DIGEST/);
  assert.match(buildspec, /SKETCHCATCH_API_ARCHIVE_DIGEST/);
  assert.match(buildspec, /SKETCHCATCH_CANDIDATE_ID/);
  assert.match(buildspec, /oci-layout/);
  assert.doesNotMatch(buildspec, /find \. -type f[\s\S]*sha256sum/);
  const packager = renderPreflightPackagerScript();
  assert.match(packager, /sketchcatch-release/);
  assert.match(packager, /application\/vnd\.oci\.image\.manifest\.v1\+json/);
  assert.match(packager, /frontend-manifest\.json/);
  assert.match(buildspec, /SKETCHCATCH_API_UPLOAD_URL/);
  assert.doesNotMatch(buildspec, /aws\s+(?:ecr|ecs|s3|cloudfront)/i);
  assert.doesNotMatch(buildspec, /buildspec\.ya?ml/i);
});

test("preflight buildspec requires the approved ECS web build snapshot", () => {
  assert.throws(
    () => renderPreflightBuildspec({ ...createBuildConfig(), ecsWeb: null }),
    /ECS web build configuration/
  );
});

test("preflight installs monorepo dependencies beside the approved root lockfile", () => {
  const config = createBuildConfig();
  const buildspec = renderPreflightBuildspec({
    ...config,
    ecsWeb: {
      ...config.ecsWeb!,
      frontend: {
        ...config.ecsWeb!.frontend,
        sourceRoot: "apps/web",
        packageManifestPath: "apps/web/package.json",
        lockfilePath: "package-lock.json",
        packageManager: "npm",
        packageManagerVersion: "10.9.2",
        installPreset: "npm_ci",
        buildPreset: "npm_build",
        outputPath: "apps/web/dist"
      }
    }
  });

  assert.match(buildspec, /npm --prefix "\." ci/);
  assert.match(
    buildspec,
    /VITE_API_BASE_URL="\/" npm --prefix "\$\{SKETCHCATCH_FRONTEND_SOURCE_ROOT\}" run build/
  );
  assert.match(buildspec, /npm install --global "npm@\$\{SKETCHCATCH_PACKAGE_MANAGER_VERSION\}"/);
  assert.doesNotMatch(buildspec, /corepack prepare "npm@/);
  assert.doesNotMatch(buildspec, /npm --prefix "\$\{SKETCHCATCH_FRONTEND_SOURCE_ROOT\}" ci/);
});

function createBuildConfig(): ConfirmedBuildConfig {
  return {
    sourceRoot: ".",
    evidence: [
      { kind: "dockerfile", path: "backend/Dockerfile" },
      { kind: "package_manifest", path: "frontend/package.json" }
    ],
    installPreset: "pnpm_frozen_lockfile",
    buildPreset: "docker_build",
    artifactOutputPath: null,
    runtimeEntrypoint: null,
    healthCheckPath: "/health",
    dockerfilePath: "backend/Dockerfile",
    packageManifestPath: "frontend/package.json",
    samTemplatePath: null,
    appSpecPath: null,
    staticOutputPath: null,
    exactSemVerTag: null,
    manifestVersion: null,
    confirmedCommitSha: "a".repeat(40),
    confirmedAt: "2026-07-15T12:00:00.000Z",
    ecsWeb: {
      api: {
        sourceRoot: "backend",
        dockerfilePath: "backend/Dockerfile",
        containerPort: 3000,
        healthCheckPath: "/health"
      },
      frontend: {
        sourceRoot: "frontend",
        packageManifestPath: "frontend/package.json",
        lockfilePath: "frontend/pnpm-lock.yaml",
        packageManager: "pnpm",
        packageManagerVersion: "10.12.1",
        installPreset: "pnpm_frozen_lockfile",
        buildPreset: "pnpm_build",
        outputPath: "frontend/dist"
      }
    }
  };
}
