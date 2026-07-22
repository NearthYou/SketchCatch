// allow: SIZE_OK - AWS Query XML parser bundle; splitting every resource parser needs a separate migration.
import type { AwsDiscoveredRelationship, AwsDiscoveredResourceRecord } from "./aws-provider-adapter.js";

type SecurityGroupRule = {
  ipProtocol: string;
  fromPort?: number;
  toPort?: number;
  port?: number;
  cidr?: string;
  cidrBlocks?: string[];
  ipv6CidrBlocks?: string[];
  prefixListIds?: string[];
  securityGroups?: string[];
  description?: string | undefined;
  sourceSecurityGroupName?: string | undefined;
  sourceSecurityGroupOwnerId?: string | undefined;
  sourceSecurityGroupVpcId?: string | undefined;
  sourceSecurityGroupVpcPeeringConnectionId?: string | undefined;
};
type SecurityGroupRuleExtraction = {
  rules: SecurityGroupRule[];
  complete: boolean;
  sourceSecurityGroupIds: string[];
};
type ProviderParameterValue = string | ProviderParameterValue[] | { [key: string]: ProviderParameterValue };
type ConfigRecord = Record<string, string | number | boolean>;

/** gg: Query page token만 XML에서 꺼내고 빈 값이나 원문 response는 호출자에게 남기지 않습니다. */
export function parseAwsQueryPaginationToken(
  xml: string,
  elementName: "nextToken" | "Marker"
): string | undefined {
  const value = extractTag(xml, elementName)?.trim();
  return value && value.length > 0 ? value : undefined;
}

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
        providerParameters: createXmlParameterSnapshot(item),
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
        providerParameters: createXmlParameterSnapshot(item),
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

// EIP는 Terraform import에 필요한 allocation ID와 공개 가능한 상태만 남깁니다.
export function parseAddressesFromXml(
  xml: string,
  region: string
): AwsDiscoveredResourceRecord[] {
  return extractSetItems(xml, "addressesSet").map((item) => {
    const allocationId = extractTag(item, "allocationId");
    const publicIp = extractTag(item, "publicIp");
    const providerResourceId = allocationId ?? publicIp;

    if (!providerResourceId) {
      throw new Error("AWS response missing allocationId and publicIp");
    }

    const hasUnsupportedAssociation = [
      "associationId",
      "instanceId",
      "networkInterfaceId"
    ].some((tagName) => extractTag(item, tagName) !== null);
    const serviceManaged = extractTag(item, "serviceManaged");

    return {
      providerResourceType: "AWS::EC2::EIP",
      providerResourceId,
      displayName: extractNameTag(item) ?? providerResourceId,
      region,
      config: {
        ...compactConfigRecord({
          allocationId,
          domain: extractTag(item, "domain"),
          publicIp
        }),
        associationTargetType: serviceManaged
          ? "service_managed"
          : hasUnsupportedAssociation
            ? "ec2_or_eni"
            : "unassociated",
        tags: extractTags(item)
      },
      relationships: []
    };
  });
}

// NAT Gateway는 subnet과 EIP 참조를 재구성하는 데 필요한 bounded 설정만 남깁니다.
export function parseNatGatewaysFromXml(
  xml: string,
  region: string
): AwsDiscoveredResourceRecord[] {
  return extractSetItems(xml, "natGatewaySet").map((item) => {
    const natGatewayId = extractRequiredTag(item, "natGatewayId");
    const subnetId = extractTag(item, "subnetId");
    const addresses = extractSetItems(item, "natGatewayAddressSet");
    const allocationIds = addresses
      .map((address) => extractTag(address, "allocationId"))
      .filter((allocationId): allocationId is string => allocationId !== null);
    const explicitPrimaryAddress = addresses.find(
      (address) => extractBooleanTag(address, "isPrimary") === true
    );
    const primaryAddress = explicitPrimaryAddress ??
      (addresses.length === 1 && extractTag(addresses[0] ?? "", "isPrimary") === null
        ? addresses[0]
        : undefined);
    const hasNonReadyAddressStatus = addresses.some((address) => {
      const status = extractTag(address, "status")?.trim().toLowerCase();

      return status !== undefined && status !== "succeeded";
    });

    return {
      providerResourceType: "AWS::EC2::NatGateway",
      providerResourceId: natGatewayId,
      displayName: extractNameTag(item) ?? natGatewayId,
      region,
      config: {
        allocationIds,
        ...(hasNonReadyAddressStatus ? { addressStatusesReady: false } : {}),
        ...compactConfigRecord({
          connectivityType: extractTag(item, "connectivityType"),
          natGatewayId,
          primaryAllocationId: primaryAddress
            ? extractTag(primaryAddress, "allocationId")
            : null,
          state: extractTag(item, "state"),
          subnetId,
          vpcId: extractTag(item, "vpcId")
        }),
        tags: extractTags(item)
      },
      relationships: [
        ...(subnetId ? [createRelationship("contains", subnetId)] : []),
        ...allocationIds.map((allocationId) => createRelationship("depends_on", allocationId))
      ]
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
        attachments: extractInternetGatewayAttachments(item),
        providerParameters: createXmlParameterSnapshot(item)
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
  return extractSetItems(xml, "routeTableSet").flatMap((item) => {
    const routeTableId = extractRequiredTag(item, "routeTableId");
    const vpcId = extractTag(item, "vpcId");
    const gatewayIds = extractRepeatedTags(item, "gatewayId").filter((gatewayId) =>
      gatewayId.startsWith("igw-")
    );
    const natGatewayIds = extractRepeatedTags(item, "natGatewayId").filter((natGatewayId) =>
      natGatewayId.startsWith("nat-")
    );
    const relationships = [
      ...(vpcId ? [createRelationship("contains", vpcId)] : []),
      ...gatewayIds.map((gatewayId) => createRelationship("depends_on", gatewayId)),
      ...natGatewayIds.map((natGatewayId) => createRelationship("depends_on", natGatewayId))
    ];

    const routeTable: AwsDiscoveredResourceRecord = {
      providerResourceType: "AWS::EC2::RouteTable",
      providerResourceId: routeTableId,
      displayName: extractNameTag(item) ?? routeTableId,
      region,
      config: {
        associations: extractRouteTableAssociations(item),
        providerParameters: createXmlParameterSnapshot(item),
        routes: extractRouteTableRoutes(item),
        vpcId
      },
      relationships
    };

    return [
      routeTable,
      ...extractRouteTableAssociationRecords(item, routeTableId, region)
    ];
  });
}

// 같은 DescribeRouteTables 응답의 association을 별도 Resource로 만들되 gateway 원본은 노출하지 않습니다.
function extractRouteTableAssociationRecords(
  xml: string,
  routeTableId: string,
  region: string
): AwsDiscoveredResourceRecord[] {
  return extractSetItems(xml, "associationSet").map((item) => {
    const routeTableAssociationId = extractRequiredTag(item, "routeTableAssociationId");
    const subnetId = extractTag(item, "subnetId");

    return {
      providerResourceType: "AWS::EC2::RouteTableAssociation",
      providerResourceId: routeTableAssociationId,
      displayName: routeTableAssociationId,
      region,
      config: compactConfigRecord({
        routeTableAssociationId,
        subnetId,
        routeTableId,
        main: extractBooleanTag(item, "main")
      }),
      relationships: [
        ...(subnetId ? [createRelationship("attached_to", subnetId)] : []),
        createRelationship("depends_on", routeTableId)
      ]
    };
  });
}

// AWS Security Group XML을 VPC와 source Security Group 관계가 있는 Resource 후보로 바꿉니다.
export function parseSecurityGroupsFromXml(
  xml: string,
  region: string
): AwsDiscoveredResourceRecord[] {
  return extractSetItems(xml, "securityGroupInfo").map((item) => {
    const groupId = extractRequiredTag(item, "groupId");
    const vpcId = extractTag(item, "vpcId");
    const ingress = extractSecurityGroupIngressRules(item);
    const egress = extractSecurityGroupEgressRules(item);
    const sourceSecurityGroupIds = [...new Set([
      ...ingress.sourceSecurityGroupIds,
      ...egress.sourceSecurityGroupIds
    ])].filter((sourceGroupId) => sourceGroupId !== groupId);

    return {
      providerResourceType: "AWS::EC2::SecurityGroup",
      providerResourceId: groupId,
      displayName: extractTag(item, "groupName") ?? groupId,
      region,
      config: {
        groupName: extractTag(item, "groupName"),
        description: extractTag(item, "groupDescription"),
        ownerId: extractTag(item, "ownerId"),
        providerParameters: createXmlParameterSnapshot(item),
        vpcId,
        egress: egress.rules,
        ingress: ingress.rules,
        securityGroupRulesComplete: ingress.complete && egress.complete
      },
      relationships: [
        ...(vpcId ? [createRelationship("depends_on", vpcId)] : []),
        ...sourceSecurityGroupIds.map((sourceGroupId) =>
          createRelationship("depends_on", sourceGroupId)
        )
      ]
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
        providerParameters: createXmlParameterSnapshot(item),
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

// AWS RDS XML을 Subnet 포함 관계와 Security Group 연결 관계가 있는 Resource 후보로 바꿉니다.
export function parseRdsInstancesFromXml(
  xml: string,
  region: string
): AwsDiscoveredResourceRecord[] {
  return extractSetItems(xml, "DBInstances", "DBInstance").map((item) => {
    const dbInstanceId = extractRequiredTag(item, "DBInstanceIdentifier");
    const securityGroupIds = extractRepeatedTags(item, "VpcSecurityGroupId");
    const subnetIds = extractRdsSubnetIds(item);

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
        providerParameters: createXmlParameterSnapshot(item),
        storageEncrypted: extractBooleanTag(item, "StorageEncrypted"),
        storageType: extractTag(item, "StorageType"),
        subnetIds,
        vpcSecurityGroupIds: securityGroupIds
      },
      relationships: [
        ...subnetIds.map((subnetId) => createRelationship("contains", subnetId)),
        ...securityGroupIds.map((groupId) => createRelationship("attached_to", groupId))
      ]
    };
  });
}

// RDS 응답의 DBSubnetGroup 안쪽 SubnetIdentifier를 보드 포함 관계로 사용합니다.
function extractRdsSubnetIds(xml: string): string[] {
  return extractSetItems(xml, "Subnets", "Subnet")
    .map((subnet) => extractTag(subnet, "SubnetIdentifier"))
    .filter((subnetId): subnetId is string => subnetId !== null);
}

// Security Group ingress XML에서 위험 분석과 설정 표시 둘 다에 필요한 규칙 정보를 추립니다.
function extractSecurityGroupIngressRules(xml: string): SecurityGroupRuleExtraction {
  return extractSecurityGroupRules(xml, "ipPermissions");
}

// Security Group egress도 ingress와 같은 source 보존 규칙으로 추출합니다.
function extractSecurityGroupEgressRules(xml: string): SecurityGroupRuleExtraction {
  return extractSecurityGroupRules(xml, "ipPermissionsEgress");
}

// gg: source별 설명과 종류를 합치지 않아 AWS 규칙을 Terraform에서 그대로 다시 만들 수 있게 합니다.
function extractSecurityGroupRules(xml: string, setTag: string): SecurityGroupRuleExtraction {
  if (!hasXmlElement(xml, setTag)) {
    return { rules: [], complete: false, sourceSecurityGroupIds: [] };
  }

  const rules: SecurityGroupRule[] = [];
  const sourceSecurityGroupIds: string[] = [];
  let complete = true;

  for (const permission of extractSetItems(xml, setTag)) {
    const ipProtocol = extractTag(permission, "ipProtocol");
    const fromPort = extractIntegerTag(permission, "fromPort");
    const toPort = extractIntegerTag(permission, "toPort");
    const hasFromPort = hasXmlElement(permission, "fromPort");
    const hasToPort = hasXmlElement(permission, "toPort");

    if (
      !ipProtocol ||
      hasFromPort !== hasToPort ||
      (hasFromPort && (fromPort === null || toPort === null))
    ) {
      complete = false;
    }

    if (!ipProtocol) {
      continue;
    }

    const baseRule: SecurityGroupRule = {
      ipProtocol,
      ...(fromPort === null ? {} : { fromPort, port: fromPort }),
      ...(toPort === null ? {} : { toPort })
    };
    const ipv4Sources = extractSetItems(permission, "ipRanges");
    const ipv6Sources = extractSetItems(permission, "ipv6Ranges");
    const prefixListSources = extractSetItems(permission, "prefixListIds");
    const securityGroupSources = extractSetItems(permission, "groups");
    const sourceCount =
      ipv4Sources.length +
      ipv6Sources.length +
      prefixListSources.length +
      securityGroupSources.length;

    if (sourceCount === 0) {
      complete = false;
    }

    for (const source of ipv4Sources) {
      const cidr = extractTag(source, "cidrIp");
      if (!cidr) {
        complete = false;
        continue;
      }
      rules.push(compactSecurityGroupRule({
        ...baseRule,
        cidr,
        cidrBlocks: [cidr],
        description: extractTag(source, "description") ?? undefined
      }));
    }

    for (const source of ipv6Sources) {
      const cidr = extractTag(source, "cidrIpv6");
      if (!cidr) {
        complete = false;
        continue;
      }
      rules.push(compactSecurityGroupRule({
        ...baseRule,
        ipv6CidrBlocks: [cidr],
        description: extractTag(source, "description") ?? undefined
      }));
    }

    for (const source of prefixListSources) {
      const prefixListId = extractTag(source, "prefixListId");
      if (!prefixListId) {
        complete = false;
        continue;
      }
      rules.push(compactSecurityGroupRule({
        ...baseRule,
        prefixListIds: [prefixListId],
        description: extractTag(source, "description") ?? undefined
      }));
    }

    for (const source of securityGroupSources) {
      const sourceSecurityGroupId = extractTag(source, "groupId");
      if (!sourceSecurityGroupId) {
        complete = false;
        continue;
      }
      sourceSecurityGroupIds.push(sourceSecurityGroupId);
      rules.push(compactSecurityGroupRule({
        ...baseRule,
        securityGroups: [sourceSecurityGroupId],
        description: extractTag(source, "description") ?? undefined,
        sourceSecurityGroupName: extractTag(source, "groupName") ?? undefined,
        sourceSecurityGroupOwnerId: extractTag(source, "userId") ?? undefined,
        sourceSecurityGroupVpcId: extractTag(source, "vpcId") ?? undefined,
        sourceSecurityGroupVpcPeeringConnectionId:
          extractTag(source, "vpcPeeringConnectionId") ?? undefined
      }));
    }
  }

  return {
    rules,
    complete,
    sourceSecurityGroupIds: [...new Set(sourceSecurityGroupIds)]
  };
}

// gg: source metadata의 빈 선택값만 제거하고 protocol -1의 port 생략은 그대로 보존합니다.
function compactSecurityGroupRule(rule: SecurityGroupRule): SecurityGroupRule {
  return Object.fromEntries(
    Object.entries(rule).filter(([, value]) => value !== undefined && value !== "")
  ) as SecurityGroupRule;
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

// AWS XML 원본을 그대로 내보내지 않고, key/value 객체로 정리해서 전체 설정 확인용으로 보관합니다.
function createXmlParameterSnapshot(xml: string): Record<string, ProviderParameterValue> {
  return parseXmlChildren(xml);
}

// XML 하위 태그를 같은 이름끼리 모아 일반 객체 값으로 바꿉니다.
function parseXmlChildren(xml: string): Record<string, ProviderParameterValue> {
  const result: Record<string, ProviderParameterValue[]> = {};
  let searchIndex = 0;

  while (searchIndex < xml.length) {
    const openTagMatch = /<([A-Za-z0-9_.:-]+)>/g;
    openTagMatch.lastIndex = searchIndex;
    const match = openTagMatch.exec(xml);

    if (!match?.[1]) {
      break;
    }

    const tagName = match[1];
    const openTag = `<${tagName}>`;
    const closeTag = `</${tagName}>`;
    const bodyStartIndex = match.index + openTag.length;
    const bodyEndIndex = findMatchingElementEndIndex(xml, bodyStartIndex, openTag, closeTag);
    const body = xml.slice(bodyStartIndex, bodyEndIndex);
    const value = hasDirectXmlChildren(body) ? parseXmlChildren(body) : unescapeXml(body);
    result[tagName] = [...(result[tagName] ?? []), value];
    searchIndex = bodyEndIndex + closeTag.length;
  }

  return Object.entries(result).reduce<Record<string, ProviderParameterValue>>(
    (snapshot, [key, values]) => ({
      ...snapshot,
      [key]: values.length === 1 ? values[0] ?? "" : values
    }),
    {}
  );
}

// 문자열 안에 바로 읽을 수 있는 XML 자식 태그가 있는지 확인합니다.
function hasDirectXmlChildren(xml: string): boolean {
  return /<[A-Za-z0-9_.:-]+>/.test(xml);
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

function extractTags(xml: string): Array<{ key: string; value: string }> {
  return extractSetItems(xml, "tagSet").flatMap((item) => {
    const key = extractTag(item, "key");
    const value = extractTag(item, "value");

    return key !== null && value !== null ? [{ key, value }] : [];
  });
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

// gg: 빈 AWS 목록의 self-closing 태그도 조회 완료 근거로 인정합니다.
function hasXmlElement(xml: string, tagName: string): boolean {
  return new RegExp(`<${tagName}(?:>|\\s*/>)`).test(xml);
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
