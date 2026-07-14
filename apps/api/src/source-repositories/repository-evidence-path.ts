import type { RepositoryEvidenceKind } from "@sketchcatch/types";

const repositoryFrameworkConfigFileNames = new Set([
  "angular.json",
  "app.yaml",
  "appspec.yaml",
  "appspec.yml",
  "cdk.json",
  "compose.yaml",
  "compose.yml",
  "docker-compose.yaml",
  "docker-compose.yml",
  "kustomization.yaml",
  "kustomization.yml",
  "netlify.toml",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "nuxt.config.js",
  "nuxt.config.ts",
  "samconfig.toml",
  "serverless.yaml",
  "serverless.yml",
  "template.yaml",
  "template.yml",
  "vercel.json",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.ts",
  "wrangler.json",
  "wrangler.jsonc",
  "wrangler.toml"
]);
const ignoredRepositoryEvidenceDirectories = new Set([
  ".git",
  ".next",
  ".nuxt",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "vendor"
]);

// repository 상대 경로를 합의한 evidence 종류로 분류한다.
export function getRepositoryEvidenceKind(path: string): RepositoryEvidenceKind | null {
  const fileName = path.split("/").at(-1) ?? "";
  const lowerFileName = fileName.toLowerCase();

  if (lowerFileName === "package.json") return "package_json";
  if (/^(?:pnpm-lock\.yaml|yarn\.lock|package-lock\.json|bun\.lockb?)$/.test(lowerFileName)) {
    return "lockfile";
  }
  if (fileName === "Dockerfile" || fileName.endsWith(".Dockerfile")) return "dockerfile";
  if (/^readme(?:\.(?:md|mdx|rst|txt))?$/.test(lowerFileName)) return "readme";
  if (isRepositoryFrameworkConfigPath(path)) return "framework_config";
  return null;
}

// content API로 읽을 수 있는 정적 evidence 경로만 허용한다.
export function isRepositoryEvidenceContentPath(path: string): boolean {
  const kind = getRepositoryEvidenceKind(path);
  return kind !== null && kind !== "lockfile";
}

// Template 선택 근거가 되는 framework와 배포 설정 파일을 식별한다.
export function isRepositoryFrameworkConfigPath(path: string): boolean {
  const fileName = path.split("/").at(-1) ?? "";
  return repositoryFrameworkConfigFileNames.has(fileName);
}

// 생성물과 vendored dependency 경로를 모든 분석 신호에서 제외한다.
export function isIgnoredRepositoryEvidencePath(path: string): boolean {
  return path
    .split("/")
    .some((segment) => ignoredRepositoryEvidenceDirectories.has(segment));
}
