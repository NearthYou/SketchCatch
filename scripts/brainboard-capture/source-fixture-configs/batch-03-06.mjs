import { defineFixtureBatch, presentation, resource } from "./define-config.mjs";

export const fixtures = defineFixtureBatch([
  {
    rank: 3,
    captureFileName: "aws-vpc-subnets-security-groups-2az.json",
    outputFileName: "aws-vpc-subnets-security-groups-2az.ts",
    exportName: "awsVpcSubnetsSecurityGroups2azSource",
    bindings: {
      "c04395a7-7955-4329-8709-f8b44efa1c63": presentation("aws-region"),
      "9c59c668-cb0a-4287-9087-1de1045fcb1b": resource("aws_vpc.vpc", "main.tf", "exact-title"),
      "20c1e4c2-a928-42a3-901a-121551b1f07f": presentation("aws-availability-zone"),
      "bc1b025f-86b0-4df7-8405-29f7eba77ced": presentation("aws-availability-zone"),
      "0c447118-80a7-4c77-8f95-fd3b24c1e6b5": resource("aws_subnet.private_snet_a", "main.tf", "reviewed-override"),
      "7e83f2a2-2457-44da-a0d4-1a2bc608f345": resource("aws_subnet.public_snet_a", "main.tf", "reviewed-override"),
      "8fd53908-23f1-4273-807e-e411dc2ea765": resource("aws_subnet.snet4", "main.tf", "reviewed-override"),
      "9b86c789-0127-44b3-948b-30ebb28037bb": resource("aws_subnet.snet3", "main.tf", "reviewed-override"),
      "2b3e06b2-3efa-41da-8190-8c81c6d4f348": resource("aws_security_group.sg", "main.tf", "exact-title"),
      "8a050109-a5cd-47b0-9642-47e0e1883e9c": resource("aws_security_group.sg2", "main.tf", "exact-title"),
      "dab3e0f4-ca73-4759-985b-b2bb84bce2f3": presentation("design-user-client"),
      "2bc95caf-a0bb-4685-9dae-7d75f194eeec": resource("aws_route_table.rt", "main.tf", "single-residual"),
      "3adee551-ee50-4677-8522-b9a993879e9f": resource("aws_internet_gateway.internet_gw", "main.tf", "single-residual"),
      "5174b7c6-a695-4aa6-9bec-37eb301fe69e": resource("aws_eip.eip", "main.tf", "reviewed-override"),
      "c11cf78b-2d86-4665-b1ef-999b2b91594f": resource("aws_eip.eip2", "main.tf", "reviewed-override"),
      "3fa3abcc-3366-4d29-a95d-a1848a4d07f6": resource("aws_route_table_association.rt_association2", "main.tf", "reviewed-override"),
      "4bab5c05-8edd-4533-a61a-8d2c2f8ac570": resource("aws_route_table_association.rt_association", "main.tf", "reviewed-override"),
      "56cdee29-d69c-46f1-860c-478c80ab361b": resource("aws_network_acl.network_acl2", "main.tf", "reviewed-override"),
      "90bf2724-6fb1-4e87-bb8d-36d492603b71": resource("aws_nat_gateway.nat_gw2", "main.tf", "reviewed-override"),
      "a3af7c5b-b9b8-44a8-bf85-e3098cadb82b": resource("aws_nat_gateway.nat_gw", "main.tf", "reviewed-override"),
      "ab9cd657-4f34-49a7-9c75-174de1e73de2": resource("aws_network_acl.network_acl", "main.tf", "reviewed-override")
    },
    workspaceOmissions: {
      "variables.tf": ['    archuuid = "a9b3f02c-a950-4153-92d2-47905dd8ffd3"\n']
    }
  },
  {
    rank: 4,
    captureFileName: "aws-serverless-cdn.json",
    outputFileName: "aws-serverless-cdn.ts",
    exportName: "awsServerlessCdnSource",
    bindings: {
      "a7275a97-1cba-448c-b797-76cf925ac3d5": presentation("aws-region"),
      "04926feb-4622-439a-b228-cfc9e415e98e": resource("aws_apigatewayv2_api.apigwv2_api", "main.tf", "exact-title"),
      "0c2d3032-4148-4e80-bae8-9cfb63f6ec6e": resource("aws_route53_record.www", "main.tf", "exact-title"),
      "372d8cce-6e53-4d81-a7d5-5337d826b75b": resource("aws_s3_bucket.website_bucket", "main.tf", "exact-title"),
      "3afa58d4-2389-47e3-af6d-197aa176ca4a": resource("aws_s3_bucket_versioning.s3_bucket_versioning", "main.tf", "exact-title"),
      "3e80ddec-93fc-4732-8e32-ec2d48a5956f": resource("aws_cognito_user_pool.cognito_user_pool", "main.tf", "exact-title"),
      "46b1dd16-edd2-49f2-b3b6-b228d6838314": resource("aws_iam_role.iam_role", "main.tf", "exact-title"),
      "48e4d8e3-8e35-4e2b-9d9a-3bd6309ce560": resource("aws_lambda_function.lambda_function", "main.tf", "exact-title"),
      "58851a9c-d1ed-4576-8636-e8c2de255585": resource("aws_s3_bucket.public_content", "main.tf", "exact-title"),
      "913fcb3c-08dd-487b-9f34-7a0e3aded6b6": resource("aws_dynamodb_global_table.dynamodb_global_table", "main.tf", "exact-title"),
      "96f0a15e-0305-405a-b9e9-eee46aed63e0": resource("aws_s3_object.error", "main.tf", "exact-title"),
      "97ab46f5-02c0-4d3e-8d23-73e7cf4d9936": resource("aws_route53_zone.route53_zone", "main.tf", "exact-title"),
      "9c5f4598-f184-4890-bdd0-1899be4e8cf7": resource("aws_s3_object.index", "main.tf", "exact-title"),
      "a9812863-e435-4e22-8ead-21024b258441": resource("aws_cloudfront_distribution.website_distribution", "main.tf", "exact-title"),
      "b90b246d-aeeb-4e30-aa60-7929ecace81d": resource("aws_ses_email_identity.ses_email_identity", "main.tf", "exact-title"),
      "ceb49680-3cb4-41d8-9e9d-34f674391bb4": resource("aws_lambda_function.lambda_function3", "main.tf", "exact-title"),
      "d0fc5fc8-4e65-463c-96a9-abb6c4abd050": resource("aws_cloudfront_origin_access_identity.origin_access_identity", "main.tf", "exact-title"),
      "ddbce9f8-63fd-43a9-a133-86dda6fed0e9": resource("aws_s3_bucket_website_configuration.s3_bucket_website_configuration", "main.tf", "exact-title"),
      "e608c4e1-a9bf-4675-be19-e67f7bde4f98": resource("aws_s3_bucket_acl.s3_bucket_acl", "main.tf", "exact-title"),
      "ed57ef8a-ac66-4a30-a586-09a0f3c4406a": resource("aws_lambda_function.lambda_function2", "main.tf", "exact-title"),
      "675bd894-0771-422e-947d-b7c25fad993f": presentation("design-user-client")
    },
    workspaceOmissions: {
      "variables.tf": ['    archuuid = "45191152-00cd-443d-a7f5-9a7295120e48"\n']
    }
  },
  {
    rank: 5,
    captureFileName: "aws-ec2-vpc-subnet.json",
    outputFileName: "aws-ec2-vpc-subnet.ts",
    exportName: "awsEc2VpcSubnetSource",
    bindings: {
      "411a1488-c6f1-4708-be6c-91844746b580": presentation("aws-region"),
      "3704567b-d0d1-49f3-9215-bf83a1df977a": resource("aws_vpc.vpc", "main.tf", "exact-title"),
      "818d32cf-1a97-4f1c-8f60-92faf5dc7c0e": presentation("aws-availability-zone"),
      "8c044337-0d96-4095-b3a4-89d844d1c129": resource("aws_subnet.snet", "main.tf", "exact-title"),
      "4a830da1-bf0a-4bfe-8cd4-2c0c595869bf": presentation(null),
      "8fbaeef4-cb2d-473e-8885-2b1fb5161e59": resource("aws_instance.vm", "main.tf", "single-residual"),
      "f6a2e88c-0606-4841-8438-05473a0719d3": resource("aws_network_interface.default", "main.tf", "single-residual")
    },
    workspaceOmissions: {
      "variables.tf": ['    archuuid = "9009bff8-8177-4022-ad39-6035ad4acd05"\n']
    }
  },
  {
    rank: 6,
    captureFileName: "aws-asg-load-balancer-vpc.json",
    outputFileName: "aws-asg-load-balancer-vpc.ts",
    exportName: "awsAsgLoadBalancerVpcSource",
    bindings: {
      "c8302f50-a584-4e73-bf3f-efca40fae066": presentation("aws-region"),
      "4ccb83f3-67ac-497f-bcfd-4ce5691f8e73": presentation("aws-availability-zone"),
      "f5024a0a-d5e3-4403-a70f-d07a5402a90c": resource("aws_vpc.vpc", "main.tf", "exact-title"),
      "8720b1c9-ad44-42e7-a8f2-aa43ebee2449": presentation("aws-availability-zone"),
      "af851fdf-0467-46fb-a990-ae069729728c": resource("aws_subnet.snet2", "main.tf", "exact-title"),
      "dedbf41c-255d-4b77-b246-a9ba0de7d9fe": resource("aws_security_group.default", "main.tf", "exact-title"),
      "a514bd55-a14d-45a0-a047-4220529bd4e2": resource("aws_security_group.ec2", "main.tf", "exact-title"),
      "cd499b89-a918-4f50-a93a-2b865f961e60": resource("aws_launch_configuration.default", "main.tf", "exact-title"),
      "d75efaba-a405-4bf0-9cf0-929116e2c267": resource("aws_autoscaling_group.web", "main.tf", "exact-title"),
      "ff98d607-abd3-49b8-bf7f-f5dae753e5c8": resource("aws_subnet.snet", "main.tf", "exact-title"),
      "478775af-5d74-4733-9750-fbe7e051cdcb": resource("aws_internet_gateway.internet_gw", "main.tf", "exact-title"),
      "739e74c1-d7e8-4318-879c-d8551ead85da": resource("aws_route_table.rt", "main.tf", "exact-title"),
      "d67cbec1-5217-44ea-95e8-93c2bae28504": resource("aws_elb.clb_9", "main.tf", "exact-title"),
      "30a33276-f2ed-4578-90f4-3fd2ee58da38": resource("aws_route_table_association.rt_association", "main.tf", "exact-title"),
      "779fbe96-abee-444a-be06-a8e7647cefab": resource("aws_cloudwatch_metric_alarm.web_cpu_alarm_up", "main.tf", "reviewed-override"),
      "859e7225-86d1-4b45-a900-ecfbb9e2a60b": resource("aws_cloudwatch_metric_alarm.web_cpu_alarm_down", "main.tf", "reviewed-override"),
      "a4eeb4d5-0d6c-44fe-9dd7-2fec572dc954": resource("aws_autoscaling_policy.default", "main.tf", "reviewed-override"),
      "c7a4f916-1ccf-4d20-a6db-bd672f5aebe2": resource("aws_autoscaling_policy.web_policy_down", "main.tf", "reviewed-override"),
      "e2bbe386-707f-478f-8d80-25a84ae7df25": resource("aws_route_table_association.rt_association2", "main.tf", "exact-title")
    },
    workspaceOmissions: {
      "variables.tf": ['    archuuid = "f161f840-d697-4651-aa8d-6ec05b981a79"\n']
    }
  }
]);
