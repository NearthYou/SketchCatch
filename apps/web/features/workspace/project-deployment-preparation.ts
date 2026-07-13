export function requireSavedProjectDraftRevision(result: unknown): number {
  if (
    typeof result !== "object" ||
    result === null ||
    !("ok" in result) ||
    result.ok !== true ||
    !("serverDraft" in result) ||
    typeof result.serverDraft !== "object" ||
    result.serverDraft === null ||
    !("revision" in result.serverDraft) ||
    typeof result.serverDraft.revision !== "number" ||
    !Number.isInteger(result.serverDraft.revision) ||
    result.serverDraft.revision < 1
  ) {
    throw new Error("프로젝트 저장이 완료되지 않아 배포를 준비할 수 없습니다.");
  }

  return result.serverDraft.revision;
}
