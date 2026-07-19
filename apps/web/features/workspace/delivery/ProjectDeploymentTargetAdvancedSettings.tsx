import type { RuntimeTargetKind } from "@sketchcatch/types";
import type {
  ProjectDeploymentTargetDraft,
  SystemManagedField
} from "./project-deployment-target-state";
import styles from "./project-deployment-target-editor.module.css";

type DraftUpdater = <K extends keyof ProjectDeploymentTargetDraft>(
  key: K,
  value: ProjectDeploymentTargetDraft[K]
) => void;

type SystemFieldDefinition = {
  readonly key: Exclude<SystemManagedField, "commitSha">;
  readonly label: string;
};

const runtimeSystemFields: Record<RuntimeTargetKind, readonly SystemFieldDefinition[]> = {
  ecs_fargate: [
    { key: "ecrRepositoryName", label: "ECR repository" },
    { key: "clusterName", label: "ECS cluster" },
    { key: "serviceName", label: "ECS service" },
    { key: "containerName", label: "Container" }
  ],
  lambda: [
    { key: "functionLogicalId", label: "SAM function logical ID" },
    { key: "functionName", label: "Lambda function" },
    { key: "aliasName", label: "Lambda alias" },
    { key: "codeDeployApplicationName", label: "CodeDeploy application" },
    { key: "codeDeployDeploymentGroupName", label: "CodeDeploy deployment group" }
  ],
  ec2_asg: [
    { key: "codeDeployApplicationName", label: "CodeDeploy application" },
    { key: "codeDeployDeploymentGroupName", label: "CodeDeploy deployment group" },
    { key: "autoScalingGroupName", label: "Auto Scaling group" }
  ],
  static_site: [
    { key: "hostingBucketName", label: "Versioned hosting bucket" },
    { key: "cloudFrontDistributionId", label: "CloudFront distribution ID" },
    { key: "cloudFrontOriginId", label: "CloudFront origin ID" }
  ]
};

export function ProjectDeploymentTargetAdvancedSettings({
  draft,
  lockedSystemFields,
  revealMissingFields = false,
  updateDraft
}: {
  readonly draft: ProjectDeploymentTargetDraft;
  readonly lockedSystemFields: ReadonlySet<SystemManagedField>;
  readonly revealMissingFields?: boolean | undefined;
  readonly updateDraft: DraftUpdater;
}) {
  return (
    <details className={styles.advancedSettings} open={revealMissingFields || undefined}>
      <summary>
        <span>
          <strong>고급 설정</strong>
          <small>저장소 분석이 틀렸거나 자동 입력에 실패한 경우에만 수정하세요.</small>
        </span>
      </summary>
      <div className={styles.advancedBody}>
        <div className={styles.advancedGroupHeading}>
          <h4>분석 결과 수정</h4>
          <p>프로젝트 구조가 다를 때만 변경합니다.</p>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Source root</span>
            <input
              onChange={(event) => updateDraft("sourceRoot", event.target.value)}
              value={draft.sourceRoot}
            />
            <small>빌드 명령을 시작할 저장소 폴더입니다.</small>
          </label>
          <label className={styles.field}>
            <span>Build evidence path</span>
            <input
              onChange={(event) => updateDraft("evidencePath", event.target.value)}
              value={draft.evidencePath}
            />
            <small>
              {draft.evidenceSuggested
                ? "저장소 분석에서 감지했습니다."
                : "빌드 방식을 증명하는 파일 또는 폴더입니다."}
            </small>
          </label>
          <label className={styles.field}>
            <span>
              Release version <i>선택</i>
            </span>
            <input
              onChange={(event) => updateDraft("version", event.target.value)}
              placeholder="예: v1.2.3"
              value={draft.version}
            />
            <small>비워두면 commit SHA를 버전으로 사용합니다.</small>
          </label>
          {draft.runtimeTargetKind !== "static_site" ? (
            <label className={styles.field}>
              <span>Health check path</span>
              <input
                onChange={(event) => updateDraft("healthCheckPath", event.target.value)}
                value={draft.healthCheckPath}
              />
              <small>배포 성공 여부를 확인할 HTTP 경로입니다.</small>
            </label>
          ) : (
            <label className={styles.field}>
              <span>Package install</span>
              <select
                onChange={(event) =>
                  updateDraft(
                    "installPreset",
                    event.target.value as ProjectDeploymentTargetDraft["installPreset"]
                  )
                }
                value={draft.installPreset}
              >
                <option value="none">검증된 lockfile 선택 필요</option>
                <option value="pnpm_frozen_lockfile">pnpm frozen lockfile</option>
                <option value="npm_ci">npm ci</option>
                <option value="yarn_frozen_lockfile">Yarn frozen lockfile</option>
              </select>
              <small>저장소 lockfile과 일치해야 합니다.</small>
            </label>
          )}
        </div>

        <div className={styles.advancedGroupHeading}>
          <h4>AWS 배포 시스템 값</h4>
          <p>저장된 값은 잠기며, 자동 계산값과 비어 있는 필수 값은 저장 전 수정할 수 있습니다.</p>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Confirmed commit SHA</span>
            <input
              autoComplete="off"
              onChange={(event) => updateDraft("commitSha", event.target.value)}
              placeholder="40 or 64 character SHA"
              readOnly={lockedSystemFields.has("commitSha")}
              spellCheck={false}
              value={draft.commitSha}
            />
            <small>
              {draft.commitSha
                ? "Repository 분석에서 확인한 값입니다."
                : "자동으로 확인하지 못해 입력이 필요합니다."}
            </small>
          </label>
          <SystemTextField
            draft={draft}
            field={{ key: "codeBuildProjectName", label: "CodeBuild project" }}
            lockedSystemFields={lockedSystemFields}
            updateDraft={updateDraft}
          />
          {runtimeSystemFields[draft.runtimeTargetKind].map((field) => (
            <SystemTextField
              draft={draft}
              field={field}
              key={field.key}
              lockedSystemFields={lockedSystemFields}
              updateDraft={updateDraft}
            />
          ))}
          <label className={styles.field}>
            <span>
              Output URL <i>{draft.runtimeTargetKind === "ecs_fargate" ? "배포 후" : "필수"}</i>
            </span>
            <input
              onChange={(event) => updateDraft("outputUrl", event.target.value)}
              placeholder="https://example.com"
              readOnly={draft.runtimeTargetKind === "ecs_fargate"}
              value={draft.outputUrl}
            />
            <small>
              {draft.runtimeTargetKind === "ecs_fargate"
                ? "첫 배포에서 확인한 HTTPS 주소가 자동으로 반영됩니다."
                : "기존 Runtime이 확인한 HTTPS 주소를 입력해야 합니다."}
            </small>
          </label>
        </div>
      </div>
    </details>
  );
}

function SystemTextField({
  draft,
  field,
  lockedSystemFields,
  updateDraft
}: {
  readonly draft: ProjectDeploymentTargetDraft;
  readonly field: SystemFieldDefinition;
  readonly lockedSystemFields: ReadonlySet<SystemManagedField>;
  readonly updateDraft: DraftUpdater;
}) {
  return (
    <label className={styles.field}>
      <span>{field.label}</span>
      <input
        onChange={(event) => updateDraft(field.key, event.target.value)}
        readOnly={lockedSystemFields.has(field.key)}
        value={draft[field.key]}
      />
    </label>
  );
}
