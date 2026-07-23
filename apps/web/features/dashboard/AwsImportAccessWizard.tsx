"use client";

import { useQueryClient } from "@tanstack/react-query";
import type {
  AwsConnectionStatus,
  AwsImportAccessState
} from "@sketchcatch/types";
import {
  AlertTriangle,
  CheckCircle2,
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
  const [setupTemplateUrl, setSetupTemplateUrl] = useState<string | null>(null);
  const [setupLinkCopied, setSetupLinkCopied] = useState(false);
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
    setSetupLinkCopied(false);
    setConsoleUrl(null);
    setSetupTemplateUrl(null);
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
      setSetupTemplateUrl(result.response.managerTemplateUrl ?? null);
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
          "AWS 구조 분석 설정을 처리하지 못했습니다."
        )
      );
    } finally {
      setIsBusy(false);
    }
  }

  // gg: AWS 설정 링크는 현재 화면에만 두고 복사 뒤에도 기존 승인 순서를 바꾸지 않습니다.
  async function copySetupTemplate(): Promise<void> {
    if (!setupTemplateUrl) return;
    setIsBusy(true);
    setErrorMessage("");
    try {
      await copyTextToClipboard(setupTemplateUrl);
      setSetupLinkCopied(true);
    } catch (error) {
      setErrorMessage(getAwsImportAccessErrorMessage(error, "설정 링크를 복사하지 못했습니다."));
    } finally {
      setIsBusy(false);
    }
  }

  if (stateQuery.isPending && !stateQuery.data) {
    return (
      <section aria-label="AWS 구조 분석" className={styles.importAccessCard}>
        <div className={styles.importAccessLoading} role="status">
          <LoaderCircle aria-hidden="true" size={18} />
          <span>AWS 구조 분석 상태를 확인하고 있습니다.</span>
        </div>
      </section>
    );
  }

  if (!stateQuery.data) {
    return (
      <section aria-label="AWS 구조 분석" className={styles.importAccessCard}>
        <div className={styles.importAccessError} role="alert">
          <strong>AWS 구조 분석 상태를 불러오지 못했습니다.</strong>
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
      connectionStatus={connectionStatus}
      consoleUrl={consoleUrl}
      errorMessage={errorMessage}
      hasPolicyApproval={approval !== null}
      isBusy={isBusy}
      onCommand={(command) => void runCommand(command)}
      onCopySetupTemplate={() => void copySetupTemplate()}
      setupLinkCopied={setupLinkCopied}
      setupTemplateUrl={setupTemplateUrl}
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

type AwsStructureAnalysisAction =
  | { readonly kind: "command"; readonly command: AwsImportAccessUiCommand; readonly label: string }
  | { readonly kind: "continue"; readonly label: string }
  | { readonly kind: "copy_setup_link"; readonly label: string };

type AwsStructureAnalysisPresentation = {
  readonly title: string;
  readonly description: string;
};

/** gg: 구조 분석 설정의 내부 단계는 숨기고 사용자가 지금 해야 할 일만 짧게 보여줍니다. */
function getAwsStructureAnalysisPresentation(input: {
  readonly connectionStatus: AwsConnectionStatus;
  readonly hasPolicyApproval: boolean;
  readonly state: AwsImportAccessState;
}): AwsStructureAnalysisPresentation {
  const { connectionStatus, hasPolicyApproval, state } = input;
  if (connectionStatus !== "verified" && !isAwsStructureAnalysisCleanupState(state)) {
    return {
      title: "AWS 연결 확인 필요",
      description: "구조 분석을 시작하기 전에 AWS 연결을 먼저 확인해 주세요."
    };
  }
  if (hasPolicyApproval) {
    return {
      title: "설정 내용 확인",
      description: "구조 분석에 필요한 설정을 적용할까요?"
    };
  }

  switch (state.status) {
    case "check_required":
    case "manager_approval_required":
    case "policy_approval_required":
    case "update_required":
      return {
        title: "설정 필요",
        description: "기존 AWS 구조를 분석하려면 AWS에서 설정해 주세요."
      };
    case "manager_checking":
    case "policy_working":
    case "checking_reads":
      return {
        title: "처리 중",
        description: "상태를 확인하고 있습니다."
      };
    case "ready":
      return {
        title: "사용 가능",
        description: "이 AWS 연결로 기존 AWS 구조를 분석할 수 있습니다."
      };
    case "limited":
      return {
        title: "일부 정보 제한",
        description: "기본 구조는 분석할 수 있지만 일부 정보는 보이지 않을 수 있습니다."
      };
    case "retry_required":
      return {
        title: "다시 확인 필요",
        description: "잠시 후 상태를 다시 확인해 주세요."
      };
    case "connection_required":
      return {
        title: "AWS 연결 확인 필요",
        description: "구조 분석을 시작하기 전에 AWS 연결을 먼저 확인해 주세요."
      };
    case "cleanup_policy_required":
    case "cleanup_manager_required":
      return {
        title: "해제 필요",
        description: "AWS 연결을 해제하려면 구조 분석 설정을 먼저 해제해 주세요."
      };
    case "cleanup_checking":
      return {
        title: "처리 중",
        description: "구조 분석 설정이 해제됐는지 확인하고 있습니다."
      };
    case "cleanup_required":
      return state.nextAction === "prepare_manager"
        ? {
          title: "설정 필요",
          description: "기존 AWS 구조를 분석하려면 AWS에서 설정해 주세요."
        }
        : {
          title: "해제 확인 필요",
          description: "구조 분석 설정이 남아 있는지 확인해 주세요."
        };
    case "cleanup_complete":
      return {
        title: "설정 해제됨",
        description: "구조 분석 설정이 해제되었습니다."
      };
  }
}

/** gg: 정리 상태에서도 안전한 해제 순서를 유지하려고 연결 상태보다 먼저 구분합니다. */
function isAwsStructureAnalysisCleanupState(state: AwsImportAccessState): boolean {
  return state.status === "cleanup_policy_required" ||
    state.status === "cleanup_manager_required" ||
    state.status === "cleanup_checking" ||
    state.status === "cleanup_required" ||
    state.status === "cleanup_complete";
}

/** gg: 설정·확인·해제·복귀 중 현재 상태에 맞는 행동 하나만 남겨 중복 실행을 막습니다. */
function selectAwsStructureAnalysisAction(input: {
  readonly hasPolicyApproval: boolean;
  readonly onContinue: (() => void) | undefined;
  readonly setupLinkCopied: boolean;
  readonly setupTemplateUrl: string | null;
  readonly state: AwsImportAccessState;
  readonly view: ReturnType<typeof deriveAwsImportAccessView>;
}): AwsStructureAnalysisAction | null {
  const { hasPolicyApproval, onContinue, setupLinkCopied, setupTemplateUrl, state, view } = input;
  if (view.isBusy) return null;
  if (view.canContinue && onContinue) {
    return {
      kind: "continue",
      label: state.status === "limited" ? "제한된 정보로 계속" : "구조 분석 계속"
    };
  }
  if (setupTemplateUrl && !setupLinkCopied && view.primaryCommand === "check_manager") {
    return { kind: "copy_setup_link", label: "설정 링크 복사" };
  }
  const command = view.primaryCommand ?? view.cleanupCommand;
  if (!command) return null;
  return {
    kind: "command",
    command,
    label: getAwsStructureAnalysisActionLabel(command, hasPolicyApproval)
  };
}

/** gg: API command 이름을 노출하지 않고 사용자가 이해할 수 있는 한 가지 행동으로 바꿉니다. */
function getAwsStructureAnalysisActionLabel(
  command: AwsImportAccessUiCommand,
  hasPolicyApproval: boolean
): string {
  switch (command) {
    case "prepare_manager": return "AWS에서 설정";
    case "check_manager": return "설정 완료 후 확인";
    case "preview_policy": return "설정 내용 확인";
    case "apply_policy": return hasPolicyApproval ? "설정 적용" : "설정 내용 확인";
    case "check_reads": return "상태 다시 확인";
    case "open_settings": return "AWS 연결 확인";
    case "prepare_cleanup": return "구조 분석 설정 해제";
    case "check_cleanup": return "해제 상태 확인";
  }
}

/** gg: 내부 상태 이름을 DOM에 남기지 않고 사용자가 보는 경고 색만 안전하게 고릅니다. */
function getAwsStructureAnalysisTone(state: AwsImportAccessState): "default" | "ready" | "warning" {
  if (state.status === "ready") return "ready";
  if (
    state.status === "limited" ||
    state.status === "retry_required" ||
    isAwsStructureAnalysisCleanupState(state)
  ) {
    return "warning";
  }
  return "default";
}

/** gg: safe 상태만 간결한 구조 분석 패널로 렌더링하고 내부 AWS 식별자는 읽지 않습니다. */
export function AwsImportAccessWizardView({
  connectionStatus,
  consoleUrl = null,
  errorMessage = "",
  hasPolicyApproval = false,
  isBusy = false,
  onCommand,
  onContinue,
  onCopySetupTemplate,
  setupLinkCopied = false,
  setupTemplateUrl = null,
  state
}: {
  readonly connectionStatus: AwsConnectionStatus;
  readonly consoleUrl?: string | null;
  readonly errorMessage?: string;
  readonly hasPolicyApproval?: boolean;
  readonly isBusy?: boolean;
  readonly onCommand: (command: AwsImportAccessUiCommand) => void;
  readonly onContinue?: () => void;
  readonly onCopySetupTemplate?: () => void;
  readonly setupLinkCopied?: boolean;
  readonly setupTemplateUrl?: string | null;
  readonly state: AwsImportAccessState;
}) {
  const view = deriveAwsImportAccessView({
    connectionStatus,
    hasPolicyApproval,
    state
  });
  const pending = isBusy || view.isBusy;
  const presentation = getAwsStructureAnalysisPresentation({
    connectionStatus,
    hasPolicyApproval,
    state
  });
  const action = selectAwsStructureAnalysisAction({
    hasPolicyApproval,
    onContinue,
    setupLinkCopied,
    setupTemplateUrl,
    state,
    view
  });

  if (pending) {
    return (
      <section
        aria-busy="true"
        aria-label="AWS 구조 분석"
        className={styles.importAccessCard}
        data-tone={getAwsStructureAnalysisTone(state)}
      >
        <header className={styles.importAccessHeader} role="status">
          <StatusIcon busy ready={false} />
          <div>
            <span>AWS 구조 분석</span>
            <h3>처리 중</h3>
            <p>상태를 확인하고 있습니다.</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section
      aria-label="AWS 구조 분석"
      className={styles.importAccessCard}
      data-tone={getAwsStructureAnalysisTone(state)}
    >
      <header className={styles.importAccessHeader}>
        <StatusIcon busy={false} ready={state.status === "ready"} />
        <div>
          <span>AWS 구조 분석</span>
          <h3>{presentation.title}</h3>
          <p>{presentation.description}</p>
        </div>
      </header>

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

      {action ? (
        <div className={styles.importAccessActions}>
          {action.kind === "command" ? (
            <button
              className={styles.importAccessPrimaryAction}
              onClick={() => onCommand(action.command)}
              type="button"
            >
              {action.label}
            </button>
          ) : action.kind === "continue" ? (
            <button
              className={styles.importAccessPrimaryAction}
              onClick={onContinue}
              type="button"
            >
              {action.label}
            </button>
          ) : (
            <button
              className={styles.importAccessPrimaryAction}
              onClick={() => onCopySetupTemplate?.()}
              type="button"
            >
              {action.label}
            </button>
          )}
        </div>
      ) : null}
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
        throw new Error("설정 내용을 다시 확인해 주세요.");
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
