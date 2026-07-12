import type { LiveObservationSnapshot } from "@sketchcatch/types";

type DeploymentObservabilityTargetBase = {
  readonly awsConnectionId: string;
  readonly roleArn: string;
  readonly externalId: string;
  readonly region: string;
  readonly albArnSuffix: string;
  readonly targetGroupArnSuffix: string;
};

export type DeploymentCapacityTarget =
  | {
      readonly kind: "asg";
      readonly asgName: string;
    }
  | {
      readonly kind: "ecs_service";
      readonly clusterName: string;
      readonly serviceName: string;
      readonly maxCapacity: number;
    };

export type DeploymentObservabilityTarget = DeploymentObservabilityTargetBase & {
  readonly capacityTarget: DeploymentCapacityTarget;
};

export type DeploymentObservation = Pick<
  LiveObservationSnapshot,
  "cloudWatch" | "capacity"
>;

export type DeploymentObservabilityProvider = {
  observe(target: DeploymentObservabilityTarget): Promise<DeploymentObservation>;
};

export function createUnavailableDeploymentObservation(
  errorCode = "AWS_OBSERVATION_UNAVAILABLE"
): DeploymentObservation {
  return {
    cloudWatch: {
      state: "unavailable",
      requestCountPerTarget: null,
      periodSeconds: 60,
      observedAt: null,
      delayedBySeconds: null,
      errorCode
    },
    capacity: {
      state: "unavailable",
      desiredCapacity: null,
      currentInstanceCount: null,
      inServiceInstanceCount: null,
      maxCapacity: null,
      instances: [],
      latestActivity: null,
      observedAt: null,
      errorCode
    }
  };
}
