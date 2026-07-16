import {
  SUPPORTED_ARCHITECTURE_RESOURCE_CATALOG,
  type SupportedArchitectureResourceCatalogItem
} from "./aiArchitectureResourceCatalog.js";

export const AWS_ARCHITECTURE_REFERENCE_PACK_VERSION = "aws-reference-pack-2026-07-07" as const;

export const AWS_ARCHITECTURE_REFERENCE_SOURCE_URLS = [
  "https://aws.amazon.com/ko/solutions/",
  "https://github.com/aws-samples?q=terraform&type=all&language=hcl&sort=",
  "https://github.com/aws-samples/aws-terraform-best-practices",
  "https://docs.aws.amazon.com/ko_kr/prescriptive-guidance/latest/terraform-aws-provider-best-practices/terraform-aws-provider-best-practices.pdf"
] as const;

const AWS_ARCHITECTURE_REFERENCE_GUIDANCE_LINES = [
  "Use AWS Solutions and aws-samples patterns as design precedents, but adapt them to the user's budget, scale, region, availability, and supported ResourceNode.type list.",
  "Prefer small composable architecture patterns: separate static delivery, API/runtime, data, network, IAM, observability, and storage concerns instead of collapsing unrelated responsibilities into one node.",
  "For Terraform-first designs, favor root-module clarity, explicit providers/versions, meaningful names, typed variables, outputs that reference real resources, and reusable modules only when they remove real complexity.",
  "Represent stateful resources deliberately: private placement, encryption, backup/retention, monitoring, and Multi-AZ only when the user's requirements or risk profile justify the cost.",
  "Never put secrets in architecture config, Terraform state assumptions, outputs, logs, or examples. Prefer Secrets Manager/IAM roles and mark sensitive outputs as sensitive in IaC guidance.",
  "Preserve remote-state and collaboration assumptions in explanations or nextActions: S3 backend/state locking, version pinning, lint/format/validate/security scan, and policy/test gates before deployment.",
  "For production-like paths, include observability, least-privilege IAM, network boundaries, deletion/cleanup considerations, and explicit cost or availability trade-off notes.",
  "Keep the generated ArchitectureJson concise: include only resources that make the selected architecture understandable and deployable; put unsupported or future Terraform details in assumptions/nextActions."
] as const;

export function createAwsArchitectureReferenceKnowledgePayload(): {
  readonly version: typeof AWS_ARCHITECTURE_REFERENCE_PACK_VERSION;
  readonly size: "compact";
  readonly sourceUrls: readonly string[];
  readonly guidance: readonly string[];
  readonly generatedResourceCatalog: readonly SupportedArchitectureResourceCatalogItem[];
} {
  return {
    version: AWS_ARCHITECTURE_REFERENCE_PACK_VERSION,
    size: "compact",
    sourceUrls: AWS_ARCHITECTURE_REFERENCE_SOURCE_URLS,
    guidance: AWS_ARCHITECTURE_REFERENCE_GUIDANCE_LINES,
    generatedResourceCatalog: SUPPORTED_ARCHITECTURE_RESOURCE_CATALOG
  };
}

export function createAwsArchitectureReferenceKnowledgePrompt(): string {
  return [
    "Persistent AWS/Terraform reference knowledge pack:",
    `Version: ${AWS_ARCHITECTURE_REFERENCE_PACK_VERSION}`,
    "Sources: AWS Solutions Library, aws-samples Terraform HCL examples, AWS Terraform Best Practices sample repo, AWS Prescriptive Guidance for Terraform AWS provider best practices.",
    "The generated resource catalog is supplied in referenceKnowledge.generatedResourceCatalog and supportedResourceCatalog; use it as the source of truth for ResourceNode.type and Terraform resource/data metadata.",
    "Compact guidance:",
    ...AWS_ARCHITECTURE_REFERENCE_GUIDANCE_LINES.map((line) => `- ${line}`)
  ].join("\n");
}
