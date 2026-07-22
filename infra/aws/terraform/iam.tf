data "aws_caller_identity" "current" {}

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

resource "aws_iam_role" "ecs_web_task" {
  name               = "${local.name_prefix}-ecs-web-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
  description        = "Permissionless task role for the public web service."
}

data "aws_iam_policy_document" "ecs_task" {
  statement {
    sid = "AllowProjectArtifacts"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:DeleteObjectVersion"
    ]
    resources = ["arn:aws:s3:::${var.artifact_bucket_name}/projects/*"]
  }

  statement {
    sid = "AllowDeploymentArtifacts"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:DeleteObject",
      "s3:DeleteObjectVersion",
      "s3:ListMultipartUploadParts",
      "s3:AbortMultipartUpload",
      "s3:PutObjectTagging",
      "s3:PutObjectVersionTagging"
    ]
    resources = ["arn:aws:s3:::${var.artifact_bucket_name}/deployments/*"]
  }

  statement {
    sid       = "ListProjectArtifactVersions"
    actions   = ["s3:ListBucketVersions"]
    resources = ["arn:aws:s3:::${var.artifact_bucket_name}"]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values = [
        "projects/*",
        "deployments/*"
      ]
    }
  }

  statement {
    sid = "AllowAwsConnectionCloudFormationTemplates"
    actions = [
      "s3:PutObject",
      "s3:GetObject"
    ]
    resources = ["arn:aws:s3:::${var.artifact_bucket_name}/aws-connections/*"]
  }

  statement {
    sid       = "AllowSketchCatchAwsConnectionAssumeRole"
    actions   = ["sts:AssumeRole"]
    resources = var.aws_connection_role_arns
  }

  statement {
    sid       = "RunWorkerTask"
    actions   = ["ecs:RunTask"]
    resources = ["${aws_ecs_task_definition.worker.arn_without_revision}:*"]

    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [aws_ecs_cluster.main.arn]
    }
  }

  statement {
    sid = "ManageWorkerTask"
    actions = [
      "ecs:DescribeTasks",
      "ecs:StopTask"
    ]
    resources = [
      "arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:task/${aws_ecs_cluster.main.name}/*"
    ]

    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [aws_ecs_cluster.main.arn]
    }
  }

  statement {
    sid       = "TagWorkerTaskOnRun"
    actions   = ["ecs:TagResource"]
    resources = ["arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:task/${aws_ecs_cluster.main.name}/*"]

    condition {
      test     = "StringEquals"
      variable = "ecs:CreateAction"
      values   = ["RunTask"]
    }
  }

  statement {
    sid     = "PassWorkerTaskRoles"
    actions = ["iam:PassRole"]
    resources = [
      aws_iam_role.ecs_worker_execution.arn,
      aws_iam_role.ecs_worker_task.arn
    ]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
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

resource "aws_iam_role" "ecs_worker_execution" {
  name               = "${local.name_prefix}-ecs-worker-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
  description        = "Execution role for one-off Terraform worker image pulls, logs, and worker secrets."
}

data "aws_iam_policy_document" "ecs_worker_execution" {
  statement {
    sid       = "AllowEcrAuthorizationToken"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "AllowPullWorkerImage"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer"
    ]
    resources = [aws_ecr_repository.service["api"].arn]
  }

  statement {
    sid = "AllowWriteWorkerLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = ["${aws_cloudwatch_log_group.ecs["worker"].arn}:*"]
  }

  dynamic "statement" {
    for_each = length(local.worker_secret_arns) == 0 ? [] : [1]

    content {
      sid = "AllowReadWorkerSecrets"
      actions = [
        "secretsmanager:GetSecretValue",
        "ssm:GetParameters"
      ]
      resources = values(local.worker_secret_arns)
    }
  }

  dynamic "statement" {
    for_each = length(var.secret_kms_key_arns) == 0 ? [] : [1]

    content {
      sid       = "AllowDecryptWorkerSecrets"
      actions   = ["kms:Decrypt"]
      resources = var.secret_kms_key_arns
    }
  }
}

resource "aws_iam_role_policy" "ecs_worker_execution" {
  name   = "${local.name_prefix}-ecs-worker-execution"
  role   = aws_iam_role.ecs_worker_execution.id
  policy = data.aws_iam_policy_document.ecs_worker_execution.json
}

resource "aws_iam_role" "ecs_worker_task" {
  name               = "${local.name_prefix}-ecs-worker-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
  description        = "Dedicated runtime role for one-off Terraform and Trivy worker tasks."
}

data "aws_iam_policy_document" "ecs_worker_task" {
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
      "s3:GetObjectVersion",
      "s3:DeleteObject",
      "s3:DeleteObjectVersion",
      "s3:ListMultipartUploadParts",
      "s3:AbortMultipartUpload",
      "s3:PutObjectTagging",
      "s3:PutObjectVersionTagging"
    ]
    resources = ["arn:aws:s3:::${var.artifact_bucket_name}/deployments/*"]
  }

  statement {
    sid       = "AllowSketchCatchAwsConnectionAssumeRole"
    actions   = ["sts:AssumeRole"]
    resources = var.aws_connection_role_arns
  }
}

resource "aws_iam_role_policy" "ecs_worker_task" {
  name   = "${local.name_prefix}-ecs-worker-task"
  role   = aws_iam_role.ecs_worker_task.id
  policy = data.aws_iam_policy_document.ecs_worker_task.json
}
