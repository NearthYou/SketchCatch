import { useCallback, useEffect, useState } from "react";
import type { ReverseEngineeringScan, ReverseEngineeringScanResponse } from "@sketchcatch/types";
import { listReverseEngineeringScans } from "./api";

type RequestState = "idle" | "loading" | "error";

export type UseReverseEngineeringScanHistoryInput = {
  readonly enabled?: boolean | undefined;
  readonly onError: (error: unknown) => void;
  readonly scanResponse: ReverseEngineeringScanResponse | null;
  readonly selectedProjectId: string;
};

// 저장된 스캔 목록과 현재 열어둔 스캔 ID를 관리합니다.
export function useReverseEngineeringScanHistory({
  enabled = true,
  onError,
  scanResponse,
  selectedProjectId
}: UseReverseEngineeringScanHistoryInput) {
  const [scanHistory, setScanHistory] = useState<ReverseEngineeringScan[]>([]);
  const [scanHistoryState, setScanHistoryState] = useState<RequestState>("idle");
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const isStaleScanResult = Boolean(
    scanResponse && scanHistory[0] && scanResponse.scan.id !== scanHistory[0].id
  );

  // 선택한 프로젝트의 이전 Reverse Engineering 스캔 기록을 불러옵니다.
  const loadScanHistory = useCallback(async () => {
    if (!enabled) {
      setScanHistory([]);
      setScanHistoryState("idle");
      return;
    }

    setScanHistoryState("loading");

    try {
      setScanHistory(await listReverseEngineeringScans(selectedProjectId));
      setScanHistoryState("idle");
    } catch (error) {
      setScanHistoryState("error");
      onError(error);
    }
  }, [enabled, onError, selectedProjectId]);

  useEffect(() => {
    if (enabled && selectedProjectId) {
      void loadScanHistory();
    }
  }, [enabled, loadScanHistory, selectedProjectId]);

  // 새 스캔이 끝나면 기록 목록 맨 위에 반영합니다.
  function rememberCompletedScan(scan: ReverseEngineeringScan): void {
    setActiveScanId(scan.id);
    setScanHistory((currentScans) => [
      scan,
      ...currentScans.filter((currentScan) => currentScan.id !== scan.id)
    ]);
  }

  // 삭제된 스캔은 기록 목록과 현재 선택 상태에서 함께 빼냅니다.
  function forgetScan(scanId: string): void {
    setScanHistory((currentScans) => currentScans.filter((scan) => scan.id !== scanId));
    setActiveScanId((currentScanId) => (currentScanId === scanId ? null : currentScanId));
  }

  return {
    activeScanId,
    forgetScan,
    isStaleScanResult,
    rememberCompletedScan,
    scanHistory,
    scanHistoryState,
    setActiveScanId
  };
}
