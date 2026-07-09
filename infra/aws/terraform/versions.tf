terraform {
  required_version = ">= 1.6.0"

  # Configure with -backend-config in CI/operator runs. Phase 1 only adds
  # definitions; this repository task does not initialize or mutate AWS state.
  backend "s3" {}

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.tags
  }
}
