import type { WorkspaceCloudPlatform } from "../../../features/workspace/project-draft-persistence";

export type WorkspaceStartKind = "ai" | "reverse" | "blank";
export type WorkspaceStartPriority = "primary" | "secondary";

export type WorkspaceStartOption = {
  readonly kind: WorkspaceStartKind;
  readonly priority: WorkspaceStartPriority;
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
};

export type ResolveWorkspaceStartActionInput = {
  readonly cloudPlatform: WorkspaceCloudPlatform;
  readonly hasVerifiedAwsConnection: boolean;
  readonly projectName: string;
  readonly startKind: WorkspaceStartKind;
};

export type WorkspaceStartAction =
  | {
      readonly kind: "createProject";
      readonly openMode: "ai" | "blank";
    }
  | {
      readonly kind: "openReversePreview";
      readonly href: string;
    }
  | {
      readonly kind: "redirect";
      readonly href: string;
    };

// 새 프로젝트 첫 화면에서 어떤 시작 방식을 크게 보여줄지 정합니다.
export function createWorkspaceStartOptions(): readonly [
  WorkspaceStartOption,
  WorkspaceStartOption,
  WorkspaceStartOption
] {
  return [
    {
      kind: "ai",
      priority: "primary",
      title: "AI로 시작",
      description: "원하는 구조를 말하면 설계 초안을 먼저 만듭니다.",
      actionLabel: "AI 초안 만들기"
    },
    {
      kind: "reverse",
      priority: "primary",
      title: "Reverse Engineering으로 시작",
      description: "이미 AWS에 있는 리소스를 읽어서 보드 후보를 만듭니다.",
      actionLabel: "기존 AWS 가져오기"
    },
    {
      kind: "blank",
      priority: "secondary",
      title: "빈 보드로 시작",
      description: "아무것도 없는 보드에서 직접 그립니다.",
      actionLabel: "빈 보드 열기"
    }
  ];
}

// 사용자가 고른 시작 방식에 따라 다음에 할 일을 하나로 결정합니다.
export function resolveWorkspaceStartAction({
  cloudPlatform,
  hasVerifiedAwsConnection,
  projectName,
  startKind
}: ResolveWorkspaceStartActionInput): WorkspaceStartAction {
  if (startKind === "reverse") {
    if (!hasVerifiedAwsConnection) {
      return {
        kind: "redirect",
        href: "/settings?tab=aws&next=reverse"
      };
    }

    const params = new URLSearchParams({
      cloudPlatform,
      projectName,
      startMode: "reverse"
    });

    return {
      kind: "openReversePreview",
      href: `/workspace?${params.toString()}`
    };
  }

  return {
    kind: "createProject",
    openMode: startKind
  };
}
