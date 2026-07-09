data "aws_iam_policy_document" "ecs_task_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "${local.name_prefix}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
  description        = "Execution role for pulling SketchCatch ECS images and writing container logs."
}

data "aws_iam_policy_document" "ecs_execution" {
  statement {
    sid       = "AllowEcrAuthorizationToken"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "AllowPullSketchCatchImages"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer"
    ]
    resources = [for repository in aws_ecr_repository.service : repository.arn]
  }

  statement {
    sid = "AllowWriteContainerLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = [
      for log_group in aws_cloudwatch_log_group.ecs : "${log_group.arn}:*"
    ]
  }

  dynamic "statement" {
    for_each = length(var.api_secret_arns) == 0 ? [] : [1]

    content {
      sid = "AllowReadTaskSecrets"
      actions = [
        "secretsmanager:GetSecretValue",
        "ssm:GetParameters"
      ]
      resources = values(var.api_secret_arns)
    }
  }

  dynamic "statement" {
    for_each = length(var.secret_kms_key_arns) == 0 ? [] : [1]

    content {
      sid       = "AllowDecryptTaskSecrets"
      actions   = ["kms:Decrypt"]
      resources = var.secret_kms_key_arns
    }
  }
}

resource "aws_iam_role_policy" "ecs_execution" {
  name   = "${local.name_prefix}-ecs-execution"
  role   = aws_iam_role.ecs_execution.id
  policy = data.aws_iam_policy_document.ecs_execution.json
}

resource "aws_iam_role" "ecs_task" {
  name               = "${local.name_prefix}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
  description        = "Runtime role for the SketchCatch API container inside the ECS task."
}

data "aws_iam_policy_document" "ecs_task" {
  statement {
    sid = "AllowProjectArtifacts"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject"
    ]
    resources = ["arn:aws:s3:::${var.artifact_bucket_name}/projects/*"]
  }

  statement {
    sid = "AllowDeploymentArtifacts"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:PutObjectTagging"
    ]
    resources = ["arn:aws:s3:::${var.artifact_bucket_name}/deployments/*"]
  }

  statement {
    sid       = "AllowSketchCatchAwsConnectionAssumeRole"
    actions   = ["sts:AssumeRole"]
    resources = var.aws_connection_role_arns
  }

  dynamic "statement" {
    for_each = length(var.bedrock_model_arns) == 0 ? [] : [1]

    content {
      sid       = "AllowConfiguredBedrockModels"
      actions   = ["bedrock:InvokeModel"]
      resources = var.bedrock_model_arns
    }
  }

  dynamic "statement" {
    for_each = length(var.qbusiness_application_arns) == 0 ? [] : [1]

    content {
      sid       = "AllowConfiguredAmazonQApplications"
      actions   = ["qbusiness:ChatSync"]
      resources = var.qbusiness_application_arns
    }
  }
}

resource "aws_iam_role_policy" "ecs_task" {
  name   = "${local.name_prefix}-ecs-task"
  role   = aws_iam_role.ecs_task.id
  policy = data.aws_iam_policy_document.ecs_task.json
}
