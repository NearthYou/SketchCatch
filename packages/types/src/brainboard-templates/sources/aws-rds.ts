import { defineCapturedBrainboardTemplate } from "./define-source.ts";

export const awsRdsSource = defineCapturedBrainboardTemplate({
  id: "brainboard-aws-rds",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "f588fabc-5991-44de-b9cc-5afd1d74e710",
    sourceUrl: "https://app.brainboard.co/templates/f588fabc-5991-44de-b9cc-5afd1d74e710",
    cloneArchitectureId: "9930ecc2-a7d0-4b15-abb7-2838e5870c66",
    downloads: 203,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "AWS RDS",
  description: null,
  provider: "aws",
  viewport: {
    x: -1108.62,
    y: -679.42,
    width: 4164.387096774193,
    height: 2278.8451612903223
  },
  nodes: [
    {
      sourceNodeId: "b6bf501a-706d-48c9-b72e-4ab9c89dc437",
      domOrder: 0,
      label: "US West (Oregon)",
      position: {
        x: 90,
        y: -230
      },
      size: {
        width: 1530,
        height: 1360
      },
      parentSourceNodeId: null,
      zIndex: 0,
      rawTransform: "translate(90, -230), rotate(0 765 680)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "ac3623f0-25ad-4acb-92d8-0d35223ec63c",
      domOrder: 1,
      label: "RDS VPC",
      position: {
        x: 150,
        y: -170
      },
      size: {
        width: 1405,
        height: 1245
      },
      parentSourceNodeId: "b6bf501a-706d-48c9-b72e-4ab9c89dc437",
      zIndex: 1,
      rawTransform: "translate(150, -170), rotate(0 702.5 622.5)",
      rotation: 0,
      rawResourceType: "aws_vpc"
    },
    {
      sourceNodeId: "a0e46c7b-3b5b-4d6e-8a12-3d468f1dc564",
      domOrder: 2,
      label: "PostgreSQL SG",
      position: {
        x: 213,
        y: -85
      },
      size: {
        width: 1255,
        height: 1080
      },
      parentSourceNodeId: "ac3623f0-25ad-4acb-92d8-0d35223ec63c",
      zIndex: 2,
      rawTransform: "translate(213, -85), rotate(0 627.5 540)",
      rotation: 0,
      rawResourceType: "aws_security_group"
    },
    {
      sourceNodeId: "2adbfb12-8509-4302-9f1d-029292991c80",
      domOrder: 3,
      label: "AZ us-west-2a",
      position: {
        x: 315,
        y: 0
      },
      size: {
        width: 295,
        height: 480
      },
      parentSourceNodeId: "a0e46c7b-3b5b-4d6e-8a12-3d468f1dc564",
      zIndex: 3,
      rawTransform: "translate(315, 0), rotate(0 147.5 240)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "5b7c9fe1-1c7e-4928-bb43-c3eb0b25f11c",
      domOrder: 4,
      label: "PostgreSQL DB Subnet Group",
      position: {
        x: 660,
        y: 195
      },
      size: {
        width: 160,
        height: 90
      },
      parentSourceNodeId: "ac3623f0-25ad-4acb-92d8-0d35223ec63c",
      zIndex: 4,
      rawTransform: "translate(660, 195), rotate(0 80 45)",
      rotation: 0,
      rawResourceType: "aws_db_subnet_group"
    },
    {
      sourceNodeId: "8d685e1f-ef90-4fef-afde-9ba043869054",
      domOrder: 5,
      label: "AZ us-west-2b",
      position: {
        x: 880,
        y: 0
      },
      size: {
        width: 310,
        height: 480
      },
      parentSourceNodeId: "a0e46c7b-3b5b-4d6e-8a12-3d468f1dc564",
      zIndex: 5,
      rawTransform: "translate(880, 0), rotate(0 155 240)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "87a87f94-1a87-409c-9228-fca73e37a118",
      domOrder: 6,
      label: "DB Subnet A",
      position: {
        x: 335,
        y: 140
      },
      size: {
        width: 250,
        height: 200
      },
      parentSourceNodeId: "2adbfb12-8509-4302-9f1d-029292991c80",
      zIndex: 6,
      rawTransform: "translate(335, 140), rotate(0 125 100)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "b45989bc-c032-4bca-a116-0b5f0ee6c759",
      domOrder: 7,
      label: "DB Subnet B",
      position: {
        x: 915,
        y: 140
      },
      size: {
        width: 250,
        height: 200
      },
      parentSourceNodeId: "8d685e1f-ef90-4fef-afde-9ba043869054",
      zIndex: 7,
      rawTransform: "translate(915, 140), rotate(0 125 100)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "4a365324-6e51-43b7-8084-59822f636a0d",
      domOrder: 8,
      label: "PostgreSQL Primary DB",
      position: {
        x: 710,
        y: 570
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "ac3623f0-25ad-4acb-92d8-0d35223ec63c",
      zIndex: 8,
      rawTransform: "translate(710, 570), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_db_instance"
    },
    {
      sourceNodeId: "53095c7c-9c63-4973-934d-398e684b2b0a",
      domOrder: 9,
      label: "PostgreSQL Read Replica",
      position: {
        x: 1145,
        y: 720
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "ac3623f0-25ad-4acb-92d8-0d35223ec63c",
      zIndex: 9,
      rawTransform: "translate(1145, 720), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_db_instance"
    },
    {
      sourceNodeId: "d25dcc61-c9c3-4b64-922b-cd44cb13798b",
      domOrder: 10,
      label: "PostgreSQL 연결 로그 설정",
      position: {
        x: 710,
        y: 850
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "ac3623f0-25ad-4acb-92d8-0d35223ec63c",
      zIndex: 10,
      rawTransform: "translate(710, 850), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_db_parameter_group"
    }
  ],
  edges: [
    {
      sourceEdgeId: "94614b0a-600a-4956-84a3-34157314bf0e",
      domOrder: 0,
      zIndex: 0,
      sourceNodeId: "53095c7c-9c63-4973-934d-398e684b2b0a",
      targetNodeId: "d25dcc61-c9c3-4b64-922b-cd44cb13798b",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M1145,750 L965.5,750 Q957.5,750 957.5,758 L957.5,872 Q957.5,880 949.5,880 L770,880",
      sourcePoint: {
        x: 1145,
        y: 750
      },
      targetPoint: {
        x: 770,
        y: 880
      },
      waypoints: [
        {
          x: 1145,
          y: 750
        },
        {
          x: 965.5,
          y: 750
        },
        {
          x: 957.5,
          y: 750
        },
        {
          x: 957.5,
          y: 758
        },
        {
          x: 957.5,
          y: 872
        },
        {
          x: 957.5,
          y: 880
        },
        {
          x: 949.5,
          y: 880
        },
        {
          x: 770,
          y: 880
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            1140,745\n            1145,750\n            1140,755\n          ",
        transform: "rotate(0, 1145, 750)"
      }
    },
    {
      sourceEdgeId: "952c3f17-d3b6-4519-8f4d-5b637ec4f299",
      domOrder: 1,
      zIndex: 1,
      sourceNodeId: "53095c7c-9c63-4973-934d-398e684b2b0a",
      targetNodeId: "4a365324-6e51-43b7-8084-59822f636a0d",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M1145,750 L965.5,750 Q957.5,750 957.5,742 L957.5,608 Q957.5,600 949.5,600 L770,600",
      sourcePoint: {
        x: 1145,
        y: 750
      },
      targetPoint: {
        x: 770,
        y: 600
      },
      waypoints: [
        {
          x: 1145,
          y: 750
        },
        {
          x: 965.5,
          y: 750
        },
        {
          x: 957.5,
          y: 750
        },
        {
          x: 957.5,
          y: 742
        },
        {
          x: 957.5,
          y: 608
        },
        {
          x: 957.5,
          y: 600
        },
        {
          x: 949.5,
          y: 600
        },
        {
          x: 770,
          y: 600
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            1140,745\n            1145,750\n            1140,755\n          ",
        transform: "rotate(0, 1145, 750)"
      }
    },
    {
      sourceEdgeId: "b3e95a39-1480-44d6-a174-78463f37a5d3",
      domOrder: 2,
      zIndex: 2,
      sourceNodeId: "4a365324-6e51-43b7-8084-59822f636a0d",
      targetNodeId: "d25dcc61-c9c3-4b64-922b-cd44cb13798b",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M740,630 L740,850",
      sourcePoint: {
        x: 740,
        y: 630
      },
      targetPoint: {
        x: 740,
        y: 850
      },
      waypoints: [
        {
          x: 740,
          y: 630
        },
        {
          x: 740,
          y: 850
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            735,625\n            740,630\n            735,635\n          ",
        transform: "rotate(-90, 740, 630)"
      }
    },
    {
      sourceEdgeId: "ccb52080-a71c-4122-9786-07b179f798c4",
      domOrder: 3,
      zIndex: 3,
      sourceNodeId: "4a365324-6e51-43b7-8084-59822f636a0d",
      targetNodeId: "5b7c9fe1-1c7e-4928-bb43-c3eb0b25f11c",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M740,570 L740,285",
      sourcePoint: {
        x: 740,
        y: 570
      },
      targetPoint: {
        x: 740,
        y: 285
      },
      waypoints: [
        {
          x: 740,
          y: 570
        },
        {
          x: 740,
          y: 285
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            735,565\n            740,570\n            735,575\n          ",
        transform: "rotate(90, 740, 570)"
      }
    },
    {
      sourceEdgeId: "ee4b43d4-291e-418a-b88f-c138ffb85d56",
      domOrder: 4,
      zIndex: 4,
      sourceNodeId: "5b7c9fe1-1c7e-4928-bb43-c3eb0b25f11c",
      targetNodeId: "b45989bc-c032-4bca-a116-0b5f0ee6c759",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M820,240 L915,240",
      sourcePoint: {
        x: 820,
        y: 240
      },
      targetPoint: {
        x: 915,
        y: 240
      },
      waypoints: [
        {
          x: 820,
          y: 240
        },
        {
          x: 915,
          y: 240
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            815,235\n            820,240\n            815,245\n          ",
        transform: "rotate(180, 820, 240)"
      }
    },
    {
      sourceEdgeId: "f0242dea-e949-4db4-9d81-ccab9ddc9f13",
      domOrder: 5,
      zIndex: 5,
      sourceNodeId: "5b7c9fe1-1c7e-4928-bb43-c3eb0b25f11c",
      targetNodeId: "87a87f94-1a87-409c-9228-fca73e37a118",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M660,240 L585,240",
      sourcePoint: {
        x: 660,
        y: 240
      },
      targetPoint: {
        x: 585,
        y: 240
      },
      waypoints: [
        {
          x: 660,
          y: 240
        },
        {
          x: 585,
          y: 240
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            655,235\n            660,240\n            655,245\n          ",
        transform: "rotate(0, 660, 240)"
      }
    }
  ],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_vpc" "default" {\n  cidr_block = var.vpc_cird\n\n  tags = {\n    Env = "Dev"\n  }\n}\n\nresource "aws_db_subnet_group" "default" {\n  name        = "default_subnet_group"\n  description = "The default subnet group for all DBs in this architecture"\n\n  subnet_ids = [\n    aws_subnet.subnet_w_2a.id,\n    aws_subnet.subnet_w_2b.id,\n    aws_subnet.subnet_w_2a.id, aws_subnet.subnet_w_2b.id,\n  ]\n\n  tags = {\n    env = "Dev"\n  }\n}\n\nresource "aws_subnet" "subnet_w_2a" {\n  vpc_id            = aws_vpc.default.id\n  cidr_block        = var.subnets.w_2a\n  availability_zone = "us-west-2a"\n\n  tags = {\n    env = "Dev"\n  }\n}\n\nresource "aws_subnet" "subnet_w_2b" {\n  vpc_id            = aws_vpc.default.id\n  cidr_block        = var.subnets.w_2b\n  availability_zone = "us-west-2b"\n\n  tags = {\n    env = "Dev"\n  }\n}\n\nresource "aws_db_instance" "db1" {\n  username             = "brainboard"\n  skip_final_snapshot  = true\n  publicly_accessible  = true\n  password             = var.db_password\n  parameter_group_name = aws_db_parameter_group.log_db_parameter.name\n  instance_class       = var.instance_class\n  engine_version       = "13.1"\n  engine               = "postgres"\n  db_subnet_group_name = aws_db_subnet_group.default.name\n  allocated_storage    = 50\n\n  tags = {\n    env = "Dev"\n  }\n\n  vpc_security_group_ids = [\n    aws_security_group.default.id,\n    aws_security_group.default.id,\n  ]\n}\n\nresource "aws_security_group" "default" {\n  vpc_id      = aws_vpc.default.id\n  name        = "default_db_sg"\n  description = "Default sg for the database"\n\n  ingress {\n    to_port     = var.db_port\n    protocol    = "tcp"\n    from_port   = var.db_port\n    description = "Allow connections to the database"\n\n    security_groups = [\n    ]\n  }\n\n  tags = {\n    env = "Dev"\n  }\n}\n\nresource "aws_db_parameter_group" "log_db_parameter" {\n  name   = "logs"\n  family = "postgres13"\n\n  parameter {\n    value = "1"\n    name  = "log_connections"\n  }\n\n  tags = {\n    env = "Dev"\n  }\n}\n\nresource "aws_db_instance" "db_replica" {\n  skip_final_snapshot  = true\n  replicate_source_db  = aws_db_instance.db1.identifier\n  publicly_accessible  = true\n  parameter_group_name = aws_db_parameter_group.log_db_parameter.name\n  instance_class       = var.instance_class\n  identifier           = "db-replica"\n  apply_immediately    = true\n\n  tags = {\n    replica = "true"\n    env     = "Dev"\n  }\n\n  vpc_security_group_ids = [\n    aws_security_group.default.id,\n  ]\n}\n\n',
        sha256: "a0063ceaebf8d308d49fcdfbb9bf9a55f3844dc203965f6aecd2f96dbca4bc7d",
        includeInWorkspace: true
      },
      {
        fileName: "backend.tf",
        code: "# This architecture uses Brainboard managed storage\n",
        sha256: "9bd86a80fa787dddd0ec09ee56ad995ddc8e504826d124a2fa09717444751c31",
        includeInWorkspace: false
      },
      {
        fileName: "locals.tf",
        code: "locals {\n}\n",
        sha256: "0b88e8de9a5058ee4a8129450c5c0561b6a0d9306f454517271927ccdcc347f5",
        includeInWorkspace: true
      },
      {
        fileName: "outputs.tf",
        code: 'output "default_rds_hostname" {\n  description = "The hostname of the default DB"\n  value       = aws_db_instance.db1.address\n}\n\n',
        sha256: "7ea5d0a951ef7d3b5e06e4ca581f8190d991974cc3f02865556dbb2a2f094ca3",
        includeInWorkspace: true
      },
      {
        fileName: "providers.tf",
        code: 'terraform {\n  required_providers {\n    aws = {\n      version = "= 5.52.0"\n    }\n  }\n}\n\nprovider "aws" {\n  region = "us-west-2"\n}\n',
        sha256: "133bc1dc09e69f5e2d57e5c125c7dfd877dfd463dfc3cf53e29849283c03b253",
        includeInWorkspace: true
      },
      {
        fileName: "terraform.tfvars",
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "9930ecc2-a7d0-4b15-abb7-2838e5870c66"\n  env      = "Production"\n}\n',
        sha256: "e94a3f9d834fe9ee0b8f775e28965396d344b1e117270736607406a2ee4a106d",
        includeInWorkspace: false
      },
      {
        fileName: "variables.tf",
        code: 'variable "db_password" {\n  description = "The password of the database"\n  type        = string\n  default     = "changeme123"\n  sensitive   = true\n}\n\nvariable "db_port" {\n  type      = string\n  default   = "5432"\n  sensitive = true\n}\n\nvariable "instance_class" {\n  type    = string\n  default = "db.t3.micro"\n}\n\nvariable "subnets" {\n  type = map\n  default = {\n    w_2a = "10.0.1.0/24"\n    w_2b = "10.0.2.0/24"\n  }\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    archuuid = "f588fabc-5991-44de-b9cc-5afd1d74e710"\n    env      = "Development"\n  }\n}\n\nvariable "vpc_cird" {\n  description = "The default VPC of the database"\n  type        = string\n  default     = "10.0.0.0/16"\n}\n\n',
        sha256: "b04ac4d7e0c795082538d9521b47bb58619b91495c53095443097d6b6360bcaf",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'variable "db_password" {\n  description = "The password of the database"\n  type        = string\n  default     = "changeme123"\n  sensitive   = true\n}\n\nvariable "db_port" {\n  type      = string\n  default   = "5432"\n  sensitive = true\n}\n\nvariable "instance_class" {\n  type    = string\n  default = "db.t3.micro"\n}\n\nvariable "subnets" {\n  type = map\n  default = {\n    w_2a = "10.0.1.0/24"\n    w_2b = "10.0.2.0/24"\n  }\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    env      = "Development"\n  }\n}\n\nvariable "vpc_cird" {\n  description = "The default VPC of the database"\n  type        = string\n  default     = "10.0.0.0/16"\n}\n\n',
          sha256: "c4fa7ae203f8f40d0d5eb56e1b31ec9d6b2237f1675254856a516a2512e31695",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archuuid = "f588fabc-5991-44de-b9cc-5afd1d74e710"\n',
              occurrenceCount: 1
            }
          ]
        }
      }
    ],
    resourceAddresses: [
      "aws_vpc.default",
      "aws_db_subnet_group.default",
      "aws_subnet.subnet_w_2a",
      "aws_subnet.subnet_w_2b",
      "aws_db_instance.db1",
      "aws_security_group.default",
      "aws_db_parameter_group.log_db_parameter",
      "aws_db_instance.db_replica"
    ]
  },
  bindings: {
    "b6bf501a-706d-48c9-b72e-4ab9c89dc437": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "ac3623f0-25ad-4acb-92d8-0d35223ec63c": {
      kind: "resource",
      address: "aws_vpc.default",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "a0e46c7b-3b5b-4d6e-8a12-3d468f1dc564": {
      kind: "resource",
      address: "aws_security_group.default",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "2adbfb12-8509-4302-9f1d-029292991c80": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "5b7c9fe1-1c7e-4928-bb43-c3eb0b25f11c": {
      kind: "resource",
      address: "aws_db_subnet_group.default",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "8d685e1f-ef90-4fef-afde-9ba043869054": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "87a87f94-1a87-409c-9228-fca73e37a118": {
      kind: "resource",
      address: "aws_subnet.subnet_w_2a",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "b45989bc-c032-4bca-a116-0b5f0ee6c759": {
      kind: "resource",
      address: "aws_subnet.subnet_w_2b",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "4a365324-6e51-43b7-8084-59822f636a0d": {
      kind: "resource",
      address: "aws_db_instance.db1",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "53095c7c-9c63-4973-934d-398e684b2b0a": {
      kind: "resource",
      address: "aws_db_instance.db_replica",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "d25dcc61-c9c3-4b64-922b-cd44cb13798b": {
      kind: "resource",
      address: "aws_db_parameter_group.log_db_parameter",
      fileName: "main.tf",
      addressMapping: "single-residual"
    }
  }
});
