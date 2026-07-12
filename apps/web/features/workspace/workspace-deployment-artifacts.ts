import type {
  ArchitectureSnapshot,
  ArchitectureSource,
  DiagramJson,
  ProjectAssetUploadResponse,
  TerraformArtifact,
  TerraformArtifactBundle
} from "@sketchcatch/types";
import {
  abortProjectAssetUpload,
  confirmProjectAssetUpload,
  createArchitectureSnapshot,
  createProjectAssetUpload,
  uploadProjectAsset,
  validateTerraformCode
} from "./api";
import { convertDiagramJsonToArchitectureJson } from "./workspace-ai-diagram-adapter";

const TERRAFORM_ARTIFACT_CONTENT_TYPE = "text/plain";
const TERRAFORM_BUNDLE_CONTENT_TYPE = "application/vnd.sketchcatch.terraform-files+json";
const DEFAULT_TERRAFORM_ARTIFACT_FILE_NAME = "main.tf";
const TERRAFORM_BUNDLE_FILE_NAME = "terraform-files.json";

export type SavedWorkspaceArchitectureSnapshot = {
  readonly architecture: ArchitectureSnapshot;
};

export type SavedWorkspaceTerraformArtifact = {
  readonly architecture: ArchitectureSnapshot;
  readonly terraformArtifact: TerraformArtifact;
};

export async function saveWorkspaceArchitectureSnapshot({
  diagramJson,
  projectId,
  source = "manual"
}: {
  readonly diagramJson: DiagramJson;
  readonly projectId: string;
  readonly source?: ArchitectureSource | string;
}): Promise<SavedWorkspaceArchitectureSnapshot> {
  const architecture = await createArchitectureSnapshot({
    projectId,
    source,
    architectureJson: convertDiagramJsonToArchitectureJson(diagramJson)
  });

  return { architecture };
}

export async function saveWorkspaceTerraformArtifact({
  diagramJson,
  fileName = DEFAULT_TERRAFORM_ARTIFACT_FILE_NAME,
  projectId,
  skipValidation = false,
  source = "manual",
  terraformCode,
  terraformFiles
}: {
  readonly diagramJson: DiagramJson;
  readonly fileName?: string;
  readonly projectId: string;
  readonly skipValidation?: boolean;
  readonly source?: ArchitectureSource | string;
  readonly terraformCode: string;
  readonly terraformFiles?: readonly {
    readonly fileName: string;
    readonly terraformCode: string;
  }[];
}): Promise<SavedWorkspaceTerraformArtifact> {
  if (!terraformCode.trim()) {
    throw new Error("저장할 Terraform 코드가 없습니다.");
  }

  if (!skipValidation) {
    const validationResult = await validateTerraformCode({
      terraformCode,
      ...(terraformFiles ? { terraformFiles: [...terraformFiles] } : {})
    });
    const validationError = validationResult.diagnostics.find(
      (diagnostic) => diagnostic.severity === "error"
    );

    if (validationError) {
      const line = validationError.line ? `${validationError.line}번째 줄: ` : "";
      throw new Error(`Terraform 검증 실패: ${line}${validationError.message}`);
    }
  }

  const { architecture } = await saveWorkspaceArchitectureSnapshot({
    diagramJson,
    projectId,
    source
  });
  const bundle: TerraformArtifactBundle | null = terraformFiles && terraformFiles.length > 1
    ? {
        schemaVersion: 1,
        files: terraformFiles.map((file) => ({
          fileName: file.fileName,
          terraformCode: file.terraformCode
        }))
      }
    : null;
  const artifactContent = bundle ? JSON.stringify(bundle) : terraformCode;
  const artifactFileName = bundle ? TERRAFORM_BUNDLE_FILE_NAME : fileName;
  const artifactContentType = bundle ? TERRAFORM_BUNDLE_CONTENT_TYPE : TERRAFORM_ARTIFACT_CONTENT_TYPE;
  const byteSize = new TextEncoder().encode(artifactContent).byteLength;
  let uploadResponse: ProjectAssetUploadResponse | undefined;

  try {
    uploadResponse = await createProjectAssetUpload({
      projectId,
      architectureId: architecture.id,
      assetType: "terraform_file",
      fileName: artifactFileName,
      contentType: artifactContentType,
      byteSize
    });

    await uploadProjectAsset(uploadResponse.upload, artifactContent);

    const confirmedAsset = await confirmProjectAssetUpload({
      projectId,
      assetId: uploadResponse.asset.id
    });

    if (
      confirmedAsset.assetType !== "terraform_file" ||
      typeof confirmedAsset.architectureId !== "string" ||
      confirmedAsset.uploadStatus !== "uploaded"
    ) {
      throw new Error("저장된 Terraform artifact가 Architecture snapshot과 연결되지 않았습니다.");
    }

    return {
      architecture,
      terraformArtifact: confirmedAsset as TerraformArtifact
    };
  } catch (error) {
    if (uploadResponse) {
      await abortProjectAssetUpload({
        projectId,
        assetId: uploadResponse.asset.id
      }).catch(() => undefined);
    }

    throw error;
  }
}
