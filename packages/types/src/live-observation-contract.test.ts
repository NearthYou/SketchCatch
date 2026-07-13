import type {
  CollectLiveObservationEventResponse,
  CreateLiveObservationResponse,
  DeploymentLiveObservationManifestRecord,
  DeploymentLiveObservationManifestStatus,
  DeploymentLiveObservationManifestV2,
  JsonValue,
  LiveObservationProviderSnapshot,
  LiveObservationSnapshotResponse,
  StopLiveObservationResponse
} from "./index.js";

export type LiveObservationContract = {
  collect: CollectLiveObservationEventResponse;
  create: CreateLiveObservationResponse;
  manifest: DeploymentLiveObservationManifestV2;
  manifestPayload: JsonValue;
  manifestRecord: DeploymentLiveObservationManifestRecord;
  manifestStatus: DeploymentLiveObservationManifestStatus;
  snapshot: LiveObservationSnapshotResponse;
  stop: StopLiveObservationResponse;
};

export const liveObservationProviderSnapshotContract = {
  requests: 120,
  errorRate: 2.5,
  p95LatencyMs: 183,
  availability: 97.5,
  capacity: {
    desired: 2,
    running: 2,
    healthy: 2,
    max: 4
  },
  logs: [
    {
      timestamp: "2026-07-11T00:00:00.000Z",
      message: "request completed"
    }
  ],
  observedAt: "2026-07-11T00:00:00.000Z",
  state: "available"
} satisfies LiveObservationProviderSnapshot;

const deploymentId = "123e4567-e89b-42d3-a456-426614174000";
const resourceSuffix = "123e4567e89b";
const awsConnectionId = "abcdef12-3456-4789-8abc-def012345678";

export const deploymentLiveObservationManifestV2Contract = {
  schemaVersion: 2,
  provider: "aws",
  provenance: {
    deploymentId,
    terraformArtifactSha256: "a".repeat(64),
    awsConnectionId,
    region: "ap-northeast-2",
    verifiedAt: "2026-07-11T00:00:00.000Z"
  },
  endpoints: {
    audienceBaseUrl: "https://audience.example.com",
    trafficUrl: "https://traffic.example.com/events"
  },
  pressure: {
    metric: "requests_per_target_per_minute",
    target: 60,
    windowSeconds: 60
  },
  adapter: {
    kind: "aws-live-observation",
    version: 1,
    payload: {
      cloudFrontDistributionId: "E1ABCDEFGHIJKL",
      loadBalancerArn:
        `arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/sc-lo-alb-${resourceSuffix}/50dc6c495c0c9188`,
      targetGroupArn:
        `arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/sc-lo-api-${resourceSuffix}/6d0ecf831eec9f09`,
      autoScalingGroupName: `sc-lo-asg-${resourceSuffix}`
    }
  }
} satisfies DeploymentLiveObservationManifestV2;

export const deploymentLiveObservationManifestRecordContract = {
  deploymentId,
  schemaVersion: 2,
  status: "valid",
  manifest: deploymentLiveObservationManifestV2Contract,
  invalidReason: null,
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z"
} satisfies DeploymentLiveObservationManifestRecord;
