import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeGeneratedTerraformFiles } from "./terraform-panel-utils";

test("provider generation does not add providers.tf when the existing module declares required_providers", () => {
  const existingFiles = [
    {
      fileName: "main.tf",
      code: `terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

resource "aws_s3_bucket" "assets" {}`
    }
  ];
  const generatedFiles = [
    {
      fileName: "providers.tf",
      code: `terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}`
    },
    {
      fileName: "main.tf",
      code: `resource "aws_s3_bucket" "assets" {}`
    }
  ];

  const result = mergeGeneratedTerraformFiles(existingFiles, generatedFiles, new Set());

  assert.deepEqual(result.map((file) => file.fileName), ["main.tf"]);
  assert.equal(result[0]?.code.match(/required_providers/g)?.length, 1);
});

test("provider refresh merges Kubernetes requirements and keeps EKS runtime provider blocks", () => {
  const existingFiles = [
    {
      fileName: "providers.tf",
      code: `terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}`
    }
  ];
  const generatedFiles = [
    {
      fileName: "providers.tf",
      code: `terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
  }
}

data "aws_eks_cluster_auth" "sketchcatch" {
  name = aws_eks_cluster.main.name
}

provider "kubernetes" {
  host  = aws_eks_cluster.main.endpoint
  token = data.aws_eks_cluster_auth.sketchcatch.token
}`
    }
  ];

  const result = mergeGeneratedTerraformFiles(existingFiles, generatedFiles, new Set());
  const providerCode = result.find((file) => file.fileName === "providers.tf")?.code ?? "";

  assert.equal(providerCode.match(/required_providers/g)?.length, 1);
  assert.match(providerCode, /kubernetes\s*=\s*\{/);
  assert.match(providerCode, /data "aws_eks_cluster_auth" "sketchcatch"/);
  assert.match(providerCode, /provider "kubernetes"/);
});

test("provider refresh preserves a user-owned default Kubernetes provider", () => {
  const existingFiles = [
    {
      fileName: "providers.tf",
      code: `terraform {
  required_providers {
    kubernetes = { source = "hashicorp/kubernetes" }
  }
}

provider "kubernetes" {
  config_path = "/custom/kubeconfig"
}`
    }
  ];
  const generatedFiles = [
    {
      fileName: "providers.tf",
      code: `terraform {
  required_providers {
    kubernetes = { source = "hashicorp/kubernetes" }
  }
}

provider "kubernetes" {
  # sketchcatch:managed-provider
  host  = aws_eks_cluster.main.endpoint
  token = data.aws_eks_cluster_auth.sketchcatch.token
}`
    }
  ];

  const result = mergeGeneratedTerraformFiles(existingFiles, generatedFiles, new Set());
  const providerCode = result[0]?.code ?? "";

  assert.match(providerCode, /config_path\s*=\s*"\/custom\/kubeconfig"/);
  assert.doesNotMatch(providerCode, /aws_eks_cluster\.main\.endpoint/);
});

test("provider refresh preserves aliases and adds a separate generated default provider", () => {
  const existingFiles = [
    {
      fileName: "providers.tf",
      code: `terraform {
  required_providers {
    kubernetes = { source = "hashicorp/kubernetes" }
  }
}

provider "kubernetes" { alias = "secondary" }`
    }
  ];
  const generatedFiles = [
    {
      fileName: "providers.tf",
      code: `terraform {
  required_providers {
    kubernetes = { source = "hashicorp/kubernetes" }
  }
}

provider "kubernetes" {
  # sketchcatch:managed-provider
  host = aws_eks_cluster.main.endpoint
}`
    }
  ];

  const result = mergeGeneratedTerraformFiles(existingFiles, generatedFiles, new Set());
  const providerCode = result[0]?.code ?? "";

  assert.match(providerCode, /alias\s*=\s*"secondary"/);
  assert.match(providerCode, /aws_eks_cluster\.main\.endpoint/);
  assert.equal(providerCode.match(/provider "kubernetes"/g)?.length, 2);
});
