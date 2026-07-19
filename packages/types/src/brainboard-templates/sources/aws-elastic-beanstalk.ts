import { defineCapturedBrainboardTemplate } from "./define-source.ts";

export const awsElasticBeanstalkSource = defineCapturedBrainboardTemplate({
  id: "brainboard-aws-elastic-beanstalk",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "eb84baae-e3a7-4d39-b80d-a22466e5ea16",
    sourceUrl: "https://app.brainboard.co/templates/eb84baae-e3a7-4d39-b80d-a22466e5ea16",
    cloneArchitectureId: "be7e639a-5c0c-40bc-b20d-cc80576d7a75",
    downloads: 216,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "AWS Elastic Beanstalk",
  description: null,
  provider: "aws",
  viewport: {
    x: -1058.09,
    y: -271.14,
    width: 3622.451612903226,
    height: 1982.2860215053763
  },
  nodes: [
    {
      sourceNodeId: "f2425c88-44c6-439d-b3f3-d8b0f76b130b",
      domOrder: 0,
      label: "Asia Pacific (Sydney)",
      position: {
        x: -10,
        y: 230
      },
      size: {
        width: 1320,
        height: 960
      },
      parentSourceNodeId: null,
      zIndex: 0,
      rawTransform: "translate(-10, 230), rotate(0 660 480)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "d40ff46e-9c47-41ae-ac6d-94b6ee7e82a0",
      domOrder: 1,
      label: "Elastic Beanstalk VPC",
      position: {
        x: 55,
        y: 340
      },
      size: {
        width: 1190,
        height: 800
      },
      parentSourceNodeId: "f2425c88-44c6-439d-b3f3-d8b0f76b130b",
      zIndex: 1,
      rawTransform: "translate(55, 340), rotate(0 595 400)",
      rotation: 0,
      rawResourceType: "aws_vpc"
    },
    {
      sourceNodeId: "21fc0544-3752-484e-8b4b-ba2e5d1a62f4",
      domOrder: 2,
      label: "Elastic Beanstalk ASG",
      position: {
        x: 140,
        y: 745
      },
      size: {
        width: 1020,
        height: 155
      },
      parentSourceNodeId: "d40ff46e-9c47-41ae-ac6d-94b6ee7e82a0",
      zIndex: 2,
      rawTransform: "translate(140, 745), rotate(0 510 77.5)",
      rotation: 0,
      rawResourceType: "aws_autoscaling_group"
    },
    {
      sourceNodeId: "7eb561cf-2bc5-4d66-933a-2242b1a6567f",
      domOrder: 3,
      label: "AZ ap-southeast-2a",
      position: {
        x: 220,
        y: 520
      },
      size: {
        width: 295,
        height: 560
      },
      parentSourceNodeId: "d40ff46e-9c47-41ae-ac6d-94b6ee7e82a0",
      zIndex: 3,
      rawTransform: "translate(220, 520), rotate(0 147.5 280)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "9a33d988-aa5c-4ab1-9c0e-fd1b80102646",
      domOrder: 4,
      label: "AZ ap-southeast-2b",
      position: {
        x: 790,
        y: 520
      },
      size: {
        width: 295,
        height: 565
      },
      parentSourceNodeId: "d40ff46e-9c47-41ae-ac6d-94b6ee7e82a0",
      zIndex: 4,
      rawTransform: "translate(790, 520), rotate(0 147.5 282.5)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "5817b9fb-4c2c-4e1f-bb4d-61b71657a381",
      domOrder: 5,
      label: "Public Subnet A",
      position: {
        x: 240,
        y: 600
      },
      size: {
        width: 255,
        height: 340
      },
      parentSourceNodeId: "7eb561cf-2bc5-4d66-933a-2242b1a6567f",
      zIndex: 5,
      rawTransform: "translate(240, 600), rotate(0 127.5 170)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "a5c63292-27e8-447b-b4fc-2d231bb3580f",
      domOrder: 6,
      label: "Public Subnet B",
      position: {
        x: 815,
        y: 600
      },
      size: {
        width: 250,
        height: 340
      },
      parentSourceNodeId: "9a33d988-aa5c-4ab1-9c0e-fd1b80102646",
      zIndex: 6,
      rawTransform: "translate(815, 600), rotate(0 125 170)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "97044051-a775-4409-8077-9c1e1f468426",
      domOrder: 7,
      label: "Internet Gateway",
      position: {
        x: 620,
        y: 310
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d40ff46e-9c47-41ae-ac6d-94b6ee7e82a0",
      zIndex: 7,
      rawTransform: "translate(620, 310), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_internet_gateway"
    },
    {
      sourceNodeId: "0b61aaf6-6cd1-497d-8a4d-9df7c71157b1",
      domOrder: 8,
      label: "Elastic Beanstalk EC2 A",
      position: {
        x: 330,
        y: 810
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "5817b9fb-4c2c-4e1f-bb4d-61b71657a381",
      zIndex: 8,
      rawTransform: "translate(330, 810), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_instance"
    },
    {
      sourceNodeId: "1cb32ea4-78fa-41f1-aaa4-8bd6de25c903",
      domOrder: 9,
      label: "Elastic Beanstalk EC2 B",
      position: {
        x: 920,
        y: 810
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a5c63292-27e8-447b-b4fc-2d231bb3580f",
      zIndex: 9,
      rawTransform: "translate(920, 810), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_instance"
    },
    {
      sourceNodeId: "002f83ee-6206-4b3b-a473-e684f6504631",
      domOrder: 10,
      label: "Elastic Beanstalk Environment",
      position: {
        x: 620,
        y: 810
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d40ff46e-9c47-41ae-ac6d-94b6ee7e82a0",
      zIndex: 10,
      rawTransform: "translate(620, 810), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_elastic_beanstalk_environment"
    },
    {
      sourceNodeId: "553a42d0-41d3-4c72-a135-0ef20079465d",
      domOrder: 11,
      label: "Elastic Beanstalk Application",
      position: {
        x: 620,
        y: 1020
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d40ff46e-9c47-41ae-ac6d-94b6ee7e82a0",
      zIndex: 11,
      rawTransform: "translate(620, 1020), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_elastic_beanstalk_application"
    },
    {
      sourceNodeId: "2e07a06a-d2b6-4ae1-9424-895648bce499",
      domOrder: 12,
      label: "Public Route Table",
      position: {
        x: 620,
        y: 660
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d40ff46e-9c47-41ae-ac6d-94b6ee7e82a0",
      zIndex: 12,
      rawTransform: "translate(620, 660), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table"
    },
    {
      sourceNodeId: "3657c666-e254-4beb-9895-baef2c9ff360",
      domOrder: 13,
      label: "Route Table Association - Public B",
      position: {
        x: 920,
        y: 660
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a5c63292-27e8-447b-b4fc-2d231bb3580f",
      zIndex: 13,
      rawTransform: "translate(920, 660), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table_association"
    },
    {
      sourceNodeId: "5ffcf553-4f13-488e-9f55-675ad24b98fe",
      domOrder: 14,
      label: "Route Table Association - Public A",
      position: {
        x: 330,
        y: 660
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "5817b9fb-4c2c-4e1f-bb4d-61b71657a381",
      zIndex: 14,
      rawTransform: "translate(330, 660), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table_association"
    }
  ],
  edges: [
    {
      sourceEdgeId: "1e00d822-6eee-4771-b383-16d4e3de0636",
      domOrder: 0,
      zIndex: 0,
      sourceNodeId: "002f83ee-6206-4b3b-a473-e684f6504631",
      targetNodeId: "0b61aaf6-6cd1-497d-8a4d-9df7c71157b1",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M620,840 L390,840",
      sourcePoint: {
        x: 620,
        y: 840
      },
      targetPoint: {
        x: 390,
        y: 840
      },
      waypoints: [
        {
          x: 620,
          y: 840
        },
        {
          x: 390,
          y: 840
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            385,835\n            390,840\n            385,845\n          ",
        transform: "rotate(180, 390, 840)"
      }
    },
    {
      sourceEdgeId: "2f7daa2e-b273-4cd7-9558-0bd6502fe288",
      domOrder: 1,
      zIndex: 1,
      sourceNodeId: "002f83ee-6206-4b3b-a473-e684f6504631",
      targetNodeId: "1cb32ea4-78fa-41f1-aaa4-8bd6de25c903",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M680,840 L920,840",
      sourcePoint: {
        x: 680,
        y: 840
      },
      targetPoint: {
        x: 920,
        y: 840
      },
      waypoints: [
        {
          x: 680,
          y: 840
        },
        {
          x: 920,
          y: 840
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            915,835\n            920,840\n            915,845\n          ",
        transform: "rotate(0, 920, 840)"
      }
    },
    {
      sourceEdgeId: "36cb492d-1ff9-411a-a1b6-a46df266ffe0",
      domOrder: 2,
      zIndex: 2,
      sourceNodeId: "5ffcf553-4f13-488e-9f55-675ad24b98fe",
      targetNodeId: "2e07a06a-d2b6-4ae1-9424-895648bce499",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M390,690 L620,690",
      sourcePoint: {
        x: 390,
        y: 690
      },
      targetPoint: {
        x: 620,
        y: 690
      },
      waypoints: [
        {
          x: 390,
          y: 690
        },
        {
          x: 620,
          y: 690
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            615,685\n            620,690\n            615,695\n          ",
        transform: "rotate(0, 620, 690)"
      }
    },
    {
      sourceEdgeId: "b83160d3-f894-4701-aa9d-0e55b4ff462e",
      domOrder: 3,
      zIndex: 3,
      sourceNodeId: "3657c666-e254-4beb-9895-baef2c9ff360",
      targetNodeId: "2e07a06a-d2b6-4ae1-9424-895648bce499",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M920,690 L680,690",
      sourcePoint: {
        x: 920,
        y: 690
      },
      targetPoint: {
        x: 680,
        y: 690
      },
      waypoints: [
        {
          x: 920,
          y: 690
        },
        {
          x: 680,
          y: 690
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            675,685\n            680,690\n            675,695\n          ",
        transform: "rotate(180, 680, 690)"
      }
    },
    {
      sourceEdgeId: "cf290c16-a575-4b15-b75a-a35e1797e5d8",
      domOrder: 4,
      zIndex: 4,
      sourceNodeId: "002f83ee-6206-4b3b-a473-e684f6504631",
      targetNodeId: "553a42d0-41d3-4c72-a135-0ef20079465d",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M650,870 L650,1020",
      sourcePoint: {
        x: 650,
        y: 870
      },
      targetPoint: {
        x: 650,
        y: 1020
      },
      waypoints: [
        {
          x: 650,
          y: 870
        },
        {
          x: 650,
          y: 1020
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            645,1015\n            650,1020\n            645,1025\n          ",
        transform: "rotate(90, 650, 1020)"
      }
    },
    {
      sourceEdgeId: "f0c32538-3862-4712-ad7f-9f5bc7c82224",
      domOrder: 5,
      zIndex: 5,
      sourceNodeId: "2e07a06a-d2b6-4ae1-9424-895648bce499",
      targetNodeId: "97044051-a775-4409-8077-9c1e1f468426",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M650,660 L650,370",
      sourcePoint: {
        x: 650,
        y: 660
      },
      targetPoint: {
        x: 650,
        y: 370
      },
      waypoints: [
        {
          x: 650,
          y: 660
        },
        {
          x: 650,
          y: 370
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            645,365\n            650,370\n            645,375\n          ",
        transform: "rotate(-90, 650, 370)"
      }
    }
  ],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_vpc" "default" {\n  tags       = merge(var.tags, {})\n  cidr_block = var.vpc_cidr\n}\n\nresource "aws_subnet" "subnet_2a" {\n  vpc_id                  = aws_vpc.default.id\n  tags                    = merge(var.tags, {})\n  map_public_ip_on_launch = true\n  cidr_block              = var.subnets.a\n  availability_zone       = "ap-southeast-2a"\n}\n\nresource "aws_subnet" "subnet_2b" {\n  vpc_id                  = aws_vpc.default.id\n  tags                    = merge(var.tags, {})\n  map_public_ip_on_launch = true\n  cidr_block              = var.subnets.b\n  availability_zone       = "ap-southeast-2b"\n}\n\nresource "aws_internet_gateway" "default" {\n  vpc_id = aws_vpc.default.id\n  tags   = merge(var.tags, {})\n}\n\nresource "aws_elastic_beanstalk_environment" "default" {\n  wait_for_ready_timeout = "1h"\n  tier                   = "WebServer"\n  tags                   = merge(var.tags, {})\n  solution_stack_name    = "64bit Amazon Linux 2 v3.4.3 running Python 3.8"\n  name                   = var.beanstalk_env_name\n  application            = aws_elastic_beanstalk_application.default.id\n\n  setting {\n    value     = "application"\n    namespace = "aws:elasticbeanstalk:environment"\n    name      = "LoadBalancerType"\n  }\n\n  setting {\n    value     = var.asg_max_size\n    namespace = "aws:autoscaling:asg"\n    name      = "MaxSize"\n  }\n\n  setting {\n    value     = join(",", [aws_subnet.subnet_2a.id, aws_subnet.subnet_2b.id])\n    namespace = "aws:ec2:vpc"\n    name      = "ELBSubnets"\n  }\n\n  setting {\n    value     = aws_vpc.default.id\n    namespace = "aws:ec2:vpc"\n    name      = "VPCId"\n  }\n\n  setting {\n    value     = "200"\n    namespace = "aws:elasticbeanstalk:environment:process:default"\n    name      = "MatcherHTTPCode"\n  }\n\n  setting {\n    value     = join(",", [aws_subnet.subnet_2a.id, aws_subnet.subnet_2b.id])\n    resource  = ""\n    namespace = "aws:ec2:vpc"\n    name      = "Subnets"\n  }\n\n  setting {\n    value     = "True"\n    namespace = "aws:elb:loadbalancer"\n    name      = "CrossZone"\n  }\n\n  setting {\n    value     = "True"\n    resource  = ""\n    namespace = "aws:ec2:vpc"\n    name      = "AssociatePublicIpAddress"\n  }\n\n  setting {\n    value     = "enhanced"\n    namespace = "aws:elasticbeanstalk:healthreporting:system"\n    name      = "SystemType"\n  }\n\n  setting {\n    value     = var.asg_min_size\n    namespace = "aws:autoscaling:asg"\n    name      = "MinSize"\n  }\n\n  setting {\n    value     = "aws-elasticbeanstalk-ec2-role"\n    namespace = "aws:autoscaling:launchconfiguration"\n    name      = "IamInstanceProfile"\n  }\n\n  setting {\n    value     = "internet facing"\n    namespace = "aws:ec2:vpc"\n    name      = "ELBScheme"\n  }\n\n  setting {\n    value     = "t2.medium"\n    namespace = "aws:autoscaling:launchconfiguration"\n    name      = "InstanceType"\n  }\n}\n\nresource "aws_elastic_beanstalk_application" "default" {\n  tags = merge(var.tags, {})\n  name = var.beastalk_app_name\n}\n\nresource "aws_route_table" "default" {\n  vpc_id = aws_vpc.default.id\n  tags   = merge(var.tags, {})\n\n  route {\n    gateway_id = aws_internet_gateway.default.id\n    cidr_block = "0.0.0.0/0"\n  }\n}\n\nresource "aws_route_table_association" "route_table_association_2b" {\n  subnet_id      = aws_subnet.subnet_2b.id\n  route_table_id = aws_route_table.default.id\n}\n\nresource "aws_route_table_association" "route_table_association_2a" {\n  subnet_id      = aws_subnet.subnet_2a.id\n  route_table_id = aws_route_table.default.id\n}\n\n',
        sha256: "a8520a13d4e534e61429bc25cb687d7532d24675b1ea5f64495670194eb4277e",
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
        code: "",
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        includeInWorkspace: true
      },
      {
        fileName: "providers.tf",
        code: 'terraform {\n  required_providers {\n    aws = {\n      version = "= 5.52.0"\n    }\n  }\n}\n\nprovider "aws" {\n  region = "ap-southeast-2"\n}\n',
        sha256: "017bc4b30cc2efb1325026a76798b52e7b9483799a85f0b9ab328cbf50d849d2",
        includeInWorkspace: true
      },
      {
        fileName: "terraform.tfvars",
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "be7e639a-5c0c-40bc-b20d-cc80576d7a75"\n  env      = "Production"\n}\n',
        sha256: "75a34c1835b3f1d1df5e13dc763abf3a527c88e4068cb4bbad6909fa3d848b48",
        includeInWorkspace: false
      },
      {
        fileName: "variables.tf",
        code: 'variable "asg_max_size" {\n  type    = number\n  default = 2\n}\n\nvariable "asg_min_size" {\n  type    = number\n  default = 1\n}\n\nvariable "beanstalk_env_name" {\n  type    = string\n  default = "brainboard"\n}\n\nvariable "beastalk_app_name" {\n  type    = string\n  default = "brainboard"\n}\n\nvariable "subnets" {\n  type = any\n  default = {\n    a = "10.0.1.0/24"\n    b = "10.0.2.0/24"\n  }\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    archuuid = "eb84baae-e3a7-4d39-b80d-a22466e5ea16"\n    env      = "Misc"\n  }\n}\n\nvariable "vpc_cidr" {\n  type    = string\n  default = "10.0.0.0/16"\n}\n\nvariable "vpc_name" {\n  type    = string\n  default = "brainboard"\n}\n\n',
        sha256: "0602189cfbf2acf472392560a228f4519e35ff651212040fc2123801c6c027f1",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'variable "asg_max_size" {\n  type    = number\n  default = 2\n}\n\nvariable "asg_min_size" {\n  type    = number\n  default = 1\n}\n\nvariable "beanstalk_env_name" {\n  type    = string\n  default = "brainboard"\n}\n\nvariable "beastalk_app_name" {\n  type    = string\n  default = "brainboard"\n}\n\nvariable "subnets" {\n  type = any\n  default = {\n    a = "10.0.1.0/24"\n    b = "10.0.2.0/24"\n  }\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    env      = "Misc"\n  }\n}\n\nvariable "vpc_cidr" {\n  type    = string\n  default = "10.0.0.0/16"\n}\n\nvariable "vpc_name" {\n  type    = string\n  default = "brainboard"\n}\n\n',
          sha256: "d22001d29ba7ff3b10019b88b03b49fde6729ff6a15f29bd3c249c63c61d99dc",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archuuid = "eb84baae-e3a7-4d39-b80d-a22466e5ea16"\n',
              occurrenceCount: 1
            }
          ]
        }
      }
    ],
    resourceAddresses: [
      "aws_vpc.default",
      "aws_subnet.subnet_2a",
      "aws_subnet.subnet_2b",
      "aws_internet_gateway.default",
      "aws_elastic_beanstalk_environment.default",
      "aws_elastic_beanstalk_application.default",
      "aws_route_table.default",
      "aws_route_table_association.route_table_association_2b",
      "aws_route_table_association.route_table_association_2a"
    ]
  },
  bindings: {
    "f2425c88-44c6-439d-b3f3-d8b0f76b130b": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "d40ff46e-9c47-41ae-ac6d-94b6ee7e82a0": {
      kind: "resource",
      address: "aws_vpc.default",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "21fc0544-3752-484e-8b4b-ba2e5d1a62f4": {
      kind: "presentation",
      catalogId: "aws-autoscaling-group",
      aliasOf: "aws_elastic_beanstalk_environment.default",
      style: null
    },
    "7eb561cf-2bc5-4d66-933a-2242b1a6567f": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "9a33d988-aa5c-4ab1-9c0e-fd1b80102646": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "5817b9fb-4c2c-4e1f-bb4d-61b71657a381": {
      kind: "resource",
      address: "aws_subnet.subnet_2a",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "a5c63292-27e8-447b-b4fc-2d231bb3580f": {
      kind: "resource",
      address: "aws_subnet.subnet_2b",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "97044051-a775-4409-8077-9c1e1f468426": {
      kind: "resource",
      address: "aws_internet_gateway.default",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "0b61aaf6-6cd1-497d-8a4d-9df7c71157b1": {
      kind: "presentation",
      catalogId: "aws-ec2-instance",
      aliasOf: "aws_elastic_beanstalk_environment.default",
      style: null
    },
    "1cb32ea4-78fa-41f1-aaa4-8bd6de25c903": {
      kind: "presentation",
      catalogId: "aws-ec2-instance",
      aliasOf: "aws_elastic_beanstalk_environment.default",
      style: null
    },
    "002f83ee-6206-4b3b-a473-e684f6504631": {
      kind: "resource",
      address: "aws_elastic_beanstalk_environment.default",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "553a42d0-41d3-4c72-a135-0ef20079465d": {
      kind: "resource",
      address: "aws_elastic_beanstalk_application.default",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "2e07a06a-d2b6-4ae1-9424-895648bce499": {
      kind: "resource",
      address: "aws_route_table.default",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "3657c666-e254-4beb-9895-baef2c9ff360": {
      kind: "resource",
      address: "aws_route_table_association.route_table_association_2b",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "5ffcf553-4f13-488e-9f55-675ad24b98fe": {
      kind: "resource",
      address: "aws_route_table_association.route_table_association_2a",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    }
  }
});
