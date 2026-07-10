import type { DiagramJson, DiagramNode, TerraformSyncFileInput } from "./index.js";

const AWS_REQUIRED_PROVIDER = `    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }`;

const KUBERNETES_REQUIRED_PROVIDER = `    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }`;

export function createTerraformProviderFiles(
  diagramJson: DiagramJson
): readonly TerraformSyncFileInput[] {
  const resourceTypes = new Set(diagramJson.nodes.map(getTerraformResourceType));
  const usesAws = [...resourceTypes].some((resourceType) => resourceType.startsWith("aws_"));
  const usesKubernetes = [...resourceTypes].some((resourceType) =>
    resourceType.startsWith("kubernetes_")
  );

  if (!usesAws && !usesKubernetes) {
    return [];
  }

  const requiredProviders = [
    ...(usesAws ? [AWS_REQUIRED_PROVIDER] : []),
    ...(usesKubernetes ? [KUBERNETES_REQUIRED_PROVIDER] : [])
  ].join("\n");
  const eksCluster = usesKubernetes
    ? diagramJson.nodes.find((node) => getTerraformResourceType(node) === "aws_eks_cluster")
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
