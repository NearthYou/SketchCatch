import type { ApplicationArtifactKind, RuntimeTargetKind } from "@sketchcatch/types";

export function applicationArtifactKindForRuntime(
  runtimeTargetKind: RuntimeTargetKind
): ApplicationArtifactKind {
  if (runtimeTargetKind === "ecs_fargate") return "container_image";
  if (runtimeTargetKind === "lambda") return "lambda_zip";
  if (runtimeTargetKind === "ec2_asg") return "codedeploy_bundle";
  return "static_bundle";
}

export function applicationArtifactPlatformForRuntime(
  runtimeTargetKind: RuntimeTargetKind
): { targetOs: string; targetArchitecture: string } {
  return runtimeTargetKind === "static_site"
    ? { targetOs: "any", targetArchitecture: "any" }
    : { targetOs: "linux", targetArchitecture: "amd64" };
}
