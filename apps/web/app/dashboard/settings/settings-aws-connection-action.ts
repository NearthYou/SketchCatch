import type { AwsConnection } from "@sketchcatch/types";

export type SettingsAwsConnectionAction = {
  readonly kind: "reverify" | "resume" | "test";
  readonly label: string;
};

// gg: 연결 상태에 따라 사용자가 다음에 해야 할 AWS 연결 행동 하나만 고릅니다.
export function getSettingsAwsConnectionAction(
  connection: AwsConnection
): SettingsAwsConnectionAction {
  if (connection.status === "verified") {
    return {
      kind: "test",
      label: "AWS 연결 확인"
    };
  }

  if (connection.status === "failed" && connection.roleArn?.trim()) {
    return {
      kind: "reverify",
      label: "연결 다시 확인"
    };
  }

  return {
    kind: "resume",
    label: "설정 계속"
  };
}
