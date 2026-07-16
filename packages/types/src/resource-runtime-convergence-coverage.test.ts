import assert from "node:assert/strict";
import test from "node:test";
import { RUNTIME_ADAPTER_KINDS } from "./runtime-convergence.js";
import {
  resourceDefinitions,
  runtimeAdapterResourceCoverage
} from "./resource-definitions.js";

test("every runtime adapter is pinned to an explicit deployable ResourceDefinition", () => {
  const definitionsByTerraform = new Map(
    resourceDefinitions.map((definition) => [definition.terraform.resourceType, definition])
  );
  const coveredAdapters = new Set<string>();

  for (const coverage of runtimeAdapterResourceCoverage) {
    const definition = definitionsByTerraform.get(coverage.terraformResourceType);
    assert.ok(definition, coverage.terraformResourceType);
    assert.equal(definition.capabilities.deployment.status, "supported");
    assert.equal(
      definition.capabilities.deployment.optimization.runtimeNoOp,
      "provider_verified"
    );
    if (definition.capabilities.deployment.optimization.runtimeNoOp === "provider_verified") {
      assert.ok(
        definition.capabilities.deployment.optimization.runtimeAdapters.includes(
          coverage.adapterKind
        )
      );
    }
    coveredAdapters.add(coverage.adapterKind);
  }

  assert.deepEqual([...coveredAdapters].sort(), [...RUNTIME_ADAPTER_KINDS].sort());
});

test("all deployable ResourceDefinitions state whether runtime convergence applies", () => {
  for (const definition of resourceDefinitions) {
    if (definition.capabilities.deployment.status !== "supported") continue;
    const optimization = definition.capabilities.deployment.optimization;
    assert.ok(
      optimization.runtimeNoOp === "none" ||
      (optimization.runtimeNoOp === "provider_verified" &&
        optimization.runtimeAdapters.length > 0),
      definition.id
    );
  }
});
