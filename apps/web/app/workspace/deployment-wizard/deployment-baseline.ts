import type {
  ArchitectureDiagnostic,
  DiagramJson,
  TerraformDiagnostic
} from "@sketchcatch/types";
import type { WorkspaceTerraformState } from "../operations/use-workspace-terraform";

export type DeploymentBaselineFile = {
  readonly code: string;
  readonly fileName: string;
};

export type DeploymentBaseline = {
  readonly architectureDiagnostics: readonly ArchitectureDiagnostic[];
  readonly diagram: DiagramJson;
  readonly terraformCode: string;
  readonly terraformDiagnostics: readonly TerraformDiagnostic[];
  readonly terraformFiles: readonly DeploymentBaselineFile[];
};

export type DeploymentBaselineSource = Pick<
  WorkspaceTerraformState,
  "architectureDiagnostics" | "code" | "diagnostics" | "files" | "previewState"
>;

// 현재 Board와 일치하는 Terraform만 배포 단계의 불변 입력으로 복사합니다.
export function createDeploymentBaseline(
  diagram: DiagramJson,
  terraform: DeploymentBaselineSource
): DeploymentBaseline | null {
  if (terraform.previewState !== "current" || !terraform.code.trim()) {
    return null;
  }

  return {
    architectureDiagnostics: cloneJsonValue(terraform.architectureDiagnostics),
    diagram: cloneJsonValue(diagram),
    terraformCode: terraform.code,
    terraformDiagnostics: cloneJsonValue(terraform.diagnostics),
    terraformFiles: terraform.files.map((file) => ({
      code: file.code,
      fileName: file.fileName
    }))
  };
}

// Baseline이 이후 Board 편집과 객체 참조를 공유하지 않도록 JSON 값을 복제합니다.
function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
