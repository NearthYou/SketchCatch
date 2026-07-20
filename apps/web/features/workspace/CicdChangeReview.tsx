"use client";

import { useId, useState } from "react";
import type {
  GitCicdAwsRoleDiff,
  GitCicdRepositorySettingsPreview
} from "@sketchcatch/types";
import {
  buildRepositorySettingsReview,
  canApplyReviewedChange,
  getAwsRoleDiffPreviewRevision,
  getRepositorySettingsPreviewRevision
} from "./cicd-change-review";
import handoffStyles from "./cicd-handoff.module.css";
import styles from "./workspace.module.css";

export function CicdChangeReview({
  awsRoleDiff,
  handoffId,
  isBusy,
  onApplyAwsRoleDiff,
  onApplyRepositorySettings,
  repositorySettingsPreview
}: {
  readonly awsRoleDiff: GitCicdAwsRoleDiff | null;
  readonly handoffId: string;
  readonly isBusy: boolean;
  readonly onApplyAwsRoleDiff: (handoffId: string) => void;
  readonly onApplyRepositorySettings: (handoffId: string) => void;
  readonly repositorySettingsPreview: GitCicdRepositorySettingsPreview | null;
}) {
  const repositoryConfirmationId = useId();
  const awsRoleConfirmationId = useId();
  const [confirmedRepositoryRevision, setConfirmedRepositoryRevision] = useState<string | null>(
    null
  );
  const [confirmedAwsRoleRevision, setConfirmedAwsRoleRevision] = useState<string | null>(null);

  if (!repositorySettingsPreview && !awsRoleDiff) return null;

  const repositoryReview = repositorySettingsPreview
    ? buildRepositorySettingsReview(repositorySettingsPreview)
    : null;
  const repositoryRevision = repositorySettingsPreview
    ? getRepositorySettingsPreviewRevision(repositorySettingsPreview)
    : null;
  const awsRoleRevision = awsRoleDiff ? getAwsRoleDiffPreviewRevision(awsRoleDiff) : null;
  const canApplyRepository = repositoryRevision
    ? canApplyReviewedChange({
        confirmedRevision: confirmedRepositoryRevision,
        previewRevision: repositoryRevision
      })
    : false;
  const canApplyAwsRole = awsRoleRevision
    ? canApplyReviewedChange({
        confirmedRevision: confirmedAwsRoleRevision,
        previewRevision: awsRoleRevision
      })
    : false;

  return (
    <section className={handoffStyles.changeReview} aria-labelledby={`${repositoryConfirmationId}-title`}>
      <div className={handoffStyles.changeReviewHeading}>
        <div>
          <h4 id={`${repositoryConfirmationId}-title`}>외부 설정 변경 검토</h4>
          <p>아래 적용 버튼은 GitHub 또는 AWS 설정을 실제로 변경합니다.</p>
        </div>
      </div>

      {repositoryReview && repositoryRevision ? (
        <article className={handoffStyles.changeReviewCard}>
          <header>
            <div>
              <h5>Repository 설정</h5>
              <p>GitHub Environment와 Actions variables를 적용합니다.</p>
            </div>
            <span>GitHub 변경</span>
          </header>
          <dl className={handoffStyles.changeReviewFacts}>
            <div>
              <dt>Environment</dt>
              <dd>{repositoryReview.environmentName}</dd>
            </div>
            <div>
              <dt>Variables</dt>
              <dd>{repositoryReview.variables.length}개</dd>
            </div>
            <div>
              <dt>Secret 이름</dt>
              <dd>{repositoryReview.secrets.length}개</dd>
            </div>
          </dl>
          <ReviewList
            items={repositoryReview.variables.map(({ name, value }) => ({
              label: name,
              value: value || "(빈 값)"
            }))}
            title="Repository variables"
          />
          <ReviewList
            items={repositoryReview.secrets.map((secret) => ({
              label: secret,
              value: "이름만 표시"
            }))}
            title="필요한 secret 이름"
          />
          <ReviewList
            items={repositoryReview.workflowFiles.map((workflowFile) => ({
              label: workflowFile,
              value: "PR에 포함"
            }))}
            title="Workflow files"
          />
          <label className={handoffStyles.changeConfirmation} htmlFor={repositoryConfirmationId}>
            <input
              checked={confirmedRepositoryRevision === repositoryRevision}
              id={repositoryConfirmationId}
              onChange={(event) =>
                setConfirmedRepositoryRevision(event.target.checked ? repositoryRevision : null)
              }
              type="checkbox"
            />
            표시된 Repository 설정 변경 대상을 확인했습니다.
          </label>
          <button
            className={styles.deploymentSecondaryButton}
            disabled={isBusy || !canApplyRepository}
            onClick={() => onApplyRepositorySettings(handoffId)}
            type="button"
          >
            Repository 설정 적용
          </button>
        </article>
      ) : null}

      {awsRoleDiff && awsRoleRevision ? (
        <article className={handoffStyles.changeReviewCard}>
          <header>
            <div>
              <h5>AWS Role 신뢰 정책</h5>
              <p>표시된 GitHub OIDC 조건을 Role trust policy에 추가합니다.</p>
            </div>
            <span data-applied={awsRoleDiff.applied === true}>
              {awsRoleDiff.applied ? "적용·검증 완료" : "AWS 변경"}
            </span>
          </header>
          <dl className={handoffStyles.changeReviewFacts}>
            <div>
              <dt>Role ARN</dt>
              <dd>{awsRoleDiff.roleArn ?? "Role ARN 없음"}</dd>
            </div>
            <div>
              <dt>Repository</dt>
              <dd>{awsRoleDiff.repository}</dd>
            </div>
            <div>
              <dt>Branch / Environment</dt>
              <dd>{awsRoleDiff.targetBranch} / {awsRoleDiff.environmentName}</dd>
            </div>
          </dl>
          <ReviewList
            items={Object.entries(awsRoleDiff.requiredTrustConditions)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([label, value]) => ({ label, value }))}
            title="추가할 trust conditions"
          />
          {awsRoleDiff.applied ? null : (
            <>
              {awsRoleDiff.roleArn ? null : (
                <p className={handoffStyles.changeReviewWarning} role="alert">
                  적용할 AWS Role ARN이 없어 변경을 실행할 수 없습니다.
                </p>
              )}
              <label className={handoffStyles.changeConfirmation} htmlFor={awsRoleConfirmationId}>
                <input
                  checked={confirmedAwsRoleRevision === awsRoleRevision}
                  id={awsRoleConfirmationId}
                  onChange={(event) =>
                    setConfirmedAwsRoleRevision(event.target.checked ? awsRoleRevision : null)
                  }
                  type="checkbox"
                />
                표시된 AWS Role과 trust condition 변경을 확인했습니다.
              </label>
              <button
                className={styles.deploymentSecondaryButton}
                disabled={isBusy || !awsRoleDiff.roleArn || !canApplyAwsRole}
                onClick={() => onApplyAwsRoleDiff(handoffId)}
                type="button"
              >
                AWS Role 변경 적용
              </button>
            </>
          )}
        </article>
      ) : null}
    </section>
  );
}

function ReviewList({
  items,
  title
}: {
  readonly items: readonly { readonly label: string; readonly value: string }[];
  readonly title: string;
}) {
  return (
    <section className={handoffStyles.reviewList}>
      <h6>{title}</h6>
      {items.length > 0 ? (
        <dl>
          {items.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>변경 항목 없음</p>
      )}
    </section>
  );
}
