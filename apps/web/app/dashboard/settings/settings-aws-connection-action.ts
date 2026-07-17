import type { AwsConnection } from "@sketchcatch/types";

export type SettingsAwsConnectionAction = {
  readonly kind: "reverify" | "resume" | "test";
  readonly label: string;
};

// 실패한 연결은 저장된 Role을 다시 검증해 verified 상태로 되돌리고, Role이 없을 때만 설정을 이어갑니다.
export function getSettingsAwsConnectionAction(
  connection: AwsConnection
): SettingsAwsConnectionAction {
  if (connection.status === "verified") {
    return {
      kind: "test",
      label: "연결 테스트"
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
