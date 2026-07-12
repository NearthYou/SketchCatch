import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArchitectureDiagnostic, DiagramJson } from "@sketchcatch/types";
import {
  createArchitectureDiagnosticKey,
  replaceArchitectureDiagnostics
} from "./architecture-diagnostics-state";
import { createArchitectureRuleInputFingerprint } from "@sketchcatch/types/architecture-dependency-rules";

const amiWarning: ArchitectureDiagnostic = {
  source: "architecture-rule",
  code: "architecture.aws.ec2.ami_reference_missing",
  severity: "warning",
  ruleId: "architecture.aws.ec2.ami_reference_missing",
  resourceNodeId: "ec2-1",
  relatedNodeIds: [],
  summary: "EC2 구성 미완료",
  message: "EC2를 실행하려면 AMI를 선택하거나 참조하세요.",
  remediation: []
};

test("architecture input fingerprint ignores viewport-only changes", () => {
  assert.equal(
    createArchitectureRuleInputFingerprint(withViewport({ x: 0, y: 0, zoom: 1 })),
    createArchitectureRuleInputFingerprint(withViewport({ x: 120, y: 60, zoom: 1.25 }))
  );
});

test("replacing architecture diagnostics removes resolved warnings", () => {
  assert.deepEqual(replaceArchitectureDiagnostics([amiWarning], []), []);
});

test("architecture diagnostic keys include the rule and resource identity", () => {
  assert.equal(
    createArchitectureDiagnosticKey(amiWarning),
    "architecture.aws.ec2.ami_reference_missing:ec2-1"
  );
});

function withViewport(viewport: DiagramJson["viewport"]): DiagramJson {
  return {
    nodes: [
      {
        id: "ec2-1",
        type: "aws_instance",
        kind: "resource",
        position: { x: 0, y: 0 },
        size: { width: 120, height: 80 },
        label: "EC2",
        locked: false,
        zIndex: 0,
        parameters: {
          resourceType: "aws_instance",
          resourceName: "app",
          fileName: "main",
          values: {}
        }
      }
    ],
    edges: [],
    viewport
  };
}
