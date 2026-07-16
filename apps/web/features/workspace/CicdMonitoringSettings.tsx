import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type {
  GitCicdMonitoredPath,
  GitCicdMonitoringConfig,
  UpdateGitCicdMonitoringConfigRequest
} from "@sketchcatch/types";
import {
  isCicdMonitoringDraftComplete,
  normalizeCicdMonitoredPath,
  type CicdMonitoringDraft
} from "./cicd-console-state";
import styles from "./workspace.module.css";

export type CicdMonitoringSettingsHandle = {
  readonly save: () => Promise<boolean>;
};

export const CicdMonitoringSettings = forwardRef<
  CicdMonitoringSettingsHandle,
  {
    readonly config: GitCicdMonitoringConfig;
    readonly initialDraft?: Partial<CicdMonitoringDraft> | undefined;
    readonly isSaving: boolean;
    readonly onDirty?: (() => void) | undefined;
    readonly onSave: (request: UpdateGitCicdMonitoringConfigRequest) => Promise<boolean | void>;
    readonly showSaveButton?: boolean | undefined;
  }
>(function CicdMonitoringSettings({
  config,
  initialDraft,
  isSaving,
  onDirty,
  onSave,
  showSaveButton = true
}, ref) {
  const [draft, setDraft] = useState<CicdMonitoringDraft>(() => toDraft(config, initialDraft));

  useEffect(() => setDraft(toDraft(config, initialDraft)), [config, initialDraft]);

  const canSave = !isSaving && isCicdMonitoringDraftComplete(draft);

  function updateDraft(updater: (current: CicdMonitoringDraft) => CicdMonitoringDraft): void {
    onDirty?.();
    setDraft(updater);
  }

  async function save(): Promise<boolean> {
    const appPath = normalizeCicdMonitoredPath(draft.appPath);
    const infraPath = normalizeCicdMonitoredPath(draft.infraPath);
    if (!canSave || appPath === null || infraPath === null) {
      return false;
    }

    const saved = await onSave({
      ...draft,
      monitorBranch: draft.monitorBranch.trim() || config.monitorBranch,
      appPath,
      infraPath,
      userAcceptedChangeId: `cicd-monitoring-${crypto.randomUUID()}`
    });
    return saved !== false;
  }

  useImperativeHandle(ref, () => ({ save }));

  return (
    <section className={styles.cicdSettings} aria-labelledby="cicd-settings-title">
      <div className={styles.deploymentSectionHeader}>
        <div>
          <h3 id="cicd-settings-title">모니터링 설정</h3>
          <p>저장소 branch와 앱·인프라 변경 범위를 명시적으로 선택합니다.</p>
        </div>
        {showSaveButton ? (
          <button
            className={styles.deploymentPrimaryButton}
            disabled={!canSave}
            onClick={() => void save()}
            type="button"
          >
            {isSaving ? "저장 중" : "설정 저장"}
          </button>
        ) : null}
      </div>

      <label className={styles.cicdToggleField}>
        <input
          checked={draft.enabled}
          onChange={(event) => updateDraft((current) => ({ ...current, enabled: event.target.checked }))}
          type="checkbox"
        />
        CI/CD Pipeline 모니터링 사용
      </label>

      <label className={styles.deploymentField}>
        모니터링 branch
        <input
          disabled={!draft.enabled}
          onChange={(event) => updateDraft((current) => ({ ...current, monitorBranch: event.target.value }))}
          placeholder="main"
          value={draft.monitorBranch}
        />
      </label>

      <MonitoredPathField
        disabled={!draft.enabled}
        label="애플리케이션 경로"
        onChange={(appPath) => updateDraft((current) => ({ ...current, appPath }))}
        value={draft.appPath}
      />
      <MonitoredPathField
        disabled={!draft.enabled}
        label="인프라 경로"
        onChange={(infraPath) => updateDraft((current) => ({ ...current, infraPath }))}
        value={draft.infraPath}
      />

      {config.validationMessage ? (
        <p className={styles.deploymentStageAlert} role="status">
          {config.validationMessage}
        </p>
      ) : null}
    </section>
  );
});

function MonitoredPathField({
  disabled,
  label,
  onChange,
  value
}: {
  readonly disabled: boolean;
  readonly label: string;
  readonly onChange: (path: GitCicdMonitoredPath) => void;
  readonly value: GitCicdMonitoredPath;
}) {
  return (
    <fieldset className={styles.cicdPathField} disabled={disabled}>
      <legend>{label}</legend>
      <label>
        <input
          checked={value.mode === "repository_root"}
          name={`${label}-mode`}
          onChange={() => onChange({ mode: "repository_root", path: "." })}
          type="radio"
        />
        저장소 루트
      </label>
      <label>
        <input
          checked={value.mode === "subdirectory"}
          name={`${label}-mode`}
          onChange={() => onChange({ mode: "subdirectory", path: "" })}
          type="radio"
        />
        하위 디렉터리
      </label>
      {value.mode === "subdirectory" ? (
        <input
          aria-label={`${label} 하위 디렉터리`}
          onChange={(event) => onChange({ mode: "subdirectory", path: event.target.value })}
          placeholder={label === "애플리케이션 경로" ? "apps/web" : "infra"}
          value={value.path}
        />
      ) : null}
    </fieldset>
  );
}

function toDraft(
  config: GitCicdMonitoringConfig,
  initialDraft?: Partial<CicdMonitoringDraft>
): CicdMonitoringDraft {
  const draft = {
    enabled: config.enabled,
    monitorBranch: config.monitorBranch,
    appPath: config.appPath,
    infraPath: config.infraPath
  };

  return config.validationStatus === "required"
    ? { ...draft, ...initialDraft }
    : draft;
}
