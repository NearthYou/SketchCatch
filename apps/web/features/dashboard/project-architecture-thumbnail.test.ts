import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const thumbnailSource = readFileSync(
  join(currentDir, "../../components/dashboard/project-architecture-thumbnail.tsx"),
  "utf8"
);
const projectCardSource = readFileSync(
  join(currentDir, "../../components/dashboard/api-project-card.tsx"),
  "utf8"
);
const dashboardStyles = readFileSync(
  join(currentDir, "../../components/dashboard/dashboard-content.css"),
  "utf8"
);

test("project architecture thumbnail renders area node border dash arrays", () => {
  assert.match(thumbnailSource, /borderDasharray: string \| undefined/);
  assert.match(thumbnailSource, /strokeDasharray=\{node\.borderDasharray\}/);
  assert.match(thumbnailSource, /getNodeDisplayBorderStyle/);
  assert.match(thumbnailSource, /getThumbnailNodeBorderDasharray/);
});

test("compact project cards render the saved architecture preview above card details", () => {
  assert.match(projectCardSource, /projectCard projectCardCompact projectCardLink/);
  assert.match(
    dashboardStyles,
    /\.projectCardCompact \.projectCardContentLink\s*\{[^}]*grid-template-columns:\s*1fr/s
  );
  assert.match(
    dashboardStyles,
    /\.projectPreview\s*\{[^}]*height:\s*150px[^}]*background-image:/s
  );
  assert.match(
    dashboardStyles,
    /\.projectArchitectureSvg\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/s
  );
});
