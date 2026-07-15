import type {
  ArchitectureSnapshot,
  ArchitectureSource,
  DiagramJson,
  ProjectAssetUploadResponse,
  TerraformArtifact,
  TerraformSyncFileInput
} from "@sketchcatch/types";
import {
  abortProjectAssetUpload,
  confirmProjectAssetUpload,
  createArchitectureSnapshot,
  createProjectAssetUpload,
  uploadProjectAsset,
  validateTerraformCode
} from "./api";
import { DeploymentPreparationError } from "./deployment-preparation-error";
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

export type PreparedWorkspaceDeploymentArtifacts = SavedWorkspaceTerraformArtifact & {
  readonly preparedDraftRevision: number;
  readonly diagramJson: DiagramJson;
  readonly terraformFiles: readonly TerraformSyncFileInput[];
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
  let architecture: ArchitectureSnapshot;

  try {
    architecture = await createArchitectureSnapshot({
      projectId,
      source,
      architectureJson: convertDiagramJsonToArchitectureJson(diagramJson)
    });
  } catch (cause) {
    throw new DeploymentPreparationError({ cause, stage: "architecture_snapshot" });
  }

  return { architecture };
}

export async function saveWorkspaceTerraformArtifact({
  diagramJson,
  fileName = DEFAULT_TERRAFORM_ARTIFACT_FILE_NAME,
  projectId,
  skipValidation = false,
  source = "manual",
  terraformCode
}: {
  readonly diagramJson: DiagramJson;
  readonly fileName?: string;
  readonly projectId: string;
  readonly skipValidation?: boolean;
  readonly source?: ArchitectureSource | string;
  readonly terraformCode: string;
}): Promise<SavedWorkspaceTerraformArtifact> {
  if (!terraformCode.trim()) {
    throw new DeploymentPreparationError({
      cause: new Error("Terraform code is empty"),
      stage: "terraform_prepare"
    });
  }

  if (!skipValidation) {
    let validationResult;

    try {
      validationResult = await validateTerraformCode({
        terraformCode
      });
    } catch (cause) {
      throw new DeploymentPreparationError({ cause, stage: "terraform_prepare" });
    }

    const validationError = validationResult.diagnostics.find(
      (diagnostic) => diagnostic.severity === "error"
    );

    if (validationError) {
      throw new DeploymentPreparationError({
        cause: validationError,
        stage: "terraform_prepare"
      });
    }
  }

  const { architecture } = await saveWorkspaceArchitectureSnapshot({
    diagramJson,
    projectId,
    source
  });
  const byteSize = new TextEncoder().encode(terraformCode).byteLength;
  let uploadResponse: ProjectAssetUploadResponse | undefined;

  try {
    try {
      uploadResponse = await createProjectAssetUpload({
        projectId,
        architectureId: architecture.id,
        assetType: "terraform_file",
        fileName,
        contentType: TERRAFORM_ARTIFACT_CONTENT_TYPE,
        byteSize
      });
    } catch (cause) {
      throw new DeploymentPreparationError({ cause, stage: "asset_upload_request" });
    }

    try {
      await uploadProjectAsset(uploadResponse.upload, terraformCode);
    } catch (cause) {
      throw new DeploymentPreparationError({ cause, stage: "asset_upload" });
    }

    let confirmedAsset: TerraformArtifact;

    try {
      confirmedAsset = (await confirmProjectAssetUpload({
        projectId,
        assetId: uploadResponse.asset.id
      })) as TerraformArtifact;
    } catch (cause) {
      throw new DeploymentPreparationError({ cause, stage: "asset_upload_confirm" });
    }

    if (
      confirmedAsset.assetType !== "terraform_file" ||
      typeof confirmedAsset.architectureId !== "string" ||
      confirmedAsset.uploadStatus !== "uploaded"
    ) {
      throw new DeploymentPreparationError({
        cause: new Error("Confirmed asset does not match the prepared Terraform artifact"),
        stage: "asset_upload_confirm"
      });
    }

    return {
      architecture,
      terraformArtifact: confirmedAsset
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
