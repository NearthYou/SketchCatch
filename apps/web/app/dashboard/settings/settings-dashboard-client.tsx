"use client";

import { CheckCircle2, Cloud, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  AwsConnection,
  AwsConnectionCloudFormationTemplateResponse,
  CreateAwsConnectionResponse
} from "@sketchcatch/types";
import { ProductState } from "../../../components/ui/ProductState";
import {
  DashboardSelectField,
  type DashboardSelectOption
} from "../../../components/ui/DashboardSelectField";
import {
  createAwsConnectionSetup,
  deleteAwsConnection,
  getAwsConnectionCloudFormationTemplate,
  listAwsConnections,
  testAwsConnection,
  verifyAwsConnectionCreatedRole
} from "../../../features/workspace/api";
import styles from "../dashboard-tools.module.css";

type SettingsLoadState = "loading" | "ready" | "error";

const AWS_REGION_OPTIONS: readonly DashboardSelectOption[] = [
  { label: "서울", value: "ap-northeast-2" },
  { label: "버지니아 북부", value: "us-east-1" },
  { label: "도쿄", value: "ap-northeast-1" }
];

// AWS Role 생성 안내, CloudFormation 이동, 연결 검증과 삭제를 관리합니다.
export function SettingsDashboardClient() {
  const [connections, setConnections] = useState<readonly AwsConnection[]>([]);
  const [loadState, setLoadState] = useState<SettingsLoadState>("loading");
  const [actionPending, setActionPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [region, setRegion] = useState("ap-northeast-2");
  const [setup, setSetup] = useState<CreateAwsConnectionResponse | null>(null);
  const [cloudFormation, setCloudFormation] = useState<AwsConnectionCloudFormationTemplateResponse | null>(null);
  const [accountId, setAccountId] = useState("");
  const [deleteCandidateId, setDeleteCandidateId] = useState("");

  // 저장된 AWS 연결 목록을 다시 읽고 현재 상태를 최신으로 맞춥니다.
  async function loadConnections(): Promise<void> {
    setErrorMessage("");
    try {
      setConnections(await listAwsConnections());
      setLoadState("ready");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "AWS 연결을 불러오지 못했습니다.");
      setLoadState("error");
    }
  }

  // 새 연결의 External ID와 Role 이름을 만들고 CloudFormation 실행 정보를 준비합니다.
  async function createConnection(): Promise<void> {
    setActionPending(true);
    setErrorMessage("");
    try {
      const created = await createAwsConnectionSetup({ region });
      const template = await getAwsConnectionCloudFormationTemplate({
        connectionId: created.awsConnection.id
      });
      setSetup(created);
      setCloudFormation(template);
      await loadConnections();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "AWS 연결 준비에 실패했습니다.");
    } finally {
      setActionPending(false);
    }
  }

  // CloudFormation에서 Role을 만든 뒤 AWS 계정 ID로 AssumeRole 연결을 검증합니다.
  async function verifyCreatedRole(): Promise<void> {
    if (!setup || !/^\d{12}$/.test(accountId)) return;
    setActionPending(true);
    setErrorMessage("");
    try {
      await verifyAwsConnectionCreatedRole({
        connectionId: setup.awsConnection.id,
        accountId
      });
      setSetup(null);
      setCloudFormation(null);
      setAccountId("");
      await loadConnections();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "AWS Role 검증에 실패했습니다.");
    } finally {
      setActionPending(false);
    }
  }

  // 이미 검증된 Role이 실제로 AssumeRole 가능한지 다시 확인합니다.
  async function retestConnection(connection: AwsConnection): Promise<void> {
    if (!connection.roleArn) return;
    setActionPending(true);
    setErrorMessage("");
    try {
      await testAwsConnection({ connectionId: connection.id, roleArn: connection.roleArn });
      await loadConnections();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "AWS 연결 테스트에 실패했습니다.");
    } finally {
      setActionPending(false);
    }
  }

  // 같은 삭제 버튼을 한 번 더 눌렀을 때만 AWS 연결 기록을 삭제합니다.
  async function removeConnection(connectionId: string): Promise<void> {
    if (deleteCandidateId !== connectionId) {
      setDeleteCandidateId(connectionId);
      return;
    }
    setActionPending(true);
    setErrorMessage("");
    try {
      await deleteAwsConnection(connectionId);
      setDeleteCandidateId("");
      await loadConnections();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "AWS 연결을 삭제하지 못했습니다.");
    } finally {
      setActionPending(false);
    }
  }

  // 화면 진입 시 기존 연결을 한 번 불러옵니다.
  useEffect(() => {
    void loadConnections();
  }, []);

  if (loadState === "loading") {
    return <ProductState description="AWS Role 연결 상태를 확인하고 있습니다." kind="loading" title="환경설정 불러오는 중" />;
  }

  if (loadState === "error" && connections.length === 0) {
    return <ProductState action={<button onClick={() => void loadConnections()} type="button">다시 시도</button>} description={errorMessage} kind="error" title="환경설정을 불러오지 못했습니다" />;
  }

  return (
    <div className="dashboardRouteStack">
      <header className="dashboardPageHeader">
        <div><p className="dashboardEyebrow">AWS Role</p><h1>Settings</h1></div>
        <button className={styles.iconAction} aria-label="연결 새로고침" onClick={() => void loadConnections()} title="새로고침" type="button"><RefreshCw size={17} /></button>
      </header>

      {errorMessage ? <p className={styles.errorBand}>{errorMessage}</p> : null}

      <section className={styles.settingsSection}>
        <header><Cloud size={20} /><div><h2>AWS 계정 연결</h2><p>Access Key 대신 한 번 만든 Role을 사용합니다.</p></div></header>
        <div className={styles.controlRow}>
          <DashboardSelectField
            ariaLabel="기본 region 선택"
            className={styles.controlField}
            emptyLabel="region 선택"
            label="기본 region"
            onChange={setRegion}
            options={AWS_REGION_OPTIONS}
            value={region}
          />
          <button className={styles.primaryAction} disabled={actionPending} onClick={() => void createConnection()} type="button">새 AWS 연결</button>
        </div>
      </section>

      {setup && cloudFormation ? (
        <section className={styles.setupSection}>
          <div><span>1</span><div><strong>CloudFormation으로 Role 만들기</strong><p>{cloudFormation.roleName}</p></div></div>
          {cloudFormation.launchStackUrl ? <a href={cloudFormation.launchStackUrl} rel="noreferrer" target="_blank">AWS Console 열기 <ExternalLink size={15} /></a> : <pre>{cloudFormation.templateBody}</pre>}
          <div><span>2</span><label><strong>AWS 계정 ID 확인</strong><input inputMode="numeric" maxLength={12} onChange={(event) => setAccountId(event.target.value.replace(/\D/g, ""))} placeholder="12자리 계정 ID" value={accountId} /></label></div>
          <button className={styles.primaryAction} disabled={actionPending || !/^\d{12}$/.test(accountId)} onClick={() => void verifyCreatedRole()} type="button">Role 연결 확인</button>
        </section>
      ) : null}

      <section className={styles.connectionList}>
        <div className={styles.sectionHeading}><h2>연결된 AWS 계정</h2><span>{connections.length}개</span></div>
        {connections.length === 0 ? <p>아직 연결된 AWS 계정이 없습니다.</p> : connections.map((connection) => <article key={connection.id}><div className={styles.connectionStatus} data-status={connection.status}>{connection.status === "verified" ? <CheckCircle2 size={16} /> : <Cloud size={16} />}<span>{connection.status === "verified" ? "검증됨" : "확인 필요"}</span></div><div><strong>{connection.accountId ?? "계정 확인 전"}</strong><p>{connection.region} · {connection.roleArn ?? "Role ARN 없음"}</p></div><div className={styles.rowActions}>{connection.status === "verified" ? <button disabled={actionPending} onClick={() => void retestConnection(connection)} type="button">연결 테스트</button> : null}<button data-danger={deleteCandidateId === connection.id} disabled={actionPending} onClick={() => void removeConnection(connection.id)} type="button"><Trash2 size={15} />{deleteCandidateId === connection.id ? "한 번 더 눌러 삭제" : "삭제"}</button></div></article>)}
      </section>
    </div>
  );
}
