"use client";

import { useQueryClient } from "@tanstack/react-query";
import type {
  AwsConnectionStatus,
  AwsImportAccessState
} from "@sketchcatch/types";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  LoaderCircle
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../components/auth/auth-provider";
import { invalidateAwsImportAccessQueries } from "../../components/query/dashboard-query-invalidation";
import { getApiErrorMessage } from "../../lib/api-client";
import { copyTextToClipboard } from "../../lib/clipboard";
import {
  applyAwsImportAccessPolicy,
  checkAwsImportAccessCleanup,
  checkAwsImportAccessManager,
  checkAwsImportAccessReads,
  prepareAwsImportAccessCleanup,
  prepareAwsImportAccessManager,
  previewAwsImportAccessPolicy,
  type AwsImportAccessPreviewResponse,
  type AwsImportAccessSafeResponse
} from "../workspace/api";
import { useAwsImportAccessQuery } from "./connection-queries";
import {
  deriveAwsImportAccessView,
  type AwsImportAccessUiCommand
} from "./aws-import-access-state";
import styles from "../../app/dashboard/settings/settings-dashboard.module.css";

type PolicyApproval = {
  readonly approvalId: string;
  readonly operationId: string;
};

export type AwsImportAccessCommandApi = {
  readonly prepareManager: (connectionId: string) => Promise<AwsImportAccessSafeResponse>;
  readonly checkManager: (connectionId: string) => Promise<AwsImportAccessSafeResponse>;
  readonly previewPolicy: (connectionId: string) => Promise<AwsImportAccessPreviewResponse>;
  readonly applyPolicy: (input: {
    readonly connectionId: string;
    readonly approvalId: string;
    readonly operationId: string;
  }) => Promise<AwsImportAccessSafeResponse>;
  readonly checkReads: (connectionId: string) => Promise<AwsImportAccessSafeResponse>;
  readonly prepareCleanup: (connectionId: string) => Promise<AwsImportAccessSafeResponse>;
  readonly checkCleanup: (connectionId: string) => Promise<AwsImportAccessSafeResponse>;
};

type AwsImportAccessCommandResult = {
  readonly response: AwsImportAccessSafeResponse;
  readonly approval: PolicyApproval | null;
};

const AWS_IMPORT_ACCESS_COMMAND_API: AwsImportAccessCommandApi = {
  prepareManager: prepareAwsImportAccessManager,
  checkManager: checkAwsImportAccessManager,
  previewPolicy: previewAwsImportAccessPolicy,
  applyPolicy: applyAwsImportAccessPolicy,
  checkReads: checkAwsImportAccessReads,
  prepareCleanup: prepareAwsImportAccessCleanup,
  checkCleanup: checkAwsImportAccessCleanup
};

/** gg: wizard는 safe state와 connection ID만 받아 여덟 공개 API 경계 안에서 동작합니다. */
export function AwsImportAccessWizard({
  connectionId,
  connectionStatus,
  onContinue,
  onOpenSettings
}: {
  readonly connectionId: string;
  readonly connectionStatus: AwsConnectionStatus;
  readonly onContinue?: () => void;
  readonly onOpenSettings?: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const stateQuery = useAwsImportAccessQuery(connectionId);
  const [approval, setApproval] = useState<PolicyApproval | null>(null);
  const [consoleUrl, setConsoleUrl] = useState<string | null>(null);
  const [managerTemplateUrl, setManagerTemplateUrl] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // gg: mutation 응답의 signed URL은 local memory에서만 쓰고 query cache에는 넣지 않습니다.
  async function runCommand(command: AwsImportAccessUiCommand): Promise<void> {
    if (command === "open_settings") {
      onOpenSettings?.();
      return;
    }
    setIsBusy(true);
    setErrorMessage("");
    setCopyFeedback(null);
    setConsoleUrl(null);
    setManagerTemplateUrl(null);
    try {
      const result = await runAwsImportAccessCommandWithFailureRefresh({
        connectionId,
        execute: () => runAwsImportAccessCommand({
          api: AWS_IMPORT_ACCESS_COMMAND_API,
          approval,
          command,
          connectionId
        }),
        refreshState: (selectedConnectionId) => invalidateAwsImportAccessQueries(
          queryClient,
          user?.id,
          selectedConnectionId
        )
      });
      setApproval(result.approval);
      const nextConsoleUrl = result.response.consoleUrl ?? null;
      setConsoleUrl(nextConsoleUrl);
      setManagerTemplateUrl(result.response.managerTemplateUrl ?? null);
      if (nextConsoleUrl) {
        openAwsConsole(nextConsoleUrl);
      }
      await invalidateAwsImportAccessQueries(queryClient, user?.id, connectionId);
    } catch (error) {
      if (command === "apply_policy" || command === "preview_policy") {
        setApproval(null);
      }
      setErrorMessage(
        getAwsImportAccessErrorMessage(
          error,
          "AWS 가져오기 권한 요청을 처리하지 못했습니다."
        )
      );
    } finally {
      setIsBusy(false);
    }
  }

  // gg: Manager update Template URL은 화면에 쓰지 않고 사용자가 요청할 때만 복사합니다.
  async function copyManagerTemplate(): Promise<void> {
    if (!managerTemplateUrl) return;
    try {
      await copyTextToClipboard(managerTemplateUrl);
      setCopyFeedback("Manager Template 링크를 복사했습니다.");
    } catch (error) {
      setCopyFeedback(getAwsImportAccessErrorMessage(error, "링크를 복사하지 못했습니다."));
    }
  }

  if (stateQuery.isPending && !stateQuery.data) {
    return (
      <section aria-label="AWS 가져오기 권한" className={styles.importAccessCard}>
        <div className={styles.importAccessLoading} role="status">
          <LoaderCircle aria-hidden="true" size={18} />
          <span>가져오기 권한 상태를 확인하고 있습니다.</span>
        </div>
      </section>
    );
  }

  if (!stateQuery.data) {
    return (
      <section aria-label="AWS 가져오기 권한" className={styles.importAccessCard}>
        <div className={styles.importAccessError} role="alert">
          <strong>가져오기 권한 상태를 불러오지 못했습니다.</strong>
          <p>{getAwsImportAccessErrorMessage(
            stateQuery.error,
            "잠시 후 다시 시도해 주세요."
          )}</p>
          <button onClick={() => void stateQuery.refetch()} type="button">다시 시도</button>
        </div>
      </section>
    );
  }

  return (
    <AwsImportAccessWizardView
      canCopyManagerTemplate={managerTemplateUrl !== null}
      connectionStatus={connectionStatus}
      consoleUrl={consoleUrl}
      copyFeedback={copyFeedback}
      errorMessage={errorMessage}
      hasPolicyApproval={approval !== null}
      isBusy={isBusy}
      onCommand={(command) => void runCommand(command)}
      onCopyManagerTemplate={() => void copyManagerTemplate()}
      state={stateQuery.data.state}
      {...(onContinue ? { onContinue } : {})}
    />
  );
}

/** gg: command 실패 뒤 같은 연결을 한 번 다시 읽고 원래 오류는 안전한 UI 경계로 전달합니다. */
export async function runAwsImportAccessCommandWithFailureRefresh<Result>(input: {
  readonly connectionId: string;
  readonly execute: () => Promise<Result>;
  readonly refreshState: (connectionId: string) => Promise<void>;
}): Promise<Result> {
  try {
    return await input.execute();
  } catch (error) {
    try {
      await input.refreshState(input.connectionId);
    } catch {
      // gg: 상태 재조회 실패가 원래 command 오류를 덮거나 raw 진단을 노출하지 않게 합니다.
    }
    throw error;
  }
}

/** gg: provider 원문과 request 진단을 버린 뒤 공용 사용자 오류 번역만 적용합니다. */
export function getAwsImportAccessErrorMessage(
  error: unknown,
  fallbackMessage: string
): string {
  const redactedError = error instanceof Error
    ? new Error("AWS_IMPORT_ACCESS_DETAILS_REDACTED")
    : null;
  return getApiErrorMessage(redactedError, fallbackMessage, { developerMode: false });
}

/** gg: safe 상태만 사용자 문구로 렌더링하고 Stack·Role 내부 식별자는 읽지 않습니다. */
export function AwsImportAccessWizardView({
  canCopyManagerTemplate = false,
  connectionStatus,
  consoleUrl = null,
  copyFeedback = null,
  errorMessage = "",
  hasPolicyApproval = false,
  isBusy = false,
  onCommand,
  onContinue,
  onCopyManagerTemplate,
  state
}: {
  readonly canCopyManagerTemplate?: boolean;
  readonly connectionStatus: AwsConnectionStatus;
  readonly consoleUrl?: string | null;
  readonly copyFeedback?: string | null;
  readonly errorMessage?: string;
  readonly hasPolicyApproval?: boolean;
  readonly isBusy?: boolean;
  readonly onCommand: (command: AwsImportAccessUiCommand) => void;
  readonly onContinue?: () => void;
  readonly onCopyManagerTemplate?: () => void;
  readonly state: AwsImportAccessState;
}) {
  const view = deriveAwsImportAccessView({
    connectionStatus,
    hasPolicyApproval,
    state
  });
  const pending = isBusy || view.isBusy;

  return (
    <section
      aria-label="AWS 가져오기 권한"
      className={styles.importAccessCard}
      data-status={state.status}
    >
      <header className={styles.importAccessHeader}>
        <StatusIcon busy={pending} ready={state.status === "ready"} />
        <div>
          <span>AWS 구조 가져오기</span>
          <h3>{view.title}</h3>
          <p>{view.description}</p>
        </div>
      </header>

      {state.safeSummary ? <p className={styles.importAccessSummary}>{state.safeSummary}</p> : null}

      {state.status === "limited" && state.limitedServiceLabels.length > 0 ? (
        <div className={styles.importAccessLimited}>
          <strong>추가 확인이 필요한 정보</strong>
          <ul>
            {state.limitedServiceLabels.map((label) => <li key={label}>{label}</li>)}
          </ul>
        </div>
      ) : null}

      <div className={styles.importAccessPreserved}>
        <strong>기존 AWS 연결과 배포 권한은 그대로 유지됩니다.</strong>
        <ul>
          <li>기존 AWS 연결 Role 유지</li>
          <li>처음 만든 AWS 연결 Stack 유지</li>
          <li>기존 Terraform 배포 권한 유지</li>
        </ul>
      </div>

      {hasPolicyApproval ? (
        <div className={styles.importAccessApproval} role="group" aria-label="가져오기 권한 적용 확인">
          <strong>가져오기 권한 변경을 적용할까요?</strong>
          <p>가져오기에 필요한 읽기 범위만 추가하거나 업데이트합니다.</p>
        </div>
      ) : null}

      {errorMessage ? <p className={styles.importAccessError} role="alert">{errorMessage}</p> : null}

      {consoleUrl ? (
        <a
          className={styles.importAccessConsoleLink}
          href={consoleUrl}
          rel="noreferrer"
          target="_blank"
        >
          AWS Console 열기 <ExternalLink aria-hidden="true" size={15} />
        </a>
      ) : null}

      {canCopyManagerTemplate ? (
        <div className={styles.importAccessManagerUpdate}>
          <p>Manager의 업데이트를 선택한 뒤 복사한 업데이트 링크를 붙여 넣어 주세요.</p>
          <button
            className={styles.importAccessCopyAction}
            disabled={isBusy}
            onClick={onCopyManagerTemplate}
            type="button"
          >
            <Copy aria-hidden="true" size={15} /> Manager 업데이트 링크 복사
          </button>
        </div>
      ) : null}
      {copyFeedback ? <p className={styles.importAccessFeedback} role="status">{copyFeedback}</p> : null}

      <div className={styles.importAccessActions}>
        {view.cleanupAction && view.cleanupCommand ? (
          <button
            className={styles.importAccessCleanupAction}
            disabled={isBusy}
            onClick={() => onCommand(view.cleanupCommand!)}
            type="button"
          >
            {view.cleanupAction}
          </button>
        ) : null}
        {view.secondaryAction && view.secondaryCommand ? (
          <button
            disabled={isBusy}
            onClick={() => onCommand(view.secondaryCommand!)}
            type="button"
          >
            {view.secondaryAction}
          </button>
        ) : null}
        {view.primaryAction && view.primaryCommand ? (
          <button
            className={styles.importAccessPrimaryAction}
            disabled={isBusy}
            onClick={() => onCommand(view.primaryCommand!)}
            type="button"
          >
            {isBusy ? "처리 중…" : view.primaryAction}
          </button>
        ) : null}
        {view.canContinue && onContinue ? (
          <button
            className={styles.importAccessPrimaryAction}
            disabled={isBusy}
            onClick={onContinue}
            type="button"
          >
            {state.status === "limited"
              ? "제한된 정보로 계속 가져오기"
              : "같은 연결로 가져오기"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** gg: preview와 apply를 분리해 single-use 승인이 사용자 확인 없이 실행되지 않게 합니다. */
export async function runAwsImportAccessCommand(input: {
  readonly api: AwsImportAccessCommandApi;
  readonly approval: PolicyApproval | null;
  readonly command: Exclude<AwsImportAccessUiCommand, "open_settings">;
  readonly connectionId: string;
}): Promise<AwsImportAccessCommandResult> {
  switch (input.command) {
    case "prepare_manager":
      return { response: await input.api.prepareManager(input.connectionId), approval: null };
    case "check_manager":
      return { response: await input.api.checkManager(input.connectionId), approval: null };
    case "preview_policy": {
      const response = await input.api.previewPolicy(input.connectionId);
      return {
        response,
        approval: {
          approvalId: response.approvalId,
          operationId: response.operationId
        }
      };
    }
    case "apply_policy": {
      if (!input.approval) {
        throw new Error("권한 변경 내용을 다시 확인해 주세요.");
      }
      return {
        response: await input.api.applyPolicy({
          connectionId: input.connectionId,
          approvalId: input.approval.approvalId,
          operationId: input.approval.operationId
        }),
        approval: null
      };
    }
    case "check_reads":
      return { response: await input.api.checkReads(input.connectionId), approval: null };
    case "prepare_cleanup":
      return { response: await input.api.prepareCleanup(input.connectionId), approval: null };
    case "check_cleanup":
      return { response: await input.api.checkCleanup(input.connectionId), approval: null };
  }
}

/** gg: AWS Console은 새 탭으로 열고 현재 Settings 탭의 흐름은 유지합니다. */
function openAwsConsole(url: string): void {
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** gg: 진행·완료·주의 상태를 문구와 함께 구분해 아이콘만으로 의미를 전달하지 않습니다. */
function StatusIcon({ busy, ready }: { readonly busy: boolean; readonly ready: boolean }) {
  if (busy) return <LoaderCircle aria-hidden="true" size={20} />;
  if (ready) return <CheckCircle2 aria-hidden="true" size={20} />;
  return <AlertTriangle aria-hidden="true" size={20} />;
}
