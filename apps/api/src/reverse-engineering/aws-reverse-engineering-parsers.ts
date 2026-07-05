import type { AwsDiscoveredRelationship, AwsDiscoveredResourceRecord } from "./aws-provider-adapter.js";

type SecurityGroupIngressRule = {
  port: number;
  cidr: string;
};

// AWS VPC XML을 내부 Resource 후보로 바꿉니다.
export function parseVpcsFromXml(xml: string, region: string): AwsDiscoveredResourceRecord[] {
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

// AWS Subnet XML을 VPC 포함 관계가 있는 Resource 후보로 바꿉니다.
export function parseSubnetsFromXml(xml: string, region: string): AwsDiscoveredResourceRecord[] {
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

// AWS Internet Gateway XML을 VPC 연결 정보가 있는 Resource 후보로 바꿉니다.
export function parseInternetGatewaysFromXml(
  xml: string,
  region: string
): AwsDiscoveredResourceRecord[] {
  return extractSetItems(xml, "internetGatewaySet").map((item) => {
    const internetGatewayId = extractRequiredTag(item, "internetGatewayId");
    const vpcIds = extractRepeatedTags(item, "vpcId");

    return {
      providerResourceType: "AWS::EC2::InternetGateway",
      providerResourceId: internetGatewayId,
      displayName: extractNameTag(item) ?? internetGatewayId,
      region,
      config: {},
      relationships: vpcIds.map((vpcId) => createRelationship("attached_to", vpcId))
    };
  });
}

// AWS Route Table XML을 VPC와 Gateway 연결 정보가 있는 Resource 후보로 바꿉니다.
export function parseRouteTablesFromXml(
  xml: string,
  region: string
): AwsDiscoveredResourceRecord[] {
  return extractSetItems(xml, "routeTableSet").map((item) => {
    const routeTableId = extractRequiredTag(item, "routeTableId");
    const vpcId = extractTag(item, "vpcId");
    const gatewayIds = extractRepeatedTags(item, "gatewayId").filter((gatewayId) =>
      gatewayId.startsWith("igw-")
    );
    const relationships = [
      ...(vpcId ? [createRelationship("contains", vpcId)] : []),
      ...gatewayIds.map((gatewayId) => createRelationship("depends_on", gatewayId))
    ];

    return {
      providerResourceType: "AWS::EC2::RouteTable",
      providerResourceId: routeTableId,
      displayName: extractNameTag(item) ?? routeTableId,
      region,
      config: {},
      relationships
    };
  });
}

// AWS Security Group XML을 VPC 의존 관계가 있는 Resource 후보로 바꿉니다.
export function parseSecurityGroupsFromXml(
  xml: string,
  region: string
): AwsDiscoveredResourceRecord[] {
  return extractSetItems(xml, "securityGroupInfo").map((item) => {
    const groupId = extractRequiredTag(item, "groupId");
    const vpcId = extractTag(item, "vpcId");

    return {
      providerResourceType: "AWS::EC2::SecurityGroup",
      providerResourceId: groupId,
      displayName: extractTag(item, "groupName") ?? groupId,
      region,
      config: {
        description: extractTag(item, "groupDescription"),
        ingress: extractSecurityGroupIngressRules(item)
      },
      relationships: vpcId ? [createRelationship("depends_on", vpcId)] : []
    };
  });
}

// AWS EC2 Instance XML을 Subnet 포함 관계와 Security Group 연결 관계로 바꿉니다.
export function parseInstancesFromXml(xml: string, region: string): AwsDiscoveredResourceRecord[] {
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

// AWS RDS XML을 Security Group 연결 관계가 있는 Resource 후보로 바꿉니다.
export function parseRdsInstancesFromXml(
  xml: string,
  region: string
): AwsDiscoveredResourceRecord[] {
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
        dbInstanceClass: extractTag(item, "DBInstanceClass"),
        publiclyAccessible: extractTag(item, "PubliclyAccessible") === "true"
      },
      relationships: securityGroupIds.map((groupId) => createRelationship("attached_to", groupId))
    };
  });
}

// Security Group ingress XML에서 포트와 CIDR만 추려 위험 분석 입력으로 씁니다.
function extractSecurityGroupIngressRules(xml: string): SecurityGroupIngressRule[] {
  return extractSetItems(xml, "ipPermissions").flatMap((permission) => {
    const port = Number.parseInt(extractTag(permission, "fromPort") ?? "", 10);

    if (!Number.isFinite(port)) {
      return [];
    }

    return extractRepeatedTags(permission, "cidrIp").map((cidr) => ({ port, cidr }));
  });
}

// AWS 목록 XML에서 바로 아래 <item>들만 꺼냅니다.
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

// 중첩된 <item> 구조에서 현재 item이 끝나는 위치를 찾습니다.
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

// AWS 태그 목록에서 Name 태그 값을 찾습니다.
function extractNameTag(xml: string): string | null {
  const tagItems = extractSetItems(xml, "tagSet");
  const nameTag = tagItems.find((item) => extractTag(item, "key") === "Name");

  return nameTag ? extractTag(nameTag, "value") : null;
}

// 필수 XML 태그가 없으면 파싱 실패로 처리합니다.
function extractRequiredTag(xml: string, tagName: string): string {
  const value = extractTag(xml, tagName);

  if (!value) {
    throw new Error(`AWS response missing ${tagName}`);
  }

  return value;
}

// 같은 이름의 XML 태그가 여러 번 나오는 값을 전부 꺼냅니다.
function extractRepeatedTags(xml: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "g");

  return [...xml.matchAll(pattern)].map((match) => unescapeXml(match[1] ?? ""));
}

// XML에서 태그 하나의 문자열 값을 꺼냅니다.
function extractTag(xml: string, tagName: string): string | null {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`);
  const value = pattern.exec(xml)?.[1];

  return value ? unescapeXml(value) : null;
}

// AWS 원본 리소스 ID 사이의 관계를 내부 관계 모양으로 만듭니다.
function createRelationship(
  type: AwsDiscoveredRelationship["type"],
  targetProviderResourceId: string
): AwsDiscoveredRelationship {
  return {
    type,
    targetProviderResourceId
  };
}

// XML escape 문자열을 화면과 내부 타입에서 쓰는 일반 문자열로 되돌립니다.
function unescapeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}
