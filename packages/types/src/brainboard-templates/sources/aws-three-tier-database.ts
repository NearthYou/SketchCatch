import { defineCapturedBrainboardTemplate } from "./define-source.js";

export const awsThreeTierDatabaseSource = defineCapturedBrainboardTemplate({
  id: "brainboard-aws-three-tier-database",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "fb2334bf-3291-40db-a779-1e4e56df27dd",
    sourceUrl: "https://app.brainboard.co/templates/fb2334bf-3291-40db-a779-1e4e56df27dd",
    cloneArchitectureId: "448a2a8b-4b9e-401b-aaf5-7693351b905f",
    downloads: 489,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "AWS 3-tier web app with a database",
  description: null,
  provider: "aws",
  viewport: {
    x: -2643.41,
    y: -925.86,
    width: 5823.434944237919,
    height: 3186.7130111524166
  },
  nodes: [
    {
      sourceNodeId: "cea766af-7b78-4329-8483-aa94f972ead5",
      domOrder: 0,
      label: "US East (N. Virginia)",
      position: {
        x: -770,
        y: -390
      },
      size: {
        width: 1745,
        height: 2095
      },
      parentSourceNodeId: null,
      zIndex: 0,
      rawTransform: "translate(-770, -390), rotate(0 872.5 1047.5)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "2f8fe703-8781-4e1d-afb9-8b41aa88cb4e",
      domOrder: 1,
      label: "launch_template",
      position: {
        x: 580,
        y: 570
      },
      size: {
        width: 270,
        height: 255
      },
      parentSourceNodeId: "cea766af-7b78-4329-8483-aa94f972ead5",
      zIndex: 1,
      rawTransform: "translate(580, 570), rotate(0 135 127.5)",
      rotation: 0,
      rawResourceType: "aws_launch_template"
    },
    {
      sourceNodeId: "afe878e0-c406-499d-ba2c-c76a7ba9ed00",
      domOrder: 2,
      label: "main vpc",
      position: {
        x: -685,
        y: 30
      },
      size: {
        width: 1140,
        height: 1605
      },
      parentSourceNodeId: "cea766af-7b78-4329-8483-aa94f972ead5",
      zIndex: 2,
      rawTransform: "translate(-685, 30), rotate(0 570 802.5)",
      rotation: 0,
      rawResourceType: "aws_vpc"
    },
    {
      sourceNodeId: "0ba0b6ac-5652-4698-9c34-622056feec30",
      domOrder: 3,
      label: "web",
      position: {
        x: -585,
        y: 285
      },
      size: {
        width: 960,
        height: 300
      },
      parentSourceNodeId: "afe878e0-c406-499d-ba2c-c76a7ba9ed00",
      zIndex: 3,
      rawTransform: "translate(-585, 285), rotate(0 480 150)",
      rotation: 0,
      rawResourceType: "aws_autoscaling_group"
    },
    {
      sourceNodeId: "4c5c5291-683f-4364-88a1-09dc5d885de3",
      domOrder: 4,
      label: "us-east-1b",
      position: {
        x: 65,
        y: 190
      },
      size: {
        width: 325,
        height: 1375
      },
      parentSourceNodeId: "afe878e0-c406-499d-ba2c-c76a7ba9ed00",
      zIndex: 4,
      rawTransform: "translate(65, 190), rotate(0 162.5 687.5)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "95f6fcc3-863d-4859-81fc-19bb52b136f1",
      domOrder: 5,
      label: "app",
      position: {
        x: -585,
        y: 755
      },
      size: {
        width: 960,
        height: 310
      },
      parentSourceNodeId: "afe878e0-c406-499d-ba2c-c76a7ba9ed00",
      zIndex: 5,
      rawTransform: "translate(-585, 755), rotate(0 480 155)",
      rotation: 0,
      rawResourceType: "aws_autoscaling_group"
    },
    {
      sourceNodeId: "ad311bd8-eb8c-4b09-ac61-b818cccb630d",
      domOrder: 6,
      label: "DB subnet group",
      position: {
        x: -550,
        y: 1280
      },
      size: {
        width: 890,
        height: 165
      },
      parentSourceNodeId: "afe878e0-c406-499d-ba2c-c76a7ba9ed00",
      zIndex: 6,
      rawTransform: "translate(-550, 1280), rotate(0 445 82.5)",
      rotation: 0,
      rawResourceType: "aws_db_subnet_group"
    },
    {
      sourceNodeId: "e045ce90-bb03-4d17-8184-40474d73bdda",
      domOrder: 7,
      label: "us-east-1a",
      position: {
        x: -595,
        y: 190
      },
      size: {
        width: 320,
        height: 1375
      },
      parentSourceNodeId: "afe878e0-c406-499d-ba2c-c76a7ba9ed00",
      zIndex: 7,
      rawTransform: "translate(-595, 190), rotate(0 160 687.5)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "02eb7678-c7b3-496c-8f2e-864b8752639a",
      domOrder: 8,
      label: "web subnet 2",
      position: {
        x: 100,
        y: 350
      },
      size: {
        width: 240,
        height: 200
      },
      parentSourceNodeId: "4c5c5291-683f-4364-88a1-09dc5d885de3",
      zIndex: 8,
      rawTransform: "translate(100, 350), rotate(0 120 100)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "2de9df0c-ca00-47b9-adc8-c9bedfbb8a56",
      domOrder: 9,
      label: "web subnet 1",
      position: {
        x: -550,
        y: 350
      },
      size: {
        width: 240,
        height: 200
      },
      parentSourceNodeId: "e045ce90-bb03-4d17-8184-40474d73bdda",
      zIndex: 9,
      rawTransform: "translate(-550, 350), rotate(0 120 100)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "2e727aab-c78f-47d3-ad08-15ab55425c05",
      domOrder: 10,
      label: "db subnet 2",
      position: {
        x: 100,
        y: 1220
      },
      size: {
        width: 250,
        height: 300
      },
      parentSourceNodeId: "4c5c5291-683f-4364-88a1-09dc5d885de3",
      zIndex: 10,
      rawTransform: "translate(100, 1220), rotate(0 125 150)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "44023200-da2c-4dd0-a42f-e155df3eebf8",
      domOrder: 11,
      label: "db subnet 1",
      position: {
        x: -560,
        y: 1220
      },
      size: {
        width: 245,
        height: 300
      },
      parentSourceNodeId: "e045ce90-bb03-4d17-8184-40474d73bdda",
      zIndex: 11,
      rawTransform: "translate(-560, 1220), rotate(0 122.5 150)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "5c70cc8e-00c1-40aa-9579-f774354c3de4",
      domOrder: 12,
      label: "App subnet 1",
      position: {
        x: -550,
        y: 820
      },
      size: {
        width: 240,
        height: 200
      },
      parentSourceNodeId: "e045ce90-bb03-4d17-8184-40474d73bdda",
      zIndex: 12,
      rawTransform: "translate(-550, 820), rotate(0 120 100)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "d1bbba94-5f95-4e6e-ba67-d968459db06c",
      domOrder: 13,
      label: "App subnet 2",
      position: {
        x: 100,
        y: 820
      },
      size: {
        width: 240,
        height: 200
      },
      parentSourceNodeId: "4c5c5291-683f-4364-88a1-09dc5d885de3",
      zIndex: 13,
      rawTransform: "translate(100, 820), rotate(0 120 100)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "0f77fb2f-97d3-4562-89b4-36bd1d3eb6b2",
      domOrder: 14,
      label: "a record",
      position: {
        x: 315,
        y: -300
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "cea766af-7b78-4329-8483-aa94f972ead5",
      zIndex: 14,
      rawTransform: "translate(315, -300), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route53_record"
    },
    {
      sourceNodeId: "10899cec-fe58-405a-b610-379fc832e90f",
      domOrder: 15,
      label: "WAF WEB ACL",
      position: {
        x: -315,
        y: -300
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "cea766af-7b78-4329-8483-aa94f972ead5",
      zIndex: 15,
      rawTransform: "translate(-315, -300), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_waf_web_acl"
    },
    {
      sourceNodeId: "283de881-4574-4a4c-95b9-f12b34d9087d",
      domOrder: 16,
      label: "S3 bucket versioning",
      position: {
        x: 790,
        y: 30
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "cea766af-7b78-4329-8483-aa94f972ead5",
      zIndex: 16,
      rawTransform: "translate(790, 30), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_versioning"
    },
    {
      sourceNodeId: "3cd01172-fce2-4b44-9829-238c8a8fbde6",
      domOrder: 17,
      label: "S3 bucket",
      position: {
        x: 600,
        y: 30
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "cea766af-7b78-4329-8483-aa94f972ead5",
      zIndex: 17,
      rawTransform: "translate(600, 30), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket"
    },
    {
      sourceNodeId: "43af3152-6e4e-4144-9c44-b4496e6c00c7",
      domOrder: 18,
      label: "WAF rule",
      position: {
        x: -435,
        y: -300
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "cea766af-7b78-4329-8483-aa94f972ead5",
      zIndex: 18,
      rawTransform: "translate(-435, -300), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_waf_rule"
    },
    {
      sourceNodeId: "8cc81941-dca9-431b-bb7a-b6a24cd2ba32",
      domOrder: 19,
      label: "cname record",
      position: {
        x: 315,
        y: -160
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "cea766af-7b78-4329-8483-aa94f972ead5",
      zIndex: 19,
      rawTransform: "translate(315, -160), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route53_record"
    },
    {
      sourceNodeId: "91e71162-3ab7-4638-b2d0-974e34879a4f",
      domOrder: 20,
      label: "hosted zone",
      position: {
        x: 45,
        y: -300
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "cea766af-7b78-4329-8483-aa94f972ead5",
      zIndex: 20,
      rawTransform: "translate(45, -300), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route53_zone"
    },
    {
      sourceNodeId: "c2b68a8b-d2de-47d6-a48d-de1200d2cc00",
      domOrder: 21,
      label: "cloudfront_distribution",
      position: {
        x: -140,
        y: -140
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "cea766af-7b78-4329-8483-aa94f972ead5",
      zIndex: 21,
      rawTransform: "translate(-140, -140), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_cloudfront_distribution"
    },
    {
      sourceNodeId: "c6e0203e-f336-4b67-bace-94a51d09f617",
      domOrder: 22,
      label: "WAF ipset",
      position: {
        x: -555,
        y: -300
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "cea766af-7b78-4329-8483-aa94f972ead5",
      zIndex: 22,
      rawTransform: "translate(-555, -300), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_waf_ipset"
    },
    {
      sourceNodeId: "3c2e57a3-326f-4fe9-aab7-ecb2c7a41e8f",
      domOrder: 23,
      label: "",
      position: {
        x: -715,
        y: 420
      },
      size: {
        width: 170,
        height: 60
      },
      parentSourceNodeId: "afe878e0-c406-499d-ba2c-c76a7ba9ed00",
      zIndex: 23,
      rawTransform: "translate(-715, 420), rotate(-90 85 30)",
      rotation: -90,
      rawResourceType: "text"
    },
    {
      sourceNodeId: "4c5ee754-3e97-4d3e-8ad5-5466eac8840c",
      domOrder: 24,
      label: "internet gateway",
      position: {
        x: -140,
        y: 0
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "afe878e0-c406-499d-ba2c-c76a7ba9ed00",
      zIndex: 24,
      rawTransform: "translate(-140, 0), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_internet_gateway"
    },
    {
      sourceNodeId: "732af918-f8b1-43e9-a3ea-a9b583c1fb45",
      domOrder: 25,
      label: "web",
      position: {
        x: -140,
        y: 140
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "afe878e0-c406-499d-ba2c-c76a7ba9ed00",
      zIndex: 25,
      rawTransform: "translate(-140, 140), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_elb"
    },
    {
      sourceNodeId: "83f8b4db-3937-4bcb-8707-cf55e4749ea3",
      domOrder: 26,
      label: "",
      position: {
        x: -715,
        y: 1340
      },
      size: {
        width: 170,
        height: 60
      },
      parentSourceNodeId: "afe878e0-c406-499d-ba2c-c76a7ba9ed00",
      zIndex: 26,
      rawTransform: "translate(-715, 1340), rotate(-90 85 30)",
      rotation: -90,
      rawResourceType: "text"
    },
    {
      sourceNodeId: "89409729-7427-4813-a81b-274de912ec4a",
      domOrder: 27,
      label: "app",
      position: {
        x: -140,
        y: 660
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "afe878e0-c406-499d-ba2c-c76a7ba9ed00",
      zIndex: 27,
      rawTransform: "translate(-140, 660), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_elb"
    },
    {
      sourceNodeId: "b1c5fe40-f4ea-4435-979e-55a7011ac6e2",
      domOrder: 28,
      label: "web_a",
      position: {
        x: -520,
        y: 90
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "afe878e0-c406-499d-ba2c-c76a7ba9ed00",
      zIndex: 28,
      rawTransform: "translate(-520, 90), rotate(-90 30 30)",
      rotation: -90,
      rawResourceType: "aws_eip"
    },
    {
      sourceNodeId: "cf263726-f3f8-471f-94ee-0229644bc7b4",
      domOrder: 29,
      label: "",
      position: {
        x: -715,
        y: 890
      },
      size: {
        width: 170,
        height: 60
      },
      parentSourceNodeId: "afe878e0-c406-499d-ba2c-c76a7ba9ed00",
      zIndex: 29,
      rawTransform: "translate(-715, 890), rotate(-90 85 30)",
      rotation: -90,
      rawResourceType: "text"
    },
    {
      sourceNodeId: "f22651e0-1d69-417f-b33c-e2e1e5e82cb8",
      domOrder: 30,
      label: "web_b",
      position: {
        x: 260,
        y: 90
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "afe878e0-c406-499d-ba2c-c76a7ba9ed00",
      zIndex: 30,
      rawTransform: "translate(260, 90), rotate(-90 30 30)",
      rotation: -90,
      rawResourceType: "aws_eip"
    },
    {
      sourceNodeId: "ec823e04-54e9-4c9c-9ac4-a7b939ec22bf",
      domOrder: 31,
      label: "",
      position: {
        x: -290,
        y: 1365
      },
      size: {
        width: 395,
        height: 70
      },
      parentSourceNodeId: "afe878e0-c406-499d-ba2c-c76a7ba9ed00",
      zIndex: 31,
      rawTransform: "translate(-290, 1365), rotate(0 197.5 35)",
      rotation: 0,
      rawResourceType: "text"
    },
    {
      sourceNodeId: "14b312b8-59be-4b2b-8b62-d422fa392e41",
      domOrder: 32,
      label: "NAT gateway",
      position: {
        x: 260,
        y: 420
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "02eb7678-c7b3-496c-8f2e-864b8752639a",
      zIndex: 32,
      rawTransform: "translate(260, 420), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_nat_gateway"
    },
    {
      sourceNodeId: "3d3c925d-b665-4a01-b2e4-b928b6f3ab31",
      domOrder: 33,
      label: "Web servers",
      position: {
        x: 140,
        y: 420
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "02eb7678-c7b3-496c-8f2e-864b8752639a",
      zIndex: 33,
      rawTransform: "translate(140, 420), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_instance"
    },
    {
      sourceNodeId: "4952ad77-6b67-4d60-ba48-399fb1da6ca6",
      domOrder: 34,
      label: "Read-only replica",
      position: {
        x: 200,
        y: 1330
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "2e727aab-c78f-47d3-ad08-15ab55425c05",
      zIndex: 34,
      rawTransform: "translate(200, 1330), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_rds_cluster"
    },
    {
      sourceNodeId: "84a9b330-9c06-4a61-85b8-00f4db547d21",
      domOrder: 35,
      label: "Read-write replica",
      position: {
        x: -470,
        y: 1330
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "44023200-da2c-4dd0-a42f-e155df3eebf8",
      zIndex: 35,
      rawTransform: "translate(-470, 1330), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_rds_cluster"
    },
    {
      sourceNodeId: "9f288d70-3c85-4204-acc7-9543bc9d38f6",
      domOrder: 36,
      label: "NAT gateway",
      position: {
        x: -520,
        y: 420
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "2de9df0c-ca00-47b9-adc8-c9bedfbb8a56",
      zIndex: 36,
      rawTransform: "translate(-520, 420), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_nat_gateway"
    },
    {
      sourceNodeId: "a4c5b76d-069d-4e57-b11d-aead846a2201",
      domOrder: 37,
      label: "Web servers",
      position: {
        x: -410,
        y: 420
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "2de9df0c-ca00-47b9-adc8-c9bedfbb8a56",
      zIndex: 37,
      rawTransform: "translate(-410, 420), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_instance"
    },
    {
      sourceNodeId: "c07e1ce3-dd7c-4a9c-82c8-752a10ea5fba",
      domOrder: 38,
      label: "EC2 web servers",
      position: {
        x: -467.89650718174215,
        y: 889.635576275471
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "5c70cc8e-00c1-40aa-9579-f774354c3de4",
      zIndex: 38,
      rawTransform: "translate(-467.89650718174215, 889.635576275471), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_instance"
    },
    {
      sourceNodeId: "dc04ec1e-665b-45ab-ba9f-290b55340c7b",
      domOrder: 39,
      label: "EC2 web servers",
      position: {
        x: 190,
        y: 890
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d1bbba94-5f95-4e6e-ba67-d968459db06c",
      zIndex: 39,
      rawTransform: "translate(190, 890), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_instance"
    }
  ],
  edges: [
    {
      sourceEdgeId: "0174cde8-81e9-4680-9d41-804c27ede1c5",
      domOrder: 0,
      zIndex: 0,
      sourceNodeId: "14b312b8-59be-4b2b-8b62-d422fa392e41",
      targetNodeId: "f22651e0-1d69-417f-b33c-e2e1e5e82cb8",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M290,420 L290,150",
      sourcePoint: {
        x: 290,
        y: 420
      },
      targetPoint: {
        x: 290,
        y: 150
      },
      waypoints: [
        {
          x: 290,
          y: 420
        },
        {
          x: 290,
          y: 150
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            285,145\n            290,150\n            285,155\n          ",
        transform: "rotate(-90, 290, 150)"
      }
    },
    {
      sourceEdgeId: "0588b65b-abab-43b3-8c59-36a53a4acd08",
      domOrder: 1,
      zIndex: 1,
      sourceNodeId: "0ba0b6ac-5652-4698-9c34-622056feec30",
      targetNodeId: "2f8fe703-8781-4e1d-afb9-8b41aa88cb4e",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M375,435 L482,435 Q490,435 490,443 L490,689.5 Q490,697.5 498,697.5 L580,697.5",
      sourcePoint: {
        x: 375,
        y: 435
      },
      targetPoint: {
        x: 580,
        y: 697.5
      },
      waypoints: [
        {
          x: 375,
          y: 435
        },
        {
          x: 482,
          y: 435
        },
        {
          x: 490,
          y: 435
        },
        {
          x: 490,
          y: 443
        },
        {
          x: 490,
          y: 689.5
        },
        {
          x: 490,
          y: 697.5
        },
        {
          x: 498,
          y: 697.5
        },
        {
          x: 580,
          y: 697.5
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            575,692.5\n            580,697.5\n            575,702.5\n          ",
        transform: "rotate(0, 580, 697.5)"
      }
    },
    {
      sourceEdgeId: "17fe12f3-0114-42ef-be28-caf0338c381f",
      domOrder: 2,
      zIndex: 2,
      sourceNodeId: "a4c5b76d-069d-4e57-b11d-aead846a2201",
      targetNodeId: "89409729-7427-4813-a81b-274de912ec4a",
      sourcePort: "right",
      targetPort: "left",
      svgPath:
        "M-350,450 L-231.81368642251664,450 Q-223.81368642251664,450 -223.81368642251664,458 L-223.81368642251664,682 Q-223.81368642251664,690 -215.81368642251664,690 L-140,690",
      sourcePoint: {
        x: -350,
        y: 450
      },
      targetPoint: {
        x: -140,
        y: 690
      },
      waypoints: [
        {
          x: -350,
          y: 450
        },
        {
          x: -231.81368642251664,
          y: 450
        },
        {
          x: -223.81368642251664,
          y: 450
        },
        {
          x: -223.81368642251664,
          y: 458
        },
        {
          x: -223.81368642251664,
          y: 682
        },
        {
          x: -223.81368642251664,
          y: 690
        },
        {
          x: -215.81368642251664,
          y: 690
        },
        {
          x: -140,
          y: 690
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            -145,685\n            -140,690\n            -145,695\n          ",
        transform: "rotate(0, -140, 690)"
      }
    },
    {
      sourceEdgeId: "1ba3ad2d-7cf8-4310-b03a-ad32a1e7b27b",
      domOrder: 3,
      zIndex: 3,
      sourceNodeId: "44023200-da2c-4dd0-a42f-e155df3eebf8",
      targetNodeId: "c07e1ce3-dd7c-4a9c-82c8-752a10ea5fba",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M-437.5,1220 L-437.5,949.635576275471",
      sourcePoint: {
        x: -437.5,
        y: 1220
      },
      targetPoint: {
        x: -437.5,
        y: 949.635576275471
      },
      waypoints: [
        {
          x: -437.5,
          y: 1220
        },
        {
          x: -437.5,
          y: 949.635576275471
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 90,
      rawArrow: {
        points:
          "\n            -442.5,1215\n            -437.5,1220\n            -442.5,1225\n          ",
        transform: "rotate(90, -437.5, 1220)"
      }
    },
    {
      sourceEdgeId: "262ddbb3-326e-481c-8c83-d52824fd258b",
      domOrder: 4,
      zIndex: 4,
      sourceNodeId: "02eb7678-c7b3-496c-8f2e-864b8752639a",
      targetNodeId: "732af918-f8b1-43e9-a3ea-a9b583c1fb45",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath:
        "M220,350 L220,270.5 Q220,262.5 212,262.5 L-102,262.5 Q-110,262.5 -110,254.5 L-110,200",
      sourcePoint: {
        x: 220,
        y: 350
      },
      targetPoint: {
        x: -110,
        y: 200
      },
      waypoints: [
        {
          x: 220,
          y: 350
        },
        {
          x: 220,
          y: 270.5
        },
        {
          x: 220,
          y: 262.5
        },
        {
          x: 212,
          y: 262.5
        },
        {
          x: -102,
          y: 262.5
        },
        {
          x: -110,
          y: 262.5
        },
        {
          x: -110,
          y: 254.5
        },
        {
          x: -110,
          y: 200
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            -115,195\n            -110,200\n            -115,205\n          ",
        transform: "rotate(-90, -110, 200)"
      }
    },
    {
      sourceEdgeId: "53488e13-ec7f-410a-99a3-92adc2a8bfa3",
      domOrder: 5,
      zIndex: 5,
      sourceNodeId: "44023200-da2c-4dd0-a42f-e155df3eebf8",
      targetNodeId: "dc04ec1e-665b-45ab-ba9f-290b55340c7b",
      sourcePort: "right",
      targetPort: "left",
      svgPath:
        "M-315,1370 L-70.5,1370 Q-62.5,1370 -62.5,1362 L-62.5,928 Q-62.5,920 -54.5,920 L190,920",
      sourcePoint: {
        x: -315,
        y: 1370
      },
      targetPoint: {
        x: 190,
        y: 920
      },
      waypoints: [
        {
          x: -315,
          y: 1370
        },
        {
          x: -70.5,
          y: 1370
        },
        {
          x: -62.5,
          y: 1370
        },
        {
          x: -62.5,
          y: 1362
        },
        {
          x: -62.5,
          y: 928
        },
        {
          x: -62.5,
          y: 920
        },
        {
          x: -54.5,
          y: 920
        },
        {
          x: 190,
          y: 920
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            -320,1365\n            -315,1370\n            -320,1375\n          ",
        transform: "rotate(180, -315, 1370)"
      }
    },
    {
      sourceEdgeId: "56d2da96-9874-49b4-9fc6-458b5804ae9c",
      domOrder: 6,
      zIndex: 6,
      sourceNodeId: "10899cec-fe58-405a-b610-379fc832e90f",
      targetNodeId: "c2b68a8b-d2de-47d6-a48d-de1200d2cc00",
      sourcePort: "right",
      targetPort: "left",
      svgPath:
        "M-255,-270 L-205.5,-270 Q-197.5,-270 -197.5,-262 L-197.5,-118 Q-197.5,-110 -189.5,-110 L-140,-110",
      sourcePoint: {
        x: -255,
        y: -270
      },
      targetPoint: {
        x: -140,
        y: -110
      },
      waypoints: [
        {
          x: -255,
          y: -270
        },
        {
          x: -205.5,
          y: -270
        },
        {
          x: -197.5,
          y: -270
        },
        {
          x: -197.5,
          y: -262
        },
        {
          x: -197.5,
          y: -118
        },
        {
          x: -197.5,
          y: -110
        },
        {
          x: -189.5,
          y: -110
        },
        {
          x: -140,
          y: -110
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            -145,-115\n            -140,-110\n            -145,-105\n          ",
        transform: "rotate(0, -140, -110)"
      }
    },
    {
      sourceEdgeId: "60b4e72a-0753-43f7-ab62-1aa9b7fe0986",
      domOrder: 7,
      zIndex: 7,
      sourceNodeId: "c2b68a8b-d2de-47d6-a48d-de1200d2cc00",
      targetNodeId: "4c5ee754-3e97-4d3e-8ad5-5466eac8840c",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M-110,-80 L-110,0",
      sourcePoint: {
        x: -110,
        y: -80
      },
      targetPoint: {
        x: -110,
        y: 0
      },
      waypoints: [
        {
          x: -110,
          y: -80
        },
        {
          x: -110,
          y: 0
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            -115,-5\n            -110,0\n            -115,5\n          ",
        transform: "rotate(90, -110, 0)"
      }
    },
    {
      sourceEdgeId: "62cf08b7-320e-434b-bfe4-4be6e7058a34",
      domOrder: 8,
      zIndex: 8,
      sourceNodeId: "9f288d70-3c85-4204-acc7-9543bc9d38f6",
      targetNodeId: "b1c5fe40-f4ea-4435-979e-55a7011ac6e2",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M-490,420 L-490,150",
      sourcePoint: {
        x: -490,
        y: 420
      },
      targetPoint: {
        x: -490,
        y: 150
      },
      waypoints: [
        {
          x: -490,
          y: 420
        },
        {
          x: -490,
          y: 150
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            -495,145\n            -490,150\n            -495,155\n          ",
        transform: "rotate(-90, -490, 150)"
      }
    },
    {
      sourceEdgeId: "70a0d8d6-5e33-4267-b48e-f898129698a1",
      domOrder: 9,
      zIndex: 9,
      sourceNodeId: "5c70cc8e-00c1-40aa-9579-f774354c3de4",
      targetNodeId: "89409729-7427-4813-a81b-274de912ec4a",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M-310,920 L-233,920 Q-225,920 -225,912 L-225,698 Q-225,690 -217,690 L-140,690",
      sourcePoint: {
        x: -310,
        y: 920
      },
      targetPoint: {
        x: -140,
        y: 690
      },
      waypoints: [
        {
          x: -310,
          y: 920
        },
        {
          x: -233,
          y: 920
        },
        {
          x: -225,
          y: 920
        },
        {
          x: -225,
          y: 912
        },
        {
          x: -225,
          y: 698
        },
        {
          x: -225,
          y: 690
        },
        {
          x: -217,
          y: 690
        },
        {
          x: -140,
          y: 690
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            -315,915\n            -310,920\n            -315,925\n          ",
        transform: "rotate(180, -310, 920)"
      }
    },
    {
      sourceEdgeId: "9b093ecc-5448-45bc-a1d5-e56ede1242d8",
      domOrder: 10,
      zIndex: 10,
      sourceNodeId: "91e71162-3ab7-4638-b2d0-974e34879a4f",
      targetNodeId: "10899cec-fe58-405a-b610-379fc832e90f",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M45,-270 L-255,-270",
      sourcePoint: {
        x: 45,
        y: -270
      },
      targetPoint: {
        x: -255,
        y: -270
      },
      waypoints: [
        {
          x: 45,
          y: -270
        },
        {
          x: -255,
          y: -270
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            -260,-275\n            -255,-270\n            -260,-265\n          ",
        transform: "rotate(180, -255, -270)"
      }
    },
    {
      sourceEdgeId: "ab961871-4ee4-4294-9a26-451a83af421d",
      domOrder: 11,
      zIndex: 11,
      sourceNodeId: "d1bbba94-5f95-4e6e-ba67-d968459db06c",
      targetNodeId: "89409729-7427-4813-a81b-274de912ec4a",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M100,920 L18,920 Q10,920 10,912 L10,698 Q10,690 2,690 L-80,690",
      sourcePoint: {
        x: 100,
        y: 920
      },
      targetPoint: {
        x: -80,
        y: 690
      },
      waypoints: [
        {
          x: 100,
          y: 920
        },
        {
          x: 18,
          y: 920
        },
        {
          x: 10,
          y: 920
        },
        {
          x: 10,
          y: 912
        },
        {
          x: 10,
          y: 698
        },
        {
          x: 10,
          y: 690
        },
        {
          x: 2,
          y: 690
        },
        {
          x: -80,
          y: 690
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            95,915\n            100,920\n            95,925\n          ",
        transform: "rotate(0, 100, 920)"
      }
    },
    {
      sourceEdgeId: "d299b58d-85d0-446a-9e9c-65e70bb32156",
      domOrder: 12,
      zIndex: 12,
      sourceNodeId: "95f6fcc3-863d-4859-81fc-19bb52b136f1",
      targetNodeId: "2f8fe703-8781-4e1d-afb9-8b41aa88cb4e",
      sourcePort: "right",
      targetPort: "left",
      svgPath:
        "M375,910 L480.9370728938739,910 Q488.9370728938739,910 488.9370728938739,902 L488.9370728938739,705.5 Q488.9370728938739,697.5 496.9370728938739,697.5 L580,697.5",
      sourcePoint: {
        x: 375,
        y: 910
      },
      targetPoint: {
        x: 580,
        y: 697.5
      },
      waypoints: [
        {
          x: 375,
          y: 910
        },
        {
          x: 480.9370728938739,
          y: 910
        },
        {
          x: 488.9370728938739,
          y: 910
        },
        {
          x: 488.9370728938739,
          y: 902
        },
        {
          x: 488.9370728938739,
          y: 705.5
        },
        {
          x: 488.9370728938739,
          y: 697.5
        },
        {
          x: 496.9370728938739,
          y: 697.5
        },
        {
          x: 580,
          y: 697.5
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            575,692.5\n            580,697.5\n            575,702.5\n          ",
        transform: "rotate(0, 580, 697.5)"
      }
    },
    {
      sourceEdgeId: "d4c03078-5f80-4b69-8967-8b9a8bccf6ce",
      domOrder: 13,
      zIndex: 13,
      sourceNodeId: "283de881-4574-4a4c-95b9-f12b34d9087d",
      targetNodeId: "3cd01172-fce2-4b44-9829-238c8a8fbde6",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M790,60 L660,60",
      sourcePoint: {
        x: 790,
        y: 60
      },
      targetPoint: {
        x: 660,
        y: 60
      },
      waypoints: [
        {
          x: 790,
          y: 60
        },
        {
          x: 660,
          y: 60
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            655,55\n            660,60\n            655,65\n          ",
        transform: "rotate(180, 660, 60)"
      }
    },
    {
      sourceEdgeId: "d97fa746-d52c-4868-bf38-21745c46f7db",
      domOrder: 14,
      zIndex: 14,
      sourceNodeId: "0f77fb2f-97d3-4562-89b4-36bd1d3eb6b2",
      targetNodeId: "91e71162-3ab7-4638-b2d0-974e34879a4f",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M315,-270 L105,-270",
      sourcePoint: {
        x: 315,
        y: -270
      },
      targetPoint: {
        x: 105,
        y: -270
      },
      waypoints: [
        {
          x: 315,
          y: -270
        },
        {
          x: 105,
          y: -270
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            100,-275\n            105,-270\n            100,-265\n          ",
        transform: "rotate(180, 105, -270)"
      }
    },
    {
      sourceEdgeId: "db417f42-579a-439b-8d32-a609661758ba",
      domOrder: 15,
      zIndex: 15,
      sourceNodeId: "8cc81941-dca9-431b-bb7a-b6a24cd2ba32",
      targetNodeId: "91e71162-3ab7-4638-b2d0-974e34879a4f",
      sourcePort: "left",
      targetPort: "bottom",
      svgPath: "M315,-130 L83,-130 Q75,-130 75,-138 L75,-240",
      sourcePoint: {
        x: 315,
        y: -130
      },
      targetPoint: {
        x: 75,
        y: -240
      },
      waypoints: [
        {
          x: 315,
          y: -130
        },
        {
          x: 83,
          y: -130
        },
        {
          x: 75,
          y: -130
        },
        {
          x: 75,
          y: -138
        },
        {
          x: 75,
          y: -240
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            70,-245\n            75,-240\n            70,-235\n          ",
        transform: "rotate(-90, 75, -240)"
      }
    },
    {
      sourceEdgeId: "f09dcf2b-7ad9-490b-ba6b-0a86013b33c1",
      domOrder: 16,
      zIndex: 16,
      sourceNodeId: "2de9df0c-ca00-47b9-adc8-c9bedfbb8a56",
      targetNodeId: "732af918-f8b1-43e9-a3ea-a9b583c1fb45",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath:
        "M-430,350 L-430,270.5 Q-430,262.5 -422,262.5 L-118,262.5 Q-110,262.5 -110,254.5 L-110,200",
      sourcePoint: {
        x: -430,
        y: 350
      },
      targetPoint: {
        x: -110,
        y: 200
      },
      waypoints: [
        {
          x: -430,
          y: 350
        },
        {
          x: -430,
          y: 270.5
        },
        {
          x: -430,
          y: 262.5
        },
        {
          x: -422,
          y: 262.5
        },
        {
          x: -118,
          y: 262.5
        },
        {
          x: -110,
          y: 262.5
        },
        {
          x: -110,
          y: 254.5
        },
        {
          x: -110,
          y: 200
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            -115,195\n            -110,200\n            -115,205\n          ",
        transform: "rotate(-90, -110, 200)"
      }
    },
    {
      sourceEdgeId: "f890108f-dec4-4277-b515-17b4eae4a887",
      domOrder: 17,
      zIndex: 17,
      sourceNodeId: "4c5ee754-3e97-4d3e-8ad5-5466eac8840c",
      targetNodeId: "732af918-f8b1-43e9-a3ea-a9b583c1fb45",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M-110,60 L-110,140",
      sourcePoint: {
        x: -110,
        y: 60
      },
      targetPoint: {
        x: -110,
        y: 140
      },
      waypoints: [
        {
          x: -110,
          y: 60
        },
        {
          x: -110,
          y: 140
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            -115,135\n            -110,140\n            -115,145\n          ",
        transform: "rotate(90, -110, 140)"
      }
    },
    {
      sourceEdgeId: "faa15585-7bdc-4060-9f0a-d87079a12bee",
      domOrder: 18,
      zIndex: 18,
      sourceNodeId: "3d3c925d-b665-4a01-b2e4-b928b6f3ab31",
      targetNodeId: "89409729-7427-4813-a81b-274de912ec4a",
      sourcePort: "left",
      targetPort: "right",
      svgPath:
        "M140,450 L17.419009667587588,450 Q9.419009667587588,450 9.419009667587588,458 L9.419009667587588,682 Q9.419009667587588,690 1.4190096675875878,690 L-80,690",
      sourcePoint: {
        x: 140,
        y: 450
      },
      targetPoint: {
        x: -80,
        y: 690
      },
      waypoints: [
        {
          x: 140,
          y: 450
        },
        {
          x: 17.419009667587588,
          y: 450
        },
        {
          x: 9.419009667587588,
          y: 450
        },
        {
          x: 9.419009667587588,
          y: 458
        },
        {
          x: 9.419009667587588,
          y: 682
        },
        {
          x: 9.419009667587588,
          y: 690
        },
        {
          x: 1.4190096675875878,
          y: 690
        },
        {
          x: -80,
          y: 690
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            -85,685\n            -80,690\n            -85,695\n          ",
        transform: "rotate(180, -80, 690)"
      }
    }
  ],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_vpc" "main" {\n  tags       = merge(var.tags, {})\n  cidr_block = var.cidr_block\n}\n\nresource "aws_autoscaling_group" "app" {\n  min_size = var.app_asg_min\n  max_size = var.app_asg_max\n\n  launch_template {\n    version = "$Latest"\n    id      = aws_launch_template.launch_template.id\n  }\n\n  load_balancers = [\n    aws_elb.app.id,\n  ]\n\n  timeouts {\n    update = "1h"\n    delete = "1h"\n  }\n\n  vpc_zone_identifier = [\n    aws_subnet.app_a.id,\n    aws_subnet.app_b.id,\n  ]\n}\n\nresource "aws_autoscaling_group" "web" {\n  min_size = var.web_asg_min\n  max_size = var.web_asg_max\n\n  launch_template {\n    version = "$Latest"\n    id      = aws_launch_template.launch_template.id\n  }\n\n  load_balancers = [\n    aws_elb.web.id,\n  ]\n\n  timeouts {\n    update = "1h"\n    delete = "1h"\n  }\n\n  vpc_zone_identifier = [\n    aws_subnet.web_a.id,\n    aws_subnet.web_b.id,\n  ]\n}\n\nresource "aws_subnet" "app_a" {\n  vpc_id            = aws_vpc.main.id\n  tags              = merge(var.tags, { Name = var.app_subnets.a.name })\n  cidr_block        = var.app_subnets.a.cidr\n  availability_zone = "us-east-1a"\n}\n\nresource "aws_subnet" "app_b" {\n  vpc_id            = aws_vpc.main.id\n  tags              = merge(var.tags, { Name = var.web_subnets.b.name })\n  cidr_block        = var.app_subnets.b.cidr\n  availability_zone = "us-east-1b"\n}\n\nresource "aws_subnet" "web_a" {\n  vpc_id            = aws_vpc.main.id\n  tags              = merge(var.tags, { Name = var.web_subnets.a.name })\n  cidr_block        = var.web_subnets.a.cidr\n  availability_zone = "us-east-1a"\n}\n\nresource "aws_subnet" "web_b" {\n  vpc_id            = aws_vpc.main.id\n  tags              = merge(var.tags, { Name = var.web_subnets.b.name })\n  cidr_block        = var.web_subnets.b.cidr\n  availability_zone = "us-east-1b"\n}\n\nresource "aws_route53_zone" "aws_route53_zone_6" {\n  tags = merge(var.tags, {})\n  name = var.hosted_zone\n}\n\nresource "aws_route53_record" "a_record" {\n  zone_id = aws_route53_zone.aws_route53_zone_6.id\n  type    = "A"\n  ttl     = 300\n  records = var.a_records\n  name    = "a_record"\n\n  latency_routing_policy {\n    region = "us-east-1"\n  }\n}\n\nresource "aws_route53_record" "cname" {\n  zone_id = aws_route53_zone.aws_route53_zone_6.id\n  type    = "CNAME"\n  ttl     = 300\n  records = var.domains\n  name    = "cname"\n\n  latency_routing_policy {\n    region = "us-east-1"\n  }\n}\n\nresource "aws_waf_web_acl" "waf_web_acl" {\n  tags        = merge(var.tags, {})\n  name        = "webAcl"\n  metric_name = "webAcl"\n  count       = var.env == "prod" ? 1 : 0\n\n  default_action {\n    type = "ALLOW"\n  }\n}\n\nresource "aws_waf_rule" "aws_waf_rule_10" {\n  tags        = merge(var.tags, {})\n  name        = "WAFRule"\n  metric_name = "WAFRule"\n}\n\nresource "aws_waf_ipset" "aws_waf_ipset_11" {\n  name = "IPSet"\n\n  ip_set_descriptors {\n    value = var.ipset_value\n    type  = "IPV4"\n  }\n}\n\nresource "aws_internet_gateway" "igw" {\n  vpc_id = aws_vpc.main.id\n  tags   = merge(var.tags, {})\n}\n\nresource "aws_elb" "app" {\n  tags = merge(var.tags, {})\n\n  availability_zones = [\n    "us-east-1a",\n    "us-east-1b",\n  ]\n\n  listener {\n    lb_protocol       = "http"\n    lb_port           = var.app_port\n    instance_protocol = "http"\n    instance_port     = var.app_port\n  }\n}\n\nresource "aws_elb" "web" {\n  tags                      = merge(var.tags, {})\n  cross_zone_load_balancing = true\n\n  availability_zones = [\n    "us-east-1a",\n    "us-east-1b",\n  ]\n\n  listener {\n    lb_protocol       = "http"\n    lb_port           = 8080\n    instance_protocol = "http"\n    instance_port     = 8080\n  }\n}\n\nresource "aws_nat_gateway" "web_a" {\n  tags          = merge(var.tags, {})\n  subnet_id     = aws_subnet.web_a.id\n  allocation_id = aws_eip.web_a.id\n}\n\nresource "aws_nat_gateway" "web_b" {\n  tags          = merge(var.tags, {})\n  subnet_id     = aws_subnet.web_b.id\n  allocation_id = aws_eip.web_b.id\n}\n\nresource "aws_subnet" "db_a" {\n  vpc_id            = aws_vpc.main.id\n  tags              = merge(var.tags, {})\n  cidr_block        = var.db_subnets.a.cidr\n  availability_zone = "us-east-1a"\n}\n\nresource "aws_subnet" "db_b" {\n  vpc_id            = aws_vpc.main.id\n  tags              = merge(var.tags, {})\n  cidr_block        = var.db_subnets.b.cidr\n  availability_zone = "us-east-1b"\n}\n\nresource "aws_db_subnet_group" "aws_db_subnet_group_18" {\n  tags = merge(var.tags, {})\n\n  subnet_ids = [\n    aws_subnet.db_a.id,\n    aws_subnet.db_b.id,\n  ]\n}\n\nresource "aws_rds_cluster" "aws_rds_cluster_19" {\n  tags                 = merge(var.tags, {})\n  skip_final_snapshot  = true\n  master_username      = var.rds_master_username\n  master_password      = var.rds_master_password\n  engine               = "aurora-postgresql"\n  db_subnet_group_name = aws_db_subnet_group.aws_db_subnet_group_18.name\n  database_name        = var.rds_db_name\n\n  availability_zones = [\n    "us-east-1a",\n    "us-east-1b",\n  ]\n}\n\nresource "aws_s3_bucket" "default" {\n  tags   = merge(var.tags, {})\n  bucket = var.bucket_name\n}\n\nresource "aws_s3_bucket_versioning" "default" {\n  bucket = aws_s3_bucket.default.id\n\n  versioning_configuration {\n    status = "Enabled"\n  }\n}\n\nresource "aws_eip" "web_a" {\n  tags = merge(var.tags, {})\n}\n\nresource "aws_eip" "web_b" {\n  tags = merge(var.tags, {})\n}\n\nresource "aws_launch_template" "launch_template" {\n  tags          = merge(var.tags, {})\n  instance_type = "t3.medium"\n  image_id      = var.image_id\n}\n\n',
        sha256: "011de70310a6f78b4f62b8b17e5b0287b5695ee289d9bf338dac15e75ed045a9",
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
        code: 'terraform {\n  required_providers {\n    aws = {\n      version = "= 5.94.0"\n    }\n  }\n}\n\nprovider "aws" {\n  region = "us-east-1"\n}\n',
        sha256: "4408871478a857313b16e5a10c767ce3dd64fbd3618935953a7bf75e693b5e75",
        includeInWorkspace: true
      },
      {
        fileName: "terraform.tfvars",
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "448a2a8b-4b9e-401b-aaf5-7693351b905f"\n  env      = "Production"\n}\n',
        sha256: "28a4a1dc42f3920ad9a69eecf21bc2f859e4607204f8a7b3491e4ecb4cf599de",
        includeInWorkspace: false
      },
      {
        fileName: "variables.tf",
        code: 'variable "a_records" {\n  type    = list(string)\n  default = ["1.2.3.4"]\n}\n\nvariable "amount_limitation" {\n  type    = number\n  default = 1000\n}\n\nvariable "app_asg_max" {\n  type    = number\n  default = 3\n}\n\nvariable "app_asg_min" {\n  type    = number\n  default = 1\n}\n\nvariable "app_port" {\n  type    = number\n  default = 8080\n}\n\nvariable "app_subnets" {\n  type = map(any)\n  default = {\n    a = {\n      name = "snet_app_a"\n      cidr = "10.0.1.0/24"\n    }\n    b = {\n      name = "snet_app_b"\n      cidr = "10.0.2.0/24"\n    }\n  }\n}\n\nvariable "bucket_name" {\n  type    = string\n  default = "bb-webapp"\n}\n\nvariable "cidr_block" {\n  type    = string\n  default = "10.0.0.0/16"\n}\n\nvariable "db_subnets" {\n  type = map(any)\n  default = {\n    a = {\n      name = "snet_db_a"\n      cidr = "10.0.5.0/24"\n    }\n    b = {\n      name = "snet_db_b"\n      cidr = "10.0.6.0/24"\n    }\n  }\n}\n\nvariable "dns_zone" {\n  type    = string\n  default = "webapp.brainboard.co"\n}\n\nvariable "domains" {\n  type    = list(string)\n  default = ["domain.com"]\n}\n\nvariable "ec2_amount_limitation" {\n  type    = number\n  default = 500\n}\n\nvariable "ec2_threshold" {\n  type    = number\n  default = 400\n}\n\nvariable "email" {\n  type    = string\n  default = "contact@brainboard.co"\n}\n\nvariable "env" {\n  type    = string\n  default = "dev"\n}\n\nvariable "hosted_zone" {\n  type    = string\n  default = "webapp.brainboard.co"\n}\n\nvariable "image_id" {\n  description = "The AMI of the image used in the launch template. Put your own AMI here for the specified region."\n  type        = string\n  default     = "ami-0c7217cdde317cfec"\n}\n\nvariable "ipset_value" {\n  type    = string\n  default = "192.0.7.0/24"\n}\n\nvariable "rds_db_name" {\n  type    = string\n  default = "brainboard"\n}\n\nvariable "rds_master_password" {\n  type    = string\n  default = "Bra1nb0ard123"\n}\n\nvariable "rds_master_username" {\n  type    = string\n  default = "masteruser"\n}\n\nvariable "s3_amount" {\n  type    = number\n  default = 100\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    archuuid = "fb2334bf-3291-40db-a779-1e4e56df27dd"\n    env      = "Dev - AWS"\n  }\n}\n\nvariable "threshold" {\n  type    = number\n  default = 800\n}\n\nvariable "web_asg_max" {\n  type    = number\n  default = 3\n  default = 3\n}\n\nvariable "web_asg_min" {\n  type    = number\n  default = 1\n}\n\nvariable "web_subnets" {\n  type = map(any)\n  default = {\n    a = {\n      name = "snet_web_a"\n      cidr = "10.0.3.0/24"\n    }\n    b = {\n      name = "snet_web_b"\n      cidr = "10.0.4.0/24"\n    }\n  }\n}\n',
        sha256: "d030e7dba42c4d64de2d01666b843e171f1a8285c0c75218a81b6cab4ae4801b",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'variable "a_records" {\n  type    = list(string)\n  default = ["1.2.3.4"]\n}\n\nvariable "amount_limitation" {\n  type    = number\n  default = 1000\n}\n\nvariable "app_asg_max" {\n  type    = number\n  default = 3\n}\n\nvariable "app_asg_min" {\n  type    = number\n  default = 1\n}\n\nvariable "app_port" {\n  type    = number\n  default = 8080\n}\n\nvariable "app_subnets" {\n  type = map(any)\n  default = {\n    a = {\n      name = "snet_app_a"\n      cidr = "10.0.1.0/24"\n    }\n    b = {\n      name = "snet_app_b"\n      cidr = "10.0.2.0/24"\n    }\n  }\n}\n\nvariable "bucket_name" {\n  type    = string\n  default = "bb-webapp"\n}\n\nvariable "cidr_block" {\n  type    = string\n  default = "10.0.0.0/16"\n}\n\nvariable "db_subnets" {\n  type = map(any)\n  default = {\n    a = {\n      name = "snet_db_a"\n      cidr = "10.0.5.0/24"\n    }\n    b = {\n      name = "snet_db_b"\n      cidr = "10.0.6.0/24"\n    }\n  }\n}\n\nvariable "dns_zone" {\n  type    = string\n  default = "webapp.brainboard.co"\n}\n\nvariable "domains" {\n  type    = list(string)\n  default = ["domain.com"]\n}\n\nvariable "ec2_amount_limitation" {\n  type    = number\n  default = 500\n}\n\nvariable "ec2_threshold" {\n  type    = number\n  default = 400\n}\n\nvariable "email" {\n  type    = string\n  default = "contact@brainboard.co"\n}\n\nvariable "env" {\n  type    = string\n  default = "dev"\n}\n\nvariable "hosted_zone" {\n  type    = string\n  default = "webapp.brainboard.co"\n}\n\nvariable "image_id" {\n  description = "The AMI of the image used in the launch template. Put your own AMI here for the specified region."\n  type        = string\n  default     = "ami-0c7217cdde317cfec"\n}\n\nvariable "ipset_value" {\n  type    = string\n  default = "192.0.7.0/24"\n}\n\nvariable "rds_db_name" {\n  type    = string\n  default = "brainboard"\n}\n\nvariable "rds_master_password" {\n  type    = string\n  default = "Bra1nb0ard123"\n}\n\nvariable "rds_master_username" {\n  type    = string\n  default = "masteruser"\n}\n\nvariable "s3_amount" {\n  type    = number\n  default = 100\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    env      = "Dev - AWS"\n  }\n}\n\nvariable "threshold" {\n  type    = number\n  default = 800\n}\n\nvariable "web_asg_max" {\n  type    = number\n  default = 3\n  default = 3\n}\n\nvariable "web_asg_min" {\n  type    = number\n  default = 1\n}\n\nvariable "web_subnets" {\n  type = map(any)\n  default = {\n    a = {\n      name = "snet_web_a"\n      cidr = "10.0.3.0/24"\n    }\n    b = {\n      name = "snet_web_b"\n      cidr = "10.0.4.0/24"\n    }\n  }\n}\n',
          sha256: "8feb6b3a7d436c23d889702642c2e0c503922c9e42d0bc248858feb9c54c4992",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archuuid = "fb2334bf-3291-40db-a779-1e4e56df27dd"\n',
              occurrenceCount: 1
            }
          ]
        }
      }
    ],
    resourceAddresses: [
      "aws_vpc.main",
      "aws_autoscaling_group.app",
      "aws_autoscaling_group.web",
      "aws_subnet.app_a",
      "aws_subnet.app_b",
      "aws_subnet.web_a",
      "aws_subnet.web_b",
      "aws_route53_zone.aws_route53_zone_6",
      "aws_route53_record.a_record",
      "aws_route53_record.cname",
      "aws_waf_web_acl.waf_web_acl",
      "aws_waf_rule.aws_waf_rule_10",
      "aws_waf_ipset.aws_waf_ipset_11",
      "aws_internet_gateway.igw",
      "aws_elb.app",
      "aws_elb.web",
      "aws_nat_gateway.web_a",
      "aws_nat_gateway.web_b",
      "aws_subnet.db_a",
      "aws_subnet.db_b",
      "aws_db_subnet_group.aws_db_subnet_group_18",
      "aws_rds_cluster.aws_rds_cluster_19",
      "aws_s3_bucket.default",
      "aws_s3_bucket_versioning.default",
      "aws_eip.web_a",
      "aws_eip.web_b",
      "aws_launch_template.launch_template"
    ]
  },
  bindings: {
    "cea766af-7b78-4329-8483-aa94f972ead5": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "2f8fe703-8781-4e1d-afb9-8b41aa88cb4e": {
      kind: "resource",
      address: "aws_launch_template.launch_template",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "afe878e0-c406-499d-ba2c-c76a7ba9ed00": {
      kind: "resource",
      address: "aws_vpc.main",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "0ba0b6ac-5652-4698-9c34-622056feec30": {
      kind: "resource",
      address: "aws_autoscaling_group.web",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "4c5c5291-683f-4364-88a1-09dc5d885de3": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "95f6fcc3-863d-4859-81fc-19bb52b136f1": {
      kind: "resource",
      address: "aws_autoscaling_group.app",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "ad311bd8-eb8c-4b09-ac61-b818cccb630d": {
      kind: "resource",
      address: "aws_db_subnet_group.aws_db_subnet_group_18",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "e045ce90-bb03-4d17-8184-40474d73bdda": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "02eb7678-c7b3-496c-8f2e-864b8752639a": {
      kind: "resource",
      address: "aws_subnet.web_b",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "2de9df0c-ca00-47b9-adc8-c9bedfbb8a56": {
      kind: "resource",
      address: "aws_subnet.web_a",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "2e727aab-c78f-47d3-ad08-15ab55425c05": {
      kind: "resource",
      address: "aws_subnet.db_b",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "44023200-da2c-4dd0-a42f-e155df3eebf8": {
      kind: "resource",
      address: "aws_subnet.db_a",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "5c70cc8e-00c1-40aa-9579-f774354c3de4": {
      kind: "resource",
      address: "aws_subnet.app_a",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "d1bbba94-5f95-4e6e-ba67-d968459db06c": {
      kind: "resource",
      address: "aws_subnet.app_b",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "0f77fb2f-97d3-4562-89b4-36bd1d3eb6b2": {
      kind: "resource",
      address: "aws_route53_record.a_record",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "10899cec-fe58-405a-b610-379fc832e90f": {
      kind: "resource",
      address: "aws_waf_web_acl.waf_web_acl",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "283de881-4574-4a4c-95b9-f12b34d9087d": {
      kind: "resource",
      address: "aws_s3_bucket_versioning.default",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "3cd01172-fce2-4b44-9829-238c8a8fbde6": {
      kind: "resource",
      address: "aws_s3_bucket.default",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "43af3152-6e4e-4144-9c44-b4496e6c00c7": {
      kind: "resource",
      address: "aws_waf_rule.aws_waf_rule_10",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "8cc81941-dca9-431b-bb7a-b6a24cd2ba32": {
      kind: "resource",
      address: "aws_route53_record.cname",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "91e71162-3ab7-4638-b2d0-974e34879a4f": {
      kind: "resource",
      address: "aws_route53_zone.aws_route53_zone_6",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "c2b68a8b-d2de-47d6-a48d-de1200d2cc00": {
      kind: "presentation",
      catalogId: "aws-cloudfront-distribution",
      aliasOf: null,
      style: null
    },
    "c6e0203e-f336-4b67-bace-94a51d09f617": {
      kind: "resource",
      address: "aws_waf_ipset.aws_waf_ipset_11",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "3c2e57a3-326f-4fe9-aab7-ecb2c7a41e8f": {
      kind: "presentation",
      catalogId: null,
      aliasOf: null,
      style: null
    },
    "4c5ee754-3e97-4d3e-8ad5-5466eac8840c": {
      kind: "resource",
      address: "aws_internet_gateway.igw",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "732af918-f8b1-43e9-a3ea-a9b583c1fb45": {
      kind: "resource",
      address: "aws_elb.web",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "83f8b4db-3937-4bcb-8707-cf55e4749ea3": {
      kind: "presentation",
      catalogId: null,
      aliasOf: null,
      style: null
    },
    "89409729-7427-4813-a81b-274de912ec4a": {
      kind: "resource",
      address: "aws_elb.app",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "b1c5fe40-f4ea-4435-979e-55a7011ac6e2": {
      kind: "resource",
      address: "aws_eip.web_a",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "cf263726-f3f8-471f-94ee-0229644bc7b4": {
      kind: "presentation",
      catalogId: null,
      aliasOf: null,
      style: null
    },
    "f22651e0-1d69-417f-b33c-e2e1e5e82cb8": {
      kind: "resource",
      address: "aws_eip.web_b",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "ec823e04-54e9-4c9c-9ac4-a7b939ec22bf": {
      kind: "presentation",
      catalogId: null,
      aliasOf: null,
      style: null
    },
    "14b312b8-59be-4b2b-8b62-d422fa392e41": {
      kind: "resource",
      address: "aws_nat_gateway.web_b",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "3d3c925d-b665-4a01-b2e4-b928b6f3ab31": {
      kind: "presentation",
      catalogId: "aws-ec2-instance",
      aliasOf: "aws_autoscaling_group.web",
      style: null
    },
    "4952ad77-6b67-4d60-ba48-399fb1da6ca6": {
      kind: "presentation",
      catalogId: "aws-rds-cluster",
      aliasOf: "aws_rds_cluster.aws_rds_cluster_19",
      style: null
    },
    "84a9b330-9c06-4a61-85b8-00f4db547d21": {
      kind: "resource",
      address: "aws_rds_cluster.aws_rds_cluster_19",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "9f288d70-3c85-4204-acc7-9543bc9d38f6": {
      kind: "resource",
      address: "aws_nat_gateway.web_a",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "a4c5b76d-069d-4e57-b11d-aead846a2201": {
      kind: "presentation",
      catalogId: "aws-ec2-instance",
      aliasOf: "aws_autoscaling_group.web",
      style: null
    },
    "c07e1ce3-dd7c-4a9c-82c8-752a10ea5fba": {
      kind: "presentation",
      catalogId: "aws-ec2-instance",
      aliasOf: "aws_autoscaling_group.app",
      style: null
    },
    "dc04ec1e-665b-45ab-ba9f-290b55340c7b": {
      kind: "presentation",
      catalogId: "aws-ec2-instance",
      aliasOf: "aws_autoscaling_group.app",
      style: null
    }
  }
});
