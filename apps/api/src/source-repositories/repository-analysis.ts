import {
  REPOSITORY_EVIDENCE_KINDS,
  type RepositoryAnalysisAiHandoff,
  type RepositoryAnalysisEvidence,
  type RepositoryApplicationUnit
} from "@sketchcatch/types";
import { matchesGlob } from "node:path";
import { z } from "zod";
import type {
  GitHubRepositoryEvidenceFile,
  GitHubRepositoryEvidenceSnapshot
} from "./github-app-client.js";
import {
  getRepositoryEvidenceKind,
  isIgnoredRepositoryEvidencePath,
  isRepositoryFrameworkConfigPath
} from "./repository-evidence-path.js";
import { selectRepositoryTemplate } from "./repository-template-selection.js";
import { createRepositoryTemplateRecommendationProfile } from "./repository-template-recommendation.js";

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
  { packageName: "@nestjs/core", name: "NestJS", kind: "backend" },
  { packageName: "fastify", name: "Fastify", kind: "backend" },
  { packageName: "express", name: "Express", kind: "backend" },
  { packageName: "serverless", name: "Serverless Framework", kind: "backend" }
] as const;

type ParsedPackageJson = {
  readonly path: string;
  readonly rootPath: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly workspacePatterns: readonly string[] | null;
};

// 정적 repository snapshot을 저장하거나 실행하지 않고 AI Handoff로 변환한다.
export function analyzeRepositoryEvidence(
  snapshot: GitHubRepositoryEvidenceSnapshot
): RepositoryAnalysisAiHandoff {
  const analysisSnapshot = {
    revision: snapshot.revision,
    treePaths: snapshot.treePaths.filter((path) => !isIgnoredRepositoryEvidencePath(path)),
    files: snapshot.files.filter((file) => !isIgnoredRepositoryEvidencePath(file.path))
  };
  const packageFiles = analysisSnapshot.files.flatMap(parsePackageJsonEvidence);
  const applicationUnits = detectApplicationUnits(
    packageFiles,
    analysisSnapshot.treePaths,
    analysisSnapshot.files
  );
  const evidence = collectRepositoryEvidence(
    analysisSnapshot,
    applicationUnits,
    packageFiles
  );
  const missingEvidence = REPOSITORY_EVIDENCE_KINDS.filter(
    (kind) => !evidence.some((item) => item.kind === kind)
  );

  const selectionInput = {
    snapshot: analysisSnapshot,
    applicationUnits,
    evidence,
    missingEvidence
  };
  const handoff = selectRepositoryTemplate(selectionInput);
  const profile = createRepositoryTemplateRecommendationProfile(selectionInput);

  return {
    ...handoff,
    deploymentTypeDefault: profile.deploymentTypeDefault,
    usesCiCdDefault: profile.usesCiCdDefault,
    questions: profile.questions,
    ...(profile.recommendation ? { recommendation: profile.recommendation } : {})
  };
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
        workspacePatterns: getWorkspacePatterns(parsed.data.workspaces)
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
  treePaths: readonly string[],
  files: readonly GitHubRepositoryEvidenceFile[]
): RepositoryApplicationUnit[] {
  const rootPackage = packageFiles.find((file) => file.rootPath === ".");
  const workspacePackageFiles = rootPackage?.workspacePatterns
    ? packageFiles.filter(
        (file) =>
          file.rootPath === "." ||
          isDeclaredWorkspaceRoot(file.rootPath, rootPackage.workspacePatterns ?? [])
      )
    : packageFiles;
  const hasNestedPackage = workspacePackageFiles.some((file) => file.rootPath !== ".");
  const packageUnits = workspacePackageFiles
    .filter(
      (file) =>
        !(file.rootPath === "." && file.workspacePatterns !== null && hasNestedPackage)
    )
    .flatMap((file) => createApplicationUnit(file, files));

  return [...packageUnits, ...detectDockerApplicationUnits(treePaths, packageUnits, files)]
    .sort((left, right) => left.rootPath.localeCompare(right.rootPath));
}

// package.json workspaces의 배열형과 packages 객체형을 같은 glob 목록으로 정규화한다.
function getWorkspacePatterns(
  workspaces: z.infer<typeof packageJsonSchema>["workspaces"]
): readonly string[] | null {
  if (Array.isArray(workspaces)) {
    return workspaces;
  }

  return workspaces?.packages ?? null;
}

// 선언된 workspace glob에 포함되고 제외 glob에는 걸리지 않는 실행 단위만 허용한다.
function isDeclaredWorkspaceRoot(rootPath: string, patterns: readonly string[]): boolean {
  const normalizedPatterns = patterns
    .map((pattern) => pattern.trim().replace(/^\.\//, "").replace(/\/$/, ""))
    .filter(Boolean);
  const included = normalizedPatterns
    .filter((pattern) => !pattern.startsWith("!"))
    .some((pattern) => matchesGlob(rootPath, pattern));
  const excluded = normalizedPatterns
    .filter((pattern) => pattern.startsWith("!"))
    .some((pattern) => matchesGlob(rootPath, pattern.slice(1)));

  return included && !excluded;
}

// package framework가 없어도 Dockerfile이 나타내는 실행 단위를 보존한다.
function detectDockerApplicationUnits(
  treePaths: readonly string[],
  packageUnits: readonly RepositoryApplicationUnit[],
  files: readonly GitHubRepositoryEvidenceFile[]
): RepositoryApplicationUnit[] {
  const dockerPaths = treePaths.filter(
    (path) => getRepositoryEvidenceKind(path) === "dockerfile"
  );
  const rootPaths = [...new Set(dockerPaths.map(getParentPath))];

  return rootPaths.flatMap((rootPath) => {
    const paths = dockerPaths.filter((path) => getParentPath(path) === rootPath);
    const belongsToPackageUnit = paths.some((path) =>
      packageUnits.some((unit) => isWithinRoot(path, unit.rootPath))
    );

    const frameworks = detectDockerBackendFrameworks(rootPath, files);

    return belongsToPackageUnit
      ? []
      : [
          {
            id: rootPath,
            rootPath,
            kind: frameworks.length > 0 ? "backend" as const : "unknown" as const,
            frameworks,
            evidencePaths: paths.sort()
          }
        ];
  });
}

function detectDockerBackendFrameworks(
  rootPath: string,
  files: readonly GitHubRepositoryEvidenceFile[]
): string[] {
  const text = files
    .filter((file) => isWithinRoot(file.path, rootPath))
    .map((file) => `${file.path}\n${file.content}`)
    .join("\n")
    .toLowerCase();
  const frameworks: string[] = [];

  if (/fastapi|uvicorn/.test(text)) frameworks.push("FastAPI");
  if (/\bdjango\b|gunicorn/.test(text)) frameworks.push("Django");
  if (/\bflask\b/.test(text)) frameworks.push("Flask");

  return frameworks;
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
        (isWithinRoot(path, packageFile.rootPath) && isRepositoryFrameworkConfigPath(path))
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
    const kind = getRepositoryEvidenceKind(path);

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
