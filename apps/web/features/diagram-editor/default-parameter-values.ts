import type { DiagramNode } from "../../../../packages/types/src";

const defaultParameterValuesByResourceId: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  "aws-vpc": {
    enableDnsSupport: true,
    instanceTenancy: "default"
  },
  "aws-subnet": {
    mapPublicIpOnLaunch: false
  },
  "aws-ec2-instance": {
    associatePublicIpAddress: false
  },
  "aws-s3-bucket": {
    forceDestroy: false
  },
  "aws-s3-public-access-block": {
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true
  },
  "aws-rds-instance": {
    publiclyAccessible: false,
    storageEncrypted: true,
    storageType: "gp3"
  },
  "aws-ebs-volume": {
    encrypted: true,
    type: "gp3"
  },
  "aws-acm-certificate": {
    validationMethod: "DNS"
  },
  "aws-efs-file-system": {
    encrypted: true
  },
  "aws-appautoscaling-target": {
    scalableDimension: "ecs:service:DesiredCount",
    serviceNamespace: "ecs"
  }
};

export function getDefaultParameterValues(
  resourceId: string,
  currentNodes: readonly DiagramNode[] = []
): Record<string, unknown> {
  const defaults = { ...defaultParameterValuesByResourceId[resourceId] };

  if (resourceId !== "aws-appautoscaling-target") {
    return defaults;
  }

  const clusterName = getTerraformResourceName(currentNodes, "aws_ecs_cluster");
  const serviceName = getTerraformResourceName(currentNodes, "aws_ecs_service");

  return clusterName && serviceName
    ? {
        ...defaults,
        resourceId: `service/\${aws_ecs_cluster.${clusterName}.name}/\${aws_ecs_service.${serviceName}.name}`
      }
    : defaults;
}

function getTerraformResourceName(nodes: readonly DiagramNode[], resourceType: string) {
  return nodes.find((node) => node.parameters?.resourceType === resourceType)?.parameters
    ?.resourceName;
}
