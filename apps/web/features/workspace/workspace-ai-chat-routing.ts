export type WorkspaceAiChatMode = "draft" | "patch";
export type WorkspaceAiChatAction = "draft" | "patch";
export type WorkspaceAiChatPromptClassification = "architecture" | "ambiguous" | "unrelated";

export function classifyWorkspaceAiChatPrompt(prompt: string): WorkspaceAiChatPromptClassification {
  const normalizedPrompt = normalizeChatPrompt(prompt);

  if (normalizedPrompt.length === 0) {
    return "ambiguous";
  }

  if (hasArchitecturePromptSignal(normalizedPrompt)) {
    return "architecture";
  }

  if (hasArchitectureResourceSignal(normalizedPrompt)) {
    return "ambiguous";
  }

  if (hasUnrelatedPromptSignal(normalizedPrompt)) {
    return "unrelated";
  }

  if (hasVagueDiagramChangeSignal(normalizedPrompt)) {
    return "ambiguous";
  }

  return "unrelated";
}

export function createWorkspaceAiPromptGateMessage(
  classification: Exclude<WorkspaceAiChatPromptClassification, "architecture">
): string {
  if (classification === "ambiguous") {
    return "질문: 어떤 다이어그램을 생성하거나 어떻게 수정할지 조금 더 구체적으로 알려주세요. 예: '로그인 서비스 다이어그램 만들어줘', '여기에 S3 버킷 추가해줘'.";
  }

  return "질문: 이 채팅은 Practice Architecture 다이어그램 생성과 수정 요청만 처리합니다. 만들 서비스나 바꿀 리소스를 포함해서 다시 입력해주세요.";
}

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
  return resolveWorkspaceAiChatMode(input);
}

export function resolvePendingPreviewChatAction(input: {
  readonly needsDraftClarification: boolean;
  readonly prompt: string;
}): WorkspaceAiChatAction {
  if (isPendingPreviewFreshDraftRequest(input.prompt)) {
    return "draft";
  }

  return resolveWorkspaceAiChatAction({
    boardHasResources: true,
    needsDraftClarification: false,
    prompt: input.prompt
  });
}

export function shouldStartFreshDraftDuringPatchClarification(prompt: string): boolean {
  const normalizedPrompt = normalizeChatPrompt(prompt);

  if (isExistingBoardReorganizationRequest(normalizedPrompt)) {
    return false;
  }

  if (
    [
      "처음부터",
      "기존 무시",
      "전체 교체",
      "from scratch",
      "start over",
      "ignore existing",
      "replace all"
    ].some((keyword) => normalizedPrompt.includes(keyword))
  ) {
    return true;
  }

  const hasFreshDraftTarget = [
    "다이어그램",
    "아키텍처",
    "새 서비스",
    "새 웹서비스",
    "새 웹사이트",
    "새 사이트",
    "새 앱",
    "new diagram",
    "new architecture",
    "new service",
    "new website"
  ].some((keyword) => normalizedPrompt.includes(keyword));
  const hasFreshDraftVerb = [
    "생성하고 싶",
    "만들고 싶",
    "새로 만들",
    "create",
    "build"
  ].some((keyword) => normalizedPrompt.includes(keyword));

  return hasFreshDraftTarget && hasFreshDraftVerb;
}

function hasArchitecturePromptSignal(normalizedPrompt: string): boolean {
  const hasArchitectureTarget = ARCHITECTURE_TARGET_KEYWORDS.some((keyword) =>
    matchesChatKeyword(normalizedPrompt, keyword)
  );
  const hasArchitectureAction = ARCHITECTURE_ACTION_KEYWORDS.some((keyword) =>
    matchesChatKeyword(normalizedPrompt, keyword)
  );
  const hasArchitectureResource = hasArchitectureResourceSignal(normalizedPrompt);

  if ((hasArchitectureTarget || hasArchitectureResource) && hasArchitectureAction) {
    return true;
  }

  if (hasArchitectureTarget && hasExplicitArchitectureNoun(normalizedPrompt)) {
    return true;
  }

  return false;
}

function hasExplicitArchitectureNoun(normalizedPrompt: string): boolean {
  return EXPLICIT_ARCHITECTURE_NOUNS.some((keyword) => matchesChatKeyword(normalizedPrompt, keyword));
}

function hasArchitectureResourceSignal(normalizedPrompt: string): boolean {
  return RESOURCE_KEYWORDS.some((keyword) => matchesChatKeyword(normalizedPrompt, keyword));
}

function hasVagueDiagramChangeSignal(normalizedPrompt: string): boolean {
  return VAGUE_CHANGE_KEYWORDS.some((keyword) => matchesChatKeyword(normalizedPrompt, keyword));
}

function hasUnrelatedPromptSignal(normalizedPrompt: string): boolean {
  return UNRELATED_PROMPT_KEYWORDS.some((keyword) => matchesChatKeyword(normalizedPrompt, keyword));
}

function normalizeChatPrompt(prompt: string): string {
  return prompt.normalize("NFKC").trim().toLowerCase();
}

function matchesChatKeyword(normalizedPrompt: string, keyword: string): boolean {
  if (!isShortAsciiToken(keyword)) {
    return normalizedPrompt.includes(keyword);
  }

  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}([^a-z0-9]|$)`).test(normalizedPrompt);
}

function isShortAsciiToken(keyword: string): boolean {
  return /^[a-z0-9]+$/.test(keyword) && keyword.length <= 3;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ARCHITECTURE_ACTION_KEYWORDS = [
  "add",
  "build",
  "change",
  "create",
  "delete",
  "deploy",
  "design",
  "draw",
  "erase",
  "generate",
  "make",
  "modify",
  "need",
  "publish",
  "remove",
  "replace",
  "serve",
  "update",
  "지우",
  "지워",
  "없애",
  "그려",
  "넣어",
  "만들",
  "바꿔",
  "변경",
  "삭제",
  "생성",
  "수정",
  "제거",
  "추가",
  "필요",
  "배포",
  "구성",
  "설계"
] as const;

const ARCHITECTURE_TARGET_KEYWORDS = [
  "architecture",
  "backend",
  "bucket",
  "cloud",
  "database",
  "db",
  "diagram",
  "frontend",
  "iac",
  "infrastructure",
  "service",
  "server",
  "site",
  "storage",
  "terraform",
  "upload",
  "web app",
  "website",
  "api",
  "aws",
  "app",
  "app store",
  "google play",
  "mobile app",
  "play store",
  "다이어그램",
  "구글 플레이",
  "백엔드",
  "버킷",
  "서비스",
  "서버",
  "스토리지",
  "아키텍처",
  "업로드",
  "웹사이트",
  "인프라",
  "정적",
  "클라우드",
  "테라폼",
  "프론트엔드",
  "데이터베이스",
  "로그인",
  "모바일 앱",
  "앱",
  "앱 스토어",
  "플레이스토어"
] as const;

const EXPLICIT_ARCHITECTURE_NOUNS = [
  "architecture",
  "diagram",
  "iac",
  "infrastructure",
  "terraform",
  "다이어그램",
  "아키텍처",
  "인프라",
  "테라폼"
] as const;

const RESOURCE_KEYWORDS = [
  "alb",
  "api gateway",
  "database",
  "db",
  "cloudfront",
  "cloudwatch",
  "dynamodb",
  "ec2",
  "ecs",
  "eks",
  "gateway",
  "iam",
  "lambda",
  "load balancer",
  "rds",
  "route table",
  "s3",
  "security group",
  "subnet",
  "vpc",
  "게이트웨이",
  "라우트 테이블",
  "람다",
  "로드밸런서",
  "보안 그룹",
  "서브넷",
  "인스턴스",
  "클라우드프론트",
  "함수"
] as const;

const VAGUE_CHANGE_KEYWORDS = [
  "do it",
  "fix it",
  "make it better",
  "update it",
  "change it",
  "해줘",
  "고쳐",
  "바꿔",
  "수정",
  "좋게"
] as const;

const UNRELATED_PROMPT_KEYWORDS = [
  "hello",
  "hi",
  "weather",
  "lunch",
  "stock",
  "recipe",
  "joke",
  "안녕",
  "날씨",
  "점심",
  "주식",
  "추천",
  "요리",
  "농담",
  "ㅋㅋ"
] as const;

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
