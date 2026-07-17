import assert from "node:assert/strict";
import test from "node:test";
import {
  createProjectBuildCacheIdentity,
  projectBuildCacheRepositoryActions
} from "./project-build-cache.js";

test("project cache identity is deterministic and account scoped", () => {
  assert.deepEqual(
    createProjectBuildCacheIdentity({
      projectId: "5ac411f8-10cf-4092-8440-790836a6471b",
      accountId: "131404649047",
      region: "ap-northeast-2"
    }),
    {
      repositoryName: "sketchcatch-5ac411f8-build-cache",
      repositoryArn:
        "arn:aws:ecr:ap-northeast-2:131404649047:repository/sketchcatch-5ac411f8-build-cache",
      repositoryUri:
        "131404649047.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch-5ac411f8-build-cache",
      cacheTag: "buildcache-v1-linux-amd64",
      cacheReference:
        "131404649047.dkr.ecr.ap-northeast-2.amazonaws.com/sketchcatch-5ac411f8-build-cache:buildcache-v1-linux-amd64"
    }
  );
});

test("project cache actions contain only registry layer read and write operations", () => {
  assert.deepEqual(projectBuildCacheRepositoryActions, [
    "ecr:BatchCheckLayerAvailability",
    "ecr:GetDownloadUrlForLayer",
    "ecr:BatchGetImage",
    "ecr:InitiateLayerUpload",
    "ecr:UploadLayerPart",
    "ecr:CompleteLayerUpload",
    "ecr:PutImage"
  ]);
});
