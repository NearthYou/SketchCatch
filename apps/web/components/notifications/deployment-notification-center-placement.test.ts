import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { getDeploymentNotificationCenterPlacement } from "./notification-center-placement";

const centerSource = readFileSync(
  fileURLToPath(new URL("./DeploymentNotificationCenter.tsx", import.meta.url)),
  "utf8"
);
const centerStyles = readFileSync(
  fileURLToPath(new URL("./deployment-notification-center.module.css", import.meta.url)),
  "utf8"
);
const projectBarSource = readFileSync(
  fileURLToPath(
    new URL("../../features/diagram-editor/WorkspaceProjectBar.tsx", import.meta.url)
  ),
  "utf8"
);
const rootLayoutSource = readFileSync(
  fileURLToPath(new URL("../../app/layout.tsx", import.meta.url)),
  "utf8"
);

test("only editor routes move deployment notifications into the Workspace project bar", () => {
  assert.equal(getDeploymentNotificationCenterPlacement("/workspace"), "workspace");
  assert.equal(getDeploymentNotificationCenterPlacement("/workspace/reverse"), "workspace");
  assert.equal(getDeploymentNotificationCenterPlacement("/dashboard"), "floating");
  assert.equal(getDeploymentNotificationCenterPlacement("/workspace/new"), "floating");
  assert.equal(getDeploymentNotificationCenterPlacement("/workspace/repository"), "floating");
  assert.equal(getDeploymentNotificationCenterPlacement("/workspace/ai"), "floating");
});

test("the root notification provider renders one shared surface in the route-specific location", () => {
  assert.match(
    rootLayoutSource,
    /<DeploymentNotificationCenter>\{children\}<\/DeploymentNotificationCenter>/
  );
  assert.equal(rootLayoutSource.match(/<DeploymentNotificationCenter>/g)?.length, 1);
  assert.match(centerSource, /import \{ usePathname \} from "next\/navigation";/);
  assert.match(
    centerSource,
    /import \{ getDeploymentNotificationCenterPlacement \} from "\.\/notification-center-placement";/
  );
  assert.match(centerSource, /createContext<NotificationCenterContextValue \| null>\(null\)/);
  assert.match(centerSource, /<NotificationCenterContext\.Provider value=\{contextValue\}>/);
  assert.match(
    centerSource,
    /getDeploymentNotificationCenterPlacement\(pathname\) === "floating" \? \(\s*<NotificationCenterSurface placement="floating" \/>/
  );
  assert.match(
    centerSource,
    /export function WorkspaceDeploymentNotificationCenterSlot\(\)[\s\S]*?getDeploymentNotificationCenterPlacement\(pathname\) !== "workspace"[\s\S]*?<NotificationCenterSurface placement="workspace" \/>/
  );
  assert.equal(centerSource.match(/function NotificationCenterSurface\(/g)?.length, 1);
  assert.equal(centerSource.match(/<NotificationCenterSurface placement=/g)?.length, 2);
});

test("the notification context remains mounted while authentication state changes", () => {
  assert.doesNotMatch(
    centerSource,
    /if \(status !== "authenticated"\) return <>\{children\}<\/>;/
  );
  assert.match(
    centerSource,
    /<NotificationCenterContext\.Provider value=\{contextValue\}>\s*\{children\}/
  );
  assert.match(
    centerSource,
    /status === "authenticated"[\s\S]*?getDeploymentNotificationCenterPlacement\(pathname\) === "floating"/
  );
});

test("the Workspace project bar places the notification slot after save and before deploy", () => {
  assert.match(
    projectBarSource,
    /import \{ WorkspaceDeploymentNotificationCenterSlot \} from "\.\.\/\.\.\/components\/notifications\/DeploymentNotificationCenter";/
  );

  const saveActionIndex = projectBarSource.indexOf('aria-label="지금 저장"');
  const notificationSlotIndex = projectBarSource.indexOf(
    "<WorkspaceDeploymentNotificationCenterSlot />"
  );
  const deployActionIndex = projectBarSource.indexOf("{actions.onSaveAndDeploy ? (");

  assert.notEqual(saveActionIndex, -1);
  assert.notEqual(notificationSlotIndex, -1);
  assert.notEqual(deployActionIndex, -1);
  assert.ok(saveActionIndex < notificationSlotIndex);
  assert.ok(notificationSlotIndex < deployActionIndex);

  const notificationSurfaceSource = centerSource.slice(
    centerSource.indexOf("function NotificationCenterSurface")
  );
  assert.doesNotMatch(notificationSurfaceSource, /<header(?:\s|>)/);
});

test("the notification surface keeps its floating default and docks its Workspace panel below the bar", () => {
  assert.match(centerStyles, /\.center\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?\}/);
  assert.match(
    centerStyles,
    /\.center\[data-placement="workspace"\]\s*\{[\s\S]*?position:\s*relative;[\s\S]*?\}/
  );
  assert.match(
    centerStyles,
    /\.center\[data-placement="workspace"\] \.panel\s*\{[\s\S]*?bottom:\s*auto;[\s\S]*?top:\s*44px;[\s\S]*?\}/
  );
});
