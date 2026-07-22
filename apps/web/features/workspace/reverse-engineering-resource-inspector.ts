import type { ResourceType } from "@sketchcatch/types";

export type ReverseEngineeringInspectorCoreValue = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
};

const RESOURCE_PURPOSES: Partial<Record<ResourceType, string>> = {
  API_GATEWAY_REST_API: "외부 요청을 애플리케이션 API로 전달하는 입구입니다.",
  CLOUDWATCH_LOG_GROUP: "애플리케이션과 AWS 서비스의 실행 로그를 보관합니다.",
  CLOUDWATCH_METRIC_ALARM: "지표가 정한 기준을 넘었는지 확인하고 알림을 만듭니다.",
  CLOUDFRONT: "웹 콘텐츠와 API 응답을 사용자 가까운 위치에서 전달합니다.",
  EC2: "애플리케이션을 실행하는 가상 서버입니다.",
  ECS_CLUSTER: "컨테이너 서비스를 함께 운영하는 실행 공간입니다.",
  ECS_SERVICE: "필요한 수의 컨테이너 작업을 계속 실행합니다.",
  ECS_TASK_DEFINITION: "컨테이너 이미지와 실행 크기, 포트를 정한 실행 명세입니다.",
  EVENTBRIDGE_RULE: "시간이나 AWS 이벤트에 맞춰 정한 작업을 실행합니다.",
  IAM_INSTANCE_PROFILE: "EC2가 사용할 IAM 역할을 연결합니다.",
  IAM_POLICY: "AWS 리소스에 허용하거나 막을 작업을 정합니다.",
  IAM_ROLE: "AWS 서비스나 사용자가 맡아 사용할 권한 묶음입니다.",
  INTERNET_GATEWAY: "VPC와 인터넷 사이의 통신을 연결합니다.",
  KMS_KEY: "데이터를 암호화하고 복호화할 때 사용하는 키입니다.",
  LAMBDA: "서버를 직접 운영하지 않고 코드를 실행합니다.",
  LOAD_BALANCER: "들어온 요청을 정상 상태의 애플리케이션으로 나눠 보냅니다.",
  RDS: "애플리케이션 데이터를 저장하는 관리형 데이터베이스입니다.",
  ROUTE_TABLE: "네트워크 트래픽의 경로를 정합니다.",
  S3: "파일과 객체 데이터를 저장합니다.",
  SECURITY_GROUP: "리소스에 허용할 네트워크 통신을 제어합니다.",
  SUBNET: "VPC 안에서 리소스를 배치할 네트워크 구역입니다.",
  VPC: "AWS 리소스가 통신하는 사설 네트워크 범위입니다."
};

const CORE_VALUE_ALLOWLIST: Partial<
  Record<ResourceType, readonly [key: string, label: string][]>
> = {
  API_GATEWAY_REST_API: [
    ["name", "API 이름"],
    ["description", "설명"],
    ["disableExecuteApiEndpoint", "기본 접속 주소 차단"]
  ],
  CLOUDWATCH_LOG_GROUP: [
    ["logGroupName", "로그 그룹 이름"],
    ["retentionInDays", "로그 보관 기간"],
    ["logGroupClass", "저장 방식"]
  ],
  CLOUDWATCH_METRIC_ALARM: [
    ["alarmName", "알림 이름"],
    ["metricName", "확인할 지표"],
    ["threshold", "알림 기준값"],
    ["evaluationPeriods", "연속 확인 횟수"]
  ],
  CLOUDFRONT: [
    ["enabled", "사용 상태"],
    ["comment", "설명"]
  ],
  EC2: [
    ["instanceType", "인스턴스 유형"],
    ["placementAvailabilityZone", "Availability Zone"],
    ["privateIpAddress", "사설 IP"]
  ],
  ECS_CLUSTER: [
    ["name", "클러스터 이름"],
    ["status", "현재 상태"]
  ],
  ECS_SERVICE: [
    ["name", "서비스 이름"],
    ["desiredCount", "실행 중인 작업 수"],
    ["launchType", "실행 방식"]
  ],
  ECS_TASK_DEFINITION: [
    ["family", "작업 정의 이름"],
    ["cpu", "CPU"],
    ["memory", "메모리"],
    ["networkMode", "네트워크 방식"]
  ],
  EVENTBRIDGE_RULE: [
    ["name", "규칙 이름"],
    ["state", "현재 상태"],
    ["scheduleExpression", "실행 일정"]
  ],
  IAM_INSTANCE_PROFILE: [
    ["instanceProfileName", "프로필 이름"],
    ["roleNames", "연결된 역할"]
  ],
  IAM_POLICY: [
    ["policyName", "정책 이름"],
    ["description", "설명"],
    ["attachmentCount", "연결된 대상 수"]
  ],
  IAM_ROLE: [
    ["roleName", "역할 이름"],
    ["description", "설명"],
    ["maxSessionDuration", "최대 사용 시간"]
  ],
  INTERNET_GATEWAY: [],
  KMS_KEY: [
    ["description", "설명"],
    ["keyManager", "관리 주체"],
    ["keyState", "현재 상태"],
    ["keyUsage", "사용 목적"]
  ],
  LAMBDA: [
    ["functionName", "함수 이름"],
    ["runtime", "실행 환경"],
    ["memorySize", "메모리"],
    ["timeout", "제한 시간"]
  ],
  LOAD_BALANCER: [
    ["name", "로드 밸런서 이름"],
    ["scheme", "접속 범위"],
    ["ipAddressType", "IP 방식"]
  ],
  RDS: [
    ["dbInstanceClass", "DB 인스턴스 유형"],
    ["engine", "DB 엔진"],
    ["availabilityZone", "Availability Zone"],
    ["dbName", "DB 이름"]
  ],
  ROUTE_TABLE: [],
  S3: [
    ["bucketRegion", "Bucket 리전"],
    ["versioningStatus", "버전 관리"],
    ["websiteIndexDocument", "웹 사이트 문서"]
  ],
  SECURITY_GROUP: [
    ["groupName", "보안 그룹 이름"],
    ["description", "설명"]
  ],
  SUBNET: [
    ["availabilityZone", "Availability Zone"],
    ["cidrBlock", "CIDR"],
    ["availableIpAddressCount", "사용 가능 IP"]
  ],
  VPC: [
    ["cidrBlock", "CIDR"],
    ["isDefault", "기본 VPC"]
  ]
};

export function getReverseEngineeringInspectorPurpose(
  resourceType: string,
  isReviewOnly: boolean
): string {
  if (isReviewOnly) {
    return "AWS에서 찾았지만 현재 설정을 안전하게 Terraform으로 옮길 수 없는 리소스입니다. 보드에서 위치와 연결 관계를 확인할 수 있습니다.";
  }

  return RESOURCE_PURPOSES[resourceType as ResourceType] ?? "AWS에서 읽은 구성을 보드에서 검토할 수 있습니다.";
}

export function getReverseEngineeringInspectorCoreValues(
  resourceType: string,
  values: Readonly<Record<string, unknown>>
): ReverseEngineeringInspectorCoreValue[] {
  const observedValues = isRecord(values["reverseEngineeringObservedConfig"])
    ? values["reverseEngineeringObservedConfig"]
    : {};
  const visibleValues = { ...observedValues, ...values };

  return (CORE_VALUE_ALLOWLIST[resourceType as ResourceType] ?? [])
    .map(([key, label]) => ({
      key,
      label,
      value: formatMeaningfulValue(key, visibleValues[key])
    }))
    .filter(
      (value): value is ReverseEngineeringInspectorCoreValue => value.value !== null
    )
    .slice(0, 4);
}

function formatMeaningfulValue(key: string, value: unknown): string | null {
  if (key === "versioningStatus" && typeof value === "string") {
    return value === "Enabled"
      ? "사용 중"
      : value === "Suspended"
        ? "일시 중지"
        : "설정 상태 확인 필요";
  }

  if (key === "launchType" && value === "FARGATE") {
    return "Fargate";
  }

  if (key === "keyManager" && typeof value === "string") {
    return value === "CUSTOMER" ? "사용자 관리" : value === "AWS" ? "AWS 관리" : value;
  }

  if (key === "retentionInDays" && typeof value === "number") {
    return `${value}일`;
  }

  if (key === "maxSessionDuration" && typeof value === "number") {
    return `${Math.round(value / 60)}분`;
  }

  if (key === "memorySize" && typeof value === "number") {
    return `${value}MB`;
  }

  if (key === "timeout" && typeof value === "number") {
    return `${value}초`;
  }

  if (typeof value === "boolean") {
    return value ? "예" : "아니요";
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item): item is string => typeof item === "string" && item.trim().length > 0)
  ) {
    return value.slice(0, 3).join(", ");
  }

  return null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
