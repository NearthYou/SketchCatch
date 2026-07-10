import {
  REPOSITORY_EVIDENCE_KINDS,
  type RepositoryAnalysisAiHandoff,
  type RepositoryAnalysisEvidence,
  type RepositoryApplicationUnit,
  type RepositoryEvidenceKind
} from "@sketchcatch/types";
import { z } from "zod";
import type {
  GitHubRepositoryEvidenceFile,
  GitHubRepositoryEvidenceSnapshot
} from "./github-app-client.js";
import { selectRepositoryTemplate } from "./repository-template-selection.js";

const dependencyRecordSchema = z.record(z.string(), z.string());
const packageJsonSchema = z.object({
  dependencies: dependencyRecordSchema.optional(),
  devDependencies: dependencyRecordSchema.optional(),
  workspaces: z
    .union([z.array(z.string()), z.object({ packages: z.array(z.string()) })])
    .optional()
});

const frameworkDefinitions = [
  { packageName: "react", name: "React", kind: "frontend" },
  { packageName: "next", name: "Next.js", kind: "fullstack" },
  { packageName: "vite", name: "Vite", kind: "frontend" },
  { packageName: "fastify", name: "Fastify", kind: "backend" },
  { packageName: "express", name: "Express", kind: "backend" },
  { packageName: "serverless", name: "Serverless Framework", kind: "backend" }
] as const;

type ParsedPackageJson = {
  readonly path: string;
  readonly rootPath: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly hasWorkspaces: boolean;
};

// 정적 repository snapshot을 저장하거나 실행하지 않고 AI Handoff로 변환한다.
export function analyzeRepositoryEvidence(
  snapshot: GitHubRepositoryEvidenceSnapshot
): RepositoryAnalysisAiHandoff {
  const packageFiles = snapshot.files.flatMap(parsePackageJsonEvidence);
  const applicationUnits = detectApplicationUnits(packageFiles, snapshot.files);
  const evidence = collectRepositoryEvidence(snapshot, applicationUnits, packageFiles);
  const missingEvidence = REPOSITORY_EVIDENCE_KINDS.filter(
    (kind) => !evidence.some((item) => item.kind === kind)
  );

  return selectRepositoryTemplate({
    snapshot,
    applicationUnits,
    evidence,
    missingEvidence
  });
}

// package.json evidence를 신뢰 경계에서 파싱하고 잘못된 JSON은 분석 대상에서 제외한다.
function parsePackageJsonEvidence(file: GitHubRepositoryEvidenceFile): readonly ParsedPackageJson[] {
  if (!file.path.endsWith("package.json")) {
    return [];
  }

  try {
    const parsed = packageJsonSchema.safeParse(JSON.parse(file.content));

    if (!parsed.success) {
      return [];
    }

    return [
      {
        path: file.path,
        rootPath: getParentPath(file.path),
        dependencies: {
          ...parsed.data.dependencies,
          ...parsed.data.devDependencies
        },
        hasWorkspaces: parsed.data.workspaces !== undefined
      }
    ];
  } catch (error) {
    if (error instanceof SyntaxError) {
      return [];
    }

    throw error;
  }
}

// workspace 묶음용 root package를 제외하고 실제 실행 가능한 Application Unit을 찾는다.
function detectApplicationUnits(
  packageFiles: readonly ParsedPackageJson[],
  files: readonly GitHubRepositoryEvidenceFile[]
): RepositoryApplicationUnit[] {
  const hasNestedPackage = packageFiles.some((file) => file.rootPath !== ".");

  return packageFiles
    .filter((file) => !(file.rootPath === "." && file.hasWorkspaces && hasNestedPackage))
    .flatMap((file) => createApplicationUnit(file, files))
    .sort((left, right) => left.rootPath.localeCompare(right.rootPath));
}

// 하나의 package.json에서 framework와 실행 단위 종류를 결정한다.
function createApplicationUnit(
  packageFile: ParsedPackageJson,
  files: readonly GitHubRepositoryEvidenceFile[]
): readonly RepositoryApplicationUnit[] {
  const frameworks = frameworkDefinitions
    .filter((framework) => framework.packageName in packageFile.dependencies)
    .map((framework) => framework);

  if (frameworks.length === 0) {
    return [];
  }

  const hasFrontend = frameworks.some((framework) => framework.kind === "frontend");
  const hasBackend = frameworks.some((framework) => framework.kind === "backend");
  const hasFullstack = frameworks.some((framework) => framework.kind === "fullstack");
  const kind =
    hasFullstack || (hasFrontend && hasBackend)
      ? "fullstack"
      : hasFrontend
        ? "frontend"
        : "backend";

  const evidencePaths = files
    .map((file) => file.path)
    .filter(
      (path) =>
        path === packageFile.path ||
        (isWithinRoot(path, packageFile.rootPath) && isFrameworkConfigPath(path))
    )
    .sort();

  return [
    {
      id: packageFile.rootPath,
      rootPath: packageFile.rootPath,
      kind,
      frameworks: frameworks.map((framework) => framework.name),
      evidencePaths
    }
  ];
}

// 합의한 여섯 evidence 종류를 경로와 감지 신호로 정규화한다.
function collectRepositoryEvidence(
  snapshot: GitHubRepositoryEvidenceSnapshot,
  applicationUnits: readonly RepositoryApplicationUnit[],
  packageFiles: readonly ParsedPackageJson[]
): RepositoryAnalysisEvidence[] {
  const evidence: RepositoryAnalysisEvidence[] = [];

  if (snapshot.treePaths.length > 0) {
    evidence.push({
      kind: "repository_tree",
      path: ".",
      applicationUnitId: null,
      signals: [`${snapshot.treePaths.length} files`]
    });
  }

  for (const packageFile of packageFiles) {
    const unit = applicationUnits.find((candidate) => candidate.rootPath === packageFile.rootPath);
    const frameworks = unit?.frameworks ?? [];
    evidence.push({
      kind: "package_json",
      path: packageFile.path,
      applicationUnitId: unit?.id ?? null,
      signals: frameworks
    });
  }

  for (const path of snapshot.treePaths) {
    const kind = getPathEvidenceKind(path);

    if (kind && kind !== "package_json") {
      const unit = findApplicationUnitForPath(path, applicationUnits);
      evidence.push({
        kind,
        path,
        applicationUnitId: unit?.id ?? null,
        signals: [getFileName(path)]
      });
    }
  }

  return evidence.sort((left, right) => left.path.localeCompare(right.path));
}

// 파일 경로를 분석 계약의 evidence 종류로 분류한다.
function getPathEvidenceKind(path: string): RepositoryEvidenceKind | null {
  const fileName = getFileName(path);
  const lowerFileName = fileName.toLowerCase();

  if (lowerFileName === "package.json") return "package_json";
  if (/^(?:pnpm-lock\.yaml|yarn\.lock|package-lock\.json|bun\.lockb?)$/.test(lowerFileName)) {
    return "lockfile";
  }
  if (fileName === "Dockerfile" || fileName.endsWith(".Dockerfile")) return "dockerfile";
  if (/^readme(?:\.(?:md|mdx|rst|txt))?$/.test(lowerFileName)) return "readme";
  if (isFrameworkConfigPath(path)) return "framework_config";
  return null;
}

// 알려진 framework config 이름만 framework evidence로 인정한다.
function isFrameworkConfigPath(path: string): boolean {
  return /\/(?:vite|next|nuxt)\.config\.(?:js|mjs|ts)$/.test(`/${path}`);
}

// 가장 구체적인 Application Unit에 evidence 경로를 연결한다.
function findApplicationUnitForPath(
  path: string,
  units: readonly RepositoryApplicationUnit[]
): RepositoryApplicationUnit | undefined {
  return [...units]
    .sort((left, right) => right.rootPath.length - left.rootPath.length)
    .find((unit) => isWithinRoot(path, unit.rootPath));
}

// path가 root 자신 또는 하위 경로인지 경계 문자를 포함해 확인한다.
function isWithinRoot(path: string, rootPath: string): boolean {
  return rootPath === "." || path === rootPath || path.startsWith(`${rootPath}/`);
}

// repository 상대 경로에서 부모 경로를 계산한다.
function getParentPath(path: string): string {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex === -1 ? "." : path.slice(0, separatorIndex);
}

// repository 상대 경로에서 파일 이름만 반환한다.
function getFileName(path: string): string {
  return path.split("/").at(-1) ?? path;
}
