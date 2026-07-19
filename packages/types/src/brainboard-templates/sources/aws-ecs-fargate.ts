import { defineCapturedBrainboardTemplate } from "./define-source.ts";

export const awsEcsFargateSource = defineCapturedBrainboardTemplate({
  id: "brainboard-aws-ecs-fargate",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "18b7b40a-8493-4ebb-ad21-0eb85f6ae257",
    sourceUrl: "https://app.brainboard.co/templates/18b7b40a-8493-4ebb-ad21-0eb85f6ae257",
    cloneArchitectureId: "378147c7-b7ad-4bde-b6a5-485db2038eb5",
    downloads: 280,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "AWS ECS with Fargate",
  description: null,
  provider: "aws",
  viewport: {
    x: -940.73,
    y: -561.79,
    width: 4280.5161290322585,
    height: 2342.393548387097
  },
  nodes: [
    {
      sourceNodeId: "5ba31e54-d954-4cba-a521-3f11291d0ed7",
      domOrder: 0,
      label: "US West (Oregon)",
      position: {
        x: 290.1519485675814,
        y: 54.40406376280454
      },
      size: {
        width: 1575,
        height: 1090
      },
      parentSourceNodeId: null,
      zIndex: 0,
      rawTransform: "translate(290.1519485675814, 54.40406376280454), rotate(0 787.5 545)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "162f4029-6160-4b56-80d0-e6de1b294c83",
      domOrder: 1,
      label: "ECS VPC",
      position: {
        x: 390.1519485675814,
        y: 184.40406376280453
      },
      size: {
        width: 1020,
        height: 850
      },
      parentSourceNodeId: "5ba31e54-d954-4cba-a521-3f11291d0ed7",
      zIndex: 1,
      rawTransform: "translate(390.1519485675814, 184.40406376280453), rotate(0 510 425)",
      rotation: 0,
      rawResourceType: "aws_vpc"
    },
    {
      sourceNodeId: "1eca88fe-e8bd-4240-856e-92e7187e1114",
      domOrder: 2,
      label: "ECS Service SG",
      position: {
        x: 450.1519485675814,
        y: 374.4040637628045
      },
      size: {
        width: 820,
        height: 585
      },
      parentSourceNodeId: "162f4029-6160-4b56-80d0-e6de1b294c83",
      zIndex: 2,
      rawTransform: "translate(450.1519485675814, 374.4040637628045), rotate(0 410 292.5)",
      rotation: 0,
      rawResourceType: "aws_security_group"
    },
    {
      sourceNodeId: "5b67f9b3-34fa-4d25-9451-471ad56e4291",
      domOrder: 3,
      label: "ECS Subnet",
      position: {
        x: 540.1519485675815,
        y: 474.4040637628045
      },
      size: {
        width: 475,
        height: 370
      },
      parentSourceNodeId: "162f4029-6160-4b56-80d0-e6de1b294c83",
      zIndex: 3,
      rawTransform: "translate(540.1519485675815, 474.4040637628045), rotate(0 237.5 185)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "5a76bfb2-b71d-4cbc-919e-3611a1b70e1e",
      domOrder: 4,
      label: "Fargate Task Definition",
      position: {
        x: 1480.1519485675817,
        y: 574.4040637628045
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "5ba31e54-d954-4cba-a521-3f11291d0ed7",
      zIndex: 4,
      rawTransform: "translate(1480.1519485675815, 574.4040637628045), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_ecs_task_definition"
    },
    {
      sourceNodeId: "aedad806-5d41-458e-82d0-58daac33cc37",
      domOrder: 5,
      label: "ECS Task IAM Role",
      position: {
        x: 1480.1519485675817,
        y: 754.4040637628045
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "5ba31e54-d954-4cba-a521-3f11291d0ed7",
      zIndex: 5,
      rawTransform: "translate(1480.1519485675815, 754.4040637628045), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_role"
    },
    {
      sourceNodeId: "f005a130-edd2-4747-8956-e1d409272c67",
      domOrder: 6,
      label: "ECS Task 실행 권한 연결",
      position: {
        x: 1690.1519485675817,
        y: 754.4040637628045
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "5ba31e54-d954-4cba-a521-3f11291d0ed7",
      zIndex: 6,
      rawTransform: "translate(1690.1519485675815, 754.4040637628045), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_role_policy_attachment"
    },
    {
      sourceNodeId: "2eb5aa4e-4e9a-4d27-ae3a-3b10469e02a1",
      domOrder: 7,
      label: "ECS Cluster",
      position: {
        x: 845.1519485675815,
        y: 274.4040637628045
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "162f4029-6160-4b56-80d0-e6de1b294c83",
      zIndex: 7,
      rawTransform: "translate(845.1519485675815, 274.4040637628045), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_ecs_cluster"
    },
    {
      sourceNodeId: "fef60bd4-81d1-4069-a6bd-01727d5903e4",
      domOrder: 8,
      label: "Internet Gateway",
      position: {
        x: 850.1519485675815,
        y: 154.40406376280453
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "162f4029-6160-4b56-80d0-e6de1b294c83",
      zIndex: 8,
      rawTransform: "translate(850.1519485675815, 154.40406376280453), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_internet_gateway"
    },
    {
      sourceNodeId: "fd1b2a28-24e2-4d3e-a14d-6560424de9bd",
      domOrder: 9,
      label: "Fargate Service",
      position: {
        x: 845.1519485675815,
        y: 574.4040637628045
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "5b67f9b3-34fa-4d25-9451-471ad56e4291",
      zIndex: 9,
      rawTransform: "translate(845.1519485675815, 574.4040637628045), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_ecs_service"
    }
  ],
  edges: [
    {
      sourceEdgeId: "1573bacd-1ac3-4a6c-ad2a-4abb0d28062e",
      domOrder: 0,
      zIndex: 0,
      sourceNodeId: "fd1b2a28-24e2-4d3e-a14d-6560424de9bd",
      targetNodeId: "5a76bfb2-b71d-4cbc-919e-3611a1b70e1e",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M905.1519485675815,604.4040637628045 L1480.1519485675815,604.4040637628045",
      sourcePoint: {
        x: 905.1519485675815,
        y: 604.4040637628045
      },
      targetPoint: {
        x: 1480.1519485675815,
        y: 604.4040637628045
      },
      waypoints: [
        {
          x: 905.1519485675815,
          y: 604.4040637628045
        },
        {
          x: 1480.1519485675815,
          y: 604.4040637628045
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            1475.1519485675815,599.4040637628045\n            1480.1519485675815,604.4040637628045\n            1475.1519485675815,609.4040637628045\n          ",
        transform: "rotate(0, 1480.1519485675815, 604.4040637628045)"
      }
    },
    {
      sourceEdgeId: "5e466cc9-4c9a-403e-b550-60126c2aa73d",
      domOrder: 1,
      zIndex: 1,
      sourceNodeId: "fd1b2a28-24e2-4d3e-a14d-6560424de9bd",
      targetNodeId: "2eb5aa4e-4e9a-4d27-ae3a-3b10469e02a1",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M875.1519485675815,574.4040637628045 L875.1519485675815,334.4040637628045",
      sourcePoint: {
        x: 875.1519485675815,
        y: 574.4040637628045
      },
      targetPoint: {
        x: 875.1519485675815,
        y: 334.4040637628045
      },
      waypoints: [
        {
          x: 875.1519485675815,
          y: 574.4040637628045
        },
        {
          x: 875.1519485675815,
          y: 334.4040637628045
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points:
          "\n            870.1519485675815,329.4040637628045\n            875.1519485675815,334.4040637628045\n            870.1519485675815,339.4040637628045\n          ",
        transform: "rotate(-90, 875.1519485675815, 334.4040637628045)"
      }
    },
    {
      sourceEdgeId: "989f370c-9723-4c92-8576-babe28f83423",
      domOrder: 2,
      zIndex: 2,
      sourceNodeId: "aedad806-5d41-458e-82d0-58daac33cc37",
      targetNodeId: "f005a130-edd2-4747-8956-e1d409272c67",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M1540.1519485675815,784.4040637628045 L1690.1519485675815,784.4040637628045",
      sourcePoint: {
        x: 1540.1519485675815,
        y: 784.4040637628045
      },
      targetPoint: {
        x: 1690.1519485675815,
        y: 784.4040637628045
      },
      waypoints: [
        {
          x: 1540.1519485675815,
          y: 784.4040637628045
        },
        {
          x: 1690.1519485675815,
          y: 784.4040637628045
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            1685.1519485675815,779.4040637628045\n            1690.1519485675815,784.4040637628045\n            1685.1519485675815,789.4040637628045\n          ",
        transform: "rotate(0, 1690.1519485675815, 784.4040637628045)"
      }
    },
    {
      sourceEdgeId: "e3e476ef-e2a1-4248-8cb8-7b9dfa170dc1",
      domOrder: 3,
      zIndex: 3,
      sourceNodeId: "aedad806-5d41-458e-82d0-58daac33cc37",
      targetNodeId: "5a76bfb2-b71d-4cbc-919e-3611a1b70e1e",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M1510.1519485675815,754.4040637628045 L1510.1519485675815,634.4040637628045",
      sourcePoint: {
        x: 1510.1519485675815,
        y: 754.4040637628045
      },
      targetPoint: {
        x: 1510.1519485675815,
        y: 634.4040637628045
      },
      waypoints: [
        {
          x: 1510.1519485675815,
          y: 754.4040637628045
        },
        {
          x: 1510.1519485675815,
          y: 634.4040637628045
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points:
          "\n            1505.1519485675815,629.4040637628045\n            1510.1519485675815,634.4040637628045\n            1505.1519485675815,639.4040637628045\n          ",
        transform: "rotate(-90, 1510.1519485675815, 634.4040637628045)"
      }
    }
  ],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_ecs_service" "default" {\n  task_definition = aws_ecs_task_definition.ecs_task_definition.arn\n  tags            = merge(var.tags, {})\n  name            = var.app_name\n  launch_type     = "FARGATE"\n  desired_count   = var.service_count\n  cluster         = aws_ecs_cluster.ecs_cluster.id\n\n  network_configuration {\n    security_groups = [\n      aws_security_group.ecs_security_group.id,\n    ]\n\n    subnets = [\n      aws_subnet.default.id,\n    ]\n  }\n}\n\n',
        sha256: "a1abb870b12bedab9d7d176ba8fd3ecbb1bd2be91685969ecf9e9cb0ddcdd5e9",
        includeInWorkspace: true
      },
      {
        fileName: "backend.tf",
        code: "# This architecture uses Brainboard managed storage\n",
        sha256: "9bd86a80fa787dddd0ec09ee56ad995ddc8e504826d124a2fa09717444751c31",
        includeInWorkspace: false
      },
      {
        fileName: "fargate.tf",
        code: 'resource "aws_vpc" "ecs_vpc" {\n  cidr_block = var.vpc_cidr_block\n}\n\nresource "aws_subnet" "default" {\n  vpc_id            = aws_vpc.ecs_vpc.id\n  cidr_block        = var.subnet_cidr_block\n  availability_zone = "us-west-2a"\n}\n\nresource "aws_internet_gateway" "ecs_vpc_igw" {\n  vpc_id = aws_vpc.ecs_vpc.id\n}\n\nresource "aws_security_group" "ecs_security_group" {\n  vpc_id      = aws_vpc.ecs_vpc.id\n  name_prefix = "ecs-sg-"\n}\n\nresource "aws_iam_role" "ecs_task_role" {\n  name = "${var.app_name}-ecs-task-role"\n  assume_role_policy = jsonencode({\n    Version = "2012-10-17"\n    Statement = [\n      {\n        Action = "sts:AssumeRole"\n        Effect = "Allow"\n        Principal = {\n          Service = "ecs-tasks.amazonaws.com"\n        }\n      }\n    ]\n  })\n}\n\nresource "aws_iam_role_policy_attachment" "ecs_task_role_attachment" {\n  role       = aws_iam_role.ecs_task_role.name\n  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"\n}\n\nresource "aws_ecs_cluster" "ecs_cluster" {\n  tags = merge(var.tags, {})\n  name = var.app_name\n}\n\nresource "aws_ecs_task_definition" "ecs_task_definition" {\n  task_role_arn      = aws_iam_role.ecs_task_role.arn\n  network_mode       = "awsvpc"\n  family             = var.app_name\n  execution_role_arn = aws_iam_role.ecs_task_role.arn\n  container_definitions = jsonencode([\n    {\n      name   = "your-container-name"\n      image  = "your-container-image"\n      cpu    = 256\n      memory = 512\n      portMappings = [\n        {\n          containerPort = 80\n          hostPort      = 80\n          protocol      = "tcp"\n        }\n      ]\n    }\n  ])\n\n  requires_compatibilities = [\n    "FARGATE",\n  ]\n}\n\n',
        sha256: "6263c01146ea2d028b3978e61866b1e6fcef82bce8ea6cd41a22716e0148442f",
        includeInWorkspace: true
      },
      {
        fileName: "locals.tf",
        code: "locals {\n}\n",
        sha256: "0b88e8de9a5058ee4a8129450c5c0561b6a0d9306f454517271927ccdcc347f5",
        includeInWorkspace: true
      },
      {
        fileName: "outputs.tf",
        code: "",
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
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
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "378147c7-b7ad-4bde-b6a5-485db2038eb5"\n  env      = "Production"\n}\n',
        sha256: "4d87a0f16d22167013dc696b06838a7f8bc17c99281460c841cea8ad5ce23cdf",
        includeInWorkspace: false
      },
      {
        fileName: "variables.tf",
        code: 'variable "app_name" {\n  description = "Name of your ECS Fargate application"\n  type        = string\n  default     = "brainboard"\n}\n\nvariable "registry_name" {\n  type = string\n}\n\nvariable "service_count" {\n  type    = number\n  default = 1\n}\n\nvariable "subnet_cidr_block" {\n  type    = string\n  default = "10.0.1.0/24"\n}\n\nvariable "subnet_cidr_blocks" {\n  description = "List of subnet CIDR blocks."\n  type        = list(string)\n  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    archuuid = "18b7b40a-8493-4ebb-ad21-0eb85f6ae257"\n    env      = "Dev - AWS"\n  }\n}\n\nvariable "vpc_cidr_block" {\n  description = "CIDR block for the VPC."\n  type        = string\n  default     = "10.0.0.0/16"\n}\n\n',
        sha256: "dd33265260ab6bc7db3d931b2572eaa1fd30e9640295fa11e898c35c670cb4cb",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'variable "app_name" {\n  description = "Name of your ECS Fargate application"\n  type        = string\n  default     = "brainboard"\n}\n\nvariable "registry_name" {\n  type = string\n}\n\nvariable "service_count" {\n  type    = number\n  default = 1\n}\n\nvariable "subnet_cidr_block" {\n  type    = string\n  default = "10.0.1.0/24"\n}\n\nvariable "subnet_cidr_blocks" {\n  description = "List of subnet CIDR blocks."\n  type        = list(string)\n  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    env      = "Dev - AWS"\n  }\n}\n\nvariable "vpc_cidr_block" {\n  description = "CIDR block for the VPC."\n  type        = string\n  default     = "10.0.0.0/16"\n}\n\n',
          sha256: "9bb002e2406812314b192812343c6978bf6a49d2707ac7dede1fa6ee5f602c6f",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archuuid = "18b7b40a-8493-4ebb-ad21-0eb85f6ae257"\n',
              occurrenceCount: 1
            }
          ]
        }
      }
    ],
    resourceAddresses: [
      "aws_ecs_service.default",
      "aws_vpc.ecs_vpc",
      "aws_subnet.default",
      "aws_internet_gateway.ecs_vpc_igw",
      "aws_security_group.ecs_security_group",
      "aws_iam_role.ecs_task_role",
      "aws_iam_role_policy_attachment.ecs_task_role_attachment",
      "aws_ecs_cluster.ecs_cluster",
      "aws_ecs_task_definition.ecs_task_definition"
    ]
  },
  bindings: {
    "5ba31e54-d954-4cba-a521-3f11291d0ed7": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "162f4029-6160-4b56-80d0-e6de1b294c83": {
      kind: "resource",
      address: "aws_vpc.ecs_vpc",
      fileName: "fargate.tf",
      addressMapping: "single-residual"
    },
    "1eca88fe-e8bd-4240-856e-92e7187e1114": {
      kind: "resource",
      address: "aws_security_group.ecs_security_group",
      fileName: "fargate.tf",
      addressMapping: "reviewed-override"
    },
    "5b67f9b3-34fa-4d25-9451-471ad56e4291": {
      kind: "resource",
      address: "aws_subnet.default",
      fileName: "fargate.tf",
      addressMapping: "reviewed-override"
    },
    "5a76bfb2-b71d-4cbc-919e-3611a1b70e1e": {
      kind: "resource",
      address: "aws_ecs_task_definition.ecs_task_definition",
      fileName: "fargate.tf",
      addressMapping: "reviewed-override"
    },
    "aedad806-5d41-458e-82d0-58daac33cc37": {
      kind: "resource",
      address: "aws_iam_role.ecs_task_role",
      fileName: "fargate.tf",
      addressMapping: "reviewed-override"
    },
    "f005a130-edd2-4747-8956-e1d409272c67": {
      kind: "resource",
      address: "aws_iam_role_policy_attachment.ecs_task_role_attachment",
      fileName: "fargate.tf",
      addressMapping: "reviewed-override"
    },
    "2eb5aa4e-4e9a-4d27-ae3a-3b10469e02a1": {
      kind: "resource",
      address: "aws_ecs_cluster.ecs_cluster",
      fileName: "fargate.tf",
      addressMapping: "reviewed-override"
    },
    "fef60bd4-81d1-4069-a6bd-01727d5903e4": {
      kind: "resource",
      address: "aws_internet_gateway.ecs_vpc_igw",
      fileName: "fargate.tf",
      addressMapping: "reviewed-override"
    },
    "fd1b2a28-24e2-4d3e-a14d-6560424de9bd": {
      kind: "resource",
      address: "aws_ecs_service.default",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    }
  }
});
