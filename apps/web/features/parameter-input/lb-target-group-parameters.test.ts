import assert from "node:assert/strict";
import { test } from "node:test";

import { terraformParameterCatalog } from "./catalog";

test("Load Balancer Target Group parameters expose routing and health check settings", () => {
  const definitions = terraformParameterCatalog.resources.aws_lb_target_group ?? [];
  const definitionByName = new Map(definitions.map((definition) => [definition.name, definition]));

  assert.deepEqual(definitionByName.get("targetType")?.options, ["instance", "ip", "lambda", "alb"]);
  assert.equal(definitionByName.get("targetType")?.terraformName, "target_type");
  assert.equal(definitionByName.get("deregistrationDelay")?.inputKind, "number");
  assert.equal(definitionByName.get("deregistrationDelay")?.terraformName, "deregistration_delay");

  const healthCheck = definitionByName.get("healthCheck");
  assert.equal(healthCheck?.terraformName, "health_check");
  assert.equal(healthCheck?.inputKind, "nested-block");
  assert.equal(healthCheck?.required, false);
  assert.deepEqual(healthCheck?.children?.map((child) => child.name), [
    "enabled",
    "protocol",
    "port",
    "path",
    "matcher",
    "interval",
    "timeout",
    "healthyThreshold",
    "unhealthyThreshold"
  ]);

  const healthCheckChildren = new Map(
    healthCheck?.children?.map((definition) => [definition.name, definition]) ?? []
  );
  assert.equal(healthCheckChildren.get("healthyThreshold")?.terraformName, "healthy_threshold");
  assert.equal(healthCheckChildren.get("unhealthyThreshold")?.terraformName, "unhealthy_threshold");
  assert.equal(healthCheckChildren.get("port")?.placeholder, "traffic-port");
});
