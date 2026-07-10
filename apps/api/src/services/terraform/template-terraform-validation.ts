import {
  buildTemplateDiagramJson,
  createTerraformProviderFiles,
  type BuildTemplateDiagramInput,
  type TemplateId,
  type TerraformSyncFileInput
} from "@sketchcatch/types";
import { generateTerraformFromDiagramJson } from "./terraform-preview.js";

export function createTemplateTerraformValidationFiles(
  templateId: TemplateId,
  input: BuildTemplateDiagramInput
): readonly TerraformSyncFileInput[] {
  const diagramJson = buildTemplateDiagramJson(templateId, input);

  return [
    ...createTerraformProviderFiles(diagramJson),
    {
      fileName: "main.tf",
      terraformCode: generateTerraformFromDiagramJson(diagramJson)
    }
  ];
}
