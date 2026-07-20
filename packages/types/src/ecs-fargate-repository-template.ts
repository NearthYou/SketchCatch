import type {
  BuildTemplateDiagramInput,
  TemplateRelationship,
  TemplateResourceDefinition
} from "./template-definitions.js";

export type EcsFargateRepositoryExtension = {
  readonly resources: readonly TemplateResourceDefinition[];
  readonly relationships: readonly TemplateRelationship[];
  readonly containerPort: number;
  readonly healthCheckPath: string;
  readonly includeFrontend: boolean;
};

const WEB_ASSETS_RESOURCE_ID = "web-assets";
const WEB_PUBLIC_ACCESS_RESOURCE_ID = "web-public-access";
const WEB_BOOTSTRAP_INDEX_RESOURCE_ID = "web-bootstrap-index";
const WEB_OAC_RESOURCE_ID = "web-oac";
const WEB_BUCKET_POLICY_RESOURCE_ID = "web-bucket-policy";

export function createEcsFargateRepositoryExtension(
  input: BuildTemplateDiagramInput
): EcsFargateRepositoryExtension | null {
  const containerPort = normalizeContainerPort(input.containerPort);
  const healthCheckPath = normalizeHealthCheckPath(input.healthCheckPath);
  const includeFrontend = input.includeFrontend === true;

  if (!includeFrontend && containerPort === 80 && healthCheckPath === "/") {
    return null;
  }

  const deploymentName = normalizeDeploymentName(input.projectSlug);
  const resources = includeFrontend
    ? [
        templateResource(WEB_ASSETS_RESOURCE_ID, "Static Web Assets", "aws_s3_bucket", 1840, 760, {
          bucketPrefix: `${deploymentName}-web-`,
          forceDestroy: true,
          versioningEnabled: true
        }),
        templateResource(
          WEB_PUBLIC_ACCESS_RESOURCE_ID,
          "S3 Public Access Block",
          "aws_s3_bucket_public_access_block",
          2020,
          760,
          {
            bucket: `@ref:${WEB_ASSETS_RESOURCE_ID}.id`,
            blockPublicAcls: true,
            blockPublicPolicy: true,
            ignorePublicAcls: true,
            restrictPublicBuckets: true
          }
        ),
        templateResource(
          WEB_BOOTSTRAP_INDEX_RESOURCE_ID,
          "Bootstrap Index",
          "aws_s3_object",
          2200,
          760,
          {
            bucket: `@ref:${WEB_ASSETS_RESOURCE_ID}.id`,
            key: "index.html",
            contentType: "text/html; charset=utf-8",
            content:
              '<!doctype html><html lang="en"><meta charset="utf-8"><title>Application deployment is in progress</title><body><main><h1>Application deployment is in progress</h1><p>SketchCatch is deploying the approved application release.</p></main></body></html>'
          }
        ),
        templateResource(
          WEB_OAC_RESOURCE_ID,
          "CloudFront Origin Access Control",
          "aws_cloudfront_origin_access_control",
          1840,
          920,
          {
            name: `${deploymentName}-web-oac`,
            originAccessControlOriginType: "s3",
            signingBehavior: "always",
            signingProtocol: "sigv4"
          }
        ),
        templateResource(
          WEB_BUCKET_POLICY_RESOURCE_ID,
          "CloudFront Read-only Bucket Policy",
          "aws_s3_bucket_policy",
          2020,
          920,
          {
            bucket: `@ref:${WEB_ASSETS_RESOURCE_ID}.id`,
            dependsOn: [`@address:${WEB_PUBLIC_ACCESS_RESOURCE_ID}`],
            policy: JSON.stringify({
              Version: "2012-10-17",
              Statement: [
                {
                  Sid: "AllowCloudFrontServicePrincipalReadOnly",
                  Effect: "Allow",
                  Principal: { Service: "cloudfront.amazonaws.com" },
                  Action: "s3:GetObject",
                  Resource: `\${@ref:${WEB_ASSETS_RESOURCE_ID}.arn}/*`,
                  Condition: {
                    StringEquals: {
                      "AWS:SourceArn": "${@ref:distribution.arn}"
                    }
                  }
                }
              ]
            })
          }
        )
      ]
    : [];

  return {
    resources,
    containerPort,
    healthCheckPath,
    includeFrontend,
    relationships: includeFrontend
      ? [
          relationship("distribution-web-assets", "distribution", WEB_ASSETS_RESOURCE_ID, "serves"),
          relationship(
            "web-assets-public-access",
            WEB_ASSETS_RESOURCE_ID,
            WEB_PUBLIC_ACCESS_RESOURCE_ID,
            "blocks public access"
          ),
          relationship(
            "web-assets-bootstrap-index",
            WEB_ASSETS_RESOURCE_ID,
            WEB_BOOTSTRAP_INDEX_RESOURCE_ID,
            "contains"
          ),
          relationship("web-oac-distribution", WEB_OAC_RESOURCE_ID, "distribution", "authorizes"),
          relationship(
            "web-assets-bucket-policy",
            WEB_ASSETS_RESOURCE_ID,
            WEB_BUCKET_POLICY_RESOURCE_ID,
            "allows CloudFront read"
          )
        ]
      : []
  };
}

export function applyEcsFargateRepositoryContract(
  resources: readonly TemplateResourceDefinition[],
  extension: EcsFargateRepositoryExtension | null
): readonly TemplateResourceDefinition[] {
  if (!extension) return resources;

  return resources.map((resource) => {
    if (resource.id === "task-security-group") {
      return {
        ...resource,
        values: {
          ...resource.values,
          description: `Allow ALB traffic to Fargate tasks on port ${extension.containerPort}`,
          ingress: [
            {
              fromPort: extension.containerPort,
              toPort: extension.containerPort,
              protocol: "tcp",
              securityGroups: ["@ref:alb-security-group.id"]
            }
          ]
        }
      };
    }

    if (resource.id === "target-group") {
      return {
        ...resource,
        values: {
          ...resource.values,
          port: extension.containerPort,
          healthCheck: { path: extension.healthCheckPath, matcher: "200-399" }
        }
      };
    }

    if (resource.id === "distribution" && extension.includeFrontend) {
      return {
        ...resource,
        values: {
          ...resource.values,
          defaultRootObject: "index.html",
          origin: [
            {
              domainName: `@ref:${WEB_ASSETS_RESOURCE_ID}.bucket_regional_domain_name`,
              originId: "web-assets",
              originAccessControlId: `@ref:${WEB_OAC_RESOURCE_ID}.id`
            },
            {
              domainName: "@ref:load-balancer.dns_name",
              originId: "api-alb",
              customOriginConfig: {
                httpPort: 80,
                httpsPort: 443,
                originProtocolPolicy: "http-only",
                originSslProtocols: ["TLSv1.2"]
              }
            }
          ],
          defaultCacheBehavior: [
            {
              targetOriginId: "web-assets",
              viewerProtocolPolicy: "redirect-to-https",
              allowedMethods: ["GET", "HEAD"],
              cachedMethods: ["GET", "HEAD"],
              cachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6"
            }
          ],
          orderedCacheBehavior: ["/api/*", "/health"].map((pathPattern) => ({
            pathPattern,
            targetOriginId: "api-alb",
            viewerProtocolPolicy: "redirect-to-https",
            allowedMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
            cachedMethods: ["GET", "HEAD"],
            cachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
            originRequestPolicyId: "b689b0a8-53d0-40ab-baf2-68738e2966ac"
          }))
        }
      };
    }

    if (resource.id === "task") {
      return {
        ...resource,
        values: {
          ...resource.values,
          containerDefinitions: updateContainerDefinitions(
            resource.values.containerDefinitions,
            extension
          )
        }
      };
    }

    if (resource.id === "service") {
      const loadBalancer = isRecord(resource.values.loadBalancer)
        ? { ...resource.values.loadBalancer, containerPort: extension.containerPort }
        : resource.values.loadBalancer;
      return { ...resource, values: { ...resource.values, loadBalancer } };
    }

    return resource;
  });
}

function updateContainerDefinitions(
  value: unknown,
  extension: EcsFargateRepositoryExtension
): unknown {
  if (typeof value !== "string") return value;

  try {
    const definitions: unknown = JSON.parse(value);
    if (!Array.isArray(definitions)) return value;

    return JSON.stringify(
      definitions.map((definition, index) => {
        if (index !== 0 || !isRecord(definition)) return definition;

        return {
          ...definition,
          image: "public.ecr.aws/docker/library/nginx:1.27-alpine",
          entryPoint: ["/bin/sh", "-c"],
          command: [createPlaceholderCommand(extension.containerPort, extension.healthCheckPath)],
          portMappings: [
            {
              containerPort: extension.containerPort,
              hostPort: extension.containerPort,
              protocol: "tcp"
            }
          ],
          environment: [
            { name: "PORT", value: String(extension.containerPort) },
            ...(extension.includeFrontend
              ? [
                  {
                    name: "WEB_ORIGIN",
                    value: "https://${@ref:distribution.domain_name}"
                  }
                ]
              : [])
          ]
        };
      })
    );
  } catch {
    return value;
  }
}

function createPlaceholderCommand(containerPort: number, healthCheckPath: string): string {
  return [
    "printf '%s\\n' 'server {'",
    `'  listen ${containerPort};'`,
    "'  default_type text/plain;'",
    `'  location = ${healthCheckPath} { return 200 ok; }'`,
    "'  location / { return 200 SketchCatch-deployment-smoke; }'",
    "'}' > /etc/nginx/conf.d/default.conf",
    "exec nginx -g 'daemon off;'"
  ].join(" ");
}

function normalizeContainerPort(value: number | undefined): number {
  return Number.isInteger(value) && value !== undefined && value >= 1 && value <= 65_535
    ? value
    : 80;
}

function normalizeHealthCheckPath(value: string | undefined): string {
  return value && /^\/[a-z0-9_./-]*$/iu.test(value) ? value : "/";
}

function normalizeDeploymentName(projectSlug: string): string {
  return (
    projectSlug
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 40)
      .replace(/-+$/gu, "") || "sketchcatch"
  );
}

function templateResource(
  id: string,
  label: string,
  terraformResourceType: string,
  x: number,
  y: number,
  values: Record<string, unknown>
): TemplateResourceDefinition {
  return {
    id,
    label,
    provider: "aws",
    terraformBlockType: "resource",
    terraformResourceType,
    values,
    position: { x, y },
    kind: "resource"
  };
}

function relationship(
  id: string,
  sourceResourceId: string,
  targetResourceId: string,
  label: string
): TemplateRelationship {
  return { id, sourceResourceId, targetResourceId, label };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
