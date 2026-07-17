import type { JsonValue } from "@sketchcatch/types";

export type EcsReleaseTaskSnapshot = {
  taskArn: string;
  taskDefinitionArn: string;
  lastStatus: string;
  healthStatus: string | null;
  privateIpv4Addresses: string[];
};

export type TargetHealthSnapshot = {
  id: string;
  port: number | null;
  state: string | null;
  reason: string | null;
};

export type EcsReleaseHealthSnapshot = {
  serviceTaskDefinitionArn: string;
  desiredCount: number;
  runningCount: number;
  pendingCount: number;
  rolloutState: string | null;
  tasks: EcsReleaseTaskSnapshot[];
  targets: TargetHealthSnapshot[];
};

export type VerifiedEcsReleaseHealth = {
  state: "healthy";
  taskDefinitionArn: string;
  taskArns: string[];
  healthyTargetIds: string[];
  desiredCount: number;
};

export function verifyEcsReleaseHealthSnapshot(
  snapshot: EcsReleaseHealthSnapshot,
  expectedTaskDefinitionArn: string
): VerifiedEcsReleaseHealth {
  if (snapshot.serviceTaskDefinitionArn !== expectedTaskDefinitionArn) {
    throw new Error("ECS service has not activated the expected task definition");
  }
  if (snapshot.desiredCount < 1) {
    throw new Error("ECS service desired count must be at least one");
  }
  if (snapshot.rolloutState === "FAILED") {
    throw new Error("ECS deployment rollout is FAILED");
  }
  const newTasks = snapshot.tasks.filter(
    (task) =>
      task.taskDefinitionArn === expectedTaskDefinitionArn &&
      task.lastStatus === "RUNNING" &&
      (task.healthStatus === null ||
        task.healthStatus === "UNKNOWN" ||
        task.healthStatus === "HEALTHY")
  );
  if (newTasks.length < snapshot.desiredCount || snapshot.runningCount < snapshot.desiredCount) {
    throw new Error("The new ECS revision does not have enough healthy running tasks");
  }
  const healthyTargetIds = new Set(
    snapshot.targets.filter((target) => target.state === "healthy").map((target) => target.id)
  );
  for (const task of newTasks) {
    if (
      task.privateIpv4Addresses.length === 0 ||
      !task.privateIpv4Addresses.some((address) => healthyTargetIds.has(address))
    ) {
      throw new Error(`New ECS task is not a healthy Target Group target: ${task.taskArn}`);
    }
  }
  return {
    state: "healthy",
    taskDefinitionArn: expectedTaskDefinitionArn,
    taskArns: newTasks.map((task) => task.taskArn).sort(),
    healthyTargetIds: [...healthyTargetIds].sort(),
    desiredCount: snapshot.desiredCount
  };
}

export function toEcsReleaseHealthEvidence(value: VerifiedEcsReleaseHealth): JsonValue {
  return value as unknown as JsonValue;
}
