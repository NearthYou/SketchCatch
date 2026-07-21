import type {
  ArchitectureDiagnostic,
  DiagramJson,
  TerraformDiagnostic,
  TerraformSyncFileInput
} from "@sketchcatch/types";
import { generateTerraformCode, syncTerraformToDiagram, validateTerraformCode } from "./api";
import {
  combineTerraformFiles,
  createTerraformFilesFromGeneratedCode,
  markTerraformSourceAuthoritative,
  type TerraformVirtualFile
} from "./terraform-panel-utils";
import {
  applyAllTerraformSyncProposals,
  rewriteTerraformReferencesForSyncProposals
} from "./terraform-sync-proposals";
import { combineTerraformDiagnostics } from "./terraform-issues-state";

export type PreparedTerraformArtifactSource = {
  readonly diagramJson: DiagramJson;
  readonly terraformCode: string;
  readonly terraformFiles: readonly TerraformSyncFileInput[];
};

export type PreparedWorkspaceTerraformSource = PreparedTerraformArtifactSource & {
  readonly architectureDiagnostics?: readonly ArchitectureDiagnostic[] | undefined;
  readonly diagnostics: readonly TerraformDiagnostic[];
  readonly preservedResourceAddresses: readonly string[];
};

type WorkspaceTerraformPreparationDependencies = {
  readonly generate: typeof generateTerraformCode;
  readonly sync: typeof syncTerraformToDiagram;
  readonly validate: typeof validateTerraformCode;
};

const defaultDependencies: WorkspaceTerraformPreparationDependencies = {
  generate: generateTerraformCode,
  sync: syncTerraformToDiagram,
  validate: validateTerraformCode
};

export class WorkspaceTerraformPreparationError extends Error {
  readonly architectureDiagnostics: readonly ArchitectureDiagnostic[];
  readonly diagnostics: readonly TerraformDiagnostic[];

  constructor(
    message: string,
    diagnostics: readonly TerraformDiagnostic[] = [],
    architectureDiagnostics: readonly ArchitectureDiagnostic[] = []
  ) {
    super(message);
    this.name = "WorkspaceTerraformPreparationError";
    this.architectureDiagnostics = architectureDiagnostics;
    this.diagnostics = diagnostics;
  }
}

export async function validateWorkspaceTerraformFiles(
  files: readonly TerraformSyncFileInput[],
  validate: typeof validateTerraformCode = validateTerraformCode
): Promise<TerraformDiagnostic[]> {
  const terraformFiles = files.map((file) => ({ ...file }));
  const validationResult = await validate({
    terraformCode: terraformFiles.length > 0 ? "" : combineTerraformSyncFiles(terraformFiles),
    terraformFiles
  });
  const shouldAddFallbackSource = terraformFiles.length <= 1;

  return validationResult.diagnostics.map((diagnostic) =>
    diagnostic.sourceFileName || !shouldAddFallbackSource
      ? diagnostic
      : {
          ...diagnostic,
          sourceFileName: terraformFiles[0]?.fileName ?? "main.tf"
        }
  );
}

export async function prepareWorkspaceTerraformSource(
  {
    diagramJson,
    terraformFiles
  }: {
    readonly diagramJson: DiagramJson;
    readonly terraformFiles: readonly TerraformSyncFileInput[];
  },
  dependencies: WorkspaceTerraformPreparationDependencies = defaultDependencies
): Promise<PreparedWorkspaceTerraformSource> {
  let sourceFiles = terraformFiles.map(toTerraformVirtualFile);
  let architectureDiagnostics: readonly ArchitectureDiagnostic[] | undefined;

  if (!combineTerraformFiles(sourceFiles).trim()) {
    const generated = await dependencies.generate(diagramJson);
    architectureDiagnostics = generated.architectureDiagnostics;

    if (hasBlockingArchitectureDiagnostic(architectureDiagnostics)) {
      throw new WorkspaceTerraformPreparationError(
        "Architecture Board를 Terraform으로 변환할 수 없습니다.",
        [],
        architectureDiagnostics
      );
    }

    sourceFiles = createTerraformFilesFromGeneratedCode(diagramJson, generated.terraformCode);
  }

  let preparedTerraformCode = combineTerraformFiles(sourceFiles);

  if (!preparedTerraformCode.trim()) {
    throw new WorkspaceTerraformPreparationError("저장할 Terraform 코드가 없습니다.");
  }

  let preparedFiles = sourceFiles.map(toTerraformSyncFile);
  let validationDiagnostics = await validateWorkspaceTerraformFiles(
    preparedFiles,
    dependencies.validate
  );

  if (hasBlockingDiagnostic(validationDiagnostics)) {
    throw new WorkspaceTerraformPreparationError(
      "Terraform 코드 검증에 실패했습니다.",
      validationDiagnostics
    );
  }

  let syncResult = await dependencies.sync({
    diagramJson,
    terraformCode: preparedTerraformCode,
    terraformFiles: preparedFiles
  });
  const rewrittenFiles = rewriteTerraformReferencesForSyncProposals(
    sourceFiles,
    syncResult.proposals ?? []
  );
  const didRewriteReferences = rewrittenFiles.some(
    (file, index) => !areTerraformVirtualFilesEqual(file, sourceFiles[index])
  );

  if (didRewriteReferences) {
    sourceFiles = rewrittenFiles;
    preparedFiles = sourceFiles.map(toTerraformSyncFile);
    preparedTerraformCode = combineTerraformFiles(sourceFiles);
    validationDiagnostics = await validateWorkspaceTerraformFiles(
      preparedFiles,
      dependencies.validate
    );

    if (hasBlockingDiagnostic(validationDiagnostics)) {
      throw new WorkspaceTerraformPreparationError(
        "Terraform 참조 갱신 후 코드 검증에 실패했습니다.",
        validationDiagnostics
      );
    }

    syncResult = await dependencies.sync({
      diagramJson,
      terraformCode: preparedTerraformCode,
      terraformFiles: preparedFiles
    });
  }

  const diagnostics = combineTerraformDiagnostics(validationDiagnostics, syncResult.diagnostics);

  if (hasBlockingDiagnostic(diagnostics)) {
    throw new WorkspaceTerraformPreparationError(
      "Terraform 코드 검증 또는 그래프 반영에 실패했습니다.",
      diagnostics
    );
  }

  const synchronizedDiagram =
    syncResult.proposals && syncResult.proposals.length > 0
      ? applyAllTerraformSyncProposals(syncResult.diagramJson, syncResult.proposals)
      : syncResult.diagramJson;

  return {
    ...(architectureDiagnostics ? { architectureDiagnostics } : {}),
    diagramJson: markTerraformSourceAuthoritative(synchronizedDiagram),
    diagnostics,
    preservedResourceAddresses: syncResult.preservedResourceAddresses ?? [],
    terraformCode: preparedTerraformCode,
    terraformFiles: preparedFiles
  };
}

function combineTerraformSyncFiles(files: readonly TerraformSyncFileInput[]): string {
  return combineTerraformFiles(files.map(toTerraformVirtualFile));
}

function toTerraformVirtualFile(file: TerraformSyncFileInput): TerraformVirtualFile {
  return {
    code: file.terraformCode,
    fileName: file.fileName
  };
}

function toTerraformSyncFile(file: TerraformVirtualFile): TerraformSyncFileInput {
  return {
    fileName: file.fileName,
    terraformCode: file.code
  };
}

function areTerraformVirtualFilesEqual(
  left: TerraformVirtualFile,
  right: TerraformVirtualFile | undefined
): boolean {
  return Boolean(right && left.fileName === right.fileName && left.code === right.code);
}

function hasBlockingDiagnostic(diagnostics: readonly TerraformDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

function hasBlockingArchitectureDiagnostic(
  diagnostics: readonly ArchitectureDiagnostic[]
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}
