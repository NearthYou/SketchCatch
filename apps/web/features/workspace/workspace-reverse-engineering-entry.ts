export type WorkspaceReverseEngineeringEntryResult =
  | { readonly ok: true; readonly revision: number }
  | { readonly ok: false; readonly message: string };

export type WorkspaceReverseEngineeringEntryInput = {
  readonly draftReady: boolean;
  readonly hasPendingLocalChanges: boolean;
  readonly projectDraftRevision: number | null;
  readonly projectId: string;
  readonly serverConflict: boolean;
  readonly serverDirty: boolean;
  readonly serverSaving: boolean;
  readonly saveDraft: () => Promise<{
    readonly ok: boolean;
    readonly revision: number | null;
  }>;
};

/** 현재 Project를 서버에 확정한 뒤에만 AWS 구조 가져오기 화면을 열도록 준비합니다. */
export async function prepareWorkspaceReverseEngineeringEntry(
  input: WorkspaceReverseEngineeringEntryInput
): Promise<WorkspaceReverseEngineeringEntryResult> {
  if (!input.draftReady || input.projectId.trim().length === 0) {
    return {
      ok: false,
      message: "프로젝트를 불러온 뒤 AWS 구조 가져오기를 다시 시작해주세요."
    };
  }

  if (input.serverConflict) {
    return {
      ok: false,
      message: "프로젝트 저장 충돌을 먼저 해결해주세요. 현재 보드는 그대로 유지됩니다."
    };
  }

  const mustSaveBeforeOpening =
    input.projectDraftRevision === null ||
    input.hasPendingLocalChanges ||
    input.serverDirty ||
    input.serverSaving;

  if (!mustSaveBeforeOpening) {
    return { ok: true, revision: input.projectDraftRevision };
  }

  const saved = await input.saveDraft();

  if (!saved.ok || saved.revision === null) {
    return {
      ok: false,
      message: "현재 보드를 서버에 저장하지 못했습니다. 저장 문제를 해결한 뒤 다시 시도해주세요."
    };
  }

  return { ok: true, revision: saved.revision };
}
