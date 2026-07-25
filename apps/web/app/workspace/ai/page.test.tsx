import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";

import WorkspaceAiPage from "./page";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("Repository analysis entry opens the AI design chat with its project name", async () => {
  const page = await WorkspaceAiPage({
    searchParams: Promise.resolve({
      entry: "repository_analysis",
      projectName: "Audience Live Check"
    })
  });

  assert.equal(page.props.existingProject, undefined);
  assert.equal(page.props.initialProjectName, "Audience Live Check");
});
