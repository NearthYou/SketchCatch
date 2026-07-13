import assert from "node:assert/strict";
import { test } from "node:test";

import type { DiagramJson, InfrastructureGraph } from "@sketchcatch/types";

import { renderTerraformFromInfrastructureGraph } from "./diagram-to-terraform.js";
import { syncTerraformToDiagramJson } from "./terraform-to-diagram.js";

const cloudFrontCode = `resource "aws_cloudfront_distribution" "cloudfront_distribution" {
  enabled             = true
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.s3_bucket.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  origin {
    domain_name = aws_lb.load_balancer.dns_name
    origin_id   = "alb-api"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "alb-api"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}`;

const emptyDiagram: DiagramJson = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 }
};

test("syncs the requested CloudFront distribution without unsupported nested-block diagnostics", () => {
  const result = syncTerraformToDiagramJson(emptyDiagram, cloudFrontCode);
  const proposal = result.proposals?.find((item) => item.kind === "create_candidate");

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(proposal?.parameters.values, {
    enabled: true,
    defaultRootObject: "index.html",
    origin: [
      {
        domainName: "aws_s3_bucket.s3_bucket.bucket_regional_domain_name",
        originId: "s3-frontend",
        originAccessControlId: "aws_cloudfront_origin_access_control.s3_oac.id"
      },
      {
        domainName: "aws_lb.load_balancer.dns_name",
        originId: "alb-api",
        customOriginConfig: [{
          httpPort: 80,
          httpsPort: 443,
          originProtocolPolicy: "http-only",
          originSslProtocols: ["TLSv1.2"]
        }]
      }
    ],
    defaultCacheBehavior: [{
      targetOriginId: "s3-frontend",
      viewerProtocolPolicy: "redirect-to-https",
      allowedMethods: ["GET", "HEAD"],
      cachedMethods: ["GET", "HEAD"],
      cachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6"
    }],
    orderedCacheBehavior: [{
      pathPattern: "/api/*",
      targetOriginId: "alb-api",
      viewerProtocolPolicy: "redirect-to-https",
      allowedMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
      cachedMethods: ["GET", "HEAD"],
      cachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
      originRequestPolicyId: "b689b0a8-53d0-40ab-baf2-68738e2966ac"
    }],
    restrictions: [{ geoRestriction: [{ restrictionType: "none" }] }],
    viewerCertificate: [{ cloudfrontDefaultCertificate: true }]
  });
});

test("renders the requested CloudFront nested values back as blocks", () => {
  const parsed = syncTerraformToDiagramJson(emptyDiagram, cloudFrontCode);
  const values = parsed.proposals?.find((item) => item.kind === "create_candidate")?.parameters.values;
  assert.ok(values);

  const graph: InfrastructureGraph = {
    nodes: [{
      id: "cloudfront",
      label: "CloudFront",
      iac: {
        provider: "aws",
        terraformBlockType: "resource",
        resourceType: "aws_cloudfront_distribution",
        resourceName: "cloudfront_distribution",
        fileName: "main"
      },
      config: values
    }],
    edges: []
  };
  const renderedCode = renderTerraformFromInfrastructureGraph(graph);

  assert.match(renderedCode, /custom_origin_config \{/);
  assert.match(renderedCode, /ordered_cache_behavior \{/);
  assert.match(renderedCode, /geo_restriction \{/);
  const roundTripProposal = syncTerraformToDiagramJson(emptyDiagram, renderedCode).proposals?.find(
    (item) => item.kind === "create_candidate"
  );
  assert.deepEqual(roundTripProposal?.parameters.values, values);
});

test("renders ECR image scanning configuration as a nested block", () => {
  const graph: InfrastructureGraph = {
    nodes: [{
      id: "repository",
      label: "API image repository",
      iac: {
        provider: "aws",
        terraformBlockType: "resource",
        resourceType: "aws_ecr_repository",
        resourceName: "api_image",
        fileName: "main"
      },
      config: {
        name: "application-api",
        imageScanningConfiguration: { scanOnPush: true }
      }
    }],
    edges: []
  };

  const renderedCode = renderTerraformFromInfrastructureGraph(graph);

  assert.match(renderedCode, /image_scanning_configuration \{/);
  assert.match(renderedCode, /scan_on_push = true/);
  assert.doesNotMatch(renderedCode, /image_scanning_configuration = \{/);
});
