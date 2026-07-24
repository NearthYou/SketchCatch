"use client";

import type { FormEvent } from "react";
import type { ReverseEngineeringResourceSelection } from "../../../../packages/types/src";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import {
  isReverseEngineeringResourceSelectionChecked,
  REVERSE_ENGINEERING_RESOURCE_SELECTIONS
} from "./reverse-engineering-resource-types";
import { useReverseEngineeringWorkflow } from "./useReverseEngineeringWorkflow";

type ReverseEngineeringPanelProps = {
  readonly context: DiagramEditorPanelContext;
  readonly createProjectOnApply?: boolean | undefined;
  readonly projectId: string;
  readonly projectName: string;
};

// Reverse Engineering의 실행 기능을 최소한의 의미 HTML에 연결합니다.
export function ReverseEngineeringPanel(props: ReverseEngineeringPanelProps) {
  const workflow = useReverseEngineeringWorkflow(props);
  const result = workflow.selectedCandidateResponse?.result ?? null;
  const requiresSettings =
    result?.coverage?.unavailableServices.some((service) => service.remedy === "open_settings") ||
    result?.scanErrors.some(
      (scanError) =>
        scanError.reason === "permission_denied" ||
        scanError.reason === "not_configured" ||
        scanError.reason === "invalid_region" ||
        scanError.reason === "expired_credential"
    );

  // form submit을 기존 스캔 시작 동작으로 연결합니다.
  function handleScanSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void workflow.runScan();
  }

  // 선택값을 스캔 hook의 정규화 로직으로 전달합니다.
  function handleResourceTypeToggle(resourceType: ReverseEngineeringResourceSelection): void {
    workflow.toggleResourceType(resourceType);
  }

  return (
    <main aria-label="Reverse Engineering">
      <form onSubmit={handleScanSubmit}>
        <fieldset>
          <legend>AWS 연결 및 스캔 범위</legend>
          <label htmlFor="reverse-aws-connection">
            AWS 연결
            <select
              disabled={workflow.loadState === "loading" || workflow.awsConnections.length === 0}
              id="reverse-aws-connection"
              onChange={(event) => workflow.setSelectedAwsConnectionId(event.currentTarget.value)}
              value={workflow.resolvedSelectedAwsConnectionId}
            >
              {workflow.awsConnections.length === 0 ? (
                <option value="">AWS 연결 없음</option>
              ) : null}
              {workflow.awsConnections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.region} · {connection.status} · {connection.id}
                </option>
              ))}
            </select>
          </label>
          <p>현재 리전: {workflow.selectedAwsConnection?.region ?? "리전 미선택"}</p>
          <fieldset>
            <legend>가져올 리소스</legend>
            {REVERSE_ENGINEERING_RESOURCE_SELECTIONS.map((resourceType) => (
              <label key={resourceType}>
                <input
                  checked={isReverseEngineeringResourceSelectionChecked(
                    workflow.selectedResourceTypes,
                    resourceType
                  )}
                  onChange={() => handleResourceTypeToggle(resourceType)}
                  type="checkbox"
                />
                {resourceType}
              </label>
            ))}
          </fieldset>
          <button disabled={!workflow.canStartScan} type="submit">
            {workflow.scanState === "loading" ? "AWS 읽는 중" : "AWS 스캔 시작"}
          </button>
          {workflow.scanState === "loading" && !props.createProjectOnApply ? (
            <button onClick={() => void workflow.cancelActiveScan()} type="button">
              스캔 취소
            </button>
          ) : null}
        </fieldset>
      </form>

      {workflow.loadState === "error" ? (
        <button onClick={() => void workflow.loadOptions()} type="button">
          연결 다시 불러오기
        </button>
      ) : null}

      {workflow.awsConnectionRecovery.readiness !== "ready" ? (
        <section role="status">
          <p>{workflow.awsConnectionRecovery.title}</p>
          <p>{workflow.awsConnectionRecovery.description}</p>
          <a href={workflow.awsConnectionRecovery.settingsHref}>
            {workflow.awsConnectionRecovery.actionLabel}
          </a>
        </section>
      ) : null}

      {workflow.scanFailure ? (
        <section role="alert">
          <p>{workflow.scanFailure.title}</p>
          <p>{workflow.scanFailure.description}</p>
          {workflow.scanFailure.action === "open_settings" ? (
            <a href={workflow.settingsHref}>환경 설정으로 이동</a>
          ) : null}
          <button onClick={() => void workflow.runScan()} type="button">
            다시 시도
          </button>
        </section>
      ) : null}

      {workflow.errorMessage ? <p role="alert">{workflow.errorMessage}</p> : null}

      {workflow.hasDeletedSourceScan ? (
        <p role="status">이 보드의 원본 스캔 기록이 삭제되었습니다.</p>
      ) : null}

      {result ? (
        <section aria-label="스캔 결과">
          <h2>스캔 결과</h2>
          <p>
            리소스 {result.discoveredResources.length}개 · 연결{" "}
            {result.architectureJson.edges.length}개
          </p>
          {workflow.boardCandidates.length > 1 ? (
            <label htmlFor="reverse-board-candidate">
              구조 후보
              <select
                id="reverse-board-candidate"
                onChange={(event) => workflow.selectBoardCandidate(event.currentTarget.value)}
                value={workflow.selectedCandidate?.id ?? ""}
              >
                {workflow.boardCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {requiresSettings ? <a href={workflow.resultSettingsHref}>환경 설정으로 이동</a> : null}
          <p>현재 미리보기: {workflow.placement === "original" ? "원본" : "자동 정리"}</p>
          <button onClick={workflow.previewOriginalPlacement} type="button">
            원본 배치 보기
          </button>
          <button onClick={workflow.previewAutomaticOrganization} type="button">
            자동 정리 미리보기
          </button>
          {workflow.hasCurrentBoardResources ? (
            <fieldset>
              <legend>보드 적용 방식</legend>
              <label>
                <input
                  checked={workflow.applicationMode === "replace"}
                  name="reverse-board-application-mode"
                  onChange={() => workflow.previewApplicationMode("replace")}
                  type="radio"
                />
                현재 보드 교체
              </label>
              <label>
                <input
                  checked={workflow.applicationMode === "append"}
                  name="reverse-board-application-mode"
                  onChange={() => workflow.previewApplicationMode("append")}
                  type="radio"
                />
                현재 보드에 추가
              </label>
            </fieldset>
          ) : null}
          <button
            disabled={!workflow.canApply}
            onClick={() => void workflow.applyScanResult(workflow.applicationMode)}
            type="button"
          >
            보드에 저장
          </button>
          {workflow.applyMessage ? <p role="status">{workflow.applyMessage}</p> : null}

          <details>
            <summary>가져온 리소스 {result.discoveredResources.length}개</summary>
            <ul>
              {result.discoveredResources.map((resource) => (
                <li key={resource.id}>
                  {resource.displayName} · {resource.resourceType} · {resource.region} ·{" "}
                  {resource.providerResourceType}
                  {resource.relationships && resource.relationships.length > 0 ? (
                    <ul>
                      {resource.relationships.map((relationship) => (
                        <li key={`${relationship.type}-${relationship.targetResourceId}`}>
                          {relationship.type} → {relationship.targetResourceId}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <details>
                    <summary>검토 상태</summary>
                    <dl>
                      <div>
                        <dt>분석 제외</dt>
                        <dd>{resource.analysisExcluded ? "예" : "아니오"}</dd>
                      </div>
                      <div>
                        <dt>관리 상태</dt>
                        <dd>{resource.importSuggestionStatus ?? "없음"}</dd>
                      </div>
                    </dl>
                  </details>
                </li>
              ))}
            </ul>
          </details>

          <details>
            <summary>읽기 상태</summary>
            <ul>
              {result.coverage?.unavailableServices.map((service) => (
                <li key={`${service.serviceKey}-${service.reason}`}>
                  {service.displayName} · {service.reason}
                </li>
              ))}
              {result.coverage?.capabilityLimits?.map((limit) => (
                <li key={`${limit.serviceKey}-${limit.reason}`}>
                  {limit.displayName} · {limit.reason}
                </li>
              ))}
              {result.scanErrors.map((scanError) => (
                <li key={scanError.id}>
                  {scanError.serviceKey ?? scanError.resourceType} · {scanError.reason}
                </li>
              ))}
            </ul>
          </details>

          <details>
            <summary>스캔 로그 {workflow.logs.length}개</summary>
            <ul>
              {workflow.logs.map((log) => (
                <li key={log.id}>
                  {log.stage} · {log.level} · {log.message}
                </li>
              ))}
            </ul>
          </details>

          <details>
            <summary>
              확인 사항 {result.findings.length + result.analysisExclusions.length}개
            </summary>
            <ul>
              {result.findings.map((finding) => (
                <li key={finding.id}>
                  {finding.severity} · {finding.category} · {finding.title} · {finding.description}{" "}
                  · {finding.recommendation}
                </li>
              ))}
              {result.analysisExclusions.map((exclusion) => (
                <li key={exclusion.id}>
                  {exclusion.resourceId} · {exclusion.reason} · {exclusion.message}
                </li>
              ))}
            </ul>
          </details>

          <details>
            <summary>Terraform 관리 후보 {result.importSuggestions.length}개</summary>
            <p>이 화면에서는 Terraform import나 AWS 변경을 실행하지 않습니다.</p>
            <ul>
              {result.importSuggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  {suggestion.resourceId} · {suggestion.status} ·{" "}
                  {suggestion.handoffReady ? "handoff 가능" : "수동 검토"}
                  {suggestion.reason ? ` · ${suggestion.reason}` : ""}
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}

      {workflow.scanResponse && !result ? (
        <section aria-label="스캔 상태" role="status">
          <p>{workflow.scanResponse.scan.status}</p>
          {workflow.scanResponse.scan.errorSummary ? (
            <p>{workflow.scanResponse.scan.errorSummary}</p>
          ) : null}
        </section>
      ) : null}

      {!props.createProjectOnApply ? (
        <section aria-label="스캔 기록">
          <h2>스캔 기록</h2>
          {workflow.isStaleScanResult ? (
            <p role="status">현재 결과는 최신 스캔 기록이 아닙니다.</p>
          ) : null}
          <button
            disabled={!workflow.canStartScan}
            onClick={() => void workflow.runScan()}
            type="button"
          >
            다시 스캔
          </button>
          <ul>
            {workflow.scanHistory.map((scan) => (
              <li key={scan.id}>
                {scan.status} · {scan.region} · {scan.id}
                {scan.status === "running" ? (
                  <button
                    disabled={workflow.isHistoryLoading}
                    onClick={() => void workflow.cancelActiveScan(scan.id)}
                    type="button"
                  >
                    취소
                  </button>
                ) : null}
                <button
                  disabled={workflow.isHistoryLoading || workflow.activeScanId === scan.id}
                  onClick={() => void workflow.openHistoricalScan(scan.id)}
                  type="button"
                >
                  열기
                </button>
                <button
                  disabled={workflow.isHistoryLoading}
                  onClick={() => void workflow.deleteSavedScan(scan.id)}
                  type="button"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
