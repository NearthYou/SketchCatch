import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldPersistViewportAfterMove } from "./viewport-persistence";

test("only a user viewport move in the editable board is persisted", () => {
  assert.equal(
    shouldPersistViewportAfterMove({
      automaticMoveRequestId: 0,
      isPreviewActive: false,
      isViewer: false
    }),
    true
  );
  assert.equal(
    shouldPersistViewportAfterMove({
      automaticMoveRequestId: 1,
      isPreviewActive: false,
      isViewer: false
    }),
    false
  );
  assert.equal(
    shouldPersistViewportAfterMove({
      automaticMoveRequestId: 0,
      isPreviewActive: true,
      isViewer: false
    }),
    false
  );
  assert.equal(
    shouldPersistViewportAfterMove({
      automaticMoveRequestId: 0,
      isPreviewActive: true,
      isViewer: true
    }),
    false
  );
});
