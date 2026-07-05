import { createHmac, createHash } from "node:crypto";
import { ListBucketsCommand, S3Client } from "@aws-sdk/client-s3";
import type { AwsConnection, ResourceType } from "@sketchcatch/types";
import { createAwsSdkStsGateway } from "../aws-connections/aws-connection-test-service.js";
import {
  prepareTerraformAwsCredentialEnv,
  type TerraformAwsCredentialEnv
} from "../aws-connections/aws-connection-runtime-credentials.js";
import type {
  AwsDiscoveredRelationship,
  AwsDiscoveredResourceRecord,
  AwsProviderScanGateway,
  AwsProviderScanInput
} from "./aws-provider-adapter.js";

export type AwsReverseEngineeringGatewayOptions = {
  fetchXml?: typeof fetch;
};

type SignedAwsQueryInput = {
  service: "ec2" | "rds";
  region: string;
  action: string;
  version: string;
  credentials: TerraformAwsCredentialEnv;
};

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
      const [vpcs, subnets, securityGroups, instances, rdsInstances, buckets] =
        await Promise.all([
          shouldRead(input, "VPC")
            ? describeVpcs(input.region, credentials, fetchXml)
            : Promise.resolve([]),
          shouldRead(input, "SUBNET")
            ? describeSubnets(input.region, credentials, fetchXml)
            : Promise.resolve([]),
          shouldRead(input, "SECURITY_GROUP")
            ? describeSecurityGroups(input.region, credentials, fetchXml)
            : Promise.resolve([]),
          shouldRead(input, "EC2")
            ? describeInstances(input.region, credentials, fetchXml)
            : Promise.resolve([]),
          shouldRead(input, "RDS")
            ? describeRdsInstances(input.region, credentials, fetchXml)
            : Promise.resolve([]),
          shouldRead(input, "S3") ? listBuckets(input.region, credentials) : Promise.resolve([])
        ]);

      return [...vpcs, ...subnets, ...securityGroups, ...instances, ...rdsInstances, ...buckets];
    }
  };
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

  return extractSetItems(xml, "vpcSet").map((item) => {
    const vpcId = extractRequiredTag(item, "vpcId");

    return {
      providerResourceType: "AWS::EC2::VPC",
      providerResourceId: vpcId,
      displayName: extractNameTag(item) ?? vpcId,
      region,
      config: {
        cidrBlock: extractTag(item, "cidrBlock")
      },
      relationships: []
    };
  });
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

  return extractSetItems(xml, "subnetSet").map((item) => {
    const subnetId = extractRequiredTag(item, "subnetId");
    const vpcId = extractTag(item, "vpcId");

    return {
      providerResourceType: "AWS::EC2::Subnet",
      providerResourceId: subnetId,
      displayName: extractNameTag(item) ?? subnetId,
      region,
      config: {
        cidrBlock: extractTag(item, "cidrBlock"),
        availabilityZone: extractTag(item, "availabilityZone")
      },
      relationships: vpcId ? [createRelationship("contains", vpcId)] : []
    };
  });
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

  return extractSetItems(xml, "securityGroupInfo").map((item) => {
    const groupId = extractRequiredTag(item, "groupId");
    const vpcId = extractTag(item, "vpcId");

    return {
      providerResourceType: "AWS::EC2::SecurityGroup",
      providerResourceId: groupId,
      displayName: extractTag(item, "groupName") ?? groupId,
      region,
      config: {
        description: extractTag(item, "groupDescription")
      },
      relationships: vpcId ? [createRelationship("depends_on", vpcId)] : []
    };
  });
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

  return extractSetItems(xml, "instancesSet").map((item) => {
    const instanceId = extractRequiredTag(item, "instanceId");
    const subnetId = extractTag(item, "subnetId");
    const groupIds = extractRepeatedTags(item, "groupId");
    const relationships = [
      ...(subnetId ? [createRelationship("contains", subnetId)] : []),
      ...groupIds.map((groupId) => createRelationship("attached_to", groupId))
    ];

    return {
      providerResourceType: "AWS::EC2::Instance",
      providerResourceId: instanceId,
      displayName: extractNameTag(item) ?? instanceId,
      region,
      config: {
        instanceType: extractTag(item, "instanceType"),
        imageId: extractTag(item, "imageId")
      },
      relationships
    };
  });
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

  return extractSetItems(xml, "DBInstances").map((item) => {
    const dbInstanceId = extractRequiredTag(item, "DBInstanceIdentifier");
    const securityGroupIds = extractRepeatedTags(item, "VpcSecurityGroupId");

    return {
      providerResourceType: "AWS::RDS::DBInstance",
      providerResourceId: dbInstanceId,
      displayName: dbInstanceId,
      region,
      config: {
        engine: extractTag(item, "Engine"),
        dbInstanceClass: extractTag(item, "DBInstanceClass")
      },
      relationships: securityGroupIds.map((groupId) => createRelationship("attached_to", groupId))
    };
  });
}

async function listBuckets(
  region: string,
  credentials: TerraformAwsCredentialEnv
): Promise<AwsDiscoveredResourceRecord[]> {
  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: credentials.AWS_ACCESS_KEY_ID,
      secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY,
      sessionToken: credentials.AWS_SESSION_TOKEN
    }
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

async function sendAwsQuery(
  input: SignedAwsQueryInput,
  fetchXml: typeof fetch
): Promise<string> {
  const body = new URLSearchParams({
    Action: input.action,
    Version: input.version
  }).toString();
  const endpoint = `https://${input.service}.${input.region}.amazonaws.com/`;
  const signedHeaders = signAwsQueryRequest({
    ...input,
    endpoint,
    body
  });
  const response = await fetchXml(endpoint, {
    method: "POST",
    headers: signedHeaders,
    body
  });
  const xml = await response.text();

  if (!response.ok) {
    throw new Error(`AWS ${input.service} ${input.action} failed: ${xml.slice(0, 240)}`);
  }

  return xml;
}

// AWS Query API에는 SDK 없이도 SigV4 서명이 필요해서, 요청마다 필요한 header를 직접 만듭니다.
function signAwsQueryRequest(input: SignedAwsQueryInput & { endpoint: string; body: string }) {
  const endpointUrl = new URL(input.endpoint);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const payloadHash = sha256Hex(input.body);
  const canonicalHeaders = [
    "content-type:application/x-www-form-urlencoded; charset=utf-8",
    `host:${endpointUrl.host}`,
    `x-amz-date:${amzDate}`,
    `x-amz-security-token:${input.credentials.AWS_SESSION_TOKEN}`
  ].join("\n");
  const signedHeaders = "content-type;host;x-amz-date;x-amz-security-token";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signingKey = createSigningKey(
    input.credentials.AWS_SECRET_ACCESS_KEY,
    dateStamp,
    input.region,
    input.service
  );
  const signature = hmacHex(signingKey, stringToSign);

  return {
    "content-type": "application/x-www-form-urlencoded; charset=utf-8",
    host: endpointUrl.host,
    "x-amz-date": amzDate,
    "x-amz-security-token": input.credentials.AWS_SESSION_TOKEN,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${input.credentials.AWS_ACCESS_KEY_ID}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

function shouldRead(input: AwsProviderScanInput, resourceType: ResourceType): boolean {
  return input.resourceTypes.includes(resourceType);
}

function createRelationship(
  type: AwsDiscoveredRelationship["type"],
  targetProviderResourceId: string
): AwsDiscoveredRelationship {
  return {
    type,
    targetProviderResourceId
  };
}

export function extractSetItems(xml: string, setTag: string): string[] {
  const setBody = extractTag(xml, setTag);

  if (!setBody) {
    return [];
  }

  return extractDirectItemBodies(setBody);
}

// AWS Query XML은 바깥 목록과 안쪽 하위 목록이 모두 <item>을 쓰기 때문에 깊이를 세야 합니다.
function extractDirectItemBodies(xml: string): string[] {
  const items: string[] = [];
  let searchIndex = 0;

  while (searchIndex < xml.length) {
    const itemStartIndex = xml.indexOf("<item>", searchIndex);

    if (itemStartIndex === -1) {
      return items;
    }

    const itemBodyStartIndex = itemStartIndex + "<item>".length;
    const itemEndIndex = findMatchingItemEndIndex(xml, itemBodyStartIndex);
    items.push(xml.slice(itemBodyStartIndex, itemEndIndex));
    searchIndex = itemEndIndex + "</item>".length;
  }

  return items;
}

function findMatchingItemEndIndex(xml: string, startIndex: number): number {
  let depth = 1;
  let searchIndex = startIndex;

  while (depth > 0) {
    const nextItemStartIndex = xml.indexOf("<item>", searchIndex);
    const nextItemEndIndex = xml.indexOf("</item>", searchIndex);

    if (nextItemEndIndex === -1) {
      throw new Error("AWS response item tag is not closed");
    }

    if (nextItemStartIndex !== -1 && nextItemStartIndex < nextItemEndIndex) {
      depth += 1;
      searchIndex = nextItemStartIndex + "<item>".length;
      continue;
    }

    depth -= 1;

    if (depth === 0) {
      return nextItemEndIndex;
    }

    searchIndex = nextItemEndIndex + "</item>".length;
  }

  return searchIndex;
}

function extractNameTag(xml: string): string | null {
  const tagItems = extractSetItems(xml, "tagSet");
  const nameTag = tagItems.find((item) => extractTag(item, "key") === "Name");

  return nameTag ? extractTag(nameTag, "value") : null;
}

function extractRequiredTag(xml: string, tagName: string): string {
  const value = extractTag(xml, tagName);

  if (!value) {
    throw new Error(`AWS response missing ${tagName}`);
  }

  return value;
}

function extractRepeatedTags(xml: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "g");

  return [...xml.matchAll(pattern)].map((match) => unescapeXml(match[1] ?? ""));
}

function extractTag(xml: string, tagName: string): string | null {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`);
  const value = pattern.exec(xml)?.[1];

  return value ? unescapeXml(value) : null;
}

function createSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string
): Buffer {
  const kDate = hmacBuffer(Buffer.from(`AWS4${secretAccessKey}`, "utf8"), dateStamp);
  const kRegion = hmacBuffer(kDate, region);
  const kService = hmacBuffer(kRegion, service);

  return hmacBuffer(kService, "aws4_request");
}

function hmacBuffer(key: Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function hmacHex(key: Buffer, data: string): string {
  return createHmac("sha256", key).update(data, "utf8").digest("hex");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function unescapeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}
