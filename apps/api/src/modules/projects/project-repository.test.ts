import { test } from "node:test";
import assert from "node:assert/strict";
import { createProjectRepository } from "./project-repository.js";
import type { DatabaseClient } from "../../db/client.js";

const projectRow = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "workspace-1",
  userId: null,
  name: "Learning VPC",
  description: "VPC practice",
  createdAt: new Date("2026-06-24T01:00:00.000Z"),
  updatedAt: new Date("2026-06-24T02:00:00.000Z")
};

test("project repository lists projects through the owner seam", async () => {
  let whereCalled = false;
  let orderByCalled = false;
  const repository = createProjectRepository({
    db: {
      select: () => ({
        from: () => ({
          where: () => {
            whereCalled = true;
            return {
              orderBy: async () => {
                orderByCalled = true;
                return [projectRow];
              }
            };
          }
        })
      })
    }
  } as unknown as DatabaseClient);

  const projects = await repository.listProjects({ workspaceId: "workspace-1" });

  assert.equal(whereCalled, true);
  assert.equal(orderByCalled, true);
  assert.deepEqual(projects, [
    {
      ...projectRow,
      userId: undefined,
      createdAt: "2026-06-24T01:00:00.000Z",
      updatedAt: "2026-06-24T02:00:00.000Z"
    }
  ]);
});
