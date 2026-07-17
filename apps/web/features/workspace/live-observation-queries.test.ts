import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  createLiveObservationArchitectureQueryOptions,
  createLiveObservationOutputsQueryOptions,
  createLiveObservationReferenceQueryOptions
} from "./live-observation-queries";

test("Live Observation re-entry reuses fresh deployment reference data", async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  let deploymentLoadCount = 0;
  let releaseLoadCount = 0;
  const options = createLiveObservationReferenceQueryOptions(
    { projectId: "project-1", userId: "user-1" },
    {
      loadDeployments: async () => {
        deploymentLoadCount += 1;
        return [];
      },
      loadReleases: async () => {
        releaseLoadCount += 1;
        return [];
      }
    }
  );

  const first = await queryClient.fetchQuery(options);
  const second = await queryClient.fetchQuery(options);

  assert.strictEqual(second, first);
  assert.equal(deploymentLoadCount, 1);
  assert.equal(releaseLoadCount, 1);
});

test("Live Observation re-entry reuses Deployment outputs and immutable Architecture", async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  let outputLoadCount = 0;
  let architectureLoadCount = 0;
  const identity = {
    deploymentId: "deployment-1",
    userId: "user-1"
  };
  const outputOptions = createLiveObservationOutputsQueryOptions(identity, {
    loadOutputs: async () => {
      outputLoadCount += 1;
      return [];
    }
  });
  const architectureOptions = createLiveObservationArchitectureQueryOptions(identity, {
    loadArchitecture: async () => {
      architectureLoadCount += 1;
      return {
        architecture: { edges: [], nodes: [] },
        architectureId: "architecture-1",
        deploymentId: identity.deploymentId,
        terraformArtifactSha256: "a".repeat(64)
      };
    }
  });

  const firstOutputs = await queryClient.fetchQuery(outputOptions);
  const firstArchitecture = await queryClient.fetchQuery(architectureOptions);
  const secondOutputs = await queryClient.fetchQuery(outputOptions);
  const secondArchitecture = await queryClient.fetchQuery(architectureOptions);

  assert.strictEqual(secondOutputs, firstOutputs);
  assert.strictEqual(secondArchitecture, firstArchitecture);
  assert.equal(outputLoadCount, 1);
  assert.equal(architectureLoadCount, 1);
});
