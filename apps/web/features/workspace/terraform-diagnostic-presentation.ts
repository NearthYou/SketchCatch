import type { TerraformDiagnosticSeverity } from "@sketchcatch/types";

// API severity 세 종류를 빠짐없이 사용자용 한국어 상태로 바꿉니다.
export function formatTerraformDiagnosticSeverity(severity: TerraformDiagnosticSeverity): string {
  switch (severity) {
    case "error":
      return "오류";
    case "warning":
      return "경고";
    case "info":
      return "정보";
    default: {
      const exhaustiveSeverity: never = severity;
      return exhaustiveSeverity;
    }
  }
}
