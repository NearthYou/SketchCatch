import { resourceCatalog } from "../../../features/resource-settings/catalog";
import type { SelectedAssistantOption } from "./selected-option-model";

const RESOURCE_ICON_PREFIX = "/Resource-Icons_07312025/";
export const MOBILE_ORBIT_GLYPH_COUNT = 7;
const INITIAL_RESOURCE_IDS = [
  "aws-ami",
  "aws-lambda-permission",
  "aws-rds-cluster",
  "aws-s3-bucket",
  "aws-ecs-service",
  "aws-internet-gateway",
  "aws-sqs-queue",
  "aws-iam-role",
  "aws-cloudwatch-log-group",
  "aws-dynamodb-global-table"
] as const;

export type OrbitResourceCategory =
  | "serverless"
  | "compute"
  | "database"
  | "storage"
  | "container"
  | "network"
  | "messaging"
  | "security"
  | "observability";

const CATEGORY_ORDER: readonly OrbitResourceCategory[] = [
  "serverless",
  "compute",
  "database",
  "storage",
  "container",
  "network",
  "messaging",
  "security",
  "observability"
];

const CATEGORY_RESOURCE_IDS: Readonly<Record<OrbitResourceCategory, readonly string[]>> = {
  serverless: [
    "aws-lambda-permission",
    "aws-lambda-event-source-mapping",
    "aws-lambda-alias",
    "aws-api-gateway-resource",
    "aws-api-gateway-v2-route",
    "aws-dynamodb-global-table",
    "aws-eventbridge-rule",
    "aws-sqs-queue"
  ],
  compute: [
    "aws-ami",
    "aws-eip",
    "aws-autoscaling-policy",
    "aws-launch-configuration",
    "aws-lb-target-group",
    "aws-lb-listener",
    "aws-network-interface",
    "aws-elastic-beanstalk-environment"
  ],
  database: [
    "aws-rds-cluster",
    "aws-rds-cluster-instance",
    "aws-dynamodb-global-table",
    "aws-elasticache-redis"
  ],
  storage: [
    "aws-s3-bucket",
    "aws-s3-object",
    "aws-s3-lifecycle",
    "aws-s3-bucket-object",
    "aws-s3-bucket-replication-configuration",
    "aws-efs-file-system",
    "aws-volume-attachment"
  ],
  container: [
    "aws-ecr-repository",
    "aws-ecr-lifecycle-policy",
    "aws-ecs-service",
    "aws-ecs-task-definition",
    "aws-appautoscaling-target",
    "aws-appautoscaling-policy",
    "aws-lb-target-group"
  ],
  network: [
    "aws-internet-gateway",
    "aws-nat-gateway",
    "aws-vpc-endpoint",
    "aws-route-table",
    "aws-route53-zone",
    "aws-network-interface",
    "aws-lb-listener",
    "aws-vpc-peering-connection"
  ],
  messaging: [
    "aws-sqs-queue",
    "aws-sns-topic",
    "aws-sns-topic-subscription",
    "aws-eventbridge-rule",
    "aws-scheduler-schedule",
    "aws-ses-email-identity"
  ],
  security: [
    "aws-security-group",
    "aws-security-group-rule",
    "aws-iam-role",
    "aws-iam-policy",
    "aws-network-acl",
    "aws-network-acl-rule",
    "aws-waf-rule"
  ],
  observability: [
    "aws-cloudwatch-log-group",
    "aws-cloudwatch-log-stream",
    "aws-cloudwatch-metric-alarm",
    "aws-flow-log",
    "aws-ssm-parameter"
  ]
};

const CATEGORY_HINTS: Readonly<Record<OrbitResourceCategory, readonly RegExp[]>> = {
  serverless: [/서버리스/u, /관리\s*최소/u, /lambda|람다|api\s*gateway|dynamodb|다이나모/iu],
  compute: [/직접\s*서버|세밀한\s*제어|가상\s*서버|ec2|인스턴스/iu],
  database: [/관계형|데이터베이스|database|\brds\b|aurora|오로라|\bdb\b/iu],
  storage: [/파일\s*저장|정적\s*웹|object\s*storage|스토리지|\bs3\b|파일/iu],
  container: [/컨테이너|container|docker|도커|fargate|파게이트|\becs\b|\becr\b/iu],
  network: [/네트워크|network|\bvpc\b|load\s*balancer|로드\s*밸런서|\balb\b|cdn|cloudfront/iu],
  messaging: [/메시지|messag|queue|큐|\bsqs\b|\bsns\b|eventbridge|이벤트브리지/iu],
  security: [/보안|security|권한|iam|방화벽|firewall|\bwaf\b/iu],
  observability: [/관측|모니터링|observability|monitoring|로그|cloudwatch|alarm|알람/iu]
};

export type DecorativeOrbitResource = {
  readonly category: OrbitResourceCategory;
  readonly iconUrl: string;
  readonly resourceId: string;
};

export type DecorativeOrbitGlyph = DecorativeOrbitResource & {
  readonly angle: number;
  readonly orbitLayer: 0 | 1 | 2;
  readonly sizeScale: number;
};

export type DecorativeOrbitComposition = {
  readonly fingerprint: string;
  readonly glyphs: readonly DecorativeOrbitGlyph[];
  readonly responseGlyphIndex: number | null;
};

const DECORATIVE_RESOURCE_POOL: readonly DecorativeOrbitResource[] = resourceCatalog
  .filter(
    (item) =>
      item.enabled !== false &&
      item.id.startsWith("aws-") &&
      item.iconUrl.startsWith(RESOURCE_ICON_PREFIX)
  )
  .map((item) => ({
    category: getResourceCategory(item.id),
    iconUrl: item.iconUrl,
    resourceId: item.id
  }));

const RESOURCE_BY_ID = new Map(
  DECORATIVE_RESOURCE_POOL.map((resource) => [resource.resourceId, resource])
);

export function getDecorativeOrbitResourcePool(): readonly DecorativeOrbitResource[] {
  return DECORATIVE_RESOURCE_POOL;
}

export function getOptionResourceCategories(label: string): readonly OrbitResourceCategory[] {
  return CATEGORY_ORDER.filter((category) =>
    CATEGORY_HINTS[category].some((pattern) => pattern.test(label))
  );
}

export function createDecorativeOrbitComposition(
  selections: readonly SelectedAssistantOption[]
): DecorativeOrbitComposition {
  let resources = INITIAL_RESOURCE_IDS.map(getRequiredResource);

  for (let selectionIndex = 0; selectionIndex < selections.length; selectionIndex += 1) {
    const selection = selections[selectionIndex];
    if (!selection) continue;

    const accumulatedLabels = selections
      .slice(0, selectionIndex + 1)
      .map(({ label }) => label)
      .join("\u001f");
    resources = replaceCompositionResources(resources, selection.label, accumulatedLabels);
  }

  const fingerprint =
    selections.length === 0
      ? "initial"
      : stableHash(selections.map(({ label }) => label).join("\u001f"));

  return {
    fingerprint,
    glyphs: resources.map((resource, index) => ({
      ...resource,
      angle: normalizeAngle(
        index * (360 / resources.length) +
          (stableNumber(`${fingerprint}:${resource.resourceId}`) % 24) -
          12
      ),
      orbitLayer: (index % 3) as 0 | 1 | 2,
      sizeScale: 0.88 + (stableNumber(`${resource.resourceId}:${fingerprint}:size`) % 19) / 100
    })),
    responseGlyphIndex:
      selections.length === 0
        ? null
        : stableNumber(`${fingerprint}:response`) %
          Math.min(MOBILE_ORBIT_GLYPH_COUNT, resources.length)
  };
}

function replaceCompositionResources(
  current: readonly DecorativeOrbitResource[],
  latestLabel: string,
  accumulatedLabels: string
): DecorativeOrbitResource[] {
  const categories = getOptionResourceCategories(latestLabel);
  const replacementCount = 2 + (stableNumber(`${accumulatedLabels}:count`) % 3);
  const targetCategorySet = new Set(categories);
  const positions = current
    .map((resource, index) => ({
      index,
      isPreferredReplacement: categories.length === 0 || !targetCategorySet.has(resource.category),
      rank: stableNumber(`${accumulatedLabels}:position:${index}`)
    }))
    .sort(
      (left, right) =>
        Number(right.isPreferredReplacement) - Number(left.isPreferredReplacement) ||
        left.rank - right.rank ||
        left.index - right.index
    )
    .slice(0, replacementCount)
    .map(({ index }) => index);
  const preferredPool = getPreferredPool(categories);
  const next = [...current];

  positions.forEach((position, replacementIndex) => {
    const replacement = pickReplacement(
      next,
      position,
      preferredPool,
      `${accumulatedLabels}:candidate:${replacementIndex}`
    );
    next[position] = replacement;
  });

  return next;
}

function getPreferredPool(
  categories: readonly OrbitResourceCategory[]
): readonly DecorativeOrbitResource[] {
  if (categories.length === 0) {
    return DECORATIVE_RESOURCE_POOL;
  }

  return uniqueResources(
    categories.flatMap((category) =>
      CATEGORY_RESOURCE_IDS[category]
        .map((resourceId) => RESOURCE_BY_ID.get(resourceId))
        .filter((resource): resource is DecorativeOrbitResource => resource !== undefined)
    )
  );
}

function pickReplacement(
  current: readonly DecorativeOrbitResource[],
  position: number,
  preferredPool: readonly DecorativeOrbitResource[],
  seed: string
): DecorativeOrbitResource {
  const currentIds = new Set(current.map(({ resourceId }) => resourceId));
  const currentIconUrls = new Set(current.map(({ iconUrl }) => iconUrl));

  return (
    findSeededCandidate(preferredPool, seed, currentIds, currentIconUrls) ??
    findSeededCandidate(DECORATIVE_RESOURCE_POOL, seed, currentIds, currentIconUrls) ??
    findSeededCandidate(preferredPool, seed, currentIds) ??
    findSeededCandidate(DECORATIVE_RESOURCE_POOL, seed, currentIds) ??
    current[position] ??
    getRequiredResource(INITIAL_RESOURCE_IDS[0])
  );
}

function findSeededCandidate(
  pool: readonly DecorativeOrbitResource[],
  seed: string,
  excludedIds: ReadonlySet<string>,
  excludedIconUrls: ReadonlySet<string> = new Set()
): DecorativeOrbitResource | undefined {
  if (pool.length === 0) return undefined;

  const startIndex = stableNumber(seed) % pool.length;
  for (let offset = 0; offset < pool.length; offset += 1) {
    const candidate = pool[(startIndex + offset) % pool.length];
    if (
      candidate &&
      !excludedIds.has(candidate.resourceId) &&
      !excludedIconUrls.has(candidate.iconUrl)
    ) {
      return candidate;
    }
  }

  return undefined;
}

function uniqueResources(resources: readonly DecorativeOrbitResource[]): DecorativeOrbitResource[] {
  return [...new Map(resources.map((resource) => [resource.resourceId, resource])).values()];
}

function getRequiredResource(resourceId: string): DecorativeOrbitResource {
  const resource = RESOURCE_BY_ID.get(resourceId);
  if (!resource) {
    throw new Error(`Decorative Orbit catalog resource is unavailable: ${resourceId}`);
  }
  return resource;
}

function getResourceCategory(resourceId: string): OrbitResourceCategory {
  return (
    CATEGORY_ORDER.find((category) => CATEGORY_RESOURCE_IDS[category].includes(resourceId)) ??
    "network"
  );
}

function normalizeAngle(value: number): number {
  return ((value % 360) + 360) % 360;
}

function stableHash(value: string): string {
  return stableNumber(value).toString(36);
}

function stableNumber(value: string): number {
  let hash = 2_166_136_261;

  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }

  return hash;
}
