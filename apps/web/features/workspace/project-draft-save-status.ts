export type ProjectLocalSaveState = "idle" | "local-pending" | "local-saved" | "local-failed";

export type ProjectServerSaveState =
  | "server-idle"
  | "server-dirty"
  | "server-saving"
  | "server-checkpoint-pending"
  | "server-saved"
  | "server-conflict"
  | "server-failed";

export function getDirtyProjectServerSaveState(hasConflict: boolean): ProjectServerSaveState {
  return hasConflict ? "server-conflict" : "server-dirty";
}

export function getProjectSaveStatus(
  localSaveState: ProjectLocalSaveState,
  serverSaveState: ProjectServerSaveState
): string {
  if (serverSaveState === "server-conflict") {
    return "최신 상태 필요";
  }

  if (localSaveState === "local-failed" || serverSaveState === "server-failed") {
    return "저장 실패";
  }

  if (serverSaveState === "server-saving" || serverSaveState === "server-checkpoint-pending") {
    return "서버 저장 중";
  }

  if (serverSaveState === "server-dirty") {
    return "저장 필요";
  }

  if (localSaveState === "local-pending") {
    return "로컬 저장 중";
  }

  if (localSaveState === "local-saved" || serverSaveState === "server-saved") {
    return "저장됨";
  }

  return "편집 중";
}
