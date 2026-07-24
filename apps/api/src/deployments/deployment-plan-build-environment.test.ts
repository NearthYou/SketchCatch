import assert from "node:assert/strict";
import test from "node:test";
import { prepareEcsBuildEnvironmentForPlan } from "./deployment-plan-build-environment.js";

test("Plan reuses an already verified project build environment without another checkout", async () => {
  let prepareCalls = 0;
  let verifyCalls = 0;
  let preparedAwsConnectionId: string | undefined;

  await prepareEcsBuildEnvironmentForPlan(
    {
      db: {} as never,
      deployment: {
        architectureId: "architecture-1",
        awsConnectionId: "connection-2",
        projectId: "project-1",
        scope: "application",
        targetKind: "ecs_fargate"
      } as never,
      userId: "user-1"
    },
    {
      prepareProjectBuildEnvironment: async (input: { awsConnectionId?: string }) => {
        preparedAwsConnectionId = input.awsConnectionId;
        prepareCalls += 1;
        return {
          buildEnvironment: {
            repositoryVerificationStatus: "verified",
            repositoryVerificationStatusReason: null
          }
        };
      },
      verifyProjectRepositoryAccess: async () => {
        verifyCalls += 1;
        return {
          buildEnvironment: {
            repositoryVerificationStatus: "verified",
            repositoryVerificationStatusReason: null
          }
        };
      }
    } as never
  );

  assert.equal(prepareCalls, 1);
  assert.equal(preparedAwsConnectionId, "connection-2");
  assert.equal(verifyCalls, 0);
});
