import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import type {
  BrainboardSourceNode,
  BrainboardTemplateSource,
  BrainboardTerraformFile
} from "../source-types.js";
import { validateBrainboardTemplateSource } from "../validate-source.js";

type RawNode = {
  readonly height: number;
  readonly order: number;
  readonly position: { readonly x: number; readonly y: number };
  readonly resourceType: string;
  readonly sourceNodeId: string;
  readonly title: string;
  readonly transform: string;
  readonly width: number;
  readonly parentSourceNodeId: string | null;
};

type RawEdge = {
  readonly arrow: { readonly points: string; readonly transform: string } | null;
  readonly id: string;
  readonly order: number;
  readonly svgPath: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly sourcePort: string;
  readonly targetPort: string;
  readonly sourcePoint: { readonly x: number; readonly y: number };
  readonly targetPoint: { readonly x: number; readonly y: number };
  readonly waypoints: readonly { readonly x: number; readonly y: number }[];
};

type RawCapture = {
  readonly id: string;
  readonly title: string;
  readonly status: "captured";
  readonly provider: "aws";
  readonly origin: {
    readonly platform: "brainboard";
    readonly author: "Chafik Belhaoues";
    readonly sourceTemplateId: string;
    readonly sourceUrl: string;
    readonly cloneBoardUrl: string;
    readonly downloads: number;
    readonly capturedAt: string;
  };
  readonly nodes: readonly RawNode[];
  readonly edges: readonly RawEdge[];
  readonly viewport: { readonly viewBox: string };
  readonly terraform: {
    readonly files: readonly (BrainboardTerraformFile & { readonly lineCount: number })[];
    readonly resourceAddresses: readonly string[];
  };
};

type ExpectedResourceMapping = readonly [
  sourceNodeId: string,
  address: string,
  fileName: string,
  strategy: "exact-title" | "single-residual" | "reviewed-override"
];

type ExpectedPresentation = readonly [
  sourceNodeId: string,
  rawResourceType: string,
  catalogId: string | null,
  label: string
];

type WorkspaceOmission = {
  readonly fileName: string;
  readonly sourceText: string;
  readonly occurrences: number;
};

type FixtureCase = {
  readonly rawFileName: string;
  readonly rawCaptureSha256: string;
  readonly load: () => Promise<BrainboardTemplateSource>;
  readonly parentRepairs: ReadonlyMap<string, string | null>;
  readonly mappings: readonly ExpectedResourceMapping[];
  readonly presentations: readonly ExpectedPresentation[];
  readonly workspaceOmissions: readonly WorkspaceOmission[];
};

const captureDirectory = new URL(
  "../../../../../docs/gg/feat-infrastructure-template/brainboard-captures/",
  import.meta.url
);

const JENKINS_PARENT_REPAIRS = new Map<string, string | null>([
  ["f4301d28-06e3-4263-a5ec-5315eb4f7e69", null],
  ["7284b103-be2a-4159-b7f4-b6ab0cb802fa", "00247cae-d87b-40b3-987f-08a702b062f3"],
  ["8894d2b3-f035-4824-ae9c-ed68cae67835", "00247cae-d87b-40b3-987f-08a702b062f3"],
  ["e4672c0f-349e-4a5f-951e-1950b90adbea", null],
  ["4c8d5064-37af-4f69-84ae-093f1652e998", "e4672c0f-349e-4a5f-951e-1950b90adbea"],
  ["050262e9-c94b-48b6-90b1-7298da1a70a2", "4c8d5064-37af-4f69-84ae-093f1652e998"]
]);

const DOCUMENT_DB_PARENT_REPAIRS = new Map<string, string | null>([
  ["9adcf8e5-26cb-484e-9ae5-6535a6a1894d", null],
  ["8cc66a70-095a-4dd1-b32d-9be569d07d43", "9adcf8e5-26cb-484e-9ae5-6535a6a1894d"]
]);

const LANDING_ZONE_PARENT_REPAIRS = new Map<string, string | null>([
  ["eaf4b1f2-372f-4eef-968c-5137fb0941ef", null],
  ["2abe13e0-233f-4e11-9d24-05e9b3d61bdf", "eaf4b1f2-372f-4eef-968c-5137fb0941ef"],
  ["8487e22b-1a81-4b45-87f4-3415848b288a", "2abe13e0-233f-4e11-9d24-05e9b3d61bdf"],
  ["a8cbdb9e-1255-44d1-9ccc-af111d08dc6d", "2abe13e0-233f-4e11-9d24-05e9b3d61bdf"],
  ["efe4bfff-0849-45a3-81fd-d78dcec9062e", "2abe13e0-233f-4e11-9d24-05e9b3d61bdf"]
]);

const JENKINS_MAPPINGS = [
  ["00247cae-d87b-40b3-987f-08a702b062f3", "aws_vpc.vpc_master", "main.tf", "exact-title"],
  [
    "4c8d5064-37af-4f69-84ae-093f1652e998",
    "aws_vpc.vpc_master_us_west_2",
    "main.tf",
    "exact-title"
  ],
  ["b55a1748-7a18-424f-b047-ffa56acd1a92", "aws_subnet.subnet_1", "main.tf", "exact-title"],
  ["0521d44b-15ce-40f0-abb8-6f2bd189eafa", "aws_subnet.subnet_2", "main.tf", "exact-title"],
  ["be92d4fa-43ef-4fbf-a4ee-71ae6647998e", "aws_subnet.subnet_1_oregon", "main.tf", "exact-title"],
  ["5b91539b-dc2d-4d8d-9aac-a1c52e9b7200", "aws_security_group.lb-sg", "main.tf", "exact-title"],
  [
    "33ce152b-f405-4f28-86e5-4e894df70cd4",
    "aws_security_group.jenkins-sg",
    "main.tf",
    "exact-title"
  ],
  [
    "714b53d2-89b3-465a-9151-2318985dbd2d",
    "aws_security_group.jenkins-sg-oregon",
    "main.tf",
    "exact-title"
  ],
  [
    "19c57b20-0ebb-4efb-b35e-8c37e175e918",
    "aws_internet_gateway.igw",
    "main.tf",
    "single-residual"
  ],
  [
    "08a82fc0-d9d9-46af-a271-b7b182986246",
    "aws_internet_gateway.igw-oregon",
    "main.tf",
    "exact-title"
  ],
  [
    "606e1369-d916-490e-94c7-4aedeeafe7e0",
    "aws_vpc_peering_connection.useast2-uswest2",
    "main.tf",
    "single-residual"
  ],
  [
    "651d53c3-cceb-4967-b5c3-e025e140fa3b",
    "aws_route_table.internet_route",
    "main.tf",
    "single-residual"
  ],
  [
    "fa46f093-d66a-4f84-8568-a3c04fdc2c44",
    "aws_main_route_table_association.aws_main_route_table_association_d71db21a",
    "main.tf",
    "single-residual"
  ],
  [
    "bb82de1b-7d92-41fc-a0a9-d1c5e3634d11",
    "aws_route_table.internet_route_oregon",
    "main.tf",
    "exact-title"
  ],
  [
    "cac8d6c9-02a8-4984-8a5d-c398d6c7e50a",
    "aws_main_route_table_association.set-worker-default-rt-assoc",
    "main.tf",
    "exact-title"
  ],
  [
    "4fd77125-9a08-4a94-8900-6d00c4037415",
    "aws_security_group_rule.ingress_443",
    "main.tf",
    "reviewed-override"
  ],
  [
    "cd3c4233-a339-4f9a-b03f-a60ade2ce25c",
    "aws_security_group_rule.aws_security_group_rule-cd816426",
    "main.tf",
    "reviewed-override"
  ],
  [
    "f4ae7e8a-8781-4991-a258-6bc4fdeebb62",
    "aws_security_group_rule.aws_security_group_rule-bba6e6bc",
    "main.tf",
    "reviewed-override"
  ],
  [
    "322e3f91-de14-40e9-95e7-d2961ebe5add",
    "aws_security_group_rule.aws_security_group_rule-a5db6d6d",
    "main.tf",
    "reviewed-override"
  ],
  [
    "66ebe038-ae86-4ec6-8f43-6ddddf3a1f9d",
    "aws_security_group_rule.aws_security_group_rule-bcdf5fec",
    "main.tf",
    "reviewed-override"
  ],
  [
    "ec1ee03a-b434-450d-83f4-a3c881aca9e9",
    "aws_security_group_rule.aws_security_group_rule-becf1315",
    "main.tf",
    "reviewed-override"
  ],
  [
    "7e0371f7-989e-4443-81f4-ba9507600c5b",
    "aws_security_group_rule.aws_security_group_rule-dc61e49a",
    "main.tf",
    "reviewed-override"
  ],
  [
    "a0bc45ed-9de6-4e39-acaf-669b0ece77ea",
    "aws_security_group_rule.aws_security_group_rule-6a963203",
    "main.tf",
    "reviewed-override"
  ],
  [
    "054d907a-9682-42cd-a2fe-58e6c2d8bff7",
    "aws_security_group_rule.aws_security_group_rule-d771cb77",
    "main.tf",
    "reviewed-override"
  ],
  [
    "69b98bc5-0d94-4536-839a-fc59f824e62c",
    "aws_security_group_rule.aws_security_group_rule-c0f59b71",
    "main.tf",
    "reviewed-override"
  ],
  ["876fa860-938e-4e32-b1d1-14ff0746f644", "aws_key_pair.master-key", "main.tf", "exact-title"],
  ["822a6dc6-00bf-40cb-9929-7042413ebe17", "aws_key_pair.worker-key", "main.tf", "exact-title"],
  ["0bc773fc-ee96-4d04-8113-fd6e67060f5f", "aws_instance.jenkins-master", "main.tf", "exact-title"],
  [
    "f80213b2-c624-4641-ba30-a1ae3839a93f",
    "aws_instance.jenkins-worker-oregon",
    "main.tf",
    "exact-title"
  ],
  [
    "a9e9123e-b88b-49c5-8266-81e77ef12a9a",
    "aws_route53_record.cert_validation",
    "main.tf",
    "exact-title"
  ],
  ["21b5bc02-743e-423f-8262-d210ad83825a", "aws_route53_record.jenkins", "main.tf", "exact-title"],
  [
    "08d05e4d-826e-4c51-a218-ed4448ecb8a2",
    "aws_vpc_peering_connection_accepter.accept_peering",
    "main.tf",
    "exact-title"
  ],
  ["6331936d-d4de-41f0-ab45-a1f9a8ed2260", "aws_lb.application-lb", "main.tf", "exact-title"],
  [
    "b7918332-62bd-4112-8907-c1cfbb07f2f1",
    "aws_lb_target_group.app-lb-tg",
    "main.tf",
    "exact-title"
  ],
  [
    "a45b829c-0e30-4596-aebd-815bdfed85b5",
    "aws_lb_listener.aws_lb_listener_117174a9",
    "main.tf",
    "single-residual"
  ],
  [
    "258928c4-85a7-4bf8-bd79-773dfa53a4b9",
    "aws_lb_listener.jenkins-listener-https",
    "main.tf",
    "exact-title"
  ],
  [
    "89e6ed9b-46d3-475c-a1fb-33c2d9abfae4",
    "aws_lb_target_group_attachment.jenkins-master-attach",
    "main.tf",
    "exact-title"
  ],
  [
    "ae51f41c-19a4-4161-abaa-b89059718743",
    "aws_acm_certificate.jenkins-lb-https",
    "main.tf",
    "single-residual"
  ],
  [
    "c0387977-4047-43de-ae43-6edc8dbd91d9",
    "aws_acm_certificate_validation.cert",
    "main.tf",
    "single-residual"
  ]
] as const satisfies readonly ExpectedResourceMapping[];

const DOCUMENT_DB_MAPPINGS = [
  ["8cc66a70-095a-4dd1-b32d-9be569d07d43", "aws_vpc.restAPI-vpc", "main.tf", "exact-title"],
  ["6a793bea-ff9a-4951-bf42-7ff3f987219d", "aws_subnet.restAPI-subnet", "main.tf", "exact-title"],
  [
    "352c51ca-9f42-4d1d-b2ea-cddba97c5f91",
    "aws_lambda_function.restAPI-lambda",
    "main.tf",
    "reviewed-override"
  ],
  [
    "08ec8f09-61cc-4bca-aa03-bba22b030378",
    "aws_lambda_function.restAPI-lambda-ext",
    "main.tf",
    "reviewed-override"
  ],
  [
    "82fc5147-833e-4d85-a63e-7809cecbc533",
    "aws_apigatewayv2_api.restAPI-gw",
    "main.tf",
    "single-residual"
  ],
  [
    "9ae294ea-de55-47ee-ac40-9fdc891717fa",
    "aws_secretsmanager_secret.restAPI-db-creds",
    "main.tf",
    "single-residual"
  ],
  [
    "c3987042-939e-4ef9-bf00-40bae8f06412",
    "aws_docdb_cluster.restAPI-documentdb",
    "main.tf",
    "single-residual"
  ]
] as const satisfies readonly ExpectedResourceMapping[];

const LANDING_ZONE_MAPPINGS = [
  ["2abe13e0-233f-4e11-9d24-05e9b3d61bdf", "aws_vpc.default", "main.tf", "exact-title"],
  ["ceb5c182-f15b-4fed-8cd2-ae6f38ae57bb", "aws_subnet.public_a", "public.tf", "reviewed-override"],
  ["59330f93-ad09-4e27-8125-9ed70c14f18d", "aws_subnet.public_b", "public.tf", "reviewed-override"],
  ["d8602f90-fb4f-43f4-b4de-810d0117cc46", "aws_subnet.public_c", "public.tf", "reviewed-override"],
  [
    "75bf4e98-45fc-47f3-91d3-3c96bcbbde9c",
    "aws_subnet.private_a",
    "private.tf",
    "reviewed-override"
  ],
  [
    "c922d942-2e74-48fa-8ad7-588328b69fbd",
    "aws_subnet.private_b",
    "private.tf",
    "reviewed-override"
  ],
  [
    "7706801a-075a-4573-ba3c-fa5fcdcb5e39",
    "aws_subnet.private_c",
    "private.tf",
    "reviewed-override"
  ],
  ["c5e2f82f-fa10-4734-ba7b-13c62eca245c", "aws_eip.eip_a", "public.tf", "exact-title"],
  [
    "930b2ef4-42c3-47c3-a5f2-8f1c8b66eeb2",
    "aws_nat_gateway.nat-gw-2a-public",
    "public.tf",
    "exact-title"
  ],
  [
    "7e887897-a039-4423-90de-08855d52d313",
    "aws_nat_gateway.nat-gw-2b-public",
    "public.tf",
    "exact-title"
  ],
  [
    "63b13b84-61f9-4e19-bb60-a3d254b4ec5c",
    "aws_nat_gateway.nat-gw-2c-public",
    "public.tf",
    "exact-title"
  ],
  ["d1d206eb-491d-49e0-89f8-a079f364504b", "aws_eip.eip_b", "public.tf", "exact-title"],
  [
    "19d29edd-f56f-4e0c-8783-f484e8ba099b",
    "aws_route_table.rt_public_a",
    "public.tf",
    "exact-title"
  ],
  [
    "991494f9-ef01-48fc-a913-5fcf1ef4d36f",
    "aws_route_table.rt_public_b",
    "public.tf",
    "exact-title"
  ],
  ["ee5363fd-574a-41db-8101-3f1b3f9a4a89", "aws_eip.eip_c", "public.tf", "exact-title"],
  [
    "4bcc66c1-1ca5-4598-b191-43978626b5d4",
    "aws_route_table.rt_private_a",
    "private.tf",
    "exact-title"
  ],
  [
    "3a83b88a-5972-4fa0-a93d-a5e9043dd346",
    "aws_route_table.rt_public_c",
    "public.tf",
    "exact-title"
  ],
  [
    "e2b5b2fc-8c8c-4ba3-ac14-7ef1f114adae",
    "aws_route_table.rt_private_b",
    "private.tf",
    "exact-title"
  ],
  [
    "ccbad7d3-fe39-4213-953c-0884b6e0aa64",
    "aws_route_table.rt_private_c",
    "private.tf",
    "exact-title"
  ],
  ["eafb249d-07f3-431b-9f76-dbd55ad496fe", "aws_flow_log.default", "main.tf", "exact-title"],
  [
    "b52fd88e-c798-4539-bc2c-c96d2ff2a59a",
    "aws_internet_gateway.default",
    "public.tf",
    "exact-title"
  ]
] as const satisfies readonly ExpectedResourceMapping[];

const fixtures = [
  {
    rawFileName: "aws-jenkins-ec2.json",
    rawCaptureSha256: "8093125dd4605097bc95a27f6cdf05a842034595d0c5f01d61d5979f5f7f0645",
    load: async () => loadSource("aws-jenkins-ec2", "awsJenkinsEc2Source"),
    parentRepairs: JENKINS_PARENT_REPAIRS,
    mappings: JENKINS_MAPPINGS,
    presentations: [
      ["f4301d28-06e3-4263-a5ec-5315eb4f7e69", "region", "aws-region", "US East (Ohio)"],
      [
        "7284b103-be2a-4159-b7f4-b6ab0cb802fa",
        "availability_zone",
        "aws-availability-zone",
        "us-east-2a"
      ],
      [
        "8894d2b3-f035-4824-ae9c-ed68cae67835",
        "availability_zone",
        "aws-availability-zone",
        "us-east-2b"
      ],
      ["e4672c0f-349e-4a5f-951e-1950b90adbea", "region", "aws-region", "US West (Oregon)"],
      [
        "050262e9-c94b-48b6-90b1-7298da1a70a2",
        "availability_zone",
        "aws-availability-zone",
        "us-west-2a"
      ]
    ],
    workspaceOmissions: [
      {
        fileName: "variables.tf",
        sourceText: '    archuuid = "c884d82a-6fab-454f-a984-619d65ad6044"\n',
        occurrences: 1
      }
    ]
  },
  {
    rawFileName: "aws-rest-api-documentdb.json",
    rawCaptureSha256: "7fba7f1739bf14bda3e65b8a927351dcbae60c8f961fbe93db01cdb6df594b2f",
    load: async () => loadSource("aws-rest-api-documentdb", "awsRestApiDocumentDbSource"),
    parentRepairs: DOCUMENT_DB_PARENT_REPAIRS,
    mappings: DOCUMENT_DB_MAPPINGS,
    presentations: [
      ["9adcf8e5-26cb-484e-9ae5-6535a6a1894d", "region", "aws-region", "EU (Frankfurt)"],
      ["e350f53e-754f-421b-b01d-46f66ce0c2a4", "brainboard_icon", "design-user-client", "Client"],
      ["15908d66-a92a-4177-9a30-abfc0f29eabc", "text", null, ""]
    ],
    workspaceOmissions: [
      {
        fileName: "main.tf",
        sourceText: '    archUUID = "1d36075c-54dd-4bf7-a797-c19d1ff008a3"\n',
        occurrences: 7
      },
      {
        fileName: "variables.tf",
        sourceText: '    archuuid = "9447b484-b256-42b3-b933-ced015820d0b"\n',
        occurrences: 1
      }
    ]
  },
  {
    rawFileName: "aws-network-landing-zone.json",
    rawCaptureSha256: "450e2d1a0d24679a4074d86b7d54846f7ed98cd9a5c63b5dfdfa612beabf2003",
    load: async () => loadSource("aws-network-landing-zone", "awsNetworkLandingZoneSource"),
    parentRepairs: LANDING_ZONE_PARENT_REPAIRS,
    mappings: LANDING_ZONE_MAPPINGS,
    presentations: [
      ["eaf4b1f2-372f-4eef-968c-5137fb0941ef", "region", "aws-region", "US East (Ohio)"],
      [
        "8487e22b-1a81-4b45-87f4-3415848b288a",
        "availability_zone",
        "aws-availability-zone",
        "us-east-2a"
      ],
      [
        "a8cbdb9e-1255-44d1-9ccc-af111d08dc6d",
        "availability_zone",
        "aws-availability-zone",
        "us-east-2b"
      ],
      [
        "efe4bfff-0849-45a3-81fd-d78dcec9062e",
        "availability_zone",
        "aws-availability-zone",
        "us-east-2c"
      ],
      ["33d669e3-4362-4e39-b077-46eaa146ea0b", "brainboard_icon", "design-internet", "Internet"]
    ],
    workspaceOmissions: []
  }
] as const satisfies readonly FixtureCase[];

test("ranks 7-9 preserve all raw bytes, normalized graph data, Terraform files, and reviewed mappings", async () => {
  const sources = await Promise.all(fixtures.map(({ load }) => load()));

  assert.deepEqual(
    sources.map(({ id }) => id),
    [
      "brainboard-aws-jenkins-ec2",
      "brainboard-aws-rest-api-documentdb",
      "brainboard-aws-network-landing-zone"
    ]
  );
  assert.equal(
    sources.reduce((total, { nodes }) => total + nodes.length, 0),
    80
  );
  assert.equal(
    sources.reduce((total, { edges }) => total + edges.length, 0),
    33
  );
  assert.equal(
    sources.reduce((total, { terraform }) => total + terraform.files.length, 0),
    24
  );
  assert.equal(
    sources.reduce((total, { terraform }) => total + terraform.resourceAddresses.length, 0),
    67
  );
  assert.equal(
    fixtures.reduce((total, { parentRepairs }) => total + parentRepairs.size, 0),
    13
  );

  for (const [index, fixture] of fixtures.entries()) {
    verifyFixture(sources[index]!, fixture);
  }
});

test("rank 7 retains the one exact duplicate edge without collapsing either authored edge id", async () => {
  const source = await fixtures[0].load();
  const duplicateIds = [
    "371fb0d7-8d72-4a69-b727-dceb93d53b69",
    "45fab82b-09ac-4c89-9e25-3ba50121fd2f"
  ];
  const duplicates = source.edges.filter(({ sourceEdgeId }) => duplicateIds.includes(sourceEdgeId));

  assert.deepEqual(
    duplicates.map(({ sourceEdgeId }) => sourceEdgeId),
    duplicateIds
  );
  assert.deepEqual(stripEdgeIdentity(duplicates[0]!), stripEdgeIdentity(duplicates[1]!));
  assert.equal(findSemanticDuplicateEdgeGroups(source).length, 1);
});

test("rank 8 keeps its empty text unresolved and preserves the included empty undefined.tf", async () => {
  const source = await fixtures[1].load();
  const emptyText = source.nodes.find(
    ({ sourceNodeId }) => sourceNodeId === "15908d66-a92a-4177-9a30-abfc0f29eabc"
  );
  assert.ok(emptyText?.kind === "presentation");
  assert.equal(emptyText.label, "");
  assert.equal(emptyText.rawResourceType, "text");
  assert.equal(emptyText.catalogId, null);
  assert.equal(emptyText.aliasOf, null);
  assert.equal(emptyText.style, null);
  assert.equal(source.nodes.filter(({ label }) => label === "").length, 1);

  const undefinedFile = source.terraform.files.find(({ fileName }) => fileName === "undefined.tf");
  assert.deepEqual(undefinedFile, {
    fileName: "undefined.tf",
    code: "",
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    includeInWorkspace: true
  });
});

test("rank 9 keeps private/public file ownership and exactly three -90 degree EIP rotations", async () => {
  const source = await fixtures[2].load();
  const fileByAddress = new Map(
    source.nodes.filter(isResourceNode).map((node) => [resourceAddress(node), node.fileName])
  );

  assert.deepEqual(
    source.terraform.resourceAddresses
      .filter(
        (address) =>
          address.startsWith("aws_subnet.private_") ||
          address.startsWith("aws_route_table.rt_private_")
      )
      .map((address) => [address, fileByAddress.get(address)]),
    [
      ["aws_route_table.rt_private_a", "private.tf"],
      ["aws_route_table.rt_private_b", "private.tf"],
      ["aws_route_table.rt_private_c", "private.tf"],
      ["aws_subnet.private_a", "private.tf"],
      ["aws_subnet.private_b", "private.tf"],
      ["aws_subnet.private_c", "private.tf"]
    ]
  );
  assert.ok(
    source.terraform.resourceAddresses
      .filter((address) => /^(?:aws_(?:subnet|route_table)\.)(?:public_|rt_public_)/u.test(address))
      .every((address) => fileByAddress.get(address) === "public.tf")
  );
  assert.deepEqual(
    source.nodes
      .filter(({ rotation }) => rotation !== 0)
      .map(({ sourceNodeId, rotation }) => [sourceNodeId, rotation]),
    [
      ["c5e2f82f-fa10-4734-ba7b-13c62eca245c", -90],
      ["d1d206eb-491d-49e0-89f8-a079f364504b", -90],
      ["ee5363fd-574a-41db-8101-3f1b3f9a4a89", -90]
    ]
  );
});

async function loadSource(fileName: string, exportName: string): Promise<BrainboardTemplateSource> {
  const sourcePath = new URL(`./${fileName}.ts`, import.meta.url);
  assert.ok(existsSync(sourcePath), `generated source fixture must exist: ${fileName}.ts`);
  const module = (await import(sourcePath.href)) as Record<string, unknown>;
  const source = module[exportName];
  assert.ok(source, `${exportName} must be exported by ${fileName}.ts`);
  return source as BrainboardTemplateSource;
}

function verifyFixture(source: BrainboardTemplateSource, fixture: FixtureCase): void {
  const rawBytes = readFileSync(new URL(fixture.rawFileName, captureDirectory));
  const raw = JSON.parse(rawBytes.toString("utf8")) as RawCapture;
  assert.equal(sha256(rawBytes), fixture.rawCaptureSha256, `${fixture.rawFileName} raw-byte SHA`);
  assert.equal(source.id, raw.id);
  assert.equal(source.title, raw.title);
  assert.equal(source.description, null);
  assert.equal(source.captureStatus, raw.status);
  assert.equal(source.provider, raw.provider);
  assert.deepEqual(source.origin, {
    platform: raw.origin.platform,
    author: raw.origin.author,
    sourceTemplateId: raw.origin.sourceTemplateId,
    sourceUrl: raw.origin.sourceUrl,
    cloneArchitectureId: /\/a\/([^/]+)\/design/u.exec(raw.origin.cloneBoardUrl)?.[1],
    downloads: raw.origin.downloads,
    capturedAt: raw.origin.capturedAt
  });
  assert.deepEqual(source.viewport, parseViewBox(raw.viewport.viewBox));
  assert.deepEqual(validateBrainboardTemplateSource(source), { valid: true, errors: [] });

  assert.deepEqual(
    source.nodes.map(commonNodeProjection),
    raw.nodes.map((node) => ({
      sourceNodeId: node.sourceNodeId,
      domOrder: node.order,
      label: node.title,
      position: node.position,
      size: { width: node.width, height: node.height },
      parentSourceNodeId: fixture.parentRepairs.has(node.sourceNodeId)
        ? fixture.parentRepairs.get(node.sourceNodeId)!
        : node.parentSourceNodeId,
      zIndex: node.order,
      rawTransform: node.transform,
      rotation: parseRotation(node.transform)
    }))
  );
  assert.deepEqual(
    source.edges,
    raw.edges.map((edge) => ({
      sourceEdgeId: edge.id,
      domOrder: edge.order,
      zIndex: edge.order,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      sourcePort: edge.sourcePort,
      targetPort: edge.targetPort,
      svgPath: edge.svgPath,
      sourcePoint: edge.sourcePoint,
      targetPoint: edge.targetPoint,
      waypoints: edge.waypoints,
      arrowDirection: arrowDirection(edge),
      arrowAngle: arrowAngle(edge),
      rawArrow: edge.arrow
    }))
  );
  assert.deepEqual(
    source.terraform.files.map(({ fileName, code, sha256: fileSha, includeInWorkspace }) => ({
      fileName,
      code,
      sha256: fileSha,
      includeInWorkspace
    })),
    raw.terraform.files.map(({ fileName, code, sha256: fileSha, includeInWorkspace }) => ({
      fileName,
      code,
      sha256: fileSha,
      includeInWorkspace
    }))
  );
  assert.deepEqual(source.terraform.resourceAddresses, raw.terraform.resourceAddresses);
  assert.deepEqual(
    source.nodes
      .filter(isResourceNode)
      .map((node) => [
        node.sourceNodeId,
        resourceAddress(node),
        node.fileName,
        node.addressMapping
      ]),
    fixture.mappings
  );
  assert.deepEqual(
    source.nodes
      .filter(isPresentationNode)
      .map((node) => [node.sourceNodeId, node.rawResourceType, node.catalogId, node.label]),
    fixture.presentations
  );
  assert.ok(
    source.nodes
      .filter(isPresentationNode)
      .every(({ aliasOf, style }) => aliasOf === null && style === null)
  );
  assert.ok(
    source.nodes
      .filter(isResourceNode)
      .every(
        (node) =>
          node.valuesResolution === "source-file-authoritative/unresolved" && !("values" in node)
      )
  );

  const mappedAddresses = source.nodes.filter(isResourceNode).map(resourceAddress);
  assert.equal(
    new Set(mappedAddresses).size,
    mappedAddresses.length,
    `${fixture.rawFileName} unique visual addresses`
  );
  assert.deepEqual(new Set(mappedAddresses), new Set(raw.terraform.resourceAddresses));
  assert.equal(
    fixture.parentRepairs.size,
    fixture.rawFileName === "aws-jenkins-ec2.json"
      ? 6
      : fixture.rawFileName === "aws-rest-api-documentdb.json"
        ? 2
        : 5
  );
  assert.deepEqual(findParentCycles(source.nodes), []);
  verifyWorkspaceSeeds(source, fixture.workspaceOmissions);
}

function verifyWorkspaceSeeds(
  source: BrainboardTemplateSource,
  omissions: readonly WorkspaceOmission[]
): void {
  const expectedByFile = new Map(omissions.map((omission) => [omission.fileName, omission]));
  for (const file of source.terraform.files) {
    const expected = expectedByFile.get(file.fileName);
    if (expected === undefined) {
      assert.equal(file.workspaceSeed, undefined, `${source.id}/${file.fileName} has no rewrite`);
      continue;
    }
    assert.equal(countOccurrences(file.code, expected.sourceText), expected.occurrences);
    assert.ok(file.workspaceSeed, `${source.id}/${file.fileName} has a workspace seed`);
    const expectedCode = file.code.split(expected.sourceText).join("");
    assert.equal(file.workspaceSeed.code, expectedCode);
    assert.equal(file.workspaceSeed.sha256, sha256(expectedCode));
    assert.deepEqual(
      file.workspaceSeed.omissions.map((omission) => ({
        reason: omission.reason,
        sourceText: omission.sourceText,
        occurrenceCount: omission.occurrenceCount
      })),
      [
        {
          reason: "brainboard-architecture-uuid",
          sourceText: expected.sourceText,
          occurrenceCount: expected.occurrences
        }
      ]
    );
  }
}

function commonNodeProjection(node: BrainboardSourceNode) {
  const {
    sourceNodeId,
    domOrder,
    label,
    position,
    size,
    parentSourceNodeId,
    zIndex,
    rawTransform,
    rotation
  } = node;
  return {
    sourceNodeId,
    domOrder,
    label,
    position,
    size,
    parentSourceNodeId,
    zIndex,
    rawTransform,
    rotation
  };
}

function isResourceNode(
  node: BrainboardSourceNode
): node is Extract<BrainboardSourceNode, { kind: "resource" }> {
  return node.kind === "resource";
}

function isPresentationNode(
  node: BrainboardSourceNode
): node is Extract<BrainboardSourceNode, { kind: "presentation" }> {
  return node.kind === "presentation";
}

function resourceAddress(node: Extract<BrainboardSourceNode, { kind: "resource" }>): string {
  return `${node.terraformBlockType === "data" ? "data." : ""}${node.terraformResourceType}.${node.resourceName}`;
}

function stripEdgeIdentity(edge: BrainboardTemplateSource["edges"][number]) {
  const { sourceEdgeId: _sourceEdgeId, domOrder: _domOrder, zIndex: _zIndex, ...semantic } = edge;
  return semantic;
}

function findSemanticDuplicateEdgeGroups(source: BrainboardTemplateSource): readonly string[][] {
  const groups = new Map<string, string[]>();
  for (const edge of source.edges) {
    const key = JSON.stringify(stripEdgeIdentity(edge));
    const ids = groups.get(key) ?? [];
    ids.push(edge.sourceEdgeId);
    groups.set(key, ids);
  }
  return [...groups.values()].filter((ids) => ids.length > 1);
}

function parseViewBox(viewBox: string) {
  const [x, y, width, height] = viewBox.split(/\s+/u).map(Number);
  return { x, y, width, height };
}

function parseRotation(transform: string): number {
  return Number(/rotate\(([-+\d.eE]+)/u.exec(transform)?.[1]);
}

function arrowDirection(edge: RawEdge): "source-to-target" | "target-to-source" | "none" {
  if (edge.arrow === null) return "none";
  const [, x, y] = /rotate\([^,]+,\s*([^,]+),\s*([^)]+)\)/u.exec(edge.arrow.transform) ?? [];
  const center = { x: Number(x), y: Number(y) };
  if (center.x === edge.targetPoint.x && center.y === edge.targetPoint.y) return "source-to-target";
  return "target-to-source";
}

function arrowAngle(edge: RawEdge): number {
  return edge.arrow === null ? 0 : Number(/rotate\(([^,]+)/u.exec(edge.arrow.transform)?.[1]);
}

function findParentCycles(nodes: readonly BrainboardSourceNode[]): readonly string[][] {
  const nodesById = new Map(nodes.map((node) => [node.sourceNodeId, node]));
  const cycles: string[][] = [];
  for (const start of nodes) {
    const path: string[] = [];
    const indexes = new Map<string, number>();
    let current: BrainboardSourceNode | undefined = start;
    while (current) {
      const cycleStart = indexes.get(current.sourceNodeId);
      if (cycleStart !== undefined) {
        cycles.push(path.slice(cycleStart));
        break;
      }
      indexes.set(current.sourceNodeId, path.length);
      path.push(current.sourceNodeId);
      current =
        current.parentSourceNodeId === null ? undefined : nodesById.get(current.parentSourceNodeId);
    }
  }
  return cycles;
}

function countOccurrences(value: string, fragment: string): number {
  return value.split(fragment).length - 1;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
