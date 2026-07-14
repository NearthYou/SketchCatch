import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type {
  BrainboardSourceEdge,
  BrainboardSourceNode,
  BrainboardTemplateSource,
  BrainboardTerraformFile
} from "../source-types.js";
import { validateBrainboardTemplateSource } from "../validate-source.js";

type RawNode = {
  readonly height: number;
  readonly order: number;
  readonly parentSourceNodeId: string | null;
  readonly position: { readonly x: number; readonly y: number };
  readonly resourceType: string;
  readonly sourceNodeId: string;
  readonly title: string;
  readonly transform: string;
  readonly width: number;
};

type RawEdge = {
  readonly arrow: { readonly points: string; readonly transform: string } | null;
  readonly id: string;
  readonly order: number;
  readonly sourceNodeId: string;
  readonly sourcePoint: { readonly x: number; readonly y: number };
  readonly sourcePort: string;
  readonly svgPath: string;
  readonly targetNodeId: string;
  readonly targetPoint: { readonly x: number; readonly y: number };
  readonly targetPort: string;
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

type MappingStrategy = "exact-title" | "single-residual" | "reviewed-override";
type ExpectedResourceMapping = readonly [
  sourceNodeId: string,
  address: string,
  fileName: string,
  strategy: MappingStrategy
];
type ExpectedPresentation = readonly [
  sourceNodeId: string,
  rawResourceType: string,
  catalogId: string | null,
  aliasOf: string | null,
  label: string
];
type WorkspaceOmission = {
  readonly fileName: string;
  readonly sourceText: string;
  readonly occurrenceCount: number;
};
type FixtureExpectation = {
  readonly moduleFileName: string;
  readonly exportName: string;
  readonly rawFileName: string;
  readonly rawCaptureSha256: string;
  readonly parentRepairs: ReadonlyMap<string, string | null>;
  readonly mappings: readonly ExpectedResourceMapping[];
  readonly presentations: readonly ExpectedPresentation[];
  readonly workspaceOmissions: readonly WorkspaceOmission[];
};

const captureDirectory = new URL(
  "../../../../../docs/gg/feat-infrastructure-template/brainboard-captures/",
  import.meta.url
);

const expectations = [
  {
    moduleFileName: "aws-multi-account-management.ts",
    exportName: "awsMultiAccountManagementSource",
    rawFileName: "aws-multi-account-management.json",
    rawCaptureSha256: "14b356b76566369682002a42f481cba695ac714e6183bcbf171839c464123f06",
    parentRepairs: new Map([
      ["258ffd07-ae27-412c-8c6e-192ffbbb76de", null],
      ["c50301f8-0517-4fb9-8a05-3123e0c7dedd", null],
      ["d2ec1630-f50e-4c5f-b898-8a9a65dbb2ce", null],
      ["114ce859-8066-4c14-94da-52b3638dd9ee", "18592886-fb21-48dc-8fab-059177b9634b"],
      ["1dba0c64-caab-49ce-b64a-84c2f72ec1cc", "ddc96bd1-f6ae-4e61-8944-b779f74bf50c"],
      ["46b74daa-6c97-4991-af63-d172eb3e8b1d", "ddc96bd1-f6ae-4e61-8944-b779f74bf50c"],
      ["6c1d860b-04c2-4975-acd9-da97fcb87e28", "bfac85f0-4bdd-4b46-8507-8926a71e8b72"],
      ["8daa8193-2ae3-4554-8bc8-8d5c5ea49fc4", "bfac85f0-4bdd-4b46-8507-8926a71e8b72"],
      ["9a55fdc1-61fd-48dc-ba55-4fd900303cd1", "18592886-fb21-48dc-8fab-059177b9634b"]
    ]),
    mappings: [
      [
        "18592886-fb21-48dc-8fab-059177b9634b",
        "aws_vpc.staging_vpc",
        "prod-account.tf",
        "exact-title"
      ],
      ["bfac85f0-4bdd-4b46-8507-8926a71e8b72", "aws_vpc.dev_vpc", "prod-account.tf", "exact-title"],
      [
        "ddc96bd1-f6ae-4e61-8944-b779f74bf50c",
        "aws_vpc.prod_vpc",
        "prod-account.tf",
        "exact-title"
      ],
      [
        "0c7dce6c-a8a7-4a8f-82d5-c49cba3bb928",
        "aws_subnet.staging_snet1",
        "prod-account.tf",
        "exact-title"
      ],
      [
        "3001c016-1493-4d58-8768-b2931b576bd4",
        "aws_subnet.staging_snet2",
        "prod-account.tf",
        "exact-title"
      ],
      [
        "3607f798-6454-4e9b-a6eb-ca801c34d712",
        "aws_subnet.prod_snet1",
        "prod-account.tf",
        "exact-title"
      ],
      [
        "b49067a3-6b76-4dec-acd7-dde436c44ca9",
        "aws_subnet.prod_snet2",
        "prod-account.tf",
        "exact-title"
      ],
      [
        "bf6846e5-0f9e-445a-a19d-63417cd4a3f2",
        "aws_subnet.dev_snet2",
        "prod-account.tf",
        "exact-title"
      ],
      [
        "dd728495-b7d3-4836-a45e-8678e3c8856c",
        "aws_subnet.dev_snet1",
        "prod-account.tf",
        "exact-title"
      ],
      [
        "086875d3-7510-45d7-ad0f-2292bf5c5df3",
        "aws_organizations_account.dev",
        "accounts.tf",
        "reviewed-override"
      ],
      [
        "229ad76b-75e3-4009-994f-3d15fe4bdc45",
        "aws_organizations_account.staging",
        "accounts.tf",
        "reviewed-override"
      ],
      [
        "91e0f16f-fc9d-4138-ad10-314b294cf868",
        "aws_organizations_account.prod",
        "accounts.tf",
        "reviewed-override"
      ],
      [
        "01fcba84-c396-4fe3-8548-fd7f8f8dd0d6",
        "aws_instance.staging_vm1",
        "prod-account.tf",
        "exact-title"
      ],
      [
        "02bfe5e0-3cab-412d-9f1a-4a255e2fd0ed",
        "aws_instance.dev_vm1",
        "prod-account.tf",
        "exact-title"
      ],
      [
        "07e49279-4122-4ddc-ae62-aa9aa697e2f8",
        "aws_instance.dev_vm2",
        "prod-account.tf",
        "exact-title"
      ],
      [
        "2b80a185-bfe7-46f3-b0ef-24ff013e49d0",
        "aws_instance.staging_vm2",
        "prod-account.tf",
        "exact-title"
      ],
      [
        "4b301033-2e1b-4db8-94f9-d512723b13e0",
        "aws_instance.prod_vm1",
        "prod-account.tf",
        "exact-title"
      ],
      [
        "943ef3bf-c56d-4691-927b-14f5555cf725",
        "aws_instance.prod_vm2",
        "prod-account.tf",
        "exact-title"
      ]
    ],
    presentations: [
      ["258ffd07-ae27-412c-8c6e-192ffbbb76de", "region", "aws-region", null, "Prod account"],
      [
        "4072261f-b484-4e8f-a25d-2e038ba119b4",
        "brainboard_group",
        "design-group",
        null,
        "AWS accounts"
      ],
      ["c50301f8-0517-4fb9-8a05-3123e0c7dedd", "region", "aws-region", null, "Dev account"],
      ["d2ec1630-f50e-4c5f-b898-8a9a65dbb2ce", "region", "aws-region", null, "Staging account"],
      [
        "114ce859-8066-4c14-94da-52b3638dd9ee",
        "availability_zone",
        "aws-availability-zone",
        null,
        "var.az2"
      ],
      [
        "1dba0c64-caab-49ce-b64a-84c2f72ec1cc",
        "availability_zone",
        "aws-availability-zone",
        null,
        "var.az1"
      ],
      [
        "46b74daa-6c97-4991-af63-d172eb3e8b1d",
        "availability_zone",
        "aws-availability-zone",
        null,
        "var.az2"
      ],
      [
        "6c1d860b-04c2-4975-acd9-da97fcb87e28",
        "availability_zone",
        "aws-availability-zone",
        null,
        "var.az1"
      ],
      [
        "8daa8193-2ae3-4554-8bc8-8d5c5ea49fc4",
        "availability_zone",
        "aws-availability-zone",
        null,
        "var.az2"
      ],
      [
        "9a55fdc1-61fd-48dc-ba55-4fd900303cd1",
        "availability_zone",
        "aws-availability-zone",
        null,
        "var.az1"
      ]
    ],
    workspaceOmissions: []
  },
  {
    moduleFileName: "aws-elastic-beanstalk.ts",
    exportName: "awsElasticBeanstalkSource",
    rawFileName: "aws-elastic-beanstalk.json",
    rawCaptureSha256: "ccc3bd7c1d8c30ed8ab074497f9d2cb35f25bee94b2b66849d8d8b4ae9166ea5",
    parentRepairs: new Map([
      ["f2425c88-44c6-439d-b3f3-d8b0f76b130b", null],
      ["7eb561cf-2bc5-4d66-933a-2242b1a6567f", "d40ff46e-9c47-41ae-ac6d-94b6ee7e82a0"],
      ["9a33d988-aa5c-4ab1-9c0e-fd1b80102646", "d40ff46e-9c47-41ae-ac6d-94b6ee7e82a0"]
    ]),
    mappings: [
      ["d40ff46e-9c47-41ae-ac6d-94b6ee7e82a0", "aws_vpc.default", "main.tf", "exact-title"],
      ["5817b9fb-4c2c-4e1f-bb4d-61b71657a381", "aws_subnet.subnet_2a", "main.tf", "exact-title"],
      ["a5c63292-27e8-447b-b4fc-2d231bb3580f", "aws_subnet.subnet_2b", "main.tf", "exact-title"],
      [
        "97044051-a775-4409-8077-9c1e1f468426",
        "aws_internet_gateway.default",
        "main.tf",
        "exact-title"
      ],
      [
        "002f83ee-6206-4b3b-a473-e684f6504631",
        "aws_elastic_beanstalk_environment.default",
        "main.tf",
        "exact-title"
      ],
      [
        "553a42d0-41d3-4c72-a135-0ef20079465d",
        "aws_elastic_beanstalk_application.default",
        "main.tf",
        "single-residual"
      ],
      ["2e07a06a-d2b6-4ae1-9424-895648bce499", "aws_route_table.default", "main.tf", "exact-title"],
      [
        "3657c666-e254-4beb-9895-baef2c9ff360",
        "aws_route_table_association.route_table_association_2b",
        "main.tf",
        "reviewed-override"
      ],
      [
        "5ffcf553-4f13-488e-9f55-675ad24b98fe",
        "aws_route_table_association.route_table_association_2a",
        "main.tf",
        "reviewed-override"
      ]
    ],
    presentations: [
      [
        "f2425c88-44c6-439d-b3f3-d8b0f76b130b",
        "region",
        "aws-region",
        null,
        "Asia Pacific (Sydney)"
      ],
      [
        "21fc0544-3752-484e-8b4b-ba2e5d1a62f4",
        "aws_autoscaling_group",
        "aws-autoscaling-group",
        "aws_elastic_beanstalk_environment.default",
        ""
      ],
      [
        "7eb561cf-2bc5-4d66-933a-2242b1a6567f",
        "availability_zone",
        "aws-availability-zone",
        null,
        "ap-southeast-2a"
      ],
      [
        "9a33d988-aa5c-4ab1-9c0e-fd1b80102646",
        "availability_zone",
        "aws-availability-zone",
        null,
        "ap-southeast-2b"
      ],
      [
        "0b61aaf6-6cd1-497d-8a4d-9df7c71157b1",
        "aws_instance",
        "aws-ec2-instance",
        "aws_elastic_beanstalk_environment.default",
        "t2_7"
      ],
      [
        "1cb32ea4-78fa-41f1-aaa4-8bd6de25c903",
        "aws_instance",
        "aws-ec2-instance",
        "aws_elastic_beanstalk_environment.default",
        "t2_7_c"
      ]
    ],
    workspaceOmissions: [
      {
        fileName: "variables.tf",
        sourceText: '    archuuid = "eb84baae-e3a7-4d39-b80d-a22466e5ea16"\n',
        occurrenceCount: 1
      }
    ]
  },
  {
    moduleFileName: "aws-rds.ts",
    exportName: "awsRdsSource",
    rawFileName: "aws-rds.json",
    rawCaptureSha256: "1f11f380003cd4a2e136837238d2205c1e5f6fcfe093ad5c9915dd2c9885b4de",
    parentRepairs: new Map([
      ["b6bf501a-706d-48c9-b72e-4ab9c89dc437", null],
      ["2adbfb12-8509-4302-9f1d-029292991c80", "a0e46c7b-3b5b-4d6e-8a12-3d468f1dc564"],
      ["8d685e1f-ef90-4fef-afde-9ba043869054", "a0e46c7b-3b5b-4d6e-8a12-3d468f1dc564"]
    ]),
    mappings: [
      ["ac3623f0-25ad-4acb-92d8-0d35223ec63c", "aws_vpc.default", "main.tf", "single-residual"],
      [
        "a0e46c7b-3b5b-4d6e-8a12-3d468f1dc564",
        "aws_security_group.default",
        "main.tf",
        "single-residual"
      ],
      [
        "5b7c9fe1-1c7e-4928-bb43-c3eb0b25f11c",
        "aws_db_subnet_group.default",
        "main.tf",
        "exact-title"
      ],
      [
        "87a87f94-1a87-409c-9228-fca73e37a118",
        "aws_subnet.subnet_w_2a",
        "main.tf",
        "reviewed-override"
      ],
      [
        "b45989bc-c032-4bca-a116-0b5f0ee6c759",
        "aws_subnet.subnet_w_2b",
        "main.tf",
        "reviewed-override"
      ],
      ["4a365324-6e51-43b7-8084-59822f636a0d", "aws_db_instance.db1", "main.tf", "exact-title"],
      [
        "53095c7c-9c63-4973-934d-398e684b2b0a",
        "aws_db_instance.db_replica",
        "main.tf",
        "single-residual"
      ],
      [
        "d25dcc61-c9c3-4b64-922b-cd44cb13798b",
        "aws_db_parameter_group.log_db_parameter",
        "main.tf",
        "single-residual"
      ]
    ],
    presentations: [
      ["b6bf501a-706d-48c9-b72e-4ab9c89dc437", "region", "aws-region", null, "US West (Oregon)"],
      [
        "2adbfb12-8509-4302-9f1d-029292991c80",
        "availability_zone",
        "aws-availability-zone",
        null,
        "us-west-2a"
      ],
      [
        "8d685e1f-ef90-4fef-afde-9ba043869054",
        "availability_zone",
        "aws-availability-zone",
        null,
        "us-west-2b"
      ]
    ],
    workspaceOmissions: [
      {
        fileName: "variables.tf",
        sourceText: '    archuuid = "f588fabc-5991-44de-b9cc-5afd1d74e710"\n',
        occurrenceCount: 1
      }
    ]
  },
  {
    moduleFileName: "aws-fsx.ts",
    exportName: "awsFsxSource",
    rawFileName: "aws-fsx-architecture.json",
    rawCaptureSha256: "e9c85e66b72ade0af4612c6e261daf57f5a3efa8abe0656c6e97c0e6ef84ac95",
    parentRepairs: new Map([
      ["e39ed138-6200-410e-9d54-f567019667b7", null],
      ["9cd19ce4-c2ad-4a31-9a8b-ded606955752", "7e275d52-672d-4e38-b17a-aad1e06c04e8"],
      ["555b4f12-4843-4c1a-aa99-8771f272d00c", "7e275d52-672d-4e38-b17a-aad1e06c04e8"]
    ]),
    mappings: [
      ["7e275d52-672d-4e38-b17a-aad1e06c04e8", "aws_vpc.default", "vpc.tf", "exact-title"],
      [
        "265b7ddb-d288-41f7-8459-7d3ace1c30b9",
        "aws_subnet.public_a",
        "public.tf",
        "reviewed-override"
      ],
      [
        "2702e115-2e4a-4d50-9424-59b727352c73",
        "aws_subnet.public_b",
        "public.tf",
        "reviewed-override"
      ],
      [
        "b0dc4cbd-651f-42f7-b725-d3e7220d5559",
        "aws_subnet.private_a",
        "private.tf",
        "reviewed-override"
      ],
      [
        "9530b9bb-8579-4ae9-ae26-fa12f94a4068",
        "aws_subnet.private_b",
        "private.tf",
        "reviewed-override"
      ],
      ["48a880f1-2fcf-4c52-9018-1f5af605f205", "aws_security_group.fsx", "main.tf", "exact-title"],
      [
        "6b6b83ad-b493-4db8-ad88-17d2c5e75426",
        "aws_internet_gateway.default",
        "public.tf",
        "single-residual"
      ],
      [
        "19e4afd8-69f2-4959-a167-b8534d802b99",
        "aws_network_acl.public_b",
        "main.tf",
        "reviewed-override"
      ],
      [
        "b8e1ad82-f128-4801-ab61-99638f01082e",
        "aws_network_acl.public_a",
        "main.tf",
        "reviewed-override"
      ],
      ["c7a6ebee-753c-4aab-9075-6ae092cfc4a0", "aws_eip.eip_a", "public.tf", "exact-title"],
      [
        "d7459e44-ed51-418c-805d-3f65ae50de2e",
        "aws_nat_gateway.nat-gw-2a-public",
        "public.tf",
        "exact-title"
      ],
      [
        "0cbffe9f-5ede-4969-b752-e22cb6fadcc2",
        "aws_nat_gateway.nat-gw-2b-public",
        "public.tf",
        "exact-title"
      ],
      [
        "194c263d-746a-43f0-af23-18445c225246",
        "aws_s3_bucket.default",
        "storage.tf",
        "exact-title"
      ],
      ["cd6d6243-292a-4775-baf7-35bcff8f1b56", "aws_s3_bucket.vpc_logs", "vpc.tf", "exact-title"],
      [
        "6273bc80-9064-4f64-802d-e03902cbc52d",
        "aws_s3_bucket_public_access_block.default",
        "storage.tf",
        "reviewed-override"
      ],
      [
        "c0943882-2bf4-415b-83ab-21c7bb692b08",
        "aws_s3_bucket_public_access_block.vpc_logs",
        "vpc.tf",
        "reviewed-override"
      ],
      ["74346525-1052-4a0b-9e90-0253d59203dd", "aws_eip.eip_b", "public.tf", "exact-title"],
      ["f6768a8b-80fa-4dda-a435-32f0c81c5e24", "aws_flow_log.default", "vpc.tf", "single-residual"],
      [
        "c3ae8f08-53e4-4d58-a37c-11e1c914492a",
        "aws_fsx_lustre_file_system.aws_fsx_lustre_file_system_12",
        "main.tf",
        "single-residual"
      ],
      [
        "54dcd23d-fd8e-4f8f-bc56-a81fcde34c8e",
        "aws_s3_bucket_versioning.default",
        "storage.tf",
        "reviewed-override"
      ],
      [
        "c256a91a-8093-495c-b853-e52691c9d8c4",
        "aws_s3_bucket_versioning.vpc_logs",
        "vpc.tf",
        "reviewed-override"
      ],
      [
        "364622cd-cd1c-483a-98b0-60f51b5ecdc9",
        "aws_s3_bucket_server_side_encryption_configuration.default",
        "storage.tf",
        "reviewed-override"
      ],
      [
        "8142cb9b-82c4-4772-a377-7d0162045d7b",
        "aws_s3_bucket_server_side_encryption_configuration.vpc_logs",
        "vpc.tf",
        "reviewed-override"
      ]
    ],
    presentations: [
      ["e39ed138-6200-410e-9d54-f567019667b7", "region", "aws-region", null, "US East (Ohio)"],
      [
        "9cd19ce4-c2ad-4a31-9a8b-ded606955752",
        "availability_zone",
        "aws-availability-zone",
        null,
        "us-east-2a"
      ],
      [
        "555b4f12-4843-4c1a-aa99-8771f272d00c",
        "availability_zone",
        "aws-availability-zone",
        null,
        "us-east-2b"
      ],
      ["6a076cc5-40f2-4be7-b5b1-989687a1b017", "text", null, null, ""],
      ["78a94b1f-80ba-46b1-8204-1072ca27b91d", "text", null, null, ""],
      [
        "064d4e6f-a4bb-4041-8104-da21f1dd5bfb",
        "brainboard_icon",
        "design-internet",
        null,
        "Internet"
      ],
      [
        "d0683fa2-c9a4-4966-9b98-ffa6892efa08",
        "aws_fsx_lustre_file_system",
        "aws-fsx-lustre-file-system",
        "aws_fsx_lustre_file_system.aws_fsx_lustre_file_system_12",
        "FSX lustre FS mono-subnet"
      ]
    ],
    workspaceOmissions: [
      {
        fileName: "variables.tf",
        sourceText: '    archuuid = "a1a4b134-bc00-4f97-82b8-46346da8ecde"\n',
        occurrenceCount: 1
      }
    ]
  }
] as const satisfies readonly FixtureExpectation[];

const loadedModules = await Promise.all(
  expectations.map(async ({ moduleFileName }) => {
    try {
      return (await import(new URL(moduleFileName, import.meta.url).href)) as Record<
        string,
        unknown
      >;
    } catch {
      return null;
    }
  })
);

test("ranks 17-20 generated source modules exist in manifest order", () => {
  assert.deepEqual(
    loadedModules.map((module, index) => {
      const expectation = expectations[index]!;
      assert.ok(module, `${expectation.moduleFileName} must be generated`);
      const source = module[expectation.exportName] as BrainboardTemplateSource | undefined;
      assert.ok(source, `${expectation.exportName} must be exported`);
      return source.id;
    }),
    [
      "brainboard-aws-multi-account-management",
      "brainboard-aws-elastic-beanstalk",
      "brainboard-aws-rds",
      "brainboard-aws-fsx"
    ]
  );
});

test("ranks 17-20 preserve exact raw graphs, files, addresses, and all 18 parent repairs", () => {
  for (const [index, expectation] of expectations.entries()) {
    verifyFixture(requireSource(index), expectation);
  }
  const sources = expectations.map((_, index) => requireSource(index));
  assert.deepEqual(
    [
      sources.reduce((sum, source) => sum + source.nodes.length, 0),
      sources.reduce((sum, source) => sum + source.edges.length, 0),
      sources.reduce((sum, source) => sum + source.terraform.files.length, 0),
      sources.reduce((sum, source) => sum + source.terraform.resourceAddresses.length, 0),
      expectations.reduce((sum, expectation) => sum + expectation.parentRepairs.size, 0)
    ],
    [84, 27, 34, 58, 18]
  );
});

test("managed Beanstalk and duplicate FSx visuals are reviewed aliases, never fake resources", () => {
  const aliases = [requireSource(1), requireSource(3)]
    .flatMap((source) => source.nodes)
    .filter(isPresentationNode)
    .filter(({ aliasOf }) => aliasOf !== null)
    .map(({ sourceNodeId, catalogId, aliasOf, label }) => [
      sourceNodeId,
      catalogId,
      aliasOf,
      label
    ]);
  assert.deepEqual(aliases, [
    [
      "21fc0544-3752-484e-8b4b-ba2e5d1a62f4",
      "aws-autoscaling-group",
      "aws_elastic_beanstalk_environment.default",
      ""
    ],
    [
      "0b61aaf6-6cd1-497d-8a4d-9df7c71157b1",
      "aws-ec2-instance",
      "aws_elastic_beanstalk_environment.default",
      "t2_7"
    ],
    [
      "1cb32ea4-78fa-41f1-aaa4-8bd6de25c903",
      "aws-ec2-instance",
      "aws_elastic_beanstalk_environment.default",
      "t2_7_c"
    ],
    [
      "d0683fa2-c9a4-4966-9b98-ffa6892efa08",
      "aws-fsx-lustre-file-system",
      "aws_fsx_lustre_file_system.aws_fsx_lustre_file_system_12",
      "FSX lustre FS mono-subnet"
    ]
  ]);
  assert.ok(
    [requireSource(0), requireSource(2)]
      .flatMap((source) => source.nodes)
      .filter(isPresentationNode)
      .every(({ aliasOf }) => aliasOf === null)
  );
});

test("rank 20 preserves two unlabeled text visuals and both authored -90 degree rotations", () => {
  const source = requireSource(3);
  assert.deepEqual(
    source.nodes
      .filter(isPresentationNode)
      .filter(({ rawResourceType }) => rawResourceType === "text")
      .map(({ sourceNodeId, label, catalogId, aliasOf, style }) => [
        sourceNodeId,
        label,
        catalogId,
        aliasOf,
        style
      ]),
    [
      ["6a076cc5-40f2-4be7-b5b1-989687a1b017", "", null, null, null],
      ["78a94b1f-80ba-46b1-8204-1072ca27b91d", "", null, null, null]
    ]
  );
  assert.deepEqual(
    source.nodes
      .filter(({ rotation }) => rotation !== 0)
      .map(({ sourceNodeId, rotation }) => [sourceNodeId, rotation]),
    [
      ["c7a6ebee-753c-4aab-9075-6ae092cfc4a0", -90],
      ["74346525-1052-4a0b-9e90-0253d59203dd", -90]
    ]
  );
});

test("workspace seeds omit exactly three reviewed included-file UUID occurrences", () => {
  let omissionCount = 0;
  for (const [index, expectation] of expectations.entries()) {
    const source = requireSource(index);
    for (const file of source.terraform.files) {
      const omissions = expectation.workspaceOmissions.filter(
        (item) => item.fileName === file.fileName
      );
      if (omissions.length === 0) {
        assert.equal(file.workspaceSeed, undefined, `${expectation.rawFileName}:${file.fileName}`);
        continue;
      }
      assert.ok(file.includeInWorkspace);
      assert.ok(file.workspaceSeed);
      let expectedCode = file.code;
      for (const omission of omissions) {
        omissionCount += omission.occurrenceCount;
        assert.equal(countOccurrences(expectedCode, omission.sourceText), omission.occurrenceCount);
        expectedCode = expectedCode.split(omission.sourceText).join("");
      }
      assert.equal(file.workspaceSeed.code, expectedCode);
      assert.equal(file.workspaceSeed.sha256, sha256(expectedCode));
      assert.deepEqual(
        file.workspaceSeed.omissions,
        omissions.map(({ sourceText, occurrenceCount }) => ({
          reason: "brainboard-architecture-uuid",
          sourceText,
          occurrenceCount
        }))
      );
      assert.doesNotMatch(file.workspaceSeed.code, /\barchUUID\s*=|\barchuuid\s*=/u);
    }
    const excludedTfvars = source.terraform.files.find(
      ({ fileName }) => fileName === "terraform.tfvars"
    );
    assert.ok(excludedTfvars);
    assert.equal(excludedTfvars.includeInWorkspace, false);
    assert.match(excludedTfvars.code, /\barchuuid\s*=\s*"[0-9a-f-]+"/u);
    assert.equal(excludedTfvars.workspaceSeed, undefined);
  }
  assert.equal(omissionCount, 3);
});

function verifyFixture(source: BrainboardTemplateSource, expectation: FixtureExpectation): void {
  const rawBytes = readFileSync(new URL(expectation.rawFileName, captureDirectory));
  const raw = JSON.parse(rawBytes.toString("utf8")) as RawCapture;
  assert.equal(sha256(rawBytes), expectation.rawCaptureSha256);
  assert.equal(source.id, raw.id);
  assert.equal(source.title, raw.title);
  assert.equal(source.captureStatus, raw.status);
  assert.equal(source.provider, raw.provider);
  assert.equal(source.description, null);
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
      parentSourceNodeId: expectation.parentRepairs.has(node.sourceNodeId)
        ? expectation.parentRepairs.get(node.sourceNodeId)!
        : node.parentSourceNodeId,
      zIndex: node.order,
      rawTransform: node.transform,
      rotation: parseRotation(node.transform),
      rawResourceType: node.resourceType
    }))
  );
  assert.deepEqual(source.edges, raw.edges.map(normalizeRawEdge));
  assert.deepEqual(
    source.terraform.files.map(rawFileProjection),
    raw.terraform.files.map(rawFileProjection)
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
    expectation.mappings
  );
  assert.deepEqual(
    source.nodes
      .filter(isPresentationNode)
      .map((node) => [
        node.sourceNodeId,
        node.rawResourceType,
        node.catalogId,
        node.aliasOf,
        node.label
      ]),
    expectation.presentations
  );
  assert.deepEqual(
    new Set(expectation.mappings.map(([, address]) => address)),
    new Set(raw.terraform.resourceAddresses)
  );
  assert.equal(
    new Set(expectation.mappings.map(([, address]) => address)).size,
    expectation.mappings.length
  );
  assert.ok(
    source.nodes
      .filter(isResourceNode)
      .every(
        (node) =>
          node.valuesResolution === "source-file-authoritative/unresolved" && !("values" in node)
      )
  );
  assert.ok(source.nodes.filter(isPresentationNode).every(({ style }) => style === null));
  assert.deepEqual(findParentCycles(source.nodes), []);
}

function requireSource(index: number): BrainboardTemplateSource {
  const expectation = expectations[index]!;
  const module = loadedModules[index];
  assert.ok(module, `${expectation.moduleFileName} must be generated`);
  const source = module[expectation.exportName] as BrainboardTemplateSource | undefined;
  assert.ok(source, `${expectation.exportName} must be exported`);
  return source;
}

function commonNodeProjection(node: BrainboardSourceNode) {
  return {
    sourceNodeId: node.sourceNodeId,
    domOrder: node.domOrder,
    label: node.label,
    position: node.position,
    size: node.size,
    parentSourceNodeId: node.parentSourceNodeId,
    zIndex: node.zIndex,
    rawTransform: node.rawTransform,
    rotation: node.rotation,
    rawResourceType: node.kind === "resource" ? node.terraformResourceType : node.rawResourceType
  };
}

function normalizeRawEdge(edge: RawEdge): BrainboardSourceEdge {
  return {
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
    arrowAngle:
      edge.arrow === null ? 0 : Number(/rotate\(([^,]+)/u.exec(edge.arrow.transform)?.[1]),
    rawArrow: edge.arrow
  };
}

function rawFileProjection(file: BrainboardTerraformFile) {
  return {
    fileName: file.fileName,
    code: file.code,
    sha256: file.sha256,
    includeInWorkspace: file.includeInWorkspace
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
  return Number(x) === edge.targetPoint.x && Number(y) === edge.targetPoint.y
    ? "source-to-target"
    : "target-to-source";
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

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
