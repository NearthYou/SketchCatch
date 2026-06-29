"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AwsConnection,
  AwsConnectionCloudFormationTemplateResponse,
  CreateAwsConnectionResponse,
  TestAwsConnectionResponse
} from "@sketchcatch/types";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import {
  createAwsConnectionSetup,
  deleteAwsConnection,
  getAwsConnectionCloudFormationTemplate,
  listAwsConnections,
  testAwsConnection,
  verifyAwsConnection,
  verifyAwsConnectionCreatedRole
} from "../../features/workspace/api";
import { getApiErrorMessage } from "../../lib/api-client";

type SettingsTab = "github" | "aws";
type RequestState = "idle" | "loading" | "error";

const awsRegion = "ap-northeast-2";

export function SettingsIntegrationsClient() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("aws");
  const [isGithubConnected, setIsGithubConnected] = useState(false);
  const [awsConnections, setAwsConnections] = useState<AwsConnection[]>([]);
  const [setup, setSetup] = useState<CreateAwsConnectionResponse | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [roleArn, setRoleArn] = useState("");
  const [template, setTemplate] = useState<AwsConnectionCloudFormationTemplateResponse | null>(null);
  const [testResult, setTestResult] = useState<TestAwsConnectionResponse | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [isAddingAwsConnection, setIsAddingAwsConnection] = useState(false);

  const selectedConnection = useMemo(
    () => awsConnections.find((connection) => connection.id === selectedConnectionId) ?? null,
    [awsConnections, selectedConnectionId]
  );
  const activeConnection = setup?.awsConnection ?? selectedConnection;
  const verifiedAwsConnectionCount = awsConnections.filter(
    (connection) => connection.status === "verified"
  ).length;
  const hasVerifiedAwsConnection = verifiedAwsConnectionCount > 0;
  const shouldShowAwsSetupControls =
    !hasVerifiedAwsConnection || isAddingAwsConnection || activeConnection?.status !== "verified";
  const expectedRoleArn =
    /^\d{12}$/.test(accountId.trim())
      ? `arn:aws:iam::${accountId.trim()}:role/${setup?.recommendedRoleName ?? "SketchCatchTerraformExecutionRole"}`
      : "";

  useEffect(() => {
    let cancelled = false;

    async function loadConnections(): Promise<void> {
      await runRequest(async () => {
        const nextConnections = await listAwsConnections();

        if (cancelled) {
          return;
        }

        const preferredConnection =
          nextConnections.find((connection) => connection.status === "verified") ?? nextConnections[0];

        setAwsConnections(nextConnections);
        setSelectedConnectionId(preferredConnection?.id ?? "");
        setAccountId(preferredConnection?.accountId ?? "");
        setRoleArn(preferredConnection?.roleArn ?? "");
        setSetup(null);
        setTemplate(null);
        setTestResult(null);
        setIsAddingAwsConnection(false);
      }, "AWS 계정 연결 목록을 불러오지 못했습니다.");
    }

    void loadConnections();

    return () => {
      cancelled = true;
    };
  }, []);

  async function runRequest(request: () => Promise<void>, fallbackMessage: string): Promise<void> {
    setRequestState("loading");
    setErrorMessage("");

    try {
      await request();
      setRequestState("idle");
    } catch (error) {
      setRequestState("error");
      setErrorMessage(getApiErrorMessage(error, fallbackMessage));
    }
  }

  async function startAwsSetup(): Promise<void> {
    const launchWindow = openAwsConsolePlaceholder();
    let didLaunchConsole = false;

    await runRequest(async () => {
      const response = await createAwsConnectionSetup({
        region: awsRegion
      });
      const templateResponse = await getAwsConnectionCloudFormationTemplate({
        connectionId: response.awsConnection.id
      });

      setSetup(response);
      setAwsConnections((currentConnections) => [response.awsConnection, ...currentConnections]);
      setSelectedConnectionId(response.awsConnection.id);
      setAccountId("");
      setRoleArn("");
      setTemplate(templateResponse);
      setTestResult(null);
      setIsAddingAwsConnection(true);

      if (templateResponse.launchStackUrl) {
        openAwsConsoleUrl(templateResponse.launchStackUrl, launchWindow);
        didLaunchConsole = true;
      } else {
        launchWindow?.close();
      }
    }, "AWS 계정 연결 설정을 시작하지 못했습니다.");
    if (!didLaunchConsole) {
      launchWindow?.close();
    }
  }

  async function loadAndOpenCloudFormationTemplate(): Promise<void> {
    if (!activeConnection) {
      return;
    }

    const launchWindow = openAwsConsolePlaceholder();
    let didLaunchConsole = false;

    await runRequest(async () => {
      const response = await getAwsConnectionCloudFormationTemplate({
        connectionId: activeConnection.id
      });

      setTemplate(response);

      if (response.launchStackUrl) {
        openAwsConsoleUrl(response.launchStackUrl, launchWindow);
        didLaunchConsole = true;
      } else {
        launchWindow?.close();
      }
    }, "CloudFormation 템플릿을 불러오지 못했습니다.");

    if (!didLaunchConsole) {
      launchWindow?.close();
    }
  }

  async function runAwsConnectionTest(): Promise<void> {
    if (!activeConnection || !roleArn.trim()) {
      return;
    }

    await runRequest(async () => {
      const response = await testAwsConnection({
        connectionId: activeConnection.id,
        roleArn: roleArn.trim()
      });

      setTestResult(response);
    }, "AWS 연결 테스트에 실패했습니다.");
  }

  async function storeVerifiedConnection(): Promise<void> {
    if (!activeConnection || !roleArn.trim()) {
      return;
    }

    await runRequest(async () => {
      const response = await verifyAwsConnection({
        connectionId: activeConnection.id,
        roleArn: roleArn.trim()
      });

      setTestResult(response);
      setSetup(null);
      setAwsConnections((currentConnections) =>
        currentConnections.map((connection) =>
          connection.id === response.awsConnection.id ? response.awsConnection : connection
        )
      );
      setSelectedConnectionId(response.awsConnection.id);
      setAccountId(response.awsConnection.accountId ?? "");
      setRoleArn(response.awsConnection.roleArn ?? "");
      setTemplate(null);
      setIsAddingAwsConnection(false);
    }, "AWS 연결 검증 저장에 실패했습니다.");
  }

  async function storeVerifiedConnectionFromAccountId(): Promise<void> {
    if (!activeConnection || !/^\d{12}$/.test(accountId.trim())) {
      return;
    }

    await runRequest(async () => {
      const response = await verifyAwsConnectionCreatedRole({
        connectionId: activeConnection.id,
        accountId: accountId.trim()
      });

      setTestResult(response);
      setSetup(null);
      setAwsConnections((currentConnections) =>
        currentConnections.map((connection) =>
          connection.id === response.awsConnection.id ? response.awsConnection : connection
        )
      );
      setSelectedConnectionId(response.awsConnection.id);
      setAccountId(response.awsConnection.accountId ?? "");
      setRoleArn(response.awsConnection.roleArn ?? "");
      setTemplate(null);
      setIsAddingAwsConnection(false);
    }, "AWS 연결 검증 저장에 실패했습니다.");
  }

  async function deleteSelectedAwsConnection(): Promise<void> {
    if (!selectedConnection) {
      return;
    }

    const confirmed = window.confirm(
      "이 AWS 연결을 삭제할까요? SketchCatch의 연결 기록만 삭제되고, AWS IAM Role이나 CloudFormation Stack은 삭제되지 않습니다."
    );

    if (!confirmed) {
      return;
    }

    const deletedConnectionId = selectedConnection.id;

    await runRequest(async () => {
      await deleteAwsConnection(deletedConnectionId);

      const nextConnections = awsConnections.filter(
        (connection) => connection.id !== deletedConnectionId
      );
      const preferredConnection =
        nextConnections.find((connection) => connection.status === "verified") ?? nextConnections[0];

      setAwsConnections(nextConnections);
      setSelectedConnectionId(preferredConnection?.id ?? "");
      setAccountId(preferredConnection?.accountId ?? "");
      setRoleArn(preferredConnection?.roleArn ?? "");
      setSetup(null);
      setTemplate(null);
      setTestResult(null);
      setIsAddingAwsConnection(false);
    }, "AWS 연결 삭제에 실패했습니다.");
  }

  return (
    <>
      <div className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Settings</p>
          <h1>환경설정</h1>
        </div>
      </div>

      <div className="settingsTabs" role="tablist" aria-label="연동 설정">
        <button
          aria-selected={activeTab === "aws"}
          className={activeTab === "aws" ? "settingsTab settingsTabActive" : "settingsTab"}
          onClick={() => setActiveTab("aws")}
          role="tab"
          type="button"
        >
          <DashboardIcon name="cloud" />
          <span>AWS</span>
        </button>
        <button
          aria-selected={activeTab === "github"}
          className={activeTab === "github" ? "settingsTab settingsTabActive" : "settingsTab"}
          onClick={() => setActiveTab("github")}
          role="tab"
          type="button"
        >
          <DashboardIcon name="github" />
          <span>GitHub</span>
        </button>
      </div>

      {activeTab === "github" ? (
        <section className="dashboardPanel integrationPanel" aria-labelledby="github-settings-title">
          <div className="integrationHeader">
            <span className="integrationIcon">
              <DashboardIcon name="github" />
            </span>
            <div>
              <p className="dashboardPanelKicker">GitHub</p>
              <h2 id="github-settings-title">GitHub 계정 연동</h2>
            </div>
          </div>
          <p>Terraform export와 저장소 동기화를 위한 자리입니다. AWS 배포 연결과는 분리됩니다.</p>
          <div className="integrationStatus">
            <span className={isGithubConnected ? "statusDot statusDotConnected" : "statusDot"} />
            {isGithubConnected ? "연동됨" : "연동 전"}
          </div>
          <button
            className="dashboardTopbarAction"
            onClick={() => setIsGithubConnected((current) => !current)}
            type="button"
          >
            <DashboardIcon name={isGithubConnected ? "check" : "link"} />
            <span>{isGithubConnected ? "연동 해제" : "GitHub 연동"}</span>
          </button>
        </section>
      ) : (
        <section className="dashboardPanel integrationPanel" aria-labelledby="aws-settings-title">
          <div className="integrationHeader">
            <span className="integrationIcon integrationIconAws">
              <DashboardIcon name="cloud" />
            </span>
            <div>
              <p className="dashboardPanelKicker">AWS Role</p>
              <h2 id="aws-settings-title">AWS 계정 연결</h2>
            </div>
          </div>

          <p>
            SketchCatch가 발급한 External ID와 CloudFormation 템플릿으로 사용자 AWS 계정에
            Role을 한 번 만들고, 검증된 Role ARN만 저장합니다. 프로젝트에서는 이 연결을 선택해서
            배포에 재사용합니다.
          </p>

          <div className="settingsGrid">
            <label className="settingsField">
              AWS 계정 연결
              <select
                disabled={awsConnections.length === 0}
                onChange={(event) => {
                  const nextConnection = awsConnections.find(
                    (connection) => connection.id === event.target.value
                  );

                  setSelectedConnectionId(event.target.value);
                  setAccountId(nextConnection?.accountId ?? "");
                  setRoleArn(nextConnection?.roleArn ?? "");
                  setSetup(null);
                  setTemplate(null);
                  setTestResult(null);
                  setIsAddingAwsConnection(false);
                }}
                value={selectedConnectionId}
              >
                {awsConnections.length === 0 ? (
                  <option value="">연결 없음</option>
                ) : (
                  awsConnections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.status} | {connection.accountId ?? "account 미확인"} |{" "}
                      {formatDate(connection.updatedAt)}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          <div className="integrationStatus">
            <span className={hasVerifiedAwsConnection ? "statusDot statusDotConnected" : "statusDot"} />
            {hasVerifiedAwsConnection
              ? `검증된 연결 ${verifiedAwsConnectionCount}개`
              : "검증된 연결 없음"}
          </div>

          {hasVerifiedAwsConnection ? (
            <div className="settingsActionRow">
              <button
                className="dashboardSecondaryButton"
                disabled={requestState === "loading" || isAddingAwsConnection}
                onClick={startAwsSetup}
                type="button"
              >
                <DashboardIcon name="plus" />
                <span>{isAddingAwsConnection ? "새 연결 생성 중" : "다른 AWS 계정 연결"}</span>
              </button>
              <button
                className="dashboardDangerButton"
                disabled={!selectedConnection || requestState === "loading"}
                onClick={deleteSelectedAwsConnection}
                type="button"
              >
                <DashboardIcon name="trash" />
                <span>연결 삭제</span>
              </button>
            </div>
          ) : null}

          {shouldShowAwsSetupControls ? (
            <div className="settingsActionRow">
              {!hasVerifiedAwsConnection ? (
                <button
                  className="dashboardTopbarAction"
                  disabled={requestState === "loading"}
                  onClick={startAwsSetup}
                  type="button"
                >
                  <DashboardIcon name="link" />
                  <span>새 AWS 연결 시작</span>
                </button>
              ) : null}
              <button
                className="dashboardSecondaryButton"
                disabled={!activeConnection || requestState === "loading"}
                onClick={loadAndOpenCloudFormationTemplate}
                type="button"
              >
                <DashboardIcon name="cloud" />
                <span>AWS 콘솔 열기</span>
              </button>
            </div>
          ) : null}

          {activeConnection ? (
            <div className="settingsInfoGrid">
              <InfoItem label="Region" value={activeConnection.region} />
              <InfoItem label="External ID" value={activeConnection.externalId} />
              <InfoItem label="Status" value={activeConnection.status} />
              <InfoItem label="Account ID" value={activeConnection.accountId ?? "아직 확인 전"} />
            </div>
          ) : null}

          {shouldShowAwsSetupControls && setup ? (
            <div className="settingsCodeBlock">
              <div>
                <p className="dashboardPanelKicker">Trust Policy</p>
                <h2>사용자 AWS Role에 들어갈 값</h2>
              </div>
              <pre>{JSON.stringify(setup.roleSetup.trustPolicy, null, 2)}</pre>
            </div>
          ) : null}

          {shouldShowAwsSetupControls && template ? (
            <div className="settingsCodeBlock">
              <div className="dashboardPanelHeader">
                <div>
                  <p className="dashboardPanelKicker">CloudFormation</p>
                  <h2>{template.stackName}</h2>
                </div>
                {template.launchStackUrl ? (
                  <a
                    className="dashboardTopbarAction"
                    href={template.launchStackUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <DashboardIcon name="cloud" />
                    <span>AWS 콘솔에서 생성</span>
                  </a>
                ) : null}
              </div>
              <textarea className="settingsCodeArea" readOnly rows={12} value={template.templateBody} />
            </div>
          ) : null}

          {shouldShowAwsSetupControls ? (
            <>
              <label className="settingsField">
                AWS Account ID
                <input
                  inputMode="numeric"
                  maxLength={12}
                  onChange={(event) => setAccountId(event.target.value.replace(/\D/g, "").slice(0, 12))}
                  placeholder="123456789012"
                  value={accountId}
                />
              </label>

              {expectedRoleArn ? (
                <div className="settingsInfoGrid">
                  <InfoItem label="Expected Role ARN" value={expectedRoleArn} />
                </div>
              ) : null}

              <div className="settingsActionRow">
                <button
                  className="dashboardTopbarAction"
                  disabled={!activeConnection || accountId.trim().length !== 12 || requestState === "loading"}
                  onClick={storeVerifiedConnectionFromAccountId}
                  type="button"
                >
                  <DashboardIcon name="check" />
                  <span>CloudFormation Role 검증</span>
                </button>
              </div>

              <label className="settingsField">
                AWS Role ARN
                <input
                  onChange={(event) => setRoleArn(event.target.value)}
                  placeholder="arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole"
                  value={roleArn}
                />
              </label>

              <div className="settingsActionRow">
                <button
                  className="dashboardSecondaryButton"
                  disabled={!activeConnection || roleArn.trim().length === 0 || requestState === "loading"}
                  onClick={runAwsConnectionTest}
                  type="button"
                >
                  <DashboardIcon name="check" />
                  <span>연결 테스트</span>
                </button>
                <button
                  className="dashboardTopbarAction"
                  disabled={!activeConnection || roleArn.trim().length === 0 || requestState === "loading"}
                  onClick={storeVerifiedConnection}
                  type="button"
                >
                  <DashboardIcon name="check" />
                  <span>검증 저장</span>
                </button>
              </div>
            </>
          ) : null}

          {shouldShowAwsSetupControls && testResult ? (
            <div className="settingsInfoGrid">
              <InfoItem label="STS Account" value={testResult.accountId} />
              <InfoItem label="Caller ARN" value={testResult.callerArn} />
              <InfoItem label="Region" value={testResult.region} />
            </div>
          ) : null}

          {requestState === "loading" ? <p className="dashboardMessage">요청을 처리하는 중입니다.</p> : null}
          {requestState === "error" ? (
            <p className="dashboardMessage" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </section>
      )}
    </>
  );
}

function InfoItem({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function openAwsConsolePlaceholder(): Window | null {
  if (typeof window === "undefined") {
    return null;
  }

  const nextWindow = window.open("about:blank", "_blank");

  if (nextWindow) {
    nextWindow.document.write("<p>Opening AWS console...</p>");
    nextWindow.document.close();
    nextWindow.opener = null;
  }

  return nextWindow;
}

function openAwsConsoleUrl(url: string, targetWindow: Window | null): void {
  if (targetWindow) {
    targetWindow.location.href = url;
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
