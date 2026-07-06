import type { AwsDiscoveredRelationship, AwsDiscoveredResourceRecord } from "./aws-provider-adapter.js";

type SecurityGroupIngressRule = {
  ipProtocol: string | null;
  fromPort: number;
  toPort: number | null;
  port: number;
  cidr: string;
};
type ConfigRecord = Record<string, string | number | boolean>;

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
        cidrBlock: extractTag(item, "cidrBlock"),
        cidrBlockAssociationSet: extractCidrBlockAssociations(item),
        dhcpOptionsId: extractTag(item, "dhcpOptionsId"),
        instanceTenancy: extractTag(item, "instanceTenancy"),
        isDefault: extractBooleanTag(item, "isDefault"),
        state: extractTag(item, "state")
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
        assignIpv6AddressOnCreation: extractBooleanTag(item, "assignIpv6AddressOnCreation"),
        availableIpAddressCount: extractIntegerTag(item, "availableIpAddressCount"),
        cidrBlock: extractTag(item, "cidrBlock"),
        defaultForAz: extractBooleanTag(item, "defaultForAz"),
        ipv6CidrBlockAssociationSet: extractIpv6CidrBlockAssociations(item),
        mapPublicIpOnLaunch: extractBooleanTag(item, "mapPublicIpOnLaunch"),
        state: extractTag(item, "state"),
        subnetArn: extractTag(item, "subnetArn"),
        vpcId,
        availabilityZone: extractTag(item, "availabilityZone"),
        availabilityZoneId: extractTag(item, "availabilityZoneId")
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
      config: {
        attachments: extractInternetGatewayAttachments(item)
      },
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
      config: {
        associations: extractRouteTableAssociations(item),
        routes: extractRouteTableRoutes(item),
        vpcId
      },
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
        groupName: extractTag(item, "groupName"),
        description: extractTag(item, "groupDescription"),
        ownerId: extractTag(item, "ownerId"),
        vpcId,
        egress: extractSecurityGroupEgressRules(item),
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
        architecture: extractTag(item, "architecture"),
        blockDeviceMappings: extractInstanceBlockDeviceMappings(item),
        iamInstanceProfileArn: extractTag(item, "arn"),
        imageId: extractTag(item, "imageId"),
        instanceType: extractTag(item, "instanceType"),
        keyName: extractTag(item, "keyName"),
        launchTime: extractTag(item, "launchTime"),
        monitoringState: extractNestedTag(item, "monitoring", "state"),
        placementAvailabilityZone: extractNestedTag(item, "placement", "availabilityZone"),
        privateDnsName: extractTag(item, "privateDnsName"),
        privateIpAddress: extractTag(item, "privateIpAddress"),
        publicDnsName: extractTag(item, "dnsName"),
        publicIpAddress: extractTag(item, "ipAddress"),
        rootDeviceName: extractTag(item, "rootDeviceName"),
        rootDeviceType: extractTag(item, "rootDeviceType"),
        securityGroupIds: groupIds,
        state: extractNestedTag(item, "state", "name"),
        subnetId,
        virtualizationType: extractTag(item, "virtualizationType"),
        vpcId: extractTag(item, "vpcId")
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
  return extractSetItems(xml, "DBInstances", "DBInstance").map((item) => {
    const dbInstanceId = extractRequiredTag(item, "DBInstanceIdentifier");
    const securityGroupIds = extractRepeatedTags(item, "VpcSecurityGroupId");

    return {
      providerResourceType: "AWS::RDS::DBInstance",
      providerResourceId: dbInstanceId,
      displayName: dbInstanceId,
      region,
      config: {
        allocatedStorage: extractIntegerTag(item, "AllocatedStorage"),
        availabilityZone: extractTag(item, "AvailabilityZone"),
        backupRetentionPeriod: extractIntegerTag(item, "BackupRetentionPeriod"),
        dbInstanceClass: extractTag(item, "DBInstanceClass"),
        dbName: extractTag(item, "DBName"),
        dbSubnetGroupName: extractTag(item, "DBSubnetGroupName"),
        deletionProtection: extractBooleanTag(item, "DeletionProtection"),
        endpointAddress: extractNestedTag(item, "Endpoint", "Address"),
        endpointPort: extractIntegerTag(item, "Port"),
        engine: extractTag(item, "Engine"),
        engineVersion: extractTag(item, "EngineVersion"),
        multiAz: extractBooleanTag(item, "MultiAZ"),
        publiclyAccessible: extractBooleanTag(item, "PubliclyAccessible") === true,
        storageEncrypted: extractBooleanTag(item, "StorageEncrypted"),
        storageType: extractTag(item, "StorageType"),
        vpcSecurityGroupIds: securityGroupIds
      },
      relationships: securityGroupIds.map((groupId) => createRelationship("attached_to", groupId))
    };
  });
}

// Security Group ingress XML에서 위험 분석과 설정 표시 둘 다에 필요한 규칙 정보를 추립니다.
function extractSecurityGroupIngressRules(xml: string): SecurityGroupIngressRule[] {
  return extractSecurityGroupRules(xml, "ipPermissions");
}

function extractSecurityGroupEgressRules(xml: string): SecurityGroupIngressRule[] {
  return extractSecurityGroupRules(xml, "ipPermissionsEgress");
}

function extractSecurityGroupRules(xml: string, setTag: string): SecurityGroupIngressRule[] {
  return extractSetItems(xml, setTag).flatMap((permission) => {
    const fromPort = extractIntegerTag(permission, "fromPort");
    const toPort = extractIntegerTag(permission, "toPort");

    if (fromPort === null) {
      return [];
    }

    return extractRepeatedTags(permission, "cidrIp").map((cidr) => ({
      ipProtocol: extractTag(permission, "ipProtocol"),
      fromPort,
      toPort,
      port: fromPort,
      cidr
    }));
  });
}

function extractCidrBlockAssociations(xml: string): ConfigRecord[] {
  return extractSetItems(xml, "cidrBlockAssociationSet").map((item) => compactConfigRecord({
    associationId: extractTag(item, "associationId"),
    cidrBlock: extractTag(item, "cidrBlock"),
    state: extractNestedTag(item, "cidrBlockState", "state")
  }));
}

function extractIpv6CidrBlockAssociations(xml: string): ConfigRecord[] {
  return extractSetItems(xml, "ipv6CidrBlockAssociationSet").map((item) => compactConfigRecord({
    associationId: extractTag(item, "associationId"),
    ipv6CidrBlock: extractTag(item, "ipv6CidrBlock"),
    state: extractNestedTag(item, "ipv6CidrBlockState", "state")
  }));
}

function extractInternetGatewayAttachments(xml: string): ConfigRecord[] {
  return extractSetItems(xml, "attachmentSet").map((item) => compactConfigRecord({
    vpcId: extractTag(item, "vpcId"),
    state: extractTag(item, "state")
  }));
}

function extractRouteTableRoutes(xml: string): ConfigRecord[] {
  return extractSetItems(xml, "routeSet").map((item) => compactConfigRecord({
    destinationCidrBlock: extractTag(item, "destinationCidrBlock"),
    gatewayId: extractTag(item, "gatewayId"),
    instanceId: extractTag(item, "instanceId"),
    natGatewayId: extractTag(item, "natGatewayId"),
    networkInterfaceId: extractTag(item, "networkInterfaceId"),
    state: extractTag(item, "state")
  }));
}

function extractRouteTableAssociations(xml: string): ConfigRecord[] {
  return extractSetItems(xml, "associationSet").map((item) => compactConfigRecord({
    routeTableAssociationId: extractTag(item, "routeTableAssociationId"),
    subnetId: extractTag(item, "subnetId"),
    main: extractBooleanTag(item, "main")
  }));
}

function extractInstanceBlockDeviceMappings(xml: string): ConfigRecord[] {
  return extractSetItems(xml, "blockDeviceMapping").map((item) => compactConfigRecord({
    deviceName: extractTag(item, "deviceName"),
    volumeId: extractTag(item, "volumeId"),
    status: extractTag(item, "status")
  }));
}

function compactConfigRecord<T extends Record<string, string | number | boolean | null>>(
  record: T
): ConfigRecord {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== null)
  ) as ConfigRecord;
}

// AWS 목록 XML에서 각 set 바로 아래 있는 항목 태그만 꺼냅니다.
export function extractSetItems(xml: string, setTag: string, itemTag = "item"): string[] {
  return extractTagBodies(xml, setTag).flatMap((setBody) =>
    extractDirectElementBodies(setBody, itemTag)
  );
}

// AWS Query XML은 바깥 목록과 안쪽 하위 목록이 같은 태그를 쓸 수 있어서 깊이를 세야 합니다.
function extractDirectElementBodies(xml: string, itemTag: string): string[] {
  const items: string[] = [];
  let searchIndex = 0;
  const openTag = `<${itemTag}>`;
  const closeTag = `</${itemTag}>`;

  while (searchIndex < xml.length) {
    const itemStartIndex = xml.indexOf(openTag, searchIndex);

    if (itemStartIndex === -1) {
      return items;
    }

    const itemBodyStartIndex = itemStartIndex + openTag.length;
    const itemEndIndex = findMatchingElementEndIndex(xml, itemBodyStartIndex, openTag, closeTag);
    items.push(xml.slice(itemBodyStartIndex, itemEndIndex));
    searchIndex = itemEndIndex + closeTag.length;
  }

  return items;
}

// 중첩된 AWS 목록 구조에서 현재 항목 태그가 끝나는 위치를 찾습니다.
function findMatchingElementEndIndex(
  xml: string,
  startIndex: number,
  openTag: string,
  closeTag: string
): number {
  let depth = 1;
  let searchIndex = startIndex;

  while (depth > 0) {
    const nextItemStartIndex = xml.indexOf(openTag, searchIndex);
    const nextItemEndIndex = xml.indexOf(closeTag, searchIndex);

    if (nextItemEndIndex === -1) {
      throw new Error(`AWS response ${openTag} tag is not closed`);
    }

    if (nextItemStartIndex !== -1 && nextItemStartIndex < nextItemEndIndex) {
      depth += 1;
      searchIndex = nextItemStartIndex + openTag.length;
      continue;
    }

    depth -= 1;

    if (depth === 0) {
      return nextItemEndIndex;
    }

    searchIndex = nextItemEndIndex + closeTag.length;
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
  const value = extractTagBodies(xml, tagName)[0];

  return value ? unescapeXml(value) : null;
}

function extractNestedTag(xml: string, parentTagName: string, childTagName: string): string | null {
  const parentBody = extractTagBodies(xml, parentTagName)[0];

  return parentBody ? extractTag(parentBody, childTagName) : null;
}

function extractBooleanTag(xml: string, tagName: string): boolean | null {
  const value = extractTag(xml, tagName);

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function extractIntegerTag(xml: string, tagName: string): number | null {
  const value = extractTag(xml, tagName);

  if (!value) {
    return null;
  }

  const parsedValue = Number.parseInt(value, 10);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

// 같은 이름의 XML 블록이 여러 번 나올 때 원본 body를 전부 꺼냅니다.
function extractTagBodies(xml: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "g");

  return [...xml.matchAll(pattern)].map((match) => match[1] ?? "");
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
