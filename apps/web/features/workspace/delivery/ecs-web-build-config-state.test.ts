import assert from "node:assert/strict";
import test from "node:test";

import type { EcsWebBuildConfig } from "@sketchcatch/types";

import {
  createEditableEcsWebBuildConfig,
  getEcsWebPackageManagerDefaultsForLockfile,
  getEcsWebBuildConfigIssueKeys,
  updateEcsWebPackageManager,
  type EcsWebBuildConfigIssueKey
} from "./ecs-web-build-config-state.js";

const allIssueKeys: readonly EcsWebBuildConfigIssueKey[] = [
  "api_source_root",
  "api_dockerfile_path",
  "api_container_port",
  "api_health_check_path",
  "frontend_source_root",
  "frontend_package_manifest_path",
  "frontend_lockfile_path",
  "frontend_package_manager",
  "frontend_package_manager_version",
  "frontend_output_path",
  "frontend_package_presets"
];

function createValidConfig(): EcsWebBuildConfig {
  return {
    api: {
      sourceRoot: "apps/api",
      dockerfilePath: "apps/api/Dockerfile",
      containerPort: 8080,
      healthCheckPath: "/health"
    },
    frontend: {
      sourceRoot: "apps/web",
      packageManifestPath: "apps/web/package.json",
      lockfilePath: "pnpm-lock.yaml",
      packageManager: "pnpm",
      packageManagerVersion: "11.8.0",
      installPreset: "pnpm_frozen_lockfile",
      buildPreset: "pnpm_build",
      outputPath: "apps/web/dist"
    }
  };
}

test("ECS web build validation matches release and preflight constraints", () => {
  assert.deepEqual(getEcsWebBuildConfigIssueKeys(createValidConfig()), []);
  assert.deepEqual(getEcsWebBuildConfigIssueKeys(null), allIssueKeys);

  const invalidCases: readonly {
    name: string;
    issue: EcsWebBuildConfigIssueKey;
    mutate: (config: EcsWebBuildConfig) => void;
  }[] = [
    {
      name: "empty API source root",
      issue: "api_source_root",
      mutate: (config) => {
        config.api.sourceRoot = "";
      }
    },
    {
      name: "absolute Dockerfile path",
      issue: "api_dockerfile_path",
      mutate: (config) => {
        config.api.dockerfilePath = "/Dockerfile";
      }
    },
    {
      name: "non-integer container port",
      issue: "api_container_port",
      mutate: (config) => {
        config.api.containerPort = 8080.5;
      }
    },
    {
      name: "out-of-range container port",
      issue: "api_container_port",
      mutate: (config) => {
        config.api.containerPort = 65_536;
      }
    },
    {
      name: "unsafe health check characters",
      issue: "api_health_check_path",
      mutate: (config) => {
        config.api.healthCheckPath = "/health?verbose=true";
      }
    },
    {
      name: "health check path over the server limit",
      issue: "api_health_check_path",
      mutate: (config) => {
        config.api.healthCheckPath = `/${"a".repeat(512)}`;
      }
    },
    {
      name: "empty frontend source root",
      issue: "frontend_source_root",
      mutate: (config) => {
        config.frontend.sourceRoot = "";
      }
    },
    {
      name: "parent package manifest path",
      issue: "frontend_package_manifest_path",
      mutate: (config) => {
        config.frontend.packageManifestPath = "apps/web/../package.json";
      }
    },
    {
      name: "lockfile path with shell-unsafe characters",
      issue: "frontend_lockfile_path",
      mutate: (config) => {
        config.frontend.lockfilePath = "apps/web/pnpm lock.yaml";
      }
    },
    {
      name: "unknown package manager",
      issue: "frontend_package_manager",
      mutate: (config) => {
        config.frontend.packageManager = "bun" as typeof config.frontend.packageManager;
      }
    },
    {
      name: "non-SemVer package manager version",
      issue: "frontend_package_manager_version",
      mutate: (config) => {
        config.frontend.packageManagerVersion = "11";
      }
    },
    {
      name: "trailing slash output path",
      issue: "frontend_output_path",
      mutate: (config) => {
        config.frontend.outputPath = "apps/web/dist/";
      }
    },
    {
      name: "package manager preset mismatch",
      issue: "frontend_package_presets",
      mutate: (config) => {
        config.frontend.installPreset = "npm_ci";
      }
    },
    {
      name: "empty repository path segment",
      issue: "frontend_source_root",
      mutate: (config) => {
        config.frontend.sourceRoot = "apps//web";
      }
    },
    {
      name: "repository path over the server limit",
      issue: "frontend_output_path",
      mutate: (config) => {
        config.frontend.outputPath = "a".repeat(513);
      }
    }
  ];

  for (const invalidCase of invalidCases) {
    const config = createValidConfig();
    invalidCase.mutate(config);
    assert.ok(
      getEcsWebBuildConfigIssueKeys(config).includes(invalidCase.issue),
      invalidCase.name
    );
  }
});

test("manual ECS web config keeps evidence-backed API values and retained runtime secrets", () => {
  const config = createEditableEcsWebBuildConfig({
    sourceRoot: "services/api",
    dockerfilePath: "services/api/Dockerfile",
    healthCheckPath: "/ready",
    requiredRuntimeSecrets: ["SESSION_SECRET", "API_TOKEN", "SESSION_SECRET"],
    packageManager: "pnpm"
  });

  assert.deepEqual(config, {
    api: {
      sourceRoot: "services/api",
      dockerfilePath: "services/api/Dockerfile",
      containerPort: 8080,
      healthCheckPath: "/ready",
      requiredRuntimeSecrets: ["API_TOKEN", "SESSION_SECRET"]
    },
    frontend: {
      sourceRoot: "",
      packageManifestPath: "",
      lockfilePath: "",
      packageManager: "pnpm",
      packageManagerVersion: "11.8.0",
      installPreset: "pnpm_frozen_lockfile",
      buildPreset: "pnpm_build",
      outputPath: ""
    }
  });

  config.frontend.packageManagerVersion = "11.9.1";
  const sameManager = updateEcsWebPackageManager(config, "pnpm");
  assert.equal(sameManager.frontend.packageManagerVersion, "11.9.1");
  assert.deepEqual(sameManager.api.requiredRuntimeSecrets, ["API_TOKEN", "SESSION_SECRET"]);

  const npmConfig = updateEcsWebPackageManager(sameManager, "npm");
  assert.equal(npmConfig.frontend.packageManagerVersion, "10.9.2");
  assert.equal(npmConfig.frontend.installPreset, "npm_ci");
  assert.equal(npmConfig.frontend.buildPreset, "npm_build");
  assert.deepEqual(npmConfig.api.requiredRuntimeSecrets, ["API_TOKEN", "SESSION_SECRET"]);
});

test("lockfiles resolve through one package-manager preset mapping", () => {
  assert.deepEqual(getEcsWebPackageManagerDefaultsForLockfile("apps/web/package-lock.json"), {
    kind: "npm",
    version: "10.9.2",
    installPreset: "npm_ci",
    buildPreset: "npm_build"
  });
  assert.deepEqual(getEcsWebPackageManagerDefaultsForLockfile("pnpm-lock.yaml"), {
    kind: "pnpm",
    version: "11.8.0",
    installPreset: "pnpm_frozen_lockfile",
    buildPreset: "pnpm_build"
  });
  assert.deepEqual(getEcsWebPackageManagerDefaultsForLockfile("apps/web/yarn.lock"), {
    kind: "yarn",
    version: "1.22.22",
    installPreset: "yarn_frozen_lockfile",
    buildPreset: "yarn_build"
  });
  assert.equal(getEcsWebPackageManagerDefaultsForLockfile("apps/web/bun.lock"), null);
});
