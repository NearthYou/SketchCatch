import type {
  ArchitectureSnapshot,
  ArchitectureSource,
  DiagramJson,
  ProjectAssetUploadResponse,
  TerraformArtifact
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
const DEFAULT_TERRAFORM_ARTIFACT_FILE_NAME = "main.tf";

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
  source = "manual",
  terraformCode
}: {
  readonly diagramJson: DiagramJson;
  readonly fileName?: string;
  readonly projectId: string;
  readonly source?: ArchitectureSource | string;
  readonly terraformCode: string;
}): Promise<SavedWorkspaceTerraformArtifact> {
  if (!terraformCode.trim()) {
    throw new Error("저장할 Terraform 코드가 없습니다.");
  }

  const validationResult = await validateTerraformCode(terraformCode);
  const validationError = validationResult.diagnostics.find(
    (diagnostic) => diagnostic.severity === "error"
  );

  if (validationError) {
    const line = validationError.line ? `${validationError.line}번째 줄: ` : "";
    throw new Error(`Terraform 검증 실패: ${line}${validationError.message}`);
  }

  const { architecture } = await saveWorkspaceArchitectureSnapshot({
    diagramJson,
    projectId,
    source
  });
  const byteSize = new TextEncoder().encode(terraformCode).byteLength;
  let uploadResponse: ProjectAssetUploadResponse | undefined;

  try {
    uploadResponse = await createProjectAssetUpload({
      projectId,
      architectureId: architecture.id,
      assetType: "terraform_file",
      fileName,
      contentType: TERRAFORM_ARTIFACT_CONTENT_TYPE,
      byteSize
    });

    await uploadProjectAsset(uploadResponse.upload, terraformCode);

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
