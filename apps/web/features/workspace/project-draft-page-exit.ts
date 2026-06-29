export type ProjectDraftPageExitState = {
  draftReady: boolean;
  hasPendingLocalChanges: boolean;
  serverDirty: boolean;
  serverSaving: boolean;
};

export function shouldFlushProjectDraftBeforePageExit({
  draftReady,
  hasPendingLocalChanges,
  serverDirty,
  serverSaving
}: ProjectDraftPageExitState): boolean {
  if (!draftReady || serverSaving) {
    return false;
  }

  return hasPendingLocalChanges || serverDirty;
}
