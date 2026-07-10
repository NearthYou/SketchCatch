import {
  buildTemplateDiagramJson,
  getTemplateDefinitionById,
  type BuildTemplateDiagramInput,
  type TemplateId,
  type TerraformSyncFileInput
} from "@sketchcatch/types";
import { generateTerraformFromDiagramJson } from "./terraform-preview.js";

const AWS_REQUIRED_PROVIDER = `    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }`;

const KUBERNETES_REQUIRED_PROVIDER = `    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }`;

export function createTemplateTerraformValidationFiles(
  templateId: TemplateId,
  input: BuildTemplateDiagramInput
): readonly TerraformSyncFileInput[] {
  const definition = getTemplateDefinitionById(templateId);
  const requiredProviders = definition.providers.includes("kubernetes")
    ? `${AWS_REQUIRED_PROVIDER}\n${KUBERNETES_REQUIRED_PROVIDER}`
    : AWS_REQUIRED_PROVIDER;

  return [
    {
      fileName: "versions.tf",
      terraformCode: `terraform {
  required_providers {
${requiredProviders}
  }
}
`
    },
    {
      fileName: "main.tf",
      terraformCode: generateTerraformFromDiagramJson(
        buildTemplateDiagramJson(templateId, input)
      )
    }
  ];
}
