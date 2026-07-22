import assert from "node:assert/strict";
import test from "node:test";
import {
  incrementLiveObservationEcsMaxCapacity,
  LiveObservationTerraformUpdateError
} from "./live-observation-terraform-update";

test("increments the single ECS Application Auto Scaling max_capacity by one", () => {
  const result = incrementLiveObservationEcsMaxCapacity([
    {
      fileName: "main.tf",
      terraformCode: [
        'resource "aws_appautoscaling_target" "audience" {',
        "  min_capacity = 1",
        "  max_capacity = 2 # demo bottleneck",
        '  service_namespace = "ecs"',
        '  scalable_dimension = "ecs:service:DesiredCount"',
        '  resource_id = "service/${aws_ecs_cluster.audience.name}/${aws_ecs_service.audience.name}"',
        "}",
        "",
        'resource "aws_ecs_service" "audience" {',
        "  desired_count = 1",
        "}"
      ].join("\n")
    },
    {
      fileName: "outputs.tf",
      terraformCode: 'output "max_capacity" { value = 2 }'
    }
  ]);

  assert.equal(result.previousMaxCapacity, 2);
  assert.equal(result.nextMaxCapacity, 3);
  assert.equal(result.address, "aws_appautoscaling_target.audience");
  assert.equal(result.fileName, "main.tf");
  assert.equal(result.line, 3);
  assert.match(result.files[0]?.terraformCode ?? "", /max_capacity = 3 # demo bottleneck/);
  assert.equal(result.files[1]?.terraformCode, 'output "max_capacity" { value = 2 }');
});

test("requires exactly one aws_appautoscaling_target", () => {
  assert.throws(
    () =>
      incrementLiveObservationEcsMaxCapacity([
        {
          fileName: "main.tf",
          terraformCode: [
            'resource "aws_appautoscaling_target" "a" {',
            "  max_capacity = 2",
            "}",
            'resource "aws_appautoscaling_target" "b" {',
            "  max_capacity = 4",
            "}"
          ].join("\n")
        }
      ]),
    (error: unknown) =>
      error instanceof LiveObservationTerraformUpdateError && error.code === "target_count"
  );
});

test("requires max_capacity to be an integer literal", () => {
  assert.throws(
    () =>
      incrementLiveObservationEcsMaxCapacity([
        {
          fileName: "main.tf",
          terraformCode: [
            'resource "aws_appautoscaling_target" "audience" {',
            "  max_capacity = var.max_capacity",
            '  service_namespace = "ecs"',
            '  scalable_dimension = "ecs:service:DesiredCount"',
            '  resource_id = "service/demo/audience"',
            "}"
          ].join("\n")
        }
      ]),
    (error: unknown) =>
      error instanceof LiveObservationTerraformUpdateError &&
      error.code === "manual_review_required"
  );
});

test("refuses to modify a non-ECS Application Auto Scaling target", () => {
  assert.throws(
    () =>
      incrementLiveObservationEcsMaxCapacity([
        {
          fileName: "main.tf",
          terraformCode: [
            'resource "aws_appautoscaling_target" "table" {',
            "  min_capacity = 1",
            "  max_capacity = 2",
            '  service_namespace = "dynamodb"',
            '  scalable_dimension = "dynamodb:table:ReadCapacityUnits"',
            '  resource_id = "table/audience"',
            "}"
          ].join("\n")
        }
      ]),
    (error: unknown) =>
      error instanceof LiveObservationTerraformUpdateError &&
      error.code === "manual_review_required"
  );
});

test("requires the ECS service scalable dimension", () => {
  assert.throws(
    () =>
      incrementLiveObservationEcsMaxCapacity([
        {
          fileName: "main.tf",
          terraformCode: [
            'resource "aws_appautoscaling_target" "audience" {',
            "  max_capacity = 2",
            '  service_namespace = "ecs"',
            '  scalable_dimension = "ecs:service:Other"',
            '  resource_id = "service/demo/audience"',
            "}"
          ].join("\n")
        }
      ]),
    (error: unknown) =>
      error instanceof LiveObservationTerraformUpdateError &&
      error.code === "manual_review_required"
  );
});

test("requires an ECS service resource ID", () => {
  assert.throws(
    () =>
      incrementLiveObservationEcsMaxCapacity([
        {
          fileName: "main.tf",
          terraformCode: [
            'resource "aws_appautoscaling_target" "audience" {',
            "  max_capacity = 2",
            '  service_namespace = "ecs"',
            '  scalable_dimension = "ecs:service:DesiredCount"',
            '  resource_id = "table/audience"',
            "}"
          ].join("\n")
        }
      ]),
    (error: unknown) =>
      error instanceof LiveObservationTerraformUpdateError &&
      error.code === "manual_review_required"
  );
});

test("rejects ambiguous duplicate ECS identity assignments", () => {
  assert.throws(
    () =>
      incrementLiveObservationEcsMaxCapacity([
        {
          fileName: "main.tf",
          terraformCode: [
            'resource "aws_appautoscaling_target" "audience" {',
            "  max_capacity = 2",
            '  service_namespace = "ecs"',
            '  service_namespace = "dynamodb"',
            '  scalable_dimension = "ecs:service:DesiredCount"',
            '  resource_id = "service/demo/audience"',
            "}"
          ].join("\n")
        }
      ]),
    (error: unknown) =>
      error instanceof LiveObservationTerraformUpdateError &&
      error.code === "manual_review_required"
  );
});
