import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { config as loadDotenvFile } from "dotenv";

const workspaceMarker = "pnpm-workspace.yaml";
const loadedEnvFiles = new Set<string>();

export function loadEnvFiles(): void {
  for (const envFilePath of getEnvFileCandidates(process.cwd())) {
    if (loadedEnvFiles.has(envFilePath) || !existsSync(envFilePath)) {
      continue;
    }

    loadDotenvFile({
      path: envFilePath,
      quiet: true
    });
    loadedEnvFiles.add(envFilePath);
  }
}

function getEnvFileCandidates(cwd: string): string[] {
  const workspaceRoot = findWorkspaceRoot(cwd);

  if (!workspaceRoot) {
    return uniquePaths([join(cwd, ".env.local"), join(cwd, ".env")]);
  }

  const apiRoot = join(workspaceRoot, "apps", "api");

  return uniquePaths([
    join(apiRoot, ".env.local"),
    join(apiRoot, ".env"),
    join(workspaceRoot, ".env.local"),
    join(workspaceRoot, ".env")
  ]);
}

function findWorkspaceRoot(startDir: string): string | undefined {
  let currentDir = resolve(startDir);

  while (true) {
    if (existsSync(join(currentDir, workspaceMarker))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }

    currentDir = parentDir;
  }
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((envFilePath) => resolve(envFilePath)))];
}

loadEnvFiles();
