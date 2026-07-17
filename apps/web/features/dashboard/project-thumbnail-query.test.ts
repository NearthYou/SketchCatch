import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";

import { createProjectThumbnailQueryOptions } from "./project-thumbnail-query";

test("project thumbnail queries are isolated by user and project", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const thumbnail = new Blob(["thumbnail"], { type: "image/webp" });
  let loadCount = 0;
  const options = createProjectThumbnailQueryOptions(
    { projectId: "project-1", userId: "user-1" },
    {
      fetchThumbnail: async () => {
        loadCount += 1;
        return thumbnail;
      }
    }
  );

  const result = await queryClient.fetchQuery(options);

  assert.deepEqual(options.queryKey, ["user", "user-1", "projects", "project-1", "thumbnail"]);
  assert.equal(result.state, "ready");
  assert.equal(result.state === "ready" ? result.blob : null, thumbnail);
  assert.equal(loadCount, 1);
});
