import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./LiveObservationFocusedFlow.tsx", import.meta.url)),
  "utf8"
);
const styles = readFileSync(
  fileURLToPath(new URL("./workspace.module.css", import.meta.url)),
  "utf8"
);

test("keeps idle connector motion separate from real request particles", () => {
  assert.match(
    styles,
    /\.liveObservationPresentationConnector::after[\s\S]*animation:\s*liveObservationConnectorFlow/
  );
  assert.match(
    source,
    /\{burst\s*\?[\s\S]*liveObservationPresentationSegmentParticle/
  );
  assert.match(source, /const visibleParticleCount = burst\?\.visibleParticleCount \?\? 0/);
});

test("focused flow sizes to content and animates task removal", () => {
  assert.match(
    source,
    /className=\{`\$\{styles\.liveObservationDiagramMap\} \$\{styles\.liveObservationFocusedFlow\}`\}/
  );
  assert.match(source, /data-transition=\{unit\.transition\}/);
  assert.match(styles, /\.liveObservationFocusedFlow\s*\{[\s\S]*height:\s*auto/);
  assert.match(styles, /data-transition="exiting"[\s\S]*liveObservationCapacityExit/);
});
