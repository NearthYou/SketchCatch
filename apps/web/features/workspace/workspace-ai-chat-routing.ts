export type WorkspaceAiChatMode = "draft" | "patch";
export type WorkspaceAiChatAction = "draft" | "draft_clarification" | "patch";

export function resolveWorkspaceAiChatMode(input: {
  readonly boardHasResources: boolean;
  readonly prompt: string;
}): WorkspaceAiChatMode {
  if (!input.boardHasResources) {
    return "draft";
  }

  return isFreshArchitectureRequest(input.prompt) || isNewServiceDraftRequest(input.prompt)
    ? "draft"
    : "patch";
}

export function resolveWorkspaceAiChatAction(input: {
  readonly boardHasResources: boolean;
  readonly needsDraftClarification: boolean;
  readonly prompt: string;
}): WorkspaceAiChatAction {
  if (shouldInterruptPatchClarificationForDraft(input)) {
    return "draft_clarification";
  }

  const mode = resolveWorkspaceAiChatMode(input);

  if (mode === "patch") {
    return "patch";
  }

  return input.needsDraftClarification ? "draft_clarification" : "draft";
}

export function resolvePendingPreviewChatAction(input: {
  readonly needsDraftClarification: boolean;
  readonly prompt: string;
}): WorkspaceAiChatAction {
  if (isPendingPreviewFreshDraftRequest(input.prompt)) {
    return input.needsDraftClarification ? "draft_clarification" : "draft";
  }

  return resolveWorkspaceAiChatAction({
    boardHasResources: true,
    needsDraftClarification: input.needsDraftClarification,
    prompt: input.prompt
  });
}

export function shouldInterruptPatchClarificationForDraft(input: {
  readonly boardHasResources: boolean;
  readonly needsDraftClarification: boolean;
  readonly prompt: string;
}): boolean {
  return (
    input.boardHasResources &&
    input.needsDraftClarification &&
    isNewServiceDraftRequest(input.prompt)
  );
}

function isNewServiceDraftRequest(prompt: string): boolean {
  const normalizedPrompt = prompt.toLowerCase();

  if (
    [
      "여기에",
      "기존",
      "현재",
      "추가",
      "넣어줘",
      "넣어 줘",
      "붙",
      "삭제",
      "제거",
      "지워",
      "교체",
      "대체",
      "바꿔",
      "바꾸",
      "수정",
      "변경",
      "add",
      "remove",
      "delete",
      "replace",
      "modify",
      "change"
    ].some((keyword) => normalizedPrompt.includes(keyword))
  ) {
    return false;
  }

  if (isExistingBoardReorganizationRequest(normalizedPrompt)) {
    return false;
  }

  return [
    "만들고 싶",
    "만들어줘",
    "만들어 줘",
    "하나 만들",
    "구축하고 싶",
    "배포하고 싶",
    "새 서비스",
    "새 웹서비스",
    "새 웹사이트",
    "서비스 하나",
    "웹서비스 하나",
    "웹사이트 하나",
    "앱 하나",
    "build a service",
    "build a website",
    "create a service",
    "create a website",
    "정리해줘",
    "정리해 줘",
    "구성해줘",
    "구성해 줘",
    "설계해줘",
    "설계해 줘"
  ].some((keyword) => normalizedPrompt.includes(keyword));
}

function isPendingPreviewFreshDraftRequest(prompt: string): boolean {
  const normalizedPrompt = prompt.toLowerCase();

  if (isExistingBoardReorganizationRequest(normalizedPrompt)) {
    return false;
  }

  const hasFreshRequestVerb = [
    "필요해",
    "필요",
    "만들고 싶",
    "만들어줘",
    "만들어 줘",
    "그려줘",
    "그려 줘",
    "배포하고 싶",
    "구성해줘",
    "구성해 줘",
    "설계해줘",
    "설계해 줘",
    "create",
    "build",
    "draw"
  ].some((keyword) => normalizedPrompt.includes(keyword));

  if (!hasFreshRequestVerb) {
    return false;
  }

  return [
    "페이지",
    "웹서비스",
    "서비스",
    "웹사이트",
    "사이트",
    "api",
    "서버",
    "데이터베이스",
    "db",
    "s3",
    "ec2",
    "다이어그램",
    "버킷",
    "로그인",
    "업로드",
    "website",
    "service",
    "server",
    "diagram",
    "bucket",
    "login",
    "upload"
  ].some((keyword) => normalizedPrompt.includes(keyword));
}

function isExistingBoardReorganizationRequest(normalizedPrompt: string): boolean {
  return (
    ["정리해줘", "정리해 줘", "정리해", "구성해줘", "구성해 줘", "설계해줘", "설계해 줘"].some((keyword) =>
      normalizedPrompt.includes(keyword)
    ) &&
    !["하나", "새로", "처음부터", "만들", "배포하고 싶", "create", "build", "from scratch"].some((keyword) =>
      normalizedPrompt.includes(keyword)
    )
  );
}

function isFreshArchitectureRequest(prompt: string): boolean {
  const normalizedPrompt = prompt.toLowerCase();

  return [
    "from scratch",
    "start over",
    "ignore existing",
    "replace all",
    "new diagram",
    "새로",
    "처음부터",
    "기존 무시",
    "다시 만들어",
    "전체 교체"
  ].some((keyword) => normalizedPrompt.includes(keyword));
}
