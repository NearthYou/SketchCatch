import type {
  DiagramJson,
  DiagramNode,
  DiagramNodeParameters,
  TerraformSyncFileInput
} from "./index.js";

const AWS_REQUIRED_PROVIDER = `    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }`;

const KUBERNETES_REQUIRED_PROVIDER = `    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }`;

const ARCHIVE_REQUIRED_PROVIDER = `    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }`;

// Provider files follow the same resource-plus-parameters boundary as Terraform graph generation.
export function createTerraformProviderFiles(
  diagramJson: DiagramJson
): readonly TerraformSyncFileInput[] {
  const deployableNodes = diagramJson.nodes.filter(isTerraformDeployableNode);
  const resourceTypes = new Set(deployableNodes.map(getTerraformResourceType));
  const usesAws = [...resourceTypes].some((resourceType) => resourceType.startsWith("aws_"));
  const usesKubernetes = [...resourceTypes].some((resourceType) =>
    resourceType.startsWith("kubernetes_")
  );
  const usesArchive = deployableNodes.some((node) =>
    getTerraformResourceType(node) === "aws_lambda_function" &&
    typeof node.parameters?.values?.inlineSource === "string"
  );

  if (!usesAws && !usesKubernetes) {
    return [];
  }

  const requiredProviders = [
    ...(usesAws ? [AWS_REQUIRED_PROVIDER] : []),
    ...(usesArchive ? [ARCHIVE_REQUIRED_PROVIDER] : []),
    ...(usesKubernetes ? [KUBERNETES_REQUIRED_PROVIDER] : [])
  ].join("\n");
  const eksCluster = usesKubernetes
    ? deployableNodes.find((node) => getTerraformResourceType(node) === "aws_eks_cluster")
    : undefined;

  return [{
    fileName: "providers.tf",
    terraformCode: `terraform {
  required_providers {
${requiredProviders}
  }
}
${eksCluster ? renderEksKubernetesProvider(eksCluster) : ""}`
  }];
}

// A Terraform node needs both Resource behavior and an explicit Terraform identity/value container.
export function isTerraformDeployableNode(
  node: DiagramNode
): node is DiagramNode & { readonly parameters: DiagramNodeParameters } {
  return node.kind === "resource" && node.parameters !== undefined;
}

function renderEksKubernetesProvider(clusterNode: DiagramNode): string {
  const resourceName = clusterNode.parameters?.resourceName?.trim();

  if (!resourceName) {
    return "";
  }

  const clusterAddress = `aws_eks_cluster.${resourceName}`;

  return `
data "aws_eks_cluster_auth" "sketchcatch" {
  name = ${clusterAddress}.name
}

provider "kubernetes" {
  host                   = ${clusterAddress}.endpoint
  cluster_ca_certificate = base64decode(${clusterAddress}.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.sketchcatch.token
}
`;
}

function getTerraformResourceType(node: DiagramNode): string {
  return node.parameters?.resourceType?.trim() || node.type;
}
