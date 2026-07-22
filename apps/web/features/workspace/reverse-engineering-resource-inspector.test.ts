import assert from "node:assert/strict";
import test from "node:test";
import {
  getReverseEngineeringInspectorCoreValues,
  getReverseEngineeringInspectorPurpose
} from "./reverse-engineering-resource-inspector";

test("CloudWatch 알람은 사용자가 판단할 지표와 기준값만 보여준다", () => {
  assert.deepEqual(
    getReverseEngineeringInspectorCoreValues("CLOUDWATCH_METRIC_ALARM", {
      reverseEngineeringObservedConfig: {
        alarmName: "high-request-count",
        metricName: "RequestCountPerTarget",
        threshold: 50,
        evaluationPeriods: 2,
        providerParameters: { raw: "숨겨야 하는 원문" }
      }
    }),
    [
      { key: "alarmName", label: "알림 이름", value: "high-request-count" },
      { key: "metricName", label: "확인할 지표", value: "RequestCountPerTarget" },
      { key: "threshold", label: "알림 기준값", value: "50" },
      { key: "evaluationPeriods", label: "연속 확인 횟수", value: "2" }
    ]
  );
});

test("ECS 서비스는 현재 실행 수와 실행 방식을 짧게 보여준다", () => {
  assert.deepEqual(
    getReverseEngineeringInspectorCoreValues("ECS_SERVICE", {
      name: "audience-live-check-service",
      desiredCount: 2,
      launchType: "FARGATE",
      networkConfiguration: { hidden: true }
    }),
    [
      { key: "name", label: "서비스 이름", value: "audience-live-check-service" },
      { key: "desiredCount", label: "실행 중인 작업 수", value: "2" },
      { key: "launchType", label: "실행 방식", value: "Fargate" }
    ]
  );
});

test("보드에서만 확인하는 리소스도 이유를 이해하기 쉽게 설명한다", () => {
  assert.equal(
    getReverseEngineeringInspectorPurpose("IAM_ROLE", true),
    "AWS에서 찾았지만 현재 설정을 안전하게 Terraform으로 옮길 수 없는 리소스입니다. 보드에서 위치와 연결 관계를 확인할 수 있습니다."
  );
  assert.equal(
    getReverseEngineeringInspectorPurpose("CLOUDWATCH_LOG_GROUP", false),
    "애플리케이션과 AWS 서비스의 실행 로그를 보관합니다."
  );
});

test("배포 토폴로지는 사용자가 판단할 용량과 연결 정보만 보여준다", () => {
  assert.deepEqual(
    getReverseEngineeringInspectorCoreValues("APPLICATION_AUTO_SCALING_TARGET", {
      minCapacity: 1,
      maxCapacity: 2,
      resourceId: "service/cluster/service",
      internalMetadata: { hidden: true }
    }),
    [
      { key: "minCapacity", label: "최소 실행 수", value: "1" },
      { key: "maxCapacity", label: "최대 실행 수", value: "2" }
    ]
  );
  assert.deepEqual(
    getReverseEngineeringInspectorCoreValues("LOAD_BALANCER_TARGET_GROUP", {
      name: "audience-live-check-api",
      protocol: "HTTP",
      port: 8080,
      targetType: "ip"
    }),
    [
      { key: "name", label: "대상 그룹 이름", value: "audience-live-check-api" },
      { key: "protocol", label: "통신 방식", value: "HTTP" },
      { key: "port", label: "앱 포트", value: "8080" },
      { key: "targetType", label: "연결 대상", value: "IP 주소" }
    ]
  );
});
