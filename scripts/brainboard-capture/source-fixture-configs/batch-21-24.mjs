import { defineFixtureBatch, presentation, resource } from "./define-config.mjs";

export const fixtures = defineFixtureBatch([
  {
    rank: 21,
    captureFileName: "cross-account-aws-s3.json",
    outputFileName: "cross-account-aws-s3.ts",
    exportName: "crossAccountAwsS3Source",
    bindings: {
      "0f0bd504-1e5b-4eb7-b82b-c34e5673d088": presentation("aws-region"),
      "abd36fbe-31bb-4fe3-b43e-9e77644f51b5": presentation(null),
      "6e055294-83c2-4d44-beac-e292b11dcb50": presentation(null),
      "5418dbae-f0eb-4864-8a8e-a9897008c92a": resource(
        "aws_s3_bucket.bucket_prod",
        "main.tf",
        "single-residual"
      ),
      "d1f9a61d-3dd0-4c39-bcca-83356b94db6c": presentation(null),
      "0ff5c7a0-b03e-4e19-acc7-8c089bb7f92e": resource(
        "aws_s3_bucket_object.s3_object_prod_c",
        "main.tf",
        "reviewed-override"
      ),
      "8b881706-f98a-48f1-9995-abf026d7768a": resource(
        "aws_s3_bucket_object.s3_object_prod",
        "main.tf",
        "reviewed-override"
      ),
      "9b321598-8cb3-4d4f-9305-39e31c71f1e7": presentation(null)
    },
    workspaceOmissions: {
      "variables.tf": ['    archuuid = "6e3d35f1-eeb7-4015-9814-c3959928a3ac"\n']
    }
  },
  {
    rank: 22,
    captureFileName: "aws-iam-users.json",
    outputFileName: "aws-iam-users.ts",
    exportName: "awsIamUsersSource",
    bindings: {
      "89087529-31fb-4b85-abed-3418eee9a00f": presentation("design-group"),
      "fc0d1fe3-09ac-4ee4-a83f-c04900b17d19": presentation("design-group"),
      "1c28c7ec-2e94-4ac1-95ed-09370ec23e35": resource(
        "aws_iam_group.default",
        "main.tf",
        "single-residual"
      ),
      "38a919c0-d6ae-430e-ba56-5a42ddda95d4": resource(
        "aws_iam_policy.mfa",
        "main.tf",
        "exact-title"
      ),
      "8f00e827-caf6-40fd-9677-c8484b42f94c": resource(
        "aws_iam_group_policy_attachment.iam_group_policy_attachment_13_c_c",
        "main.tf",
        "exact-title"
      ),
      "b1fc8d2d-aa45-40dd-b38c-780b160f02e2": resource(
        "data.aws_iam_policy.change_password",
        "main.tf",
        "single-residual"
      ),
      "f1b74bf3-c510-4da8-baaa-d199ffaa6267": resource(
        "aws_iam_group_policy_attachment.default",
        "main.tf",
        "exact-title"
      ),
      "76efa2d0-4ef5-414c-af9b-7e5467b8adb1": resource(
        "aws_iam_user.users",
        "main.tf",
        "exact-title"
      ),
      "b80b763b-bc6e-47c3-bdbd-ac5fe8bf37f7": resource(
        "aws_iam_user_group_membership.default",
        "main.tf",
        "exact-title"
      ),
      "f851591c-6a06-4091-874b-a9a3acce7c18": resource(
        "aws_iam_user_login_profile.default",
        "main.tf",
        "exact-title"
      )
    },
    workspaceOmissions: {
      "variables.tf": ['    archuuid = "46009873-0596-40b3-bcf4-b466428c54b4"\n']
    }
  },
  {
    rank: 23,
    captureFileName: "aws-dashcam-video-processing.json",
    outputFileName: "aws-dashcam-video-processing.ts",
    exportName: "awsDashcamVideoProcessingSource",
    bindings: {
      "bc43454e-5410-4f46-9610-6622c8820e40": presentation("aws-region"),
      "13f9d1bb-7e57-4f23-a141-d99ebc4d39e2": resource(
        "aws_ecs_cluster.video_processing_cluster",
        "main.tf",
        "exact-title"
      ),
      "2076baeb-dbf8-463d-bb50-7ec9b5d259b9": resource(
        "aws_s3_bucket.output_bucket",
        "main.tf",
        "exact-title"
      ),
      "23f9af50-c989-4d73-ac79-fbae47e10c04": resource(
        "aws_cloudfront_distribution.video_distribution",
        "main.tf",
        "exact-title"
      ),
      "30b41b95-ecec-400f-95b4-d47d7debfcea": resource(
        "aws_api_gateway_resource.video_resource",
        "main.tf",
        "exact-title"
      ),
      "32b37e79-d0da-4ea7-88c6-2c8789b455ce": resource(
        "aws_s3_bucket.video_bucket",
        "main.tf",
        "exact-title"
      ),
      "3b240358-1a05-4628-a2e8-be852cdbf846": resource(
        "aws_iam_role_policy_attachment.lambda_policy",
        "main.tf",
        "exact-title"
      ),
      "5069c2b1-c725-4588-8c24-bb96be01ffd9": resource(
        "aws_ecs_task_definition.video_task",
        "main.tf",
        "exact-title"
      ),
      "50a96af0-1d2d-46fd-a526-01a847c44613": resource(
        "aws_ecs_service.video_service",
        "main.tf",
        "exact-title"
      ),
      "6c4d1286-6d25-4835-8637-4d392c54de45": resource(
        "aws_api_gateway_integration.video_integration",
        "main.tf",
        "exact-title"
      ),
      "9ea9ad58-0146-4a72-b2bb-a08d51f00503": resource(
        "aws_api_gateway_method.video_method",
        "main.tf",
        "exact-title"
      ),
      "be541b7f-676c-46ae-992e-e7f31d3baf48": resource(
        "aws_lambda_function.video_processor",
        "main.tf",
        "exact-title"
      ),
      "cc70890f-c0f2-4f54-bf31-4017ea652dc6": resource(
        "aws_api_gateway_rest_api.video_api",
        "main.tf",
        "exact-title"
      ),
      "ecf5cf0b-9489-429e-a6a3-3db886ef26cb": resource(
        "aws_sqs_queue.video_queue",
        "main.tf",
        "exact-title"
      ),
      "f7a66538-185b-4023-ad8a-0d84ad5d2842": resource(
        "aws_iam_role.lambda_exec",
        "main.tf",
        "exact-title"
      )
    },
    workspaceOmissions: {}
  },
  {
    rank: 24,
    captureFileName: "aws-secure-s3-bucket.json",
    outputFileName: "aws-secure-s3-bucket.ts",
    exportName: "awsSecureS3BucketSource",
    bindings: {
      "d688c36c-abf5-43d6-8c47-15e8b5911a50": presentation("aws-region"),
      "06c1d1a2-a280-419f-95a3-7e3cda0c3330": resource(
        "aws_s3_bucket.s3_bucket",
        "s3_bucket.tf",
        "exact-title"
      ),
      "262e64a9-86bc-4bc5-b7e1-82e26ddedb06": resource(
        "aws_s3_bucket_notification.s3_bucket_notification",
        "s3_bucket.tf",
        "exact-title"
      ),
      "2bad56b6-e6ee-4248-9659-56171ccca61c": resource(
        "aws_s3_bucket_lifecycle_configuration.s3_bucket_lifecycle_configuration",
        "s3_bucket.tf",
        "single-residual"
      ),
      "4940107a-b41a-4e29-b53b-5618978ed6c3": resource(
        "aws_s3_bucket_versioning.s3_bucket_versioning",
        "s3_bucket.tf",
        "single-residual"
      ),
      "6d669ff4-d4d1-44a6-b483-d16ca60e815a": resource(
        "aws_s3_bucket_server_side_encryption_configuration.s3_bucket_server_side_encryption_configuration",
        "s3_bucket.tf",
        "single-residual"
      ),
      "c636c16f-3b4a-4e46-bff2-70462f108900": resource(
        "aws_s3_bucket_public_access_block.s3_bucket_public_access_block",
        "s3_bucket.tf",
        "single-residual"
      ),
      "e06758f9-5a60-4934-8ac3-af746693a4a9": resource(
        "aws_sns_topic.sns_topic",
        "s3_bucket.tf",
        "exact-title"
      ),
      "e4f7100a-1573-46ab-96db-116709afa0e8": resource(
        "aws_s3_bucket_acl.s3_bucket_acl",
        "main.tf",
        "exact-title"
      ),
      "ef48c7ff-a34a-49fb-94fd-ea9c35cedc11": resource(
        "aws_s3_bucket_replication_configuration.replication_configuration",
        "s3_bucket.tf",
        "single-residual"
      ),
      "f079d191-2684-4c89-8e19-370d63c1d764": resource(
        "aws_iam_role.iam_role",
        "s3_bucket.tf",
        "exact-title"
      ),
      "fa1b482b-0830-4610-a6ac-086a532b1f3f": resource(
        "aws_s3_bucket_logging.s3_bucket_logging",
        "s3_bucket.tf",
        "single-residual"
      )
    },
    workspaceOmissions: {}
  }
]);
