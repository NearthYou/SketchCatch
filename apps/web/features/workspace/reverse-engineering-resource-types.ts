import type { ResourceType, ReverseEngineeringResourceSelection } from "@sketchcatch/types";
import {
  getReverseEngineeringAwsScanSelection,
  reverseEngineeringAwsResourceTypes,
  reverseEngineeringAwsScanResourceTypes
} from "@sketchcatch/types/resource-definitions";

export const REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION =
  "ALL" satisfies ReverseEngineeringResourceSelection;

export const REVERSE_ENGINEERING_RESOURCE_TYPES: ResourceType[] = [
  ...reverseEngineeringAwsResourceTypes
];

export const REVERSE_ENGINEERING_REQUEST_RESOURCE_TYPES: ResourceType[] = [
  ...reverseEngineeringAwsScanResourceTypes
];

export const REVERSE_ENGINEERING_RESOURCE_SELECTIONS: ReverseEngineeringResourceSelection[] = [
  REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION,
  ...REVERSE_ENGINEERING_RESOURCE_TYPES
];

const RESOURCE_SELECTION_LABELS: Readonly<Partial<Record<ResourceType, string>>> = {
  VPC: "네트워크(VPC)",
  SUBNET: "서브넷",
  INTERNET_GATEWAY: "인터넷 게이트웨이",
  ROUTE_TABLE: "라우팅 테이블",
  ROUTE_TABLE_ASSOCIATION: "서브넷 경로 연결",
  NETWORK_ACL: "네트워크 접근 목록",
  NETWORK_ACL_RULE: "네트워크 접근 규칙",
  ELASTIC_IP: "고정 공인 IP",
  NAT_GATEWAY: "NAT 게이트웨이",
  VPC_ENDPOINT: "VPC 내부 서비스 연결",
  VPC_PEERING_CONNECTION: "VPC 간 연결",
  SECURITY_GROUP: "보안 그룹",
  EC2: "가상 서버(EC2)",
  KEY_PAIR: "서버 접속 키",
  LAUNCH_TEMPLATE: "서버 실행 템플릿",
  AUTO_SCALING_GROUP: "서버 자동 확장 그룹",
  AUTO_SCALING_POLICY: "서버 자동 확장 기준",
  RDS: "데이터베이스(RDS)",
  RDS_CLUSTER: "데이터베이스 클러스터",
  RDS_CLUSTER_INSTANCE: "클러스터 데이터베이스",
  DB_SUBNET_GROUP: "데이터베이스 서브넷 묶음",
  DYNAMODB_TABLE: "DynamoDB 테이블",
  ELASTICACHE_REDIS: "Redis 캐시",
  ELASTICACHE_SUBNET_GROUP: "캐시 서브넷 묶음",
  ELASTICACHE_PARAMETER_GROUP: "캐시 설정 묶음",
  S3: "파일 저장소(S3)",
  EBS_VOLUME: "서버 디스크(EBS)",
  VOLUME_ATTACHMENT: "서버 디스크 연결",
  EFS_FILE_SYSTEM: "공유 파일 저장소(EFS)",
  EFS_MOUNT_TARGET: "공유 파일 연결 지점",
  EFS_ACCESS_POINT: "공유 파일 접근 지점",
  LAMBDA: "Lambda 함수",
  LAMBDA_PERMISSION: "Lambda 호출 권한",
  LAMBDA_ALIAS: "Lambda 버전 별칭",
  LAMBDA_EVENT_SOURCE_MAPPING: "Lambda 이벤트 연결",
  IAM_ROLE: "IAM 역할",
  IAM_POLICY: "IAM 정책",
  IAM_INSTANCE_PROFILE: "EC2용 IAM 프로필",
  KMS_KEY: "암호화 키(KMS)",
  KMS_ALIAS: "암호화 키 별칭",
  API_GATEWAY_REST_API: "API 입구(API Gateway)",
  API_GATEWAY_AUTHORIZER: "API 인증 설정",
  API_GATEWAY_WEBSOCKET_API: "실시간 API 입구",
  API_GATEWAY_RESOURCE: "API 경로",
  API_GATEWAY_METHOD: "API 요청 방식",
  API_GATEWAY_INTEGRATION: "API 백엔드 연결",
  API_GATEWAY_DEPLOYMENT: "API 배포본",
  API_GATEWAY_STAGE: "API 배포 환경",
  API_GATEWAY_V2_ROUTE: "실시간 API 경로",
  API_GATEWAY_V2_INTEGRATION: "실시간 API 백엔드 연결",
  API_GATEWAY_V2_STAGE: "실시간 API 배포 환경",
  SNS_TOPIC: "알림 주제(SNS)",
  SNS_TOPIC_SUBSCRIPTION: "알림 구독",
  SQS_QUEUE: "메시지 대기열(SQS)",
  STEP_FUNCTIONS_STATE_MACHINE: "작업 흐름(Step Functions)",
  EVENTBRIDGE_RULE: "이벤트 규칙(EventBridge)",
  EVENTBRIDGE_TARGET: "이벤트 대상(EventBridge)",
  EVENTBRIDGE_PERMISSION: "이벤트 버스 권한",
  SCHEDULER_SCHEDULE: "예약 실행",
  CODEBUILD_PROJECT: "코드 빌드 프로젝트",
  CODEDEPLOY_APP: "코드 배포 앱",
  CODEDEPLOY_DEPLOYMENT_GROUP: "코드 배포 그룹",
  CODEPIPELINE: "배포 파이프라인",
  CODESTAR_CONNECTION: "외부 코드 저장소 연결",
  CLOUDWATCH_LOG_GROUP: "로그 저장소(CloudWatch)",
  CLOUDWATCH_LOG_STREAM: "로그 흐름(CloudWatch)",
  CLOUDWATCH_LOG_RESOURCE_POLICY: "로그 접근 정책",
  CLOUDWATCH_METRIC_ALARM: "지표 알림(CloudWatch)",
  CLOUDWATCH_DASHBOARD: "모니터링 대시보드",
  LOAD_BALANCER: "애플리케이션 로드 밸런서(ALB)",
  LOAD_BALANCER_TARGET_GROUP: "로드 밸런서 대상 그룹",
  LOAD_BALANCER_TARGET_GROUP_ATTACHMENT: "로드 밸런서 대상 연결",
  LOAD_BALANCER_LISTENER: "로드 밸런서 요청 연결",
  CLOUDFRONT: "콘텐츠 전송(CloudFront)",
  ROUTE53_ZONE: "도메인 영역(Route 53)",
  ROUTE53_RECORD: "도메인 연결 정보",
  WAF_WEB_ACL: "웹 방화벽(WAF)",
  WAF_WEB_ACL_ASSOCIATION: "웹 방화벽 연결",
  ACM_CERTIFICATE: "HTTPS 인증서",
  ACM_CERTIFICATE_VALIDATION: "HTTPS 인증서 확인",
  ECR_REPOSITORY: "컨테이너 이미지 저장소(ECR)",
  ECR_LIFECYCLE_POLICY: "컨테이너 이미지 정리 규칙",
  SECRETS_MANAGER_SECRET: "보안 값 저장소",
  ECS_CLUSTER: "컨테이너 클러스터(ECS)",
  ECS_SERVICE: "컨테이너 서비스(ECS)",
  ECS_CAPACITY_PROVIDER: "컨테이너 실행 용량 공급자",
  APPLICATION_AUTO_SCALING_TARGET: "자동 확장 범위",
  APPLICATION_AUTO_SCALING_POLICY: "자동 확장 기준",
  ECS_TASK_DEFINITION: "컨테이너 작업 정의(ECS)",
  EKS_CLUSTER: "Kubernetes 클러스터(EKS)",
  EKS_NODE_GROUP: "Kubernetes 서버 그룹",
  EKS_FARGATE_PROFILE: "Kubernetes Fargate 설정",
  EKS_ADDON: "Kubernetes 추가 기능",
  COGNITO_USER_POOL: "사용자 계정 저장소(Cognito)",
  COGNITO_USER_POOL_CLIENT: "사용자 로그인 앱",
  AMPLIFY_APP: "웹 앱 배포(Amplify)",
  CONFIG_CONFIGURATION_RECORDER: "AWS 설정 변경 기록",
  CONFIG_DELIVERY_CHANNEL: "AWS 설정 기록 저장 위치",
  CONFIG_RULE: "AWS 설정 검사 규칙",
  CLOUDTRAIL: "AWS 작업 기록(CloudTrail)",
  XRAY_GROUP: "요청 추적 그룹(X-Ray)",
  XRAY_SAMPLING_RULE: "요청 추적 수집 규칙",
  SHIELD_PROTECTION: "DDoS 보호(Shield)",
  GUARDDUTY_DETECTOR: "위협 탐지(GuardDuty)",
  UNKNOWN: "보드에만 표시하는 AWS 리소스"
};

/** gg: API 선택값을 사용자가 이해할 수 있는 AWS 기능 이름으로 표시합니다. */
export function formatReverseEngineeringResourceSelectionLabel(
  resourceType: ReverseEngineeringResourceSelection
): string {
  return resourceType === REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION
    ? "전체"
    : formatReverseEngineeringResourceTypeLabel(resourceType);
}

/** gg: 하위 구성은 자체 이름과 함께 어느 상위 AWS family에서 읽는지 알려 줍니다. */
export function formatReverseEngineeringResourceTypeLabel(resourceType: ResourceType): string {
  const label =
    RESOURCE_SELECTION_LABELS[resourceType] ?? formatTechnicalResourceType(resourceType);
  const scanSelection = getReverseEngineeringAwsScanSelection(resourceType);

  return scanSelection && scanSelection !== resourceType
    ? `${label} · ${formatBaseReverseEngineeringResourceTypeLabel(scanSelection)}과 함께`
    : label;
}

/** gg: 전체 조회와 개별 조회의 차이를 쉬운 안내 문장으로 표시합니다. */
export function getReverseEngineeringSelectionHelp(
  selection: ReverseEngineeringResourceSelection
): string {
  if (selection === REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION) {
    return "지원되는 AWS 리소스와 추가 확인이 필요한 리소스를 함께 읽습니다.";
  }

  const scanSelection = getReverseEngineeringAwsScanSelection(selection);

  return scanSelection && scanSelection !== selection
    ? `${formatBaseReverseEngineeringResourceTypeLabel(scanSelection)}를 가져올 때 함께 읽습니다.`
    : "선택한 AWS 리소스를 읽습니다.";
}

/** gg: 상위 family 하나를 선택해도 함께 읽는 하위 구성이 화면에서 선택된 상태로 보이게 합니다. */
export function isReverseEngineeringResourceSelectionChecked(
  selectedResourceTypes: readonly ReverseEngineeringResourceSelection[],
  resourceType: ReverseEngineeringResourceSelection
): boolean {
  const selectedScanResourceTypes =
    normalizeReverseEngineeringScanSelections(selectedResourceTypes);

  if (resourceType === REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION) {
    return (
      selectedResourceTypes.includes(REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION) ||
      REVERSE_ENGINEERING_REQUEST_RESOURCE_TYPES.every((selectedResourceType) =>
        selectedScanResourceTypes.includes(selectedResourceType)
      )
    );
  }

  const scanSelection = getReverseEngineeringAwsScanSelection(resourceType) ?? resourceType;

  return (
    selectedResourceTypes.includes(REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION) ||
    selectedScanResourceTypes.includes(scanSelection)
  );
}

/** gg: 하위 구성 선택을 상위 family 요청으로 합쳐 같은 AWS reader를 중복 실행하지 않게 합니다. */
export function getNextReverseEngineeringResourceSelections(
  currentResourceTypes: readonly ReverseEngineeringResourceSelection[],
  resourceType: ReverseEngineeringResourceSelection
): ReverseEngineeringResourceSelection[] {
  if (resourceType === REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION) {
    return isReverseEngineeringResourceSelectionChecked(currentResourceTypes, resourceType)
      ? []
      : [REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION];
  }

  const scanSelection = getReverseEngineeringAwsScanSelection(resourceType) ?? resourceType;
  const currentExplicitResourceTypes = currentResourceTypes.includes(
    REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION
  )
    ? REVERSE_ENGINEERING_REQUEST_RESOURCE_TYPES
    : normalizeReverseEngineeringScanSelections(currentResourceTypes);
  const nextResourceTypes = currentExplicitResourceTypes.includes(scanSelection)
    ? currentExplicitResourceTypes.filter(
        (currentResourceType) => currentResourceType !== scanSelection
      )
    : [...currentExplicitResourceTypes, scanSelection];

  return REVERSE_ENGINEERING_REQUEST_RESOURCE_TYPES.every((currentResourceType) =>
    nextResourceTypes.includes(currentResourceType)
  )
    ? [REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION]
    : REVERSE_ENGINEERING_REQUEST_RESOURCE_TYPES.filter((currentResourceType) =>
        nextResourceTypes.includes(currentResourceType)
      );
}

/** gg: API로 보낼 선택값을 catalog의 상위 scan family 순서로 중복 없이 정리합니다. */
function normalizeReverseEngineeringScanSelections(
  selections: readonly ReverseEngineeringResourceSelection[]
): ResourceType[] {
  const normalizedSelections = new Set<ResourceType>();

  for (const selection of selections) {
    if (selection === REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION) {
      continue;
    }

    normalizedSelections.add(getReverseEngineeringAwsScanSelection(selection) ?? selection);
  }

  return REVERSE_ENGINEERING_REQUEST_RESOURCE_TYPES.filter((resourceType) =>
    normalizedSelections.has(resourceType)
  );
}

/** gg: 직접 작성한 한국어 이름이 없을 때 enum 이름을 읽을 수 있는 기술 이름으로 바꿉니다. */
function formatTechnicalResourceType(resourceType: ResourceType): string {
  return resourceType
    .split("_")
    .map((segment) =>
      [
        "ACL",
        "API",
        "AWS",
        "DB",
        "EBS",
        "EC2",
        "ECS",
        "EFS",
        "EKS",
        "IAM",
        "IP",
        "KMS",
        "RDS",
        "S3",
        "SNS",
        "SQS",
        "VPC",
        "WAF"
      ].includes(segment)
        ? segment
        : `${segment.charAt(0)}${segment.slice(1).toLowerCase()}`
    )
    .join(" ");
}

/** gg: 상위 family 이름은 다시 family 안내를 붙이지 않고 기본 이름만 반환합니다. */
function formatBaseReverseEngineeringResourceTypeLabel(resourceType: ResourceType): string {
  return RESOURCE_SELECTION_LABELS[resourceType] ?? formatTechnicalResourceType(resourceType);
}
