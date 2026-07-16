import type { DiagramNode } from "../../../../packages/types/src";
import { cloneParameterValue } from "../diagram-editor/parameter-value-utils";

type ModuleResourceDefaults = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

/**
 * Terraform-renderable examples normalized from each representative Template.
 * They make the generated fragment explicit enough for init/validate; external IDs and ARNs
 * remain editable example inputs and are not evidence that a live plan/apply will succeed.
 */
const terraformDefaultsByModule: Readonly<Record<string, ModuleResourceDefaults>> = {
  "container-runtime": {
    "aws_ecs_cluster.video_processing_cluster": {
      name: "video-processing-cluster"
    },
    "aws_ecs_task_definition.video_task": {
      family: "video-processing-task",
      networkMode: "awsvpc",
      memory: "2048",
      cpu: "1024",
      requiresCompatibilities: ["FARGATE"],
      containerDefinitions: JSON.stringify([
        {
          name: "video-processor",
          image: "public.ecr.aws/docker/library/nginx:stable",
          essential: true
        }
      ])
    },
    "aws_ecs_service.video_service": {
      name: "video-processing-service",
      cluster: "aws_ecs_cluster.video_processing_cluster.id",
      taskDefinition: "aws_ecs_task_definition.video_task.arn",
      desiredCount: 1,
      launchType: "FARGATE",
      networkConfiguration: [
        {
          assignPublicIp: true,
          securityGroups: ["sg-0123456789abcdef0"],
          subnets: ["subnet-0123456789abcdef0"]
        }
      ]
    }
  },
  "identity-access-boundary": {
    "aws_iam_group.default": {
      name: "sketchcatch-users"
    },
    "aws_iam_user.users": {
      name: "sketchcatch-user"
    },
    "aws_iam_user_group_membership.default": {
      user: "aws_iam_user.users.name",
      groups: ["aws_iam_group.default.name"]
    }
  },
  "load-balanced-compute": {
    "aws_elb.clb_9": {
      crossZoneLoadBalancing: true,
      healthCheck: {
        healthyThreshold: 2,
        interval: 30,
        target: "HTTP:80/",
        timeout: 3,
        unhealthyThreshold: 2
      },
      listener: [
        {
          instancePort: 80,
          instanceProtocol: "http",
          lbPort: 80,
          lbProtocol: "http"
        }
      ],
      securityGroups: ["sg-0123456789abcdef0"],
      subnets: ["subnet-0123456789abcdef0", "subnet-0123456789abcdef1"]
    },
    "aws_autoscaling_group.web": {
      minSize: 1,
      maxSize: 2,
      desiredCapacity: 1,
      healthCheckType: "ELB",
      launchConfiguration: "sketchcatch-example-launch-configuration",
      loadBalancers: ["aws_elb.clb_9.name"],
      vpcZoneIdentifier: [
        "subnet-0123456789abcdef0",
        "subnet-0123456789abcdef1"
      ]
    },
    "aws_vpc.vpc": {
      cidrBlock: "10.0.0.0/16"
    }
  },
  "operations-monitoring": {
    "aws_cloudwatch_metric_alarm.web_cpu_alarm_up": {
      alarmName: "web-cpu-alarm-up",
      namespace: "AWS/EC2",
      metricName: "CPUUtilization",
      comparisonOperator: "GreaterThanOrEqualToThreshold",
      threshold: 70,
      evaluationPeriods: 2,
      period: 120,
      statistic: "Average",
      dimensions: {
        AutoScalingGroupName: "sketchcatch-example-asg"
      }
    },
    "aws_autoscaling_policy.default": {
      name: "web-policy-up",
      autoscalingGroupName: "sketchcatch-example-asg",
      adjustmentType: "ChangeInCapacity",
      scalingAdjustment: 1,
      cooldown: 300
    },
    "aws_vpc.vpc": {
      cidrBlock: "10.0.0.0/16"
    }
  },
  "secure-object-storage": {
    "aws_s3_bucket.website_bucket": {
      bucket: "sketchcatch-module-secure-object-storage"
    },
    "aws_s3_bucket_versioning.s3_bucket_versioning": {
      bucket: "aws_s3_bucket.website_bucket.id",
      versioningConfiguration: [{ status: "Enabled" }]
    }
  },
  "serverless-api": {
    "aws_api_gateway_rest_api.video_api": {
      name: "VideoProcessingAPI",
      description: "API for processing videos"
    },
    "aws_api_gateway_resource.video_resource": {
      restApiId: "aws_api_gateway_rest_api.video_api.id",
      parentId: "aws_api_gateway_rest_api.video_api.root_resource_id",
      pathPart: "videos"
    },
    "aws_api_gateway_method.video_method": {
      restApiId: "aws_api_gateway_rest_api.video_api.id",
      resourceId: "aws_api_gateway_resource.video_resource.id",
      httpMethod: "POST",
      authorization: "NONE"
    },
    "aws_lambda_function.video_processor": {
      functionName: "video-processor",
      role: "arn:aws:iam::123456789012:role/sketchcatch-lambda-execution",
      handler: "index.handler",
      runtime: "nodejs20.x",
      inlineSource: "export const handler = async () => ({ statusCode: 200, body: 'ok' });"
    },
    "aws_api_gateway_integration.video_integration": {
      restApiId: "aws_api_gateway_rest_api.video_api.id",
      resourceId: "aws_api_gateway_resource.video_resource.id",
      httpMethod: "aws_api_gateway_method.video_method.http_method",
      integrationHttpMethod: "POST",
      type: "AWS_PROXY",
      uri: "aws_lambda_function.video_processor.invoke_arn"
    }
  }
};

export function applyCuratedModuleTerraformDefaults(
  moduleId: string,
  nodes: readonly DiagramNode[]
): DiagramNode[] {
  const moduleDefaults = terraformDefaultsByModule[moduleId];

  return nodes.map((node) => {
    const parameters = node.parameters;
    if (!parameters || !moduleDefaults) return node;
    const blockPrefix = parameters.terraformBlockType === "data" ? "data." : "";
    const address = `${blockPrefix}${parameters.resourceType}.${parameters.resourceName}`;
    const defaults = moduleDefaults[address];

    if (!defaults) return node;

    return {
      ...node,
      parameters: {
        ...parameters,
        values: {
          ...cloneParameterValue(parameters.values),
          ...cloneParameterValue(defaults)
        }
      }
    };
  });
}
