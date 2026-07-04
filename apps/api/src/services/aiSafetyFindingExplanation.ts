import type {
  AiProviderMetadata,
  AiSafetyExplanation,
  CheckFinding,
  LlmExplanationFallbackReason
} from "@sketchcatch/types";
import {
  createNormalizedAiCacheKey,
  estimateAiUsage,
  maskSecretsForAi
} from "./aiProviderSafety.js";

const SAFETY_EXPLANATION_ROUTE_TARGET = "safety_finding_explanation";

type SafetyFindingTemplate = {
  readonly keywords: readonly string[];
  readonly riskSummary: string;
  readonly whyDangerous: string;
  readonly recommendedFix: string;
  readonly terraformHint?: string | undefined;
  readonly verificationSteps: readonly string[];
};

const SAFETY_FINDING_TEMPLATES: readonly SafetyFindingTemplate[] = [
  {
    keywords: ["public_ssh", "open-ssh", "ssh", "0.0.0.0/0", "::/0"],
    riskSummary: "SSH access is exposed to the public internet.",
    whyDangerous:
      "Anyone on the internet can attempt SSH login against the instance. If a key, user, or host configuration is weak, the server can be compromised before deployment review catches it.",
    recommendedFix:
      "Restrict SSH ingress to a trusted administrator CIDR or remove SSH and use AWS Systems Manager Session Manager.",
    terraformHint:
      "In the aws_security_group ingress rule, replace cidr_blocks = [\"0.0.0.0/0\"] with a trusted CIDR or remove the SSH rule.",
    verificationSteps: [
      "Confirm port 22 is not open to 0.0.0.0/0 or ::/0.",
      "Run Terraform validation and pre-deployment check again.",
      "Confirm the finding disappears before starting deployment review."
    ]
  },
  {
    keywords: ["public_rds", "public-rds", "rds", "publiclyaccessible", "database"],
    riskSummary: "The database can be reachable from a public network path.",
    whyDangerous:
      "A public database endpoint increases the attack surface for credential stuffing, brute force attempts, and accidental data exposure.",
    recommendedFix:
      "Disable public accessibility and place the database in private subnets with security group access limited to the application tier.",
    terraformHint:
      "Set publicly_accessible = false and ensure DB subnet groups use private subnets.",
    verificationSteps: [
      "Confirm publicly_accessible is false.",
      "Confirm the DB subnet group uses private subnets.",
      "Run the pre-deployment check again."
    ]
  },
  {
    keywords: ["public_s3", "public-s3", "s3", "bucket policy", "acl"],
    riskSummary: "The S3 bucket can expose objects publicly.",
    whyDangerous:
      "Public ACLs or permissive bucket policies can leak uploaded assets, Terraform exports, or user content to anonymous internet users.",
    recommendedFix:
      "Remove public ACLs and public bucket policy statements, then enable S3 Block Public Access.",
    terraformHint:
      "Use aws_s3_bucket_public_access_block with block_public_acls, block_public_policy, ignore_public_acls, and restrict_public_buckets set to true.",
    verificationSteps: [
      "Confirm no public ACL or Principal \"*\" allow policy remains.",
      "Confirm S3 Block Public Access is enabled.",
      "Run the pre-deployment check again."
    ]
  },
  {
    keywords: ["iam_wildcard", "iam", "wildcard", "permission"],
    riskSummary: "The IAM policy grants overly broad permissions.",
    whyDangerous:
      "Wildcard actions or resources can allow the workload to change unrelated cloud resources if the role is misused or compromised.",
    recommendedFix:
      "Replace wildcard actions and resources with the smallest action list and resource ARNs needed for this architecture.",
    terraformHint:
      "Avoid Action = \"*\" and Resource = \"*\" in aws_iam_policy_document or inline policy JSON.",
    verificationSteps: [
      "Confirm IAM policy actions are explicit.",
      "Confirm resource scope is limited to required ARNs.",
      "Run the pre-deployment check again."
    ]
  },
  {
    keywords: ["cost", "expensive", "비용"],
    riskSummary: "The resource can increase monthly practice cost.",
    whyDangerous:
      "A larger instance class or always-on managed service can create unexpected spend during repeated practice deployments.",
    recommendedFix:
      "Use the smallest supported instance class, prefer free-tier friendly defaults, and destroy unused environments after validation.",
    verificationSteps: [
      "Review the cost estimate and fallback assumptions.",
      "Confirm the selected instance class is intentional.",
      "Run cost review again after the change."
    ]
  }
];

const DEFAULT_SAFETY_FINDING_TEMPLATE: SafetyFindingTemplate = {
  keywords: [],
  riskSummary: "This finding needs manual review before deployment.",
  whyDangerous:
    "The deterministic safety rules found a condition that can affect security, reliability, configuration, or cost.",
  recommendedFix: "Review the finding description and recommendation, then update Terraform or the architecture before redeploying.",
  verificationSteps: [
    "Apply the recommended change.",
    "Run Terraform validation.",
    "Run the pre-deployment check again."
  ]
};

export function createFallbackSafetyFindingExplanation(
  finding: CheckFinding,
  fallbackReason: LlmExplanationFallbackReason = "missing_api_key"
): AiSafetyExplanation {
  const template = selectSafetyFindingTemplate(finding);
  const output = {
    riskSummary: template.riskSummary,
    whyDangerous: template.whyDangerous,
    recommendedFix: template.recommendedFix,
    terraformHint: template.terraformHint,
    verificationSteps: [...template.verificationSteps]
  };

  return {
    ...output,
    fallbackUsed: true,
    fallbackReason,
    providerMetadata: createFallbackProviderMetadata(finding, output)
  };
}

function selectSafetyFindingTemplate(finding: CheckFinding): SafetyFindingTemplate {
  const normalizedFinding = [
    finding.id,
    finding.category,
    finding.severity,
    finding.resourceId ?? "",
    finding.title,
    finding.description,
    finding.recommendation
  ]
    .join(" ")
    .toLowerCase();

  return (
    SAFETY_FINDING_TEMPLATES.find((template) =>
      template.keywords.some((keyword) => normalizedFinding.includes(keyword))
    ) ?? DEFAULT_SAFETY_FINDING_TEMPLATE
  );
}

function createFallbackProviderMetadata(
  finding: CheckFinding,
  output: Omit<AiSafetyExplanation, "fallbackUsed" | "fallbackReason" | "providerMetadata">
): AiProviderMetadata {
  const payload = maskSecretsForAi({
    finding,
    output
  });

  return {
    provider: "fallback",
    service: "rule_fallback",
    routeTarget: SAFETY_EXPLANATION_ROUTE_TARGET,
    cacheHit: false,
    cacheKey: createNormalizedAiCacheKey({
      provider: "fallback",
      routeTarget: SAFETY_EXPLANATION_ROUTE_TARGET,
      payload
    }),
    estimatedUsage: estimateAiUsage(payload, JSON.stringify(output).length),
    billingMode: "disabled",
    generatedAt: new Date().toISOString()
  };
}
