import { createHash } from "node:crypto";
import {
  GetInstanceProfileCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
  GetRoleCommand,
  GetRolePolicyCommand,
  IAMClient,
  ListAttachedRolePoliciesCommand,
  ListInstanceProfilesCommand,
  ListInstanceProfileTagsCommand,
  ListPoliciesCommand,
  ListPolicyTagsCommand,
  ListRolePoliciesCommand,
  ListRolesCommand,
  ListRoleTagsCommand,
  type GetInstanceProfileCommandOutput,
  type GetPolicyCommandOutput,
  type GetPolicyVersionCommandOutput,
  type GetRoleCommandOutput,
  type GetRolePolicyCommandOutput,
  type AttachedPolicy,
  type InstanceProfile,
  type ListAttachedRolePoliciesCommandOutput,
  type ListInstanceProfilesCommandOutput,
  type ListPoliciesCommandOutput,
  type ListPolicyTagsCommandOutput,
  type ListRolePoliciesCommandOutput,
  type ListRolesCommandOutput,
  type ListRoleTagsCommandOutput,
  type Policy,
  type Role,
  type Tag
} from "@aws-sdk/client-iam";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";
import type { AwsDiscoveredResourceRecord } from "./aws-provider-adapter.js";

export type AwsIamDetailReadClient = {
  send(command: object): Promise<unknown>;
};

export type AwsIamDetailReadClientFactory = (
  region: string,
  credentials: TerraformAwsCredentialEnv
) => AwsIamDetailReadClient;

export type AwsReverseEngineeringDetailFailureOutcome =
  | "permission_denied"
  | "expired_credential"
  | "invalid_region"
  | "not_configured"
  | "throttled"
  | "transient";

export type AwsReverseEngineeringDetailFailure = {
  readonly providerResourceType: string;
  readonly providerResourceId?: string;
  readonly detail: string;
  readonly outcome: AwsReverseEngineeringDetailFailureOutcome;
};

export type AwsIamReverseEngineeringOwnership = "customer" | "aws_managed" | "sketchcatch_managed";

export type AwsIamServerOnlyDetail = {
  readonly providerResourceId: string;
  readonly resourceKind:
    | "role"
    | "managed_policy"
    | "inline_policy"
    | "role_policy_attachment"
    | "instance_profile";
  readonly terraformImportId: string;
  readonly resourceArn?: string;
  readonly parentRoleArn?: string;
  readonly roleName?: string;
  readonly policyArn?: string;
  readonly attachedPolicyArns?: readonly string[];
  readonly permissionsBoundaryArn?: string;
  readonly roleArns?: readonly string[];
  readonly tags?: readonly IamTag[];
  readonly trustPolicyDocument?: unknown;
  readonly policyDocument?: unknown;
};

export type AwsDetailedIamReadResult = {
  readonly records: AwsDiscoveredResourceRecord[];
  readonly serverOnlyDetails: AwsIamServerOnlyDetail[];
  readonly failures: AwsReverseEngineeringDetailFailure[];
};

type SafePageResult<T> = {
  readonly items: T[];
  readonly complete: boolean;
  readonly failureOutcome?: AwsReverseEngineeringDetailFailureOutcome;
};

type IamTag = {
  readonly key: string;
  readonly value: string;
};

type RoleReadResult = {
  readonly records: AwsDiscoveredResourceRecord[];
  readonly serverOnlyDetails: AwsIamServerOnlyDetail[];
  readonly failures: AwsReverseEngineeringDetailFailure[];
};

const SKETCHCATCH_ROLE_NAME_PATTERNS = [
  /^SketchCatchTerraformExecutionRole(?:-[a-f0-9]{8})?$/iu,
  /^SketchCatchReverseEngineeringReadRole(?:-[a-f0-9]{8})?$/iu,
  /^SketchCatchCodeBuild-[a-f0-9]{8}$/iu,
  /^SketchCatchImport(?:Cfn|Read|Control|Cleanup|PolicyLifecycle)-[a-f0-9]{16}$/iu
] as const;

const SKETCHCATCH_POLICY_NAME_PATTERNS = [
  /^SketchCatchCodeBuildBoundary(?:-[a-f0-9]{8})?$/iu,
  /^SketchCatchImport(?:Cfn|Read|Control|Cleanup|PolicyLifecycle)-[a-f0-9]{16}$/iu
] as const;

const IAM_DETAIL_READ_CONCURRENCY = 8;

/**
 * gg: IAM 목록과 모든 관리 판단에 필요한 상세를 함께 읽되, 문서 원문은 별도 서버 전용 결과에만 둡니다.
 */
export async function readDetailedIamResources(
  region: string,
  credentials: TerraformAwsCredentialEnv,
  createClient: AwsIamDetailReadClientFactory = createDefaultIamDetailReadClient
): Promise<AwsDetailedIamReadResult> {
  const client = createClient(region, credentials);
  const [roleInventory, policyInventory, profileInventory] = await Promise.all([
    collectSafeIamPages<Role>(async (marker) => {
      const response = await sendIam<ListRolesCommandOutput>(
        client,
        new ListRolesCommand({ Marker: marker })
      );
      return toIamPage(response.Roles, response.Marker, response.IsTruncated);
    }),
    collectSafeIamPages<Policy>(async (marker) => {
      const response = await sendIam<ListPoliciesCommandOutput>(
        client,
        new ListPoliciesCommand({ Marker: marker, Scope: "Local" })
      );
      return toIamPage(response.Policies, response.Marker, response.IsTruncated);
    }),
    collectSafeIamPages<InstanceProfile>(async (marker) => {
      const response = await sendIam<ListInstanceProfilesCommandOutput>(
        client,
        new ListInstanceProfilesCommand({ Marker: marker })
      );
      return toIamPage(response.InstanceProfiles, response.Marker, response.IsTruncated);
    })
  ]);

  const detailJobs: Array<() => Promise<RoleReadResult>> = [
    ...roleInventory.items.map((role) => () => readDetailedIamRole(role, client)),
    ...policyInventory.items.map((policy) => () => readDetailedIamManagedPolicy(policy, client)),
    ...profileInventory.items.map(
      (profile) => () => readDetailedIamInstanceProfile(profile, client)
    )
  ];
  const detailResults = await mapWithConcurrency(
    detailJobs,
    IAM_DETAIL_READ_CONCURRENCY,
    (readDetail) => readDetail()
  );

  const failures: AwsReverseEngineeringDetailFailure[] = [
    ...toInventoryFailure("AWS::IAM::Role", "roleInventory", roleInventory),
    ...toInventoryFailure("AWS::IAM::Policy", "policyInventory", policyInventory),
    ...toInventoryFailure(
      "AWS::IAM::InstanceProfile",
      "instanceProfileInventory",
      profileInventory
    ),
    ...detailResults.flatMap((result) => result.failures)
  ];
  const records = [...detailResults.flatMap((result) => result.records)].map((record) =>
    addInventoryFailureToIamRecord(record, {
      roleInventoryComplete: roleInventory.complete,
      policyInventoryComplete: policyInventory.complete,
      instanceProfileInventoryComplete: profileInventory.complete
    })
  );

  return {
    records,
    serverOnlyDetails: detailResults.flatMap((result) => result.serverOnlyDetails),
    failures
  };
}

/** gg: 이름·경로·정확한 제어 태그만 사용해 고객 리소스를 넓게 오분류하지 않습니다. */
export function classifyIamReverseEngineeringOwnership(input: {
  readonly providerResourceType: string;
  readonly name: string;
  readonly path: string;
  readonly tags: readonly IamTag[];
}): AwsIamReverseEngineeringOwnership {
  if (
    input.path.startsWith("/aws-service-role/") ||
    input.path.startsWith("/aws-reserved/sso.amazonaws.com/") ||
    (input.providerResourceType === "AWS::IAM::Role" &&
      input.name.startsWith("AWSServiceRoleFor")) ||
    (input.providerResourceType === "AWS::IAM::Role" && input.name.startsWith("AWSReservedSSO_")) ||
    input.name.startsWith("AWSServiceRoleFor")
  ) {
    return "aws_managed";
  }

  const patterns =
    input.providerResourceType === "AWS::IAM::Policy"
      ? SKETCHCATCH_POLICY_NAME_PATTERNS
      : SKETCHCATCH_ROLE_NAME_PATTERNS;
  const hasSketchCatchControlTag = input.tags.some(
    (tag) =>
      tag.key.toLowerCase() === "aws:cloudformation:stack-name" &&
      /^sketchcatch-import-[a-f0-9]{16}-(?:policy|manager)$/iu.test(tag.value)
  );
  return patterns.some((pattern) => pattern.test(input.name)) || hasSketchCatchControlTag
    ? "sketchcatch_managed"
    : "customer";
}

/** gg: IAM pagination이 깨지면 앞 page는 보존하면서 완전하지 않다는 상태를 함께 반환합니다. */
async function collectSafeIamPages<T>(
  readPage: (
    marker: string | undefined
  ) => Promise<{ items: readonly T[]; nextMarker?: string | undefined }>
): Promise<SafePageResult<T>> {
  const items: T[] = [];
  const seenMarkers = new Set<string>();
  let marker: string | undefined;

  do {
    try {
      const page = await readPage(marker);
      items.push(...page.items);
      if (page.nextMarker && seenMarkers.has(page.nextMarker)) {
        return { items, complete: false, failureOutcome: "transient" };
      }
      if (page.nextMarker) seenMarkers.add(page.nextMarker);
      marker = page.nextMarker;
    } catch (error) {
      return { items, complete: false, failureOutcome: classifyAwsDetailFailure(error) };
    }
  } while (marker);

  return { items, complete: true };
}

/** gg: SDK의 IsTruncated와 Marker가 모순이면 다음 page를 추측하지 않고 실패로 닫습니다. */
function toIamPage<T>(
  items: readonly T[] | undefined,
  marker: string | undefined,
  isTruncated: boolean | undefined
): { items: readonly T[]; nextMarker?: string | undefined } {
  if (isTruncated === true && !marker) {
    const error = new Error("incomplete IAM pagination marker");
    error.name = "IncompletePagination";
    throw error;
  }
  return { items: items ?? [], nextMarker: isTruncated === true ? marker : undefined };
}

/** gg: Role의 trust, tags, inline/attached policy, profile 관계가 모두 확인돼야 관리 가능하게 표시합니다. */
async function readDetailedIamRole(
  listedRole: Role,
  client: AwsIamDetailReadClient
): Promise<RoleReadResult> {
  const roleName = nonEmptyString(listedRole.RoleName);
  const roleArn = nonEmptyString(listedRole.Arn);
  if (!roleName || !roleArn) {
    return {
      records: [],
      serverOnlyDetails: [],
      failures: [
        {
          providerResourceType: "AWS::IAM::Role",
          detail: "roleIdentity",
          outcome: "transient"
        }
      ]
    };
  }

  const getRole = await readIamDetail<GetRoleCommandOutput>(
    client,
    new GetRoleCommand({ RoleName: roleName })
  );
  const tags = await collectSafeIamPages<Tag>(async (marker) => {
    const response = await sendIam<ListRoleTagsCommandOutput>(
      client,
      new ListRoleTagsCommand({ RoleName: roleName, Marker: marker })
    );
    return toIamPage(response.Tags, response.Marker, response.IsTruncated);
  });
  const attachedPolicies = await collectSafeIamPages<AttachedPolicy>(async (marker) => {
    const response = await sendIam<ListAttachedRolePoliciesCommandOutput>(
      client,
      new ListAttachedRolePoliciesCommand({ RoleName: roleName, Marker: marker })
    );
    return toIamPage(response.AttachedPolicies, response.Marker, response.IsTruncated);
  });
  const inlinePolicyNames = await collectSafeIamPages<string>(async (marker) => {
    const response = await sendIam<ListRolePoliciesCommandOutput>(
      client,
      new ListRolePoliciesCommand({ RoleName: roleName, Marker: marker })
    );
    return toIamPage(response.PolicyNames, response.Marker, response.IsTruncated);
  });
  const inlinePolicyDetails = await Promise.all(
    inlinePolicyNames.items.map((policyName) =>
      readIamDetail<GetRolePolicyCommandOutput>(
        client,
        new GetRolePolicyCommand({ RoleName: roleName, PolicyName: policyName })
      ).then((detail) => ({ policyName, detail }))
    )
  );
  const exactRole = getRole.complete ? (getRole.value.Role ?? listedRole) : listedRole;
  const trustPolicy = decodeIamPolicyDocument(exactRole.AssumeRolePolicyDocument);
  const publicTags = toPublicIamTags(tags.items);
  const ownership = classifyIamReverseEngineeringOwnership({
    providerResourceType: "AWS::IAM::Role",
    name: roleName,
    path: exactRole.Path ?? "/",
    tags: publicTags
  });
  const attachedPolicyIdentities = attachedPolicies.items.flatMap((policy) => {
    const policyArn = nonEmptyString(policy.PolicyArn);
    const policyName = nonEmptyString(policy.PolicyName);
    return policyArn && policyName ? [{ policyArn, policyName }] : [];
  });
  const attachedPolicyIdentitiesComplete =
    attachedPolicyIdentities.length === attachedPolicies.items.length;
  const missingDetails = uniqueSorted([
    ...(getRole.complete ? [] : ["role"]),
    ...(trustPolicy.complete ? [] : ["trustPolicy"]),
    ...(tags.complete ? [] : ["tags"]),
    ...(attachedPolicies.complete ? [] : ["attachedPolicies"]),
    ...(attachedPolicyIdentitiesComplete ? [] : ["attachedPolicyIdentity"]),
    ...(inlinePolicyNames.complete ? [] : ["inlinePolicies"]),
    ...inlinePolicyDetails.flatMap(({ policyName, detail }) => {
      const decoded = detail.complete
        ? decodeIamPolicyDocument(detail.value.PolicyDocument)
        : { complete: false as const };
      return decoded.complete ? [] : [`inlinePolicy:${policyName}`];
    })
  ]);
  const attachedPolicyArns = attachedPolicyIdentities.map(({ policyArn }) => policyArn);
  const boundaryArn = nonEmptyString(exactRole.PermissionsBoundary?.PermissionsBoundaryArn);
  const roleProviderResourceId = createOpaqueAwsProviderResourceId("AWS::IAM::Role", roleArn);
  const roleRecord: AwsDiscoveredResourceRecord = {
    providerResourceType: "AWS::IAM::Role",
    providerResourceId: roleProviderResourceId,
    displayName: roleName,
    region: "global",
    config: compactRecord({
      roleName,
      path: exactRole.Path,
      description: toSafePublicString(exactRole.Description),
      maxSessionDuration: exactRole.MaxSessionDuration,
      createdAt: exactRole.CreateDate?.toISOString(),
      lastUsedAt: exactRole.RoleLastUsed?.LastUsedDate?.toISOString(),
      lastUsedRegion: exactRole.RoleLastUsed?.Region,
      ownership,
      managementReady: ownership === "customer" && missingDetails.length === 0,
      reverseEngineeringDetailsVersion: 1,
      reverseEngineeringDetailsComplete: missingDetails.length === 0,
      reverseEngineeringIncompleteDetails: missingDetails,
      trustPolicyRedacted: true,
      hasPermissionsBoundary: Boolean(boundaryArn),
      tags: publicTags,
      tagsReadComplete: tags.complete,
      attachedPolicyCount: attachedPolicyArns.length,
      inlinePolicyNames: [...inlinePolicyNames.items].sort()
    }),
    relationships: uniqueRelationships([
      ...attachedPolicyArns.map((policyArn) => ({
        type: "attached_to" as const,
        targetProviderResourceId: createOpaqueAwsProviderResourceId("AWS::IAM::Policy", policyArn)
      })),
      ...(boundaryArn
        ? [
            {
              type: "depends_on" as const,
              targetProviderResourceId: createOpaqueAwsProviderResourceId(
                "AWS::IAM::Policy",
                boundaryArn
              )
            }
          ]
        : [])
    ])
  };
  const inlineRecords = inlinePolicyDetails.flatMap(({ policyName, detail }) => {
    if (!detail.complete) return [];
    const decoded = decodeIamPolicyDocument(detail.value.PolicyDocument);
    if (!decoded.complete) return [];
    const providerResourceId = createOpaqueAwsProviderResourceId(
      "AWS::IAM::RolePolicy",
      `${roleArn}:inline-policy:${encodeURIComponent(policyName)}`
    );
    return [
      {
        providerResourceType: "AWS::IAM::RolePolicy",
        providerResourceId,
        displayName: policyName,
        region: "global",
        config: {
          policyName,
          roleName,
          ownership,
          managementReady: ownership === "customer" && missingDetails.length === 0,
          reverseEngineeringDetailsVersion: 1,
          reverseEngineeringDetailsComplete: missingDetails.length === 0,
          reverseEngineeringIncompleteDetails: missingDetails,
          policyDocumentRedacted: true
        },
        relationships: [
          { type: "depends_on" as const, targetProviderResourceId: roleProviderResourceId }
        ]
      } satisfies AwsDiscoveredResourceRecord
    ];
  });
  const attachmentRecords = attachedPolicyIdentities.map(({ policyArn, policyName }) => {
    const providerResourceId = createOpaqueAwsProviderResourceId(
      "AWS::IAM::RolePolicyAttachment",
      `${roleArn}:managed-policy:${policyArn}`
    );
    return {
      providerResourceType: "AWS::IAM::RolePolicyAttachment",
      providerResourceId,
      displayName: `${roleName} · ${policyName}`,
      region: "global",
      config: {
        roleName,
        policyName,
        ownership,
        managementReady: ownership === "customer" && missingDetails.length === 0,
        reverseEngineeringDetailsVersion: 1,
        reverseEngineeringDetailsComplete: missingDetails.length === 0,
        reverseEngineeringIncompleteDetails: missingDetails
      },
      relationships: [
        { type: "depends_on" as const, targetProviderResourceId: roleProviderResourceId },
        {
          type: "depends_on" as const,
          targetProviderResourceId: createOpaqueAwsProviderResourceId("AWS::IAM::Policy", policyArn)
        }
      ]
    } satisfies AwsDiscoveredResourceRecord;
  });
  const serverOnlyDetails: AwsIamServerOnlyDetail[] = [
    {
      providerResourceId: roleProviderResourceId,
      resourceKind: "role",
      terraformImportId: roleName,
      resourceArn: roleArn,
      attachedPolicyArns: [...attachedPolicyArns].sort(),
      tags: toExactIamTags(tags.items),
      ...(boundaryArn ? { permissionsBoundaryArn: boundaryArn } : {}),
      ...(trustPolicy.complete ? { trustPolicyDocument: trustPolicy.document } : {})
    },
    ...inlinePolicyDetails.flatMap(({ policyName, detail }) => {
      if (!detail.complete) return [];
      const decoded = decodeIamPolicyDocument(detail.value.PolicyDocument);
      return detail.complete && decoded.complete
        ? [
            {
              providerResourceId: createOpaqueAwsProviderResourceId(
                "AWS::IAM::RolePolicy",
                `${roleArn}:inline-policy:${encodeURIComponent(policyName)}`
              ),
              resourceKind: "inline_policy" as const,
              terraformImportId: `${roleName}:${policyName}`,
              parentRoleArn: roleArn,
              policyDocument: decoded.document
            }
          ]
        : [];
    }),
    ...attachedPolicyIdentities.map(({ policyArn }) => ({
      providerResourceId: createOpaqueAwsProviderResourceId(
        "AWS::IAM::RolePolicyAttachment",
        `${roleArn}:managed-policy:${policyArn}`
      ),
      resourceKind: "role_policy_attachment" as const,
      terraformImportId: `${roleName}/${policyArn}`,
      parentRoleArn: roleArn,
      roleName,
      policyArn
    }))
  ];

  return {
    records: [roleRecord, ...inlineRecords, ...attachmentRecords],
    serverOnlyDetails,
    failures: [
      ...toDetailFailure("AWS::IAM::Role", roleProviderResourceId, "role", getRole),
      ...toPageFailure("AWS::IAM::Role", roleProviderResourceId, "tags", tags),
      ...toPageFailure(
        "AWS::IAM::Role",
        roleProviderResourceId,
        "attachedPolicies",
        attachedPolicies
      ),
      ...toPageFailure(
        "AWS::IAM::Role",
        roleProviderResourceId,
        "inlinePolicies",
        inlinePolicyNames
      ),
      ...inlinePolicyDetails.flatMap(({ policyName, detail }) =>
        detail.complete
          ? decodeIamPolicyDocument(detail.value?.PolicyDocument).complete
            ? []
            : [
                createFailure(
                  "AWS::IAM::RolePolicy",
                  roleProviderResourceId,
                  `inlinePolicy:${policyName}`
                )
              ]
          : toDetailFailure(
              "AWS::IAM::RolePolicy",
              roleProviderResourceId,
              `inlinePolicy:${policyName}`,
              detail
            )
      )
    ]
  };
}

/** gg: 고객 managed Policy의 현재 기본 문서와 태그를 읽고 문서 원문은 서버에만 둡니다. */
async function readDetailedIamManagedPolicy(
  listedPolicy: Policy,
  client: AwsIamDetailReadClient
): Promise<RoleReadResult> {
  const policyArn = nonEmptyString(listedPolicy.Arn);
  const policyName = nonEmptyString(listedPolicy.PolicyName);
  if (!policyArn || !policyName) {
    return {
      records: [],
      serverOnlyDetails: [],
      failures: [
        {
          providerResourceType: "AWS::IAM::Policy",
          detail: "policyIdentity",
          outcome: "transient"
        }
      ]
    };
  }

  const policyDetail = await readIamDetail<GetPolicyCommandOutput>(
    client,
    new GetPolicyCommand({ PolicyArn: policyArn })
  );
  const exactPolicy = policyDetail.complete
    ? (policyDetail.value.Policy ?? listedPolicy)
    : listedPolicy;
  const defaultVersionId = nonEmptyString(exactPolicy.DefaultVersionId);
  const versionDetail = defaultVersionId
    ? await readIamDetail<GetPolicyVersionCommandOutput>(
        client,
        new GetPolicyVersionCommand({ PolicyArn: policyArn, VersionId: defaultVersionId })
      )
    : { complete: false as const, failureOutcome: "transient" as const };
  const document = versionDetail.complete
    ? decodeIamPolicyDocument(versionDetail.value.PolicyVersion?.Document)
    : { complete: false as const };
  const tags = await collectSafeIamPages<Tag>(async (marker) => {
    const response = await sendIam<ListPolicyTagsCommandOutput>(
      client,
      new ListPolicyTagsCommand({ PolicyArn: policyArn, Marker: marker })
    );
    return toIamPage(response.Tags, response.Marker, response.IsTruncated);
  });
  const publicTags = toPublicIamTags(tags.items);
  const ownership = classifyIamReverseEngineeringOwnership({
    providerResourceType: "AWS::IAM::Policy",
    name: policyName,
    path: exactPolicy.Path ?? "/",
    tags: publicTags
  });
  const missingDetails = uniqueSorted([
    ...(policyDetail.complete ? [] : ["policy"]),
    ...(defaultVersionId && versionDetail.complete && document.complete
      ? []
      : ["defaultPolicyDocument"]),
    ...(tags.complete ? [] : ["tags"])
  ]);
  const record: AwsDiscoveredResourceRecord = {
    providerResourceType: "AWS::IAM::Policy",
    providerResourceId: createOpaqueAwsProviderResourceId("AWS::IAM::Policy", policyArn),
    displayName: policyName,
    region: "global",
    config: compactRecord({
      policyName,
      path: exactPolicy.Path,
      description: toSafePublicString(exactPolicy.Description),
      defaultVersionId,
      attachmentCount: exactPolicy.AttachmentCount,
      permissionsBoundaryUsageCount: exactPolicy.PermissionsBoundaryUsageCount,
      isAttachable: exactPolicy.IsAttachable,
      createdAt: exactPolicy.CreateDate?.toISOString(),
      updatedAt: exactPolicy.UpdateDate?.toISOString(),
      ownership,
      managementReady: ownership === "customer" && missingDetails.length === 0,
      reverseEngineeringDetailsVersion: 1,
      reverseEngineeringDetailsComplete: missingDetails.length === 0,
      reverseEngineeringIncompleteDetails: missingDetails,
      policyDocumentRedacted: true,
      tags: publicTags,
      tagsReadComplete: tags.complete
    }),
    relationships: []
  };

  return {
    records: [record],
    serverOnlyDetails: [
      {
        providerResourceId: createOpaqueAwsProviderResourceId("AWS::IAM::Policy", policyArn),
        resourceKind: "managed_policy",
        terraformImportId: policyArn,
        resourceArn: policyArn,
        tags: toExactIamTags(tags.items),
        ...(versionDetail.complete && document.complete
          ? { policyDocument: document.document }
          : {})
      }
    ],
    failures: [
      ...toDetailFailure(
        "AWS::IAM::Policy",
        createOpaqueAwsProviderResourceId("AWS::IAM::Policy", policyArn),
        "policy",
        policyDetail
      ),
      ...(!defaultVersionId
        ? [
            createFailure(
              "AWS::IAM::Policy",
              createOpaqueAwsProviderResourceId("AWS::IAM::Policy", policyArn),
              "defaultPolicyDocument"
            )
          ]
        : toDetailFailure(
            "AWS::IAM::Policy",
            createOpaqueAwsProviderResourceId("AWS::IAM::Policy", policyArn),
            "defaultPolicyDocument",
            versionDetail
          )),
      ...(versionDetail.complete && !document.complete
        ? [
            createFailure(
              "AWS::IAM::Policy",
              createOpaqueAwsProviderResourceId("AWS::IAM::Policy", policyArn),
              "defaultPolicyDocument"
            )
          ]
        : []),
      ...toPageFailure(
        "AWS::IAM::Policy",
        createOpaqueAwsProviderResourceId("AWS::IAM::Policy", policyArn),
        "tags",
        tags
      )
    ]
  };
}

/** gg: Instance Profile의 실제 Role 관계와 태그를 확인해 추측한 연결을 만들지 않습니다. */
async function readDetailedIamInstanceProfile(
  listedProfile: InstanceProfile,
  client: AwsIamDetailReadClient
): Promise<RoleReadResult> {
  const profileArn = nonEmptyString(listedProfile.Arn);
  const profileName = nonEmptyString(listedProfile.InstanceProfileName);
  if (!profileArn || !profileName) {
    return {
      records: [],
      serverOnlyDetails: [],
      failures: [
        {
          providerResourceType: "AWS::IAM::InstanceProfile",
          detail: "instanceProfileIdentity",
          outcome: "transient"
        }
      ]
    };
  }

  const profileDetail = await readIamDetail<GetInstanceProfileCommandOutput>(
    client,
    new GetInstanceProfileCommand({ InstanceProfileName: profileName })
  );
  const exactProfile = profileDetail.complete
    ? (profileDetail.value.InstanceProfile ?? listedProfile)
    : listedProfile;
  const tags = await collectSafeIamPages<Tag>(async (marker) => {
    const response = await sendIam<{
      Tags?: Tag[];
      Marker?: string;
      IsTruncated?: boolean;
    }>(
      client,
      new ListInstanceProfileTagsCommand({
        InstanceProfileName: profileName,
        Marker: marker
      })
    );
    return toIamPage(response.Tags, response.Marker, response.IsTruncated);
  });
  const publicTags = toPublicIamTags(tags.items);
  const ownership = classifyIamReverseEngineeringOwnership({
    providerResourceType: "AWS::IAM::InstanceProfile",
    name: profileName,
    path: exactProfile.Path ?? "/",
    tags: publicTags
  });
  const missingDetails = uniqueSorted([
    ...(profileDetail.complete ? [] : ["instanceProfile"]),
    ...(tags.complete ? [] : ["tags"]),
    ...(hasSingleCompleteInstanceProfileRole(exactProfile.Roles) ? [] : ["instanceProfileRole"])
  ]);
  const completeRoles = (exactProfile.Roles ?? []).flatMap((role) => {
    const roleArn = nonEmptyString(role.Arn);
    const roleName = nonEmptyString(role.RoleName);
    return roleArn && roleName ? [{ roleArn, roleName }] : [];
  });
  const roleArns = completeRoles.map(({ roleArn }) => roleArn);
  const profileProviderResourceId = createOpaqueAwsProviderResourceId(
    "AWS::IAM::InstanceProfile",
    profileArn
  );
  const record: AwsDiscoveredResourceRecord = {
    providerResourceType: "AWS::IAM::InstanceProfile",
    providerResourceId: profileProviderResourceId,
    displayName: profileName,
    region: "global",
    config: compactRecord({
      instanceProfileName: profileName,
      path: exactProfile.Path,
      createdAt: exactProfile.CreateDate?.toISOString(),
      roleNames: completeRoles.map(({ roleName }) => roleName),
      ownership,
      managementReady: ownership === "customer" && missingDetails.length === 0,
      reverseEngineeringDetailsVersion: 1,
      reverseEngineeringDetailsComplete: missingDetails.length === 0,
      reverseEngineeringIncompleteDetails: missingDetails,
      tags: publicTags,
      tagsReadComplete: tags.complete
    }),
    relationships: roleArns.map((roleArn) => ({
      type: "depends_on",
      targetProviderResourceId: createOpaqueAwsProviderResourceId("AWS::IAM::Role", roleArn)
    }))
  };

  return {
    records: [record],
    serverOnlyDetails: [
      {
        providerResourceId: profileProviderResourceId,
        resourceKind: "instance_profile",
        terraformImportId: profileName,
        resourceArn: profileArn,
        roleArns,
        tags: toExactIamTags(tags.items)
      }
    ],
    failures: [
      ...toDetailFailure(
        "AWS::IAM::InstanceProfile",
        profileProviderResourceId,
        "instanceProfile",
        profileDetail
      ),
      ...toPageFailure("AWS::IAM::InstanceProfile", profileProviderResourceId, "tags", tags),
      ...(hasSingleCompleteInstanceProfileRole(exactProfile.Roles)
        ? []
        : [
            createFailure(
              "AWS::IAM::InstanceProfile",
              profileProviderResourceId,
              "instanceProfileRole"
            )
          ])
    ]
  };
}

/** gg: Terraform의 Instance Profile은 Role 하나만 받을 수 있으므로 누락·복수 관계를 추측하지 않습니다. */
function hasSingleCompleteInstanceProfileRole(roles: readonly Role[] | undefined): boolean {
  if (roles?.length !== 1) return false;
  return nonEmptyString(roles[0]?.Arn) !== null && nonEmptyString(roles[0]?.RoleName) !== null;
}

/** gg: 개별 상세 조회 오류는 provider 문구 없이 고정된 안전 분류만 남깁니다. */
async function readIamDetail<T>(
  client: AwsIamDetailReadClient,
  command: object
): Promise<
  | { complete: true; value: T }
  | { complete: false; failureOutcome: AwsReverseEngineeringDetailFailureOutcome }
> {
  try {
    return { complete: true, value: await sendIam<T>(client, command) };
  } catch (error) {
    return { complete: false, failureOutcome: classifyAwsDetailFailure(error) };
  }
}

/** gg: AWS 오류 원문을 버리고 사용자 데이터가 섞이지 않는 결과 코드만 유지합니다. */
function classifyAwsDetailFailure(error: unknown): AwsReverseEngineeringDetailFailureOutcome {
  const details =
    error && typeof error === "object"
      ? (error as { name?: unknown; code?: unknown; Code?: unknown; message?: unknown })
      : {};
  const text = [details.name, details.code, details.Code, details.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  if (/accessdenied|unauthorized|not authorized/u.test(text)) return "permission_denied";
  if (/expiredtoken|invalidclienttoken|unrecognizedclient/u.test(text)) {
    return "expired_credential";
  }
  if (/invalidregion|invalid region|unknownendpoint/u.test(text)) return "invalid_region";
  if (/notconfigured|not configured/u.test(text)) return "not_configured";
  if (/throttl|too many request|requestlimitexceeded/u.test(text)) return "throttled";
  return "transient";
}

/** gg: URL encoded IAM 문서를 해석하지 못하면 빈 문서로 추측하지 않고 불완전 처리합니다. */
function decodeIamPolicyDocument(
  value: unknown
): { complete: true; document: unknown } | { complete: false } {
  if (typeof value !== "string" || value.trim().length === 0) return { complete: false };
  try {
    const decoded = decodeURIComponent(value);
    return { complete: true, document: JSON.parse(decoded) as unknown };
  } catch {
    return { complete: false };
  }
}

/** gg: IAM tag의 빈 값과 ARN 값은 공개하지 않고, 정확한 태그는 server-only detail에만 둡니다. */
function toPublicIamTags(tags: readonly Tag[]): IamTag[] {
  return toExactIamTags(tags)
    .filter((tag) => !containsAwsArn(tag.key) && !containsAwsArn(tag.value))
    .sort((left, right) => left.key.localeCompare(right.key));
}

/** gg: Terraform 재현에 필요한 정확한 IAM tag는 공개 record와 분리해 서버 안에서만 보존합니다. */
function toExactIamTags(tags: readonly Tag[]): IamTag[] {
  return tags
    .flatMap((tag) => {
      const key = nonEmptyString(tag.Key);
      return key && typeof tag.Value === "string" ? [{ key, value: tag.Value }] : [];
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

/** gg: pagination 실패를 resource 원문 없이 고정된 내부 진단으로 변환합니다. */
function toPageFailure(
  providerResourceType: string,
  providerResourceId: string,
  detail: string,
  page: SafePageResult<unknown>
): AwsReverseEngineeringDetailFailure[] {
  return page.complete
    ? []
    : [
        {
          providerResourceType,
          providerResourceId,
          detail,
          outcome: page.failureOutcome ?? "transient"
        }
      ];
}

/** gg: 개별 command 실패도 안전한 detail 이름과 결과 코드만 남깁니다. */
function toDetailFailure(
  providerResourceType: string,
  providerResourceId: string,
  detail: string,
  result: { complete: boolean; failureOutcome?: AwsReverseEngineeringDetailFailureOutcome }
): AwsReverseEngineeringDetailFailure[] {
  return result.complete
    ? []
    : [
        {
          providerResourceType,
          providerResourceId,
          detail,
          outcome: result.failureOutcome ?? "transient"
        }
      ];
}

/** gg: base inventory가 끊기면 해당 종류 전체를 완전한 조회로 오인하지 않게 합니다. */
function toInventoryFailure(
  providerResourceType: string,
  detail: string,
  inventory: SafePageResult<unknown>
): AwsReverseEngineeringDetailFailure[] {
  return inventory.complete
    ? []
    : [
        {
          providerResourceType,
          detail,
          outcome: inventory.failureOutcome ?? "transient"
        }
      ];
}

/** gg: inventory page가 일부만 읽혔으면 앞 page record도 자동 관리 후보가 되지 못하게 합니다. */
function addInventoryFailureToIamRecord(
  record: AwsDiscoveredResourceRecord,
  inventory: {
    roleInventoryComplete: boolean;
    policyInventoryComplete: boolean;
    instanceProfileInventoryComplete: boolean;
  }
): AwsDiscoveredResourceRecord {
  const missingInventory =
    record.providerResourceType === "AWS::IAM::Role" ||
    record.providerResourceType === "AWS::IAM::RolePolicy"
      ? inventory.roleInventoryComplete
        ? []
        : ["roleInventory"]
      : record.providerResourceType === "AWS::IAM::Policy"
        ? inventory.policyInventoryComplete
          ? []
          : ["policyInventory"]
        : inventory.instanceProfileInventoryComplete
          ? []
          : ["instanceProfileInventory"];
  if (missingInventory.length === 0) return record;
  const existing = Array.isArray(record.config["reverseEngineeringIncompleteDetails"])
    ? record.config["reverseEngineeringIncompleteDetails"].filter(nonEmptyString)
    : [];
  return {
    ...record,
    config: {
      ...record.config,
      managementReady: false,
      reverseEngineeringDetailsComplete: false,
      reverseEngineeringIncompleteDetails: uniqueSorted([...existing, ...missingInventory])
    }
  };
}

/** gg: malformed document도 동일한 안전 실패 형식으로 남겨 자동 승격을 막습니다. */
function createFailure(
  providerResourceType: string,
  providerResourceId: string,
  detail: string
): AwsReverseEngineeringDetailFailure {
  return { providerResourceType, providerResourceId, detail, outcome: "transient" };
}

/** gg: 같은 AWS 관계를 한 번만 보존해 Board 연결과 import dependency를 안정화합니다. */
function uniqueRelationships(
  relationships: AwsDiscoveredResourceRecord["relationships"]
): AwsDiscoveredResourceRecord["relationships"] {
  const seen = new Set<string>();
  return relationships.filter((relationship) => {
    const key = `${relationship.type}:${relationship.targetProviderResourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** gg: raw ARN 대신 provider type까지 포함한 안정적인 불투명 ID를 공개 관계 키로 사용합니다. */
function createOpaqueAwsProviderResourceId(
  providerResourceType: string,
  exactProviderResourceId: string
): string {
  return `aws-ref-${createHash("sha256")
    .update(`${providerResourceType}\0${exactProviderResourceId}`)
    .digest("hex")
    .slice(0, 24)}`;
}

/** gg: 설명에 ARN이 섞이면 전체 설명을 숨겨 account 정보가 공개 record로 새지 않게 합니다. */
function toSafePublicString(value: unknown): string | undefined {
  const text = nonEmptyString(value);
  return text && !containsAwsArn(text) ? text : undefined;
}

/** gg: partition이 다른 AWS ARN까지 같은 server-only 경계로 판정합니다. */
function containsAwsArn(value: string): boolean {
  return /(?:^|[^a-z0-9])arn:aws(?:-[a-z0-9-]+)?:/iu.test(value);
}

/** gg: 많은 IAM 리소스도 동시에 여덟 개까지만 상세 조회해 AWS throttling을 피합니다. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(items.length, Math.max(1, concurrency));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        const item = items[index];
        if (item !== undefined) results[index] = await mapper(item, index);
      }
    })
  );
  return results;
}

/** gg: AWS optional 값은 undefined로 두고 공개 config에 의미 없는 빈 key를 만들지 않습니다. */
function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

/** gg: AWS ID와 이름은 빈 문자열을 허용하지 않아 불안정한 record ID 생성을 막습니다. */
function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** gg: incompleteness marker의 순서를 고정해 같은 scan이 같은 판단 결과를 냅니다. */
function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** gg: 실제 SDK client는 임시 자격 증명을 process 환경이나 log에 복사하지 않고 직접 주입합니다. */
function createDefaultIamDetailReadClient(
  region: string,
  credentials: TerraformAwsCredentialEnv
): AwsIamDetailReadClient {
  const client = new IAMClient({
    region,
    credentials: {
      accessKeyId: credentials.AWS_ACCESS_KEY_ID,
      secretAccessKey: credentials.AWS_SECRET_ACCESS_KEY,
      ...(credentials.AWS_SESSION_TOKEN ? { sessionToken: credentials.AWS_SESSION_TOKEN } : {})
    }
  });
  return {
    send: (command) => client.send(command as Parameters<IAMClient["send"]>[0])
  };
}

/** gg: injectable client 경계를 통과한 SDK 응답만 해당 command output으로 좁힙니다. */
async function sendIam<T>(client: AwsIamDetailReadClient, command: object): Promise<T> {
  return (await client.send(command)) as T;
}
