import { test } from "node:test";
import assert from "node:assert/strict";
import type { CheckFinding, DeploymentPlanSummary, DeploymentPlanWarning } from "@sketchcatch/types";
import {
  evaluateDeploymentSafetyGate,
  requiresTerraformImportSafetyReplan
} from "./deployment-safety-gate.js";

test("evaluateDeploymentSafetyGate records high risk findings without blocking plan state", () => {
  const summary = evaluateDeploymentSafetyGate({
    operation: "apply",
    planSummary: createPlanSummary({
      deleteCount: 1
    }),
    findings: [
      createFinding({
        id: "security-open-ssh-sg-1",
        resourceId: "sg-1",
        severity: "high",
        sourceLocation: {
          fileName: "main.tf",
          line: 15,
          column: 1,
          resourceAddress: "aws_security_group.sg_app",
          terraformBlockType: "resource",
          terraformBlockName: "sg_app"
        }
      })
    ]
  });

  assert.equal(summary.blocked, false);
  assert.deepEqual(
    summary.warnings.map((warning) => warning.id),
    [
      "pre_deployment_check:security-open-ssh-sg-1",
      "terraform_plan:DESTRUCTIVE_CHANGE:apply"
    ]
  );
  assert.equal(summary.warnings[0]?.requiresAcknowledgement, false);
  assert.equal(summary.warnings[0]?.blocksApproval, false);
  assert.deepEqual(summary.warnings[0]?.sourceLocation, {
    fileName: "main.tf",
    line: 15,
    column: 1,
    resourceAddress: "aws_security_group.sg_app",
    terraformBlockType: "resource",
    terraformBlockName: "sg_app"
  });
  assert.equal(summary.warnings[1]?.code, "DESTRUCTIVE_CHANGE");
});

test("evaluateDeploymentSafetyGate leaves medium and low warnings approvable", () => {
  const summary = evaluateDeploymentSafetyGate({
    operation: "apply",
    planSummary: createPlanSummary(),
    findings: [
      createFinding({
        id: "configuration-review-subnet-1",
        category: "configuration",
        severity: "medium"
      }),
      createFinding({
        id: "security-review-s3-1",
        severity: "low"
      })
    ]
  });

  assert.equal(summary.blocked, false);
  assert.equal(summary.warnings.every((warning) => !warning.blocksApproval), true);
  assert.equal(summary.warnings.every((warning) => !warning.requiresAcknowledgement), true);
});

test("evaluateDeploymentSafetyGate preserves generic Trivy warning codes", () => {
  const summary = evaluateDeploymentSafetyGate({
    operation: "apply",
    planSummary: createPlanSummary(),
    findings: [
      createFinding({
        id: "trivy:aws-9999:main.tf:aws_vpc.main:3",
        category: "security",
        severity: "medium",
        resourceId: "aws_vpc.main",
        title: "VPC flow logs should be enabled",
        description: "Flow logs are missing.",
        recommendation: "Enable VPC flow logs."
      })
    ]
  });

  assert.equal(summary.warnings[0]?.code, "TRIVY_MISCONFIGURATION");
  assert.equal(summary.warnings[0]?.relatedFindingId, "trivy:aws-9999:main.tf:aws_vpc.main:3");
  assert.equal(summary.warnings[0]?.requiresAcknowledgement, false);
  assert.equal(summary.warnings[0]?.blocksApproval, false);
});

test("evaluateDeploymentSafetyGate keeps demo high findings approvable", () => {
  const demoFindings = [
    ["trivy:aws-0178:main.tf:aws_vpc.demo:20", "aws_vpc.demo", 20],
    ["trivy:aws-0164:main.tf:aws_subnet.public_a:41", "aws_subnet.public_a", 41],
    ["trivy:aws-0104:main.tf:aws_security_group.api:78", "aws_security_group.api", 78],
    ["trivy:aws-0087:main.tf:aws_s3_bucket_public_access_block.site:110", "aws_s3_bucket_public_access_block.site", 110],
    ["trivy:aws-0132:main.tf:aws_s3_bucket.site:98", "aws_s3_bucket.site", 98],
    ["trivy:aws-0131:main.tf:aws_instance.api:151", "aws_instance.api", 151],
    ["trivy:aws-0052:main.tf:aws_lb.demo:224", "aws_lb.demo", 224],
    ["trivy:aws-0054:main.tf:aws_lb_listener.http:251", "aws_lb_listener.http", 251],
    ["trivy:aws-9999:main.tf:aws_route_table.public:58", "aws_route_table.public", 58]
  ] as const;
  const summary = evaluateDeploymentSafetyGate({
    operation: "apply",
    liveProfile: "demo_web_service",
    planSummary: createPlanSummary(),
    findings: demoFindings.map(([id, resourceAddress, line]) =>
      createFinding({
        id,
        severity: "high",
        resourceId: resourceAddress,
        sourceLocation: {
          fileName: "main.tf",
          line,
          resourceAddress
        }
      })
    )
  });

  assert.equal(summary.warnings.length, demoFindings.length);
  assert.equal(summary.warnings.every((warning) => !warning.requiresAcknowledgement), true);
  assert.equal(summary.warnings.every((warning) => !warning.blocksApproval), true);
});

test("evaluateDeploymentSafetyGate keeps all high pre-deployment findings approvable", () => {
  const summary = evaluateDeploymentSafetyGate({
    operation: "apply",
    liveProfile: "demo_web_service",
    planSummary: createPlanSummary(),
    findings: [
      createFinding({
        id: "trivy:aws-0107:main.tf:aws_security_group.open_ssh:13",
        severity: "high",
        resourceId: "aws_security_group.open_ssh",
        sourceLocation: {
          fileName: "main.tf",
          line: 13,
          resourceAddress: "aws_security_group.open_ssh"
        }
      }),
      createFinding({
        id: "manual:aws-instance-risk",
        severity: "high",
        resourceId: "aws_instance.api",
        sourceLocation: {
          fileName: "main.tf",
          line: 151,
          resourceAddress: "aws_instance.api"
        }
      })
    ]
  });

  assert.equal(summary.warnings[0]?.requiresAcknowledgement, false);
  assert.equal(summary.warnings[0]?.blocksApproval, false);
  assert.equal(summary.warnings[1]?.requiresAcknowledgement, false);
  assert.equal(summary.warnings[1]?.blocksApproval, false);
});

test("evaluateDeploymentSafetyGate creates stable ids for unsupported resource warnings", () => {
  const input = {
    operation: "destroy" as const,
    planSummary: createPlanSummary(),
    unsupportedResourceTypes: ["aws_lambda_function"]
  };

  const first = evaluateDeploymentSafetyGate(input);
  const second = evaluateDeploymentSafetyGate(input);

  assert.equal(
    first.warnings[0]?.id,
    "terraform_plan:UNSUPPORTED_RESOURCE:destroy:aws_lambda_function"
  );
  assert.deepEqual(first.warnings, second.warnings);
});

test("evaluateDeploymentSafetyGate keeps cost risk warnings without blocking plan state", () => {
  const summary = evaluateDeploymentSafetyGate({
    operation: "apply",
    planSummary: createPlanSummary(),
    warnings: [
      createWarning({
        id: "cost_risk:expensive-resource",
        level: "high",
        source: "cost_risk",
        code: "UNSUPPORTED_RESOURCE",
        message: "Monthly estimate is above the allowed budget",
        blocksApproval: true,
        requiresAcknowledgement: false
      })
    ]
  });

  assert.equal(summary.blocked, false);
  assert.equal(summary.warnings[0]?.blocksApproval, true);
  assert.equal(summary.warnings[0]?.source, "cost_risk");
});

test("evaluateDeploymentSafetyGate deduplicates warnings by stable id", () => {
  const summary = evaluateDeploymentSafetyGate({
    operation: "apply",
    planSummary: createPlanSummary({
      warnings: [
        createWarning({
          id: "pre_deployment_check:configuration-review-subnet-1",
          level: "medium",
          code: "UNKNOWN_TERRAFORM_ACTION",
          message: "Existing stale warning",
          blocksApproval: false,
          requiresAcknowledgement: true
        })
      ]
    }),
    findings: [
      createFinding({
        id: "configuration-review-subnet-1",
        category: "configuration",
        severity: "medium",
        title: "Subnet review",
        recommendation: "Review generated subnet CIDR"
      })
    ]
  });

  assert.deepEqual(
    summary.warnings.map((warning) => warning.id),
    ["pre_deployment_check:configuration-review-subnet-1"]
  );
  assert.equal(summary.warnings[0]?.message, "Subnet review: Review generated subnet CIDR");
});

test("evaluateDeploymentSafetyGate keeps import-only plans approvable", () => {
  const summary = evaluateDeploymentSafetyGate({
    operation: "apply",
    planSummary: createPlanSummary({ importCount: 1 }),
    terraformShowJson: createTerraformShowJson([
      {
        address: "aws_s3_bucket.import_only",
        change: {
          actions: ["no-op"],
          importing: { id: "import-only-bucket" }
        }
      }
    ])
  });

  assert.equal(summary.blocked, false);
  assert.equal(summary.importSafetyGateVersion, 2);
});

test("requiresTerraformImportSafetyReplan invalidates version 1 import plans", () => {
  assert.equal(
    requiresTerraformImportSafetyReplan(
      createPlanSummary({ importCount: 1, importSafetyGateVersion: 1 })
    ),
    true
  );
  assert.equal(
    requiresTerraformImportSafetyReplan(
      createPlanSummary({ importCount: 1, importSafetyGateVersion: 2 })
    ),
    false
  );
});

test("evaluateDeploymentSafetyGate blocks updates that are part of the initial import", () => {
  const summary = evaluateDeploymentSafetyGate({
    operation: "apply",
    planSummary: createPlanSummary({ importCount: 1 }),
    terraformShowJson: createTerraformShowJson([
      {
        address: "aws_s3_bucket.import_update",
        change: {
          actions: ["update"],
          importing: { id: "import-update-bucket" }
        }
      }
    ])
  });

  assert.equal(summary.blocked, true);
});

test("evaluateDeploymentSafetyGate keeps ordinary updates approvable after import", () => {
  const summary = evaluateDeploymentSafetyGate({
    operation: "apply",
    planSummary: createPlanSummary({ updateCount: 1 }),
    terraformShowJson: createTerraformShowJson([
      {
        address: "aws_s3_bucket.already_imported",
        change: { actions: ["update"] }
      }
    ])
  });

  assert.equal(summary.blocked, false);
});

test("evaluateDeploymentSafetyGate blocks unsafe or malformed actions only for import entries", () => {
  const unsafeImportChanges = [
    {
      address: "aws_s3_bucket.create_collision",
      change: { actions: ["create"], importing: { id: "create-collision" } }
    },
    {
      address: "aws_s3_bucket.destructive_delete",
      change: { actions: ["delete"], importing: { id: "destructive-delete" } }
    },
    {
      address: "aws_instance.replace_before_create",
      change: { actions: ["delete", "create"], importing: { id: "replace-before-create" } }
    },
    {
      address: "aws_instance.replace_after_create",
      change: { actions: ["create", "delete"], importing: { id: "replace-after-create" } }
    },
    {
      address: "aws_s3_bucket.malformed_importing",
      change: { actions: ["no-op"], importing: "malformed" }
    },
    {
      address: "aws_s3_bucket.malformed_actions",
      change: { actions: "no-op", importing: { id: "malformed-actions" } }
    }
  ];

  for (const resourceChange of unsafeImportChanges) {
    const summary = evaluateDeploymentSafetyGate({
      operation: "apply",
      planSummary: createPlanSummary({ importCount: 1 }),
      terraformShowJson: createTerraformShowJson([resourceChange])
    });

    assert.equal(summary.blocked, true, resourceChange.address);
  }

  const ordinaryDestructiveSummary = evaluateDeploymentSafetyGate({
    operation: "apply",
    planSummary: createPlanSummary({ createCount: 1, deleteCount: 1, replaceCount: 1 }),
    terraformShowJson: createTerraformShowJson([
      { address: "aws_s3_bucket.new", change: { actions: ["create"] } },
      { address: "aws_s3_bucket.old", change: { actions: ["delete"] } },
      { address: "aws_instance.replaced", change: { actions: ["delete", "create"] } }
    ])
  });

  assert.equal(ordinaryDestructiveSummary.blocked, false);
});

function createPlanSummary(
  overrides: Partial<DeploymentPlanSummary> = {}
): DeploymentPlanSummary {
  return {
    createCount: 0,
    updateCount: 0,
    deleteCount: 0,
    replaceCount: 0,
    blocked: false,
    warnings: [],
    ...overrides
  };
}

function createTerraformShowJson(resourceChanges: unknown[]): string {
  return JSON.stringify({ resource_changes: resourceChanges });
}

function createFinding(overrides: Partial<CheckFinding> = {}): CheckFinding {
  return {
    id: "security-open-ssh-sg-1",
    category: "security",
    severity: "high",
    resourceId: "resource-1",
    title: "Public SSH",
    description: "0.0.0.0/0",
    recommendation: "Restrict CIDR",
    ...overrides
  };
}

function createWarning(overrides: Partial<DeploymentPlanWarning> = {}): DeploymentPlanWarning {
  return {
    id: "pre_deployment_check:warning-1",
    level: "medium",
    category: "configuration",
    source: "pre_deployment_check",
    code: "UNKNOWN_TERRAFORM_ACTION",
    message: "Review warning",
    requiresAcknowledgement: true,
    blocksApproval: false,
    ...overrides
  };
}
