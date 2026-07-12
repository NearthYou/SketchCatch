export type SaveStatusTone = "error" | "pending" | "saved" | "neutral";

/** 실제 저장 요청이 실행 중인 문구만 저장 중으로 판별합니다. */
export function isSaveInProgress(saveStatus: string): boolean {
  return saveStatus.endsWith("저장 중");
}

/** 저장 문구를 상단 바에서 사용할 짧은 상태 종류로 바꿉니다. */
export function getSaveStatusTone(saveStatus: string): SaveStatusTone {
  if (saveStatus.includes("실패")) {
    return "error";
  }

  if (isSaveInProgress(saveStatus) || saveStatus.includes("필요")) {
    return "pending";
  }

  if (saveStatus.includes("저장됨")) {
    return "saved";
  }

  return "neutral";
}
