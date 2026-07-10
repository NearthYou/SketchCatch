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
  }
};

export function getDefaultParameterValues(resourceId: string): Record<string, unknown> {
  return { ...defaultParameterValuesByResourceId[resourceId] };
}
