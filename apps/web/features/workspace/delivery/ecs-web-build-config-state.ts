import type { EcsWebBuildConfig, PackageManagerKind } from "@sketchcatch/types";

export type EcsWebBuildConfigIssueKey =
  | "api_source_root"
  | "api_dockerfile_path"
  | "api_container_port"
  | "api_health_check_path"
  | "frontend_source_root"
  | "frontend_package_manifest_path"
  | "frontend_lockfile_path"
  | "frontend_package_manager"
  | "frontend_package_manager_version"
  | "frontend_output_path"
  | "frontend_package_presets";

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

const PACKAGE_MANAGER_PRESETS = {
  npm: { version: "10.9.2", installPreset: "npm_ci", buildPreset: "npm_build" },
  pnpm: {
    version: "11.8.0",
    installPreset: "pnpm_frozen_lockfile",
    buildPreset: "pnpm_build"
  },
  yarn: {
    version: "1.22.22",
    installPreset: "yarn_frozen_lockfile",
    buildPreset: "yarn_build"
  }
} as const;

export function getEcsWebPackageManagerDefaultsForLockfile(lockfilePath: string):
  | {
      kind: PackageManagerKind;
      version: string;
      installPreset: EcsWebBuildConfig["frontend"]["installPreset"];
      buildPreset: EcsWebBuildConfig["frontend"]["buildPreset"];
    }
  | null {
  const fileName = lockfilePath.split("/").at(-1)?.toLowerCase();
  const kind =
    fileName === "package-lock.json" || fileName === "npm-shrinkwrap.json"
      ? "npm"
      : fileName === "pnpm-lock.yaml"
        ? "pnpm"
        : fileName === "yarn.lock"
          ? "yarn"
          : null;
  if (!kind) return null;
  return { kind, ...PACKAGE_MANAGER_PRESETS[kind] };
}

export function createEditableEcsWebBuildConfig(input: {
  readonly sourceRoot: string;
  readonly dockerfilePath: string;
  readonly healthCheckPath: string;
  readonly requiredRuntimeSecrets?: readonly string[];
  readonly packageManager: PackageManagerKind;
}): EcsWebBuildConfig {
  const presets = PACKAGE_MANAGER_PRESETS[input.packageManager];
  const requiredRuntimeSecrets = normalizeRuntimeSecretNames(input.requiredRuntimeSecrets);
  return {
    api: {
      sourceRoot: input.sourceRoot,
      dockerfilePath: input.dockerfilePath,
      containerPort: 8080,
      healthCheckPath: input.healthCheckPath,
      ...(requiredRuntimeSecrets.length > 0 ? { requiredRuntimeSecrets } : {})
    },
    frontend: {
      sourceRoot: "",
      packageManifestPath: "",
      lockfilePath: "",
      packageManager: input.packageManager,
      packageManagerVersion: presets.version,
      installPreset: presets.installPreset,
      buildPreset: presets.buildPreset,
      outputPath: ""
    }
  };
}

export function updateEcsWebPackageManager(
  config: EcsWebBuildConfig,
  packageManager: PackageManagerKind
): EcsWebBuildConfig {
  const presets = PACKAGE_MANAGER_PRESETS[packageManager];
  return {
    api: {
      ...config.api,
      ...(config.api.requiredRuntimeSecrets
        ? { requiredRuntimeSecrets: [...config.api.requiredRuntimeSecrets] }
        : {})
    },
    frontend: {
      ...config.frontend,
      packageManager,
      packageManagerVersion:
        config.frontend.packageManager === packageManager
          ? config.frontend.packageManagerVersion
          : presets.version,
      installPreset: presets.installPreset,
      buildPreset: presets.buildPreset
    }
  };
}

export function getEcsWebBuildConfigIssueKeys(
  config: EcsWebBuildConfig | null
): EcsWebBuildConfigIssueKey[] {
  if (!config) return [...allIssueKeys];

  const issues: EcsWebBuildConfigIssueKey[] = [];
  if (!isSafeBuildPath(config.api.sourceRoot)) issues.push("api_source_root");
  if (!isSafeBuildPath(config.api.dockerfilePath)) issues.push("api_dockerfile_path");
  if (
    !Number.isInteger(config.api.containerPort) ||
    config.api.containerPort < 1 ||
    config.api.containerPort > 65_535
  ) {
    issues.push("api_container_port");
  }
  if (
    config.api.healthCheckPath.length > 512 ||
    !/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/u.test(config.api.healthCheckPath)
  ) {
    issues.push("api_health_check_path");
  }
  if (!isSafeBuildPath(config.frontend.sourceRoot)) issues.push("frontend_source_root");
  if (!isSafeBuildPath(config.frontend.packageManifestPath)) {
    issues.push("frontend_package_manifest_path");
  }
  if (!isSafeBuildPath(config.frontend.lockfilePath)) {
    issues.push("frontend_lockfile_path");
  }

  const packageManager = config.frontend.packageManager;
  if (!isPackageManagerKind(packageManager)) {
    issues.push("frontend_package_manager");
  }
  if (
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(
      config.frontend.packageManagerVersion
    )
  ) {
    issues.push("frontend_package_manager_version");
  }
  if (!isSafeBuildPath(config.frontend.outputPath)) issues.push("frontend_output_path");
  if (
    isPackageManagerKind(packageManager) &&
    (config.frontend.installPreset !== PACKAGE_MANAGER_PRESETS[packageManager].installPreset ||
      config.frontend.buildPreset !== PACKAGE_MANAGER_PRESETS[packageManager].buildPreset)
  ) {
    issues.push("frontend_package_presets");
  }

  return issues;
}

function isPackageManagerKind(value: string): value is PackageManagerKind {
  return value === "npm" || value === "pnpm" || value === "yarn";
}

function normalizeRuntimeSecretNames(names?: readonly string[]): string[] {
  return [...new Set((names ?? []).map((name) => name.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function isSafeBuildPath(path: string): boolean {
  if (path.length === 0 || path.length > 512 || path.includes("\0")) return false;
  if (path.startsWith("/") || /^[A-Za-z]:\//u.test(path)) return false;
  if (!/^[A-Za-z0-9._/@+-]+$/u.test(path)) return false;
  return path.split("/").every((segment) => segment.length > 0 && segment !== "..");
}
