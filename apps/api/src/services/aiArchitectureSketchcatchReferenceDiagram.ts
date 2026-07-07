import type { DiagramJson } from "@sketchcatch/types";

// SketchCatch reference fixture boundary:
// This exact DiagramJson is used only for the selected-answer deployment path.
// Delete this file and its two call sites to remove the forced reference output.
export const SKETCHCATCH_REFERENCE_DIAGRAM_JSON: DiagramJson = {
  "edges": [
    {
      "id": "public-a-to-public-route-table",
      "type": "smoothstep",
      "label": "uses",
      "style": {
        "color": "#7f8b9a",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "public-subnet-a",
      "targetNodeId": "public-route-table",
      "sourceHandleId": "handle-left",
      "targetHandleId": "handle-right"
    },
    {
      "id": "private-app-c-route-to-nat",
      "type": "smoothstep",
      "label": "egress",
      "style": {
        "color": "#7f8b9a",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "private-app-c-default-route",
      "targetNodeId": "nat-gateway-c",
      "sourceHandleId": "handle-top",
      "targetHandleId": "handle-bottom"
    },
    {
      "id": "cloudfront-to-static-bucket",
      "type": "smoothstep",
      "label": "static origin",
      "style": {
        "color": "#7f8b9a",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "cloudfront-distribution",
      "targetNodeId": "static-frontend-bucket",
      "sourceHandleId": "handle-top",
      "targetHandleId": "handle-bottom"
    },
    {
      "id": "cloudfront-to-alb",
      "type": "smoothstep",
      "label": "api origin",
      "style": {
        "color": "#7f8b9a",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "cloudfront-distribution",
      "targetNodeId": "api-alb",
      "sourceHandleId": "handle-right",
      "targetHandleId": "handle-left"
    },
    {
      "id": "user-to-cloudfront",
      "type": "smoothstep",
      "label": "requests",
      "style": {
        "color": "#7f8b9a",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "user",
      "targetNodeId": "cloudfront-distribution",
      "sourceHandleId": "handle-right",
      "targetHandleId": "handle-left"
    },
    {
      "id": "static-public-block-to-bucket",
      "type": "smoothstep",
      "label": "protects",
      "style": {
        "color": "#7f8b9a",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "static-frontend-public-access-block",
      "targetNodeId": "static-frontend-bucket",
      "sourceHandleId": "handle-right",
      "targetHandleId": "handle-left"
    },
    {
      "id": "static-policy-to-cloudfront",
      "type": "smoothstep",
      "label": "allows OAC",
      "style": {
        "color": "#7f8b9a",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "static-frontend-bucket-policy",
      "targetNodeId": "cloudfront-distribution",
      "sourceHandleId": "handle-bottom",
      "targetHandleId": "handle-top"
    },
    {
      "id": "api-alb-to-http-listener",
      "type": "smoothstep",
      "label": "listens",
      "style": {
        "color": "#7f8b9a",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "api-alb",
      "targetNodeId": "http-listener",
      "sourceHandleId": "handle-right",
      "targetHandleId": "handle-left"
    },
    {
      "id": "http-listener-to-target-group",
      "type": "smoothstep",
      "label": "forwards",
      "style": {
        "color": "#7f8b9a",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "http-listener",
      "targetNodeId": "api-target-group",
      "sourceHandleId": "handle-right",
      "targetHandleId": "handle-left"
    },
    {
      "id": "launch-template-to-asg",
      "type": "smoothstep",
      "label": "launches",
      "style": {
        "color": "#7f8b9a",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "launch-template",
      "targetNodeId": "api-autoscaling-group",
      "sourceHandleId": "handle-bottom",
      "targetHandleId": "handle-top"
    },
    {
      "id": "private-db-a-route-to-subnet",
      "type": "smoothstep",
      "label": "uses",
      "style": {
        "color": "#7f8b9a",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "private-db-a-label",
      "targetNodeId": "private-db-subnet-a",
      "sourceHandleId": "handle-left",
      "targetHandleId": "handle-right"
    },
    {
      "id": "private-db-c-route-to-subnet",
      "type": "smoothstep",
      "label": "uses",
      "style": {
        "color": "#7f8b9a",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "private-db-c-label",
      "targetNodeId": "private-db-subnet-c",
      "sourceHandleId": "handle-left",
      "targetHandleId": "handle-right"
    },
    {
      "id": "edge-mrb86hc0-15wb0s",
      "type": "smoothstep",
      "style": {
        "color": "#506176",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "private-app-a-route-table",
      "targetNodeId": "private-app-a-route-table-label",
      "sourceHandleId": "handle-left",
      "targetHandleId": "handle-right"
    },
    {
      "id": "edge-mrb86w0k-qthij6",
      "type": "smoothstep",
      "style": {
        "color": "#506176",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "private-app-a-route-table-label",
      "targetNodeId": "nat-gateway-a",
      "sourceHandleId": "handle-bottom",
      "targetHandleId": "handle-top"
    },
    {
      "id": "edge-mrb87oo9-quuc97",
      "type": "smoothstep",
      "style": {
        "color": "#506176",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "private-app-c-route-table",
      "targetNodeId": "private-app-c-default-route",
      "sourceHandleId": "handle-left",
      "targetHandleId": "handle-right"
    },
    {
      "id": "edge-mrb88yby-ea8fl8",
      "type": "smoothstep",
      "style": {
        "color": "#506176",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "app-instance-c",
      "targetNodeId": "app-ami",
      "sourceHandleId": "handle-top",
      "targetHandleId": "handle-bottom"
    },
    {
      "id": "edge-mrb890w5-ifdwk1",
      "type": "smoothstep",
      "style": {
        "color": "#506176",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "app-instance-a",
      "targetNodeId": "app-ami",
      "sourceHandleId": "handle-bottom",
      "targetHandleId": "handle-top"
    },
    {
      "id": "edge-mrb8adx4-17r6ke",
      "type": "smoothstep",
      "style": {
        "color": "#506176",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "private-db-c-label",
      "targetNodeId": "db-route-table",
      "sourceHandleId": "handle-top",
      "targetHandleId": "handle-bottom"
    },
    {
      "id": "edge-mrb8agj5-inkuny",
      "type": "smoothstep",
      "style": {
        "color": "#506176",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "private-db-a-label",
      "targetNodeId": "db-route-table",
      "sourceHandleId": "handle-bottom",
      "targetHandleId": "handle-top"
    },
    {
      "id": "edge-mrb8k3co-9q9qnl",
      "type": "smoothstep",
      "style": {
        "color": "#506176",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "node-mrb8d7zt-732qra",
      "targetNodeId": "internet-gateway",
      "sourceHandleId": "handle-bottom",
      "targetHandleId": "handle-top"
    },
    {
      "id": "edge-mrb8kagc-zx1z4o",
      "type": "smoothstep",
      "style": {
        "color": "#506176",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "nat-gateway-a",
      "targetNodeId": "internet-gateway",
      "sourceHandleId": "handle-left",
      "targetHandleId": "handle-right"
    },
    {
      "id": "edge-mrb8kgm7-3hp225",
      "type": "smoothstep",
      "style": {
        "color": "#506176",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "node-mrb8d7zt-732qra",
      "targetNodeId": "node-mrb8ji31-0wsxf9",
      "sourceHandleId": "handle-right",
      "targetHandleId": "handle-left"
    },
    {
      "id": "edge-mrb8kjrd-url1u0",
      "type": "smoothstep",
      "style": {
        "color": "#506176",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "public-route-table",
      "targetNodeId": "node-mrb8ji31-0wsxf9",
      "sourceHandleId": "handle-bottom",
      "targetHandleId": "handle-top"
    },
    {
      "id": "edge-mrb8kncd-u06trc",
      "type": "smoothstep",
      "style": {
        "color": "#506176",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "node-mrb8jix1-l3dzkw",
      "targetNodeId": "node-mrb8ji31-0wsxf9",
      "sourceHandleId": "handle-top",
      "targetHandleId": "handle-bottom"
    },
    {
      "id": "edge-mrb8kxl9-l1lmit",
      "type": "smoothstep",
      "style": {
        "color": "#506176",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "nat-gateway-c",
      "targetNodeId": "internet-gateway",
      "sourceHandleId": "handle-left",
      "targetHandleId": "handle-right"
    },
    {
      "id": "edge-mrb8l0wp-vokm6d",
      "type": "smoothstep",
      "style": {
        "color": "#506176",
        "width": "medium",
        "animated": false,
        "lineStyle": "solid"
      },
      "sourceNodeId": "node-mrb8jix1-l3dzkw",
      "targetNodeId": "public-subnet-c",
      "sourceHandleId": "handle-right",
      "targetHandleId": "handle-left"
    }
  ],
  "nodes": [
    {
      "id": "region-seoul",
      "kind": "design",
      "size": {
        "width": 2016,
        "height": 1546
      },
      "type": "sketchcatch_region",
      "label": "Asia pacific (Seoul)",
      "locked": false,
      "zIndex": 1,
      "position": {
        "x": 230,
        "y": -42
      }
    },
    {
      "id": "cicd-artifacts-group",
      "kind": "design",
      "size": {
        "width": 142,
        "height": 150
      },
      "type": "sketchcatch_group",
      "label": "CI/CD Artifacts",
      "locked": false,
      "zIndex": 2,
      "metadata": {
        "parentAreaNodeId": "region-seoul"
      },
      "position": {
        "x": 522,
        "y": 52
      }
    },
    {
      "id": "artifact-bucket",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 76
      },
      "type": "aws_s3_bucket",
      "label": "Artifact S3 Bucket",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Resource-Icons_07312025/Res_Storage/Res_Amazon-Simple-Storage-Service_Bucket_48.svg",
      "metadata": {
        "parentAreaNodeId": "cicd-artifacts-group"
      },
      "position": {
        "x": 552,
        "y": 96
      },
      "parameters": {
        "values": {
          "diagramLabel": "Artifact S3 Bucket",
          "diagramWidth": 76,
          "bucketPurpose": "deployment_artifacts",
          "diagramHeight": 76,
          "parentAreaNodeId": "cicd-artifacts-group",
          "publicAccessBlock": true,
          "terraformResourceName": "artifact_s3_bucket"
        },
        "fileName": "main",
        "resourceName": "artifact_s3_bucket",
        "resourceType": "aws_s3_bucket",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "pipeline-group",
      "kind": "design",
      "size": {
        "width": 541,
        "height": 183
      },
      "type": "sketchcatch_group",
      "label": "Pipeline",
      "locked": false,
      "zIndex": 2,
      "metadata": {
        "parentAreaNodeId": "region-seoul"
      },
      "position": {
        "x": 705,
        "y": 19
      }
    },
    {
      "id": "github",
      "kind": "design",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "sketchcatch_service",
      "label": "Github",
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Resource-Icons_07312025/Res_General-Icons/Res_48_Light/Res_Git-Repository_48_Light.svg",
      "metadata": {
        "parentAreaNodeId": "pipeline-group"
      },
      "position": {
        "x": 742,
        "y": 96
      }
    },
    {
      "id": "github-connection",
      "kind": "design",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "sketchcatch_service",
      "label": "github_connection",
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Developer-Tools/64/Arch_AWS-CodePipeline_64.svg",
      "metadata": {
        "parentAreaNodeId": "pipeline-group"
      },
      "position": {
        "x": 835,
        "y": 96
      }
    },
    {
      "id": "codepipeline-display",
      "kind": "design",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "sketchcatch_service",
      "label": "codepipeline",
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Developer-Tools/64/Arch_AWS-CodePipeline_64.svg",
      "metadata": {
        "parentAreaNodeId": "pipeline-group"
      },
      "position": {
        "x": 925,
        "y": 96
      }
    },
    {
      "id": "codepipeline-iam-group",
      "kind": "design",
      "size": {
        "width": 220,
        "height": 117
      },
      "type": "sketchcatch_group",
      "label": "CodePipeline IAM",
      "locked": false,
      "zIndex": 3,
      "metadata": {
        "parentAreaNodeId": "pipeline-group"
      },
      "position": {
        "x": 1005,
        "y": 67
      }
    },
    {
      "id": "codepipeline-role",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_iam_role",
      "label": "codepipeline_role",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 103,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Role_48.svg",
      "metadata": {
        "parentAreaNodeId": "codepipeline-iam-group"
      },
      "position": {
        "x": 1040,
        "y": 108
      },
      "parameters": {
        "values": {
          "diagramLabel": "codepipeline_role",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "codepipeline-iam-group",
          "assumeRoleService": "codepipeline.amazonaws.com",
          "terraformResourceName": "codepipeline_role"
        },
        "fileName": "main",
        "resourceName": "codepipeline_role",
        "resourceType": "aws_iam_role",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "codepipeline-policy",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_iam_policy",
      "label": "codepipeline_policy",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 103,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Permissions_48.svg",
      "metadata": {
        "parentAreaNodeId": "codepipeline-iam-group"
      },
      "position": {
        "x": 1134,
        "y": 105
      },
      "parameters": {
        "values": {
          "actions": [
            "codepipeline:*",
            "codebuild:StartBuild",
            "codedeploy:CreateDeployment"
          ],
          "diagramLabel": "codepipeline_policy",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "codepipeline-iam-group",
          "terraformResourceName": "codepipeline_policy"
        },
        "fileName": "main",
        "resourceName": "codepipeline_policy",
        "resourceType": "aws_iam_policy",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "build-group",
      "kind": "design",
      "size": {
        "width": 417,
        "height": 178
      },
      "type": "sketchcatch_group",
      "label": "Build",
      "locked": false,
      "zIndex": 2,
      "metadata": {
        "parentAreaNodeId": "region-seoul"
      },
      "position": {
        "x": 1275,
        "y": 24
      }
    },
    {
      "id": "codebuild-project",
      "kind": "design",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "sketchcatch_service",
      "label": "codebuild_project",
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Developer-Tools/64/Arch_AWS-CodeBuild_64.svg",
      "metadata": {
        "parentAreaNodeId": "build-group"
      },
      "position": {
        "x": 1310,
        "y": 96
      }
    },
    {
      "id": "codebuild-logs",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_cloudwatch_log_group",
      "label": "codebuild_logs",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Resource-Icons_07312025/Res_Management-Governance/Res_Amazon-CloudWatch_Logs_48.svg",
      "metadata": {
        "parentAreaNodeId": "build-group"
      },
      "position": {
        "x": 1397,
        "y": 98
      },
      "parameters": {
        "values": {
          "diagramLabel": "codebuild_logs",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "build-group",
          "terraformResourceName": "codebuild_logs"
        },
        "fileName": "main",
        "resourceName": "codebuild_logs",
        "resourceType": "aws_cloudwatch_log_group",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "codebuild-iam-group",
      "kind": "design",
      "size": {
        "width": 195,
        "height": 117
      },
      "type": "sketchcatch_group",
      "label": "CodeBuild IAM",
      "locked": false,
      "zIndex": 3,
      "metadata": {
        "parentAreaNodeId": "build-group"
      },
      "position": {
        "x": 1478,
        "y": 67
      }
    },
    {
      "id": "codebuild-role",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_iam_role",
      "label": "codebuild_role",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 103,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Role_48.svg",
      "metadata": {
        "parentAreaNodeId": "codebuild-iam-group"
      },
      "position": {
        "x": 1504,
        "y": 108
      },
      "parameters": {
        "values": {
          "diagramLabel": "codebuild_role",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "codebuild-iam-group",
          "assumeRoleService": "codebuild.amazonaws.com",
          "terraformResourceName": "codebuild_role"
        },
        "fileName": "main",
        "resourceName": "codebuild_role",
        "resourceType": "aws_iam_role",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "codebuild-policy",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_iam_policy",
      "label": "codebuild_policy",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 103,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Permissions_48.svg",
      "metadata": {
        "parentAreaNodeId": "codebuild-iam-group"
      },
      "position": {
        "x": 1584,
        "y": 105
      },
      "parameters": {
        "values": {
          "actions": [
            "logs:*",
            "s3:*",
            "ec2:*"
          ],
          "diagramLabel": "codebuild_policy",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "codebuild-iam-group",
          "terraformResourceName": "codebuild_policy"
        },
        "fileName": "main",
        "resourceName": "codebuild_policy",
        "resourceType": "aws_iam_policy",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "deploy-group",
      "kind": "design",
      "size": {
        "width": 506,
        "height": 182
      },
      "type": "sketchcatch_group",
      "label": "Deploy",
      "locked": false,
      "zIndex": 2,
      "metadata": {
        "parentAreaNodeId": "region-seoul"
      },
      "position": {
        "x": 1705,
        "y": 20
      }
    },
    {
      "id": "codedeploy-deployment-group",
      "kind": "design",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "sketchcatch_service",
      "label": "codedeploy_deployment_gr...",
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Developer-Tools/64/Arch_AWS-CodeDeploy_64.svg",
      "metadata": {
        "parentAreaNodeId": "deploy-group"
      },
      "position": {
        "x": 1760,
        "y": 96
      }
    },
    {
      "id": "codedeploy-app",
      "kind": "design",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "sketchcatch_service",
      "label": "codedeploy_app",
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Developer-Tools/64/Arch_AWS-CodeDeploy_64.svg",
      "metadata": {
        "parentAreaNodeId": "deploy-group"
      },
      "position": {
        "x": 1860,
        "y": 96
      }
    },
    {
      "id": "codedeploy-iam-group",
      "kind": "design",
      "size": {
        "width": 218,
        "height": 117
      },
      "type": "sketchcatch_group",
      "label": "CodeDeploy IAM",
      "locked": false,
      "zIndex": 3,
      "metadata": {
        "parentAreaNodeId": "deploy-group"
      },
      "position": {
        "x": 1965,
        "y": 67
      }
    },
    {
      "id": "codedeploy-role",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_iam_role",
      "label": "codedeploy_role",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 103,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Role_48.svg",
      "metadata": {
        "parentAreaNodeId": "codedeploy-iam-group"
      },
      "position": {
        "x": 1995,
        "y": 108
      },
      "parameters": {
        "values": {
          "diagramLabel": "codedeploy_role",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "codedeploy-iam-group",
          "assumeRoleService": "codedeploy.amazonaws.com",
          "terraformResourceName": "codedeploy_role"
        },
        "fileName": "main",
        "resourceName": "codedeploy_role",
        "resourceType": "aws_iam_role",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "codedeploy-policy",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_iam_policy",
      "label": "codedeploy_role_policy",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 103,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Permissions_48.svg",
      "metadata": {
        "parentAreaNodeId": "codedeploy-iam-group"
      },
      "position": {
        "x": 2095,
        "y": 105
      },
      "parameters": {
        "values": {
          "actions": [
            "codedeploy:*",
            "autoscaling:*",
            "ec2:*"
          ],
          "diagramLabel": "codedeploy_role_policy",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "codedeploy-iam-group",
          "terraformResourceName": "codedeploy_role_policy"
        },
        "fileName": "main",
        "resourceName": "codedeploy_role_policy",
        "resourceType": "aws_iam_policy",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "secret-manager-group",
      "kind": "design",
      "size": {
        "width": 220,
        "height": 159
      },
      "type": "sketchcatch_group",
      "label": "Secret Manager",
      "locked": false,
      "zIndex": 2,
      "metadata": {
        "parentAreaNodeId": "region-seoul"
      },
      "position": {
        "x": 1396,
        "y": 230
      }
    },
    {
      "id": "db-credentials-version",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_secretsmanager_secret",
      "label": "db_credentials_version",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Security-Identity-Compliance/64/Arch_AWS-Secrets-Manager_64.svg",
      "metadata": {
        "parentAreaNodeId": "secret-manager-group"
      },
      "position": {
        "x": 1432,
        "y": 295
      },
      "parameters": {
        "values": {
          "diagramLabel": "db_credentials_version",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "secretPurpose": "rds_password_version",
          "parentAreaNodeId": "secret-manager-group",
          "terraformResourceName": "db_credentials_version"
        },
        "fileName": "main",
        "resourceName": "db_credentials_version",
        "resourceType": "aws_secretsmanager_secret",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "db-credentials",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_secretsmanager_secret",
      "label": "db_credentials",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Security-Identity-Compliance/64/Arch_AWS-Secrets-Manager_64.svg",
      "metadata": {
        "parentAreaNodeId": "secret-manager-group"
      },
      "position": {
        "x": 1535,
        "y": 295
      },
      "parameters": {
        "values": {
          "diagramLabel": "db_credentials",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "secretPurpose": "rds_connection",
          "parentAreaNodeId": "secret-manager-group",
          "terraformResourceName": "db_credentials"
        },
        "fileName": "main",
        "resourceName": "db_credentials",
        "resourceType": "aws_secretsmanager_secret",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "ec2-instance-access-group",
      "kind": "design",
      "size": {
        "width": 518,
        "height": 191
      },
      "type": "sketchcatch_group",
      "label": "EC2 Instance Access",
      "locked": false,
      "zIndex": 2,
      "metadata": {
        "parentAreaNodeId": "region-seoul"
      },
      "position": {
        "x": 1677,
        "y": 230
      }
    },
    {
      "id": "ec2-instance-profile",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_iam_instance_profile",
      "label": "ec2_instance_profile",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Security-Identity-Compliance/64/Arch_AWS-Identity-and-Access-Management_64.svg",
      "metadata": {
        "parentAreaNodeId": "ec2-instance-access-group"
      },
      "position": {
        "x": 1710,
        "y": 295
      },
      "parameters": {
        "values": {
          "role": "aws_iam_role.ec2_role.name",
          "diagramLabel": "ec2_instance_profile",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "ec2-instance-access-group",
          "terraformResourceName": "ec2_instance_profile"
        },
        "fileName": "main",
        "resourceName": "ec2_instance_profile",
        "resourceType": "aws_iam_instance_profile",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "ec2-iam-group",
      "kind": "design",
      "size": {
        "width": 370,
        "height": 125
      },
      "type": "sketchcatch_group",
      "label": "EC2 Instance IAM",
      "locked": false,
      "zIndex": 3,
      "metadata": {
        "parentAreaNodeId": "ec2-instance-access-group"
      },
      "position": {
        "x": 1812,
        "y": 276
      }
    },
    {
      "id": "ec2-role",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_iam_role",
      "label": "ec2_role",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 103,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Role_48.svg",
      "metadata": {
        "parentAreaNodeId": "ec2-iam-group"
      },
      "position": {
        "x": 1850,
        "y": 321
      },
      "parameters": {
        "values": {
          "diagramLabel": "ec2_role",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "ec2-iam-group",
          "assumeRoleService": "ec2.amazonaws.com",
          "terraformResourceName": "ec2_role"
        },
        "fileName": "main",
        "resourceName": "ec2_role",
        "resourceType": "aws_iam_role",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "ec2-policy",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_iam_policy",
      "label": "ec2_policy",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 103,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Permissions_48.svg",
      "metadata": {
        "parentAreaNodeId": "ec2-iam-group"
      },
      "position": {
        "x": 1932,
        "y": 318
      },
      "parameters": {
        "values": {
          "actions": [
            "s3:GetObject",
            "logs:PutLogEvents",
            "secretsmanager:GetSecretValue"
          ],
          "diagramLabel": "ec2_policy",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "ec2-iam-group",
          "terraformResourceName": "ec2_policy"
        },
        "fileName": "main",
        "resourceName": "ec2_policy",
        "resourceType": "aws_iam_policy",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "ec2-codedeploy-policy",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_iam_policy",
      "label": "ec2_codedeploy",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 103,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Permissions_48.svg",
      "metadata": {
        "parentAreaNodeId": "ec2-iam-group"
      },
      "position": {
        "x": 2017,
        "y": 318
      },
      "parameters": {
        "values": {
          "actions": [
            "codedeploy:*"
          ],
          "diagramLabel": "ec2_codedeploy",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "ec2-iam-group",
          "terraformResourceName": "ec2_codedeploy"
        },
        "fileName": "main",
        "resourceName": "ec2_codedeploy",
        "resourceType": "aws_iam_policy",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "ec2-ssm-policy",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_iam_policy",
      "label": "ec2_ssm",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 103,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Permissions_48.svg",
      "metadata": {
        "parentAreaNodeId": "ec2-iam-group"
      },
      "position": {
        "x": 2102,
        "y": 318
      },
      "parameters": {
        "values": {
          "actions": [
            "ssm:*",
            "ssmmessages:*"
          ],
          "diagramLabel": "ec2_ssm",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "ec2-iam-group",
          "terraformResourceName": "ec2_ssm"
        },
        "fileName": "main",
        "resourceName": "ec2_ssm",
        "resourceType": "aws_iam_policy",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "user",
      "kind": "design",
      "size": {
        "width": 72,
        "height": 72
      },
      "type": "sketchcatch_user_client",
      "label": "user",
      "locked": false,
      "zIndex": 100,
      "iconUrl": "/Resource-Icons_07312025/Res_General-Icons/Res_48_Light/Res_Client_48_Light.svg",
      "position": {
        "x": 30,
        "y": 930
      }
    },
    {
      "id": "static-frontend-public-access-block",
      "kind": "design",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "sketchcatch_service",
      "label": "static_frontend_public_a...",
      "locked": false,
      "zIndex": 101,
      "iconUrl": "/Resource-Icons_07312025/Res_Storage/Res_Amazon-Simple-Storage-Service_S3-Standard_48.svg",
      "metadata": {
        "parentAreaNodeId": "region-seoul"
      },
      "position": {
        "x": 270,
        "y": 615
      }
    },
    {
      "id": "static-frontend-bucket",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_s3_bucket",
      "label": "Static Frontend S3 Bucke...",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 101,
      "iconUrl": "/Resource-Icons_07312025/Res_Storage/Res_Amazon-Simple-Storage-Service_Bucket_48.svg",
      "metadata": {
        "parentAreaNodeId": "region-seoul"
      },
      "position": {
        "x": 424,
        "y": 615
      },
      "parameters": {
        "values": {
          "diagramLabel": "Static Frontend S3 Bucke...",
          "diagramWidth": 76,
          "bucketPurpose": "static_frontend_origin",
          "diagramHeight": 72,
          "parentAreaNodeId": "region-seoul",
          "publicAccessBlock": true,
          "terraformResourceName": "static_frontend_bucket"
        },
        "fileName": "main",
        "resourceName": "static_frontend_bucket",
        "resourceType": "aws_s3_bucket",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "static-frontend-bucket-policy",
      "kind": "design",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "sketchcatch_service",
      "label": "static_frontend_bucket_p...",
      "locked": false,
      "zIndex": 101,
      "iconUrl": "/Resource-Icons_07312025/Res_Storage/Res_Amazon-Simple-Storage-Service_Bucket_48.svg",
      "metadata": {
        "parentAreaNodeId": "region-seoul"
      },
      "position": {
        "x": 320,
        "y": 810
      }
    },
    {
      "id": "cloudfront-distribution",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_cloudfront_distribution",
      "label": "cloudfront_distribution",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 101,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Amazon-CloudFront_64.svg",
      "metadata": {
        "parentAreaNodeId": "region-seoul"
      },
      "position": {
        "x": 320,
        "y": 945
      },
      "parameters": {
        "values": {
          "origins": [
            "aws_s3_bucket.static_frontend_bucket.bucket_regional_domain_name",
            "aws_lb.lb.dns_name"
          ],
          "diagramLabel": "cloudfront_distribution",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "region-seoul",
          "terraformResourceName": "cloudfront_distribution"
        },
        "fileName": "main",
        "resourceName": "cloudfront_distribution",
        "resourceType": "aws_cloudfront_distribution",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "s3-oac",
      "kind": "design",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "sketchcatch_service",
      "label": "s3_oac",
      "locked": false,
      "zIndex": 101,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Amazon-CloudFront_64.svg",
      "metadata": {
        "parentAreaNodeId": "region-seoul"
      },
      "position": {
        "x": 322,
        "y": 1050
      }
    },
    {
      "id": "vpc-main",
      "kind": "resource",
      "size": {
        "width": 1580,
        "height": 1055
      },
      "type": "aws_vpc",
      "label": "vpc",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 2,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Amazon-Virtual-Private-Cloud_64.svg",
      "metadata": {
        "parentAreaNodeId": "region-seoul"
      },
      "position": {
        "x": 540,
        "y": 444
      },
      "parameters": {
        "values": {
          "cidrBlock": "10.0.0.0/16",
          "diagramWidth": 1580,
          "diagramHeight": 1055,
          "diagramAreaLabel": "vpc",
          "enableDnsSupport": true,
          "parentAreaNodeId": "region-seoul",
          "enableDnsHostnames": true,
          "terraformResourceName": "vpc",
          "sketchcatchReferenceTerraform": "sketchcatch-reference-web-service-deployment"
        },
        "fileName": "main",
        "resourceName": "vpc",
        "resourceType": "aws_vpc",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "alb-security-group",
      "kind": "resource",
      "size": {
        "width": 160,
        "height": 200
      },
      "type": "aws_security_group",
      "label": "alb_sg",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 3,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Security-Identity-Compliance/64/Arch_AWS-Network-Firewall_64.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 678,
        "y": 544
      },
      "parameters": {
        "values": {
          "vpcId": "aws_vpc.vpc.id",
          "egress": [
            {
              "cidr": "0.0.0.0/0",
              "protocol": "-1"
            }
          ],
          "ingress": [
            {
              "cidr": "0.0.0.0/0",
              "port": 80,
              "protocol": "tcp"
            }
          ],
          "diagramWidth": 160,
          "diagramHeight": 200,
          "diagramAreaLabel": "alb_sg",
          "parentAreaNodeId": "vpc-main",
          "terraformResourceName": "alb_sg"
        },
        "fileName": "main",
        "resourceName": "alb_sg",
        "resourceType": "aws_security_group",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "sg-rule",
      "kind": "design",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "sketchcatch_service",
      "label": "sg_rule",
      "locked": false,
      "zIndex": 103,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Network-Firewall_Endpoints_48.svg",
      "metadata": {
        "parentAreaNodeId": "alb-security-group"
      },
      "position": {
        "x": 698,
        "y": 604
      }
    },
    {
      "id": "alb-egress",
      "kind": "design",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "sketchcatch_service",
      "label": "alb_egress",
      "locked": false,
      "zIndex": 103,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Network-Firewall_Endpoints_48.svg",
      "metadata": {
        "parentAreaNodeId": "alb-security-group"
      },
      "position": {
        "x": 759,
        "y": 604
      }
    },
    {
      "id": "api-alb",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_lb",
      "label": "lb",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Elastic-Load-Balancing_64.svg",
      "metadata": {
        "parentAreaNodeId": "alb-security-group"
      },
      "position": {
        "x": 756,
        "y": 684
      },
      "parameters": {
        "values": {
          "subnets": [
            "aws_subnet.public_a.id",
            "aws_subnet.public_c.id"
          ],
          "diagramLabel": "lb",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "securityGroups": [
            "aws_security_group.alb_sg.id"
          ],
          "loadBalancerType": "application",
          "parentAreaNodeId": "vpc-main",
          "terraformResourceName": "lb"
        },
        "fileName": "main",
        "resourceName": "lb",
        "resourceType": "aws_lb",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "http-listener",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_lb_listener",
      "label": "http_listener",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Elastic-Load-Balancing_Application-Load-Balancer_48.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 1008,
        "y": 648
      },
      "parameters": {
        "values": {
          "port": 80,
          "protocol": "HTTP",
          "diagramLabel": "http_listener",
          "diagramWidth": 76,
          "defaultAction": {
            "type": "forward",
            "targetGroupArn": "aws_lb_target_group.lb_target_group.arn"
          },
          "diagramHeight": 72,
          "loadBalancerArn": "aws_lb.lb.arn",
          "parentAreaNodeId": "vpc-main",
          "terraformResourceName": "http_listener"
        },
        "fileName": "main",
        "resourceName": "http_listener",
        "resourceType": "aws_lb_listener",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "private-app-a-route-table-label",
      "kind": "design",
      "size": {
        "width": 92,
        "height": 60
      },
      "type": "sketchcatch_service",
      "label": "private_app_a_route_tabl...",
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-Route-53_Route-Table_48.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 1092,
        "y": 494
      }
    },
    {
      "id": "private-app-a-route-table",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_route_table",
      "label": "private_app_a",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-Route-53_Route-Table_48.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 1272,
        "y": 482
      },
      "parameters": {
        "values": {
          "route": [
            {
              "cidrBlock": "0.0.0.0/0",
              "natGatewayId": "aws_nat_gateway.nat_gateway_a.id"
            }
          ],
          "vpcId": "aws_vpc.vpc.id",
          "diagramLabel": "private_app_a",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "vpc-main",
          "terraformResourceName": "private_app_a"
        },
        "fileName": "main",
        "resourceName": "private_app_a",
        "resourceType": "aws_route_table",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "public-subnet-a",
      "kind": "resource",
      "size": {
        "width": 178,
        "height": 218
      },
      "type": "aws_subnet",
      "label": "public A",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 3,
      "iconUrl": "/Architecture-Group-Icons_07312025/Private-subnet_32.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 970,
        "y": 792
      },
      "parameters": {
        "values": {
          "vpcId": "aws_vpc.vpc.id",
          "cidrBlock": "10.0.0.0/24",
          "diagramWidth": 178,
          "diagramHeight": 218,
          "availabilityZone": "ap-northeast-2a",
          "diagramAreaLabel": "public A",
          "parentAreaNodeId": "vpc-main",
          "mapPublicIpOnLaunch": true,
          "terraformResourceName": "public_a"
        },
        "fileName": "main",
        "resourceName": "public_a",
        "resourceType": "aws_subnet",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "nat-gateway-a",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_nat_gateway",
      "label": "nat_gateway_a",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 103,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-VPC_NAT-Gateway_48.svg",
      "metadata": {
        "parentAreaNodeId": "public-subnet-a"
      },
      "position": {
        "x": 1070,
        "y": 829
      },
      "parameters": {
        "values": {
          "subnetId": "aws_subnet.public_a.id",
          "allocationId": "aws_eip.nat_eip_a.id",
          "diagramLabel": "nat_gateway_a",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "public-subnet-a",
          "terraformResourceName": "nat_gateway_a"
        },
        "fileName": "main",
        "resourceName": "nat_gateway_a",
        "resourceType": "aws_nat_gateway",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "nat-eip-a",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_eip",
      "label": "nat_eip_a",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 103,
      "iconUrl": "/Resource-Icons_07312025/Res_Compute/Res_Amazon-EC2_Elastic-IP-Address_48.svg",
      "metadata": {
        "parentAreaNodeId": "public-subnet-a"
      },
      "position": {
        "x": 1070,
        "y": 909
      },
      "parameters": {
        "values": {
          "domain": "vpc",
          "diagramLabel": "nat_eip_a",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "public-subnet-a",
          "terraformResourceName": "nat_eip_a"
        },
        "fileName": "main",
        "resourceName": "nat_eip_a",
        "resourceType": "aws_eip",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "private-app-subnet-a",
      "kind": "resource",
      "size": {
        "width": 445,
        "height": 218
      },
      "type": "aws_subnet",
      "label": "Private App Subnet A",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 3,
      "iconUrl": "/Architecture-Group-Icons_07312025/Private-subnet_32.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 1172,
        "y": 792
      },
      "parameters": {
        "values": {
          "vpcId": "aws_vpc.vpc.id",
          "cidrBlock": "10.0.10.0/24",
          "diagramWidth": 445,
          "diagramHeight": 218,
          "availabilityZone": "ap-northeast-2a",
          "diagramAreaLabel": "Private App Subnet A",
          "parentAreaNodeId": "vpc-main",
          "mapPublicIpOnLaunch": false,
          "terraformResourceName": "private_app_a"
        },
        "fileName": "main",
        "resourceName": "private_app_a",
        "resourceType": "aws_subnet",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "public-subnet-c",
      "kind": "resource",
      "size": {
        "width": 178,
        "height": 230
      },
      "type": "aws_subnet",
      "label": "public B",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 3,
      "iconUrl": "/Architecture-Group-Icons_07312025/Private-subnet_32.svg",
      "metadata": {
        "parentAreaNodeId": "node-mrb8lb5l-tvyv9l"
      },
      "position": {
        "x": 972,
        "y": 1092
      },
      "parameters": {
        "values": {
          "vpcId": "aws_vpc.vpc.id",
          "cidrBlock": "10.0.1.0/24",
          "diagramWidth": 178,
          "diagramHeight": 230,
          "availabilityZone": "ap-northeast-2c",
          "diagramAreaLabel": "public B",
          "parentAreaNodeId": "vpc-main",
          "mapPublicIpOnLaunch": true,
          "terraformResourceName": "public_c"
        },
        "fileName": "main",
        "resourceName": "public_c",
        "resourceType": "aws_subnet",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "nat-eip-c",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_eip",
      "label": "nat_eip_c",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 103,
      "iconUrl": "/Resource-Icons_07312025/Res_Compute/Res_Amazon-EC2_Elastic-IP-Address_48.svg",
      "metadata": {
        "parentAreaNodeId": "public-subnet-c"
      },
      "position": {
        "x": 1072,
        "y": 1150
      },
      "parameters": {
        "values": {
          "domain": "vpc",
          "diagramLabel": "nat_eip_c",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "public-subnet-c",
          "terraformResourceName": "nat_eip_c"
        },
        "fileName": "main",
        "resourceName": "nat_eip_c",
        "resourceType": "aws_eip",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "nat-gateway-c",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_nat_gateway",
      "label": "nat_gateway_c",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 103,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-VPC_NAT-Gateway_48.svg",
      "metadata": {
        "parentAreaNodeId": "public-subnet-c"
      },
      "position": {
        "x": 1072,
        "y": 1230
      },
      "parameters": {
        "values": {
          "subnetId": "aws_subnet.public_c.id",
          "allocationId": "aws_eip.nat_eip_c.id",
          "diagramLabel": "nat_gateway_c",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "public-subnet-c",
          "terraformResourceName": "nat_gateway_c"
        },
        "fileName": "main",
        "resourceName": "nat_gateway_c",
        "resourceType": "aws_nat_gateway",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "private-app-subnet-c",
      "kind": "resource",
      "size": {
        "width": 445,
        "height": 230
      },
      "type": "aws_subnet",
      "label": "Private App Subnet B",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 3,
      "iconUrl": "/Architecture-Group-Icons_07312025/Private-subnet_32.svg",
      "metadata": {
        "parentAreaNodeId": "node-mrb8lb5l-tvyv9l"
      },
      "position": {
        "x": 1176,
        "y": 1080
      },
      "parameters": {
        "values": {
          "vpcId": "aws_vpc.vpc.id",
          "cidrBlock": "10.0.11.0/24",
          "diagramWidth": 445,
          "diagramHeight": 230,
          "availabilityZone": "ap-northeast-2c",
          "diagramAreaLabel": "Private App Subnet B",
          "parentAreaNodeId": "vpc-main",
          "mapPublicIpOnLaunch": false,
          "terraformResourceName": "private_app_c"
        },
        "fileName": "main",
        "resourceName": "private_app_c",
        "resourceType": "aws_subnet",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "public-route-table",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_route_table",
      "label": "public_route_table",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-Route-53_Route-Table_48.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 717,
        "y": 864
      },
      "parameters": {
        "values": {
          "route": [
            {
              "cidrBlock": "0.0.0.0/0",
              "gatewayId": "aws_internet_gateway.internet_gw.id"
            }
          ],
          "vpcId": "aws_vpc.vpc.id",
          "diagramLabel": "public_route_table",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "vpc-main",
          "terraformResourceName": "public_route_table"
        },
        "fileName": "main",
        "resourceName": "public_route_table",
        "resourceType": "aws_route_table",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "internet-gateway",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_internet_gateway",
      "label": "internet_gw",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-VPC_Internet-Gateway_48.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 504,
        "y": 1310
      },
      "parameters": {
        "values": {
          "vpcId": "aws_vpc.vpc.id",
          "diagramLabel": "internet_gw",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "vpc-main",
          "terraformResourceName": "internet_gw"
        },
        "fileName": "main",
        "resourceName": "internet_gw",
        "resourceType": "aws_internet_gateway",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "private-app-c-route-table",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_route_table",
      "label": "private_app_c",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-Route-53_Route-Table_48.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 1260,
        "y": 1404
      },
      "parameters": {
        "values": {
          "route": [
            {
              "cidrBlock": "0.0.0.0/0",
              "natGatewayId": "aws_nat_gateway.nat_gateway_c.id"
            }
          ],
          "vpcId": "aws_vpc.vpc.id",
          "diagramLabel": "private_app_c",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "vpc-main",
          "terraformResourceName": "private_app_c"
        },
        "fileName": "main",
        "resourceName": "private_app_c",
        "resourceType": "aws_route_table",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "private-app-c-default-route",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_route_table",
      "label": "private_app_c_default_ro...",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-Route-53_Route-Table_48.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 1068,
        "y": 1404
      },
      "parameters": {
        "values": {
          "vpcId": "aws_vpc.vpc.id",
          "diagramLabel": "private_app_c_default_ro...",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "vpc-main",
          "terraformResourceName": "private_app_c_default_route"
        },
        "fileName": "main",
        "resourceName": "private_app_c_default_route",
        "resourceType": "aws_route_table",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "launch-template",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_launch_template",
      "label": "launch_template",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Compute/64/Arch_Amazon-EC2_64.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 1416,
        "y": 518
      },
      "parameters": {
        "values": {
          "imageId": "data.aws_ssm_parameter.al2023_ami.value",
          "diagramLabel": "launch_template",
          "diagramWidth": 76,
          "instanceType": "t3.micro",
          "diagramHeight": 72,
          "parentAreaNodeId": "vpc-main",
          "vpcSecurityGroupIds": [
            "aws_security_group.app_sg.id"
          ],
          "terraformResourceName": "launch_template"
        },
        "fileName": "main",
        "resourceName": "launch_template",
        "resourceType": "aws_launch_template",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "api-target-group",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_lb_target_group",
      "label": "lb_target_group",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Elastic-Load-Balancing_Application-Load-Balancer_48.svg",
      "metadata": {
        "parentAreaNodeId": "api-autoscaling-group"
      },
      "position": {
        "x": 1380,
        "y": 684
      },
      "parameters": {
        "values": {
          "port": 8080,
          "vpcId": "aws_vpc.vpc.id",
          "protocol": "HTTP",
          "targetType": "instance",
          "diagramLabel": "lb_target_group",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "vpc-main",
          "terraformResourceName": "lb_target_group"
        },
        "fileName": "main",
        "resourceName": "lb_target_group",
        "resourceType": "aws_lb_target_group",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "api-autoscaling-group",
      "kind": "resource",
      "size": {
        "width": 282,
        "height": 615
      },
      "type": "aws_autoscaling_group",
      "label": "autoscaling_group",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 3,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Compute/64/Arch_Amazon-EC2-Auto-Scaling_64.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 1334,
        "y": 646
      },
      "parameters": {
        "values": {
          "maxSize": 4,
          "minSize": 2,
          "diagramWidth": 282,
          "diagramHeight": 615,
          "desiredCapacity": 2,
          "targetGroupArns": [
            "aws_lb_target_group.api_target_group.arn"
          ],
          "diagramAreaLabel": "autoscaling_group",
          "launchTemplateId": "aws_launch_template.launch_template.id",
          "parentAreaNodeId": "vpc-main",
          "vpcZoneIdentifier": [
            "aws_subnet.private_app_a.id"
          ],
          "terraformResourceName": "autoscaling_group"
        },
        "fileName": "main",
        "resourceName": "autoscaling_group",
        "resourceType": "aws_autoscaling_group",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "app-security-group",
      "kind": "resource",
      "size": {
        "width": 258,
        "height": 470
      },
      "type": "aws_security_group",
      "label": "app_sg",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 4,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Security-Identity-Compliance/64/Arch_AWS-Network-Firewall_64.svg",
      "metadata": {
        "parentAreaNodeId": "api-autoscaling-group"
      },
      "position": {
        "x": 1356,
        "y": 792
      },
      "parameters": {
        "values": {
          "vpcId": "aws_vpc.vpc.id",
          "egress": [
            {
              "cidr": "0.0.0.0/0",
              "protocol": "-1"
            }
          ],
          "ingress": [
            {
              "port": 8080,
              "protocol": "tcp",
              "securityGroups": [
                "aws_security_group.alb_sg.id"
              ]
            }
          ],
          "diagramWidth": 222,
          "diagramHeight": 465,
          "diagramAreaLabel": "app_sg",
          "parentAreaNodeId": "api-autoscaling-group",
          "terraformResourceName": "app_sg"
        },
        "fileName": "main",
        "resourceName": "app_sg",
        "resourceType": "aws_security_group",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "sg-rule6",
      "kind": "design",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "sketchcatch_service",
      "label": "sg_rule6",
      "locked": false,
      "zIndex": 104,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Network-Firewall_Endpoints_48.svg",
      "metadata": {
        "parentAreaNodeId": "app-security-group"
      },
      "position": {
        "x": 1492,
        "y": 832
      }
    },
    {
      "id": "app-instance-a",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_instance",
      "label": "instance2",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 104,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Compute/64/Arch_Amazon-EC2_64.svg",
      "metadata": {
        "parentAreaNodeId": "app-security-group"
      },
      "position": {
        "x": 1422,
        "y": 864
      },
      "parameters": {
        "values": {
          "ami": "data.aws_ssm_parameter.al2023_ami.value",
          "subnetId": "aws_subnet.private_app_a.id",
          "diagramLabel": "instance2",
          "diagramWidth": 76,
          "instanceType": "t3.micro",
          "diagramHeight": 72,
          "parentAreaNodeId": "app-security-group",
          "vpcSecurityGroupIds": [
            "aws_security_group.app_sg.id"
          ],
          "terraformResourceName": "instance2"
        },
        "fileName": "main",
        "resourceName": "instance2",
        "resourceType": "aws_instance",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "app-ami",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_ami",
      "label": "al2023 ami",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 104,
      "iconUrl": "/Resource-Icons_07312025/Res_Compute/Res_Amazon-EC2_AMI_48.svg",
      "metadata": {
        "parentAreaNodeId": "app-security-group"
      },
      "position": {
        "x": 1428,
        "y": 998
      },
      "parameters": {
        "values": {
          "name": "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64",
          "diagramLabel": "al2023 ami",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "app-security-group",
          "terraformResourceName": "al2023_ami"
        },
        "fileName": "main",
        "resourceName": "al2023_ami",
        "resourceType": "aws_ami",
        "terraformBlockType": "data"
      }
    },
    {
      "id": "app-instance-c",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_instance",
      "label": "instance3",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 104,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Compute/64/Arch_Amazon-EC2_64.svg",
      "metadata": {
        "parentAreaNodeId": "app-security-group"
      },
      "position": {
        "x": 1422,
        "y": 1134
      },
      "parameters": {
        "values": {
          "ami": "data.aws_ssm_parameter.al2023_ami.value",
          "subnetId": "aws_subnet.private_app_c.id",
          "diagramLabel": "instance3",
          "diagramWidth": 76,
          "instanceType": "t3.micro",
          "diagramHeight": 72,
          "parentAreaNodeId": "app-security-group",
          "vpcSecurityGroupIds": [
            "aws_security_group.app_sg.id"
          ],
          "terraformResourceName": "instance3"
        },
        "fileName": "main",
        "resourceName": "instance3",
        "resourceType": "aws_instance",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "app-egress",
      "kind": "design",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "sketchcatch_service",
      "label": "app_egress",
      "locked": false,
      "zIndex": 104,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Network-Firewall_Endpoints_48.svg",
      "metadata": {
        "parentAreaNodeId": "app-security-group"
      },
      "position": {
        "x": 1492,
        "y": 1179
      }
    },
    {
      "id": "db-subnet-group-frame",
      "kind": "design",
      "size": {
        "width": 291,
        "height": 526
      },
      "type": "sketchcatch_group",
      "label": "db_snet_group",
      "locked": false,
      "zIndex": 3,
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 1657,
        "y": 733
      }
    },
    {
      "id": "private-db-subnet-a",
      "kind": "resource",
      "size": {
        "width": 235,
        "height": 205
      },
      "type": "aws_subnet",
      "label": "Private DB Subnet A",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 4,
      "iconUrl": "/Architecture-Group-Icons_07312025/Private-subnet_32.svg",
      "metadata": {
        "parentAreaNodeId": "db-subnet-group-frame"
      },
      "position": {
        "x": 1699,
        "y": 794
      },
      "parameters": {
        "values": {
          "vpcId": "aws_vpc.vpc.id",
          "cidrBlock": "10.0.20.0/24",
          "diagramWidth": 235,
          "diagramHeight": 205,
          "availabilityZone": "ap-northeast-2a",
          "diagramAreaLabel": "Private DB Subnet A",
          "parentAreaNodeId": "db-subnet-group-frame",
          "mapPublicIpOnLaunch": false,
          "terraformResourceName": "private_db_a"
        },
        "fileName": "main",
        "resourceName": "private_db_a",
        "resourceType": "aws_subnet",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "db-security-group",
      "kind": "resource",
      "size": {
        "width": 190,
        "height": 145
      },
      "type": "aws_security_group",
      "label": "rds_sg",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 5,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Security-Identity-Compliance/64/Arch_AWS-Network-Firewall_64.svg",
      "metadata": {
        "parentAreaNodeId": "private-db-subnet-a"
      },
      "position": {
        "x": 1740,
        "y": 834
      },
      "parameters": {
        "values": {
          "vpcId": "aws_vpc.vpc.id",
          "ingress": [
            {
              "port": 3306,
              "protocol": "tcp",
              "securityGroups": [
                "aws_security_group.app_sg.id"
              ]
            }
          ],
          "diagramWidth": 190,
          "diagramHeight": 145,
          "diagramAreaLabel": "rds_sg",
          "parentAreaNodeId": "private-db-subnet-a",
          "terraformResourceName": "rds_sg"
        },
        "fileName": "main",
        "resourceName": "rds_sg",
        "resourceType": "aws_security_group",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "sg-rule3",
      "kind": "design",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "sketchcatch_service",
      "label": "sg_rule3",
      "locked": false,
      "zIndex": 105,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Network-Firewall_Endpoints_48.svg",
      "metadata": {
        "parentAreaNodeId": "db-security-group"
      },
      "position": {
        "x": 1747,
        "y": 904
      }
    },
    {
      "id": "app-database",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_db_instance",
      "label": "RDS primary",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 105,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Database/64/Arch_Amazon-RDS_64.svg",
      "metadata": {
        "parentAreaNodeId": "db-security-group"
      },
      "position": {
        "x": 1812,
        "y": 904
      },
      "parameters": {
        "values": {
          "dbName": "sketchcatch",
          "engine": "mysql",
          "diagramLabel": "RDS primary",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "engineVersion": "8.0",
          "instanceClass": "db.t4g.micro",
          "subnetGroupName": "aws_db_subnet_group.db_snet_group.name",
          "allocatedStorage": 20,
          "parentAreaNodeId": "db-security-group",
          "publiclyAccessible": false,
          "vpcSecurityGroupIds": [
            "aws_security_group.rds_sg.id"
          ],
          "terraformResourceName": "db"
        },
        "fileName": "main",
        "resourceName": "db",
        "resourceType": "aws_db_instance",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "private-db-subnet-c",
      "kind": "resource",
      "size": {
        "width": 235,
        "height": 175
      },
      "type": "aws_subnet",
      "label": "Private DB Subnet B",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 4,
      "iconUrl": "/Architecture-Group-Icons_07312025/Private-subnet_32.svg",
      "metadata": {
        "parentAreaNodeId": "db-subnet-group-frame"
      },
      "position": {
        "x": 1699,
        "y": 1064
      },
      "parameters": {
        "values": {
          "vpcId": "aws_vpc.vpc.id",
          "cidrBlock": "10.0.21.0/24",
          "diagramWidth": 235,
          "diagramHeight": 175,
          "availabilityZone": "ap-northeast-2c",
          "diagramAreaLabel": "Private DB Subnet B",
          "parentAreaNodeId": "db-subnet-group-frame",
          "mapPublicIpOnLaunch": false,
          "terraformResourceName": "private_db_c"
        },
        "fileName": "main",
        "resourceName": "private_db_c",
        "resourceType": "aws_subnet",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "standby-database",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_db_instance",
      "label": "RDS standby",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 104,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Database/64/Arch_Amazon-RDS_64.svg",
      "metadata": {
        "parentAreaNodeId": "private-db-subnet-c"
      },
      "position": {
        "x": 1812,
        "y": 1149
      },
      "parameters": {
        "values": {
          "engine": "mysql",
          "diagramLabel": "RDS standby",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "instanceClass": "db.t4g.micro",
          "parentAreaNodeId": "private-db-subnet-c",
          "replicateSourceDb": "aws_db_instance.db.identifier",
          "terraformResourceName": "db_standby"
        },
        "fileName": "main",
        "resourceName": "db_standby",
        "resourceType": "aws_db_instance",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "db-route-table",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_route_table",
      "label": "private_db_route_table",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-Route-53_Route-Table_48.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 2022,
        "y": 1014
      },
      "parameters": {
        "values": {
          "vpcId": "aws_vpc.vpc.id",
          "diagramLabel": "private_db_route_table",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "vpc-main",
          "terraformResourceName": "private_db_route_table"
        },
        "fileName": "main",
        "resourceName": "private_db_route_table",
        "resourceType": "aws_route_table",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "private-db-a-label",
      "kind": "design",
      "size": {
        "width": 92,
        "height": 60
      },
      "type": "sketchcatch_service",
      "label": "private_db_a",
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-Route-53_Route-Table_48.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 2022,
        "y": 849
      }
    },
    {
      "id": "private-db-c-label",
      "kind": "design",
      "size": {
        "width": 92,
        "height": 60
      },
      "type": "sketchcatch_service",
      "label": "private_db_c",
      "locked": false,
      "zIndex": 102,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-Route-53_Route-Table_48.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 2022,
        "y": 1169
      }
    },
    {
      "id": "node-mrb8d7zt-732qra",
      "kind": "resource",
      "size": {
        "width": 80,
        "height": 80
      },
      "type": "aws_route",
      "label": "public_default_route",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 106,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-VPC_Router_48.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 576,
        "y": 1032
      },
      "parameters": {
        "values": {},
        "invalid": false,
        "fileName": "main",
        "resourceName": "public_default_route",
        "resourceType": "aws_route",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "node-mrb8f3ld-g8yawo",
      "kind": "resource",
      "size": {
        "width": 74,
        "height": 74
      },
      "type": "aws_route",
      "label": "private_app_a_default_route",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 107,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-VPC_Router_48.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 1104,
        "y": 588
      },
      "parameters": {
        "values": {},
        "invalid": false,
        "fileName": "main",
        "resourceName": "private_app_a_default_route",
        "resourceType": "aws_route",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "node-mrb8gls3-rdjo68",
      "kind": "resource",
      "size": {
        "width": 691,
        "height": 274
      },
      "type": "aws_region",
      "label": "Region",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": -1,
      "iconUrl": "/Architecture-Group-Icons_07312025/Region_32.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 948,
        "y": 756
      },
      "parameters": {
        "values": {
          "awsRegion": "ap-northeast-2"
        },
        "fileName": "main",
        "resourceName": "ap_northeast_2",
        "resourceType": "aws_region"
      }
    },
    {
      "id": "node-mrb8ji31-0wsxf9",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_route_table",
      "label": "public_route_table_copy",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 108,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-Route-53_Route-Table_48.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 720,
        "y": 1032
      },
      "parameters": {
        "values": {
          "route": [
            {
              "cidrBlock": "0.0.0.0/0",
              "gatewayId": "aws_internet_gateway.internet_gw.id"
            }
          ],
          "vpcId": "aws_vpc.vpc.id",
          "diagramLabel": "public_route_table",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "vpc-main",
          "terraformResourceName": "public_route_table"
        },
        "fileName": "main",
        "resourceName": "public_route_table_copy",
        "resourceType": "aws_route_table",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "node-mrb8jix1-l3dzkw",
      "kind": "resource",
      "size": {
        "width": 76,
        "height": 72
      },
      "type": "aws_route_table",
      "label": "public_route_table_copy_2",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 109,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-Route-53_Route-Table_48.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 720,
        "y": 1212
      },
      "parameters": {
        "values": {
          "route": [
            {
              "cidrBlock": "0.0.0.0/0",
              "gatewayId": "aws_internet_gateway.internet_gw.id"
            }
          ],
          "vpcId": "aws_vpc.vpc.id",
          "diagramLabel": "public_route_table",
          "diagramWidth": 76,
          "diagramHeight": 72,
          "parentAreaNodeId": "vpc-main",
          "terraformResourceName": "public_route_table"
        },
        "fileName": "main",
        "resourceName": "public_route_table_copy_2",
        "resourceType": "aws_route_table",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "node-mrb8lb5l-tvyv9l",
      "kind": "resource",
      "size": {
        "width": 691,
        "height": 274
      },
      "type": "aws_region",
      "label": "ap_northeast_2_copy",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 110,
      "iconUrl": "/Architecture-Group-Icons_07312025/Region_32.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 948,
        "y": 1056
      },
      "parameters": {
        "values": {
          "awsRegion": "ap-northeast-2"
        },
        "fileName": "main",
        "resourceName": "ap_northeast_2_copy",
        "resourceType": "aws_region"
      }
    },
    {
      "id": "node-mrb8m4l4-o7101h",
      "kind": "resource",
      "size": {
        "width": 80,
        "height": 80
      },
      "type": "aws_route",
      "label": "private_app_c_default_route",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 111,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-VPC_Router_48.svg",
      "metadata": {
        "parentAreaNodeId": "vpc-main"
      },
      "position": {
        "x": 1068,
        "y": 1320
      },
      "parameters": {
        "values": {},
        "invalid": false,
        "fileName": "main",
        "resourceName": "private_app_c_default_route",
        "resourceType": "aws_route",
        "terraformBlockType": "resource"
      }
    }
  ],
  "viewport": {
    "x": 604.3428459732063,
    "y": 171.42013392661732,
    "zoom": 0.3789291271851596
  }
};
