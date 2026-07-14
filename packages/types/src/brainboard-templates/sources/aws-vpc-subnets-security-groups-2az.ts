import { defineCapturedBrainboardTemplate } from "./define-source.ts";

export const awsVpcSubnetsSecurityGroups2azSource = defineCapturedBrainboardTemplate({
  id: "brainboard-aws-vpc-subnets-security-groups-2az",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "a9b3f02c-a950-4153-92d2-47905dd8ffd3",
    sourceUrl: "https://app.brainboard.co/templates/a9b3f02c-a950-4153-92d2-47905dd8ffd3",
    cloneArchitectureId: "e89031e6-fe1a-4d24-9302-0e0cdf5d4de9",
    downloads: 1055,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "AWS VPC with subnet and security groups on 2 AZs",
  description: null,
  provider: "aws",
  viewport: {
    x: -1386.49,
    y: -648.17,
    width: 4845.10393922416,
    height: 2651.3485445198876
  },
  nodes: [
    {
      sourceNodeId: "c04395a7-7955-4329-8709-f8b44efa1c63",
      domOrder: 0,
      label: "US East (N. Virginia)",
      position: {
        x: 120,
        y: 85
      },
      size: {
        width: 1675,
        height: 1165
      },
      parentSourceNodeId: null,
      zIndex: 0,
      rawTransform: "translate(120, 85), rotate(0 837.5 582.5)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "9c59c668-cb0a-4287-9087-1de1045fcb1b",
      domOrder: 1,
      label: "vpc",
      position: {
        x: 192,
        y: 195
      },
      size: {
        width: 1530,
        height: 995
      },
      parentSourceNodeId: "c04395a7-7955-4329-8709-f8b44efa1c63",
      zIndex: 1,
      rawTransform: "translate(192, 195), rotate(0 765 497.5)",
      rotation: 0,
      rawResourceType: "aws_vpc"
    },
    {
      sourceNodeId: "20c1e4c2-a928-42a3-901a-121551b1f07f",
      domOrder: 2,
      label: "us-east-1a",
      position: {
        x: 625,
        y: 300
      },
      size: {
        width: 405,
        height: 750
      },
      parentSourceNodeId: "9c59c668-cb0a-4287-9087-1de1045fcb1b",
      zIndex: 2,
      rawTransform: "translate(625, 300), rotate(0 202.5 375)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "bc1b025f-86b0-4df7-8405-29f7eba77ced",
      domOrder: 3,
      label: "us-east-1b",
      position: {
        x: 1165,
        y: 300
      },
      size: {
        width: 415,
        height: 750
      },
      parentSourceNodeId: "9c59c668-cb0a-4287-9087-1de1045fcb1b",
      zIndex: 3,
      rawTransform: "translate(1165, 300), rotate(0 207.5 375)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "0c447118-80a7-4c77-8f95-fd3b24c1e6b5",
      domOrder: 4,
      label: "Private subnet A",
      position: {
        x: 645,
        y: 720
      },
      size: {
        width: 360,
        height: 295
      },
      parentSourceNodeId: "20c1e4c2-a928-42a3-901a-121551b1f07f",
      zIndex: 4,
      rawTransform: "translate(645, 720), rotate(0 180 147.5)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "7e83f2a2-2457-44da-a0d4-1a2bc608f345",
      domOrder: 5,
      label: "Public subnet A",
      position: {
        x: 645,
        y: 350
      },
      size: {
        width: 360,
        height: 285
      },
      parentSourceNodeId: "20c1e4c2-a928-42a3-901a-121551b1f07f",
      zIndex: 5,
      rawTransform: "translate(645, 350), rotate(0 180 142.5)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "8fd53908-23f1-4273-807e-e411dc2ea765",
      domOrder: 6,
      label: "Public subnet B",
      position: {
        x: 1185,
        y: 350
      },
      size: {
        width: 360,
        height: 285
      },
      parentSourceNodeId: "bc1b025f-86b0-4df7-8405-29f7eba77ced",
      zIndex: 6,
      rawTransform: "translate(1185, 350), rotate(0 180 142.5)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "9b86c789-0127-44b3-948b-30ebb28037bb",
      domOrder: 7,
      label: "Private subnet B",
      position: {
        x: 1185,
        y: 720
      },
      size: {
        width: 360,
        height: 295
      },
      parentSourceNodeId: "bc1b025f-86b0-4df7-8405-29f7eba77ced",
      zIndex: 7,
      rawTransform: "translate(1185, 720), rotate(0 180 147.5)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "2b3e06b2-3efa-41da-8190-8c81c6d4f348",
      domOrder: 8,
      label: "sg",
      position: {
        x: 1205,
        y: 400
      },
      size: {
        width: 320,
        height: 215
      },
      parentSourceNodeId: "8fd53908-23f1-4273-807e-e411dc2ea765",
      zIndex: 8,
      rawTransform: "translate(1205, 400), rotate(0 160 107.5)",
      rotation: 0,
      rawResourceType: "aws_security_group"
    },
    {
      sourceNodeId: "8a050109-a5cd-47b0-9642-47e0e1883e9c",
      domOrder: 9,
      label: "sg2",
      position: {
        x: 1205,
        y: 774
      },
      size: {
        width: 320,
        height: 220
      },
      parentSourceNodeId: "9b86c789-0127-44b3-948b-30ebb28037bb",
      zIndex: 9,
      rawTransform: "translate(1205, 774), rotate(0 160 110)",
      rotation: 0,
      rawResourceType: "aws_security_group"
    },
    {
      sourceNodeId: "dab3e0f4-ca73-4759-985b-b2bb84bce2f3",
      domOrder: 10,
      label: "users",
      position: {
        x: 1.2222235506378354,
        y: 680
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: null,
      zIndex: 10,
      rawTransform: "translate(1.2222235506378354, 680), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "brainboard_icon"
    },
    {
      sourceNodeId: "2bc95caf-a0bb-4685-9dae-7d75f194eeec",
      domOrder: 11,
      label: "Route table",
      position: {
        x: 365.8240422506284,
        y: 681.2295831288466
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "9c59c668-cb0a-4287-9087-1de1045fcb1b",
      zIndex: 11,
      rawTransform: "translate(365.8240422506284, 681.2295831288466), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table"
    },
    {
      sourceNodeId: "3adee551-ee50-4677-8522-b9a993879e9f",
      domOrder: 12,
      label: "Internet gateway",
      position: {
        x: 165.3032201277987,
        y: 680.1539857148719
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "9c59c668-cb0a-4287-9087-1de1045fcb1b",
      zIndex: 12,
      rawTransform: "translate(165.3032201277987, 680.1539857148719), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_internet_gateway"
    },
    {
      sourceNodeId: "5174b7c6-a695-4aa6-9bec-37eb301fe69e",
      domOrder: 13,
      label: "EIP NAT A",
      position: {
        x: 455,
        y: 420
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "9c59c668-cb0a-4287-9087-1de1045fcb1b",
      zIndex: 13,
      rawTransform: "translate(455, 420), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_eip"
    },
    {
      sourceNodeId: "c11cf78b-2d86-4665-b1ef-999b2b91594f",
      domOrder: 14,
      label: "EIP NAT B",
      position: {
        x: 455,
        y: 910
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "9c59c668-cb0a-4287-9087-1de1045fcb1b",
      zIndex: 14,
      rawTransform: "translate(455, 910), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_eip"
    },
    {
      sourceNodeId: "3fa3abcc-3366-4d29-a95d-a1848a4d07f6",
      domOrder: 15,
      label: "Route table association",
      position: {
        x: 706.0901263033724,
        y: 818.4549744589974
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "0c447118-80a7-4c77-8f95-fd3b24c1e6b5",
      zIndex: 15,
      rawTransform: "translate(706.0901263033724, 818.4549744589974), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table_association"
    },
    {
      sourceNodeId: "4bab5c05-8edd-4533-a61a-8d2c2f8ac570",
      domOrder: 16,
      label: "Route table association",
      position: {
        x: 706.2835980556209,
        y: 520.4643556760001
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "7e83f2a2-2457-44da-a0d4-1a2bc608f345",
      zIndex: 16,
      rawTransform: "translate(706.2835980556209, 520.4643556760001), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table_association"
    },
    {
      sourceNodeId: "56cdee29-d69c-46f1-860c-478c80ab361b",
      domOrder: 17,
      label: "Net ACL",
      position: {
        x: 875,
        y: 420
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "7e83f2a2-2457-44da-a0d4-1a2bc608f345",
      zIndex: 17,
      rawTransform: "translate(875, 420), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_network_acl"
    },
    {
      sourceNodeId: "90bf2724-6fb1-4e87-bb8d-36d492603b71",
      domOrder: 18,
      label: "NAT gateway",
      position: {
        x: 705,
        y: 910
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "0c447118-80a7-4c77-8f95-fd3b24c1e6b5",
      zIndex: 18,
      rawTransform: "translate(705, 910), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_nat_gateway"
    },
    {
      sourceNodeId: "a3af7c5b-b9b8-44a8-bf85-e3098cadb82b",
      domOrder: 19,
      label: "NAT gateway",
      position: {
        x: 705,
        y: 420
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "7e83f2a2-2457-44da-a0d4-1a2bc608f345",
      zIndex: 19,
      rawTransform: "translate(705, 420), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_nat_gateway"
    },
    {
      sourceNodeId: "ab9cd657-4f34-49a7-9c75-174de1e73de2",
      domOrder: 20,
      label: "Net ACL",
      position: {
        x: 865,
        y: 910
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "0c447118-80a7-4c77-8f95-fd3b24c1e6b5",
      zIndex: 20,
      rawTransform: "translate(865, 910), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_network_acl"
    }
  ],
  edges: [
    {
      sourceEdgeId: "2c6b196b-6d01-4024-9c56-2a26004003ef",
      domOrder: 0,
      zIndex: 0,
      sourceNodeId: "4bab5c05-8edd-4533-a61a-8d2c2f8ac570",
      targetNodeId: "2bc95caf-a0bb-4685-9dae-7d75f194eeec",
      sourcePort: "left",
      targetPort: "right",
      svgPath:
        "M706.2835980556209,550.4643556760001 L574.0538201531247,550.4643556760001 Q566.0538201531247,550.4643556760001 566.0538201531247,558.4643556760001 L566.0538201531247,703.2295831288466 Q566.0538201531247,711.2295831288466 558.0538201531247,711.2295831288466 L425.8240422506284,711.2295831288466",
      sourcePoint: {
        x: 706.2835980556209,
        y: 550.4643556760001
      },
      targetPoint: {
        x: 425.8240422506284,
        y: 711.2295831288466
      },
      waypoints: [
        {
          x: 706.2835980556209,
          y: 550.4643556760001
        },
        {
          x: 574.0538201531247,
          y: 550.4643556760001
        },
        {
          x: 566.0538201531247,
          y: 550.4643556760001
        },
        {
          x: 566.0538201531247,
          y: 558.4643556760001
        },
        {
          x: 566.0538201531247,
          y: 703.2295831288466
        },
        {
          x: 566.0538201531247,
          y: 711.2295831288466
        },
        {
          x: 558.0538201531247,
          y: 711.2295831288466
        },
        {
          x: 425.8240422506284,
          y: 711.2295831288466
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points:
          "\n            420.8240422506284,706.2295831288466\n            425.8240422506284,711.2295831288466\n            420.8240422506284,716.2295831288466\n          ",
        transform: "rotate(180, 425.8240422506284, 711.2295831288466)"
      }
    },
    {
      sourceEdgeId: "5f8f3538-d96e-413f-a210-535fe058edda",
      domOrder: 1,
      zIndex: 1,
      sourceNodeId: "dab3e0f4-ca73-4759-985b-b2bb84bce2f3",
      targetNodeId: "3adee551-ee50-4677-8522-b9a993879e9f",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M61.222223550637835,710 L165.3032201277987,710.1539857148719",
      sourcePoint: {
        x: 61.222223550637835,
        y: 710
      },
      targetPoint: {
        x: 165.3032201277987,
        y: 710.1539857148719
      },
      waypoints: [
        {
          x: 61.222223550637835,
          y: 710
        },
        {
          x: 165.3032201277987,
          y: 710.1539857148719
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0.08476787713776597,
      rawArrow: {
        points:
          "\n            160.3032201277987,705.1539857148719\n            165.3032201277987,710.1539857148719\n            160.3032201277987,715.1539857148719\n          ",
        transform: "rotate(0.08476787713776597, 165.3032201277987, 710.1539857148719)"
      }
    },
    {
      sourceEdgeId: "86a296a6-7921-4a6d-87cc-56a125d27af1",
      domOrder: 2,
      zIndex: 2,
      sourceNodeId: "3fa3abcc-3366-4d29-a95d-a1848a4d07f6",
      targetNodeId: "2bc95caf-a0bb-4685-9dae-7d75f194eeec",
      sourcePort: "left",
      targetPort: "right",
      svgPath:
        "M706.0901263033724,848.4549744589974 L573.9570842770004,848.4549744589974 Q565.9570842770004,848.4549744589974 565.9570842770004,840.4549744589974 L565.9570842770004,719.2295831288466 Q565.9570842770004,711.2295831288466 557.9570842770004,711.2295831288466 L425.8240422506284,711.2295831288466",
      sourcePoint: {
        x: 706.0901263033724,
        y: 848.4549744589974
      },
      targetPoint: {
        x: 425.8240422506284,
        y: 711.2295831288466
      },
      waypoints: [
        {
          x: 706.0901263033724,
          y: 848.4549744589974
        },
        {
          x: 573.9570842770004,
          y: 848.4549744589974
        },
        {
          x: 565.9570842770004,
          y: 848.4549744589974
        },
        {
          x: 565.9570842770004,
          y: 840.4549744589974
        },
        {
          x: 565.9570842770004,
          y: 719.2295831288466
        },
        {
          x: 565.9570842770004,
          y: 711.2295831288466
        },
        {
          x: 557.9570842770004,
          y: 711.2295831288466
        },
        {
          x: 425.8240422506284,
          y: 711.2295831288466
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points:
          "\n            420.8240422506284,706.2295831288466\n            425.8240422506284,711.2295831288466\n            420.8240422506284,716.2295831288466\n          ",
        transform: "rotate(180, 425.8240422506284, 711.2295831288466)"
      }
    },
    {
      sourceEdgeId: "8d86d282-771f-4d37-b4f0-b32cf5957276",
      domOrder: 3,
      zIndex: 3,
      sourceNodeId: "2bc95caf-a0bb-4685-9dae-7d75f194eeec",
      targetNodeId: "3adee551-ee50-4677-8522-b9a993879e9f",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M365.8240422506284,711.2295831288466 L225.3032201277987,710.1539857148719",
      sourcePoint: {
        x: 365.8240422506284,
        y: 711.2295831288466
      },
      targetPoint: {
        x: 225.3032201277987,
        y: 710.1539857148719
      },
      waypoints: [
        {
          x: 365.8240422506284,
          y: 711.2295831288466
        },
        {
          x: 225.3032201277987,
          y: 710.1539857148719
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -179.56144585675585,
      rawArrow: {
        points:
          "\n            220.3032201277987,705.1539857148719\n            225.3032201277987,710.1539857148719\n            220.3032201277987,715.1539857148719\n          ",
        transform: "rotate(-179.56144585675585, 225.3032201277987, 710.1539857148719)"
      }
    },
    {
      sourceEdgeId: "c65f087c-2033-4478-9daa-afe89b7df66d",
      domOrder: 4,
      zIndex: 4,
      sourceNodeId: "a3af7c5b-b9b8-44a8-bf85-e3098cadb82b",
      targetNodeId: "5174b7c6-a695-4aa6-9bec-37eb301fe69e",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M705,450 L515,450",
      sourcePoint: {
        x: 705,
        y: 450
      },
      targetPoint: {
        x: 515,
        y: 450
      },
      waypoints: [
        {
          x: 705,
          y: 450
        },
        {
          x: 515,
          y: 450
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            510,445\n            515,450\n            510,455\n          ",
        transform: "rotate(180, 515, 450)"
      }
    },
    {
      sourceEdgeId: "d9ef1b3f-36ef-4af8-8469-7d26db2a33aa",
      domOrder: 5,
      zIndex: 5,
      sourceNodeId: "90bf2724-6fb1-4e87-bb8d-36d492603b71",
      targetNodeId: "c11cf78b-2d86-4665-b1ef-999b2b91594f",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M705,940 L515,940",
      sourcePoint: {
        x: 705,
        y: 940
      },
      targetPoint: {
        x: 515,
        y: 940
      },
      waypoints: [
        {
          x: 705,
          y: 940
        },
        {
          x: 515,
          y: 940
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            510,935\n            515,940\n            510,945\n          ",
        transform: "rotate(180, 515, 940)"
      }
    }
  ],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_vpc" "vpc" {\n  tags                 = merge(var.tags, { Name = var.vpc_name })\n  instance_tenancy     = "default"\n  enable_dns_support   = true\n  enable_dns_hostnames = true\n  cidr_block           = local.vpc_cidr_block\n}\n\nresource "aws_nat_gateway" "nat_gw" {\n  tags          = merge(var.tags, { Name = "public nat gtw A" })\n  subnet_id     = aws_subnet.public_snet_a.id\n  allocation_id = aws_eip.eip.id\n}\n\nresource "aws_network_acl" "network_acl" {\n  vpc_id = aws_vpc.vpc.id\n  tags   = merge(var.tags, { Name = "public net ACL B" })\n\n  subnet_ids = [\n    aws_subnet.private_snet_a.id,\n  ]\n}\n\nresource "aws_subnet" "private_snet_a" {\n  vpc_id            = aws_vpc.vpc.id\n  tags              = merge(var.tags, { Name = "public subnet B" })\n  cidr_block        = "10.0.2.0/24"\n  availability_zone = "us-east-1a"\n}\n\nresource "aws_network_acl" "network_acl2" {\n  vpc_id = aws_vpc.vpc.id\n  tags   = merge(var.tags, { Name = "public net ACL A" })\n\n  subnet_ids = [\n    aws_subnet.public_snet_a.id,\n  ]\n}\n\nresource "aws_security_group" "sg" {\n  vpc_id = aws_vpc.vpc.id\n\n  tags = {\n    Name = "private SG A"\n  }\n}\n\nresource "aws_nat_gateway" "nat_gw2" {\n  tags          = merge(var.tags, { Name = "public nat gtw B" })\n  subnet_id     = aws_subnet.private_snet_a.id\n  allocation_id = aws_eip.eip2.id\n}\n\nresource "aws_subnet" "public_snet_a" {\n  vpc_id            = aws_vpc.vpc.id\n  tags              = merge(var.tags, { Name = "public subnet A" })\n  cidr_block        = var.public_subnet_cidr\n  availability_zone = "us-east-1a"\n}\n\nresource "aws_subnet" "snet3" {\n  vpc_id            = aws_vpc.vpc.id\n  tags              = merge(var.tags, { Name = "private subnet B" })\n  cidr_block        = "10.0.3.0/24"\n  availability_zone = "us-east-1b"\n}\n\nresource "aws_route_table" "rt" {\n  vpc_id = aws_vpc.vpc.id\n  tags   = merge(var.tags, { Name = "rt-public" })\n\n  route {\n    gateway_id = aws_internet_gateway.internet_gw.id\n    cidr_block = "0.0.0.0/0"\n  }\n}\n\nresource "aws_subnet" "snet4" {\n  vpc_id            = aws_vpc.vpc.id\n  tags              = merge(var.tags, { Name = "private subnet A" })\n  cidr_block        = var.private_subnet_cidr\n  availability_zone = "us-east-1b"\n}\n\nresource "aws_eip" "eip" {\n  tags = merge(var.tags, { Name = "eip_nat_a" })\n}\n\nresource "aws_security_group" "sg2" {\n  vpc_id = aws_vpc.vpc.id\n  tags   = merge(var.tags, { Name = "private SG B" })\n}\n\nresource "aws_eip" "eip2" {\n  tags = merge(var.tags, { Name = "eip_nat_b" })\n}\n\nresource "aws_route_table_association" "rt_association" {\n  subnet_id      = aws_subnet.public_snet_a.id\n  route_table_id = aws_route_table.rt.id\n}\n\nresource "aws_route_table_association" "rt_association2" {\n  subnet_id      = aws_subnet.private_snet_a.id\n  route_table_id = aws_route_table.rt.id\n}\n\nresource "aws_internet_gateway" "internet_gw" {\n  vpc_id = aws_vpc.vpc.id\n  tags   = merge(var.tags, {})\n}\n\n',
        sha256: "605c895c0240a0f5c92c1e795735411b840a7f707226b3cbb08070ae8caad293",
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
        code: 'locals {\n  vpc_cidr_block = "10.0.0.0/16"\n\n}\n',
        sha256: "5dde730e021bfbbc09fac20b2faec15df98ed46b3113e4286f5c2aaa94dd3013",
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
        code: 'terraform {\n  required_providers {\n    aws = {\n      version = "= 5.52.0"\n    }\n  }\n}\n\nprovider "aws" {\n  region = "us-east-1"\n}\n',
        sha256: "48a1ad8474f71e7904ac0639c3460b7a75ce71df8f5720658e9f012904229dfd",
        includeInWorkspace: true
      },
      {
        fileName: "terraform.tfvars",
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "e89031e6-fe1a-4d24-9302-0e0cdf5d4de9"\n  env      = "Production"\n}\n',
        sha256: "68044e90b4e7375c2a636c81db7ccbfabcbee180b09230fabdd52e188ed3d9b8",
        includeInWorkspace: false
      },
      {
        fileName: "variables.tf",
        code: 'variable "private_subnet_cidr" {\n  description = "The CIDR of the private subnet."\n  type        = string\n  default     = "10.0.1.0/24"\n}\n\nvariable "public_subnet_cidr" {\n  description = "The CIDR of the public subnet."\n  type        = string\n  default     = "10.0.0.0/24"\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    archuuid = "a9b3f02c-a950-4153-92d2-47905dd8ffd3"\n    env      = "Development"\n  }\n}\n\nvariable "vpc_cidr_block" {\n  description = "The CIDR of the main VPC."\n  type        = string\n  default     = "10.0.0.0/16"\n}\n\nvariable "vpc_name" {\n  type    = string\n  default = "brainboard"\n}\n\n',
        sha256: "9edcffb0d962533304a15009ee0f0a778e1f1abcfdcd35de22f3500fc6278713",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'variable "private_subnet_cidr" {\n  description = "The CIDR of the private subnet."\n  type        = string\n  default     = "10.0.1.0/24"\n}\n\nvariable "public_subnet_cidr" {\n  description = "The CIDR of the public subnet."\n  type        = string\n  default     = "10.0.0.0/24"\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    env      = "Development"\n  }\n}\n\nvariable "vpc_cidr_block" {\n  description = "The CIDR of the main VPC."\n  type        = string\n  default     = "10.0.0.0/16"\n}\n\nvariable "vpc_name" {\n  type    = string\n  default = "brainboard"\n}\n\n',
          sha256: "ddcbbbd126e3d85a2a66355a1a56ac2b198deed573ad9b7185c6a87cf7701cb5",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archuuid = "a9b3f02c-a950-4153-92d2-47905dd8ffd3"\n',
              occurrenceCount: 1
            }
          ]
        }
      }
    ],
    resourceAddresses: [
      "aws_vpc.vpc",
      "aws_nat_gateway.nat_gw",
      "aws_network_acl.network_acl",
      "aws_subnet.private_snet_a",
      "aws_network_acl.network_acl2",
      "aws_security_group.sg",
      "aws_nat_gateway.nat_gw2",
      "aws_subnet.public_snet_a",
      "aws_subnet.snet3",
      "aws_route_table.rt",
      "aws_subnet.snet4",
      "aws_eip.eip",
      "aws_security_group.sg2",
      "aws_eip.eip2",
      "aws_route_table_association.rt_association",
      "aws_route_table_association.rt_association2",
      "aws_internet_gateway.internet_gw"
    ]
  },
  bindings: {
    "c04395a7-7955-4329-8709-f8b44efa1c63": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "9c59c668-cb0a-4287-9087-1de1045fcb1b": {
      kind: "resource",
      address: "aws_vpc.vpc",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "20c1e4c2-a928-42a3-901a-121551b1f07f": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "bc1b025f-86b0-4df7-8405-29f7eba77ced": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "0c447118-80a7-4c77-8f95-fd3b24c1e6b5": {
      kind: "resource",
      address: "aws_subnet.private_snet_a",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "7e83f2a2-2457-44da-a0d4-1a2bc608f345": {
      kind: "resource",
      address: "aws_subnet.public_snet_a",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "8fd53908-23f1-4273-807e-e411dc2ea765": {
      kind: "resource",
      address: "aws_subnet.snet4",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "9b86c789-0127-44b3-948b-30ebb28037bb": {
      kind: "resource",
      address: "aws_subnet.snet3",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "2b3e06b2-3efa-41da-8190-8c81c6d4f348": {
      kind: "resource",
      address: "aws_security_group.sg",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "8a050109-a5cd-47b0-9642-47e0e1883e9c": {
      kind: "resource",
      address: "aws_security_group.sg2",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "dab3e0f4-ca73-4759-985b-b2bb84bce2f3": {
      kind: "presentation",
      catalogId: "design-user-client",
      aliasOf: null,
      style: null
    },
    "2bc95caf-a0bb-4685-9dae-7d75f194eeec": {
      kind: "resource",
      address: "aws_route_table.rt",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "3adee551-ee50-4677-8522-b9a993879e9f": {
      kind: "resource",
      address: "aws_internet_gateway.internet_gw",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "5174b7c6-a695-4aa6-9bec-37eb301fe69e": {
      kind: "resource",
      address: "aws_eip.eip",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "c11cf78b-2d86-4665-b1ef-999b2b91594f": {
      kind: "resource",
      address: "aws_eip.eip2",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "3fa3abcc-3366-4d29-a95d-a1848a4d07f6": {
      kind: "resource",
      address: "aws_route_table_association.rt_association2",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "4bab5c05-8edd-4533-a61a-8d2c2f8ac570": {
      kind: "resource",
      address: "aws_route_table_association.rt_association",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "56cdee29-d69c-46f1-860c-478c80ab361b": {
      kind: "resource",
      address: "aws_network_acl.network_acl2",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "90bf2724-6fb1-4e87-bb8d-36d492603b71": {
      kind: "resource",
      address: "aws_nat_gateway.nat_gw2",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "a3af7c5b-b9b8-44a8-bf85-e3098cadb82b": {
      kind: "resource",
      address: "aws_nat_gateway.nat_gw",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "ab9cd657-4f34-49a7-9c75-174de1e73de2": {
      kind: "resource",
      address: "aws_network_acl.network_acl",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    }
  }
});
