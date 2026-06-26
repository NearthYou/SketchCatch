import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArchitectureSuggestion, CheckFinding, ChecklistItem } from "../../../../packages/types/src";
import {
  createPreDeploymentChecklistItems,
  createPreDeploymentFindingItems,
  createPreDeploymentSuggestionItems
} from "../../app/workspace/PreDeploymentAnalysisPanel";

const findings: CheckFinding[] = [
  {
    id: "security-open-ssh-sg-public-ssh",
    category: "security",
    severity: "high",
    resourceId: "sg-public-ssh",
    title: "SSH가 전체 인터넷에 열려 있습니다",
    description: "22번 포트가 0.0.0.0/0으로 열려 있습니다.",
    recommendation: "관리용 CIDR만 남기세요."
  }
];

const checklist: ChecklistItem[] = [
  {
    id: "security-open-ssh-check",
    label: "SSH 전체 공개 여부 확인",
    status: "fail",
    relatedFindingIds: ["security-open-ssh-sg-public-ssh"]
  }
];

const suggestions: ArchitectureSuggestion[] = [
  {
    id: "suggestion-security-open-ssh-sg-public-ssh",
    findingId: "security-open-ssh-sg-public-ssh",
    title: "SSH 접근 범위 제한",
    targetResourceId: "sg-public-ssh",
    action: "modify_resource",
    expectedImpact: {
      cost: "neutral",
      security: "improve",
      reliability: "neutral"
    },
    explanation: "Security Group ingress를 줄이세요."
  }
];

test("createPreDeploymentFindingItems keeps linked resource ids visible", () => {
  const [item] = createPreDeploymentFindingItems(findings);

  assert.deepEqual(item, {
    id: "security-open-ssh-sg-public-ssh",
    label: "HIGH · SSH가 전체 인터넷에 열려 있습니다",
    text: "22번 포트가 0.0.0.0/0으로 열려 있습니다. 연결 Resource: sg-public-ssh"
  });
});

test("createPreDeploymentChecklistItems keeps checklist status and linked finding ids visible", () => {
  const [item] = createPreDeploymentChecklistItems(checklist);

  assert.deepEqual(item, {
    id: "security-open-ssh-check",
    label: "FAIL · SSH 전체 공개 여부 확인",
    text: "연결 finding: security-open-ssh-sg-public-ssh"
  });
});

test("createPreDeploymentSuggestionItems keeps target resource and source finding visible", () => {
  const [item] = createPreDeploymentSuggestionItems(suggestions);

  assert.deepEqual(item, {
    id: "suggestion-security-open-ssh-sg-public-ssh",
    label: "modify_resource · SSH 접근 범위 제한",
    text: "Security Group ingress를 줄이세요. 대상 Resource: sg-public-ssh · 연결 finding: security-open-ssh-sg-public-ssh"
  });
});
