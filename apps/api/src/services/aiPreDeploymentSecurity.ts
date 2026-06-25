import type { CheckFinding, ResourceConfig, ResourceNode } from "@sketchcatch/types";

export function createSecurityFindings(node: ResourceNode): CheckFinding[] {
  if (node.type !== "SECURITY_GROUP" || !hasOpenSshRule(node.config)) {
    return [];
  }

  return [
    {
      id: `security-open-ssh-${node.id}`,
      category: "security",
      severity: "high",
      resourceId: node.id,
      title: "SSH가 전체 인터넷에 열려 있습니다",
      description: "22번 포트가 0.0.0.0/0으로 열려 있어 누구나 SSH 접속을 시도할 수 있습니다.",
      recommendation: "SSH 접근 대상을 본인 IP나 팀에서 정한 관리용 CIDR로 제한하세요."
    }
  ];
}

function hasOpenSshRule(config: ResourceConfig): boolean {
  const ingress = config["ingress"];

  if (!Array.isArray(ingress)) {
    return false;
  }

  return ingress.some(isOpenSshRule);
}

function isOpenSshRule(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const port = value["port"];
  const cidr = value["cidr"];

  return (port === 22 || port === "22") && cidr === "0.0.0.0/0";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
