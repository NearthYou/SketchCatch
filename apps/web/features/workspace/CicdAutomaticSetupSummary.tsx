import type { ProjectDeliveryProfile, ProjectDeploymentTarget } from "@sketchcatch/types";
import styles from "./delivery-center.module.css";

export function CicdAutomaticSetupSummary({
  profile
}: {
  readonly profile: Pick<ProjectDeliveryProfile, "deploymentTarget">;
}) {
  const target = profile.deploymentTarget;
  const buildConfig = target?.confirmedBuildConfig ?? null;

  return (
    <dl className={styles.automaticSummaryGrid}>
      <SummaryFact label="빌드 기준" value={getBuildBasis(target)} />
      <SummaryFact
        label="확정 소스"
        value={buildConfig?.confirmedCommitSha.slice(0, 10) ?? "설정 필요"}
      />
      <SummaryFact label="배포 위치" value={getDeploymentLocation(target)} />
      <SummaryFact label="공개 주소" value={target?.runtimeConfig?.outputUrl || "배포 후 확인"} />
      <SummaryFact
        label="마지막 저장"
        value={target ? formatUpdatedAt(target.updatedAt) : "저장 기록 없음"}
      />
    </dl>
  );
}

function SummaryFact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function getBuildBasis(target: ProjectDeploymentTarget | null): string {
  const buildConfig = target?.confirmedBuildConfig;
  if (!buildConfig) return "설정 필요";
  return [buildConfig.sourceRoot, buildConfig.dockerfilePath ?? buildConfig.packageManifestPath]
    .filter(Boolean)
    .join(" · ");
}

function getDeploymentLocation(target: ProjectDeploymentTarget | null): string {
  const config = target?.runtimeConfig;
  if (!config) return "설정 필요";
  switch (config.runtimeTargetKind) {
    case "ecs_fargate":
      return `${config.clusterName} / ${config.serviceName}`;
    case "lambda":
      return `${config.functionName}:${config.aliasName}`;
    case "ec2_asg":
      return config.autoScalingGroupName;
    case "static_site":
      return config.hostingBucketName;
  }
}

function formatUpdatedAt(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul"
  });
}
