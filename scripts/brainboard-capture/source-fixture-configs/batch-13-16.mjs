import { defineFixtureBatch, presentation, resource } from "./define-config.mjs";

export const fixtures = defineFixtureBatch([
  {
    rank: 13,
    captureFileName: "aws-load-balancer-target-group.json",
    outputFileName: "aws-load-balancer-target-group.ts",
    exportName: "awsLoadBalancerTargetGroupSource",
    bindings: {
      "c52a1a71-178d-4ae7-90bf-28a69b7d20a9": presentation("aws-region"),
      "595f9ca1-9786-4270-a86e-f584fd0dd78b": resource("aws_vpc.default", "main.tf", "exact-title"),
      "c62807d5-e1bf-450d-a78e-bd44c7911496": resource(
        "aws_security_group.sg",
        "main.tf",
        "exact-title"
      ),
      "cb5d901c-6f13-45b6-8c28-708389c20c56": presentation("aws-availability-zone"),
      "d5d05b1a-2611-4237-b99e-7e67ad204bcb": presentation("aws-availability-zone"),
      "e275ea03-fd95-411d-bf68-9beda7afa0a5": resource(
        "aws_subnet.default",
        "main.tf",
        "exact-title"
      ),
      "71f7a4a8-0f10-4c27-ab01-6feb1e6279b4": resource(
        "aws_subnet.subnet2",
        "main.tf",
        "exact-title"
      ),
      "9976bc88-df75-470c-8d22-b9d110e98a1c": resource(
        "aws_lb_listener.lb_listner",
        "main.tf",
        "single-residual"
      ),
      "b06847a7-437a-4d11-b271-28a83e9ff1c0": resource(
        "aws_lb_target_group.aws_lb_target_group_8",
        "main.tf",
        "single-residual"
      ),
      "048a3f38-9205-4ca7-b6fa-5f37ce90c75f": resource(
        "aws_instance.t3a_9",
        "main.tf",
        "exact-title"
      ),
      "f18c57e0-c9a1-45c1-83f4-03b84924b7c8": resource(
        "aws_lb_target_group_attachment.aws_lb_target_group_attachment_10",
        "main.tf",
        "single-residual"
      ),
      "3548540e-5692-4cc2-914b-11b77e43085d": resource("aws_lb.alb", "main.tf", "exact-title"),
      "4882367c-117c-4af0-9957-4d6d466d7658": resource(
        "aws_internet_gateway.aws_internet_gateway_12",
        "main.tf",
        "exact-title"
      )
    },
    workspaceOmissions: {
      "variables.tf": ['    archuuid = "85dda071-ea16-4cbc-9d77-7cebe6ebaadd"\n']
    }
  },
  {
    rank: 14,
    captureFileName: "aws-s3-api-gateway.json",
    outputFileName: "aws-s3-api-gateway.ts",
    exportName: "awsS3ApiGatewaySource",
    bindings: {
      "a2125cbe-8cfa-4842-a527-7f042330455b": presentation("aws-region"),
      "f51e7972-ab44-48f6-a7e3-9cb720aa0c51": resource(
        "aws_iam_policy.s3_policy",
        "main.tf",
        "single-residual"
      ),
      "8cfad4ae-9882-4ba7-a0d7-1dbe9defb4f7": resource(
        "aws_iam_role.s3_api_gateyway_role",
        "main.tf",
        "single-residual"
      ),
      "4dfe1d77-191d-4f82-94f4-153e22afac77": resource(
        "aws_iam_role_policy_attachment.s3_policy_attach",
        "main.tf",
        "single-residual"
      ),
      "208ba11f-9da2-4fbf-8748-3fdbaddee037": resource(
        "aws_api_gateway_rest_api.s3_gtw",
        "main.tf",
        "single-residual"
      ),
      "d7f660ea-c9a7-4269-9a78-047de51122c5": resource(
        "aws_api_gateway_resource.folder",
        "main.tf",
        "reviewed-override"
      ),
      "5d9d4b38-323c-4029-b582-1ab3e2875f5e": resource(
        "aws_api_gateway_resource.item",
        "main.tf",
        "reviewed-override"
      ),
      "75347de7-6fdd-43eb-affc-adda7651310c": resource(
        "aws_api_gateway_method.GetBuckets",
        "main.tf",
        "single-residual"
      ),
      "5e8966bc-bff7-49f0-889c-7570aa6ff7ec": resource(
        "aws_api_gateway_method_response.Status200",
        "main.tf",
        "reviewed-override"
      ),
      "18c510a5-9ff3-4248-a32d-7172fdb43a77": resource(
        "aws_api_gateway_method_response.Status400",
        "main.tf",
        "reviewed-override"
      ),
      "ef9e666e-bd66-40f8-b84a-0fd40902e25c": resource(
        "aws_api_gateway_integration_response.IntegrationResponse400",
        "main.tf",
        "reviewed-override"
      ),
      "fb45b084-8383-4a40-bddb-78957f701b33": resource(
        "aws_api_gateway_integration_response.IntegrationResponse500",
        "main.tf",
        "reviewed-override"
      ),
      "b7ca82da-ac8a-45c3-b72b-f47f1eb5b83e": resource(
        "aws_api_gateway_deployment.S3APIDeployment",
        "main.tf",
        "single-residual"
      ),
      "91ca7d35-8b99-47be-83c9-952aa6c46c46": resource(
        "aws_api_gateway_integration.S3Integration",
        "main.tf",
        "single-residual"
      ),
      "aa4a3412-93c5-49e6-891b-37102ca3f8b2": resource(
        "aws_api_gateway_method_response.Status500",
        "main.tf",
        "reviewed-override"
      ),
      "b93e0c77-0069-4893-a2ce-c5635c99d530": resource(
        "aws_api_gateway_integration_response.IntegrationResponse200",
        "main.tf",
        "reviewed-override"
      )
    },
    workspaceOmissions: {
      "main.tf": ['    archUUID = "682c2db8-5d36-4383-b248-cb2142e2b6fb"\n'],
      "variables.tf": ['    archuuid = "73327761-bb6a-4516-92e5-f06007e372ec"\n']
    }
  },
  {
    rank: 15,
    captureFileName: "aws-cost-monitoring.json",
    outputFileName: "aws-cost-monitoring.ts",
    exportName: "awsCostMonitoringSource",
    bindings: {
      "0d74f9f8-6756-42e7-81e7-795b61a33519": presentation("aws-region"),
      "40a8b4ea-aefa-4353-a717-96958029031e": resource(
        "aws_budgets_budget.monthly",
        "main.tf",
        "reviewed-override"
      ),
      "cbaf89e8-4fb7-45c6-8b27-dd90bca3a555": resource(
        "aws_budgets_budget.ec2",
        "main.tf",
        "reviewed-override"
      ),
      "1943248e-7456-4588-a76b-1b8a92a5522c": resource(
        "aws_budgets_budget.s3",
        "main.tf",
        "reviewed-override"
      ),
      "821379fd-a325-4e2e-a3bb-565d3dcea13d": resource(
        "aws_budgets_budget.ri_utilization",
        "main.tf",
        "reviewed-override"
      )
    },
    workspaceOmissions: {
      "variables.tf": ['    archuuid = "6e651e34-318d-41e2-b229-86d30aa0520f"\n']
    }
  },
  {
    rank: 16,
    captureFileName: "aws-ecs-fargate.json",
    outputFileName: "aws-ecs-fargate.ts",
    exportName: "awsEcsFargateSource",
    bindings: {
      "5ba31e54-d954-4cba-a521-3f11291d0ed7": presentation("aws-region"),
      "162f4029-6160-4b56-80d0-e6de1b294c83": resource(
        "aws_vpc.ecs_vpc",
        "fargate.tf",
        "single-residual"
      ),
      "1eca88fe-e8bd-4240-856e-92e7187e1114": resource(
        "aws_security_group.ecs_security_group",
        "fargate.tf",
        "exact-title"
      ),
      "5b67f9b3-34fa-4d25-9451-471ad56e4291": resource(
        "aws_subnet.default",
        "fargate.tf",
        "exact-title"
      ),
      "5a76bfb2-b71d-4cbc-919e-3611a1b70e1e": resource(
        "aws_ecs_task_definition.ecs_task_definition",
        "fargate.tf",
        "exact-title"
      ),
      "aedad806-5d41-458e-82d0-58daac33cc37": resource(
        "aws_iam_role.ecs_task_role",
        "fargate.tf",
        "exact-title"
      ),
      "f005a130-edd2-4747-8956-e1d409272c67": resource(
        "aws_iam_role_policy_attachment.ecs_task_role_attachment",
        "fargate.tf",
        "exact-title"
      ),
      "2eb5aa4e-4e9a-4d27-ae3a-3b10469e02a1": resource(
        "aws_ecs_cluster.ecs_cluster",
        "fargate.tf",
        "exact-title"
      ),
      "fef60bd4-81d1-4069-a6bd-01727d5903e4": resource(
        "aws_internet_gateway.ecs_vpc_igw",
        "fargate.tf",
        "exact-title"
      ),
      "fd1b2a28-24e2-4d3e-a14d-6560424de9bd": resource(
        "aws_ecs_service.default",
        "main.tf",
        "exact-title"
      )
    },
    workspaceOmissions: {
      "variables.tf": ['    archuuid = "18b7b40a-8493-4ebb-ad21-0eb85f6ae257"\n']
    }
  }
]);
