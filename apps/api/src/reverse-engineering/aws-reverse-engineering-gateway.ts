import { ListBucketsCommand, S3Client } from "@aws-sdk/client-s3";
import type { AwsConnection, ResourceType, ReverseEngineeringScanError } from "@sketchcatch/types";
import { createAwsSdkStsGateway } from "../aws-connections/aws-connection-test-service.js";
import {
  prepareTerraformAwsCredentialEnv,
  type TerraformAwsCredentialEnv
} from "../aws-connections/aws-connection-runtime-credentials.js";
import type {
  AwsDiscoveredResourceRecord,
  AwsProviderDiscoveryResult,
  AwsProviderScanGateway,
  AwsProviderScanInput
} from "./aws-provider-adapter.js";
import {
  parseInstancesFromXml,
  parseInternetGatewaysFromXml,
  parseRdsInstancesFromXml,
  parseRouteTablesFromXml,
  parseSecurityGroupsFromXml,
  parseSubnetsFromXml,
  parseVpcsFromXml
} from "./aws-reverse-engineering-parsers.js";
import { sendAwsQuery } from "./aws-reverse-engineering-query.js";

export type AwsReverseEngineeringGatewayOptions = {
  fetchXml?: typeof fetch;
};

// 검증된 AWS 연결로 실제 read-only 조회를 수행하는 gateway를 만듭니다.
export function createAwsReverseEngineeringGateway(
  awsConnection: AwsConnection,
  options: AwsReverseEngineeringGatewayOptions = {}
): AwsProviderScanGateway {
  return {
    async discoverResources(input) {
      const preparedCredentials = await prepareTerraformAwsCredentialEnv(
        awsConnection,
        createAwsSdkStsGateway()
      );
      const credentials = preparedCredentials.env;
      const fetchXml = options.fetchXml ?? fetch;
      const resourceGroups = await Promise.all([
        readResourceGroup(input, "VPC", () => describeVpcs(input.region, credentials, fetchXml)),
        readResourceGroup(input, "SUBNET", () => describeSubnets(input.region, credentials, fetchXml)),
        readResourceGroup(input, "INTERNET_GATEWAY", () =>
          describeInternetGateways(input.region, credentials, fetchXml)
        ),
        readResourceGroup(input, "ROUTE_TABLE", () =>
          describeRouteTables(input.region, credentials, fetchXml)
        ),
        readResourceGroup(input, "SECURITY_GROUP", () =>
          describeSecurityGroups(input.region, credentials, fetchXml)
        ),
        readResourceGroup(input, "EC2", () => describeInstances(input.region, credentials, fetchXml)),
        readResourceGroup(input, "RDS", () => describeRdsInstances(input.region, credentials, fetchXml)),
        readResourceGroup(input, "S3", () => listBuckets(input.region, credentials))
      ]);

      return {
        records: resourceGroups.flatMap((group) => group.records),
        scanErrors: resourceGroups.flatMap((group) => group.scanErrors)
      };
    }
  };
}

// 리소스 한 종류가 실패해도 다른 종류의 스캔 결과는 계속 살립니다.
async function readResourceGroup(
  input: AwsProviderScanInput,
  resourceType: ResourceType,
  read: () => Promise<AwsDiscoveredResourceRecord[]>
): Promise<AwsProviderDiscoveryResult> {
  if (!shouldRead(input, resourceType)) {
    return { records: [], scanErrors: [] };
  }

  try {
    return { records: await read(), scanErrors: [] };
  } catch (error) {
    return {
      records: [],
      scanErrors: [toScanError(resourceType, error)]
    };
  }
}

async function describeVpcs(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch
): Promise<AwsDiscoveredResourceRecord[]> {
  const xml = await sendAwsQuery({
    service: "ec2",
    region,
    action: "DescribeVpcs",
    version: "2016-11-15",
    credentials
  }, fetchXml);

  return parseVpcsFromXml(xml, region);
}

async function describeSubnets(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch
): Promise<AwsDiscoveredResourceRecord[]> {
  const xml = await sendAwsQuery({
    service: "ec2",
    region,
    action: "DescribeSubnets",
    version: "2016-11-15",
    credentials
  }, fetchXml);

  return parseSubnetsFromXml(xml, region);
}

async function describeSecurityGroups(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch
): Promise<AwsDiscoveredResourceRecord[]> {
  const xml = await sendAwsQuery({
    service: "ec2",
    region,
    action: "DescribeSecurityGroups",
    version: "2016-11-15",
    credentials
  }, fetchXml);

  return parseSecurityGroupsFromXml(xml, region);
}

async function describeInstances(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch
): Promise<AwsDiscoveredResourceRecord[]> {
  const xml = await sendAwsQuery({
    service: "ec2",
    region,
    action: "DescribeInstances",
    version: "2016-11-15",
    credentials
  }, fetchXml);

  return parseInstancesFromXml(xml, region);
}

// EC2 Query API에서 Internet Gateway 목록을 읽습니다.
async function describeInternetGateways(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch
): Promise<AwsDiscoveredResourceRecord[]> {
  const xml = await sendAwsQuery({
    service: "ec2",
    region,
    action: "DescribeInternetGateways",
    version: "2016-11-15",
    credentials
  }, fetchXml);

  return parseInternetGatewaysFromXml(xml, region);
}

// EC2 Query API에서 Route Table 목록을 읽습니다.
async function describeRouteTables(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch
): Promise<AwsDiscoveredResourceRecord[]> {
  const xml = await sendAwsQuery({
    service: "ec2",
    region,
    action: "DescribeRouteTables",
    version: "2016-11-15",
    credentials
  }, fetchXml);

  return parseRouteTablesFromXml(xml, region);
}

async function describeRdsInstances(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  fetchXml: typeof fetch
): Promise<AwsDiscoveredResourceRecord[]> {
  const xml = await sendAwsQuery({
    service: "rds",
    region,
    action: "DescribeDBInstances",
    version: "2014-10-31",
    credentials
  }, fetchXml);

  return parseRdsInstancesFromXml(xml, region);
}

// S3는 Query XML API가 아니라 SDK로 읽기 때문에 같은 AWS 자격 증명을 SDK 형태로 바꿉니다.
async function listBuckets(
  region: string,
  credentials: TerraformAwsCredentialEnv
): Promise<AwsDiscoveredResourceRecord[]> {
  const sdkCredentials = credentials.AWS_SESSION_TOKEN
    ? {
        accessKeyId: credentials.AWS_ACCESS_KEY_ID,
        secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY,
        sessionToken: credentials.AWS_SESSION_TOKEN
      }
    : {
        accessKeyId: credentials.AWS_ACCESS_KEY_ID,
        secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY
      };
  const client = new S3Client({
    region,
    credentials: sdkCredentials
  });
  const response = await client.send(new ListBucketsCommand({}));

  return (response.Buckets ?? []).flatMap((bucket) => {
    if (!bucket.Name) {
      return [];
    }

    return [
      {
        providerResourceType: "AWS::S3::Bucket",
        providerResourceId: bucket.Name,
        displayName: bucket.Name,
        region,
        config: {
          createdAt: bucket.CreationDate?.toISOString()
        },
        relationships: []
      }
    ];
  });
}

function shouldRead(input: AwsProviderScanInput, resourceType: ResourceType): boolean {
  return input.resourceTypes.includes(resourceType);
}

// 화면과 로그에 AWS 계정 ID가 그대로 나가지 않도록 12자리 계정 번호를 가립니다.
export function maskReverseEngineeringSensitiveText(text: string): string {
  return text.replace(/\b(\d{4})\d{8}\b/g, "$1********");
}

// AWS 오류 메시지를 화면에 보여줄 수 있는 scanErrors reason으로 줄입니다.
function toScanError(resourceType: ResourceType, error: unknown): ReverseEngineeringScanError {
  const message = maskReverseEngineeringSensitiveText(
    error instanceof Error ? error.message : "AWS 리소스를 읽지 못했습니다."
  );
  const reason = classifyScanErrorReason(message);

  return {
    id: `scan-error-${resourceType.toLowerCase()}`,
    resourceType,
    stage: "provider_api",
    reason,
    message,
    retryable: reason === "throttled" || reason === "provider_error"
  };
}

// AWS의 긴 오류 문장에서 사용자가 이해할 수 있는 실패 종류만 뽑습니다.
function classifyScanErrorReason(message: string): ReverseEngineeringScanError["reason"] {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("accessdenied") || normalizedMessage.includes("not authorized")) {
    return "permission_denied";
  }

  if (normalizedMessage.includes("expiredtoken")) {
    return "expired_credential";
  }

  if (normalizedMessage.includes("throttl") || normalizedMessage.includes("rate exceeded")) {
    return "throttled";
  }

  if (normalizedMessage.includes("invalid") && normalizedMessage.includes("region")) {
    return "invalid_region";
  }

  return "provider_error";
}
