import { defineCapturedBrainboardTemplate } from "./define-source.js";

export const awsJenkinsEc2Source = defineCapturedBrainboardTemplate({
  id: "brainboard-aws-jenkins-ec2",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "c884d82a-6fab-454f-a984-619d65ad6044",
    sourceUrl: "https://app.brainboard.co/templates/c884d82a-6fab-454f-a984-619d65ad6044",
    cloneArchitectureId: "3ff1b689-c574-4ff7-9e00-ae3a29197cc0",
    downloads: 637,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "AWS Jenkins architecture on EC2",
  description: null,
  provider: "aws",
  viewport: {
    x: -2858.95,
    y: -1907.89,
    width: 8809.548387096775,
    height: 4820.7806451612905
  },
  nodes: [
    {
      sourceNodeId: "f4301d28-06e3-4263-a5ec-5315eb4f7e69",
      domOrder: 0,
      label: "US East (Ohio)",
      position: {
        x: -370,
        y: -100
      },
      size: {
        width: 1820,
        height: 1185
      },
      parentSourceNodeId: null,
      zIndex: 0,
      rawTransform: "translate(-370, -100), rotate(0 910 592.5)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "00247cae-d87b-40b3-987f-08a702b062f3",
      domOrder: 1,
      label: "vpc_master",
      position: {
        x: -180,
        y: 315
      },
      size: {
        width: 1585,
        height: 690
      },
      parentSourceNodeId: "f4301d28-06e3-4263-a5ec-5315eb4f7e69",
      zIndex: 1,
      rawTransform: "translate(-180, 315), rotate(0 792.5 345)",
      rotation: 0,
      rawResourceType: "aws_vpc"
    },
    {
      sourceNodeId: "7284b103-be2a-4159-b7f4-b6ab0cb802fa",
      domOrder: 2,
      label: "us-east-2a",
      position: {
        x: 700,
        y: 355
      },
      size: {
        width: 315,
        height: 320
      },
      parentSourceNodeId: "00247cae-d87b-40b3-987f-08a702b062f3",
      zIndex: 2,
      rawTransform: "translate(700, 355), rotate(0 157.5 160)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "8894d2b3-f035-4824-ae9c-ed68cae67835",
      domOrder: 3,
      label: "us-east-2b",
      position: {
        x: 1070,
        y: 355
      },
      size: {
        width: 310,
        height: 315
      },
      parentSourceNodeId: "00247cae-d87b-40b3-987f-08a702b062f3",
      zIndex: 3,
      rawTransform: "translate(1070, 355), rotate(0 155 157.5)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "e4672c0f-349e-4a5f-951e-1950b90adbea",
      domOrder: 4,
      label: "US West (Oregon)",
      position: {
        x: 1510,
        y: 135
      },
      size: {
        width: 1450,
        height: 945
      },
      parentSourceNodeId: null,
      zIndex: 4,
      rawTransform: "translate(1510, 135), rotate(0 725 472.5)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "4c8d5064-37af-4f69-84ae-093f1652e998",
      domOrder: 5,
      label: "vpc_master_us_west_2",
      position: {
        x: 1700,
        y: 260
      },
      size: {
        width: 1210,
        height: 705
      },
      parentSourceNodeId: "e4672c0f-349e-4a5f-951e-1950b90adbea",
      zIndex: 5,
      rawTransform: "translate(1700, 260), rotate(0 605 352.5)",
      rotation: 0,
      rawResourceType: "aws_vpc"
    },
    {
      sourceNodeId: "050262e9-c94b-48b6-90b1-7298da1a70a2",
      domOrder: 6,
      label: "us-west-2a",
      position: {
        x: 2120,
        y: 360
      },
      size: {
        width: 360,
        height: 310
      },
      parentSourceNodeId: "4c8d5064-37af-4f69-84ae-093f1652e998",
      zIndex: 6,
      rawTransform: "translate(2120, 360), rotate(0 180 155)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "b55a1748-7a18-424f-b047-ffa56acd1a92",
      domOrder: 7,
      label: "subnet_1",
      position: {
        x: 735,
        y: 435
      },
      size: {
        width: 250,
        height: 200
      },
      parentSourceNodeId: "7284b103-be2a-4159-b7f4-b6ab0cb802fa",
      zIndex: 7,
      rawTransform: "translate(735, 435), rotate(0 125 100)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "0521d44b-15ce-40f0-abb8-6f2bd189eafa",
      domOrder: 8,
      label: "subnet_2",
      position: {
        x: 1100,
        y: 435
      },
      size: {
        width: 250,
        height: 200
      },
      parentSourceNodeId: "8894d2b3-f035-4824-ae9c-ed68cae67835",
      zIndex: 8,
      rawTransform: "translate(1100, 435), rotate(0 125 100)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "be92d4fa-43ef-4fbf-a4ee-71ae6647998e",
      domOrder: 9,
      label: "subnet_1_oregon",
      position: {
        x: 2180,
        y: 420
      },
      size: {
        width: 250,
        height: 200
      },
      parentSourceNodeId: "050262e9-c94b-48b6-90b1-7298da1a70a2",
      zIndex: 9,
      rawTransform: "translate(2180, 420), rotate(0 125 100)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "5b91539b-dc2d-4d8d-9aac-a1c52e9b7200",
      domOrder: 10,
      label: "lb-sg",
      position: {
        x: 200,
        y: 355
      },
      size: {
        width: 425,
        height: 275
      },
      parentSourceNodeId: "00247cae-d87b-40b3-987f-08a702b062f3",
      zIndex: 10,
      rawTransform: "translate(200, 355), rotate(0 212.5 137.5)",
      rotation: 0,
      rawResourceType: "aws_security_group"
    },
    {
      sourceNodeId: "33ce152b-f405-4f28-86e5-4e894df70cd4",
      domOrder: 11,
      label: "jenkins-sg",
      position: {
        x: 200,
        y: 685
      },
      size: {
        width: 425,
        height: 305
      },
      parentSourceNodeId: "00247cae-d87b-40b3-987f-08a702b062f3",
      zIndex: 11,
      rawTransform: "translate(200, 685), rotate(0 212.5 152.5)",
      rotation: 0,
      rawResourceType: "aws_security_group"
    },
    {
      sourceNodeId: "714b53d2-89b3-465a-9151-2318985dbd2d",
      domOrder: 12,
      label: "jenkins-sg-oregon",
      position: {
        x: 2540,
        y: 360
      },
      size: {
        width: 320,
        height: 305
      },
      parentSourceNodeId: "4c8d5064-37af-4f69-84ae-093f1652e998",
      zIndex: 12,
      rawTransform: "translate(2540, 360), rotate(0 160 152.5)",
      rotation: 0,
      rawResourceType: "aws_security_group"
    },
    {
      sourceNodeId: "19c57b20-0ebb-4efb-b35e-8c37e175e918",
      domOrder: 13,
      label: "Internet gateway",
      position: {
        x: -210,
        y: 565
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "00247cae-d87b-40b3-987f-08a702b062f3",
      zIndex: 13,
      rawTransform: "translate(-210, 565), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_internet_gateway"
    },
    {
      sourceNodeId: "08a82fc0-d9d9-46af-a271-b7b182986246",
      domOrder: 14,
      label: "igw-oregon",
      position: {
        x: 1670,
        y: 580
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "4c8d5064-37af-4f69-84ae-093f1652e998",
      zIndex: 14,
      rawTransform: "translate(1670, 580), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_internet_gateway"
    },
    {
      sourceNodeId: "606e1369-d916-490e-94c7-4aedeeafe7e0",
      domOrder: 15,
      label: "useast2-uswest2 VPC peering connection",
      position: {
        x: 1190,
        y: 910
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "00247cae-d87b-40b3-987f-08a702b062f3",
      zIndex: 15,
      rawTransform: "translate(1190, 910), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_vpc_peering_connection"
    },
    {
      sourceNodeId: "651d53c3-cceb-4967-b5c3-e025e140fa3b",
      domOrder: 16,
      label: "Route table",
      position: {
        x: 60,
        y: 565
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "00247cae-d87b-40b3-987f-08a702b062f3",
      zIndex: 16,
      rawTransform: "translate(60, 565), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table"
    },
    {
      sourceNodeId: "fa46f093-d66a-4f84-8568-a3c04fdc2c44",
      domOrder: 17,
      label: "Route table association",
      position: {
        x: 60,
        y: 765
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "00247cae-d87b-40b3-987f-08a702b062f3",
      zIndex: 17,
      rawTransform: "translate(60, 765), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_main_route_table_association"
    },
    {
      sourceNodeId: "bb82de1b-7d92-41fc-a0a9-d1c5e3634d11",
      domOrder: 18,
      label: "internet_route_oregon",
      position: {
        x: 1930,
        y: 580
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "4c8d5064-37af-4f69-84ae-093f1652e998",
      zIndex: 18,
      rawTransform: "translate(1930, 580), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table"
    },
    {
      sourceNodeId: "cac8d6c9-02a8-4984-8a5d-c398d6c7e50a",
      domOrder: 19,
      label: "set-worker-default-rt-assoc",
      position: {
        x: 1930,
        y: 770
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "4c8d5064-37af-4f69-84ae-093f1652e998",
      zIndex: 19,
      rawTransform: "translate(1930, 770), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_main_route_table_association"
    },
    {
      sourceNodeId: "4fd77125-9a08-4a94-8900-6d00c4037415",
      domOrder: 20,
      label: "SG rule ingress 443",
      position: {
        x: 295,
        y: 435
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "00247cae-d87b-40b3-987f-08a702b062f3",
      zIndex: 20,
      rawTransform: "translate(295, 435), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_security_group_rule"
    },
    {
      sourceNodeId: "cd3c4233-a339-4f9a-b03f-a60ade2ce25c",
      domOrder: 21,
      label: "SG rule ingress 80",
      position: {
        x: 385,
        y: 545
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "00247cae-d87b-40b3-987f-08a702b062f3",
      zIndex: 21,
      rawTransform: "translate(385, 545), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_security_group_rule"
    },
    {
      sourceNodeId: "f4ae7e8a-8781-4991-a258-6bc4fdeebb62",
      domOrder: 22,
      label: "SG rule ingress 22",
      position: {
        x: 260,
        y: 765
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "00247cae-d87b-40b3-987f-08a702b062f3",
      zIndex: 22,
      rawTransform: "translate(260, 765), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_security_group_rule"
    },
    {
      sourceNodeId: "322e3f91-de14-40e9-95e7-d2961ebe5add",
      domOrder: 23,
      label: "SG rule ingress 8080",
      position: {
        x: 260,
        y: 895
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "00247cae-d87b-40b3-987f-08a702b062f3",
      zIndex: 23,
      rawTransform: "translate(260, 895), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_security_group_rule"
    },
    {
      sourceNodeId: "66ebe038-ae86-4ec6-8f43-6ddddf3a1f9d",
      domOrder: 24,
      label: "SG rule ingress 22",
      position: {
        x: 2600,
        y: 450
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "4c8d5064-37af-4f69-84ae-093f1652e998",
      zIndex: 24,
      rawTransform: "translate(2600, 450), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_security_group_rule"
    },
    {
      sourceNodeId: "ec1ee03a-b434-450d-83f4-a3c881aca9e9",
      domOrder: 25,
      label: "SG rule egress",
      position: {
        x: 485,
        y: 435
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "00247cae-d87b-40b3-987f-08a702b062f3",
      zIndex: 25,
      rawTransform: "translate(485, 435), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_security_group_rule"
    },
    {
      sourceNodeId: "7e0371f7-989e-4443-81f4-ba9507600c5b",
      domOrder: 26,
      label: "SG rule egress",
      position: {
        x: 470,
        y: 755
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "00247cae-d87b-40b3-987f-08a702b062f3",
      zIndex: 26,
      rawTransform: "translate(470, 755), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_security_group_rule"
    },
    {
      sourceNodeId: "a0bc45ed-9de6-4e39-acaf-669b0ece77ea",
      domOrder: 27,
      label: "SG rule ingress from us-west-2",
      position: {
        x: 470,
        y: 895
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "00247cae-d87b-40b3-987f-08a702b062f3",
      zIndex: 27,
      rawTransform: "translate(470, 895), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_security_group_rule"
    },
    {
      sourceNodeId: "054d907a-9682-42cd-a2fe-58e6c2d8bff7",
      domOrder: 28,
      label: "SG rule ingress from us-east-2",
      position: {
        x: 2690,
        y: 560
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "4c8d5064-37af-4f69-84ae-093f1652e998",
      zIndex: 28,
      rawTransform: "translate(2690, 560), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_security_group_rule"
    },
    {
      sourceNodeId: "69b98bc5-0d94-4536-839a-fc59f824e62c",
      domOrder: 29,
      label: "SG rule egress",
      position: {
        x: 2770,
        y: 450
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "4c8d5064-37af-4f69-84ae-093f1652e998",
      zIndex: 29,
      rawTransform: "translate(2770, 450), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_security_group_rule"
    },
    {
      sourceNodeId: "876fa860-938e-4e32-b1d1-14ff0746f644",
      domOrder: 30,
      label: "master-key",
      position: {
        x: 1010,
        y: 220
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "f4301d28-06e3-4263-a5ec-5315eb4f7e69",
      zIndex: 30,
      rawTransform: "translate(1010, 220), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_key_pair"
    },
    {
      sourceNodeId: "822a6dc6-00bf-40cb-9929-7042413ebe17",
      domOrder: 31,
      label: "worker-key",
      position: {
        x: 2460,
        y: 180
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "e4672c0f-349e-4a5f-951e-1950b90adbea",
      zIndex: 31,
      rawTransform: "translate(2460, 180), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_key_pair"
    },
    {
      sourceNodeId: "0bc773fc-ee96-4d04-8113-fd6e67060f5f",
      domOrder: 32,
      label: "jenkins-master",
      position: {
        x: 870,
        y: 495
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "b55a1748-7a18-424f-b047-ffa56acd1a92",
      zIndex: 32,
      rawTransform: "translate(870, 495), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_instance"
    },
    {
      sourceNodeId: "f80213b2-c624-4641-ba30-a1ae3839a93f",
      domOrder: 33,
      label: "jenkins-worker-oregon",
      position: {
        x: 2270,
        y: 490
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "be92d4fa-43ef-4fbf-a4ee-71ae6647998e",
      zIndex: 33,
      rawTransform: "translate(2270, 490), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_instance"
    },
    {
      sourceNodeId: "a9e9123e-b88b-49c5-8266-81e77ef12a9a",
      domOrder: 34,
      label: "cert_validation",
      position: {
        x: -320,
        y: 90
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "f4301d28-06e3-4263-a5ec-5315eb4f7e69",
      zIndex: 34,
      rawTransform: "translate(-320, 90), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route53_record"
    },
    {
      sourceNodeId: "21b5bc02-743e-423f-8262-d210ad83825a",
      domOrder: 35,
      label: "jenkins",
      position: {
        x: -150,
        y: 90
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "f4301d28-06e3-4263-a5ec-5315eb4f7e69",
      zIndex: 35,
      rawTransform: "translate(-150, 90), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route53_record"
    },
    {
      sourceNodeId: "08d05e4d-826e-4c51-a218-ed4448ecb8a2",
      domOrder: 36,
      label: "accept_peering",
      position: {
        x: 1590,
        y: 910
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "e4672c0f-349e-4a5f-951e-1950b90adbea",
      zIndex: 36,
      rawTransform: "translate(1590, 910), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_vpc_peering_connection_accepter"
    },
    {
      sourceNodeId: "6331936d-d4de-41f0-ab45-a1f9a8ed2260",
      domOrder: 37,
      label: "application-lb",
      position: {
        x: 280,
        y: 90
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "f4301d28-06e3-4263-a5ec-5315eb4f7e69",
      zIndex: 37,
      rawTransform: "translate(280, 90), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_lb"
    },
    {
      sourceNodeId: "b7918332-62bd-4112-8907-c1cfbb07f2f1",
      domOrder: 38,
      label: "app-lb-tg",
      position: {
        x: 40,
        y: 375
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "00247cae-d87b-40b3-987f-08a702b062f3",
      zIndex: 38,
      rawTransform: "translate(40, 375), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_lb_target_group"
    },
    {
      sourceNodeId: "a45b829c-0e30-4596-aebd-815bdfed85b5",
      domOrder: 39,
      label: "jenkins-listener-http",
      position: {
        x: 645,
        y: 90
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "f4301d28-06e3-4263-a5ec-5315eb4f7e69",
      zIndex: 39,
      rawTransform: "translate(645, 90), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_lb_listener"
    },
    {
      sourceNodeId: "258928c4-85a7-4bf8-bd79-773dfa53a4b9",
      domOrder: 40,
      label: "jenkins-listener-https",
      position: {
        x: 645,
        y: -50
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "f4301d28-06e3-4263-a5ec-5315eb4f7e69",
      zIndex: 40,
      rawTransform: "translate(645, -50), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_lb_listener"
    },
    {
      sourceNodeId: "89e6ed9b-46d3-475c-a1fb-33c2d9abfae4",
      domOrder: 41,
      label: "jenkins-master-attach",
      position: {
        x: 645,
        y: 220
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "f4301d28-06e3-4263-a5ec-5315eb4f7e69",
      zIndex: 41,
      rawTransform: "translate(645, 220), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_lb_target_group_attachment"
    },
    {
      sourceNodeId: "ae51f41c-19a4-4161-abaa-b89059718743",
      domOrder: 42,
      label: "ACM certificate",
      position: {
        x: 935,
        y: -50
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "f4301d28-06e3-4263-a5ec-5315eb4f7e69",
      zIndex: 42,
      rawTransform: "translate(935, -50), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_acm_certificate"
    },
    {
      sourceNodeId: "c0387977-4047-43de-ae43-6edc8dbd91d9",
      domOrder: 43,
      label: "ACM certificate validation",
      position: {
        x: 1275,
        y: -50
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "f4301d28-06e3-4263-a5ec-5315eb4f7e69",
      zIndex: 43,
      rawTransform: "translate(1275, -50), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_acm_certificate_validation"
    }
  ],
  edges: [
    {
      sourceEdgeId: "1e7aed42-7d87-49c2-91e3-1198d030c7f7",
      domOrder: 0,
      zIndex: 0,
      sourceNodeId: "89e6ed9b-46d3-475c-a1fb-33c2d9abfae4",
      targetNodeId: "0bc773fc-ee96-4d04-8113-fd6e67060f5f",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath:
        "M675,280 L675,402.1685546454947 Q675,410.1685546454947 683,410.1685546454947 L892,410.1685546454947 Q900,410.1685546454947 900,418.1685546454947 L900,495",
      sourcePoint: {
        x: 675,
        y: 280
      },
      targetPoint: {
        x: 900,
        y: 495
      },
      waypoints: [
        {
          x: 675,
          y: 280
        },
        {
          x: 675,
          y: 402.1685546454947
        },
        {
          x: 675,
          y: 410.1685546454947
        },
        {
          x: 683,
          y: 410.1685546454947
        },
        {
          x: 892,
          y: 410.1685546454947
        },
        {
          x: 900,
          y: 410.1685546454947
        },
        {
          x: 900,
          y: 418.1685546454947
        },
        {
          x: 900,
          y: 495
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            895,490\n            900,495\n            895,500\n          ",
        transform: "rotate(90, 900, 495)"
      }
    },
    {
      sourceEdgeId: "2b31bcb4-e462-4bc8-91f9-946e86c57fbb",
      domOrder: 1,
      zIndex: 1,
      sourceNodeId: "89e6ed9b-46d3-475c-a1fb-33c2d9abfae4",
      targetNodeId: "b7918332-62bd-4112-8907-c1cfbb07f2f1",
      sourcePort: "left",
      targetPort: "top",
      svgPath: "M645,250 L78,250 Q70,250 70,258 L70,375",
      sourcePoint: {
        x: 645,
        y: 250
      },
      targetPoint: {
        x: 70,
        y: 375
      },
      waypoints: [
        {
          x: 645,
          y: 250
        },
        {
          x: 78,
          y: 250
        },
        {
          x: 70,
          y: 250
        },
        {
          x: 70,
          y: 258
        },
        {
          x: 70,
          y: 375
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            65,370\n            70,375\n            65,380\n          ",
        transform: "rotate(90, 70, 375)"
      }
    },
    {
      sourceEdgeId: "363c9ed9-4e18-43d2-a017-80718fd2a7a3",
      domOrder: 2,
      zIndex: 2,
      sourceNodeId: "a45b829c-0e30-4596-aebd-815bdfed85b5",
      targetNodeId: "b7918332-62bd-4112-8907-c1cfbb07f2f1",
      sourcePort: "left",
      targetPort: "top",
      svgPath:
        "M645,120 L582,120 Q574,120 574,128 L574,197.34044101833283 Q574,205.34044101833283 566,205.34044101833283 L78,205.34044101833283 Q70,205.34044101833283 70,213.34044101833283 L70,375",
      sourcePoint: {
        x: 645,
        y: 120
      },
      targetPoint: {
        x: 70,
        y: 375
      },
      waypoints: [
        {
          x: 645,
          y: 120
        },
        {
          x: 582,
          y: 120
        },
        {
          x: 574,
          y: 120
        },
        {
          x: 574,
          y: 128
        },
        {
          x: 574,
          y: 197.34044101833283
        },
        {
          x: 574,
          y: 205.34044101833283
        },
        {
          x: 566,
          y: 205.34044101833283
        },
        {
          x: 78,
          y: 205.34044101833283
        },
        {
          x: 70,
          y: 205.34044101833283
        },
        {
          x: 70,
          y: 213.34044101833283
        },
        {
          x: 70,
          y: 375
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            65,370\n            70,375\n            65,380\n          ",
        transform: "rotate(90, 70, 375)"
      }
    },
    {
      sourceEdgeId: "371fb0d7-8d72-4a69-b727-dceb93d53b69",
      domOrder: 3,
      zIndex: 3,
      sourceNodeId: "21b5bc02-743e-423f-8262-d210ad83825a",
      targetNodeId: "6331936d-d4de-41f0-ab45-a1f9a8ed2260",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M-90,120 L280,120",
      sourcePoint: {
        x: -90,
        y: 120
      },
      targetPoint: {
        x: 280,
        y: 120
      },
      waypoints: [
        {
          x: -90,
          y: 120
        },
        {
          x: 280,
          y: 120
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            275,115\n            280,120\n            275,125\n          ",
        transform: "rotate(0, 280, 120)"
      }
    },
    {
      sourceEdgeId: "45fab82b-09ac-4c89-9e25-3ba50121fd2f",
      domOrder: 4,
      zIndex: 4,
      sourceNodeId: "21b5bc02-743e-423f-8262-d210ad83825a",
      targetNodeId: "6331936d-d4de-41f0-ab45-a1f9a8ed2260",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M-90,120 L280,120",
      sourcePoint: {
        x: -90,
        y: 120
      },
      targetPoint: {
        x: 280,
        y: 120
      },
      waypoints: [
        {
          x: -90,
          y: 120
        },
        {
          x: 280,
          y: 120
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            275,115\n            280,120\n            275,125\n          ",
        transform: "rotate(0, 280, 120)"
      }
    },
    {
      sourceEdgeId: "647ff8ae-9e11-45ff-b11e-236723aca99e",
      domOrder: 5,
      zIndex: 5,
      sourceNodeId: "651d53c3-cceb-4967-b5c3-e025e140fa3b",
      targetNodeId: "19c57b20-0ebb-4efb-b35e-8c37e175e918",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M60,595 L-150,595",
      sourcePoint: {
        x: 60,
        y: 595
      },
      targetPoint: {
        x: -150,
        y: 595
      },
      waypoints: [
        {
          x: 60,
          y: 595
        },
        {
          x: -150,
          y: 595
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            -155,590\n            -150,595\n            -155,600\n          ",
        transform: "rotate(180, -150, 595)"
      }
    },
    {
      sourceEdgeId: "70f14fac-751b-45c6-82c6-d465fb130652",
      domOrder: 6,
      zIndex: 6,
      sourceNodeId: "0bc773fc-ee96-4d04-8113-fd6e67060f5f",
      targetNodeId: "876fa860-938e-4e32-b1d1-14ff0746f644",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath:
        "M900,495 L900,419.5019990364061 Q900,411.5019990364061 908,411.5019990364061 L1032,411.5019990364061 Q1040,411.5019990364061 1040,403.5019990364061 L1040,280",
      sourcePoint: {
        x: 900,
        y: 495
      },
      targetPoint: {
        x: 1040,
        y: 280
      },
      waypoints: [
        {
          x: 900,
          y: 495
        },
        {
          x: 900,
          y: 419.5019990364061
        },
        {
          x: 900,
          y: 411.5019990364061
        },
        {
          x: 908,
          y: 411.5019990364061
        },
        {
          x: 1032,
          y: 411.5019990364061
        },
        {
          x: 1040,
          y: 411.5019990364061
        },
        {
          x: 1040,
          y: 403.5019990364061
        },
        {
          x: 1040,
          y: 280
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            1035,275\n            1040,280\n            1035,285\n          ",
        transform: "rotate(-90, 1040, 280)"
      }
    },
    {
      sourceEdgeId: "75cb82c6-9edd-4b16-bff3-4726385cef5e",
      domOrder: 7,
      zIndex: 7,
      sourceNodeId: "bb82de1b-7d92-41fc-a0a9-d1c5e3634d11",
      targetNodeId: "08a82fc0-d9d9-46af-a271-b7b182986246",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M1930,610 L1730,610",
      sourcePoint: {
        x: 1930,
        y: 610
      },
      targetPoint: {
        x: 1730,
        y: 610
      },
      waypoints: [
        {
          x: 1930,
          y: 610
        },
        {
          x: 1730,
          y: 610
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            1725,605\n            1730,610\n            1725,615\n          ",
        transform: "rotate(180, 1730, 610)"
      }
    },
    {
      sourceEdgeId: "86af3a8d-21bd-4b49-b0bd-8bc2b6a4e778",
      domOrder: 8,
      zIndex: 8,
      sourceNodeId: "258928c4-85a7-4bf8-bd79-773dfa53a4b9",
      targetNodeId: "6331936d-d4de-41f0-ab45-a1f9a8ed2260",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M645,-20 L500.5,-20 Q492.5,-20 492.5,-12 L492.5,112 Q492.5,120 484.5,120 L340,120",
      sourcePoint: {
        x: 645,
        y: -20
      },
      targetPoint: {
        x: 340,
        y: 120
      },
      waypoints: [
        {
          x: 645,
          y: -20
        },
        {
          x: 500.5,
          y: -20
        },
        {
          x: 492.5,
          y: -20
        },
        {
          x: 492.5,
          y: -12
        },
        {
          x: 492.5,
          y: 112
        },
        {
          x: 492.5,
          y: 120
        },
        {
          x: 484.5,
          y: 120
        },
        {
          x: 340,
          y: 120
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            335,115\n            340,120\n            335,125\n          ",
        transform: "rotate(180, 340, 120)"
      }
    },
    {
      sourceEdgeId: "a48f54e0-d5c6-4488-b094-71a1abcbfea1",
      domOrder: 9,
      zIndex: 9,
      sourceNodeId: "c0387977-4047-43de-ae43-6edc8dbd91d9",
      targetNodeId: "ae51f41c-19a4-4161-abaa-b89059718743",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M1275,-20 L995,-20",
      sourcePoint: {
        x: 1275,
        y: -20
      },
      targetPoint: {
        x: 995,
        y: -20
      },
      waypoints: [
        {
          x: 1275,
          y: -20
        },
        {
          x: 995,
          y: -20
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            990,-25\n            995,-20\n            990,-15\n          ",
        transform: "rotate(180, 995, -20)"
      }
    },
    {
      sourceEdgeId: "a829d282-4218-475a-b997-96e13ad3806d",
      domOrder: 10,
      zIndex: 10,
      sourceNodeId: "fa46f093-d66a-4f84-8568-a3c04fdc2c44",
      targetNodeId: "651d53c3-cceb-4967-b5c3-e025e140fa3b",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M90,765 L90,625",
      sourcePoint: {
        x: 90,
        y: 765
      },
      targetPoint: {
        x: 90,
        y: 625
      },
      waypoints: [
        {
          x: 90,
          y: 765
        },
        {
          x: 90,
          y: 625
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            85,620\n            90,625\n            85,630\n          ",
        transform: "rotate(-90, 90, 625)"
      }
    },
    {
      sourceEdgeId: "b7b9e1b3-e881-4964-97c5-7a4ae0465b8f",
      domOrder: 11,
      zIndex: 11,
      sourceNodeId: "258928c4-85a7-4bf8-bd79-773dfa53a4b9",
      targetNodeId: "ae51f41c-19a4-4161-abaa-b89059718743",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M705,-20 L935,-20",
      sourcePoint: {
        x: 705,
        y: -20
      },
      targetPoint: {
        x: 935,
        y: -20
      },
      waypoints: [
        {
          x: 705,
          y: -20
        },
        {
          x: 935,
          y: -20
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            930,-25\n            935,-20\n            930,-15\n          ",
        transform: "rotate(0, 935, -20)"
      }
    },
    {
      sourceEdgeId: "babe477e-6a9e-47bf-a3b1-4bc53b045260",
      domOrder: 12,
      zIndex: 12,
      sourceNodeId: "258928c4-85a7-4bf8-bd79-773dfa53a4b9",
      targetNodeId: "b7918332-62bd-4112-8907-c1cfbb07f2f1",
      sourcePort: "left",
      targetPort: "top",
      svgPath: "M645,-20 L78,-20 Q70,-20 70,-12 L70,375",
      sourcePoint: {
        x: 645,
        y: -20
      },
      targetPoint: {
        x: 70,
        y: 375
      },
      waypoints: [
        {
          x: 645,
          y: -20
        },
        {
          x: 78,
          y: -20
        },
        {
          x: 70,
          y: -20
        },
        {
          x: 70,
          y: -12
        },
        {
          x: 70,
          y: 375
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            65,370\n            70,375\n            65,380\n          ",
        transform: "rotate(90, 70, 375)"
      }
    },
    {
      sourceEdgeId: "c4cdbbb8-1947-4380-a928-2abaa52108a1",
      domOrder: 13,
      zIndex: 13,
      sourceNodeId: "f80213b2-c624-4641-ba30-a1ae3839a93f",
      targetNodeId: "822a6dc6-00bf-40cb-9929-7042413ebe17",
      sourcePort: "top",
      targetPort: "left",
      svgPath: "M2300,490 L2300,218 Q2300,210 2308,210 L2460,210",
      sourcePoint: {
        x: 2300,
        y: 490
      },
      targetPoint: {
        x: 2460,
        y: 210
      },
      waypoints: [
        {
          x: 2300,
          y: 490
        },
        {
          x: 2300,
          y: 218
        },
        {
          x: 2300,
          y: 210
        },
        {
          x: 2308,
          y: 210
        },
        {
          x: 2460,
          y: 210
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            2455,205\n            2460,210\n            2455,215\n          ",
        transform: "rotate(0, 2460, 210)"
      }
    },
    {
      sourceEdgeId: "cbfbd09c-be21-4662-9657-d084e40dcec9",
      domOrder: 14,
      zIndex: 14,
      sourceNodeId: "cac8d6c9-02a8-4984-8a5d-c398d6c7e50a",
      targetNodeId: "bb82de1b-7d92-41fc-a0a9-d1c5e3634d11",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M1960,770 L1960,640",
      sourcePoint: {
        x: 1960,
        y: 770
      },
      targetPoint: {
        x: 1960,
        y: 640
      },
      waypoints: [
        {
          x: 1960,
          y: 770
        },
        {
          x: 1960,
          y: 640
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            1955,635\n            1960,640\n            1955,645\n          ",
        transform: "rotate(-90, 1960, 640)"
      }
    },
    {
      sourceEdgeId: "dddcdb6f-81c9-4188-a02c-96809ec0dd3f",
      domOrder: 15,
      zIndex: 15,
      sourceNodeId: "08d05e4d-826e-4c51-a218-ed4448ecb8a2",
      targetNodeId: "606e1369-d916-490e-94c7-4aedeeafe7e0",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M1590,940 L1250,940",
      sourcePoint: {
        x: 1590,
        y: 940
      },
      targetPoint: {
        x: 1250,
        y: 940
      },
      waypoints: [
        {
          x: 1590,
          y: 940
        },
        {
          x: 1250,
          y: 940
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            1245,935\n            1250,940\n            1245,945\n          ",
        transform: "rotate(180, 1250, 940)"
      }
    },
    {
      sourceEdgeId: "e3facca6-cd56-441b-8987-21a12ef89b70",
      domOrder: 16,
      zIndex: 16,
      sourceNodeId: "a45b829c-0e30-4596-aebd-815bdfed85b5",
      targetNodeId: "6331936d-d4de-41f0-ab45-a1f9a8ed2260",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M645,120 L340,120",
      sourcePoint: {
        x: 645,
        y: 120
      },
      targetPoint: {
        x: 340,
        y: 120
      },
      waypoints: [
        {
          x: 645,
          y: 120
        },
        {
          x: 340,
          y: 120
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            335,115\n            340,120\n            335,125\n          ",
        transform: "rotate(180, 340, 120)"
      }
    },
    {
      sourceEdgeId: "f27ef04a-df3f-4136-aeec-3d1c5ba924c2",
      domOrder: 17,
      zIndex: 17,
      sourceNodeId: "0bc773fc-ee96-4d04-8113-fd6e67060f5f",
      targetNodeId: "33ce152b-f405-4f28-86e5-4e894df70cd4",
      sourcePort: "bottom",
      targetPort: "right",
      svgPath: "M900,555 L900,829.5 Q900,837.5 892,837.5 L625,837.5",
      sourcePoint: {
        x: 900,
        y: 555
      },
      targetPoint: {
        x: 625,
        y: 837.5
      },
      waypoints: [
        {
          x: 900,
          y: 555
        },
        {
          x: 900,
          y: 829.5
        },
        {
          x: 900,
          y: 837.5
        },
        {
          x: 892,
          y: 837.5
        },
        {
          x: 625,
          y: 837.5
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            620,832.5\n            625,837.5\n            620,842.5\n          ",
        transform: "rotate(180, 625, 837.5)"
      }
    }
  ],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_lb" "application-lb" {\n  provider = aws.us-east-2\n\n  name               = "jenkins-lb"\n  load_balancer_type = "application"\n  internal           = false\n\n  security_groups = [\n    aws_security_group.lb-sg.id,\n  ]\n\n  subnets = [\n    aws_subnet.subnet_1.id,\n    aws_subnet.subnet_2.id,\n  ]\n\n  tags = {\n    Source = "Brainboard"\n    Name   = "Jenkins-LB"\n  }\n}\n\nresource "aws_main_route_table_association" "set-worker-default-rt-assoc" {\n  provider = aws.us-west-2\n\n  vpc_id         = aws_vpc.vpc_master_us_west_2.id\n  route_table_id = aws_route_table.internet_route_oregon.id\n}\n\nresource "aws_vpc" "vpc_master" {\n  provider = aws.us-east-2\n\n  enable_dns_support   = true\n  enable_dns_hostnames = true\n  cidr_block           = "10.0.0.0/16"\n\n  tags = {\n    Source = "Brainboard"\n    Name   = "matts-master-vpc"\n  }\n}\n\nresource "aws_lb_listener" "aws_lb_listener_117174a9" {\n  provider = aws.us-east-2\n\n  port              = 80\n  load_balancer_arn = aws_lb.application-lb.arn\n\n  default_action {\n    type             = "redirect"\n    target_group_arn = aws_lb_target_group.app-lb-tg.id\n\n    redirect {\n      status_code = "HTTP_301"\n      protocol    = "HTTPS"\n      port        = "443"\n    }\n  }\n}\n\nresource "aws_subnet" "subnet_1" {\n  provider = aws.us-east-2\n\n  vpc_id            = aws_vpc.vpc_master.id\n  cidr_block        = "10.0.1.0/24"\n  availability_zone = "us-east-2b"\n\n  tags = {\n    Source = "Brainboard"\n  }\n}\n\nresource "aws_lb_target_group" "app-lb-tg" {\n  provider = aws.us-east-2\n\n  vpc_id      = aws_vpc.vpc_master.id\n  target_type = "instance"\n  protocol    = "HTTP"\n  port        = var.webserver-port\n  name        = "app-lb-tg"\n\n  health_check {\n    protocol = "HTTP"\n    port     = var.webserver-port\n    path     = "/"\n    matcher  = "200-299"\n    interval = 10\n    enabled  = true\n  }\n\n  tags = {\n    Source = "Brainboard"\n    Name   = "jenkins-target-group"\n  }\n}\n\nresource "aws_security_group" "jenkins-sg-oregon" {\n  provider = aws.us-west-2\n\n  vpc_id      = aws_vpc.vpc_master_us_west_2.id\n  name        = "jenkins-sg-oregon"\n  description = "Allow TCP/8080 & TCP/22"\n\n  tags = {\n    Source = "Brainboard"\n  }\n}\n\nresource "aws_lb_listener" "jenkins-listener-https" {\n  provider = aws.us-east-2\n\n  ssl_policy        = "ELBSecurityPolicy-2016-08"\n  protocol          = "HTTPS"\n  port              = 443\n  load_balancer_arn = aws_lb.application-lb.arn\n  certificate_arn   = aws_acm_certificate.jenkins-lb-https.arn\n\n  default_action {\n    type             = "forward"\n    target_group_arn = aws_lb_target_group.app-lb-tg.arn\n  }\n}\n\nresource "aws_key_pair" "worker-key" {\n  provider = aws.us-west-2\n\n  public_key = var.worker_pub_key\n\n  tags = {\n    Source = "Brainboard"\n  }\n}\n\nresource "aws_security_group_rule" "aws_security_group_rule-6a963203" {\n  provider = aws.us-east-2\n\n  type              = "ingress"\n  to_port           = 0\n  security_group_id = aws_security_group.jenkins-sg.id\n  protocol          = "-1"\n  from_port         = 0\n  description       = "Allow traffic from us-west-2"\n\n  cidr_blocks = [\n    "192.168.1.0/24",\n  ]\n}\n\nresource "aws_key_pair" "master-key" {\n  provider = aws.us-east-2\n\n  public_key = var.master_pub_key\n\n  tags = {\n    Source = "Brainboard"\n  }\n}\n\nresource "aws_internet_gateway" "igw-oregon" {\n  provider = aws.us-west-2\n\n  vpc_id = aws_vpc.vpc_master_us_west_2.id\n\n  tags = {\n    Source = "Brainboard"\n  }\n}\n\nresource "aws_vpc_peering_connection" "useast2-uswest2" {\n  provider = aws.us-east-2\n\n  vpc_id      = aws_vpc.vpc_master.id\n  peer_vpc_id = aws_vpc.vpc_master_us_west_2.id\n  peer_region = var.region-worker\n\n  tags = {\n    Source = "Brainboard"\n  }\n}\n\nresource "aws_security_group_rule" "ingress_443" {\n  provider = aws.us-east-2\n\n  type              = "ingress"\n  to_port           = 443\n  security_group_id = aws_security_group.lb-sg.id\n  protocol          = "tcp"\n  from_port         = 443\n  description       = "Allow 443 from anywhere"\n\n  cidr_blocks = [\n    "0.0.0.0/0",\n  ]\n}\n\nresource "aws_internet_gateway" "igw" {\n  provider = aws.us-east-2\n\n  vpc_id = aws_vpc.vpc_master.id\n\n  tags = {\n    Source = "Brainboard"\n  }\n}\n\nresource "aws_acm_certificate" "jenkins-lb-https" {\n  provider = aws.us-east-2\n\n  validation_method = "DNS"\n  domain_name       = "jenkins.brainboard.co"\n\n  tags = {\n    Source = "Brainboard"\n    Name   = "Jenkins-ACM"\n  }\n}\n\nresource "aws_route_table" "internet_route_oregon" {\n  provider = aws.us-west-2\n\n  vpc_id = aws_vpc.vpc_master_us_west_2.id\n\n  route {\n    gateway_id = aws_internet_gateway.igw-oregon.id\n    cidr_block = "0.0.0.0/0"\n  }\n\n  tags = {\n    Source = "Brainboard"\n    Name   = "Worker-Region-RT"\n  }\n}\n\nresource "aws_route53_record" "jenkins" {\n  provider = aws.us-east-2\n\n  zone_id = var.zone-id\n  type    = "A"\n  name    = "jenkins.brainboard.co"\n\n  alias {\n    zone_id                = aws_lb.application-lb.zone_id\n    name                   = aws_lb.application-lb.dns_name\n    evaluate_target_health = true\n  }\n}\n\nresource "aws_security_group" "lb-sg" {\n  provider = aws.us-east-2\n\n  vpc_id      = aws_vpc.vpc_master.id\n  name        = "lb-sg"\n  description = "Allow 443 and traffic to Jenkins SG"\n\n  tags = {\n    Source = "Brainboard"\n  }\n}\n\nresource "aws_vpc_peering_connection_accepter" "accept_peering" {\n  provider = aws.us-west-2\n\n  vpc_peering_connection_id = aws_vpc_peering_connection.useast2-uswest2.id\n\n  tags = {\n    Source = "Brainboard"\n  }\n}\n\nresource "aws_instance" "jenkins-worker-oregon" {\n  provider = aws.us-west-2\n\n  subnet_id                   = aws_subnet.subnet_1_oregon.id\n  key_name                    = aws_key_pair.worker-key.key_name\n  instance_type               = "t3.micro"\n  count                       = var.workers-count\n  availability_zone           = "us-west-2a"\n  associate_public_ip_address = true\n  ami                         = var.ami\n\n  depends_on = [\n    aws_main_route_table_association.set-worker-default-rt-assoc,\n    aws_instance.jenkins-master,\n  ]\n\n  tags = {\n    Source = "Brainboard"\n    Name   = join("_", ["jenkins_worker_tf", count.index + 1])\n  }\n\n  vpc_security_group_ids = [\n    aws_security_group.jenkins-sg-oregon.id,\n  ]\n}\n\nresource "aws_vpc" "vpc_master_us_west_2" {\n  provider = aws.us-west-2\n\n  enable_dns_support   = true\n  enable_dns_hostnames = true\n  cidr_block           = "192.168.0.0/16"\n\n  tags = {\n    Source = "Brainboard"\n    Name   = "matts-worker-vpc"\n  }\n}\n\nresource "aws_route_table" "internet_route" {\n  provider = aws.us-east-2\n\n  vpc_id = aws_vpc.vpc_master.id\n\n  lifecycle {\n    ignore_changes = ""\n  }\n\n  route {\n    gateway_id = aws_internet_gateway.igw.id\n    cidr_block = "0.0.0.0/0"\n  }\n\n  tags = {\n    Source = "Brainboard"\n    Name   = "Master-Region-RT"\n  }\n}\n\nresource "aws_security_group_rule" "aws_security_group_rule-a5db6d6d" {\n  provider = aws.us-east-2\n\n  type              = "ingress"\n  to_port           = var.webserver-port\n  security_group_id = aws_security_group.jenkins-sg.id\n  protocol          = "tcp"\n  from_port         = var.webserver-port\n  description       = "Allow anyone on port 8080"\n\n  cidr_blocks = [\n    "0.0.0.0/0",\n  ]\n}\n\nresource "aws_instance" "jenkins-master" {\n  provider = aws.us-east-2\n\n  subnet_id                   = aws_subnet.subnet_1.id\n  key_name                    = aws_key_pair.master-key.key_name\n  instance_type               = "t3.micro"\n  availability_zone           = "us-east-2a"\n  associate_public_ip_address = true\n  ami                         = var.ami\n\n  depends_on = [\n    aws_main_route_table_association.set-worker-default-rt-assoc,\n  ]\n\n  tags = {\n    Source = "Brainboard"\n    Name   = "jenkins_master_tf"\n  }\n\n  vpc_security_group_ids = [\n    aws_security_group.jenkins-sg.id,\n  ]\n}\n\nresource "aws_subnet" "subnet_2" {\n  provider = aws.us-east-2\n\n  vpc_id            = aws_vpc.vpc_master.id\n  cidr_block        = "10.0.2.0/24"\n  availability_zone = "us-east-2b"\n\n  tags = {\n    Source = "Brainboard"\n  }\n}\n\nresource "aws_lb_target_group_attachment" "jenkins-master-attach" {\n  provider = aws.us-east-2\n\n  target_id        = aws_instance.jenkins-master.id\n  target_group_arn = aws_lb_target_group.app-lb-tg.arn\n  port             = var.webserver-port\n}\n\nresource "aws_security_group_rule" "aws_security_group_rule-bba6e6bc" {\n  provider = aws.us-east-2\n\n  type              = "ingress"\n  to_port           = 22\n  security_group_id = aws_security_group.jenkins-sg.id\n  protocol          = "tcp"\n  from_port         = 22\n  description       = "Allow 22 from our public IP"\n\n  cidr_blocks = [\n    var.external_ip,\n  ]\n}\n\nresource "aws_security_group_rule" "aws_security_group_rule-bcdf5fec" {\n  provider = aws.us-west-2\n\n  type              = "ingress"\n  to_port           = 22\n  security_group_id = aws_security_group.jenkins-sg-oregon.id\n  protocol          = "tcp"\n  from_port         = 22\n  description       = "Allow 22 from our public IP"\n\n  cidr_blocks = [\n    var.external_ip,\n  ]\n}\n\nresource "aws_security_group_rule" "aws_security_group_rule-becf1315" {\n  provider = aws.us-east-2\n\n  type              = "egress"\n  to_port           = 0\n  security_group_id = aws_security_group.lb-sg.id\n  protocol          = "-1"\n  from_port         = 0\n  description       = "Allow all from anywhere"\n\n  cidr_blocks = [\n    "0.0.0.0/0",\n  ]\n}\n\nresource "aws_security_group_rule" "aws_security_group_rule-c0f59b71" {\n  provider = aws.us-west-2\n\n  type              = "egress"\n  to_port           = 0\n  security_group_id = aws_security_group.jenkins-sg-oregon.id\n  protocol          = "-1"\n  from_port         = 0\n  description       = "Allow all from anywhere"\n\n  cidr_blocks = [\n    "0.0.0.0/0",\n  ]\n}\n\nresource "aws_security_group_rule" "aws_security_group_rule-cd816426" {\n  provider = aws.us-east-2\n\n  type              = "ingress"\n  to_port           = 80\n  security_group_id = aws_security_group.lb-sg.id\n  protocol          = "tcp"\n  from_port         = 80\n  description       = "Allow 80 from anywhere"\n\n  cidr_blocks = [\n    "0.0.0.0/0",\n  ]\n}\n\nresource "aws_security_group" "jenkins-sg" {\n  provider = aws.us-east-2\n\n  vpc_id      = aws_vpc.vpc_master.id\n  name        = "jenkins-sg"\n  description = "Allow TCP/8080 & TCP/22"\n\n  tags = {\n    Source = "Brainboard"\n  }\n}\n\nresource "aws_main_route_table_association" "aws_main_route_table_association_d71db21a" {\n  provider = aws.us-east-2\n\n  vpc_id         = aws_vpc.vpc_master.id\n  route_table_id = aws_route_table.internet_route.id\n}\n\nresource "aws_security_group_rule" "aws_security_group_rule-d771cb77" {\n  provider = aws.us-west-2\n\n  type              = "ingress"\n  to_port           = 0\n  security_group_id = aws_security_group.jenkins-sg-oregon.id\n  protocol          = "-1"\n  from_port         = 0\n  description       = "Allow traffic from us-east-2"\n\n  cidr_blocks = [\n    "10.0.1.0/24",\n  ]\n}\n\nresource "aws_security_group_rule" "aws_security_group_rule-dc61e49a" {\n  provider = aws.us-east-2\n\n  type              = "egress"\n  to_port           = 0\n  security_group_id = aws_security_group.jenkins-sg.id\n  protocol          = "-1"\n  from_port         = 0\n  description       = "Allow all from anywhere"\n\n  cidr_blocks = [\n    "0.0.0.0/0",\n  ]\n}\n\nresource "aws_route53_record" "cert_validation" {\n  provider = aws.us-east-2\n\n  zone_id = var.zone-id\n  type    = "A"\n  name    = "jenkins.brainboard.co"\n\n  records = [\n    "1.2.3.4",\n  ]\n}\n\nresource "aws_subnet" "subnet_1_oregon" {\n  provider = aws.us-west-2\n\n  vpc_id            = aws_vpc.vpc_master_us_west_2.id\n  cidr_block        = "192.168.1.0/24"\n  availability_zone = "us-west-2a"\n\n  tags = {\n    Source = "Brainboard"\n  }\n}\n\nresource "aws_acm_certificate_validation" "cert" {\n  provider = aws.us-east-2\n\n  for_each        = aws_route53_record.cert_validation\n  certificate_arn = aws_acm_certificate.jenkins-lb-https.arn\n\n  validation_record_fqdns = [\n    aws_route53_record.cert_validation.fqdn,\n  ]\n}\n\n',
        sha256: "2d50f07ffb8d592537aa721209fa13d6b4c22e1da98d432d801bb06360665e89",
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
        code: 'terraform {\n  required_providers {\n    aws = {\n      version = "= 5.52.0"\n    }\n  }\n}\n\n# Brainboard aliases for AWS regions\nprovider "aws" {\n  alias  = "us-east-2"\n  region = "us-east-2"\n}\nprovider "aws" {\n  alias  = "us-west-2"\n  region = "us-west-2"\n}\n',
        sha256: "ff20243d28454bd391d0e2e151cf835fd1066be7507a9dcf1fafc4591b4e1c3d",
        includeInWorkspace: true
      },
      {
        fileName: "terraform.tfvars",
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "3ff1b689-c574-4ff7-9e00-ae3a29197cc0"\n  env      = "Production"\n}\n',
        sha256: "940acb4708b22e7ecd041d15c485becf2ef43b48a4239e338ef0945a91e364e8",
        includeInWorkspace: false
      },
      {
        fileName: "variables.tf",
        code: 'variable "ami" {\n  type    = string\n  default = "your-ami"\n}\n\nvariable "external_ip" {\n  type    = string\n  default = "0.0.0.0/0"\n}\n\nvariable "master_pub_key" {\n  type    = string\n  default = "your key"\n}\n\nvariable "region-master" {\n  type    = string\n  default = "us-east-2"\n}\n\nvariable "region-worker" {\n  type    = string\n  default = "us-west-2"\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    archuuid = "c884d82a-6fab-454f-a984-619d65ad6044"\n    env      = "Development"\n  }\n}\n\nvariable "webserver-port" {\n  type    = string\n  default = "8080"\n}\n\nvariable "worker_pub_key" {\n  type    = string\n  default = "your key"\n}\n\nvariable "workers-count" {\n  type    = number\n  default = 1\n}\n\nvariable "zone-id" {\n  type    = string\n  default = "brainboard.co"\n}\n\n',
        sha256: "49deceb95aa1752bec8b351b4f2a5f8efad25a746ccc2d6bbb3c41d8fdc97e67",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'variable "ami" {\n  type    = string\n  default = "your-ami"\n}\n\nvariable "external_ip" {\n  type    = string\n  default = "0.0.0.0/0"\n}\n\nvariable "master_pub_key" {\n  type    = string\n  default = "your key"\n}\n\nvariable "region-master" {\n  type    = string\n  default = "us-east-2"\n}\n\nvariable "region-worker" {\n  type    = string\n  default = "us-west-2"\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    env      = "Development"\n  }\n}\n\nvariable "webserver-port" {\n  type    = string\n  default = "8080"\n}\n\nvariable "worker_pub_key" {\n  type    = string\n  default = "your key"\n}\n\nvariable "workers-count" {\n  type    = number\n  default = 1\n}\n\nvariable "zone-id" {\n  type    = string\n  default = "brainboard.co"\n}\n\n',
          sha256: "f17dd5abc32ea9ec043bd0dfeb4ea7f3a4bc23afa6abedbc15d1e9bcc6e8b8b9",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archuuid = "c884d82a-6fab-454f-a984-619d65ad6044"\n',
              occurrenceCount: 1
            }
          ]
        }
      }
    ],
    resourceAddresses: [
      "aws_lb.application-lb",
      "aws_main_route_table_association.set-worker-default-rt-assoc",
      "aws_vpc.vpc_master",
      "aws_lb_listener.aws_lb_listener_117174a9",
      "aws_subnet.subnet_1",
      "aws_lb_target_group.app-lb-tg",
      "aws_security_group.jenkins-sg-oregon",
      "aws_lb_listener.jenkins-listener-https",
      "aws_key_pair.worker-key",
      "aws_security_group_rule.aws_security_group_rule-6a963203",
      "aws_key_pair.master-key",
      "aws_internet_gateway.igw-oregon",
      "aws_vpc_peering_connection.useast2-uswest2",
      "aws_security_group_rule.ingress_443",
      "aws_internet_gateway.igw",
      "aws_acm_certificate.jenkins-lb-https",
      "aws_route_table.internet_route_oregon",
      "aws_route53_record.jenkins",
      "aws_security_group.lb-sg",
      "aws_vpc_peering_connection_accepter.accept_peering",
      "aws_instance.jenkins-worker-oregon",
      "aws_vpc.vpc_master_us_west_2",
      "aws_route_table.internet_route",
      "aws_security_group_rule.aws_security_group_rule-a5db6d6d",
      "aws_instance.jenkins-master",
      "aws_subnet.subnet_2",
      "aws_lb_target_group_attachment.jenkins-master-attach",
      "aws_security_group_rule.aws_security_group_rule-bba6e6bc",
      "aws_security_group_rule.aws_security_group_rule-bcdf5fec",
      "aws_security_group_rule.aws_security_group_rule-becf1315",
      "aws_security_group_rule.aws_security_group_rule-c0f59b71",
      "aws_security_group_rule.aws_security_group_rule-cd816426",
      "aws_security_group.jenkins-sg",
      "aws_main_route_table_association.aws_main_route_table_association_d71db21a",
      "aws_security_group_rule.aws_security_group_rule-d771cb77",
      "aws_security_group_rule.aws_security_group_rule-dc61e49a",
      "aws_route53_record.cert_validation",
      "aws_subnet.subnet_1_oregon",
      "aws_acm_certificate_validation.cert"
    ]
  },
  bindings: {
    "f4301d28-06e3-4263-a5ec-5315eb4f7e69": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "00247cae-d87b-40b3-987f-08a702b062f3": {
      kind: "resource",
      address: "aws_vpc.vpc_master",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "7284b103-be2a-4159-b7f4-b6ab0cb802fa": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "8894d2b3-f035-4824-ae9c-ed68cae67835": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "e4672c0f-349e-4a5f-951e-1950b90adbea": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "4c8d5064-37af-4f69-84ae-093f1652e998": {
      kind: "resource",
      address: "aws_vpc.vpc_master_us_west_2",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "050262e9-c94b-48b6-90b1-7298da1a70a2": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "b55a1748-7a18-424f-b047-ffa56acd1a92": {
      kind: "resource",
      address: "aws_subnet.subnet_1",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "0521d44b-15ce-40f0-abb8-6f2bd189eafa": {
      kind: "resource",
      address: "aws_subnet.subnet_2",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "be92d4fa-43ef-4fbf-a4ee-71ae6647998e": {
      kind: "resource",
      address: "aws_subnet.subnet_1_oregon",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "5b91539b-dc2d-4d8d-9aac-a1c52e9b7200": {
      kind: "resource",
      address: "aws_security_group.lb-sg",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "33ce152b-f405-4f28-86e5-4e894df70cd4": {
      kind: "resource",
      address: "aws_security_group.jenkins-sg",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "714b53d2-89b3-465a-9151-2318985dbd2d": {
      kind: "resource",
      address: "aws_security_group.jenkins-sg-oregon",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "19c57b20-0ebb-4efb-b35e-8c37e175e918": {
      kind: "resource",
      address: "aws_internet_gateway.igw",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "08a82fc0-d9d9-46af-a271-b7b182986246": {
      kind: "resource",
      address: "aws_internet_gateway.igw-oregon",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "606e1369-d916-490e-94c7-4aedeeafe7e0": {
      kind: "resource",
      address: "aws_vpc_peering_connection.useast2-uswest2",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "651d53c3-cceb-4967-b5c3-e025e140fa3b": {
      kind: "resource",
      address: "aws_route_table.internet_route",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "fa46f093-d66a-4f84-8568-a3c04fdc2c44": {
      kind: "resource",
      address: "aws_main_route_table_association.aws_main_route_table_association_d71db21a",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "bb82de1b-7d92-41fc-a0a9-d1c5e3634d11": {
      kind: "resource",
      address: "aws_route_table.internet_route_oregon",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "cac8d6c9-02a8-4984-8a5d-c398d6c7e50a": {
      kind: "resource",
      address: "aws_main_route_table_association.set-worker-default-rt-assoc",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "4fd77125-9a08-4a94-8900-6d00c4037415": {
      kind: "resource",
      address: "aws_security_group_rule.ingress_443",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "cd3c4233-a339-4f9a-b03f-a60ade2ce25c": {
      kind: "resource",
      address: "aws_security_group_rule.aws_security_group_rule-cd816426",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "f4ae7e8a-8781-4991-a258-6bc4fdeebb62": {
      kind: "resource",
      address: "aws_security_group_rule.aws_security_group_rule-bba6e6bc",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "322e3f91-de14-40e9-95e7-d2961ebe5add": {
      kind: "resource",
      address: "aws_security_group_rule.aws_security_group_rule-a5db6d6d",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "66ebe038-ae86-4ec6-8f43-6ddddf3a1f9d": {
      kind: "resource",
      address: "aws_security_group_rule.aws_security_group_rule-bcdf5fec",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "ec1ee03a-b434-450d-83f4-a3c881aca9e9": {
      kind: "resource",
      address: "aws_security_group_rule.aws_security_group_rule-becf1315",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "7e0371f7-989e-4443-81f4-ba9507600c5b": {
      kind: "resource",
      address: "aws_security_group_rule.aws_security_group_rule-dc61e49a",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "a0bc45ed-9de6-4e39-acaf-669b0ece77ea": {
      kind: "resource",
      address: "aws_security_group_rule.aws_security_group_rule-6a963203",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "054d907a-9682-42cd-a2fe-58e6c2d8bff7": {
      kind: "resource",
      address: "aws_security_group_rule.aws_security_group_rule-d771cb77",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "69b98bc5-0d94-4536-839a-fc59f824e62c": {
      kind: "resource",
      address: "aws_security_group_rule.aws_security_group_rule-c0f59b71",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "876fa860-938e-4e32-b1d1-14ff0746f644": {
      kind: "resource",
      address: "aws_key_pair.master-key",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "822a6dc6-00bf-40cb-9929-7042413ebe17": {
      kind: "resource",
      address: "aws_key_pair.worker-key",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "0bc773fc-ee96-4d04-8113-fd6e67060f5f": {
      kind: "resource",
      address: "aws_instance.jenkins-master",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "f80213b2-c624-4641-ba30-a1ae3839a93f": {
      kind: "resource",
      address: "aws_instance.jenkins-worker-oregon",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "a9e9123e-b88b-49c5-8266-81e77ef12a9a": {
      kind: "resource",
      address: "aws_route53_record.cert_validation",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "21b5bc02-743e-423f-8262-d210ad83825a": {
      kind: "resource",
      address: "aws_route53_record.jenkins",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "08d05e4d-826e-4c51-a218-ed4448ecb8a2": {
      kind: "resource",
      address: "aws_vpc_peering_connection_accepter.accept_peering",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "6331936d-d4de-41f0-ab45-a1f9a8ed2260": {
      kind: "resource",
      address: "aws_lb.application-lb",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "b7918332-62bd-4112-8907-c1cfbb07f2f1": {
      kind: "resource",
      address: "aws_lb_target_group.app-lb-tg",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "a45b829c-0e30-4596-aebd-815bdfed85b5": {
      kind: "resource",
      address: "aws_lb_listener.aws_lb_listener_117174a9",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "258928c4-85a7-4bf8-bd79-773dfa53a4b9": {
      kind: "resource",
      address: "aws_lb_listener.jenkins-listener-https",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "89e6ed9b-46d3-475c-a1fb-33c2d9abfae4": {
      kind: "resource",
      address: "aws_lb_target_group_attachment.jenkins-master-attach",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "ae51f41c-19a4-4161-abaa-b89059718743": {
      kind: "resource",
      address: "aws_acm_certificate.jenkins-lb-https",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "c0387977-4047-43de-ae43-6edc8dbd91d9": {
      kind: "resource",
      address: "aws_acm_certificate_validation.cert",
      fileName: "main.tf",
      addressMapping: "single-residual"
    }
  }
});
