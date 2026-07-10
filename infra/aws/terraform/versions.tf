terraform {
  required_version = ">= 1.10.0"

  # Keep backend values in reviewed partial configuration files. Phase 9 preserves
  # the existing runtime key and uses native S3 lockfiles in remote runs.
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
